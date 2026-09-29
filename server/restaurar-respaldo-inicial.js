// Recuperación segura del respaldo incluido con la aplicación.
// Solo se usa para una base que no tiene usuarios. Nunca borra ni reemplaza
// registros existentes.
const fs = require('fs');
const path = require('path');
const { obtenerPool } = require('./postgres-base');

const RAIZ = path.join(__dirname, '..');
const ARCHIVO = path.join(RAIZ, 'respaldos', 'base-20260928-2249.json');
const TABLAS = [
  'configuracion', 'clientes', 'vehiculos', 'conductores', 'empleados',
  'ingresos', 'egresos', 'combustible', 'bitacora_viajes', 'planillas',
  'planilla_detalle', 'viaticos', 'comisiones', 'usuarios',
  'movimientos_auditoria'
];

async function contar(pool, tabla) {
  const r = await pool.query(`SELECT COUNT(*)::int AS total FROM ${tabla}`);
  return Number(r.rows[0].total || 0);
}

async function insertarFilas(pool, tabla, filas) {
  if (!Array.isArray(filas) || !filas.length) return 0;
  const columnas = Object.keys(filas[0]);
  const nombres = columnas.map((c) => `"${c.replace(/"/g, '""')}"`).join(', ');
  let total = 0;
  for (const fila of filas) {
    const valores = columnas.map((c) => fila[c]);
    const placeholders = valores.map((_, i) => `$${i + 1}`).join(', ');
    const sql = `INSERT INTO "${tabla}" (${nombres}) OVERRIDING SYSTEM VALUE VALUES (${placeholders})`;
    await pool.query(sql, valores);
    total++;
  }
  return total;
}

async function restaurarRespaldoInicial() {
  if (!fs.existsSync(ARCHIVO)) return { ok: true, restaurado: false, motivo: 'sin_respaldo' };
  const pool = obtenerPool();
  const usuarios = await contar(pool, 'usuarios');
  if (usuarios > 0) return { ok: true, restaurado: false, motivo: 'ya_configurado' };

  const respaldo = JSON.parse(fs.readFileSync(ARCHIVO, 'utf8'));
  const tablas = respaldo.tablas || {};
  const operativas = ['clientes', 'vehiculos', 'conductores', 'empleados', 'ingresos', 'egresos', 'combustible', 'bitacora_viajes', 'planillas', 'planilla_detalle', 'viaticos', 'comisiones', 'movimientos_auditoria'];
  const totalDatos = (await Promise.all(operativas.map((t) => contar(pool, t)))).reduce((a, b) => a + b, 0);

  // Base completamente nueva: recuperar el estado completo del respaldo.
  if (totalDatos === 0) {
    const orden = ['configuracion', 'clientes', 'vehiculos', 'conductores', 'empleados', 'ingresos', 'egresos', 'combustible', 'bitacora_viajes', 'planillas', 'planilla_detalle', 'viaticos', 'comisiones', 'usuarios', 'movimientos_auditoria'];
    const insertados = {};
    for (const tabla of orden) insertados[tabla] = await insertarFilas(pool, tabla, tablas[tabla]);
    console.log('[postgres] Respaldo inicial recuperado sin sobrescribir una base existente:', insertados);
    return { ok: true, restaurado: true, alcance: 'completo', insertados };
  }

  // Hay movimientos, pero faltan usuarios: recuperar SOLO las cuentas para
  // devolver acceso al sistema. Los movimientos existentes no se modifican.
  const n = await insertarFilas(pool, 'usuarios', tablas.usuarios);
  console.log(`[postgres] Se recuperaron ${n} usuarios del respaldo; no se tocaron movimientos existentes.`);
  return { ok: true, restaurado: true, alcance: 'usuarios', usuarios: n };
}

module.exports = { restaurarRespaldoInicial };
