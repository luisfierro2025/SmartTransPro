// ============================================================================
// Prepara un PostgreSQL en memoria (pg-mem) para trabajar sin Supabase.
//
// Se usa en dos lugares:
//   - server/dev.js  -> el entorno de desarrollo en localhost:3000
//   - tools/prueba-canales.js -> prueba de todos los canales de la API
//
// No guarda nada en disco: al terminar el proceso, todo desaparece.
// ============================================================================
const fs = require('fs');
const path = require('path');

const RAIZ = path.join(__dirname, '..');

async function iniciarMemoria() {
  process.env.DATABASE_URL = process.env.DATABASE_URL ||
    'postgresql://postgres:postgres@localhost:5432/control_empresa_memoria';
  process.env.DATABASE_SSL = 'false';

  const { newDb, DataType } = require('pg-mem');
  const memoria = newDb({ autoCreateForeignKeyIndices: true });

  // pg-mem implementa pocas funciones nativas. Se registran las que usa la
  // aplicación y que PostgreSQL sí soporta, para que las pruebas sean
  // representativas de la base real.
  memoria.public.registerFunction({
    name: 'substr',
    args: [DataType.text, DataType.integer],
    returns: DataType.text,
    implementation: (texto, inicio) => String(texto).substr(inicio - 1)
  });
  memoria.public.registerFunction({
    name: 'substr',
    args: [DataType.text, DataType.integer, DataType.integer],
    returns: DataType.text,
    implementation: (texto, inicio, largo) => String(texto).substr(inicio - 1, largo)
  });

  // Sustituye el módulo 'pg' por el adaptador en memoria.
  require.cache[require.resolve('pg')] = {
    id: require.resolve('pg'),
    filename: require.resolve('pg'),
    loaded: true,
    exports: memoria.adapters.createPg()
  };

  // auth.users lo crea Supabase; en memoria hay que simularlo.
  memoria.public.none(
    'create schema if not exists auth; create table if not exists auth.users (id uuid primary key, email text);'
  );

  const carpetaMigraciones = path.join(RAIZ, 'supabase', 'migrations');
  const archivos = fs.readdirSync(carpetaMigraciones).filter(f => f.endsWith('.sql')).sort();
  for (const archivo of archivos) {
    const sql = fs.readFileSync(path.join(carpetaMigraciones, archivo), 'utf8').replace(/create extension[^;]+;/gi, '');
    memoria.public.none(sql);
  }

  return memoria;
}

module.exports = { iniciarMemoria };
