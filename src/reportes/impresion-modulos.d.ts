import { BrowserWindow } from "electron";
import { type ResultadoImpresion } from "../impresion/impresion.js";
export type ModuloImprimible = "clientes" | "productos";
export type ModoImpresionModulo = "pantalla" | "impresion" | "pdf";
export interface OpcionesImpresionModulo {
    filtro?: string;
    busqueda?: string;
    umbralStock?: number;
    categoria?: string;
}
/** Construye la vista previa y la hoja final con los mismos datos y filtros. */
export declare function generarHTMLImpresionModulo(modulo: ModuloImprimible, opciones?: OpcionesImpresionModulo, modo?: ModoImpresionModulo): string;
export declare function imprimirReporteModulo(ventana: BrowserWindow | null, modulo: ModuloImprimible, opciones?: OpcionesImpresionModulo): Promise<ResultadoImpresion>;
export declare function exportarReporteModuloPDF(ventana: BrowserWindow | null, modulo: ModuloImprimible, opciones?: OpcionesImpresionModulo): Promise<ResultadoImpresion>;
//# sourceMappingURL=impresion-modulos.d.ts.map