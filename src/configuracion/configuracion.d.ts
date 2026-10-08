export interface ConfigNegocio {
    nombre: string;
    ruc: string;
    direccion: string;
    telefono: string;
    moneda: string;
    impuesto: number;
    stockMinimo: number;
    pieTicket: string;
    tema: "corporativo" | "ejecutivo" | "codigo";
}
export declare class ConfiguracionError extends Error {
    constructor(message: string);
}
export declare const VALORES_POR_DEFECTO: ConfigNegocio;
export declare function obtenerConfiguracion(): ConfigNegocio;
export declare function guardarConfiguracion(cambios: Partial<ConfigNegocio>): ConfigNegocio;
export declare function restablecerConfiguracion(): ConfigNegocio;
export declare function formatearMoneda(monto: number): string;
//# sourceMappingURL=configuracion.d.ts.map