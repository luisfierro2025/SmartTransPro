import { BrowserWindow } from "electron";
import { type ResultadoImpresion } from "./impresion.js";
import { type OpcionesReporte } from "../reportes/reportes-impresion.js";
import { obtenerDocumento, resolverOpciones, DOCUMENTOS, GRUPOS_DOCUMENTOS } from "./documentos.js";
export { DOCUMENTOS, GRUPOS_DOCUMENTOS, obtenerDocumento, resolverOpciones };
export type { OpcionesReporte };
/** Catálogo listo para la interfaz: los grupos con sus documentos y filtros. */
export declare function listarDocumentos(): {
    grupo: "Cartera" | "Inventario" | "Resumen" | "Ventas";
    documentos: {
        id: string;
        etiqueta: string;
        descripcion: string;
        secciones: ("cartera" | "categorias" | "cobrar" | "criticos" | "inventario" | "porDia" | "resumen" | "topClientes" | "topProductos" | "ventas")[];
        ignoraPeriodo: boolean;
        sugerido: {
            tipoPago?: "todos" | "contado" | "credito";
            detalleArticulos?: boolean;
            firmas?: boolean;
        };
    }[];
}[];
/** HTML del documento para la vista previa dentro de la pantalla. */
export declare function vistaPreviaDocumento(documentoId: string, desde: string, hasta: string, opciones?: Partial<OpcionesReporte>): string;
/**
 * Imprime un documento del catálogo. Si el id no existe en el catálogo se imprime
 * el reporte completo, que es lo que pasaba antes de este catálogo.
 */
export declare function imprimirDocumento(ventana: BrowserWindow | null, documentoId: string, desde: string, hasta: string, opciones?: Partial<OpcionesReporte>): Promise<ResultadoImpresion>;
/**
 * Guarda un documento del catálogo como PDF A4 con pie de página.
 * Se reconstruye aquí el guardado (en vez de llamar a exportarReportePDF) para
 * poder anteponer el nombre del documento al nombre del archivo que se ofrece.
 */
export declare function exportarDocumentoPDF(ventana: BrowserWindow | null, documentoId: string, desde: string, hasta: string, opciones?: Partial<OpcionesReporte>): Promise<ResultadoImpresion>;
//# sourceMappingURL=documento-servicio.d.ts.map