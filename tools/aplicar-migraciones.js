// ============================================================================
// Aplica las migraciones de supabase/migrations sobre la base indicada en .env
// (DATABASE_URL), en orden alfabético y dentro de una transacción por archivo.
//
//   Uso:  npm run db:migraciones            (aplica solo las pendientes)
//         npm run db:migraciones -- --repetir (vuelve a ejecutar todas)
//
// Las migraciones son idempotentes (if not exists / on conflict), pero además
// se registran en la tabla migraciones_aplicadas para dejar constancia de qué
// versión tiene la base. Esto evita el problema que tuvo la tabla "viaticos":
// el código esperaba columnas (conductor_id, viaje_id) que la base real nunca
// recibió porque la migración se ejecutó a mano en el SQL Editor de Supabase.
// ============================================================================
const fs = require('fs');
const path = require('path');

const RAIZ = path.join(__dirname, '..');

const rutaEnv = path.join(RAIZ, '.env');
if (fs.existsSync(rutaEnv)) {
  try { process.loadEnvFile(rutaEnv); } catch (e) { console.warn('No se pudo leer .env:', e.message); }
}

if (!process.env.DATABASE_URL) {
  console.error('Falta DATABASE_URL. Copiá .env.example a .env y pegá la cadena de Supabase.');
  process.exit(1);
}

const repetir = process.argv.includes('--repetir');
const { obtenerPool, cerrarBaseDatos } = require('../server/postgres-base');

const CARPETA = path.join(RAIZ, 'supabase', 'migrations');

async function main() {
  const pool = obtenerPool();
  const cliente = await pool.connect();
  const aplicadas = [];
  const omitidas = [];
  try {
    await cliente.query(`
      create table if not exists migraciones_aplicadas (
        archivo     text primary key,
        aplicada_en timestamptz not null default now()
      )
    `);

    const archivos = fs.readdirSync(CARPETA).filter((f) => f.endsWith('.sql')).sort();
    if (!archivos.length) {
      console.log('No hay archivos de migración en supabase/migrations.');
      return;
    }

    for (const archivo of archivos) {
      const yaEsta = await cliente.query('select 1 from migraciones_aplicadas where archivo = $1', [archivo]);
      if (yaEsta.rowCount && !repetir) {
        omitidas.push(archivo);
        continue;
      }

      const sql = fs.readFileSync(path.join(CARPETA, archivo), 'utf8');
      try {
        await cliente.query('begin');
        await cliente.query(sql);
        await cliente.query(
          'insert into migraciones_aplicadas (archivo) values ($1) on conflict (archivo) do nothing',
          [archivo]
        );
        await cliente.query('commit');
        aplicadas.push(archivo);
        console.log(`  [APLICADA] ${archivo}`);
      } catch (error) {
        await cliente.query('rollback');
        console.error(`  [FALLO]    ${archivo}: ${error.message}`);
        throw error;
      }
    }

    for (const archivo of omitidas) console.log(`  [AL DÍA]   ${archivo}`);
    console.log(`\n  Resultado: ${aplicadas.length} aplicada(s), ${omitidas.length} ya estaba(n) al día.`);
  } finally {
    cliente.release();
  }
}

main()
  .then(() => cerrarBaseDatos())
  .catch(async (e) => {
    console.error('\nNo se pudieron aplicar las migraciones:', e.message);
    await cerrarBaseDatos();
    process.exit(1);
  });
