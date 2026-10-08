import type { TipoPago, ItemVenta } from "../db/database.js";
import { listarVentas, listarVentasConDetalles, ventasDelDia, montoVentasDelDia, topProductosVendidos } from "../db/database.js";
export declare function registrarVenta(clienteId: number | null, tipoPago: TipoPago, items: ItemVenta[]): number;
export { listarVentas as obtenerVentas };
export { listarVentasConDetalles as obtenerHistorial };
export { ventasDelDia as contarVentasDelDia };
export { montoVentasDelDia };
export { topProductosVendidos };
//# sourceMappingURL=ventas.d.ts.map