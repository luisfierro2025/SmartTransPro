import { BrowserWindow } from "electron";
import { type ResultadoImpresion } from "../impresion/impresion.js";
export declare const SECCIONES_REPORTE: readonly ["resumen", "ventas", "porDia", "topProductos", "categorias", "topClientes", "cartera", "cobrar", "criticos", "inventario"];
export type SeccionReporte = (typeof SECCIONES_REPORTE)[number];
export interface OpcionesReporte {
    secciones?: string[];
    titulo?: string;
    observaciones?: string;
    tipoPago?: string;
    busqueda?: string;
    detalleArticulos?: boolean;
    firmas?: boolean;
    acento?: string;
}
type ModoDocumento = "impresion" | "pantalla" | "pdf";
/**
 * Documento HTML completo del reporte, ya filtrado por `desde`/`hasta` y limitado a las
 * secciones elegidas. `modo` ajusta la paginación: "impresion" agrega numeración de página con
 * @page, "pdf" la deja al pie de Chromium (footerTemplate) y "pantalla" es la vista previa.
 */
export declare function generarReporteImprimibleHTML(desde: string, hasta: string, opciones?: OpcionesReporte, modo?: ModoDocumento): string;
/** Envía el reporte a la impresora (diálogo de impresión del sistema, hoja A4). */
export declare function imprimirReporte(ventana: BrowserWindow | null, desde: string, hasta: string, opciones?: OpcionesReporte): Promise<ResultadoImpresion>;
/**
 * Guarda el reporte como PDF A4 con numeración "Página X de Y" y pide la ruta al
 * usuario. `nombreArchivo` define el nombre sugerido (sin extensión).
 */
export declare function exportarReportePDF(ventana: BrowserWindow | null, desde: string, hasta: string, opciones?: OpcionesReporte, nombreSugerido?: string): Promise<ResultadoImpresion>;
export {};
//# sourceMappingURL=reportes-impresion.d.ts.map