// ============================================================================
// Revisa los viajes de Bitácora que tienen más de un viático y, con
// --resolver, deja solo uno por viaje.
//
// La regla de negocio es que un viaje se cobra UNA sola vez. Antes de que esa
// regla existiera se pudieron registrar varios viáticos sobre el mismo viaje:
// el índice único de la base (idx_viaticos_viaje_unico) no se crea mientras
// queden duplicados, así que conviene ver cuáles son y decidir cuál conservar.
//
//   npx electron tools/viaticos-duplicados.js            (solo lista)
//   npx electron tools/viaticos-duplicados.js --resolver  (conserva el más antiguo)
//   npx electron tools/viaticos-duplicados.js --nube     (usa Supabase, no la local)
//
// Se ejecuta con Electron porque better-sqlite3 / pg están compilados para su
// ABI, igual que tools/prueba-base-datos.js.
// ============================================================================
const path = require('path');

const raiz = path.join(__dirname, '..');
const resolver = process.argv.includes('--resolver');

// Por defecto se revisa la base de escritorio (SQLite, en la carpeta de datos
// de la aplicación). Con --nube se consulta Supabase, que es donde puede estar
// el histórico de viáticos que se llegó a duplicar.
const enNube = process.argv.includes('--nube');
const baseDatos = enNube
  ? require(path.join(raiz, 'server', 'database-nube'))
  : require(path.join(raiz, 'src', 'main', 'database'));

async function main() {
  if (!enNube) baseDatos.inicializarBaseDatos();
  const db = baseDatos.obtenerDB();

  const duplicados = (await db.prepare(`
    SELECT v.viaje_id, COUNT(*) total,
           MIN(v.id) primero, MAX(v.id) ultimo
    FROM viaticos v
    WHERE v.viaje_id IS NOT NULL
    GROUP BY v.viaje_id
    HAVING COUNT(*) > 1
    ORDER BY v.viaje_id`).all());

  if (!duplicados.length) {
    console.log('\nNo hay viajes con más de un viático. Todo correcto.\n');
    return;
  }

  console.log(`\n=== ${duplicados.length} viaje(s) con más de un viático ===\n`);
  for (const d of duplicados) {
    let viaje = null;
    try {
      viaje = await db.prepare('SELECT fecha, origen, destino, conductor_id FROM bitacora_viajes WHERE id=?').get(d.viaje_id);
    } catch (e) { /* el viaje pudo eliminarse: se sigue igual */ }
    const ruta = viaje ? `${viaje.fecha} · ${viaje.origen || '-'} → ${viaje.destino}` : '(el viaje ya no existe)';
    console.log(`Viaje #${d.viaje_id} — ${ruta}`);
    const viaticos = await db.prepare(
      'SELECT id, fecha, destino, monto, estado, conductor_id FROM viaticos WHERE viaje_id=@viaje_id ORDER BY id'
    ).all({ viaje_id: d.viaje_id });
    for (const v of viaticos) {
      const marca = v.id === d.primero ? '  (se conserva)' : resolver && v.id !== d.primero ? '  (se elimina)' : '';
      console.log(`   viático #${v.id} · ${v.fecha} · ${v.destino} · ${v.monto} · ${v.estado}${marca}`);
    }
    console.log('');
  }

  if (!resolver) {
    const total = duplicados.reduce((n, d) => n + (d.total - 1), 0);
    console.log(`Se pueden eliminar ${total} viático(s) repetido(s).`);
    console.log('Para hacerlo:  npx electron tools/viaticos-duplicados.js --resolver');
    console.log('Se conserva siempre el más antiguo (el de menor id) de cada viaje.\n');
    return;
  }

  let borrados = 0;
  for (const d of duplicados) {
    const sobra = await db.prepare('SELECT id FROM viaticos WHERE viaje_id=@viaje_id AND id <> @primero').all({ viaje_id: d.viaje_id, primero: d.primero });
    for (const v of sobra) {
      await db.prepare('DELETE FROM viaticos WHERE id=?').run(v.id);
      borrados++;
    }
    console.log(`Viaje #${d.viaje_id}: se conservó el viático #${d.primero} y se eliminaron ${sobra.length}.`);
  }
  console.log(`\nTotal de viáticos eliminados: ${borrados}.`);
  console.log('La próxima vez que se abra la aplicación se podrá crear el índice único.\n');
}

main()
  .then(() => { try { baseDatos.cerrarBaseDatos(); } catch (e) { /* nada que cerrar */ } process.exit(0); })
  .catch((e) => { console.error('\nNo se pudo revisar la base:', e.message, '\n'); process.exit(1); });
