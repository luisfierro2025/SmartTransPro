// =====================================================================================
// Servicio de documentos: une el CATÁLOGO (qué se imprime) con el MOTOR (cómo se
// arma la hoja). Vive aparte de los dos para que cada pieza se pueda reutilizar y
// probar por separado:
//
//   documentos.ts          -> qué documentos existen y qué secciones traen
//   reportes-impresion.ts  -> cómo se convierte una combinación de secciones en HTML
//   documento-servicio.ts  -> la vista previa, la impresión y el PDF de un documento
//
// Agregar un documento nuevo = agregar una entrada en `documentos.ts`. Ni el menú
// ni el motor de impresión necesitan cambios.
// =====================================================================================
import { app, BrowserWindow, dialog } from "electron";
import { promises as fsPromises } from "node:fs";
import path from "node:path";
import { obtenerConfiguracion } from "../configuracion/configuracion.js";
import { imprimirDocumentoA4 } from "./impresion.js";
import { generarReporteImprimibleHTML } from "../reportes/reportes-impresion.js";
import { obtenerDocumento, resolverOpciones, DOCUMENTOS, GRUPOS_DOCUMENTOS } from "./documentos.js";
export { DOCUMENTOS, GRUPOS_DOCUMENTOS, obtenerDocumento, resolverOpciones };
/** Catálogo listo para la interfaz: los grupos con sus documentos y filtros. */
export function listarDocumentos() {
    return GRUPOS_DOCUMENTOS.map((grupo) => ({
        grupo,
        documentos: DOCUMENTOS.filter((d) => d.grupo === grupo).map((d) => ({
            id: d.id,
            etiqueta: d.etiqueta,
            descripcion: d.descripcion,
            secciones: d.secciones,
            ignoraPeriodo: d.ignoraPeriodo === true,
            sugerido: d.sugerido
        }))
    }));
}
/** HTML del documento para la vista previa dentro de la pantalla. */
export function vistaPreviaDocumento(documentoId, desde, hasta, opciones) {
    return generarReporteImprimibleHTML(desde, hasta, resolverOpciones(documentoId, opciones), "pantalla");
}
/**
 * Imprime un documento del catálogo. Si el id no existe en el catálogo se imprime
 * el reporte completo, que es lo que pasaba antes de este catálogo.
 */
export function imprimirDocumento(ventana, documentoId, desde, hasta, opciones) {
    const doc = obtenerDocumento(documentoId);
    const html = generarReporteImprimibleHTML(desde, hasta, resolverOpciones(doc.id, opciones), "impresion");
    return imprimirDocumentoA4(ventana, html, doc.etiqueta);
}
/**
 * Guarda un documento del catálogo como PDF A4 con pie de página.
 * Se reconstruye aquí el guardado (en vez de llamar a exportarReportePDF) para
 * poder anteponer el nombre del documento al nombre del archivo que se ofrece.
 */
export async function exportarDocumentoPDF(ventana, documentoId, desde, hasta, opciones) {
    if (!ventana || ventana.isDestroyed())
        return { ok: false, mensaje: "La ventana principal no está disponible." };
    const doc = obtenerDocumento(documentoId);
    const negocio = obtenerConfiguracion();
    const destino = await dialog.showSaveDialog(ventana, {
        title: `Guardar ${doc.etiqueta} en PDF`,
        defaultPath: `${doc.archivo}.pdf`,
        filters: [{ name: "Documento PDF", extensions: ["pdf"] }]
    });
    if (destino.canceled || !destino.filePath)
        return { ok: true, cancelado: true };
    const documento = new BrowserWindow({ show: false, webPreferences: { offscreen: true } });
    const ruta = path.join(app.getPath("temp"), `spp-doc-${process.pid}-${Date.now()}.html`);
    try {
        await fsPromises.writeFile(ruta, generarReporteImprimibleHTML(desde, hasta, resolverOpciones(doc.id, opciones), "pdf"), "utf8");
        await documento.loadFile(ruta);
        const pie = `<div style="width:100%;padding:0 13mm;font:8px 'Segoe UI',Arial,sans-serif;color:#64748b;display:flex;justify-content:space-between"><span>${negocio.nombre || "SmartPosPro"} · ${doc.etiqueta}</span><span>Página <span class="pageNumber"></span> de <span class="totalPages"></span></span></div>`;
        const pdf = await documento.webContents.printToPDF({
            landscape: false,
            displayHeaderFooter: true,
            printBackground: true,
            preferCSSPageSize: false,
            headerTemplate: "<span></span>",
            footerTemplate: pie,
            margins: { top: 0, bottom: 0, left: 0, right: 0 },
            pageSize: { width: 210 / 25.4, height: 297 / 25.4 }
        });
        await fsPromises.writeFile(destino.filePath, pdf);
        return { ok: true, ruta: destino.filePath, mensaje: `${doc.etiqueta} guardado en ${destino.filePath}` };
    }
    catch (error) {
        return {
            ok: false,
            mensaje: error instanceof Error ? error.message : `No se pudo generar el PDF de ${doc.etiqueta}.`
        };
    }
    finally {
        try {
            if (!documento.isDestroyed())
                documento.destroy();
        }
        catch { /* nada que hacer */ }
        fsPromises.unlink(ruta).catch(() => { });
    }
}
//# sourceMappingURL=documento-servicio.js.map