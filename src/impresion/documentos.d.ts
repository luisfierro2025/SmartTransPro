import type { SeccionReporte } from "../reportes/reportes-impresion.js";
export interface DefinicionDocumento {
    id: string;
    etiqueta: string;
    descripcion: string;
    grupo: "Resumen" | "Ventas" | "Cartera" | "Inventario";
    secciones: SeccionReporte[];
    titulo: string;
    /** Ajustes que el documento impone; el usuario puede variarlos. */
    sugerido: {
        tipoPago?: "todos" | "contado" | "credito";
        detalleArticulos?: boolean;
        firmas?: boolean;
    };
    /** El documento ignora el rango de fechas (son saldos del día). */
    ignoraPeriodo?: boolean;
    /** Nombre sugerido al exportar a PDF (sin extensión). */
    archivo: string;
}
export declare const DOCUMENTOS: readonly DefinicionDocumento[];
export declare const GRUPOS_DOCUMENTOS: readonly ["Resumen", "Ventas", "Cartera", "Inventario"];
/** Documento completo, con todas sus secciones (así es como se imprimía antes). */
export declare const DOCUMENTO_GENERAL: DefinicionDocumento;
/** Busca un documento por id; si no existe devuelve el reporte completo. */
export declare function obtenerDocumento(id: string | null | undefined): DefinicionDocumento;
/**
 * Fusiona la definición del documento con lo que el usuario eligió en pantalla.
 * El documento pone la base (secciones y título) y la pantalla añade filtros,
 * observaciones o firmas; las secciones nunca se agregan por accidente.
 */
export declare function resolverOpciones(documentoId: string | null | undefined, opciones?: {
    titulo?: string;
    observaciones?: string;
    tipoPago?: string;
    busqueda?: string;
    detalleArticulos?: boolean;
    firmas?: boolean;
    acento?: string;
}): {
    secciones: ("cartera" | "categorias" | "cobrar" | "criticos" | "inventario" | "porDia" | "resumen" | "topClientes" | "topProductos" | "ventas")[];
    titulo: string;
    observaciones: string;
    tipoPago: "contado" | "credito" | "todos";
    busqueda: string;
    detalleArticulos: boolean;
    firmas: boolean;
    acento: string;
};
//# sourceMappingURL=documentos.d.ts.map