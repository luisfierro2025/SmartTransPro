import { db } from "../db/database.js";
import { obtenerConfiguracion } from "../configuracion/configuracion.js";
import { stockCritico, inventarioValorizado } from "../compras/compras.js";
import { cajaAbierta } from "../caja/caja.js";

// =====================================================================================
// Módulo de Reportes
// Calcula los indicadores de ventas, utilidad, inventario y cartera que consume:
//  - el panel "Inicio" (indicadoresGenerales)
//  - la vista "Reportes" del frontend (reporteCompleto, vía IPC reportes:completo)
//  - el documento imprimible (ver reportes-impresion.ts), que reutiliza reporteCompleto
// Todas las funciones son de solo lectura: no modifican datos, solo consultan la BD.
// =====================================================================================

/** Redondea a 2 decimales evitando errores de coma flotante (ej. 10.1 + 0.2). */
function redondear(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/**
 * Ejecuta una consulta que devuelve un único valor numérico (COUNT, SUM, etc).
 * Acepta filas con columna `total` o `n` y siempre devuelve un número (0 si no hay fila).
 */
function escalar(sql: string, params: Array<string | number>): number {
  const fila = db.prepare(sql).get(...params) as { total?: number; n?: number } | undefined;
  if (!fila) return 0;
  const valor = fila.total !== undefined ? fila.total : fila.n;
  return Number(valor) || 0;
}

/** Fecha de hoy en formato YYYY-MM-DD (zona horaria local del equipo). */
export function fechaHoy(): string {
  const d = new Date();
  const dos = (n: number) => (n < 10 ? "0" + n : String(n));
  return d.getFullYear() + "-" + dos(d.getMonth() + 1) + "-" + dos(d.getDate());
}

/**
 * Normaliza un par de fechas (YYYY-MM-DD) a un rango de timestamps para SQL.
 * Fechas vacías se abren a todo el histórico (0000-01-01 .. 9999-12-31).
 */
function rango(desde: string, hasta: string): { desde: string; hasta: string } {
  const inicio = desde && desde.trim() ? desde.trim() : "0000-01-01";
  const fin = hasta && hasta.trim() ? hasta.trim() : "9999-12-31";
  return { desde: inicio + " 00:00:00", hasta: fin + " 23:59:59" };
}

export interface ResumenVentas {
  ventas: number;
  total: number;
  contado: number;
  credito: number;
  articulos: number;
  ticketPromedio: number;
}

/** Totales de ventas del período: cantidad, monto, desglose contado/crédito y ticket promedio. */
export function resumenVentas(desde: string, hasta: string): ResumenVentas {
  const r = rango(desde, hasta);
  const fila = db
    .prepare(
      `SELECT COUNT(*) AS ventas,
              COALESCE(SUM(total), 0) AS total,
              COALESCE(SUM(CASE WHEN tipo_pago = 'contado' THEN total ELSE 0 END), 0) AS contado,
              COALESCE(SUM(CASE WHEN tipo_pago = 'credito' THEN total ELSE 0 END), 0) AS credito
       FROM ventas WHERE fecha >= ? AND fecha <= ?`
    )
    .get(r.desde, r.hasta) as { ventas: number; total: number; contado: number; credito: number } | undefined;

  const ventas = fila ? Number(fila.ventas) || 0 : 0;
  const total = fila ? redondear(Number(fila.total) || 0) : 0;
  const articulos = escalar(
    `SELECT COALESCE(SUM(d.cantidad), 0) AS n FROM venta_detalles d
     JOIN ventas v ON v.id = d.venta_id WHERE v.fecha >= ? AND v.fecha <= ?`,
    [r.desde, r.hasta]
  );

  return {
    ventas,
    total,
    contado: fila ? redondear(Number(fila.contado) || 0) : 0,
    credito: fila ? redondear(Number(fila.credito) || 0) : 0,
    articulos,
    ticketPromedio: ventas > 0 ? redondear(total / ventas) : 0
  };
}

export interface VentaPorDia {
  dia: string;
  ventas: number;
  total: number;
  credito: number;
}

/** Serie diaria de ventas dentro del período, más reciente primero (para tabla/gráfico). */
export function ventasPorDia(desde: string, hasta: string, limite: number = 31): VentaPorDia[] {
  const r = rango(desde, hasta);
  const tope = Number.isFinite(limite) && limite > 0 ? Math.floor(limite) : 31;
  return db
    .prepare(
      `SELECT date(fecha) AS dia, COUNT(*) AS ventas, COALESCE(SUM(total), 0) AS total,
              COALESCE(SUM(CASE WHEN tipo_pago = 'credito' THEN total ELSE 0 END), 0) AS credito
       FROM ventas WHERE fecha >= ? AND fecha <= ?
       GROUP BY date(fecha) ORDER BY dia DESC LIMIT ?`
    )
    .all(r.desde, r.hasta, tope) as VentaPorDia[];
}

export interface VentaPorCategoria {
  categoria: string;
  cantidad: number;
  importe: number;
}

/** Ventas agrupadas por categoría de producto, de mayor a menor importe. */
export function ventasPorCategoria(desde: string, hasta: string): VentaPorCategoria[] {
  const r = rango(desde, hasta);
  return db
    .prepare(
      `SELECT COALESCE(NULLIF(TRIM(p.categoria), ''), 'Sin categoría') AS categoria,
              COALESCE(SUM(d.cantidad), 0) AS cantidad,
              COALESCE(SUM(d.subtotal), 0) AS importe
       FROM venta_detalles d
       JOIN ventas v ON v.id = d.venta_id
       LEFT JOIN productos p ON p.id = d.producto_id
       WHERE v.fecha >= ? AND v.fecha <= ?
       GROUP BY categoria ORDER BY importe DESC`
    )
    .all(r.desde, r.hasta) as VentaPorCategoria[];
}

export interface ProductoVendido {
  nombre: string;
  cantidad: number;
  importe: number;
  costo: number;
  utilidad: number;
}

/** Ranking de productos más vendidos por unidades, con importe, costo y utilidad. */
export function productosMasVendidos(desde: string, hasta: string, limite: number = 10): ProductoVendido[] {
  const r = rango(desde, hasta);
  const tope = Number.isFinite(limite) && limite > 0 ? Math.floor(limite) : 10;
  const filas = db
    .prepare(
      `SELECT d.nombre AS nombre,
              COALESCE(SUM(d.cantidad), 0) AS cantidad,
              COALESCE(SUM(d.subtotal), 0) AS importe,
              COALESCE(SUM(d.cantidad * COALESCE(c.costo, 0)), 0) AS costo
       FROM venta_detalles d
       JOIN ventas v ON v.id = d.venta_id
       LEFT JOIN producto_costos c ON c.producto_id = d.producto_id
       WHERE v.fecha >= ? AND v.fecha <= ?
       GROUP BY d.nombre ORDER BY cantidad DESC LIMIT ?`
    )
    .all(r.desde, r.hasta, tope) as Array<{ nombre: string; cantidad: number; importe: number; costo: number }>;

  return filas.map((f) => ({
    nombre: f.nombre,
    cantidad: Number(f.cantidad) || 0,
    importe: redondear(Number(f.importe) || 0),
    costo: redondear(Number(f.costo) || 0),
    utilidad: redondear((Number(f.importe) || 0) - (Number(f.costo) || 0))
  }));
}

export interface UtilidadEstimada {
  ingreso: number;
  costo: number;
  utilidad: number;
  margen: number;
}

/** Utilidad estimada del período (ingreso - costo) y margen porcentual. */
export function utilidadEstimada(desde: string, hasta: string): UtilidadEstimada {
  const r = rango(desde, hasta);
  const fila = db
    .prepare(
      `SELECT COALESCE(SUM(d.subtotal), 0) AS ingreso,
              COALESCE(SUM(d.cantidad * COALESCE(c.costo, 0)), 0) AS costo
       FROM venta_detalles d
       JOIN ventas v ON v.id = d.venta_id
       LEFT JOIN producto_costos c ON c.producto_id = d.producto_id
       WHERE v.fecha >= ? AND v.fecha <= ?`
    )
    .get(r.desde, r.hasta) as { ingreso: number; costo: number } | undefined;

  const ingreso = redondear(fila ? Number(fila.ingreso) || 0 : 0);
  const costo = redondear(fila ? Number(fila.costo) || 0 : 0);
  const utilidad = redondear(ingreso - costo);
  return {
    ingreso,
    costo,
    utilidad,
    margen: ingreso > 0 ? redondear((utilidad / ingreso) * 100) : 0
  };
}

export interface ClienteConSaldo {
  id: number;
  nombre: string;
  telefono: string;
  limite: number;
  saldo: number;
}

export interface CarteraPorCobrar {
  clientes: ClienteConSaldo[];
  total: number;
  cantidad: number;
}

/** Clientes con saldo pendiente, de mayor a menor deuda, y el total de cartera. */
export function carteraPorCobrar(): CarteraPorCobrar {
  const clientes = db
    .prepare(
      `SELECT c.id, c.nombre, COALESCE(c.telefono, '') AS telefono,
              COALESCE(c.limite_credito, 0) AS limite,
              COALESCE(c.saldo_pendiente, 0) AS saldo
       FROM clientes c WHERE COALESCE(c.saldo_pendiente, 0) > 0
       ORDER BY saldo DESC`
    )
    .all() as ClienteConSaldo[];

  const total = redondear(clientes.reduce((s, c) => s + (Number(c.saldo) || 0), 0));
  return { clientes, total, cantidad: clientes.length };
}

/** Indicadores rápidos para el panel "Inicio" (hoy): ventas, cartera, inventario y stock crítico. */
export function indicadoresGenerales() {
  const config = obtenerConfiguracion();
  const hoy = fechaHoy();
  const ventasHoy = resumenVentas(hoy, hoy);
  const cartera = carteraPorCobrar();
  const criticos = stockCritico();
  const inventario = inventarioValorizado();

  return {
    negocio: config.nombre,
    moneda: config.moneda,
    totalClientes: escalar("SELECT COUNT(*) AS n FROM clientes", []),
    totalProductos: escalar("SELECT COUNT(*) AS n FROM productos", []),
    ventasHoy: ventasHoy.ventas,
    montoHoy: ventasHoy.total,
    creditoHoy: ventasHoy.credito,
    ticketPromedio: ventasHoy.ticketPromedio,
    carteraTotal: cartera.total,
    clientesConSaldo: cartera.cantidad,
    productosCriticos: criticos.length,
    stockMinimo: config.stockMinimo,
    inventarioCosto: inventario.costo,
    inventarioVenta: inventario.venta,
    inventarioMargen: inventario.margen,
    cajaAbierta: cajaAbierta() !== null
  };
}

export interface ClienteComprador {
  nombre: string;
  compras: number;
  total: number;
  credito: number;
}

export interface ResumenAbonos {
  cantidad: number;
  total: number;
}

export interface ItemDetalle {
  nombre: string;
  cantidad: number;
  precio: number;
  subtotal: number;
}

export interface VentaDetalle {
  numero: string;
  fecha: string;
  cliente: string;
  tipoPago: string;
  articulos: number;
  total: number;
  items: ItemDetalle[];
}

export interface ReporteCompleto {
  desde: string;
  hasta: string;
  moneda: string;
  resumen: ResumenVentas;
  abonos: ResumenAbonos;
  utilidad: UtilidadEstimada;
  porDia: VentaPorDia[];
  porCategoria: VentaPorCategoria[];
  topProductos: ProductoVendido[];
  topClientes: ClienteComprador[];
  cartera: CarteraPorCobrar;
  criticos: ReturnType<typeof stockCritico>;
  inventario: ReturnType<typeof inventarioValorizado>;
}

/**
 * Listado de ventas a nivel de línea para el reporte imprimible.
 * A diferencia de `listarVentasConDetalles`, que devuelve el historial completo,
 * esto aplica los filtros del documento (período, forma de pago y búsqueda) y
 * devuelve el formato exacto que la plantilla de impresión consume.
 */
export function ventasDetalle(
  desde: string,
  hasta: string,
  tipoPago = "todos",
  busqueda = ""
): VentaDetalle[] {
  const cond: string[] = [];
  const params: Array<string | number> = [];
  if (desde) { cond.push("date(v.fecha) >= date(?)"); params.push(desde); }
  if (hasta) { cond.push("date(v.fecha) <= date(?)"); params.push(hasta); }
  if (tipoPago === "credito" || tipoPago === "contado") {
    cond.push("v.tipo_pago = ?");
    params.push(tipoPago);
  }
  const texto = String(busqueda ?? "").trim();
  if (texto) {
    cond.push("(COALESCE(c.nombre, '') LIKE ? OR COALESCE(f.numero, '') LIKE ? OR v.fecha LIKE ?)");
    params.push(`%${texto}%`, `%${texto}%`, `%${texto}%`);
  }
  const where = cond.length ? " WHERE " + cond.join(" AND ") : "";

  const ventas = db.prepare(`
    SELECT v.id, v.fecha, v.total, v.tipo_pago,
           COALESCE(c.nombre, 'Cliente de mostrador') AS cliente,
           COALESCE(f.numero, '') AS numero
    FROM ventas v
    LEFT JOIN clientes c ON c.id = v.cliente_id
    LEFT JOIN facturas f ON f.venta_id = v.id
    ${where}
    ORDER BY v.fecha DESC, v.id DESC
  `).all(...params) as Array<{ id: number; fecha: string; total: number; tipo_pago: string; cliente: string; numero: string }>;

  const stmtItems = db.prepare(`
    SELECT nombre, cantidad, precio, subtotal
    FROM venta_detalles
    WHERE venta_id = ?
    ORDER BY id
  `);

  return ventas.map((v) => {
    const items = stmtItems.all(v.id) as ItemDetalle[];
    return {
      numero: v.numero || `V-${String(v.id).padStart(5, "0")}`,
      fecha: v.fecha,
      cliente: v.cliente,
      tipoPago: v.tipo_pago,
      articulos: items.reduce((s, it) => s + Number(it.cantidad || 0), 0),
      total: redondear(Number(v.total) || 0),
      items: items.map((it) => ({
        nombre: it.nombre,
        cantidad: Number(it.cantidad) || 0,
        precio: Number(it.precio) || 0,
        subtotal: Number(it.subtotal) || 0
      }))
    };
  });
}

/** Abonos cobrados en el período: cuántos y por cuánto. */
function abonosDelPeriodo(desde: string, hasta: string): ResumenAbonos {
  const cond: string[] = [];
  const params: string[] = [];
  if (desde) { cond.push("date(a.fecha) >= date(?)"); params.push(desde); }
  if (hasta) { cond.push("date(a.fecha) <= date(?)"); params.push(hasta); }
  const where = cond.length ? " WHERE " + cond.join(" AND ") : "";
  const fila = db
    .prepare(`SELECT COUNT(*) AS cantidad, COALESCE(SUM(a.monto), 0) AS total FROM abonos a${where}`)
    .get(...params) as { cantidad: number; total: number } | undefined;
  return { cantidad: Number(fila?.cantidad) || 0, total: redondear(Number(fila?.total) || 0) };
}

export interface FacturaPorCobrar {
  numero: string;
  cliente: string;
  telefono: string;
  fecha: string;
  total: number;
  saldo: number;
  dias: number;
}

export interface ReporteCuentasPorCobrar {
  facturas: FacturaPorCobrar[];
  total: number;
  cantidadFacturas: number;
  cantidadClientes: number;
  vencido: number;
  antiguedadPromedio: number;
}

/**
 * Cuentas por cobrar en detalle: una fila por factura con saldo pendiente,
 * ordenada por antigüedad (lo más viejo primero). Es el documento que se lleva
 * el cobrador o el contador; el resumen por cliente de `carteraPorCobrar` sigue
 * sirviendo para el resto de reportes.
 *
 * El saldo no depende del período seleccionado: son las facturas abiertas hoy,
 * por eso el documento no lleva rango de fechas, solo la fecha de emisión al pie.
 */
export function cuentasPorCobrarDetalle(): ReporteCuentasPorCobrar {
  const filas = db
    .prepare(`
      SELECT COALESCE(f.numero, 'S/N') AS numero,
             COALESCE(c.nombre, 'Cliente de mostrador') AS cliente,
             COALESCE(c.telefono, '') AS telefono,
             f.fecha, f.total, f.saldo_pendiente AS saldo
      FROM facturas f
      LEFT JOIN clientes c ON c.id = f.cliente_id
      WHERE f.saldo_pendiente > 0.009
      ORDER BY f.fecha ASC, f.id ASC
    `)
    .all() as Array<{ numero: string; cliente: string; telefono: string; fecha: string; total: number; saldo: number }>;

  const hoy = new Date();
  const facturas: FacturaPorCobrar[] = filas.map((f) => {
    const fecha = new Date(f.fecha || "");
    const dias = Number.isNaN(fecha.getTime())
      ? 0
      : Math.max(0, Math.floor((hoy.getTime() - fecha.getTime()) / 86400000));
    return {
      numero: f.numero,
      cliente: f.cliente,
      telefono: f.telefono || "",
      fecha: f.fecha || "",
      total: redondear(Number(f.total) || 0),
      saldo: redondear(Number(f.saldo) || 0),
      dias
    };
  });

  const total = redondear(facturas.reduce((s, f) => s + f.saldo, 0));
  const clientes = new Set(facturas.map((f) => f.cliente));
  const antiguedadPromedio = facturas.length
    ? Math.round(facturas.reduce((s, f) => s + f.dias, 0) / facturas.length)
    : 0;
  return {
    facturas,
    total,
    cantidadFacturas: facturas.length,
    cantidadClientes: clientes.size,
    vencido: redondear(facturas.filter((f) => f.dias > 30).reduce((s, f) => s + f.saldo, 0)),
    antiguedadPromedio
  };
}

/** Mejores clientes del período, ordenados por monto comprado. */
function topClientesDelPeriodo(desde: string, hasta: string, limite = 10): ClienteComprador[] {
  const cond: string[] = [];
  const params: Array<string | number> = [];
  if (desde) { cond.push("date(v.fecha) >= date(?)"); params.push(desde); }
  if (hasta) { cond.push("date(v.fecha) <= date(?)"); params.push(hasta); }
  const where = cond.length ? " WHERE " + cond.join(" AND ") : "";
  params.push(limite);
  const stmt = db.prepare(`
      SELECT COALESCE(c.nombre, 'Cliente de mostrador') AS nombre,
             COUNT(v.id) AS compras,
             COALESCE(SUM(v.total), 0) AS total,
             COALESCE(SUM(CASE WHEN v.tipo_pago = 'credito' THEN v.total ELSE 0 END), 0) AS credito
      FROM ventas v
      LEFT JOIN clientes c ON c.id = v.cliente_id
      ${where}
      GROUP BY COALESCE(c.nombre, 'Cliente de mostrador')
      ORDER BY total DESC
      LIMIT ?
    `);
  const filas = stmt.all(...params) as Array<{ nombre: string; compras: number; total: number; credito: number }>;
  return filas.map((f) => ({
      nombre: String(f.nombre),
      compras: Number(f.compras) || 0,
      total: redondear(Number(f.total) || 0),
      credito: redondear(Number(f.credito) || 0)
    }));
}

/**
 * Reporte consolidado del período (desde/hasta): todo lo que necesita la vista
 * "Reportes" del frontend y el documento imprimible en una sola llamada.
 * Es la misma fuente de datos para pantalla e impresión, así que lo impreso
 * siempre coincide exactamente con lo que el usuario filtró en pantalla.
 */
export function reporteCompleto(desde: string, hasta: string): ReporteCompleto {
  const config = obtenerConfiguracion();
  return {
    desde,
    hasta,
    moneda: config.moneda,
    resumen: resumenVentas(desde, hasta),
    abonos: abonosDelPeriodo(desde, hasta),
    utilidad: utilidadEstimada(desde, hasta),
    porDia: ventasPorDia(desde, hasta),
    porCategoria: ventasPorCategoria(desde, hasta),
    topProductos: productosMasVendidos(desde, hasta, 10),
    topClientes: topClientesDelPeriodo(desde, hasta, 10),
    cartera: carteraPorCobrar(),
    criticos: stockCritico(),
    inventario: inventarioValorizado()
  };
}
