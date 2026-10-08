export interface ConfigWhatsApp {
    habilitado: boolean;
    numero: string;
    token: string;
    modoSimulacion: boolean;
    mensajeBienvenida: string;
    mensajeCierre: string;
    companyName: string;
    moneda: string;
    pais: string;
}
export interface DetalleVenta {
    cantidad: number;
    nombre: string;
    precio: number;
    subtotal?: number;
}
export interface Venta {
    id: number;
    detalles: DetalleVenta[];
    subtotal: number;
    descuento?: number;
    impuesto: number;
    impuestoPct?: number;
    total: number;
    fecha: string;
    clienteNombre?: string;
}
export interface Cliente {
    nombre: string;
}
export interface Producto {
    nombre: string;
    precio: number;
    stock: number;
}
export declare const VALORES_WHATSAPP: ConfigWhatsApp;
export declare function limpiarToken(valor: string | undefined | null): string;
export declare function esTokenValido(valor: string | undefined | null): boolean;
export declare function obtenerPaisDefecto(): string;
export declare function normalizarTelefonoWhatsApp(valor: string | undefined | null, pais?: string): string;
export declare function describirErrorApi(data: any, httpStatus?: number): string;
export declare function guardarConfig(clave: string, valor: string): void;
export declare function obtenerConfigActual(): ConfigWhatsApp;
export declare function loguearEnvio(tipo: string, destinatario: string, resultado: string, mensaje: string | null, respuestaApi: string | null): {
    id: number;
};
export declare function validarConfig(config: ConfigWhatsApp): {
    ok: boolean;
    error: string;
} | {
    error?: never;
    ok: boolean;
};
export declare function plantillaTicket(venta: Venta, config: ConfigWhatsApp): string;
export declare function plantillaRecordatorio(cliente: Cliente, saldo: number, config: ConfigWhatsApp): string;
export declare function plantillaCatalogo(productos: Producto[], config: ConfigWhatsApp): string;
export declare function testConexionReal(): Promise<{
    ok: boolean;
    mensaje: string;
}>;
export declare function enviarTicketWhatsApp(ventaId: number, numero: string): Promise<{
    ok: boolean;
    resultado: string;
}>;
export declare function enviarRecordatorioCreditoWhatsApp(clienteId: number, numero: string): Promise<{
    ok: boolean;
    resultado: string;
}>;
export declare function enviarCatalogoWhatsApp(numero: string): Promise<{
    ok: boolean;
    resultado: string;
}>;
export declare function enviarMensajeLibreWhatsApp(numero: string, mensaje: string): Promise<{
    ok: boolean;
    resultado: string;
}>;
export declare function guardarTokenValidado(token: string): Promise<{
    ok: boolean;
    advertencia?: string;
    error?: string;
}>;
export declare function obtenerHistorialWhatsApp(limit?: number): Array<{
    id: number;
    tipo: string;
    destinatario: string;
    resultado: string;
    mensaje: string | null;
    respuesta_api: string | null;
    creado: string;
}>;
export declare function obtenerHistorialPorClienteWhatsApp(clienteId: number): {
    id: number;
    tipo: string;
    destinatario: string;
    resultado: string;
    mensaje: string | null;
    respuesta_api: string | null;
    creado: string;
}[];
export declare function obtenerEstadisticasWhatsApp(): {
    total_envios: any;
    enviados_exitosamente: any;
    fallidos: any;
    envios_hoy: any;
    tipos_mas_usados: {
        tipo: string;
        total: number;
    }[];
};
//# sourceMappingURL=whatsapp.d.ts.map