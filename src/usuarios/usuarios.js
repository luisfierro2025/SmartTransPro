// ==========================================================================
// Módulo de Usuarios y Acceso
// Autenticación local (scrypt + salt), roles con permisos, bloqueo por
// intentos fallidos, bitácora de accesos y control de sesión por ventana.
// ==========================================================================
import crypto from "node:crypto";
import { db } from "../db/database.js";
// Se reexporta para que las pruebas puedan cerrar la conexión antes de borrar
// el archivo de base de datos temporal (Windows responde EPERM si sigue abierto).
export { db };
// ===== Roles y permisos =====
export const ROLES = ["administrador", "supervisor", "cajero"];
/** Módulos del sistema que se pueden proteger con permisos. */
export const MODULOS_SISTEMA = [
    "inicio",
    "clientes",
    "productos",
    "ventas",
    "abonos",
    "caja",
    "compras",
    "reportes",
    "whatsapp",
    "impresion",
    "configuracion",
    "usuarios"
];
/** Prefijo del canal IPC -> módulo del sistema que lo protege. */
const MODULO_POR_PREFIJO = {
    clientes: "clientes",
    productos: "productos",
    ventas: "ventas",
    // El escáner por teléfono sirve para cobrar en el punto de venta, así que
    // exige el mismo permiso que ese módulo.
    escaner: "ventas",
    abonos: "abonos",
    facturas: "abonos",
    stats: "inicio",
    caja: "caja",
    proveedores: "compras",
    compras: "compras",
    inventario: "compras",
    reportes: "reportes",
    whatsapp: "whatsapp",
    impresion: "impresion",
    configuracion: "configuracion",
    respaldo: "configuracion",
    usuarios: "usuarios"
};
const PERMISOS_POR_ROL = {
    administrador: [...MODULOS_SISTEMA],
    supervisor: [
        "inicio",
        "clientes",
        "productos",
        "ventas",
        "abonos",
        "caja",
        "compras",
        "reportes",
        "whatsapp",
        "impresion"
    ],
    cajero: ["inicio", "clientes", "productos", "ventas", "abonos", "caja", "whatsapp", "impresion"]
};
/** Etiquetas legibles para la interfaz. */
export const ETIQUETAS_ROL = {
    administrador: "Administrador",
    supervisor: "Supervisor",
    cajero: "Cajero"
};
export function esRolValido(rol) {
    return ROLES.includes(rol);
}
export function permisosDeRol(rol) {
    return [...PERMISOS_POR_ROL[rol]];
}
export function moduloDeCanal(canal) {
    const prefijo = String(canal).split(":")[0] ?? "";
    return MODULO_POR_PREFIJO[prefijo] ?? null;
}
export function rolTienePermiso(rol, modulo) {
    return PERMISOS_POR_ROL[rol].indexOf(modulo) !== -1;
}
// ===== Esquema =====
db.exec(`
  CREATE TABLE IF NOT EXISTS usuarios (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    usuario TEXT NOT NULL,
    nombre TEXT NOT NULL,
    correo TEXT,
    telefono TEXT,
    rol TEXT NOT NULL DEFAULT 'cajero',
    hash_contrasena TEXT NOT NULL,
    salt TEXT NOT NULL,
    activo INTEGER NOT NULL DEFAULT 1,
    intentos_fallidos INTEGER NOT NULL DEFAULT 0,
    bloqueado_hasta TEXT,
    debe_cambiar_contrasena INTEGER NOT NULL DEFAULT 0,
    ultimo_acceso TEXT,
    creado_en TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
    actualizado_en TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
  )
`);
db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_usuarios_usuario ON usuarios(usuario COLLATE NOCASE)");
db.exec(`
  CREATE TABLE IF NOT EXISTS sesiones (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    usuario_id INTEGER NOT NULL,
    token_hash TEXT NOT NULL,
    agente TEXT,
    creada_en TEXT NOT NULL,
    expira_en TEXT NOT NULL,
    cerrada_en TEXT,
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
  )
`);
db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_sesiones_token ON sesiones(token_hash)");
db.exec(`
  CREATE TABLE IF NOT EXISTS bitacora_accesos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    usuario_id INTEGER,
    usuario_texto TEXT NOT NULL,
    exito INTEGER NOT NULL DEFAULT 0,
    motivo TEXT,
    fecha TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
  )
`);
// ===== Utilidades =====
export class UsuariosError extends Error {
    constructor(message) {
        super(message);
        this.name = "UsuariosError";
    }
}
/** Fecha/hora local (no UTC) para coincidir con el resto de la base de datos. */
function fechaHoraLocal() {
    const f = new Date();
    const p = (n) => String(n).padStart(2, "0");
    return (`${f.getFullYear()}-${p(f.getMonth() + 1)}-${p(f.getDate())} ` +
        `${p(f.getHours())}:${p(f.getMinutes())}:${p(f.getSeconds())}`);
}
function sumarMinutos(minutos) {
    return new Date(Date.now() + minutos * 60 * 1000).toISOString();
}
const LONGITUD_CLAVE = 64;
const OPCIONES_SCRYPT = { N: 16384, r: 8, p: 1 };
/** Genera un salt aleatorio en hexadecimal para cada contraseña. */
function generarSalt() {
    return crypto.randomBytes(16).toString("hex");
}
function hashearContrasena(contrasena, salt) {
    return crypto.scryptSync(contrasena.normalize("NFKC"), salt, LONGITUD_CLAVE, OPCIONES_SCRYPT).toString("hex");
}
/** Compara en tiempo constante para no filtrar información por temporización. */
function verificarContrasena(contrasena, salt, hashEsperado) {
    const calculado = crypto.scryptSync(contrasena.normalize("NFKC"), salt, LONGITUD_CLAVE, OPCIONES_SCRYPT);
    const esperado = Buffer.from(hashEsperado, "hex");
    if (esperado.length !== calculado.length)
        return false;
    return crypto.timingSafeEqual(esperado, calculado);
}
function resumenToken(token) {
    return crypto.createHash("sha256").update(token).digest("hex");
}
// ===== Validación =====
/** Política de contraseñas: mínimo 6 caracteres, con letra y número. */
export function validarContrasena(contrasena) {
    if (typeof contrasena !== "string" || contrasena.length === 0)
        return "La contraseña es obligatoria.";
    if (contrasena.length < 6)
        return "La contraseña debe tener al menos 6 caracteres.";
    if (!/[A-Za-zÁ-ÿá-úñÑ]/.test(contrasena))
        return "La contraseña debe incluir al menos una letra.";
    if (!/[0-9]/.test(contrasena))
        return "La contraseña debe incluir al menos un número.";
    return null;
}
function validarNombre(nombre) {
    const limpio = String(nombre ?? "").trim();
    if (limpio.length < 3)
        throw new UsuariosError("El nombre completo debe tener al menos 3 caracteres.");
    if (limpio.length > 80)
        throw new UsuariosError("El nombre completo no puede superar los 80 caracteres.");
    return limpio;
}
function validarUsuario(usuario) {
    const limpio = String(usuario ?? "").trim().toLowerCase();
    if (limpio.length < 3)
        throw new UsuariosError("El usuario debe tener al menos 3 caracteres.");
    if (limpio.length > 30)
        throw new UsuariosError("El usuario no puede superar los 30 caracteres.");
    if (!/^[a-z0-9._-]+$/.test(limpio)) {
        throw new UsuariosError("El usuario solo admite letras, números y los signos . _ -");
    }
    return limpio;
}
function validarCorreo(correo) {
    const limpio = String(correo ?? "").trim();
    if (limpio.length === 0)
        return "";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(limpio)) {
        throw new UsuariosError("El correo electrónico no tiene un formato válido.");
    }
    return limpio;
}
function filaAPublico(fila) {
    const rol = esRolValido(fila.rol) ? fila.rol : "cajero";
    const bloqueado = !!fila.bloqueado_hasta && fila.bloqueado_hasta > fechaHoraLocal();
    return {
        id: Number(fila.id),
        usuario: fila.usuario,
        nombre: fila.nombre,
        correo: fila.correo ?? "",
        telefono: fila.telefono ?? "",
        rol,
        rolEtiqueta: ETIQUETAS_ROL[rol],
        activo: Number(fila.activo) === 1,
        bloqueado,
        intentosFallidos: Number(fila.intentos_fallidos) || 0,
        debeCambiarContrasena: Number(fila.debe_cambiar_contrasena) === 1,
        ultimoAcceso: fila.ultimo_acceso ?? "",
        creadoEn: fila.creado_en
    };
}
function buscarFila(usuario) {
    return db.prepare("SELECT * FROM usuarios WHERE usuario = ? COLLATE NOCASE").get(usuario);
}
function buscarFilaPorId(id) {
    return db.prepare("SELECT * FROM usuarios WHERE id = ?").get(id);
}
/** Cuenta administradores activos: usado para impedir quedarse sin acceso. */
function administradoresActivos(exceptoId) {
    const fila = db
        .prepare("SELECT COUNT(*) AS total FROM usuarios WHERE rol = 'administrador' AND activo = 1 AND id <> ?")
        .get(exceptoId ?? 0);
    return Number(fila.total) || 0;
}
// ===== CRUD de usuarios =====
export function listarUsuarios() {
    const filas = db
        .prepare("SELECT * FROM usuarios ORDER BY activo DESC, nombre COLLATE NOCASE ASC")
        .all();
    return filas.map(filaAPublico);
}
export function contarUsuarios() {
    const fila = db.prepare("SELECT COUNT(*) AS total FROM usuarios").get();
    return Number(fila.total) || 0;
}
export function crearUsuario(datos) {
    const usuario = validarUsuario(datos.usuario);
    const nombre = validarNombre(datos.nombre);
    const correo = validarCorreo(datos.correo);
    const telefono = String(datos.telefono ?? "").trim().slice(0, 30);
    if (!esRolValido(String(datos.rol)))
        throw new UsuariosError("El rol seleccionado no es válido.");
    const problema = validarContrasena(String(datos.contrasena ?? ""));
    if (problema)
        throw new UsuariosError(problema);
    if (buscarFila(usuario))
        throw new UsuariosError("Ya existe un usuario registrado con ese nombre.");
    const salt = generarSalt();
    const hash = hashearContrasena(datos.contrasena, salt);
    const fecha = fechaHoraLocal();
    const info = db
        .prepare("INSERT INTO usuarios (usuario, nombre, correo, telefono, rol, hash_contrasena, salt, activo, debe_cambiar_contrasena, creado_en, actualizado_en) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
        .run(usuario, nombre, correo, telefono, datos.rol, hash, salt, datos.activo ? 1 : 0, datos.debeCambiarContrasena ? 1 : 0, fecha, fecha);
    const creado = buscarFilaPorId(Number(info.lastInsertRowid));
    if (!creado)
        throw new UsuariosError("No se pudo registrar el usuario.");
    registrarBitacora(creado.id, usuario, true, "Usuario creado");
    return filaAPublico(creado);
}
export function actualizarUsuario(id, datos) {
    const actual = buscarFilaPorId(id);
    if (!actual)
        throw new UsuariosError("El usuario indicado no existe.");
    const usuario = datos.usuario === undefined ? actual.usuario : validarUsuario(datos.usuario);
    const nombre = datos.nombre === undefined ? actual.nombre : validarNombre(datos.nombre);
    const correo = datos.correo === undefined ? (actual.correo ?? "") : validarCorreo(datos.correo);
    const telefono = datos.telefono === undefined ? (actual.telefono ?? "") : String(datos.telefono).trim().slice(0, 30);
    const rol = datos.rol === undefined ? actual.rol : String(datos.rol);
    if (!esRolValido(rol))
        throw new UsuariosError("El rol seleccionado no es válido.");
    const activo = datos.activo === undefined ? Number(actual.activo) === 1 : datos.activo === true;
    // Salvaguarda: el sistema no puede quedarse sin ningún administrador activo.
    const pierdeAdmin = actual.rol === "administrador" && Number(actual.activo) === 1 && (rol !== "administrador" || !activo);
    if (pierdeAdmin && administradoresActivos(id) === 0) {
        throw new UsuariosError("Debe existir al menos un administrador activo en el sistema.");
    }
    const otroConMismoNombre = buscarFila(usuario);
    if (otroConMismoNombre && Number(otroConMismoNombre.id) !== id) {
        throw new UsuariosError("Ya existe otro usuario registrado con ese nombre.");
    }
    db.prepare("UPDATE usuarios SET usuario = ?, nombre = ?, correo = ?, telefono = ?, rol = ?, activo = ?, actualizado_en = ? WHERE id = ?").run(usuario, nombre, correo, telefono, rol, activo ? 1 : 0, fechaHoraLocal(), id);
    // Si el usuario pierde el acceso, sus sesiones abiertas dejan de ser válidas.
    if (!activo)
        cerrarSesionesDeUsuario(id);
    const actualizado = buscarFilaPorId(id);
    if (!actualizado)
        throw new UsuariosError("No se pudo actualizar el usuario.");
    registrarBitacora(id, actualizado.usuario, true, "Usuario actualizado");
    return filaAPublico(actualizado);
}
export function eliminarUsuario(id) {
    const actual = buscarFilaPorId(id);
    if (!actual)
        throw new UsuariosError("El usuario indicado no existe.");
    if (actual.rol === "administrador" && Number(actual.activo) === 1 && administradoresActivos(id) === 0) {
        throw new UsuariosError("No se puede eliminar el único administrador activo del sistema.");
    }
    const borrar = db.transaction(() => {
        cerrarSesionesDeUsuario(id);
        db.prepare("DELETE FROM usuarios WHERE id = ?").run(id);
    });
    borrar();
    registrarBitacora(null, actual.usuario, true, "Usuario eliminado");
}
/** Cambio de contraseña propio: exige la contraseña actual. */
export function cambiarContrasena(id, contrasenaActual, contrasenaNueva) {
    const actual = buscarFilaPorId(id);
    if (!actual)
        throw new UsuariosError("El usuario indicado no existe.");
    if (!verificarContrasena(String(contrasenaActual ?? ""), actual.salt, actual.hash_contrasena)) {
        throw new UsuariosError("La contraseña actual no es correcta.");
    }
    if (String(contrasenaNueva ?? "") === String(contrasenaActual ?? "")) {
        throw new UsuariosError("La contraseña nueva debe ser distinta de la actual.");
    }
    const problema = validarContrasena(String(contrasenaNueva ?? ""));
    if (problema)
        throw new UsuariosError(problema);
    const salt = generarSalt();
    const hash = hashearContrasena(contrasenaNueva, salt);
    db.prepare("UPDATE usuarios SET hash_contrasena = ?, salt = ?, debe_cambiar_contrasena = 0, intentos_fallidos = 0, bloqueado_hasta = NULL, actualizado_en = ? WHERE id = ?").run(hash, salt, fechaHoraLocal(), id);
    const actualizado = buscarFilaPorId(id);
    if (!actualizado)
        throw new UsuariosError("No se pudo cambiar la contraseña.");
    registrarBitacora(id, actualizado.usuario, true, "Contraseña cambiada");
    return filaAPublico(actualizado);
}
/** Restablece la contraseña de otro usuario y obliga a cambiarla al entrar. */
export function restablecerContrasena(id, contrasenaNueva) {
    const problema = validarContrasena(String(contrasenaNueva ?? ""));
    if (problema)
        throw new UsuariosError(problema);
    const salt = generarSalt();
    const hash = hashearContrasena(contrasenaNueva, salt);
    const info = db
        .prepare("UPDATE usuarios SET hash_contrasena = ?, salt = ?, debe_cambiar_contrasena = 1, intentos_fallidos = 0, bloqueado_hasta = NULL, actualizado_en = ? WHERE id = ?")
        .run(hash, salt, fechaHoraLocal(), id);
    if (info.changes === 0)
        throw new UsuariosError("El usuario indicado no existe.");
    cerrarSesionesDeUsuario(id);
    const actualizado = buscarFilaPorId(id);
    if (!actualizado)
        throw new UsuariosError("No se pudo restablecer la contraseña.");
    registrarBitacora(id, actualizado.usuario, true, "Contraseña restablecida por un administrador");
    return filaAPublico(actualizado);
}
export function desbloquearUsuario(id) {
    const info = db
        .prepare("UPDATE usuarios SET intentos_fallidos = 0, bloqueado_hasta = NULL, actualizado_en = ? WHERE id = ?")
        .run(fechaHoraLocal(), id);
    if (info.changes === 0)
        throw new UsuariosError("El usuario indicado no existe.");
    const actualizado = buscarFilaPorId(id);
    if (!actualizado)
        throw new UsuariosError("No se pudo desbloquear el usuario.");
    registrarBitacora(id, actualizado.usuario, true, "Usuario desbloqueado");
    return filaAPublico(actualizado);
}
// ===== Bitácora de accesos =====
function registrarBitacora(usuarioId, usuarioTexto, exito, motivo) {
    db.prepare("INSERT INTO bitacora_accesos (usuario_id, usuario_texto, exito, motivo) VALUES (?, ?, ?, ?)").run(usuarioId, usuarioTexto, exito ? 1 : 0, motivo);
}
export function obtenerBitacora(limite = 40) {
    const filas = db
        .prepare("SELECT id, usuario_texto, exito, motivo, fecha FROM bitacora_accesos ORDER BY id DESC LIMIT ?")
        .all(Math.max(1, Math.min(200, Math.trunc(limite))));
    return filas.map((fila) => ({
        id: Number(fila.id),
        usuario: fila.usuario_texto,
        exito: Number(fila.exito) === 1,
        motivo: fila.motivo,
        fecha: fila.fecha
    }));
}
// ===== Sesiones y autenticación =====
export const HORAS_VALIDEZ_SESION = 12;
const MAX_INTENTOS = 5;
const MINUTOS_BLOQUEO = 10;
/** Sesiones abiertas por identificador de webContents (la ventana del renderer). */
const sesionesPorVentana = new Map();
function cerrarSesionesDeUsuario(usuarioId) {
    db.prepare("UPDATE sesiones SET cerrada_en = ? WHERE usuario_id = ? AND cerrada_en IS NULL").run(fechaHoraLocal(), usuarioId);
    for (const [ventanaId, sesion] of sesionesPorVentana.entries()) {
        if (sesion.usuarioId === usuarioId)
            sesionesPorVentana.delete(ventanaId);
    }
}
function abrirSesion(usuarioId, agente) {
    const token = crypto.randomBytes(32).toString("hex");
    const expiraEn = new Date(Date.now() + HORAS_VALIDEZ_SESION * 3600 * 1000).toISOString();
    db.prepare("INSERT INTO sesiones (usuario_id, token_hash, agente, creada_en, expira_en) VALUES (?, ?, ?, ?, ?)").run(usuarioId, resumenToken(token), String(agente ?? "").slice(0, 200), fechaHoraLocal(), expiraEn);
    const fila = buscarFilaPorId(usuarioId);
    if (!fila)
        throw new UsuariosError("No se pudo iniciar la sesión.");
    const publico = filaAPublico(fila);
    return { ...publico, token, expiraEn, permisos: permisosDeRol(publico.rol) };
}
export function autenticarse(usuario, contrasena, agente = "") {
    const nombreUsuario = String(usuario ?? "").trim();
    if (nombreUsuario.length === 0 || String(contrasena ?? "").length === 0) {
        throw new UsuariosError("Ingresa tu usuario y tu contraseña.");
    }
    const fila = buscarFila(nombreUsuario);
    // Mensaje genérico: no revela si el usuario existe o la contraseña es incorrecta.
    const credencialesInvalidas = new UsuariosError("Usuario o contraseña incorrectos.");
    if (!fila) {
        registrarBitacora(null, nombreUsuario.toLowerCase(), false, "Intento de acceso: usuario inexistente");
        throw credencialesInvalidas;
    }
    if (Number(fila.activo) !== 1) {
        registrarBitacora(fila.id, fila.usuario, false, "Acceso denegado: usuario inactivo");
        throw new UsuariosError("Este usuario está desactivado. Contacta al administrador.");
    }
    const ahora = fechaHoraLocal();
    if (fila.bloqueado_hasta && fila.bloqueado_hasta > ahora) {
        registrarBitacora(fila.id, fila.usuario, false, "Acceso denegado: usuario bloqueado");
        throw new UsuariosError("La cuenta está bloqueada temporalmente por intentos fallidos. Intenta de nuevo en unos minutos.");
    }
    if (!verificarContrasena(String(contrasena ?? ""), fila.salt, fila.hash_contrasena)) {
        const intentos = Number(fila.intentos_fallidos) + 1;
        const bloquea = intentos >= MAX_INTENTOS;
        const hasta = bloquea ? sumarMinutos(MINUTOS_BLOQUEO) : null;
        db.prepare("UPDATE usuarios SET intentos_fallidos = ?, bloqueado_hasta = ? WHERE id = ?").run(intentos, hasta, fila.id);
        registrarBitacora(fila.id, fila.usuario, false, bloquea
            ? "Intento de acceso fallido: cuenta bloqueada temporalmente"
            : "Intento de acceso fallido (" + intentos + " de " + MAX_INTENTOS + ")");
        if (bloquea) {
            throw new UsuariosError("Demasiados intentos fallidos. La cuenta quedó bloqueada temporalmente, inténtalo en unos minutos.");
        }
        throw credencialesInvalidas;
    }
    // Credenciales correctas: se reinicia el contador y se registra el ingreso.
    db.prepare("UPDATE usuarios SET intentos_fallidos = 0, bloqueado_hasta = NULL, ultimo_acceso = ? WHERE id = ?").run(ahora, fila.id);
    const sesion = abrirSesion(fila.id, agente);
    registrarBitacora(fila.id, fila.usuario, true, "Inicio de sesión");
    return sesion;
}
/** Recupera la sesión activa de una ventana; null si no hay o venció. */
export function sesionDeVentana(ventanaId) {
    const registrada = sesionesPorVentana.get(ventanaId);
    if (!registrada)
        return null;
    if (registrada.expiraEn <= new Date().toISOString()) {
        sesionesPorVentana.delete(ventanaId);
        return null;
    }
    const fila = db
        .prepare("SELECT u.* FROM usuarios u JOIN sesiones s ON s.usuario_id = u.id WHERE s.token_hash = ? AND s.cerrada_en IS NULL")
        .get(resumenToken(registrada.token));
    if (!fila || Number(fila.activo) !== 1) {
        sesionesPorVentana.delete(ventanaId);
        return null;
    }
    const publico = filaAPublico(fila);
    return { ...publico, token: registrada.token, expiraEn: registrada.expiraEn, permisos: permisosDeRol(publico.rol) };
}
export function asociarSesion(ventanaId, sesion) {
    sesionesPorVentana.set(ventanaId, { token: sesion.token, usuarioId: sesion.id, expiraEn: sesion.expiraEn });
}
export function cerrarSesion(ventanaId) {
    const registrada = sesionesPorVentana.get(ventanaId);
    sesionesPorVentana.delete(ventanaId);
    if (!registrada)
        return false;
    db.prepare("UPDATE sesiones SET cerrada_en = ? WHERE token_hash = ? AND cerrada_en IS NULL").run(fechaHoraLocal(), resumenToken(registrada.token));
    return true;
}
/** Verifica que la ventana tenga sesión y permiso sobre el módulo del canal. */
export function exigirPermiso(ventanaId, modulo) {
    const sesion = sesionDeVentana(ventanaId);
    if (!sesion)
        throw new UsuariosError("Debe iniciar sesión para continuar.");
    if (rolTienePermiso(sesion.rol, modulo))
        return;
    throw new UsuariosError("No cuenta con permisos para acceder a este módulo.");
}
export function resumenUsuarios() {
    const cuenta = db
        .prepare("SELECT COUNT(*) AS total, SUM(CASE WHEN activo = 1 THEN 1 ELSE 0 END) AS activos, SUM(CASE WHEN activo = 0 THEN 1 ELSE 0 END) AS inactivos FROM usuarios")
        .get();
    const bloqueados = db
        .prepare("SELECT COUNT(*) AS total FROM usuarios WHERE bloqueado_hasta IS NOT NULL AND bloqueado_hasta > ?")
        .get(fechaHoraLocal());
    const porRol = ROLES.map((rol) => {
        const fila = db.prepare("SELECT COUNT(*) AS total FROM usuarios WHERE rol = ?").get(rol);
        return { rol, etiqueta: ETIQUETAS_ROL[rol], total: Number(fila.total) || 0 };
    });
    return {
        total: Number(cuenta.total) || 0,
        activos: Number(cuenta.activos) || 0,
        inactivos: Number(cuenta.inactivos) || 0,
        bloqueados: Number(bloqueados.total) || 0,
        porRol
    };
}
// ===== Arranque del sistema =====
export const USUARIO_INICIAL = "admin";
export const CONTRASENA_INICIAL = "admin123";
/**
 * Garantiza que exista un administrador con el que entrar por primera vez.
 * Es idempotente: solo crea la cuenta cuando la tabla de usuarios está vacía.
 */
export function asegurarAdministradorInicial() {
    if (contarUsuarios() > 0)
        return null;
    try {
        return crearUsuario({
            usuario: USUARIO_INICIAL,
            nombre: "Administrador",
            correo: "",
            telefono: "",
            rol: "administrador",
            contrasena: CONTRASENA_INICIAL,
            activo: true,
            debeCambiarContrasena: true
        });
    }
    catch (error) {
        console.warn("usuarios:no-se-pudo-crear-admin-inicial", error);
        return null;
    }
}
//# sourceMappingURL=usuarios.js.map