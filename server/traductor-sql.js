// ============================================================================
// Traductor de SQL: SQLite (better-sqlite3)  ->  PostgreSQL (Supabase)
//
// Las consultas de la aplicaciÃ³n se escribieron para SQLite. En vez de
// reescribir las ~85 sentencias a mano, este mÃ³dulo convierte:
//
//   ?            ->  $1, $2, $3...        (posicionales)
//   @nombre      ->  $1, $2, $3...        (con nombre, usando el objeto de parÃ¡metros)
//   date(expr)   ->  (expr)::date         (en Postgres `date` es un TIPO, no una funciÃ³n)
//   date('now')  ->  current_date
//   activo=1     ->  activo = true       (las columnas booleanas son 0/1 en SQLite)
//
// MODO ESTRICTO: si aparece una construcciÃ³n de SQLite que NO sabe convertir,
// lanza un error descriptivo en vez de dejar pasar una consulta que fallarÃ¡
// en producciÃ³n de forma silenciosa.
// ============================================================================

// Construcciones de SQLite sin equivalente automÃ¡tico. Requieren portar a mano.
const NO_SOPORTADOS = [
  { patron: /sqlite_master/i, motivo: 'sqlite_master no existe en PostgreSQL (usar information_schema)' },
  { patron: /sqlite_version\s*\(/i, motivo: 'sqlite_version() no existe en PostgreSQL (usar version())' },
  { patron: /\bpragma\b/i, motivo: 'PRAGMA no existe en PostgreSQL' },
  { patron: /\binsert\s+or\b/i, motivo: 'INSERT OR no existe (usar ON CONFLICT DO NOTHING)' },
  { patron: /\bifnull\s*\(/i, motivo: 'IFNULL no existe (usar COALESCE)' },
  { patron: /\bgroup_concat\s*\(/i, motivo: 'GROUP_CONCAT no existe (usar string_agg)' },
  { patron: /\bstrftime\s*\(/i, motivo: 'strftime no existe (usar to_char)' },
  { patron: /\bjulianday\s*\(/i, motivo: 'julianday no existe' },
  { patron: /\bdatetime\s*\(/i, motivo: 'datetime() no existe (usar now())' },
  { patron: /\bsqlite_sequence\b/i, motivo: 'sqlite_sequence no existe (usar ALTER TABLE ... RESTART)' },
  { patron: /\bglob\b/i, motivo: 'GLOB no existe en PostgreSQL (usar LIKE, o el operador ~)' },
  { patron: /\bregexp\b/i, motivo: 'REGEXP no existe en PostgreSQL (usar ~ o SIMILAR TO)' }
];

// Columnas que en SQLite se guardaban como 0/1 y en Postgres son booleanas.
const COLUMNAS_BOOLEANAS = ['activo', 'liquidado', 'debe_cambiar_clave'];

class ErrorTraduccion extends Error {
  constructor(motivo, sql) {
    super(`SQL de SQLite no soportado: ${motivo}\nConsulta: ${sql.slice(0, 200)}`);
    this.name = 'ErrorTraduccion';
  }
}

// Devuelve el Ã­ndice justo despuÃ©s del literal que empieza en `inicio`.
function cerrarLiteral(sql, inicio) {
  let i = inicio + 1;
  while (i < sql.length) {
    if (sql[i] === "'") {
      if (sql[i + 1] === "'") { i += 2; continue; } // literal escapado ''
      return i + 1;
    }
    i++;
  }
  return sql.length;
}


// Reemplaza date(...) por (...).::date respetando parÃ©ntesis anidados y literales.
function traducirDate(sql) {
  let salida = '';
  let i = 0;
  while (i < sql.length) {
    const ch = sql[i];
    if (ch === "'") {
      const fin = cerrarLiteral(sql, i);
      salida += sql.slice(i, fin);
      i = fin;
      continue;
    }
    if (/[A-Za-z_]/.test(ch)) {
      let j = i;
      while (j < sql.length && /[A-Za-z0-9_$]/.test(sql[j])) j++;
      const palabra = sql.slice(i, j);
      // No tocar "as date" (CAST) ni una columna llamada "date".
      const previo = sql.slice(0, i).match(/([A-Za-z_]+)\s*$/);
      const esCast = previo && previo[1].toLowerCase() === 'as';
      if (palabra.toLowerCase() === 'date' && sql[j] === '(' && !esCast) {
        let k = j + 1;
        let nivel = 1;
        while (k < sql.length && nivel > 0) {
          if (sql[k] === "'") { k = cerrarLiteral(sql, k); continue; }
          if (sql[k] === '(') nivel++;
          else if (sql[k] === ')') nivel--;
          if (nivel > 0) k++;
        }
        const argumento = sql.slice(j + 1, k).trim();
        salida += /^'now'/i.test(argumento) ? 'current_date' : `(${argumento})::date`;
        i = k + 1;
        continue;
      }
      salida += palabra;
      i = j;
      continue;
    }
    salida += ch;
    i++;
  }
  return salida;
}

// Convierte los marcadores de parÃ¡metro y arma el arreglo de valores en orden.
function traducirParametros(sql, parametros) {
  const valores = [];
  const esArreglo = Array.isArray(parametros);
  let salida = '';
  let i = 0;
  let n = 0;
  while (i < sql.length) {
    const ch = sql[i];
    if (ch === "'") {
      const fin = cerrarLiteral(sql, i);
      salida += sql.slice(i, fin);
      i = fin;
      continue;
    }
    if (ch === '?') {
      n++;
      salida += `$${n}`;
      if (esArreglo) valores.push(parametros[n - 1]);
      i++;
      continue;
    }
    if (ch === '@') {
      let j = i + 1;
      while (j < sql.length && /[A-Za-z0-9_]/.test(sql[j])) j++;
      const nombre = sql.slice(i + 1, j);
      if (!nombre) { salida += ch; i++; continue; }
      n++;
      salida += `$${n}`;
      if (parametros && !esArreglo) valores.push(parametros[nombre]);
      i = j;
      continue;
    }
    salida += ch;
    i++;
  }
  return { sql: salida, valores };
}

// SQLite: LIKE ya es insensible a mayúsculas (para ASCII). PostgreSQL SÍ
// distingue mayúsculas en LIKE, por eso los buscadores (Bitácora, etc.)
// solo encontraban resultados escritos exactamente igual. Se traduce a
// ILIKE, que es el equivalente insensible a mayúsculas de PostgreSQL.
function traducirLike(sql) {
  return sql.replace(/\bLIKE\b/gi, 'ILIKE');
}

function traducirBooleanos(sql) {
  let salida = sql;
  for (const columna of COLUMNAS_BOOLEANAS) {
    const re = new RegExp(`\\b${columna}\\s*=\\s*1\\b`, 'gi');
    salida = salida.replace(re, `${columna} = true`);
    const re0 = new RegExp(`\\b${columna}\\s*=\\s*0\\b`, 'gi');
    salida = salida.replace(re0, `${columna} = false`);
  }
  return salida;
}

/**
 * Traduce una consulta de SQLite a PostgreSQL.
 * @param {string} sql
 * @param {object|Array|null} parametros  objeto con nombre o arreglo posicional
 * @returns {{ sql: string, valores: Array }}
 */
function traducir(sql, parametros = null) {
  for (const { patron, motivo } of NO_SOPORTADOS) {
    if (patron.test(sql)) throw new ErrorTraduccion(motivo, sql);
  }
  let salida = traducirLike(traducirDate(sql));
  const resultado = traducirParametros(salida, parametros);
  return { sql: traducirBooleanos(resultado.sql), valores: resultado.valores };
}

module.exports = { traducir, ErrorTraduccion };
