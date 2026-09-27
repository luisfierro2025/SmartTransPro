// Capa de acceso a datos (SQLite / better-sqlite3).
// - Crea el archivo de base de datos y todo el esquema si no existe.
// - Aplica migraciones sobre bases de datos creadas con versiones anteriores.
// - NO inserta datos de prueba de forma automática: los datos de ejemplo solo se
//   cargan cuando el usuario lo solicita (Configuración -> Base de datos).
const Database = require('better-sqlite3');
const electron = require('electron');
const path = require('path');
const fs = require('fs');

let db = null;

const NOMBRE_ARCHIVO = 'control-empresa.db';
const VERSION_ESQUEMA = 6;

// Permite mover la base de datos a otra ubicación (respaldos, red o pruebas).
function obtenerRutaBaseDatos() {
  const personalizada = (process.env.CONTROL_EMPRESA_DB || '').trim();
  if (personalizada) {
    const archivo = path.resolve(personalizada);
    fs.mkdirSync(path.dirname(archivo), { recursive: true });
    return archivo;
  }
  const carpeta = electron.app ? electron.app.getPath('userData') : path.join(process.cwd(), 'datos');
  fs.mkdirSync(carpeta, { recursive: true });
  return path.join(carpeta, NOMBRE_ARCHIVO);
}

function obtenerCarpetaRespaldos() {
  const carpeta = path.join(path.dirname(obtenerRutaBaseDatos()), 'respaldos');
  fs.mkdirSync(carpeta, { recursive: true });
  return carpeta;
}

// Esquema completo. Es idempotente (IF NOT EXISTS) para ejecutarse en cada inicio.
const ESQUEMA = `
-- Catálogo de clientes
CREATE TABLE IF NOT EXISTS clientes(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre TEXT NOT NULL,
  identificacion TEXT,
  telefono TEXT,
  email TEXT,
  direccion TEXT,
  contacto TEXT,
  activo INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Recursos humanos
CREATE TABLE IF NOT EXISTS empleados(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  codigo TEXT UNIQUE,
  nombre TEXT NOT NULL,
  cedula TEXT,
  cargo TEXT,
  salario_base REAL NOT NULL DEFAULT 0,
  fecha_ingreso TEXT,
  activo INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS planillas(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  periodo TEXT NOT NULL,
  fecha_pago TEXT,
  observacion TEXT,
  estado TEXT NOT NULL DEFAULT 'BORRADOR',
  total_bruto REAL NOT NULL DEFAULT 0,
  total_deducciones REAL NOT NULL DEFAULT 0,
  total_neto REAL NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS planilla_detalle(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  planilla_id INTEGER NOT NULL,
  empleado_id INTEGER NOT NULL,
  salario REAL NOT NULL DEFAULT 0,
  horas_extra REAL NOT NULL DEFAULT 0,
  bonificaciones REAL NOT NULL DEFAULT 0,
  deducciones REAL NOT NULL DEFAULT 0,
  neto REAL NOT NULL DEFAULT 0,
  FOREIGN KEY(planilla_id) REFERENCES planillas(id) ON DELETE CASCADE,
  FOREIGN KEY(empleado_id) REFERENCES empleados(id)
);

CREATE TABLE IF NOT EXISTS viaticos(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  empleado_id INTEGER,
  fecha TEXT NOT NULL,
  destino TEXT,
  motivo TEXT,
  monto REAL NOT NULL DEFAULT 0,
  liquidado INTEGER NOT NULL DEFAULT 0,
  estado TEXT NOT NULL DEFAULT 'PENDIENTE',
  observacion TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(empleado_id) REFERENCES empleados(id)
);

-- Comisiones de conductores. El monto se calcula según el tipo:
--   PORCENTAJE -> base_calculo * valor_calculo / 100
--   POR_KM     -> base_calculo * valor_calculo (kilómetros recorridos)
--   FIJO       -> valor_calculo
CREATE TABLE IF NOT EXISTS comisiones(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  conductor_id INTEGER,
  viaje_id INTEGER,
  fecha TEXT NOT NULL,
  periodo TEXT,
  concepto TEXT,
  tipo TEXT NOT NULL DEFAULT 'PORCENTAJE',
  base_calculo REAL NOT NULL DEFAULT 0,
  valor_calculo REAL NOT NULL DEFAULT 0,
  monto REAL NOT NULL DEFAULT 0,
  estado TEXT NOT NULL DEFAULT 'PENDIENTE',
  fecha_pago TEXT,
  metodo TEXT,
  referencia TEXT,
  observacion TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(conductor_id) REFERENCES conductores(id),
  FOREIGN KEY(viaje_id) REFERENCES bitacora_viajes(id)
);

-- Finanzas
CREATE TABLE IF NOT EXISTS ingresos(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  fecha TEXT NOT NULL,
  concepto TEXT NOT NULL,
  categoria TEXT,
  cliente_id INTEGER,
  monto REAL NOT NULL DEFAULT 0,
  metodo TEXT,
  referencia TEXT,
  observacion TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(cliente_id) REFERENCES clientes(id)
);

CREATE TABLE IF NOT EXISTS egresos(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  fecha TEXT NOT NULL,
  concepto TEXT NOT NULL,
  categoria TEXT,
  beneficiario TEXT,
  monto REAL NOT NULL DEFAULT 0,
  metodo TEXT,
  referencia TEXT,
  observacion TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Flota
CREATE TABLE IF NOT EXISTS vehiculos(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  codigo TEXT UNIQUE,
  placa TEXT,
  marca TEXT,
  modelo TEXT,
  anio INTEGER,
  activo INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS conductores(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre TEXT NOT NULL,
  documento TEXT,
  activo INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS combustible(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  fecha TEXT NOT NULL,
  vehiculo_id INTEGER NOT NULL,
  conductor_id INTEGER,
  kilometraje REAL NOT NULL DEFAULT 0,
  cantidad REAL NOT NULL DEFAULT 0,
  precio_unitario REAL NOT NULL DEFAULT 0,
  total REAL NOT NULL DEFAULT 0,
  tipo_combustible TEXT,
  estacion TEXT,
  factura TEXT,
  observacion TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(vehiculo_id) REFERENCES vehiculos(id),
  FOREIGN KEY(conductor_id) REFERENCES conductores(id)
);

-- Operación
CREATE TABLE IF NOT EXISTS bitacora_viajes(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  fecha TEXT NOT NULL,
  vehiculo_id INTEGER,
  conductor_id INTEGER,
  cliente_id INTEGER,
  modulo TEXT,
  hora_salida TEXT,
  lugar_salida TEXT,
  hora_llegada TEXT,
  destino TEXT NOT NULL,
  hora_salida_destino TEXT,
  hora_retorno TEXT,
  km_salida REAL NOT NULL DEFAULT 0,
  km_llegada REAL NOT NULL DEFAULT 0,
  km_recorridos REAL GENERATED ALWAYS AS (CASE WHEN km_llegada >= km_salida THEN km_llegada - km_salida ELSE 0 END) VIRTUAL,
  viatico REAL NOT NULL DEFAULT 0,
  estadia REAL NOT NULL DEFAULT 0,
  esteli REAL NOT NULL DEFAULT 0,
  origen TEXT,
  carga_descripcion TEXT,
  cliente TEXT,
  estado TEXT NOT NULL DEFAULT 'EN CURSO',
  observaciones TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(vehiculo_id) REFERENCES vehiculos(id),
  FOREIGN KEY(conductor_id) REFERENCES conductores(id),
  FOREIGN KEY(cliente_id) REFERENCES clientes(id)
);

-- Usuarios del sistema y sesiones abiertas.
-- La contraseña NUNCA se guarda: se almacena el hash scrypt y su sal.
CREATE TABLE IF NOT EXISTS usuarios(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  usuario TEXT NOT NULL UNIQUE,
  nombre TEXT NOT NULL,
  email TEXT,
  rol TEXT NOT NULL DEFAULT 'OPERADOR' CHECK(rol IN ('ADMIN','OPERADOR','CONSULTA')),
  clave_hash TEXT NOT NULL,
  clave_salt TEXT NOT NULL,
  debe_cambiar_clave INTEGER NOT NULL DEFAULT 0,
  activo INTEGER NOT NULL DEFAULT 1,
  ultimo_acceso TEXT,
  creado_en TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Sesiones abiertas. Se guarda el SHA-256 del token, nunca el token mismo.
-- expira_en_ms es el vencimiento en milisegundos epoch: se compara como número
-- en los dos motores, sin depender del formato de fecha ni de la zona horaria.
CREATE TABLE IF NOT EXISTS sesiones(
  token_hash TEXT PRIMARY KEY,
  usuario_id INTEGER NOT NULL,
  creado_en TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expira_en_ms INTEGER NOT NULL,
  FOREIGN KEY(usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
);

-- Auditoría y configuración
CREATE TABLE IF NOT EXISTS movimientos_auditoria(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  modulo TEXT NOT NULL,
  accion TEXT NOT NULL,
  referencia_id INTEGER,
  descripcion TEXT,
  fecha TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS configuracion(
  id INTEGER PRIMARY KEY CHECK(id=1),
  nombre_empresa TEXT NOT NULL DEFAULT 'Transporte Fierro',
  moneda TEXT NOT NULL DEFAULT 'NIO',
  simbolo TEXT NOT NULL DEFAULT 'C$',
  -- Logotipo de la empresa como imagen en base64 ("data:..."). Vacío = se dibujan
  -- las iniciales del nombre. Se limita el peso desde la interfaz (400 KB).
  logo_empresa TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO configuracion(id) VALUES(1);

`;

// Los índices dependen de columnas que pueden agregarse durante una migración.
// Se ejecutan después de crear/migrar el esquema, nunca dentro de ESQUEMA.
const INDICES = `
CREATE INDEX IF NOT EXISTS idx_empleados_nombre ON empleados(nombre);
CREATE INDEX IF NOT EXISTS idx_planillas_periodo ON planillas(periodo);
CREATE INDEX IF NOT EXISTS idx_planilla_detalle_planilla ON planilla_detalle(planilla_id);
CREATE INDEX IF NOT EXISTS idx_planilla_detalle_empleado ON planilla_detalle(empleado_id);
CREATE INDEX IF NOT EXISTS idx_viaticos_fecha ON viaticos(fecha);
CREATE INDEX IF NOT EXISTS idx_viaticos_empleado ON viaticos(empleado_id);
CREATE INDEX IF NOT EXISTS idx_comisiones_fecha ON comisiones(fecha);
CREATE INDEX IF NOT EXISTS idx_comisiones_conductor ON comisiones(conductor_id);
CREATE INDEX IF NOT EXISTS idx_comisiones_viaje ON comisiones(viaje_id);
CREATE INDEX IF NOT EXISTS idx_comisiones_periodo ON comisiones(periodo);
CREATE INDEX IF NOT EXISTS idx_ingresos_fecha ON ingresos(fecha);
CREATE INDEX IF NOT EXISTS idx_ingresos_cliente ON ingresos(cliente_id);
CREATE INDEX IF NOT EXISTS idx_egresos_fecha ON egresos(fecha);
CREATE INDEX IF NOT EXISTS idx_combustible_fecha ON combustible(fecha);
CREATE INDEX IF NOT EXISTS idx_bitacora_fecha ON bitacora_viajes(fecha);
CREATE INDEX IF NOT EXISTS idx_auditoria_fecha ON movimientos_auditoria(fecha);
CREATE INDEX IF NOT EXISTS idx_usuarios_rol ON usuarios(rol);
CREATE INDEX IF NOT EXISTS idx_usuarios_activo ON usuarios(activo);
CREATE INDEX IF NOT EXISTS idx_sesiones_usuario ON sesiones(usuario_id);
CREATE INDEX IF NOT EXISTS idx_sesiones_vencimiento ON sesiones(expira_en_ms);
`;

// ---------------------------------------------------------------- utilidades

function contar(tabla) {
  return db.prepare(`SELECT COUNT(*) total FROM ${tabla}`).get().total;
}

function asegurarColumna(tabla, columna, definicion) {
  // table_xinfo incluye también columnas VIRTUALES/STORED, que table_info omite.
  const columnas = db.prepare(`PRAGMA table_xinfo(${tabla})`).all();
  if (!columnas.some(c => c.name === columna)) {
    db.exec(`ALTER TABLE ${tabla} ADD COLUMN ${columna} ${definicion}`);
  }
}

// Actualiza bases de datos creadas con versiones anteriores de la aplicación.
function aplicarMigraciones() {
  asegurarColumna('empleados', 'cedula', 'TEXT');
  asegurarColumna('empleados', 'fecha_ingreso', 'TEXT');
  asegurarColumna('ingresos', 'cliente_id', 'INTEGER REFERENCES clientes(id)');
  asegurarColumna('planillas', 'estado', "TEXT NOT NULL DEFAULT 'BORRADOR'");
  asegurarColumna('bitacora_viajes', 'cliente_id', 'INTEGER REFERENCES clientes(id)');
  asegurarColumna(
    'bitacora_viajes',
    'km_recorridos',
    'REAL GENERATED ALWAYS AS (CASE WHEN km_llegada >= km_salida THEN km_llegada - km_salida ELSE 0 END) VIRTUAL'
  );
  asegurarColumna('bitacora_viajes', 'modulo', 'TEXT');
  asegurarColumna('bitacora_viajes', 'lugar_salida', 'TEXT');
  asegurarColumna('bitacora_viajes', 'hora_salida_destino', 'TEXT');
  asegurarColumna('bitacora_viajes', 'hora_retorno', 'TEXT');
  asegurarColumna('bitacora_viajes', 'viatico', 'REAL NOT NULL DEFAULT 0');
  asegurarColumna('bitacora_viajes', 'estadia', 'REAL NOT NULL DEFAULT 0');
  asegurarColumna('bitacora_viajes', 'esteli', 'REAL NOT NULL DEFAULT 0');
  asegurarColumna('viaticos', 'conductor_id', 'INTEGER REFERENCES conductores(id)');
  asegurarColumna('viaticos', 'viaje_id', 'INTEGER REFERENCES bitacora_viajes(id)');
  asegurarColumna('conductores', 'numero_licencia', 'TEXT');
  asegurarColumna('conductores', 'licencia_frontal', 'TEXT');
  asegurarColumna('conductores', 'licencia_trasera', 'TEXT');
  asegurarColumna('conductores', 'carnet_federacion', 'TEXT');
  asegurarColumna('configuracion', 'logo_empresa', "TEXT NOT NULL DEFAULT ''");
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_viaticos_conductor ON viaticos(conductor_id);
    CREATE INDEX IF NOT EXISTS idx_viaticos_viaje ON viaticos(viaje_id);
  `);
  db.pragma(`user_version = ${VERSION_ESQUEMA}`);
}

// ---------------------------------------------------------------- ciclo de vida

// Abre (o crea) la base de datos y deja el esquema listo para usarse.
function inicializarBaseDatos() {
  if (db) return db;
  const archivo = obtenerRutaBaseDatos();
  db = new Database(archivo);
  envoltorio = null; // la conexión anterior queda obsoleta
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');
  db.exec(ESQUEMA);
  aplicarMigraciones();
  db.exec(INDICES);
  // No se crea ninguna cuenta aquí a propósito: si la tabla "usuarios" queda
  // vacía, la interfaz abre la instalación y el usuario elige sus credenciales.
  purgarSesionesVencidas();
  return db;
}

// Borra las sesiones abiertas que ya vencieron. Se ejecuta al abrir la base para
// que la tabla "sesiones" no crezca sin control entre reinicios del equipo.
function purgarSesionesVencidas() {
  try {
    db.prepare('DELETE FROM sesiones WHERE expira_en_ms < ?').run(Date.now());
  } catch (e) {
    // Si la tabla aún no existe (base en plena creación) no es un problema.
    console.warn('No se pudieron purgar las sesiones vencidas:', e.message);
  }
}

// better-sqlite3 exige que la función de una transacción sea SÍNCRONA, pero
// PostgreSQL necesita que sea asíncrona. Este envoltorio da a ambos motores la
// misma API:  await db.transaction(async () => { ... })();
// Se mantiene la instancia real en `db` para journal_mode, pragma y cierre.
let envoltorio = null;

function obtenerDB() {
  if (!db) inicializarBaseDatos();
  if (envoltorio) return envoltorio;
  const real = db;
  envoltorio = new Proxy(real, {
    get(objetivo, propiedad) {
      if (propiedad === 'transaction') {
        return (fn) => async () => {
          real.prepare('BEGIN').run();
          try {
            const resultado = await fn();
            real.prepare('COMMIT').run();
            return resultado;
          } catch (e) {
            try { real.prepare('ROLLBACK').run(); } catch (e2) { /* ya deshecha */ }
            throw e;
          }
        };
      }
      const valor = objetivo[propiedad];
      return typeof valor === 'function' ? valor.bind(objetivo) : valor;
    }
  });
  return envoltorio;
}

function cerrarBaseDatos() {
  if (!db) return { ok: true };
  try {
    db.pragma('wal_checkpoint(TRUNCATE)');
    db.close();
  } catch (e) {
    console.error('No se pudo cerrar la base de datos:', e.message);
  }
  db = null;
  envoltorio = null;
  return { ok: true };
}

// ---------------------------------------------------------------- información

function estadisticas() {
  const base = obtenerDB();
  const archivo = obtenerRutaBaseDatos();
  const tablas = base.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all();
  return {
    archivo,
    carpeta: path.dirname(archivo),
    carpetaRespaldos: obtenerCarpetaRespaldos(),
    existe: fs.existsSync(archivo),
    tamanio: fs.existsSync(archivo) ? fs.statSync(archivo).size : 0,
    version: base.pragma('user_version', { simple: true }),
    versionEsquema: VERSION_ESQUEMA,
    sqlite: base.prepare('SELECT sqlite_version() v').get().v,
    totales: tablas.map(t => ({ tabla: t.name, filas: contar(t.name) }))
  };
}

function registrarAuditoria(modulo, accion, referenciaId, descripcion) {
  obtenerDB()
    .prepare('INSERT INTO movimientos_auditoria (modulo, accion, referencia_id, descripcion) VALUES (?, ?, ?, ?)')
    .run(modulo, accion, referenciaId || null, descripcion || null);
}


// ---------------------------------------------------------------- mantenimiento

function fechaRelativa(dias) {
  return new Date(Date.now() - dias * 86400000).toISOString().slice(0, 10);
}

// Datos de ejemplo (opcionales). Solo inserta en las tablas que están vacías.
function cargarDatosEjemplo() {
  const base = obtenerDB();
  const insertados = {};
  base.transaction(() => {
    if (contar('vehiculos') === 0) {
      const ins = base.prepare('INSERT INTO vehiculos (codigo, placa, marca, modelo, anio) VALUES (?, ?, ?, ?, ?)');
      ins.run('V-01', 'M 234-890', 'Freightliner', 'Cascadia', 2021);
      ins.run('V-02', 'M 189-567', 'Hino', '500 Series', 2019);
      ins.run('V-03', 'M 312-456', 'Isuzu', 'Forward', 2022);
      insertados.vehiculos = 3;
    }
    if (contar('conductores') === 0) {
      const ins = base.prepare('INSERT INTO conductores (nombre, documento) VALUES (?, ?)');
      ins.run('Carlos Mendoza', '001-120584-0023K');
      ins.run('José Luis Rivas', '001-200388-0045B');
      ins.run('Marcos Somarriba', '281-150792-0001W');
      insertados.conductores = 3;
    }
    if (contar('clientes') === 0) {
      const ins = base.prepare('INSERT INTO clientes (nombre, identificacion, telefono, email, direccion, contacto) VALUES (?, ?, ?, ?, ?, ?)');
      ins.run('Distribuidora del Norte S.A.', 'J0310000123456', '+505 2278-4500', 'logistica@distnorte.com', 'Km 8.5 Carretera Norte, Managua', 'Ing. Roberto Silva');
      ins.run('Supermercados La Unión', 'J0310000987654', '+505 2255-8900', 'compras@launion.com.ni', 'Carretera a Masaya km 4.5', 'Lic. Martha Gómez');
      ins.run('Agroindustrias Centrales', 'J0310000456123', '+505 2311-2244', 'despachos@agrocentral.com', 'Chinandega, Salida a El Guasaule', 'Don Ernesto Vargas');
      insertados.clientes = 3;
    }
    if (contar('empleados') === 0) {
      const ins = base.prepare('INSERT INTO empleados (codigo, nombre, cedula, cargo, salario_base, fecha_ingreso) VALUES (?, ?, ?, ?, ?, ?)');
      ins.run('EMP-001', 'Karla Espinoza', '001-090590-0044F', 'Administradora', 24000, fechaRelativa(400));
      ins.run('EMP-002', 'Melvin Castillo', '001-150488-0012A', 'Jefe de Flota', 21500, fechaRelativa(300));
      ins.run('EMP-003', 'Carlos Mendoza', '001-120584-0023K', 'Conductor', 15500, fechaRelativa(220));
      ins.run('EMP-004', 'Fátima Rojas', '001-301192-0088C', 'Auxiliar Contable', 13500, fechaRelativa(120));
      insertados.empleados = 4;
    }
    if (contar('ingresos') === 0) {
      const ins = base.prepare('INSERT INTO ingresos (fecha, concepto, categoria, cliente_id, monto, metodo, referencia) VALUES (?, ?, ?, ?, ?, ?, ?)');
      ins.run(fechaRelativa(25), 'Flete Managua - Chinandega', 'Fletes / Transporte', 1, 28500, 'Transferencia', 'FAC-1001');
      ins.run(fechaRelativa(18), 'Flete Managua - Matagalpa', 'Fletes / Transporte', 2, 19750, 'Efectivo', 'FAC-1002');
      ins.run(fechaRelativa(9), 'Transporte de carga seca', 'Fletes / Transporte', 3, 34200, 'Transferencia', 'FAC-1003');
      insertados.ingresos = 3;
    }
    if (contar('egresos') === 0) {
      const ins = base.prepare('INSERT INTO egresos (fecha, concepto, categoria, beneficiario, monto, metodo, referencia) VALUES (?, ?, ?, ?, ?, ?, ?)');
      ins.run(fechaRelativa(22), 'Reparación de frenos unidad V-02', 'Mantenimiento', 'Taller Mecánico El Progreso', 6400, 'Efectivo', 'REC-5501');
      ins.run(fechaRelativa(15), 'Compra de llantas', 'Repuestos', 'Llantera Central', 12800, 'Transferencia', 'REC-5502');
      ins.run(fechaRelativa(6), 'Pago de energía eléctrica', 'Servicios básicos', 'Disnorte-Dissur', 3150, 'Transferencia', 'REC-5503');
      insertados.egresos = 3;
    }
    if (contar('viaticos') === 0) {
      const ins = base.prepare('INSERT INTO viaticos (empleado_id, fecha, destino, motivo, monto, liquidado, estado, observacion) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
      ins.run(3, fechaRelativa(12), 'Chinandega', 'Traslado de mercadería', 1800, 1, 'LIQUIDADO', 'Liquidado con facturas');
      ins.run(3, fechaRelativa(4), 'Matagalpa', 'Entrega de pedido', 2200, 0, 'PENDIENTE', null);
      ins.run(2, fechaRelativa(2), 'Estelí', 'Supervisión de ruta', 1500, 0, 'PENDIENTE', null);
      insertados.viaticos = 3;
    }
    if (contar('combustible') === 0) {
      const ins = base.prepare('INSERT INTO combustible (fecha, vehiculo_id, conductor_id, kilometraje, cantidad, precio_unitario, total, tipo_combustible, estacion, factura) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
      ins.run(fechaRelativa(20), 1, 1, 44850, 80.0, 48.50, 3880.00, 'Diesel', 'Puma Energy Carretera Norte', 'FAC-88741');
      ins.run(fechaRelativa(13), 1, 1, 45200, 85.5, 48.50, 4146.75, 'Diesel', 'Puma Energy Carretera Norte', 'FAC-89211');
      ins.run(fechaRelativa(7), 2, 2, 37750, 55.0, 48.50, 2667.50, 'Diesel', 'Uno Guanacaste', 'FAC-43890');
      insertados.combustible = 3;
    }
    if (contar('bitacora_viajes') === 0) {
      const ins = base.prepare('INSERT INTO bitacora_viajes (fecha, vehiculo_id, conductor_id, cliente_id, origen, destino, km_salida, km_llegada, hora_salida, hora_llegada, carga_descripcion, cliente, estado) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
      ins.run(fechaRelativa(10), 1, 1, 1, 'Managua', 'Chinandega', 45000, 45210, '07:30', '12:40', 'Carga seca 12 toneladas', 'Distribuidora del Norte S.A.', 'COMPLETADO');
      ins.run(fechaRelativa(3), 2, 2, 2, 'Managua', 'Matagalpa', 38000, 38150, '08:00', '11:20', 'Carga paletizada', 'Supermercados La Unión', 'COMPLETADO');
      ins.run(fechaRelativa(1), 1, 1, 3, 'Managua', 'Estelí', 45700, 0, '06:45', null, 'Granos básicos', 'Agroindustrias Centrales', 'EN CURSO');
      insertados.bitacora_viajes = 3;
    }
    if (contar('comisiones') === 0) {
      // Se apoya en los viajes y conductores de ejemplo anteriores (ids 1 y 2).
      const ins = base.prepare('INSERT INTO comisiones (conductor_id, viaje_id, fecha, periodo, concepto, tipo, base_calculo, valor_calculo, monto, estado, fecha_pago, metodo, referencia, observacion) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
      ins.run(1, 1, fechaRelativa(10), fechaRelativa(10).slice(0, 7), 'Comisión 5% sobre el flete del viaje', 'PORCENTAJE', 18000, 5, 900, 'PAGADA', fechaRelativa(8), 'Efectivo', 'VIA-1', 'Pagada al conductor al cierre del viaje');
      ins.run(2, 2, fechaRelativa(3), fechaRelativa(3).slice(0, 7), 'Comisión por kilómetros recorridos', 'POR_KM', 150, 4, 600, 'PENDIENTE', null, null, 'VIA-2', null);
      insertados.comisiones = 2;
    }
  })();
  return { ok: true, insertados };
}

// Borra la información almacenada. alcance: 'operativo' (movimientos) o 'total' (todo).
function limpiarDatos(alcance) {
  const base = obtenerDB();
  const operativas = ['planilla_detalle', 'planillas', 'viaticos', 'comisiones', 'ingresos', 'egresos', 'combustible', 'bitacora_viajes', 'movimientos_auditoria'];
  const catalogos = ['clientes', 'vehiculos', 'conductores', 'empleados'];
  const tablas = alcance === 'total' ? operativas.concat(catalogos) : operativas;
  const borrados = {};
  base.transaction(() => {
    for (const tabla of tablas) {
      borrados[tabla] = base.prepare(`DELETE FROM ${tabla}`).run().changes;
      base.prepare('DELETE FROM sqlite_sequence WHERE name = ?').run(tabla);
    }
    base.prepare('UPDATE configuracion SET nombre_empresa = ?, moneda = ?, simbolo = ?, logo_empresa = ?, updated_at = CURRENT_TIMESTAMP WHERE id = 1').run('Transporte Fierro', 'NIO', 'C$', '');
  })();
  return { ok: true, alcance: alcance === 'total' ? 'total' : 'operativo', borrados };
}

// Copia de seguridad consistente del archivo de base de datos.
function respaldarBaseDatos() {
  const base = obtenerDB();
  const sello = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
  const archivo = path.join(obtenerCarpetaRespaldos(), `control-empresa-${sello}.db`);
  base.pragma('wal_checkpoint(TRUNCATE)');
  base.exec(`VACUUM INTO '${archivo.replace(/'/g, "''")}'`);
  return { ok: true, archivo, tamanio: fs.statSync(archivo).size };
}

module.exports = {
  inicializarBaseDatos,
  obtenerDB,
  cerrarBaseDatos,
  obtenerRutaBaseDatos,
  obtenerCarpetaRespaldos,
  estadisticas,
  registrarAuditoria,
  cargarDatosEjemplo,
  limpiarDatos,
  respaldarBaseDatos
};