// ============================================================================
// Respaldo manual de la base de la nube a un archivo JSON.
//
// El respaldo automático de Supabase no se puede abrir desde aquí, así que
// antes de tocar datos de verdad (borrar duplicados, limpiar registros) se
// descarga una copia legible de todas las tablas.
//
//   node tools/respaldar-nube.js
// El archivo queda junto al proyecto: respaldos/base-AAAA-MM-DD-HHMMSS.json
// ============================================================================
const fs = require('fs');
const path = require('path');

const raiz = path.join(__dirname, '..');
const carpeta = path.join(raiz, 'respaldos');
fs.mkdirSync(carpeta, { recursive: true });

// Se leen las credenciales de .env igual que lo hace el resto del proyecto.
const env = path.join(raiz, '.env');
if (fs.existsSync(env)) {
  try { process.loadEnvFile(env); } catch (e) { console.warn('No se pudo leer .env:', e.message); }
}
if (!process.env.DATABASE_URL) {
  console.error('Falta DATABASE_URL en .env. No se puede respaldar.');
  process.exit(1);
}

const { obtenerPool, cerrarBaseDatos } = require(path.join(raiz, 'server', 'postgres-base'));

// Todas las tablas con datos. "movimientos_auditoria" y "sesiones" también se
// respaldan: el historial de qué se hizo es justo lo que sirve si algo sale
// mal después de tocar datos.
const TABLAS = [
  'configuracion', 'clientes', 'vehiculos', 'conductores', 'empleados',
  'ingresos', 'egresos', 'combustible', 'bitacora_viajes',
  'planillas', 'planilla_detalle', 'viaticos', 'comisiones', 'usuarios',
  'movimientos_auditoria'
];

async function main() {
  const pool = obtenerPool();
  const volcado = {};
  const conteos = {};
  for (const tabla of TABLAS) {
    try {
      const r = await pool.query(`select * from ${tabla}`);
      volcado[tabla] = r.rows;
      conteos[tabla] = r.rows.length;
    } catch (e) {
      volcado[tabla] = null;
      conteos[tabla] = `no disponible (${e.message.slice(0, 60)})`;
    }
  }
  const sello = new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 13);
  const archivo = path.join(carpeta, `base-${sello}.json`);
  fs.writeFileSync(archivo, JSON.stringify({
    generado_en: new Date().toISOString(),
    tablas: volcado
  }, null, 2));

  console.log(`\nRespaldo creado: ${archivo}`);
  console.log('Registros por tabla:');
  for (const [t, n] of Object.entries(conteos)) console.log(`  ${t}: ${n}`);
  await cerrarBaseDatos();
}

main()
  .then(() => process.exit(0))
  .catch((e) => { console.error('\nFalló el respaldo:', e.message, '\n'); process.exit(1); });
