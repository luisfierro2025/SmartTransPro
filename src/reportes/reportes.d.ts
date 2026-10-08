import { stockCritico, inventarioValorizado } from "../compras/compras.js";
/** Fecha de hoy en formato YYYY-MM-DD (zona horaria local del equipo). */
export declare function fechaHoy(): string;
export interface ResumenVentas {
    ventas: number;
    total: number;
    contado: number;
    credito: number;
    articulos: number;
    ticketPromedio: number;
}
/** Totales de ventas del período: cantidad, monto, desglose contado/crédito y ticket promedio. */
export declare function resumenVentas(desde: string, hasta: string): ResumenVentas;
export interface VentaPorDia {
    dia: string;
    ventas: number;
    total: number;
    credito: number;
}
/** Serie diaria de ventas dentro del período, más reciente primero (para tabla/gráfico). */
export declare function ventasPorDia(desde: string, hasta: string, limite?: number): VentaPorDia[];
export interface VentaPorCategoria {
    categoria: string;
    cantidad: number;
    importe: number;
}
/** Ventas agrupadas por categoría de producto, de mayor a menor importe. */
export declare function ventasPorCategoria(desde: string, hasta: string): VentaPorCategoria[];
export interface ProductoVendido {
    nombre: string;
    cantidad: number;
    importe: number;
    costo: number;
    utilidad: number;
}
/** Ranking de productos más vendidos por unidades, con importe, costo y utilidad. */
export declare function productosMasVendidos(desde: string, hasta: string, limite?: number): ProductoVendido[];
export interface UtilidadEstimada {
    ingreso: number;
    costo: number;
    utilidad: number;
    margen: number;
}
/** Utilidad estimada del período (ingreso - costo) y margen porcentual. */
export declare function utilidadEstimada(desde: string, hasta: string): UtilidadEstimada;
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
export declare function carteraPorCobrar(): CarteraPorCobrar;
/** Indicadores rápidos para el panel "Inicio" (hoy): ventas, cartera, inventario y stock crítico. */
export declare function indicadoresGenerales(): {
    negocio: string;
    moneda: string;
    totalClientes: number;
    totalProductos: number;
    ventasHoy: number;
    montoHoy: number;
    creditoHoy: number;
    ticketPromedio: number;
    carteraTotal: number;
    clientesConSaldo: number;
    productosCriticos: number;
    stockMinimo: number;
    inventarioCosto: number;
    inventarioVenta: number;
    inventarioMargen: number;
    cajaAbierta: boolean;
};
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
export declare function ventasDetalle(desde: string, hasta: string, tipoPago?: string, busqueda?: string): VentaDetalle[];
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
export declare function cuentasPorCobrarDetalle(): ReporteCuentasPorCobrar;
/**
 * Reporte consolidado del período (desde/hasta): todo lo que necesita la vista
 * "Reportes" del frontend y el documento imprimible en una sola llamada.
 * Es la misma fuente de datos para pantalla e impresión, así que lo impreso
 * siempre coincide exactamente con lo que el usuario filtró en pantalla.
 */
export declare function reporteCompleto(desde: string, hasta: string): ReporteCompleto;
//# sourceMappingURL=reportes.d.ts.map