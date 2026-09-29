// ============================================================================
// Capa de datos para PostgreSQL (Supabase).
//
// Expone EXACTAMENTE la misma interfaz que src/main/database.js (SQLite), de
// forma que la lógica de negocio de la aplicación no cambie: solo cambia quién
// implementa obtenerDB().
//
//   obtenerDB()            -> base con .prepare(sql) -> { all, get, run }
//   obtenerRutaBaseDatos()  -> texto descriptivo del servidor
//   estadisticas()         -> información de la base (para la pantalla Configuración)
//   registrarAuditoria()   -> inserta en movimientos_auditoria
//   cargarDatosEjemplo()   -> datos de demostración
//   limpiarDatos()         -> borrado operativo o total
//   respaldarBaseDatos()   -> información del respaldo gestionado
// ============================================================================
const { Pool, types } = require('pg');
const { traducir } = require('./traductor-sql');

// --------------------------------------------------------------------------
// Tipos devueltos por node-postgres vs. lo que espera la interfaz
//
// Por defecto node-postgres devuelve:
//   - date / timestamp  ->  objeto Date   (la interfaz imprimiría "Sat Sep 25 2026")
//   - numeric / bigint  ->  texto         (rompería las comparaciones y sumas)
//
// SQLite devolvía texto ISO ('2026-09-25') y números. Se fuerza el mismo
// comportamiento para que la interfaz no necesite cambios de una línea.
// --------------------------------------------------------------------------
if (types && typeof types.setTypeParser === 'function') {
  types.setTypeParser(20, (v) => (v === null ? null : parseInt(v, 10)));  // int8
  types.setTypeParser(1700, (v) => (v === null ? null : parseFloat(v))); // numeric
  types.setTypeParser(1082, (v) => v);                                   // date  -> 'AAAA-MM-DD'
  types.setTypeParser(1083, (v) => v);                                   // time  -> 'HH:MM:SS'
  types.setTypeParser(1114, (v) => v);                                   // timestamp
  types.setTypeParser(1184, (v) => v);                                   // timestamptz
}


// Versión del esquema que espera este código:
//   1 -> supabase/migrations/0001_esquema_inicial.sql
//   2 -> supabase/migrations/0002_viaticos_conductor.sql (viaticos.conductor_id / viaje_id)
//   3 -> supabase/migrations/0003_comisiones.sql (tabla comisiones)
//   4 -> supabase/migrations/0004_conductores_documentos.sql (licencia y fotos del conductor)
//   5 -> supabase/migrations/0005_usuarios_sesiones.sql (tablas usuarios y sesiones)
//   6 -> supabase/migrations/0006_viaticos_viaje_unico.sql (un viático por viaje)
//   7 -> supabase/migrations/0007_monitoreo_gps.sql (dispositivos_gps y posiciones_gps)
const VERSION_ESQUEMA = 7;
let pool = null;
let clienteEnTransaccion = null;

function obtenerPool() {
  if (pool) return pool;
  const connectionString = process.env.DATABASE_URL;

try {
  const u = new URL(connectionString);
  console.log('[postgres] Host:', u.hostname);
  console.log('[postgres] Puerto:', u.port);
  console.log('[postgres] Base:', u.pathname);
} catch (e) {
  console.error('[postgres] DATABASE_URL no es una URL válida:', e.message);
}

  if (!connectionString) {
    throw new Error('Falta la variable de entorno DATABASE_URL (cadena de conexión de Supabase).');
  }
  pool = new Pool({
    connectionString,
    ssl: process.env.DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false },
    max: Number(process.env.DATABASE_POOL_MAX) || 5,
    idleTimeoutMillis: 30000
  });
  pool.on('error', (e) => console.error('[postgres] error del pool:', e.message));
  return pool;
}

function cerrarBaseDatos() {
  if (pool) {
    const p = pool;
    pool = null;
    return p.end();
  }
  return Promise.resolve();
}

// --------------------------------------------------------------------------
// Envoltura compatible con better-sqlite3
// --------------------------------------------------------------------------

// --------------------------------------------------------------------------
// Normalización de fechas
//
// Algunos drivers (incluido pg-mem en las pruebas) devuelven date/time como
// objetos Date. La interfaz imprime v.fecha directamente, así que un Date
// object se mostraría como "Thu Sep 24 2026 18:00:00 GMT-0600".
// Se usa el OID que informa el driver para devolver exactamente el mismo
// texto que devolvía SQLite.
// --------------------------------------------------------------------------
const OID = { INT8: 20, NUMERIC: 1700, DATE: 1082, TIME: 1083, TIMESTAMP: 1114, TIMESTAMPTZ: 1184 };

function dosDigitos(n) {
  return String(n).padStart(2, '0');
}

function formatearFecha(valor, oid) {
  const fecha = `${valor.getFullYear()}-${dosDigitos(valor.getMonth() + 1)}-${dosDigitos(valor.getDate())}`;
  const hora = `${dosDigitos(valor.getHours())}:${dosDigitos(valor.getMinutes())}`;
  if (oid === OID.DATE) return fecha;
  if (oid === OID.TIME) return hora;
  if (oid === OID.TIMESTAMP) return `${fecha} ${hora}:${dosDigitos(valor.getSeconds())}`;
  if (oid === OID.TIMESTAMPTZ) return valor.toISOString();
  // El driver no informou el tipo: se deduce por la forma del valor.
  //   1970-01-01 + hora  -> columna TIME
  //   medianoche         -> columna DATE
  const esHora = valor.getUTCFullYear() === 1970 && valor.getUTCMonth() === 0 && valor.getUTCDate() === 1;
  if (esHora) return `${dosDigitos(valor.getUTCHours())}:${dosDigitos(valor.getUTCMinutes())}`;
  const esMedianoche = valor.getHours() === 0 && valor.getMinutes() === 0 && valor.getSeconds() === 0;
  if (esMedianoche) return fecha;
  const esMedianocheUtc = valor.getUTCHours() === 0 && valor.getUTCMinutes() === 0 && valor.getUTCSeconds() === 0;
  if (esMedianocheUtc) {
    return `${valor.getUTCFullYear()}-${dosDigitos(valor.getUTCMonth() + 1)}-${dosDigitos(valor.getUTCDate())}`;
  }
  return valor.toISOString();
}

// Asocia cada columna del resultado con su OID declarado por PostgreSQL.
function tiposPorColumna(resultado) {
  const mapa = {};
  if (!resultado || !Array.isArray(resultado.fields)) return mapa;
  const columnas = resultado.rows && resultado.rows.length ? Object.keys(resultado.rows[0]) : [];
  resultado.fields.forEach((campo, indice) => {
    const nombre = campo.name || columnas[indice];
    if (nombre) mapa[nombre] = campo.dataTypeID;
  });
  return mapa;
}

function normalizarFilas(resultado) {
  if (!resultado || !Array.isArray(resultado.rows)) return resultado ? resultado.rows : [];
  const tipos = tiposPorColumna(resultado);
  return resultado.rows.map((fila) => {
    if (!fila || typeof fila !== 'object' || Array.isArray(fila)) return fila;
    const salida = {};
    for (const clave of Object.keys(fila)) {
      const valor = fila[clave];
      if (valor instanceof Date) {
        salida[clave] = formatearFecha(valor, tipos[clave]);
      } else if (typeof valor === 'string' && /^\d{2}:\d{2}:\d{2}$/.test(valor)) {
        // Los <input type="time"> de la interfaz esperan HH:MM, no HH:MM:SS.
        salida[clave] = valor.slice(0, 5);
      } else {
        salida[clave] = valor;
      }
    }
    return salida;
  });
}

// Tablas cuya clave primaria no se llama "id". Un INSERT en ellas no puede
// llevar "RETURNING id" (PostgreSQL respondería "column \"id\" does not exist").
// Antes de este módulo, "sesiones" (cuya clave es token_hash) rompía la nube.
const SIN_COLUMNA_ID = new Set(['sesiones']);

function ejecutarConsulta(consulta, parametros, metodo) {
  const { sql, valores } = traducir(consulta, parametros);
  const base = clienteEnTransaccion || obtenerPool();
  if (metodo === 'run') {
    // better-sqlite3 devuelve res.lastInsertRowid. En PostgreSQL no existe, así
    // que a los INSERT se les agrega RETURNING id para obtener lo mismo y que
    // la aplicación no tenga que enterarse del motor que usa.
    const esInsert = /^\s*insert\s+into\s+"?([a-zA-Z_][a-zA-Z0-9_]*)"?/i.exec(sql);
    const tabla = esInsert ? esInsert[1].toLowerCase() : null;
    const yaDevuelve = /\breturning\b/i.test(sql);
    const puedeDevolver = tabla && !SIN_COLUMNA_ID.has(tabla);
    const consultaFinal = esInsert && puedeDevolver && !yaDevuelve ? `${sql} RETURNING id` : sql;
    return base.query(consultaFinal, valores).then((r) => {
      const fila = r.rows && r.rows[0];
      return {
        changes: r.rowCount || 0,
        lastInsertRowid: fila && fila.id !== undefined ? fila.id : undefined
      };
    });
  }
  return base.query(sql, valores).then((r) => {
    const filas = normalizarFilas(r);
    return metodo === 'get' ? filas[0] : filas;
  });
}


// better-sqlite3 acepta run('a','b',c) y tambien all({@nombre:1}).
// Esta capa reproduce ambas formas para que el código existente no cambie.
function normalizarParametros(args) {
  if (!args.length) return null;
  if (args.length === 1) {
    const unico = args[0];
    const esColeccion = Array.isArray(unico) ||
      (unico !== null && typeof unico === 'object' && !(unico instanceof Date));
    if (esColeccion) return unico;
  }
  return args;
}

function crearBase() {
  return {
    prepare(consulta) {
      return {
        all: (...args) => ejecutarConsulta(consulta, normalizarParametros(args), 'all'),
        get: (...args) => ejecutarConsulta(consulta, normalizarParametros(args), 'get'),
        run: (...args) => ejecutarConsulta(consulta, normalizarParametros(args), 'run')
      };
    },
    exec: (sql) => {
      // db.exec() en SQLite admite varias sentencias; aquí se ejecutan en orden.
      const sentencias = sql.split(';').map((s) => s.trim()).filter(Boolean);
      return sentencias.reduce(
        (promesa, s) => promesa.then(() => ejecutarConsulta(s, null, 'run')),
        Promise.resolve()
      );
    },
    // En better-sqlite3, db.transaction(fn) devuelve una FUNCION que se ejecuta
    // con (). Con PostgreSQL hay que devolver esa misma funcion, no la promesa:
    // por eso se envuelve en () =>.
    transaction: (fn) => () => transaction(fn)
  };
}

function obtenerDB() {
  return crearBase();
}

// Las transacciones usan un cliente dedicado; obtenerDB() dentro de la
// transacción devuelve ese mismo cliente, igual que en la versión de escritorio.
function transaction(fn) {
  return obtenerPool().connect().then((cliente) => {
    clienteEnTransaccion = cliente;
    return cliente.query('BEGIN')
      .then(() => Promise.resolve(fn()))
      .then((resultado) => cliente.query('COMMIT').then(() => resultado))
      .catch((error) => cliente.query('ROLLBACK').then(() => { throw error; }))
      .finally(() => {
        clienteEnTransaccion = null;
        cliente.release();
      });
  });
}

function contar(tabla) {
  return obtenerPool()
    .query(`SELECT COUNT(*)::int AS total FROM ${tabla}`)
    .then((r) => r.rows[0].total);
}

// --------------------------------------------------------------------------
// Aseguramiento del esquema
//
// Las migraciones se aplican con `npm run db:migraciones`. Si una base de la
// nube quedó creada con un script anterior, el código fallaba con errores del
// tipo `column "conductor_id" of relation "viaticos" does not exist` y ni la
// lista ni el guardado de viáticos funcionaban. Aquí se verifican (y agregan)
// esas columnas una sola vez por proceso, de forma idempotente, dejando
// constancia en el log de lo que hubo que corregir.
// --------------------------------------------------------------------------
const COLUMNAS_AGREGADAS = [
  ['viaticos', 'conductor_id', 'bigint references conductores(id)'],
  ['viaticos', 'viaje_id', 'bigint references bitacora_viajes(id)'],
  // Ficha de documentos del conductor (migración 0004). Sin estas cuatro
  // columnas, "Guardar Conductor" fallaba con el error de PostgreSQL
  // 42703: column "numero_licencia" of relation "conductores" does not exist.
  ['conductores', 'numero_licencia', 'text'],
  ['conductores', 'licencia_frontal', 'text'],
  ['conductores', 'licencia_trasera', 'text'],
  ['conductores', 'carnet_federacion', 'text'],
  // Logotipo de la empresa. Sin esta columna, "Guardar configuración" falla con
  // 42703: column "logo_empresa" of relation "configuracion" does not exist.
  ['configuracion', 'logo_empresa', "text not null default ''"]
];

// Tablas completas que aportan las migraciones. Si la base de la nube quedó
// creada antes de la migración (por ejemplo la tabla "comisiones"), se crea al
// arrancar: la pestaña Comisiones funciona sin correr `npm run db:migraciones`.
const TABLAS_AGREGADAS = [
  {
    tabla: 'comisiones',
    definicion: `create table if not exists comisiones (
      id            bigint generated always as identity primary key,
      conductor_id  bigint references conductores(id),
      viaje_id      bigint references bitacora_viajes(id),
      fecha         date not null,
      periodo       text,
      concepto      text,
      tipo          text not null default 'PORCENTAJE',
      base_calculo  numeric(12,2) not null default 0,
      valor_calculo numeric(12,4) not null default 0,
      monto         numeric(12,2) not null default 0,
      estado        text not null default 'PENDIENTE',
      fecha_pago    date,
      metodo        text,
      referencia    text,
      observacion   text,
      created_at    timestamptz not null default now()
    )`,
    indices: [
      'create index if not exists idx_comisiones_fecha     on comisiones(fecha)',
      'create index if not exists idx_comisiones_conductor on comisiones(conductor_id)',
      'create index if not exists idx_comisiones_viaje     on comisiones(viaje_id)',
      'create index if not exists idx_comisiones_periodo   on comisiones(periodo)'
    ]
  },
  // Usuarios y sesiones (migración 0005). Sin estas tablas el login no tenía
  // contra qué validar: por eso se crean al arrancar y no solo con la
  // migración, igual que "comisiones".
  {
    tabla: 'usuarios',
    definicion: `create table if not exists usuarios (
      id                 bigint generated always as identity primary key,
      usuario            text not null unique,
      nombre             text not null,
      email              text,
      rol                text not null default 'OPERADOR' check (rol in ('ADMIN','OPERADOR','CONSULTA')),
      clave_hash         text not null,
      clave_salt         text not null,
      debe_cambiar_clave boolean not null default true,
      activo             boolean not null default true,
      ultimo_acceso      timestamptz,
      creado_en          timestamptz not null default now()
    )`,
    indices: [
      'create index if not exists idx_usuarios_rol     on usuarios(rol)',
      'create index if not exists idx_usuarios_activo  on usuarios(activo)'
    ]
  },
  {
    tabla: 'sesiones',
    definicion: `create table if not exists sesiones (
      token_hash   text primary key,
      usuario_id   bigint not null references usuarios(id) on delete cascade,
      creado_en    timestamptz not null default now(),
      expira_en_ms bigint not null
    )`,
    indices: [
      'create index if not exists idx_sesiones_usuario     on sesiones(usuario_id)',
      'create index if not exists idx_sesiones_vencimiento on sesiones(expira_en_ms)'
    ]
  },
  // Monitoreo por GPS de teléfonos (migración 0007).
  {
    tabla: 'dispositivos_gps',
    definicion: `create table if not exists dispositivos_gps (
      id             bigint generated always as identity primary key,
      conductor_id   bigint not null unique references conductores(id) on delete cascade,
      vehiculo_id    bigint references vehiculos(id) on delete set null,
      token_hash     text not null unique,
      activo         boolean not null default true,
      lat            numeric(10,6),
      lng            numeric(10,6),
      precision_m    numeric(10,2),
      velocidad_kmh  numeric(8,2),
      rumbo          numeric(6,2),
      bateria        numeric(5,1),
      ultimo_reporte timestamptz,
      created_at     timestamptz not null default now()
    )`,
    indices: []
  },
  {
    tabla: 'posiciones_gps',
    definicion: `create table if not exists posiciones_gps (
      id            bigint generated always as identity primary key,
      dispositivo_id bigint not null references dispositivos_gps(id) on delete cascade,
      lat           numeric(10,6) not null,
      lng           numeric(10,6) not null,
      precision_m   numeric(10,2),
      velocidad_kmh numeric(8,2),
      registrado_en timestamptz not null
    )`,
    indices: ['create index if not exists idx_posiciones_disp_fecha on posiciones_gps(dispositivo_id, registrado_en)']
  }
];

const INDICES_AGREGADOS = [
  'create index if not exists idx_viaticos_conductor on viaticos(conductor_id)',
  'create index if not exists idx_viaticos_viaje on viaticos(viaje_id)',
  // Un viaje no se puede cobrar con dos viáticos (índice parcial: los viáticos
  // sin viaje no colisionan entre sí). Se crea aparte porque, si la base ya
  // tuviera duplicados, falla y no debe tumbar el arranque de la aplicación.
  'create unique index if not exists idx_viaticos_viaje_unico on viaticos(viaje_id) where viaje_id is not null'
];

// Índices que pueden fallar sin que la aplicación deje de funcionar. Si el
// índice único de viáticos no se crea (porque ya hay duplicados de antes), se
// avisa por consola y se sigue: la validación de guardarViatico ya impide
// cobrar dos veces el mismo viaje.
const INDICES_TOLERANTES = new Set(['idx_viaticos_viaje_unico']);

let esquemaAsegurado = null;

function asegurarEsquema() {
  // El resultado se comparte: la verificación corre una sola vez por proceso.
  if (!esquemaAsegurado) {
    esquemaAsegurado = (async () => {
      const pool = obtenerPool();
      for (const { tabla, definicion, indices } of TABLAS_AGREGADAS) {
        const existe = await pool.query(
          `select 1 from information_schema.tables
            where table_schema = current_schema() and table_name = $1`,
          [tabla]
        );
        if (!existe.rowCount) {
          // La definición es fija (no viene del usuario): se interpola a propósito.
          await pool.query(definicion);
          console.log(`[postgres] esquema corregido: se creó la tabla ${tabla}`);
        }
        for (const sql of indices) await pool.query(sql);
      }
      for (const [tabla, columna, definicion] of COLUMNAS_AGREGADAS) {
        const existe = await pool.query(
          `select 1 from information_schema.columns
            where table_schema = current_schema()
              and table_name = $1 and column_name = $2`,
          [tabla, columna]
        );
        if (existe.rowCount) continue;
        // La definición es fija (no viene del usuario): se interpola a propósito.
        await pool.query(`alter table ${tabla} add column if not exists ${columna} ${definicion}`);
        console.log(`[postgres] esquema corregido: se agregó ${tabla}.${columna}`);
      }
      for (const sql of INDICES_AGREGADOS) {
        try {
          await pool.query(sql);
        } catch (error) {
          const indice = (sql.match(/exists (\w+)/) || [])[1];
          if (!INDICES_TOLERANTES.has(indice)) throw error;
          console.warn(
            `[postgres] no se creó el índice ${indice}: la base ya tiene viáticos duplicados por viaje. ` +
            'La aplicación sigue funcionando y solo impide cobros duplicados nuevos.'
          );
        }
      }
      return true;
    })().catch((error) => {
      esquemaAsegurado = null; // permite reintentar en la próxima llamada
      throw error;
    });
  }
  return esquemaAsegurado;
}

module.exports = {
  obtenerPool,
  obtenerDB,
  cerrarBaseDatos,
  transaction,
  contar,
  traducir,
  asegurarEsquema,
  VERSION_ESQUEMA
};
