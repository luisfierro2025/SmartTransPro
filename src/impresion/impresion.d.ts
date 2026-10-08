import { BrowserWindow } from "electron";
export interface OpcionesImpresionTicket {
    html: string;
    impresora?: string;
    copias?: number;
    anchoMm?: number;
    altoMm?: number | null;
    silencioso?: boolean;
    nombreArchivo?: string;
}
export interface ImpresoraDisponible {
    nombre: string;
    mostrado: string;
    descripcion: string;
    predeterminada: boolean;
}
export interface ResultadoImpresion {
    ok: boolean;
    mensaje?: string;
    cancelado?: boolean;
    ruta?: string;
}
/**
 * Hoja de estilos del comprobante. Se toma de style.css (la misma que usa la
 * aplicación) para que el ticket impreso sea idéntico al que se ve en pantalla.
 * Se descartan los @import (fuentes web) porque el documento se imprime sin
 * depender de la conexión a internet.
 */
export declare function leerEstilosComprobante(): Promise<string>;
/**
 * Documento que se manda a la impresora: el comprobante tal como se ve en la
 * aplicación, sin barras, menús ni modales. El bloque final de reglas manda
 * sobre style.css y convierte la hoja en un ticket de ancho fijo.
 */
export declare function construirDocumentoComprobante(html: string, estilos: string, anchoMm: number, altoMm: number | null): string;
/** Impresoras instaladas en el sistema, con el nombre que espera Electron. */
export declare function listarImpresoras(ventana: BrowserWindow | null): Promise<ImpresoraDisponible[]>;
/**
 * Imprime el comprobante. Primero con el tamaño exacto del papel (80 mm de
 * ancho por el alto real del ticket); si el controlador no acepta tamaños a
 * medida se usa el rollo predeterminado de la impresora y, como último recurso,
 * se abre el diálogo de impresión de Windows para que el usuario lo resuelva.
 */
export declare function imprimirTicket(ventana: BrowserWindow | null, opciones: OpcionesImpresionTicket): Promise<ResultadoImpresion>;
/**
 * Imprime un reporte profesional A4 generado de forma independiente al renderer.
 * No utiliza window.print(): Electron crea una ventana de documento aislada y
 * webContents.print() envía el trabajo al sistema de impresión de Windows.
 */
export declare function imprimirDocumentoA4(ventana: BrowserWindow | null, html: string, nombreDocumento?: string): Promise<ResultadoImpresion>;
/**
 * Exporta el comprobante a PDF con el mismo diseño y ancho de papel.
 * `rutaDestino` lo usan las pruebas automatizadas: la aplicación siempre pasa
 * por el diálogo "Guardar como".
 */
export declare function guardarComprobantePDF(ventana: BrowserWindow | null, opciones: OpcionesImpresionTicket, rutaDestino?: string): Promise<ResultadoImpresion>;
//# sourceMappingURL=impresion.d.ts.map