// ============================================================================
// Implementación de la capa de datos para la nube (PostgreSQL / Supabase).
//
// Exporta los MISMOS 7 nombres que src/main/database.js (SQLite), de modo que
// src/main/operaciones.js y src/main/ipc.js funcionan sin cambiar una línea:
// en el escritorio usan SQLite, en la nube usan Postgres.
// ============================================================================
const { obtenerPool, obtenerDB, cerrarBaseDatos, contar, traducir, asegurarEsquema, VERSION_ESQUEMA } = require('./postgres-base');

function conexion() {
  const url = process.env.DATABASE_URL || '(sin configurar)';
  const u = url.replace(/:[^:@/]+@/, ':****@');
  return u;
}

function obtenerRutaBaseDatos() {
  return conexion();
}

function obtenerCarpetaRespaldos() {
  return '(respaldos gestionados por Supabase)';
}

// Información de la base para la pantalla de Configuración.
async function estadisticas() {
  const db = obtenerDB();
  const tablas = await db
    .prepare("SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE' ORDER BY table_name")
    .all();
  const totales = [];
  for (const t of tablas) {
    // El nombre puede venir sin esquema o de otro esquema (pg-mem no siempre
    // filtra bien): se descarta cualquier tabla que no se pueda consultar.
    const nombre = String(t.table_name || '').replace(/"/g, '');
    if (!/^[a-z_][a-z0-9_]*$/i.test(nombre)) continue;
    try {
      const fila = await db.prepare(`SELECT COUNT(*) as total FROM "${nombre}"`).get();
      totales.push({ tabla: nombre, filas: Number(fila.total) });
    } catch (e) {
      // Tabla interna de otro esquema (por ejemplo auth.users): se omite.
    }
  }
  let versionPostgres = '(desconocida)';
  try {
    const v = await db.prepare('SELECT version() as v').get();
    versionPostgres = v.v;
  } catch (e) { /* pg-mem puede no soportar version() */ }
  return {
    servidor: 'PostgreSQL (Supabase)',
    archivo: conexion(),
    carpeta: '(gestionada por el proveedor)',
    carpetaRespaldos: obtenerCarpetaRespaldos(),
    existe: true,
    tamanio: 0,
    version: VERSION_ESQUEMA,
    versionEsquema: VERSION_ESQUEMA,
    sqlite: versionPostgres,
    totales
  };
}

async function registrarAuditoria(modulo, accion, referenciaId, descripcion) {
  return obtenerDB()
    .prepare('INSERT INTO movimientos_auditoria (modulo, accion, referencia_id, descripcion) VALUES (?, ?, ?, ?)')
    .run(modulo, accion, referenciaId || null, descripcion || null);
}

function fechaRelativa(dias) {
  return new Date(Date.now() - dias * 86400000).toISOString().slice(0, 10);
}

// Datos de demostración. Solo inserta en tablas vacías, como en el escritorio.
async function cargarDatosEjemplo() {
  const db = obtenerDB();
  const insertados = {};
  if ((await contar('vehiculos')) === 0) {
    const ins = db.prepare('INSERT INTO vehiculos (codigo, placa, marca, modelo, anio) VALUES (?, ?, ?, ?, ?)');
    await ins.run('V-01', 'M 234-890', 'Freightliner', 'Cascadia', 2021);
    await ins.run('V-02', 'M 189-567', 'Hino', '500 Series', 2019);
    await ins.run('V-03', 'M 312-456', 'Isuzu', 'Forward', 2022);
    insertados.vehiculos = 3;
  }
  if ((await contar('conductores')) === 0) {
    const ins = db.prepare('INSERT INTO conductores (nombre, documento) VALUES (?, ?)');
    await ins.run('Carlos Mendoza', '001-120584-0023K');
    await ins.run('Luis Ramírez', '001-120584-0098J');
    insertados.conductores = 2;
  }
  if ((await contar('clientes')) === 0) {
    const ins = db.prepare('INSERT INTO clientes (nombre, identificacion, telefono) VALUES (?, ?, ?)');
    await ins.run('Distribuidora del Norte S.A.', 'J0310000456123', '22113344');
    await ins.run('Supermercados La Unión', 'J0310000998877', '22778899');
    insertados.clientes = 2;
  }
  if ((await contar('bitacora_viajes')) === 0) {
    const ins = db.prepare(
      `INSERT INTO bitacora_viajes (fecha, vehiculo_id, conductor_id, cliente_id, origen, destino,
        km_salida, km_llegada, hora_salida, hora_llegada, carga_descripcion, cliente, estado)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    await ins.run(fechaRelativa(10), 1, 1, 1, 'Managua', 'Chinandega', 45000, 45210, '07:30', '12:40', 'Carga seca 12 toneladas', 'Distribuidora del Norte S.A.', 'COMPLETADO');
    await ins.run(fechaRelativa(3), 2, 2, 2, 'Managua', 'Matagalpa', 38000, 38150, '08:00', '11:20', 'Carga paletizada', 'Supermercados La Unión', 'COMPLETADO');
    await ins.run(fechaRelativa(1), 1, 1, 1, 'Managua', 'Estelí', 45700, 0, '06:45', null, 'Granos básicos', 'Distribuidora del Norte S.A.', 'EN CURSO');
    insertados.bitacora_viajes = 3;
  }
  if ((await contar('comisiones')) === 0) {
    // Se apoya en los viajes y conductores de ejemplo anteriores (ids 1 y 2).
    const ins = db.prepare(
      `INSERT INTO comisiones (conductor_id, viaje_id, fecha, periodo, concepto, tipo,
        base_calculo, valor_calculo, monto, estado, fecha_pago, metodo, referencia, observacion)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    await ins.run(1, 1, fechaRelativa(10), fechaRelativa(10).slice(0, 7), 'Comisión 5% sobre el flete del viaje', 'PORCENTAJE', 18000, 5, 900, 'PAGADA', fechaRelativa(8), 'Efectivo', 'VIA-1', 'Pagada al conductor al cierre del viaje');
    await ins.run(2, 2, fechaRelativa(3), fechaRelativa(3).slice(0, 7), 'Comisión por kilómetros recorridos', 'POR_KM', 150, 4, 600, 'PENDIENTE', null, null, 'VIA-2', null);
    insertados.comisiones = 2;
  }
  return { ok: true, insertados };
}

const OPERATIVAS = ['planilla_detalle', 'planillas', 'viaticos', 'comisiones', 'ingresos', 'egresos', 'combustible', 'bitacora_viajes', 'movimientos_auditoria'];
const CATALOGOS = ['clientes', 'vehiculos', 'conductores', 'empleados'];

async function limpiarDatos(alcance) {
  const db = obtenerDB();
  const esTotal = alcance === 'total';
  const tablas = esTotal ? OPERATIVAS.concat(CATALOGOS) : OPERATIVAS.slice();
  const borrados = {};
  for (const tabla of tablas) {
    await db.prepare(`DELETE FROM ${tabla}`).run();
    try {
      await db.prepare(`ALTER TABLE ${tabla} ALTER COLUMN id RESTART WITH 1`).run();
    } catch (e) { /* tablas sin columna id */ }
    borrados[tabla] = 1;
  }
  await db.prepare(
    "UPDATE configuracion SET nombre_empresa=?, moneda=?, simbolo=?, logo_empresa=?, updated_at=CURRENT_TIMESTAMP WHERE id=1"
  ).run('Transporte Fierro', 'NIO', 'C$', '');
  return { ok: true, alcance: esTotal ? 'total' : 'operativo', borrados };
}

// En la nube no hay disco local: los respaldos los hace Supabase
// automáticamente y con restauración a un punto en el tiempo.
async function respaldarBaseDatos() {
  return {
    ok: true,
    gestionado: true,
    mensaje: 'Los respaldos los administra Supabase automáticamente (copia diaria + restauración a un punto en el tiempo).',
    archivo: '(respaldos gestionados por Supabase)'
  };
}

module.exports = {
  // Antes de entregar la base se verifica que el esquema tenga las columnas que
  // el código usa (viaticos.conductor_id / viaticos.viaje_id). Si la base quedó
  // desactualizada respecto de supabase/migrations, se corrige y se avisa por
  // consola en vez de fallar con "column ... does not exist".
  inicializarBaseDatos: async () => {
    await asegurarEsquema();
    // Tampoco se crea ninguna cuenta: si "usuarios" queda vacía, la interfaz
    // abre la instalación para que el usuario elija sus credenciales.
    await obtenerDB().prepare('DELETE FROM sesiones WHERE expira_en_ms < ?').run(Date.now());
    return obtenerDB();
  },
  obtenerDB,
  cerrarBaseDatos,
  obtenerRutaBaseDatos,
  obtenerCarpetaRespaldos,
  contar,
  traducir,
  estadisticas,
  registrarAuditoria,
  cargarDatosEjemplo,
  limpiarDatos,
  respaldarBaseDatos
};
