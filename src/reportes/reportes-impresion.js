import { app, BrowserWindow, dialog } from "electron";
import { promises as fsPromises } from "node:fs";
import path from "node:path";
import { obtenerConfiguracion } from "../configuracion/configuracion.js";
import { imprimirDocumentoA4 } from "../impresion/impresion.js";
import { reporteCompleto, ventasDetalle, cuentasPorCobrarDetalle } from "./reportes.js";
// =====================================================================================
// Documento imprimible del módulo de Reportes (hoja A4).
//
// El usuario elige QUÉ secciones se incluyen (resumen, listado de ventas, ventas por día,
// productos, categorías, clientes, cartera, stock crítico, inventario), el título, las
// observaciones, el filtro de forma de pago y si se imprime el detalle de artículos o las
// líneas de firma. Los mismos datos (reporteCompleto / ventasDetalle) alimentan:
//   - la vista previa en pantalla          -> generarReporteImprimibleHTML(..., "pantalla")
//   - la impresión directa                 -> imprimirReporte()
//   - la exportación a PDF                 -> exportarReportePDF()
// así que lo que se ve en la vista previa es exactamente lo que sale en papel o en PDF.
// =====================================================================================
export const SECCIONES_REPORTE = ["resumen", "ventas", "porDia", "topProductos", "categorias", "topClientes", "cartera", "cobrar", "criticos", "inventario"];
function escaparHtml(valor) {
    return String(valor ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
function formatoMoneda(valor, moneda) {
    const texto = (Number(valor) || 0).toLocaleString("es-NI", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return escaparHtml(moneda || "C$") + "&nbsp;" + texto;
}
function formatoFechaLarga(iso) {
    if (!iso)
        return "—";
    const [anio, mes, dia] = iso.split("-").map((n) => parseInt(n, 10));
    if (!anio || !mes || !dia)
        return escaparHtml(iso);
    return escaparHtml(new Date(anio, mes - 1, dia).toLocaleDateString("es-NI", { day: "2-digit", month: "long", year: "numeric" }));
}
function fechaCorta(f) {
    const m = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?/.exec(f || "");
    if (!m)
        return escaparHtml(f);
    return `${m[3]}/${m[2]}/${m[1]}` + (m[4] ? ` ${m[4]}:${m[5]}` : "");
}
function generadoEl() {
    return escaparHtml(new Date().toLocaleString("es-NI", { day: "2-digit", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" }));
}
function barra(pct) {
    return `<span class="bar"><i style="width:${Math.max(0, Math.min(100, Number(pct) || 0)).toFixed(1)}%"></i></span>`;
}
function insignia(tipo) {
    return tipo === "credito" ? '<span class="pg cr">Crédito</span>' : '<span class="pg co">Contado</span>';
}
function tabla(cols, filas, pie = "") {
    const cabecera = cols.map((c) => `<th${c.n ? ' class="n"' : ""}>${escaparHtml(c.t)}</th>`).join("");
    const cuerpo = filas.map((f) => "<tr>" + f.map((c, i) => `<td${cols[i]?.n ? ' class="n"' : ""}>${c}</td>`).join("") + "</tr>").join("");
    return `<table><thead><tr>${cabecera}</tr></thead><tbody>${cuerpo}</tbody>${pie ? `<tfoot>${pie}</tfoot>` : ""}</table>`;
}
function seccion(n, titulo, sub, cuerpo, evitarCorte = false) {
    return `<section class="sec${evitarCorte ? " ev" : ""}"><h3><b>${String(n).padStart(2, "0")}</b>${escaparHtml(titulo)}${sub ? `<small>${escaparHtml(sub)}</small>` : ""}</h3>${cuerpo}</section>`;
}
const vacio = (texto) => `<p class="vacio">${escaparHtml(texto)}</p>`;
/** Normaliza las opciones recibidas por IPC: solo secciones válidas, en el orden fijo del documento. */
function normalizar(opciones) {
    const pedidas = Array.isArray(opciones?.secciones) ? opciones.secciones : [];
    let secciones = SECCIONES_REPORTE.filter((s) => pedidas.includes(s));
    if (secciones.length === 0)
        secciones = [...SECCIONES_REPORTE];
    const tipoPago = opciones?.tipoPago === "contado" || opciones?.tipoPago === "credito" ? opciones.tipoPago : "todos";
    const acento = typeof opciones?.acento === "string" && /^#[0-9a-f]{6}$/i.test(opciones.acento) ? opciones.acento : "#1d4ed8";
    return {
        secciones,
        tipoPago,
        acento,
        titulo: String(opciones?.titulo || "").trim().slice(0, 80) || "Reporte de ventas y gestión",
        observaciones: String(opciones?.observaciones || "").trim().slice(0, 600),
        busqueda: String(opciones?.busqueda || "").trim().slice(0, 60),
        detalleArticulos: opciones?.detalleArticulos === true,
        firmas: opciones?.firmas === true
    };
}
/**
 * Documento HTML completo del reporte, ya filtrado por `desde`/`hasta` y limitado a las
 * secciones elegidas. `modo` ajusta la paginación: "impresion" agrega numeración de página con
 * @page, "pdf" la deja al pie de Chromium (footerTemplate) y "pantalla" es la vista previa.
 */
export function generarReporteImprimibleHTML(desde, hasta, opciones, modo = "impresion") {
    const negocio = obtenerConfiguracion();
    const o = normalizar(opciones);
    const r = reporteCompleto(desde, hasta);
    const moneda = r.moneda || negocio.moneda || "C$";
    const mon = (v) => formatoMoneda(v, moneda);
    const nombre = negocio.nombre || "Negocio";
    const incluye = (s) => o.secciones.includes(s);
    const periodo = desde || hasta ? `Del ${formatoFechaLarga(desde)} al ${formatoFechaLarga(hasta)}` : "Histórico completo";
    const partes = [];
    let n = 0;
    if (incluye("resumen")) {
        const tot = r.resumen.total || 0;
        const pctCredito = tot > 0 ? (r.resumen.credito / tot) * 100 : 0;
        const kpis = [
            ["Facturado", mon(r.resumen.total), "dest"], ["Ventas", String(r.resumen.ventas), ""], ["Ticket promedio", mon(r.resumen.ticketPromedio), ""], ["Artículos vendidos", String(r.resumen.articulos), ""],
            ["Ventas de contado", mon(r.resumen.contado), ""], ["Ventas a crédito", mon(r.resumen.credito), ""], [`Abonos cobrados (${r.abonos.cantidad})`, mon(r.abonos.total), ""], ["Utilidad estimada", `${mon(r.utilidad.utilidad)}<em>${r.utilidad.margen}% de margen</em>`, ""]
        ];
        const cuerpo = `<div class="kpis">${kpis.map(([e, v, c]) => `<div class="kpi ${c}"><span>${escaparHtml(e)}</span><strong>${v}</strong></div>`).join("")}</div>
      <div class="mezcla"><div class="mezcla-barra"><i style="width:${(100 - pctCredito).toFixed(1)}%"></i></div><p><b class="pt co"></b>Contado ${(100 - pctCredito).toFixed(0)}%<b class="pt cr"></b>Crédito ${pctCredito.toFixed(0)}%</p></div>`;
        partes.push(seccion(++n, "Resumen ejecutivo", "", cuerpo, true));
    }
    if (incluye("ventas")) {
        const lista = ventasDetalle(desde, hasta, o.tipoPago, o.busqueda);
        const total = lista.reduce((s, v) => s + v.total, 0);
        const articulos = lista.reduce((s, v) => s + v.articulos, 0);
        const contado = lista.filter((v) => v.tipoPago !== "credito").reduce((s, v) => s + v.total, 0);
        const filtros = [o.tipoPago !== "todos" ? `Pago: ${o.tipoPago === "credito" ? "crédito" : "contado"}` : "", o.busqueda ? `Búsqueda: “${o.busqueda}”` : ""].filter(Boolean).join(" · ");
        let cuerpo;
        if (lista.length === 0)
            cuerpo = vacio("No hay ventas que coincidan con el período y los filtros elegidos.");
        else {
            const cols = [{ t: "Factura" }, { t: "Fecha" }, { t: "Cliente" }, { t: "Pago" }, { t: "Arts.", n: true }, { t: "Total", n: true }];
            const cabecera = cols.map((c) => `<th${c.n ? ' class="n"' : ""}>${escaparHtml(c.t)}</th>`).join("");
            const filas = lista.map((v) => {
                let fila = `<tr><td><b>${escaparHtml(v.numero)}</b></td><td>${fechaCorta(v.fecha)}</td><td>${escaparHtml(v.cliente)}</td><td>${insignia(v.tipoPago)}</td><td class="n">${v.articulos}</td><td class="n">${mon(v.total)}</td></tr>`;
                if (o.detalleArticulos && v.items.length > 0) {
                    fila += `<tr class="det"><td></td><td colspan="5"><table class="items">${v.items.map((i) => `<tr><td>${escaparHtml(i.nombre)}</td><td class="n">${i.cantidad} × ${mon(i.precio)}</td><td class="n">${mon(i.subtotal)}</td></tr>`).join("")}</table></td></tr>`;
                }
                return fila;
            });
            const pie = `<tr><td colspan="4">Total · ${lista.length} venta(s) · contado ${mon(contado)} · crédito ${mon(total - contado)}</td><td class="n">${articulos}</td><td class="n">${mon(total)}</td></tr>`;
            cuerpo = `<table><thead><tr>${cabecera}</tr></thead><tbody>${filas.join("")}</tbody><tfoot>${pie}</tfoot></table>`;
        }
        partes.push(seccion(++n, "Listado de ventas", filtros, cuerpo));
    }
    if (incluye("porDia")) {
        const dias = [...r.porDia].reverse();
        const max = Math.max(1, ...dias.map((d) => d.total));
        const cuerpo = dias.length === 0 ? vacio("No hay ventas en el período seleccionado.") : tabla([{ t: "Día" }, { t: "Ventas", n: true }, { t: "Total", n: true }, { t: "Crédito", n: true }, { t: "Participación" }], dias.map((d) => [formatoFechaLarga(d.dia), String(d.ventas), mon(d.total), mon(d.credito), barra((d.total / max) * 100)]), `<tr><td>Total</td><td class="n">${dias.reduce((s, d) => s + d.ventas, 0)}</td><td class="n">${mon(dias.reduce((s, d) => s + d.total, 0))}</td><td class="n">${mon(dias.reduce((s, d) => s + d.credito, 0))}</td><td></td></tr>`);
        partes.push(seccion(++n, "Ventas por día", `${dias.length} día(s) con movimiento`, cuerpo));
    }
    if (incluye("topProductos")) {
        const cuerpo = r.topProductos.length === 0 ? vacio("Sin ventas en el período seleccionado.") : tabla([{ t: "#" }, { t: "Producto" }, { t: "Uds.", n: true }, { t: "Importe", n: true }, { t: "Utilidad", n: true }, { t: "Margen", n: true }], r.topProductos.map((p, i) => [String(i + 1), escaparHtml(p.nombre), String(p.cantidad), mon(p.importe), mon(p.utilidad), p.importe > 0 ? `${Math.round((p.utilidad / p.importe) * 100)}%` : "—"]));
        partes.push(seccion(++n, "Productos más vendidos", "Top por unidades", cuerpo));
    }
    if (incluye("categorias")) {
        const total = r.porCategoria.reduce((s, c) => s + c.importe, 0);
        const cuerpo = r.porCategoria.length === 0 ? vacio("Sin ventas en el período seleccionado.") : tabla([{ t: "Categoría" }, { t: "Uds.", n: true }, { t: "Importe", n: true }, { t: "% del total" }], r.porCategoria.map((c) => [escaparHtml(c.categoria), String(c.cantidad), mon(c.importe), total > 0 ? barra((c.importe / total) * 100) + `<span class="pc">${((c.importe / total) * 100).toFixed(1)}%</span>` : "—"]));
        partes.push(seccion(++n, "Ventas por categoría", "", cuerpo));
    }
    if (incluye("topClientes")) {
        const cuerpo = r.topClientes.length === 0 ? vacio("Sin ventas en el período seleccionado.") : tabla([{ t: "#" }, { t: "Cliente" }, { t: "Compras", n: true }, { t: "Total comprado", n: true }, { t: "A crédito", n: true }], r.topClientes.map((c, i) => [String(i + 1), escaparHtml(c.nombre), String(c.compras), mon(c.total), mon(c.credito)]));
        partes.push(seccion(++n, "Mejores clientes", "Top por monto comprado", cuerpo));
    }
    if (incluye("cartera")) {
        const cuerpo = r.cartera.clientes.length === 0 ? vacio("No hay saldos pendientes de cobro.") : tabla([{ t: "Cliente" }, { t: "Teléfono" }, { t: "Límite", n: true }, { t: "Saldo", n: true }, { t: "Uso", n: true }], r.cartera.clientes.map((c) => [escaparHtml(c.nombre), escaparHtml(c.telefono || "—"), c.limite > 0 ? mon(c.limite) : "—", mon(c.saldo), c.limite > 0 ? `${Math.round((c.saldo / c.limite) * 100)}%` : "—"]), `<tr><td colspan="3">Total por cobrar · ${r.cartera.cantidad} cliente(s)</td><td class="n">${mon(r.cartera.total)}</td><td></td></tr>`);
        partes.push(seccion(++n, "Cartera por cobrar", "Saldo actual, no depende del período", cuerpo));
    }
    if (incluye("cobrar")) {
        const c = cuentasPorCobrarDetalle();
        const antiguedad = (d) => d <= 0 ? '<span class="pg co">Al día</span>'
            : d <= 30 ? '<span class="pg" style="background:#fef3c7;color:#92400e">1 a 30 días</span>'
                : d <= 60 ? '<span class="pg" style="background:#fed7aa;color:#9a3412">31 a 60 días</span>'
                    : '<span class="pg cr">Más de 60 días</span>';
        const cuerpo = c.facturas.length === 0 ? vacio("No hay facturas con saldo pendiente de cobro.") : tabla([{ t: "Factura" }, { t: "Cliente" }, { t: "Teléfono" }, { t: "Fecha" }, { t: "Total", n: true }, { t: "Saldo", n: true }, { t: "Días", n: true }, { t: "Antigüedad" }], c.facturas.map((f) => [
            `<b>${escaparHtml(f.numero)}</b>`,
            escaparHtml(f.cliente),
            escaparHtml(f.telefono || "—"),
            fechaCorta(f.fecha),
            mon(f.total),
            `<b class="${f.dias > 30 ? "alerta" : ""}">${mon(f.saldo)}</b>`,
            String(f.dias),
            antiguedad(f.dias)
        ]), `<tr><td colspan="5">Total · ${c.cantidadFacturas} factura(s) · ${c.cantidadClientes} cliente(s) · antigúedad promedio ${c.antiguedadPromedio} día(s)</td><td class="n">${mon(c.total)}</td><td></td><td></td></tr>`);
        const kpis = `<div class="kpis cuatro"><div class="kpi dest"><span>Total por cobrar</span><strong>${mon(c.total)}</strong></div><div class="kpi"><span>Facturas abiertas</span><strong>${c.cantidadFacturas}</strong></div><div class="kpi"><span>Clientes con saldo</span><strong>${c.cantidadClientes}</strong></div><div class="kpi"><span>Vencido (+30 días)</span><strong>${mon(c.vencido)}</strong></div></div>`;
        partes.push(seccion(++n, "Cuentas por cobrar", "Detalle de facturas pendientes, saldo actual", kpis + cuerpo, true));
    }
    if (incluye("criticos")) {
        const lista = r.criticos;
        const cuerpo = lista.length === 0 ? vacio("Todos los productos superan el stock mínimo configurado.") : tabla([{ t: "Producto" }, { t: "Categoría" }, { t: "Stock", n: true }, { t: "Costo unit.", n: true }, { t: "Valor a costo", n: true }], lista.map((p) => [escaparHtml(p.nombre), escaparHtml(p.categoria || "—"), `<b class="${p.stock <= 0 ? "alerta" : ""}">${p.stock}</b>`, mon(p.costo), mon(p.stock * p.costo)]), `<tr><td colspan="4">Total · ${lista.length} producto(s)</td><td class="n">${mon(lista.reduce((s, p) => s + p.stock * p.costo, 0))}</td></tr>`);
        partes.push(seccion(++n, "Stock crítico", "Productos en o bajo el mínimo", cuerpo));
    }
    if (incluye("inventario")) {
        const inv = r.inventario;
        const cuerpo = `<div class="kpis tres"><div class="kpi"><span>Valor a costo</span><strong>${mon(inv.costo)}</strong></div><div class="kpi"><span>Valor a precio de venta</span><strong>${mon(inv.venta)}</strong></div><div class="kpi"><span>Utilidad potencial</span><strong>${mon(inv.margen)}</strong></div></div>`;
        partes.push(seccion(++n, "Inventario valorizado", "Existencias actuales", cuerpo, true));
    }
    const contacto = [negocio.ruc ? "RUC " + negocio.ruc : "", negocio.direccion, negocio.telefono].filter(Boolean).map((v) => escaparHtml(v)).join(" &nbsp;·&nbsp; ");
    const cssTexto = nombre.replace(/["\\\n\r]/g, " ");
    const paginado = modo === "impresion" ? `@page{margin:14mm 13mm 17mm;@bottom-left{content:"${cssTexto}";font:8px 'Segoe UI',Arial,sans-serif;color:#64748b}@bottom-right{content:"Página " counter(page) " de " counter(pages);font:8px 'Segoe UI',Arial,sans-serif;color:#64748b}}` : modo === "pdf" ? "@page{margin:0}" : "";
    return `<!DOCTYPE html>
<html lang="es"><head><meta charset="UTF-8"><title>${escaparHtml(o.titulo)} — ${escaparHtml(nombre)}</title>
<style>
:root{--ac:${o.acento};--tx:#1b2430;--su:#64748b;--bd:#dde3ec;--bg:#f6f8fb;--ok:#15803d;--cr:#c2410c}
*{box-sizing:border-box}
${paginado}
body{margin:0;color:var(--tx);background:#fff;font:11px/1.45 'Segoe UI',Inter,system-ui,Arial,sans-serif;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.documento{padding:14mm 13mm}
.cab{display:flex;justify-content:space-between;align-items:flex-start;gap:20px;padding-bottom:12px;border-bottom:3px solid var(--ac)}
.cab-neg{display:flex;gap:12px;align-items:center}
.marca{width:42px;height:42px;border-radius:9px;background:var(--ac);color:#fff;font:700 21px/42px 'Segoe UI',Arial,sans-serif;text-align:center}
.cab-neg h1{margin:0;font-size:19px;letter-spacing:-.01em}
.cab-neg p{margin:2px 0 0;color:var(--su);font-size:10px}
.cab-doc{text-align:right}
.cab-doc .etq{display:inline-block;padding:2px 8px;border-radius:20px;background:var(--ac);color:#fff;font-size:8.5px;font-weight:700;letter-spacing:.1em;text-transform:uppercase}
.cab-doc h2{margin:6px 0 0;font-size:15px;letter-spacing:-.01em}
.cab-doc .per{margin:3px 0 0;font-weight:600}
.cab-doc .gen{margin:2px 0 0;color:var(--su);font-size:9px}
.obs{margin:14px 0 0;padding:9px 12px;border-left:3px solid var(--ac);background:var(--bg);border-radius:0 6px 6px 0;white-space:pre-line}
.obs b{display:block;margin-bottom:2px;font-size:9px;letter-spacing:.08em;text-transform:uppercase;color:var(--su)}
.sec{margin-top:18px}
.sec.ev{break-inside:avoid}
.sec h3{display:flex;align-items:baseline;gap:8px;margin:0 0 8px;padding-bottom:5px;border-bottom:1px solid var(--bd);font-size:12.5px;break-after:avoid}
.sec h3 b{color:var(--ac);font-size:11px;letter-spacing:.04em}
.sec h3 small{margin-left:auto;color:var(--su);font-size:9.5px;font-weight:400}
.kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}
.kpis.tres{grid-template-columns:repeat(3,1fr)}
.kpi{padding:9px 11px;border:1px solid var(--bd);border-radius:7px;background:var(--bg);break-inside:avoid}
.kpi span{display:block;color:var(--su);font-size:8.5px;font-weight:700;letter-spacing:.06em;text-transform:uppercase}
.kpi strong{display:block;margin-top:3px;font-size:14px;font-variant-numeric:tabular-nums}
.kpi em{display:block;margin-top:1px;color:var(--su);font-size:9px;font-style:normal;font-weight:400}
.kpi.dest{background:var(--ac);border-color:var(--ac)}
.kpi.dest span,.kpi.dest strong{color:#fff}
.mezcla{margin-top:10px}
.mezcla-barra{height:8px;border-radius:5px;background:var(--cr);overflow:hidden}
.mezcla-barra i{display:block;height:100%;background:var(--ok)}
.mezcla p{margin:5px 0 0;color:var(--su);font-size:9.5px}
.pt{display:inline-block;width:8px;height:8px;margin:0 5px 0 12px;border-radius:50%;vertical-align:baseline}
.mezcla p .pt:first-child{margin-left:0}
.pt.co{background:var(--ok)}.pt.cr{background:var(--cr)}
table{width:100%;border-collapse:collapse}
thead{display:table-header-group}
tfoot{display:table-row-group}
tr{break-inside:avoid}
th{padding:6px 8px;border-bottom:1.5px solid var(--ac);background:var(--bg);color:var(--su);font-size:8.5px;font-weight:700;letter-spacing:.06em;text-align:left;text-transform:uppercase}
td{padding:5px 8px;border-bottom:1px solid var(--bd);vertical-align:top}
tbody tr:nth-child(even) td{background:#fbfcfe}
th.n,td.n{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
tfoot td{border-top:1.5px solid var(--tx);border-bottom:0;background:var(--bg);font-weight:700}
tr.det td{padding:0 8px 6px;border-bottom:1px solid var(--bd);background:#fff!important}
table.items{margin:0}
table.items td{padding:2px 6px;border:0;background:transparent!important;color:var(--su);font-size:9.5px}
.pg{display:inline-block;padding:1px 7px;border-radius:10px;font-size:8.5px;font-weight:700}
.pg.co{background:#dcfce7;color:var(--ok)}.pg.cr{background:#ffedd5;color:var(--cr)}
.bar{display:inline-block;width:90px;height:6px;border-radius:4px;background:#e8edf4;vertical-align:middle;overflow:hidden}
.bar i{display:block;height:100%;background:var(--ac)}
.pc{margin-left:6px;color:var(--su);font-size:9.5px}
.alerta{color:#dc2626}
.vacio{margin:0;padding:12px;border:1px dashed #c6ceda;border-radius:6px;background:var(--bg);color:var(--su);text-align:center}
.firmas{display:flex;gap:40px;margin-top:46px;break-inside:avoid}
.firmas div{flex:1;padding-top:6px;border-top:1px solid var(--tx);color:var(--su);font-size:9.5px;text-align:center}
.pie{margin-top:22px;padding-top:7px;border-top:1px solid var(--bd);color:var(--su);font-size:9px;text-align:center}
@media print{.documento{padding:0}}
</style></head>
<body><div class="documento">
<header class="cab"><div class="cab-neg"><div class="marca">${escaparHtml(nombre.trim().charAt(0).toUpperCase() || "S")}</div><div><h1>${escaparHtml(nombre)}</h1><p>${contacto}</p></div></div>
<div class="cab-doc"><span class="etq">Documento interno</span><h2>${escaparHtml(o.titulo)}</h2><p class="per">${periodo}</p><p class="gen">Generado el ${generadoEl()}</p></div></header>
${o.observaciones ? `<div class="obs"><b>Observaciones</b>${escaparHtml(o.observaciones)}</div>` : ""}
${partes.join("\n")}
${o.firmas ? '<div class="firmas"><div>Elaborado por</div><div>Revisado / autorizado por</div></div>' : ""}
<footer class="pie">${escaparHtml(nombre)} · ${escaparHtml(o.titulo)} · ${periodo}</footer>
</div></body></html>`;
}
/** Envía el reporte a la impresora (diálogo de impresión del sistema, hoja A4). */
export function imprimirReporte(ventana, desde, hasta, opciones) {
    return imprimirDocumentoA4(ventana, generarReporteImprimibleHTML(desde, hasta, opciones, "impresion"), "Reporte de gestión");
}
/**
 * Guarda el reporte como PDF A4 con numeración "Página X de Y" y pide la ruta al
 * usuario. `nombreArchivo` define el nombre sugerido (sin extensión).
 */
export async function exportarReportePDF(ventana, desde, hasta, opciones, nombreSugerido = "reporte-de-gestion") {
    if (!ventana || ventana.isDestroyed())
        return { ok: false, mensaje: "La ventana principal no está disponible." };
    const negocio = obtenerConfiguracion();
    const nombreArchivo = `${nombreSugerido}_${desde || "inicio"}_${hasta || "hoy"}.pdf`;
    const destino = await dialog.showSaveDialog(ventana, { title: "Guardar reporte en PDF", defaultPath: path.join(app.getPath("documents"), nombreArchivo), filters: [{ name: "PDF", extensions: ["pdf"] }] });
    if (destino.canceled || !destino.filePath)
        return { ok: false, cancelado: true, mensaje: "Exportación cancelada." };
    const documento = new BrowserWindow({ show: false, width: 1000, height: 900, webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: false } });
    const ruta = path.join(app.getPath("temp"), `spp-reporte-pdf-${process.pid}-${Date.now()}.html`);
    try {
        await fsPromises.writeFile(ruta, generarReporteImprimibleHTML(desde, hasta, opciones, "pdf"), "utf8");
        await documento.loadFile(ruta);
        const pie = `<div style="width:100%;padding:0 13mm;font:8px 'Segoe UI',Arial,sans-serif;color:#64748b;display:flex;justify-content:space-between"><span>${escaparHtml(negocio.nombre || "SmartPosPro")}</span><span>Página <span class="pageNumber"></span> de <span class="totalPages"></span></span></div>`;
        const pdf = await documento.webContents.printToPDF({ pageSize: "A4", printBackground: true, displayHeaderFooter: true, headerTemplate: "<span></span>", footerTemplate: pie, margins: { top: 0.55, bottom: 0.75, left: 0.5, right: 0.5 } });
        await fsPromises.writeFile(destino.filePath, pdf);
        return { ok: true, mensaje: "Reporte guardado en PDF.", ruta: destino.filePath };
    }
    catch (error) {
        return { ok: false, mensaje: error instanceof Error ? error.message : "No se pudo generar el PDF del reporte." };
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
//# sourceMappingURL=reportes-impresion.js.map