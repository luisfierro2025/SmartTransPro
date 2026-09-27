// ============================================================================
// Prueba de la capa de nube: ejecuta el esquema real de Supabase y las
// consultas reales de la aplicación sobre un PostgreSQL en memoria (pg-mem).
//
// No necesita servidor, ni Docker, ni base de datos creada en Supabase.
//   Uso: npm run test:nube
// ============================================================================
const fs = require('fs');
const path = require('path');

// --- PostgreSQL en memoria -------------------------------------------------
const { newDb } = require('pg-mem');
const memoria = newDb({ autoCreateForeignKeyIndices: true });
const adaptadorPg = memoria.adapters.createPg();

// Sustituye el módulo `pg` por el adaptador en memoria, de modo que la capa de
// datos de la nube se ejercita sin tocar la red.
require.cache[require.resolve('pg')] = {
  id: require.resolve('pg'),
  filename: require.resolve('pg'),
  loaded: true,
  exports: adaptadorPg
};

// pg-mem ignora el valor de la cadena: solo hace falta que exista.
process.env.DATABASE_URL = 'postgresql://postgres:postgres@localhost:5432/control_empresa_prueba';
process.env.DATABASE_SSL = 'false';

const base = require('../server/postgres-base');
const { traducir, ErrorTraduccion } = require('../server/traductor-sql');

let correctas = 0;
let fallidas = 0;
let omitidas = 0;

// pg-mem es un motor en memoria: no soporta todas las construcciones de
// PostgreSQL. Cuando eso ocurre se informa como OMITIDA (queda pendiente de
// verificar contra el Postgres real de Supabase) en vez de dar un falso OK.
async function intentar(descripcion, fn) {
  try {
    await fn();
  } catch (e) {
    const esLimite = /not supported/i.test(String(e.message));
    if (esLimite) {
      omitidas++;
      console.log(`  [OMITIDA] ${descripcion}`);
      console.log(`            pg-mem no soporta esta construcción: ${String(e.message).split('\n')[0]}`);
      console.log('            Pendiente de verificar contra el Postgres real de Supabase.');
      return;
    }
    fallidas++;
    console.log(`  [FALLO] ${descripcion}`);
    console.log(`          ${e.message}`);
  }
}

function verificar(descripcion, condicion, detalle) {
  if (condicion) {
    correctas++;
    console.log(`  [OK]    ${descripcion}`);
  } else {
    fallidas++;
    console.log(`  [FALLO] ${descripcion}`);
    if (detalle !== undefined) console.log(`          ${detalle}`);
  }
}

async function ejecutar() {
  console.log('\n=== Prueba de la capa de nube (PostgreSQL) ===\n');

  // --- 1) Traductor de SQL -------------------------------------------------
  console.log('1) Traducción SQLite -> PostgreSQL');
  const t1 = traducir('SELECT * FROM bitacora_viajes WHERE b.estado=@estado AND date(b.fecha)>=date(@desde)', { estado: 'EN CURSO', desde: '2026-01-01' });
  verificar('convierte los parámetros con nombre', t1.sql.includes('b.estado=$1') && t1.sql.includes('>=($2)') && t1.valores.join(',') === 'EN CURSO,2026-01-01', t1.sql);
  verificar('convierte date() a ::date', t1.sql.includes('(b.fecha)::date>=($2)::date'), t1.sql);
  verificar('convierte activo=1 a booleano', traducir('SELECT * FROM vehiculos WHERE activo=1', {}).sql.includes('activo = true'));
  const t2 = traducir("UPDATE planillas SET fecha_pago=COALESCE(fecha_pago, date('now')) WHERE id=?", [7]);
  verificar("date('now') se vuelve current_date", t2.sql.includes('current_date') && t2.sql.includes('=$1'), t2.sql);
  verificar('respeta literales con paréntesis', traducir("SELECT 'date(x)' AS a FROM t", {}).sql.includes("'date(x)'"));
  const t3 = traducir('SELECT * FROM x WHERE a=? AND b=?', [1, 2]);
  verificar('los posicionales se ordenan', t3.sql.includes('=$1') && t3.sql.includes('=$2') && t3.valores.join(',') === '1,2');
  letLanzo = false;
  try { traducir('SELECT sqlite_version()', {}); } catch (e) { letLanzo = e instanceof ErrorTraduccion; }
  verificar('el modo estricto rechaza sqlite_version()', letLanzo);
  letLanzo = false;
  try { traducir('INSERT OR IGNORE INTO configuracion (id) VALUES (1)', {}); } catch (e) { letLanzo = e instanceof ErrorTraduccion; }
  verificar('el modo estricto rechaza INSERT OR IGNORE', letLanzo);

  // --- 2) Esquema de Supabase ---------------------------------------------
  console.log('\n2) Esquema (supabase/migrations/*.sql)');
  // auth.users lo crea Supabase; en memoria hay que simularlo.
  memoria.public.none('create schema if not exists auth; create table if not exists auth.users (id uuid primary key, email text);');
  // Se aplican TODAS las migraciones en orden, no solo la inicial: así una
  // migración nueva (por ejemplo comisiones) también queda cubierta.
  const carpetaMigraciones = path.join(__dirname, '..', 'supabase', 'migrations');
  const migraciones = fs.readdirSync(carpetaMigraciones).filter((archivo) => archivo.endsWith('.sql')).sort();
  try {
    for (const archivo of migraciones) {
      // pgcrypto y el tipo uuid los resuelve el propio Supabase.
      const sqlMigracion = fs.readFileSync(path.join(carpetaMigraciones, archivo), 'utf8').replace(/create extension[^;]+;/gi, '');
      memoria.public.none(sqlMigracion);
    }
    verificar(`el esquema se crea completo (${migraciones.length} migraciones)`, true);
  } catch (e) {
    verificar('el esquema se crea completo sin errores', false, e.message);
    return false;
  }

  // Un alias corto para ejecutar SQL directo (sin traducción), como hace
  // database.js con los inserts de datos de ejemplo.
  const ejecutarSQL = async (consulta, p) => {
    const r = await base.obtenerPool().query(consulta, p);
    return r.rows;
  };

  const tablas = await ejecutarSQL(
    "SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name"
  );
  const esperadas = ['bitacora_viajes','clientes','combustible','configuracion','conductores','egresos','empleados','ingresos','movimientos_auditoria','perfiles','planilla_detalle','planillas','vehiculos','viaticos','comisiones'];
  const faltantes = esperadas.filter((t) => !tablas.some((x) => x.table_name === t));
  verificar('se crean las 15 tablas del sistema', faltantes.length === 0, `faltan: ${faltantes.join(', ')}`);

  // --- 3) Consultas reales de la aplicación --------------------------------
  console.log('\n3) Consultas reales de la aplicación');

  const consultar = async (consulta, p) => (await base.obtenerDB().prepare(consulta).all(p));
  const uno = async (consulta, p) => (await consultar(consulta, p))[0];

  await ejecutarSQL(
    `INSERT INTO clientes (nombre, identificacion) VALUES ('Distribuidora del Norte S.A.','J0310000456123')`
  );
  await ejecutarSQL(`INSERT INTO vehiculos (codigo, placa, marca, modelo) VALUES ('V-01','M 234-890','Freightliner','Cascadia')`);
  await ejecutarSQL(`INSERT INTO conductores (nombre, documento) VALUES ('Carlos Mendoza','001-120584-0023K')`);

  // Inserción con nombres de tabla dinámicos, como hace la aplicación.
  const resVehiculo = await ejecutarSQL('INSERT INTO vehiculos (codigo, placa) VALUES ($1,$2) RETURNING id', ['V-02', 'M 189-567']);
  verificar('el id autogenerado es BIGINT identity', typeof resVehiculo[0].id === 'number', JSON.stringify(resVehiculo[0]));

  // Registro de viaje: idéntico al INSERT de ipc.js "bitacora:guardar".
  const r = await uno(
    `INSERT INTO bitacora_viajes (fecha, vehiculo_id, conductor_id, cliente_id, origen, destino,
      km_salida, km_llegada, hora_salida, hora_llegada, carga_descripcion, cliente, estado, observaciones)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING *`,
    ['2026-09-20', 1, 1, 1, 'Managua', 'Chinandega', 45000, 45210, '07:30', '12:40',
      'Carga seca 12 toneladas', 'Distribuidora del Norte S.A.', 'COMPLETADO', null]
  );
  verificar('registra un viaje completo', r.origen === 'Managua' && r.destino === 'Chinandega');
  verificar('la columna GENERATED calcula km_recorridos', Number(r.km_recorridos) === 210, `km_recorridos=${r.km_recorridos}`);

  // Viaje en curso: km_llegada 0 debe dar 0 km, igual que en SQLite.
  await uno(
    `INSERT INTO bitacora_viajes (fecha, vehiculo_id, conductor_id, cliente_id, origen, destino,
      km_salida, km_llegada, carga_descripcion, cliente, estado)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING km_recorridos`,
    ['2026-09-25', 1, 1, 1, 'Managua', 'Estelí', 45700, 0, 'Granos básicos', 'Distribuidora del Norte S.A.', 'EN CURSO']
  );
  const enCurso = await uno(`SELECT km_recorridos FROM bitacora_viajes WHERE destino = ?`, ['Estelí']);
  verificar('un viaje en curso marca 0 km recorridos', Number(enCurso.km_recorridos) === 0);

  // Listado con filtros: es el SQL real de ipc.js "bitacora:listar".
  const sqlListar = `SELECT b.*, v.placa as vehiculo_placa, v.marca as vehiculo_marca, v.modelo as vehiculo_modelo,
           c.nombre as conductor_nombre, cl.nombre as cliente_nombre_rel
    FROM bitacora_viajes b
    LEFT JOIN vehiculos v ON v.id=b.vehiculo_id
    LEFT JOIN conductores c ON c.id=b.conductor_id
    LEFT JOIN clientes cl ON cl.id=b.cliente_id
    WHERE 1=1 AND date(b.fecha)>=date(@desde) AND b.estado=@estado
    ORDER BY date(b.fecha) DESC, b.id DESC`;
  await intentar('el listado filtra por fecha y estado', async () => {
    const listado = await consultar(sqlListar, { desde: '2026-01-01', estado: 'COMPLETADO' });
    verificar('el listado filtra por fecha y estado', listado.length === 1 && listado[0].destino === 'Chinandega', JSON.stringify(listado.map((x) => x.destino)));
  });


  // Búsqueda libre: el LIKE con comodines.
  await intentar('la búsqueda por texto con LIKE', async () => {
    const busqueda = await consultar(
      `SELECT b.* FROM bitacora_viajes b LEFT JOIN clientes cl ON cl.id=b.cliente_id
       WHERE 1=1 AND (b.origen LIKE @q OR b.destino LIKE @q OR b.cliente LIKE @q OR cl.nombre LIKE @q)`,
      { q: '%Chinandega%' }
    );
    verificar('la búsqueda por texto con LIKE funciona', busqueda.length === 1);
  });


  // Resumen del dashboard: es el SQL real de ipc.js "dashboard:resumen" /
  // "bitacora:resumen" (una consulta por indicador).
  const enCursoTotal = await uno(`SELECT count(*) as total FROM bitacora_viajes WHERE estado='EN CURSO'`);
  const completadosTotal = await uno(`SELECT count(*) as total FROM bitacora_viajes WHERE estado='COMPLETADO'`);
  const kmTotal = await uno(`SELECT COALESCE(SUM(km_recorridos),0) as total FROM bitacora_viajes`);
  verificar(
    'el dashboard cuenta viajes y kilómetros',
    Number(enCursoTotal.total) === 1 && Number(completadosTotal.total) === 1 && Number(kmTotal.total) === 210,
    JSON.stringify({ enCursoTotal, completadosTotal, kmTotal })
  );

  // La fecha debe viajar como texto 'AAAA-MM-DD', no como objeto Date.
  const fechaTexto = await uno(`SELECT fecha FROM bitacora_viajes WHERE destino = ?`, ['Estelí']);
  verificar(
    'la fecha se devuelve como texto ISO (no como objeto Date)',
    typeof fechaTexto.fecha === 'string' && /^\d{4}-\d{2}-\d{2}/.test(String(fechaTexto.fecha)),
    `tipo=${typeof fechaTexto.fecha} valor=${fechaTexto.fecha}`
  );


  // Filtro booleano: activo=1 debe traducirse a true.
  const activos = await consultar('SELECT * FROM vehiculos WHERE activo=1');
  verificar('el filtro activo=1 encuentra los vehículos', activos.length === 2, `encontró ${activos.length}`);

  // Montos: NUMERIC evita el error de punto flotante de SQLite.
  await ejecutarSQL(`INSERT INTO ingresos (fecha, concepto, monto) VALUES ($1,$2,$3)`, ['2026-09-25', 'Flete', 0.1]);
  await ejecutarSQL(`INSERT INTO ingresos (fecha, concepto, monto) VALUES ($1,$2,$3)`, ['2026-09-25', 'Flete 2', 0.2]);
  const suma = await uno(`SELECT COALESCE(SUM(monto),0) AS total FROM ingresos`);
  verificar('los montos llegan como número (no como texto)', typeof suma.total === 'number', `tipo=${typeof suma.total}`);
  verificar('los montos suman 0.30 sin residuo de flotante', Math.abs(suma.total - 0.3) < 1e-9, `total=${suma.total}`);

  // Actualización con parámetros posicionales (pasa por el traductor).
  await uno(`UPDATE bitacora_viajes SET estado=?, observaciones=? WHERE id=? RETURNING id`, ['CANCELADO', 'Retenido en posta', 1]);
  const cancelado = await uno(`SELECT estado, observaciones FROM bitacora_viajes WHERE id=?`, [1]);
  verificar('actualiza un viaje existente', cancelado.estado === 'CANCELADO' && cancelado.observaciones === 'Retenido en posta');

  await uno(
    `INSERT INTO movimientos_auditoria (modulo, accion, referencia_id, descripcion) VALUES (?, ?, ?, ?) RETURNING id`,
    ['bitacora', 'ELIMINAR', 1, 'Prueba automatizada']
  );
  const aud = await uno('SELECT COUNT(*)::int AS total FROM movimientos_auditoria');
  verificar('registra el movimiento de auditoría', Number(aud.total) === 1);


  console.log(`\nResultado: ${correctas} comprobaciones correctas, ${fallidas} fallidas, ${omitidas} omitidas por límites de pg-mem.`);
  return fallidas === 0;

}

module.exports = { ejecutar };
if (require.main === module) {
  ejecutar()
    .then((ok) => process.exit(ok ? 0 : 1))
    .catch((e) => { console.error('\nFallo inesperado:', e); process.exit(1); });
}

