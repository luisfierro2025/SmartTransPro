import { app, BrowserWindow, dialog } from "electron";
import { promises as fsPromises } from "node:fs";
import path from "node:path";
import { obtenerConfiguracion } from "../configuracion/configuracion.js";
import { obtenerClientes } from "../clientes/clientes.js";
import { obtenerProductos } from "../productos/productos.js";
import { imprimirDocumentoA4, type ResultadoImpresion } from "../impresion/impresion.js";

export type ModuloImprimible = "clientes" | "productos";
export type ModoImpresionModulo = "pantalla" | "impresion" | "pdf";

export interface OpcionesImpresionModulo {
  filtro?: string;
  busqueda?: string;
  umbralStock?: number;
  categoria?: string;
}

interface ClienteImprimible {
  codigo?: string;
  nombre: string;
  telefono?: string;
  correo?: string;
  limiteCredito?: number;
  saldoPendiente?: number;
}

interface ProductoImprimible {
  codigo?: string;
  codigo_barras?: string | null;
  nombre: string;
  categoria?: string;
  stock?: number;
  precio?: number;
}

interface DatosNegocio { nombre?: string; ruc?: string; telefono?: string; direccion?: string; moneda?: string }

function escaparHtml(valor: unknown): string {
  return String(valor ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function textoNormalizado(valor: unknown): string {
  return String(valor ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLocaleLowerCase("es");
}

function moneda(valor: unknown, codigo: string): string {
  const numero = Number(valor);
  return `${escaparHtml(codigo)} ${ (Number.isFinite(numero) ? numero : 0).toLocaleString("es-NI", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function valoresOpciones(opciones?: OpcionesImpresionModulo) {
  const filtro = String(opciones?.filtro ?? "todos");
  const umbral = Number(opciones?.umbralStock);
  return {
    filtro,
    busqueda: textoNormalizado(opciones?.busqueda),
    umbralStock: Number.isFinite(umbral) ? Math.max(0, Math.min(1000000, Math.floor(umbral))) : 5,
    categoria: textoNormalizado(opciones?.categoria)
  };
}

function filtrarClientes(opciones?: OpcionesImpresionModulo): ClienteImprimible[] {
  const o = valoresOpciones(opciones);
  if (!["todos", "con-saldo", "sin-saldo"].includes(o.filtro)) {
    throw new Error("El filtro de clientes seleccionado no es válido.");
  }
  return (obtenerClientes() as ClienteImprimible[])
    .filter((cliente) => {
      const saldo = Number(cliente.saldoPendiente) || 0;
      if (o.filtro === "con-saldo" && saldo <= 0) return false;
      if (o.filtro === "sin-saldo" && saldo > 0) return false;
      return !o.busqueda || [cliente.codigo, cliente.nombre, cliente.telefono, cliente.correo]
        .some((campo) => textoNormalizado(campo).includes(o.busqueda));
    })
    .sort((a, b) => String(a.nombre).localeCompare(String(b.nombre), "es"));
}

function filtrarProductos(opciones?: OpcionesImpresionModulo): ProductoImprimible[] {
  const o = valoresOpciones(opciones);
  if (!["todos", "bajo-stock", "agotados", "conteo"].includes(o.filtro)) {
    throw new Error("El tipo de inventario seleccionado no es válido.");
  }
  return (obtenerProductos() as ProductoImprimible[])
    .filter((producto) => {
      const stock = Number(producto.stock) || 0;
      if (o.filtro === "bajo-stock" && (stock <= 0 || stock > o.umbralStock)) return false;
      if (o.filtro === "agotados" && stock > 0) return false;
      if (o.categoria && !textoNormalizado(producto.categoria).includes(o.categoria)) return false;
      return !o.busqueda || [producto.codigo, producto.codigo_barras, producto.nombre, producto.categoria]
        .some((campo) => textoNormalizado(campo).includes(o.busqueda));
    })
    .sort((a, b) => String(a.nombre).localeCompare(String(b.nombre), "es"));
}

function tabla(columnas: string[], filas: string[][]): string {
  return `<table><thead><tr>${columnas.map((columna) => `<th>${escaparHtml(columna)}</th>`).join("")}</tr></thead><tbody>${filas.map((fila) => `<tr>${fila.map((celda) => `<td>${celda}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
}

/** Construye la vista previa y la hoja final con los mismos datos y filtros. */
export function generarHTMLImpresionModulo(
  modulo: ModuloImprimible,
  opciones?: OpcionesImpresionModulo,
  modo: ModoImpresionModulo = "pantalla"
): string {
  if (modulo !== "clientes" && modulo !== "productos") {
    throw new Error("El módulo solicitado no tiene un formato de impresión disponible.");
  }
  const negocio = obtenerConfiguracion() as unknown as DatosNegocio;
  const divisa = negocio.moneda || "C$";
  const o = valoresOpciones(opciones);
  let titulo: string;
  let descripcion: string;
  let filas: string[][];
  let columnas: string[];

  if (modulo === "clientes") {
    const clientes = filtrarClientes(opciones);
    titulo = o.filtro === "con-saldo" ? "Clientes con saldo pendiente"
      : o.filtro === "sin-saldo" ? "Clientes sin saldo pendiente" : "Directorio de clientes";
    descripcion = `Clientes: ${clientes.length}${opciones?.busqueda?.trim() ? ` · Búsqueda: ${escaparHtml(opciones.busqueda.trim())}` : ""}`;
    columnas = ["Código", "Cliente", "Teléfono", "Correo", "Límite de crédito", "Saldo pendiente", "Disponible"];
    filas = clientes.map((cliente) => {
      const limite = Number(cliente.limiteCredito) || 0;
      const saldo = Number(cliente.saldoPendiente) || 0;
      return [
        escaparHtml(cliente.codigo || "—"),
        escaparHtml(cliente.nombre),
        escaparHtml(cliente.telefono || "—"),
        escaparHtml(cliente.correo || "—"),
        moneda(limite, divisa),
        moneda(saldo, divisa),
        moneda(limite - saldo, divisa)
      ];
    });
  } else {
    const productos = filtrarProductos(opciones);
    const conteo = o.filtro === "conteo";
    titulo = conteo ? "Hoja de conteo físico de inventario"
      : o.filtro === "bajo-stock" ? `Productos con stock bajo (hasta ${o.umbralStock})`
        : o.filtro === "agotados" ? "Productos agotados" : "Inventario de productos";
    const filtros = [
      o.categoria ? `Categoría: ${escaparHtml(opciones?.categoria?.trim())}` : "",
      opciones?.busqueda?.trim() ? `Búsqueda: ${escaparHtml(opciones.busqueda.trim())}` : ""
    ].filter(Boolean).join(" · ");
    descripcion = `Productos: ${productos.length}${filtros ? ` · ${filtros}` : ""}`;
    columnas = conteo
      ? ["Código", "Producto", "Categoría", "Stock registrado", "Cantidad contada", "Diferencia"]
      : ["Código", "Producto", "Categoría", "Existencia", "Precio de venta", "Valor a precio de venta"];
    filas = productos.map((producto) => {
      const stock = Number(producto.stock) || 0;
      const precio = Number(producto.precio) || 0;
      return conteo
        ? [escaparHtml(producto.codigo || "—"), escaparHtml(producto.nombre), escaparHtml(producto.categoria || "—"), String(stock), "&nbsp;", "&nbsp;"]
        : [escaparHtml(producto.codigo || "—"), escaparHtml(producto.nombre), escaparHtml(producto.categoria || "—"), String(stock), moneda(precio, divisa), moneda(stock * precio, divisa)];
    });
  }

  if (filas.length === 0) filas = [[`<span class="sin-datos">No hay registros que coincidan con los filtros elegidos.</span>`, ...Array(Math.max(0, columnas.length - 1)).fill("")]];
  const fecha = new Date().toLocaleString("es-NI", { dateStyle: "medium", timeStyle: "short" });
  const contacto = [negocio.ruc ? `RUC ${escaparHtml(negocio.ruc)}` : "", negocio.direccion, negocio.telefono]
    .filter(Boolean).map(escaparHtml).join(" · ");
  const pageCss = modo === "pantalla" ? "@page{size:A4;margin:0}" : "@page{size:A4 portrait;margin:14mm 12mm}";
  const nota = modulo === "clientes"
    ? '<p class="nota">La base actual no registra fecha de ingreso ni estado activo del cliente; esos criterios no están disponibles.</p>'
    : '<p class="nota">El valor de inventario se calcula a precio de venta; el sistema no registra costo de compra por producto.</p>';

  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escaparHtml(titulo)} · ${escaparHtml(negocio.nombre || "SmartPosPro")}</title><style>
${pageCss}
*{box-sizing:border-box}body{margin:0;background:#eef1f5;color:#172033;font:10pt/1.4 "Segoe UI",Arial,sans-serif;-webkit-print-color-adjust:exact;print-color-adjust:exact}.hoja{max-width:210mm;min-height:297mm;margin:18px auto;padding:14mm 12mm;background:#fff;box-shadow:0 3px 18px #17203320}.marca{display:flex;justify-content:space-between;gap:16px;border-bottom:3px solid #1d4ed8;padding-bottom:12px}.marca h1{font-size:19pt;margin:0 0 3px}.marca p{font-size:9pt;color:#64748b;margin:0}.fecha{font-size:8pt;color:#64748b;text-align:right;white-space:nowrap}.titulo{margin:18px 0 12px}.titulo h2{font-size:15pt;margin:0}.titulo p{color:#64748b;margin:4px 0 0;font-size:9pt}.nota{background:#f1f5f9;border-left:3px solid #94a3b8;padding:8px 10px;color:#475569;font-size:8pt;margin:0 0 12px}table{width:100%;border-collapse:collapse;font-size:8.3pt}thead{display:table-header-group}th{background:#eef2ff;color:#334155;text-align:left;font-size:7.5pt;text-transform:uppercase;letter-spacing:.03em}th,td{padding:7px 6px;border-bottom:1px solid #dbe2ea;vertical-align:top}td:nth-last-child(-n+3){text-align:right;font-variant-numeric:tabular-nums}tbody tr:nth-child(even){background:#f8fafc}.sin-datos{display:block;text-align:center;color:#64748b;padding:12px}.pie{margin-top:14px;border-top:1px solid #dbe2ea;padding-top:7px;color:#64748b;font-size:7.5pt;text-align:right}
@media print{body{background:#fff}.hoja{max-width:none;min-height:0;margin:0;padding:0;box-shadow:none}tr{break-inside:avoid}thead{display:table-header-group}}
</style></head><body><main class="hoja"><header class="marca"><div><h1>${escaparHtml(negocio.nombre || "SmartPosPro")}</h1><p>${contacto || "Documento interno"}</p></div><div class="fecha">Generado<br>${escaparHtml(fecha)}</div></header><section class="titulo"><h2>${escaparHtml(titulo)}</h2><p>${descripcion}</p></section>${nota}${tabla(columnas, filas)}<footer class="pie">${escaparHtml(negocio.nombre || "SmartPosPro")} · ${escaparHtml(titulo)}</footer></main></body></html>`;
}

export function imprimirReporteModulo(
  ventana: BrowserWindow | null,
  modulo: ModuloImprimible,
  opciones?: OpcionesImpresionModulo
): Promise<ResultadoImpresion> {
  return imprimirDocumentoA4(ventana, generarHTMLImpresionModulo(modulo, opciones, "impresion"), modulo === "clientes" ? "Reporte de clientes" : "Reporte de inventario");
}

export async function exportarReporteModuloPDF(
  ventana: BrowserWindow | null,
  modulo: ModuloImprimible,
  opciones?: OpcionesImpresionModulo
): Promise<ResultadoImpresion> {
  if (!ventana || ventana.isDestroyed()) return { ok: false, mensaje: "La ventana principal no está disponible." };
  const nombre = modulo === "clientes" ? "reporte-de-clientes" : "reporte-de-inventario";
  const destino = await dialog.showSaveDialog(ventana, {
    title: "Guardar reporte en PDF",
    defaultPath: path.join(app.getPath("documents"), `${nombre}.pdf`),
    filters: [{ name: "Documento PDF", extensions: ["pdf"] }]
  });
  if (destino.canceled || !destino.filePath) return { ok: false, cancelado: true, mensaje: "Exportación cancelada." };

  const documento = new BrowserWindow({
    show: false,
    width: 1000,
    height: 900,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: false }
  });
  const ruta = path.join(app.getPath("temp"), `spp-modulo-pdf-${process.pid}-${Date.now()}.html`);
  try {
    await fsPromises.writeFile(ruta, generarHTMLImpresionModulo(modulo, opciones, "pdf"), "utf8");
    await documento.loadFile(ruta);
    const pdf = await documento.webContents.printToPDF({
      pageSize: "A4",
      printBackground: true,
      preferCSSPageSize: true,
      margins: { top: 0, bottom: 0, left: 0, right: 0 }
    });
    await fsPromises.writeFile(destino.filePath, pdf);
    return { ok: true, ruta: destino.filePath, mensaje: `Reporte guardado en ${destino.filePath}` };
  } catch (error) {
    return { ok: false, mensaje: error instanceof Error ? error.message : "No se pudo generar el PDF." };
  } finally {
    try { if (!documento.isDestroyed()) documento.destroy(); } catch { /* La ventana ya se cerró. */ }
    fsPromises.unlink(ruta).catch(() => {});
  }
}
