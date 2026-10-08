import { db } from "../db/database.js";
export { db };
export declare const ROLES: readonly ["administrador", "supervisor", "cajero"];
export type RolUsuario = (typeof ROLES)[number];
/** Módulos del sistema que se pueden proteger con permisos. */
export declare const MODULOS_SISTEMA: readonly ["inicio", "clientes", "productos", "ventas", "abonos", "caja", "compras", "reportes", "whatsapp", "impresion", "configuracion", "usuarios"];
export type ModuloSistema = (typeof MODULOS_SISTEMA)[number];
/** Etiquetas legibles para la interfaz. */
export declare const ETIQUETAS_ROL: Record<RolUsuario, string>;
export declare function esRolValido(rol: string): rol is RolUsuario;
export declare function permisosDeRol(rol: RolUsuario): ModuloSistema[];
export declare function moduloDeCanal(canal: string): ModuloSistema | null;
export declare function rolTienePermiso(rol: RolUsuario, modulo: ModuloSistema): boolean;
export declare class UsuariosError extends Error {
    constructor(message: string);
}
/** Política de contraseñas: mínimo 6 caracteres, con letra y número. */
export declare function validarContrasena(contrasena: string): string | null;
export interface UsuarioResumen {
    id: number;
    usuario: string;
    nombre: string;
    correo: string;
    telefono: string;
    rol: RolUsuario;
    rolEtiqueta: string;
    activo: boolean;
    bloqueado: boolean;
    intentosFallidos: number;
    debeCambiarContrasena: boolean;
    ultimoAcceso: string;
    creadoEn: string;
}
export interface SesionUsuario extends UsuarioResumen {
    token: string;
    expiraEn: string;
    permisos: ModuloSistema[];
}
export declare function listarUsuarios(): UsuarioResumen[];
export declare function contarUsuarios(): number;
export interface DatosUsuario {
    usuario: string;
    nombre: string;
    correo: string;
    telefono: string;
    rol: string;
    contrasena: string;
    activo: boolean;
    debeCambiarContrasena?: boolean;
}
export declare function crearUsuario(datos: DatosUsuario): UsuarioResumen;
export declare function actualizarUsuario(id: number, datos: Partial<DatosUsuario>): UsuarioResumen;
export declare function eliminarUsuario(id: number): void;
/** Cambio de contraseña propio: exige la contraseña actual. */
export declare function cambiarContrasena(id: number, contrasenaActual: string, contrasenaNueva: string): UsuarioResumen;
/** Restablece la contraseña de otro usuario y obliga a cambiarla al entrar. */
export declare function restablecerContrasena(id: number, contrasenaNueva: string): UsuarioResumen;
export declare function desbloquearUsuario(id: number): UsuarioResumen;
export interface RegistroBitacora {
    id: number;
    usuario: string;
    exito: boolean;
    motivo: string;
    fecha: string;
}
export declare function obtenerBitacora(limite?: number): RegistroBitacora[];
export declare const HORAS_VALIDEZ_SESION = 12;
export declare function autenticarse(usuario: string, contrasena: string, agente?: string): SesionUsuario;
/** Recupera la sesión activa de una ventana; null si no hay o venció. */
export declare function sesionDeVentana(ventanaId: number): SesionUsuario | null;
export declare function asociarSesion(ventanaId: number, sesion: SesionUsuario): void;
export declare function cerrarSesion(ventanaId: number): boolean;
/** Verifica que la ventana tenga sesión y permiso sobre el módulo del canal. */
export declare function exigirPermiso(ventanaId: number, modulo: string): void;
export interface ResumenUsuarios {
    total: number;
    activos: number;
    inactivos: number;
    bloqueados: number;
    porRol: Array<{
        rol: RolUsuario;
        etiqueta: string;
        total: number;
    }>;
}
export declare function resumenUsuarios(): ResumenUsuarios;
export declare const USUARIO_INICIAL = "admin";
export declare const CONTRASENA_INICIAL = "admin123";
/**
 * Garantiza que exista un administrador con el que entrar por primera vez.
 * Es idempotente: solo crea la cuenta cuando la tabla de usuarios está vacía.
 */
export declare function asegurarAdministradorInicial(): UsuarioResumen | null;
//# sourceMappingURL=usuarios.d.ts.map