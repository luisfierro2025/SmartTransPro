// ============================================================================
// Seguridad de la aplicación: contraseñas, tokens de sesión y permisos.
//
// Vive fuera de database.js y operaciones.js porque lo necesitan las TRES
// capas que comparten la misma base:
//   - src/main/database.js    (SQLite de escritorio, siembra el administrador)
//   - server/database-nube.js (PostgreSQL de Supabase, siembra el administrador)
//   - src/main/operaciones.js (canales de autenticación, idénticos en los 3 destinos)
//
// No se usa ninguna dependencia externa: el hash se calcula con crypto.scrypt,
// que ya viene con Node y Electron.
// ============================================================================
const crypto = require('crypto');

// Parámetros de derivación. scrypt ya es costoso por diseño (el trabajo de
// memoria es lo que encarece atacar el hash), así que basta una sola pasada.
const OPCIONES_SCRYPT = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
const LARGO_HASH = 64;

// Vida de una sesión iniciada desde la pantalla de login.
const HORAS_SESION = Number(process.env.CONTROL_EMPRESA_HORAS_SESION) || 12;

// Permisos por rol. La nube (Supabase Auth) usa exactamente estos mismos tres
// roles en public.perfiles, así que un usuario migrado conserva sus accesos.
//
//   - ADMIN    : todo, incluido el módulo Usuarios.
//   - OPERADOR : opera el sistema pero no administra cuentas de usuario.
//   - CONSULTA : solo consulta la información registrada.
const ROLES = ['ADMIN', 'OPERADOR', 'CONSULTA'];

const MODULOS_POR_ROL = {
  ADMIN: ['dashboard', 'bitacora', 'flota', 'clientes', 'planilla', 'ingresos', 'egresos', 'reportes', 'configuracion', 'usuarios'],
  OPERADOR: ['dashboard', 'bitacora', 'flota', 'clientes', 'planilla', 'ingresos', 'egresos', 'reportes', 'configuracion'],
  CONSULTA: ['dashboard', 'bitacora', 'flota', 'clientes', 'ingresos', 'egresos', 'reportes']
};

// ------------------------------------------------------------------ contraseñas

function generarSalt() {
  return crypto.randomBytes(16).toString('hex');
}

function derivar(clave, salt) {
  return crypto.scryptSync(String(clave), String(salt), LARGO_HASH, OPCIONES_SCRYPT);
}

/** Devuelve { salt, hash } para guardar en la base. La clave nunca se guarda. */
function crearHashClave(clave) {
  const salt = generarSalt();
  return { salt, hash: derivar(clave, salt).toString('hex') };
}

/** Compara la clave capturada con la almacenada, en tiempo constante. */
function verificarClave(clave, salt, hashAlmacenado) {
  if (!clave || !salt || !hashAlmacenado) return false;
  const guardado = Buffer.from(String(hashAlmacenado), 'hex');
  if (guardado.length !== LARGO_HASH) return false;
  // Una cuenta sin clave (el administrador la establece después) nunca entra
  // con la cadena vacía.
  return crypto.timingSafeEqual(derivar(clave, salt), guardado);
}

/** Reglas mínimas de la contraseña. Devuelve null si es válida, o el rechazo. */
function problemaClave(clave) {
  const valor = String(clave === undefined || clave === null ? '' : clave);
  if (!valor) return 'La contraseña no puede quedar vacía.';
  if (valor.length < 6) return 'La contraseña debe tener al menos 6 caracteres.';
  if (valor.length > 100) return 'La contraseña no puede superar los 100 caracteres.';
  return null;
}

/**
 * Valida los datos de una cuenta (alta, edición e instalación).
 * Devuelve un arreglo con todos los problemas encontrados, para poder
 * mostrarlos juntos en vez de uno por uno.
 */
function problemasUsuario(d = {}) {
  const errores = [];
  const nombreUsuario = String(d.usuario === undefined || d.usuario === null ? '' : d.usuario).trim();
  const nombre = String(d.nombre === undefined || d.nombre === null ? '' : d.nombre).trim();
  const email = String(d.email === undefined || d.email === null ? '' : d.email).trim();

  if (!nombreUsuario) {
    errores.push('El nombre de usuario es obligatorio.');
  } else if (!/^[a-zA-Z0-9._-]{3,30}$/.test(nombreUsuario)) {
    errores.push('El usuario debe tener entre 3 y 30 caracteres, y solo letras, números, punto, guion o guion bajo.');
  }
  if (!nombre) {
    errores.push('El nombre completo es obligatorio.');
  }
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    errores.push('El correo electrónico no tiene un formato válido.');
  }
  return errores;
}

// -------------------------------------------------------------------- sesiones

/** Token que viaja entre el servidor y la interfaz (este se guarda en localStorage). */
function generarToken() {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * En la base solo se guarda el SHA-256 del token: si alguien lee el archivo de
 * la base de datos no puede suplantar una sesión con el valor almacenado.
 */
function hashToken(token) {
  return crypto.createHash('sha256').update(String(token || ''), 'utf8').digest('hex');
}

function expiracionSql(horas) {
  const limite = horas === undefined ? HORAS_SESION : horas;
  return `datetime('now', '+${Number(limite) || 1} hours')`;
}

// ------------------------------------------------------------------ permisos

function normalizarRol(rol) {
  const valor = String(rol || '').trim().toUpperCase();
  return ROLES.includes(valor) ? valor : 'CONSULTA';
}

/** ¿El rol puede abrir este módulo de la interfaz? */
function puedeVerModulo(rol, modulo) {
  return (MODULOS_POR_ROL[normalizarRol(rol)] || []).includes(String(modulo));
}

function esAdmin(rol) {
  return normalizarRol(rol) === 'ADMIN';
}

// Proyección pública de un usuario: nunca viaja el hash ni la sal a la interfaz.
function usuarioPublico(fila) {
  if (!fila) return null;
  return {
    id: fila.id,
    usuario: fila.usuario,
    nombre: fila.nombre,
    email: fila.email || '',
    rol: normalizarRol(fila.rol),
    activo: Number(fila.activo) === 1 || fila.activo === true,
    debe_cambiar_clave: Number(fila.debe_cambiar_clave) === 1 || fila.debe_cambiar_clave === true,
    ultimo_acceso: fila.ultimo_acceso || null,
    creado_en: fila.creado_en || fila.created_at || null
  };
}

// ---------------------------------------------------------------- instalación

// El sistema NO viene con una cuenta de fábrica. La primera vez que se abre,
// la base está vacía y la interfaz pide crear la cuenta del administrador: las
// credenciales las elige quien instala, no el sistema.
//
// Estas dos funciones las usan los tres destinos (escritorio, nube y pruebas)
// con la misma abstracción de base de datos.

/** ¿Ya existe alguna cuenta? Si no, hay que mostrar la instalación. */
async function baseTieneUsuarios(base) {
  const total = (await base.prepare('SELECT COUNT(*) AS total FROM usuarios').get()).total;
  return Number(total) > 0;
}

/**
 * Crea la primera cuenta del sistema. Solo tiene efecto si la base está
 * vacía: si alguien la invoca sobre una base ya configurada, no crea nada.
 *
 * @param {object} base
 * @param {object} datos  { usuario, nombre, clave, email }
 * @returns {Promise<object|null>} el usuario creado, o null si ya había cuentas
 */
async function crearPrimerUsuario(base, datos = {}) {
  if (await baseTieneUsuarios(base)) return null;

  const nombreUsuario = String(datos.usuario || '').trim();
  const nombre = String(datos.nombre || '').trim();
  const email = String(datos.email || '').trim() || null;
  const clave = datos.clave;

  const problemas = problemasUsuario({ usuario: nombreUsuario, nombre, email });
  if (problemas.length) throw new Error(problemas[0]);

  const { salt, hash } = crearHashClave(clave);
  // Los dos booleanos van como parámetros y NUNCA como literales en el texto:
  // en SQLite son 0/1 y en PostgreSQL son TRUE/FALSE, y un literal "0"/"1" en
  // una columna booleana de PostgreSQL es un error de tipo.
  //   debe_cambiar_clave = 0: la contraseña es la que eligió el instalador, así
  //                        que no hay nada de fábrica que obligue a cambiarla.
  //   activo             = 1: la cuenta recién creada queda activa.
  const res = await base.prepare(
    `INSERT INTO usuarios (usuario, nombre, email, rol, clave_hash, clave_salt, debe_cambiar_clave, activo)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(nombreUsuario, nombre, email, 'ADMIN', hash, salt, 0, 1);

  return {
    id: res.lastInsertRowid,
    usuario: nombreUsuario,
    nombre,
    email: email || '',
    rol: 'ADMIN',
    activo: true,
    // La contraseña es la que eligió el usuario, no una de fábrica: no hay
    // nada que obligue a cambiarla en el primer ingreso.
    debe_cambiar_clave: false
  };
}

module.exports = {
  ROLES,
  MODULOS_POR_ROL,
  HORAS_SESION,
  crearHashClave,
  verificarClave,
  problemaClave,
  problemasUsuario,
  generarToken,
  hashToken,
  expiracionSql,
  normalizarRol,
  puedeVerModulo,
  esAdmin,
  usuarioPublico,
  baseTieneUsuarios,
  crearPrimerUsuario
};
