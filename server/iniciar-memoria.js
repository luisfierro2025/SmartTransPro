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
  // to_char(fecha,'YYYY-MM') acorta una fecha a su mes. Es la forma en que
  // PostgreSQL agrupa por mes (el traductor convierte substr(cast(...)) en
  // to_char). pg-mem no la trae, pero PostgreSQL sí, y sin ella la prueba en
  // memoria fallaría donde la base real funciona.
  memoria.public.registerFunction({
    name: 'to_char',
    args: [DataType.date, DataType.text],
    returns: DataType.text,
    implementation: (fecha, formato) => {
      const f = fecha instanceof Date ? fecha : new Date(fecha);
      const mes = String(f.getUTCMonth() + 1).padStart(2, '0');
      const anio = f.getUTCFullYear();
      // Solo se usa el formato 'YYYY-MM' en la aplicación: el resto devuelve
      // la fecha completa para que un formato nuevo no devuelva algo inventado.
      return formato === 'YYYY-MM' ? `${anio}-${mes}` : `${anio}-${mes}-01`;
    }
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
