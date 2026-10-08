import { app, BrowserWindow, dialog } from "electron";
import { promises as fsPromises } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
// ===== Impresión profesional del comprobante de venta =====
// El ticket ya no se imprime con window.print(): se arma un documento HTML
// independiente (solo el comprobante con la hoja de estilos del sistema) y se
// envía a la impresora desde una ventana oculta. Así la impresión no depende de
// la interfaz abierta, se controla el tamaño exacto del papel y funciona igual
// en térmicas de 80 mm, de 58 mm o en hoja A4.
//
// Notas de la API de Electron:
//   * webContents.print() pide el papel en MICRAS  -> 1 mm = 1000 micras.
//   * webContents.printToPDF() pide el papel en PULGADAS -> 1" = 25,4 mm.
const directorioModulo = path.dirname(fileURLToPath(import.meta.url));
// 1 mm = 1000 micras.
const MICRAS_POR_MM = 1000;
// 1 px CSS = 1/96 in = 264,58 micras: convierte la altura real del ticket.
const MICRAS_POR_PX = 25400 / 96;
// Alto mínimo del rollo para que el corte no quede pegado al pie del ticket.
const ALTO_MINIMO_MM = 40;
// Colchón para que el contenido nunca se parta en dos páginas del rollo.
const COLCHON_ALTO_MM = 2;
// Tiempo máximo de espera del controlador antes de reportar el fallo.
const ESPERA_IMPRESION_MS = 90000;
function enteroEnRango(valor, porDefecto, minimo, maximo) {
    const numero = Number(valor);
    if (!Number.isFinite(numero))
        return porDefecto;
    return Math.min(maximo, Math.max(minimo, Math.round(numero)));
}
function mmAMicras(mm) {
    return Math.round(mm * MICRAS_POR_MM);
}
/**
 * Hoja de estilos del comprobante. Se toma de style.css (la misma que usa la
 * aplicación) para que el ticket impreso sea idéntico al que se ve en pantalla.
 * Se descartan los @import (fuentes web) porque el documento se imprime sin
 * depender de la conexión a internet.
 */
export async function leerEstilosComprobante() {
    try {
        const css = await fsPromises.readFile(path.join(directorioModulo, "..", "renderer", "style.css"), "utf8");
        return css.replace(/@import[^;]*;/g, "");
    }
    catch {
        return "";
    }
}
/**
 * Documento que se manda a la impresora: el comprobante tal como se ve en la
 * aplicación, sin barras, menús ni modales. El bloque final de reglas manda
 * sobre style.css y convierte la hoja en un ticket de ancho fijo.
 */
export function construirDocumentoComprobante(html, estilos, anchoMm, altoMm) {
    const medidaPapel = altoMm && altoMm > 0 ? `${anchoMm}mm ${altoMm}mm` : `${anchoMm}mm auto`;
    // Ajustes finos para rollos angostos (58 mm).
    const ajustesAngostos = anchoMm < 70
        ? `
  .factura-80{font-size:8pt;padding:4mm 3mm}
  .f80-tabla{font-size:7.2pt}
  .f80-tabla thead th{font-size:6.4pt}
  .f80-codigo{font-size:6.2pt}
  .f80-descripcion{font-size:7.2pt}
  .f80-nombre{font-size:11pt}
  .f80-total-grueso .val{font-size:11pt}`
        : "";
    return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<title>Comprobante de venta</title>
<style>${estilos}</style>
<style>
/* Reglas finales: mandan sobre la hoja de estilos de la aplicación y dejan
   únicamente el ticket, a su ancho real y sin sombras ni centrados. */
@page{ size:${medidaPapel}; margin:0 }
html,body{height:auto;margin:0;padding:0;background:#fff}
*{box-sizing:border-box}
body{display:flex;justify-content:flex-start;align-items:flex-start;overflow:hidden}
.factura-80{width:${anchoMm}mm;min-height:0;margin:0;box-shadow:none}${ajustesAngostos}
</style>
</head>
<body>${html}</body>
</html>`;
}
async function abrirDocumentoComprobante(html, anchoMm) {
    const ventana = new BrowserWindow({
        show: false,
        // El ancho real del papel en píxeles CSS, para que la maquetación coincida
        // con lo que verá la impresora.
        width: Math.max(220, Math.round((anchoMm / 25.4) * 96) + 32),
        height: 900,
        webPreferences: {
            backgroundThrottling: false,
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true
        }
    });
    const estilos = await leerEstilosComprobante();
    const ruta = path.join(app.getPath("temp"), `spp-comprobante-${process.pid}-${Date.now()}.html`);
    await fsPromises.writeFile(ruta, construirDocumentoComprobante(html, estilos, anchoMm, null), "utf8");
    const documento = { ventana, ruta, altoPx: 0 };
    try {
        await ventana.loadFile(ruta);
        // Con la maquetación y las fuentes listas, ya se puede medir el ticket.
        await ventana.webContents
            .executeJavaScript("document.fonts && document.fonts.ready ? document.fonts.ready.then(function(){ return true; }) : true")
            .catch(() => true);
        const alto = Number(await ventana.webContents
            .executeJavaScript("Math.ceil(Math.max(document.body.scrollHeight, document.documentElement.scrollHeight) || 0)")
            .catch(() => 0));
        documento.altoPx = Number.isFinite(alto) ? alto : 0;
    }
    catch (error) {
        cerrarDocumentoComprobante(documento);
        throw error;
    }
    return documento;
}
function cerrarDocumentoComprobante(documento) {
    try {
        if (!documento.ventana.isDestroyed())
            documento.ventana.destroy();
    }
    catch {
        // La ventana ya estaba cerrada.
    }
    fsPromises.unlink(documento.ruta).catch(() => {
        // El archivo temporal ya no existe: no hay nada que informar.
    });
}
function mostrarVentanaParaDialogo(ventana) {
    try {
        if (ventana.isDestroyed())
            return;
        ventana.setSkipTaskbar(true);
        ventana.showInactive();
    }
    catch {
        // Si la ventana no se puede mostrar, el diálogo del sistema igual se abre.
    }
}
/**
 * Envía el documento a la impresora y espera el resultado del controlador.
 * `tiempoLimiteMs` evita que la interfaz quede esperando para siempre si el
 * controlador nunca responde (0 = sin límite, para el diálogo de Windows).
 */
function imprimirEnVentana(ventana, opciones, tiempoLimiteMs = 0) {
    return new Promise((resolver) => {
        let respondido = false;
        let temporizador = null;
        const finalizar = (exito, motivo) => {
            if (respondido)
                return;
            respondido = true;
            if (temporizador)
                clearTimeout(temporizador);
            resolver({ exito, motivo });
        };
        if (tiempoLimiteMs > 0) {
            temporizador = setTimeout(() => finalizar(false, "La impresora no respondió a tiempo. Revisa que esté encendida y en línea."), tiempoLimiteMs);
        }
        try {
            ventana.webContents.print(opciones, (exito, motivo) => finalizar(Boolean(exito), motivo || ""));
        }
        catch (error) {
            finalizar(false, error instanceof Error ? error.message : String(error));
        }
    });
}
/** Impresoras instaladas en el sistema, con el nombre que espera Electron. */
export async function listarImpresoras(ventana) {
    if (!ventana || ventana.isDestroyed())
        return [];
    try {
        const equipos = await ventana.webContents.getPrintersAsync();
        return equipos.map((equipo) => {
            const opciones = (equipo.options || {});
            return {
                nombre: equipo.name,
                mostrado: equipo.displayName || equipo.name,
                descripcion: equipo.description || "",
                predeterminada: String(opciones["isDefault"] ?? opciones["is_default"] ?? "") === "true"
            };
        });
    }
    catch {
        return [];
    }
}
/**
 * Imprime el comprobante. Primero con el tamaño exacto del papel (80 mm de
 * ancho por el alto real del ticket); si el controlador no acepta tamaños a
 * medida se usa el rollo predeterminado de la impresora y, como último recurso,
 * se abre el diálogo de impresión de Windows para que el usuario lo resuelva.
 */
export async function imprimirTicket(ventana, opciones) {
    const html = typeof opciones.html === "string" ? opciones.html : "";
    if (!html.trim())
        return { ok: false, mensaje: "No hay comprobante para imprimir." };
    const anchoMm = enteroEnRango(opciones.anchoMm, 80, 40, 300);
    const copias = enteroEnRango(opciones.copias, 1, 1, 50);
    const silencioso = opciones.silencioso !== false;
    const altoFijoMm = Number(opciones.altoMm) > 0 ? enteroEnRango(opciones.altoMm, 297, 40, 2000) : null;
    const impresoras = await listarImpresoras(ventana);
    if (impresoras.length === 0) {
        return {
            ok: false,
            mensaje: "Windows no reporta impresoras instaladas. Puedes guardar el comprobante en PDF."
        };
    }
    const nombreImpresora = String(opciones.impresora || "").trim();
    const destinoExiste = impresoras.some((equipo) => equipo.nombre === nombreImpresora);
    let documento = null;
    try {
        documento = await abrirDocumentoComprobante(html, anchoMm);
        const altoMedidoMm = Math.max(ALTO_MINIMO_MM, Math.round((documento.altoPx * MICRAS_POR_PX) / MICRAS_POR_MM) + COLCHON_ALTO_MM);
        const altoMm = altoFijoMm || altoMedidoMm;
        const base = {
            silent: silencioso,
            printBackground: true,
            color: false,
            landscape: false,
            margins: { marginType: "none" },
            copies: copias
        };
        if (destinoExiste)
            base.deviceName = nombreImpresora;
        const detalleCopias = copias > 1 ? ` (${copias} copias)` : "";
        const destino = nombreImpresora || "la impresora predeterminada de Windows";
        // Con el diálogo del sistema, el usuario decide impresora y papel.
        if (!silencioso) {
            mostrarVentanaParaDialogo(documento.ventana);
            const manual = await imprimirEnVentana(documento.ventana, Object.assign({}, base, { silent: false, usePrinterDefaultPageSize: true }));
            return manual.exito
                ? { ok: true, mensaje: `Comprobante enviado${detalleCopias}.` }
                : { ok: false, mensaje: manual.motivo || "La impresión se canceló." };
        }
        let resultado = await imprimirEnVentana(documento.ventana, Object.assign({}, base, { pageSize: { width: mmAMicras(anchoMm), height: mmAMicras(altoMm) } }), ESPERA_IMPRESION_MS);
        if (!resultado.exito) {
            resultado = await imprimirEnVentana(documento.ventana, Object.assign({}, base, { usePrinterDefaultPageSize: true }), ESPERA_IMPRESION_MS);
        }
        if (!resultado.exito) {
            mostrarVentanaParaDialogo(documento.ventana);
            resultado = await imprimirEnVentana(documento.ventana, Object.assign({}, base, { silent: false, usePrinterDefaultPageSize: true }));
        }
        if (resultado.exito)
            return { ok: true, mensaje: `Comprobante enviado a ${destino}${detalleCopias}.` };
        return {
            ok: false,
            mensaje: resultado.motivo || "La impresora rechazó el trabajo. Verifica que esté encendida y con papel."
        };
    }
    catch (error) {
        return {
            ok: false,
            mensaje: error instanceof Error ? error.message : "Error inesperado al imprimir el comprobante."
        };
    }
    finally {
        if (documento)
            cerrarDocumentoComprobante(documento);
    }
}
/**
 * Imprime un reporte profesional A4 generado de forma independiente al renderer.
 * No utiliza window.print(): Electron crea una ventana de documento aislada y
 * webContents.print() envía el trabajo al sistema de impresión de Windows.
 */
export async function imprimirDocumentoA4(ventana, html, nombreDocumento = "Reporte SmartPosPro") {
    if (!html.trim())
        return { ok: false, mensaje: "No hay reporte para imprimir." };
    if (!ventana || ventana.isDestroyed())
        return { ok: false, mensaje: "La ventana principal no está disponible." };
    const documento = new BrowserWindow({
        show: false,
        width: 1000,
        height: 900,
        webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: false }
    });
    const ruta = path.join(app.getPath("temp"), `spp-reporte-${process.pid}-${Date.now()}.html`);
    try {
        const documentoHtml = html.replace(/<head>/i, `<head><meta name="viewport" content="width=device-width, initial-scale=1"><style>@page{size:A4 portrait;margin:14mm 13mm}html,body{background:#fff!important}body{-webkit-print-color-adjust:exact;print-color-adjust:exact}</style>`);
        await fsPromises.writeFile(ruta, documentoHtml, "utf8");
        await documento.loadFile(ruta);
        await documento.webContents.executeJavaScript("document.fonts && document.fonts.ready ? document.fonts.ready.then(function(){return true}) : true").catch(() => true);
        mostrarVentanaParaDialogo(documento);
        const resultado = await imprimirEnVentana(documento, {
            silent: false,
            printBackground: true,
            color: true,
            landscape: false,
            pageSize: { width: 210000, height: 297000 },
            margins: { marginType: "none" }
        });
        if (resultado.exito)
            return { ok: true, mensaje: `${nombreDocumento} enviado a impresión.` };
        return { ok: false, cancelado: /cancel/i.test(resultado.motivo), mensaje: resultado.motivo || "La impresión fue cancelada." };
    }
    catch (error) {
        return { ok: false, mensaje: error instanceof Error ? error.message : "No se pudo preparar el reporte para imprimir." };
    }
    finally {
        try {
            if (!documento.isDestroyed())
                documento.destroy();
        }
        catch { }
        fsPromises.unlink(ruta).catch(() => { });
    }
}
/**
 * Exporta el comprobante a PDF con el mismo diseño y ancho de papel.
 * `rutaDestino` lo usan las pruebas automatizadas: la aplicación siempre pasa
 * por el diálogo "Guardar como".
 */
export async function guardarComprobantePDF(ventana, opciones, rutaDestino) {
    const html = typeof opciones.html === "string" ? opciones.html : "";
    if (!html.trim())
        return { ok: false, mensaje: "No hay comprobante para exportar." };
    const anchoMm = enteroEnRango(opciones.anchoMm, 80, 40, 300);
    const altoFijoMm = Number(opciones.altoMm) > 0 ? enteroEnRango(opciones.altoMm, 297, 40, 2000) : null;
    // Se pregunta primero dónde guardar para no generar un PDF que nadie pidió.
    let destino = String(rutaDestino || "").trim();
    if (!destino) {
        const opcionesDialogo = {
            title: "Guardar comprobante en PDF",
            defaultPath: String(opciones.nombreArchivo || "comprobante.pdf"),
            filters: [{ name: "Documento PDF", extensions: ["pdf"] }]
        };
        const respuesta = ventana
            ? await dialog.showSaveDialog(ventana, opcionesDialogo)
            : await dialog.showSaveDialog(opcionesDialogo);
        if (respuesta.canceled || !respuesta.filePath)
            return { ok: false, cancelado: true };
        destino = respuesta.filePath;
    }
    let documento = null;
    try {
        documento = await abrirDocumentoComprobante(html, anchoMm);
        const altoMedidoMm = Math.max(ALTO_MINIMO_MM, Math.round((documento.altoPx * MICRAS_POR_PX) / MICRAS_POR_MM) + COLCHON_ALTO_MM);
        const altoMm = altoFijoMm || altoMedidoMm;
        // printToPDF mide el papel en pulgadas (print() lo mide en micras).
        const pdf = await documento.ventana.webContents.printToPDF({
            landscape: false,
            printBackground: true,
            preferCSSPageSize: false,
            margins: { top: 0, bottom: 0, left: 0, right: 0 },
            pageSize: { width: anchoMm / 25.4, height: altoMm / 25.4 }
        });
        await fsPromises.writeFile(destino, pdf);
        return { ok: true, ruta: destino, mensaje: `PDF guardado en ${destino}` };
    }
    catch (error) {
        return {
            ok: false,
            mensaje: error instanceof Error ? error.message : "No se pudo generar el PDF del comprobante."
        };
    }
    finally {
        if (documento)
            cerrarDocumentoComprobante(documento);
    }
}
//# sourceMappingURL=impresion.js.map