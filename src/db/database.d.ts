import Database from "better-sqlite3";
export type TipoPago = "contado" | "credito";
export interface ItemVenta {
    productoId: number;
    nombre: string;
    precio: number;
    cantidad: number;
}
export declare const db: Database.Database;
export declare function siguienteNumeroFactura(): string;
export declare function siguienteCodigoCliente(): string;
export declare function obtenerSaldoPendiente(clienteId: number): number;
export declare function fechaHoraLocal(): string;
export declare function obtenerFacturasPendientes(clienteId: number): Array<{
    id: number;
    numero: string | null;
    total: number;
    saldo_pendiente: number;
    fecha: string;
}>;
export declare function agregarCliente(nombre: string, telefono: string, direccion: string, correo: string, limiteCredito: number): Database.RunResult;
export declare function listarClientes(): unknown[];
export declare function buscarClientes(nombre: string): unknown[];
export declare function editarCliente(id: number, nombre: string, telefono: string, direccion: string, correo: string, limiteCredito: number): Database.RunResult;
export declare function eliminarCliente(id: number): Database.RunResult;
export declare function totalClientes(): number;
export declare function agregarProducto(nombre: string, precio: number, stock: number, categoria: string, codigoBarras?: string | null): Database.RunResult;
/**
 * Normaliza un código de barras capturado por el escáner o tecleado: quita
 * espacios y guiones, y devuelve null cuando no hay código, para guardarlo
 * como NULL y no chocar con el índice único.
 */
export declare function normalizarCodigoBarras(codigo: string | null | undefined): string | null;
/**
 * Busca un producto por su código de barras. Primero por coincidencia exacta
 * y, si no hay, ignorando los ceros iniciales, porque según la configuración
 * del escáner un UPC-A (12 dígitos) puede llegar como EAN-13 con un 0 por
 * delante, y un EAN-8 (8) con cinco.
 */
export declare function buscarProductoPorCodigoBarras(codigo: string): any | undefined;
/** Indica si el código ya pertenece a otro producto (excluye el id indicado). */
export declare function codigoBarrasEnUso(codigo: string, idExcluido?: number | null): string | undefined;
export declare function listarProductos(): unknown[];
export declare function buscarProductos(nombre: string): unknown[];
export declare function editarProducto(id: number, nombre: string, precio: number, stock: number, categoria: string, codigoBarras?: string | null): Database.RunResult;
export declare function eliminarProducto(id: number): Database.RunResult;
export declare function totalProductos(): number;
export interface OpcionesVenta {
    descuentoTipo?: "porcentaje" | "monto" | undefined;
    descuentoValor?: number | undefined;
}
export interface TotalesVenta {
    subtotal: number;
    descuento: number;
    impuestoPct: number;
    impuesto: number;
    total: number;
}
/** Porcentaje de impuesto de Configuración (0 si no está definido o es inválido). */
export declare function porcentajeImpuestoVenta(): number;
/** Subtotal -> descuento (% o monto fijo, nunca mayor al subtotal) -> impuesto sobre lo que queda -> total. */
export declare function calcularTotalesVenta(items: ItemVenta[], opciones?: OpcionesVenta): TotalesVenta;
export declare function crearVenta(clienteId: number | null, tipoPago: string, items: ItemVenta[], opciones?: OpcionesVenta): number;
export declare function listarVentas(): unknown[];
export declare function listarVentasConDetalles(): {
    detalles: unknown[];
    abonos: unknown[];
}[];
export declare function ventasDelDia(): number;
export declare function montoVentasDelDia(): number;
export declare function topProductosVendidos(limite?: number): unknown[];
export interface VentaPorDia {
    dia: string;
    ventas: number;
    total: number;
}
/**
 * Serie de ventas de los últimos `dias` días, en orden cronológico ascendente.
 * Genera el calendario completo (incluidos los días sin ventas, con total 0)
 * mediante una CTE recursiva, para que el gráfico del tablero siempre tenga
 * una barra por día y nunca presente huecos.
 */
export declare function ventasPorUltimosDias(dias?: number): VentaPorDia[];
export interface DesglosePago {
    contado: number;
    credito: number;
    total: number;
}
/** Desglose de las ventas de hoy por forma de pago (contado / crédito). */
export declare function pagosDeHoy(): DesglosePago;
export interface DeudorTop {
    nombre: string;
    saldo: number;
}
/** Clientes con saldo pendiente, del mayor al menor (cartera por cobrar). */
export declare function topDeudores(limite?: number): DeudorTop[];
export interface StockBajo {
    nombre: string;
    stock: number;
    categoria: string;
}
/** Productos agotados (stock <= 0): los que hay que reponer cuanto antes. */
export declare function productosAgotados(limite?: number): StockBajo[];
export interface VentaReciente {
    hora: string;
    total: number;
    cliente: string;
    tipoPago: string;
}
/** Últimas ventas registradas (para el feed de actividad del tablero). */
export declare function ultimasVentas(limite?: number): VentaReciente[];
export declare function aplicarAbonoInteligente(clienteId: number, monto: number, nota?: string): {
    aplicado: number;
    restante: number;
    detalles: {
        facturaId: number;
        facturaNumero: string | null;
        montoAplicado: number;
        saldoAntes: number;
        saldoDespues: number;
    }[];
};
export declare function abonosPorCliente(clienteId: number): unknown[];
export declare function registrarFactura(ventaId: number, clienteId: number, monto: number, fecha: string): number;
export declare function actualizarSaldoFactura(facturaId: number, nuevoSaldo: number): boolean;
export declare function obtenerAbonosPorFactura(facturaId: number): unknown[];
export declare function obtenerAbonos(clienteId?: number): unknown[];
export interface ResultadoRespaldo {
    ruta: string;
    fecha: string;
    tamanoBytes: number;
    tablas: number;
}
export interface EstadoRespaldo {
    existe: boolean;
    ultimoRespaldo: string | null;
    tamanoBytes: number;
    automaticos: number;
    carpeta: string;
}
export declare function prepararRespaldoParaRestaurar(ruta: string): {
    ruta: string;
    tablas: number;
    tamanoBytes: number;
    legacy: boolean;
};
export declare function validarRespaldoParaRestaurar(ruta: string): {
    tablas: number;
    tamanoBytes: number;
};
/**
 * Crea una copia SQLite consistente usando VACUUM INTO, nunca copiando pos.db
 * directamente. El resultado se valida antes de considerarlo un respaldo válido.
 */
export declare function crearRespaldo(rutaDestino: string, motivo?: "manual" | "automatico" | "pre-restauracion"): ResultadoRespaldo;
/** Compatibilidad con el botón antiguo de exportación. Ahora crea un SQLite real. */
export declare function exportarRespaldo(rutaDestino: string): ResultadoRespaldo;
export declare function obtenerEstadoRespaldo(): EstadoRespaldo;
export declare function crearRespaldoAutomatico(): ResultadoRespaldo | null;
export declare function restaurarRespaldo(rutaRespaldo: string): {
    ok: true;
    ruta: string;
    tablas: number;
};
export declare function obtenerRutaBaseDatos(): string;
export declare const registrarVenta: typeof crearVenta;
export declare const obtenerVentas: typeof listarVentas;
export declare const obtenerHistorial: typeof listarVentasConDetalles;
export declare const contarVentasDelDia: typeof ventasDelDia;
export declare const abonarCredito: typeof aplicarAbonoInteligente;
//# sourceMappingURL=database.d.ts.map