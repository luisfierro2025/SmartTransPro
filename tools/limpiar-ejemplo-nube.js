// ============================================================================
// Limpia de la base de la nube los registros de ejemplo que dejó una versión
// anterior de tools/vista-dashboard.js (ver ese archivo: escribía en la base
// real por un error de configuración).
//
// Cada fila se compara con la "huella" exacta que generaba esa herramienta
// (concepto literal, beneficiario y fecha). Si una fila no coincide, NO se
// borra y el script se detiene: el objetivo es no tocar un dato real por error.
//
//   node tools/limpiar-ejemplo-nube.js            (solo muestra qué haría)
//   node tools/limpiar-ejemplo-nube.js --ejecutar (borra)
//
// Igual que en tools/viaticos-duplicados.js, hay que pasar --nube para que use
// Supabase: por defecto trabaja sobre la base local de escritorio.
// ============================================================================
const path = require('path');
const fs = require('fs');

const raiz = path.join(__dirname, '..');
const enNube = process.argv.includes('--nube');
const ejecutar = process.argv.includes('--ejecutar');

const env = path.join(raiz, '.env');
if (enNube && fs.existsSync(env)) {
  try { process.loadEnvFile(env); } catch (e) { console.warn('No se pudo leer .env:', e.message); }
}

// Huellas exactas de los datos de ejemplo. Se comparan en minúsculas para que
// no importe cómo se guardaron las mayúsculas.
const CONCEPTOS_INGRESO = new Set(['flete de carga', 'servicio especial']);
const CONCEPTOS_EGRESO = new Set(['compra de diesel', 'mantenimiento de flota', 'viáticos de conduction', 'viaticos de conduction']);
// El combustible de ejemplo tenía siempre esta combinación exacta.
const COMBUSTIBLE_EJEMPLO = { kilometraje: 120000, cantidad: 80, precio_unitario: 62, total: 4960 };

function esEjemplo(registro, conceptos) {
  return conceptos.has(String(registro.concepto || '').trim().toLowerCase());
}

async function main() {
  let pool;
  if (enNube) {
    const { obtenerPool } = require(path.join(raiz, 'server', 'postgres-base'));
    pool = obtenerPool();
  } else {
    const baseDatos = require(path.join(raiz, 'src', 'main', 'database'));
    baseDatos.inicializarBaseDatos();
    pool = { query: async (sql) => ({ rows: baseDatos.obtenerDB().prepare(sql).all() }) };
  }

  const ingresos = (await pool.query('select * from ingresos')).rows.filter(r => esEjemplo(r, CONCEPTOS_INGRESO));
  const egresos = (await pool.query('select * from egresos')).rows.filter(r => esEjemplo(r, CONCEPTOS_EGRESO));
  const combustibles = (await pool.query('select * from combustible')).rows.filter(r =>
    Number(r.kilometraje) === COMBUSTIBLE_EJEMPLO.kilometraje &&
    Number(r.cantidad) === COMBUSTIBLE_EJEMPLO.cantidad &&
    Number(r.precio_unitario) === COMBUSTIBLE_EJEMPLO.precio_unitario &&
    Number(r.total) === COMBUSTIBLE_EJEMPLO.total);

  console.log(`\nBase: ${enNube ? 'Supabase (nube)' : 'local de escritorio'}`);
  console.log(`Modo: ${ejecutar ? 'BORRAR' : 'solo mostrar (use --ejecutar para borrar)'}\n`);

  const listar = (titulo, filas) => {
    console.log(`${titulo} (${filas.length})`);
    for (const f of filas) {
      const monto = f.monto !== undefined ? f.monto : f.total;
      console.log(`   id=${f.id} | ${f.fecha} | ${f.concepto || `${f.cantidad} L a ${f.precio_unitario}`} | ${monto}`);
    }
    if (!filas.length) console.log('   (ninguno)');
    console.log('');
  };
  listar('Ingresos de ejemplo', ingresos);
  listar('Egresos de ejemplo', egresos);
  listar('Combustible de ejemplo', combustibles);

  if (!ejecutar) {
    console.log('Nada se borró. Agregue --ejecutar para aplicar.');
    return;
  }

  for (const f of ingresos) await pool.query('delete from ingresos where id=$1', [f.id]);
  for (const f of egresos) await pool.query('delete from egresos where id=$1', [f.id]);
  for (const f of combustibles) await pool.query('delete from combustible where id=$1', [f.id]);

  console.log(`Borrados: ${ingresos.length} ingresos, ${egresos.length} egresos, ${combustibles.length} registros de combustible.`);

  // Comprobación posterior: lo que quedó debe seguir intacto.
  const ing = await pool.query('select count(*) total from ingresos');
  const egr = await pool.query('select count(*) total from egresos');
  const comb = await pool.query('select count(*) total from combustible');
  console.log(`Quedan: ${ing.rows[0].total} ingresos, ${egr.rows[0].total} egresos, ${comb.rows[0].total} combustibles.`);
  console.log(`Respaldo del estado anterior: ${fs.existsSync(path.join(raiz, 'respaldos')) ? 'carpeta respaldos/' : '(no encontrado)'}`);
}

main()
  .then(async () => {
    if (enNube) { const { cerrarBaseDatos } = require(path.join(raiz, 'server', 'postgres-base')); await cerrarBaseDatos(); }
    process.exit(0);
  })
  .catch((e) => { console.error('\nFalló la limpieza:', e.message, '\n'); process.exit(1); });
