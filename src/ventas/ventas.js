import { crearVenta, registrarFactura, listarVentas, listarVentasConDetalles, ventasDelDia, montoVentasDelDia, topProductosVendidos } from "../db/database.js";
export function registrarVenta(clienteId, tipoPago, items) {
    // Fecha/hora local (no UTC) para que coincida con datetime('now','localtime')
    // de la tabla ventas; en UTC las facturas quedaban "a futuro" y se salían de
    // los rangos que usa el resumen de caja y los reportes.
    const f = new Date();
    const p = (n) => String(n).padStart(2, "0");
    const fecha = `${f.getFullYear()}-${p(f.getMonth() + 1)}-${p(f.getDate())} ` +
        `${p(f.getHours())}:${p(f.getMinutes())}:${p(f.getSeconds())}`;
    const ventaId = crearVenta(clienteId, tipoPago, items);
    // Si la venta es al crédito, registrar la factura asociada
    if (tipoPago === "credito" && clienteId !== null) {
        const total = items.reduce((sum, item) => sum + item.precio * item.cantidad, 0);
        registrarFactura(ventaId, clienteId, total, fecha);
    }
    return ventaId;
}
// Re-exportaciones para el resumen del dashboard y el historial de ventas
export { listarVentas as obtenerVentas };
export { listarVentasConDetalles as obtenerHistorial };
export { ventasDelDia as contarVentasDelDia };
export { montoVentasDelDia };
export { topProductosVendidos };
//# sourceMappingURL=ventas.js.map