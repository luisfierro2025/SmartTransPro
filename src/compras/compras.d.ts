export interface Proveedor {
    id: number;
    nombre: string;
    contacto: string;
    telefono: string;
    correo: string;
    direccion: string;
    notas: string;
    creado: string;
}
export interface DatosProveedor {
    nombre: string;
    contacto: string;
    telefono: string;
    correo: string;
    direccion: string;
    notas: string;
}
export interface ItemCompra {
    productoId: number;
    cantidad: number;
    costo: number;
}
export interface MovimientoInventario {
    id: number;
    producto_id: number;
    tipo: string;
    cantidad: number;
    stock_resultante: number;
    motivo: string;
    referencia: string;
    fecha: string;
}
export interface ProductoCritico {
    id: number;
    nombre: string;
    stock: number;
    precio: number;
    categoria: string;
    costo: number;
}
export declare class CompraError extends Error {
    constructor(message: string);
}
export declare const TIPOS_AJUSTE: string[];
export declare function listarProveedores(): Proveedor[];
export declare function obtenerProveedor(id: number): Proveedor | null;
export declare function buscarProveedores(texto: string): Proveedor[];
export declare function crearProveedor(datos: DatosProveedor): Proveedor;
export declare function actualizarProveedor(id: number, datos: DatosProveedor): Proveedor;
export declare function borrarProveedor(id: number): boolean;
export interface CompraRegistrada {
    compraId: number;
    folio: string;
    subtotal: number;
    impuesto: number;
    total: number;
    items: number;
}
export declare function obtenerCostoProducto(productoId: number): number;
export declare function registrarCompra(datos: {
    proveedorId: number | null;
    folio: string;
    notas: string;
    impuestoPct: number;
    items: ItemCompra[];
}): CompraRegistrada;
export declare function obtenerCompras(limite?: number): Array<{
    id: number;
    folio: string;
    fecha: string;
    subtotal: number;
    impuesto: number;
    total: number;
    notas: string;
    proveedor: string;
    items: number;
}>;
export declare function detallesCompra(compraId: number): Array<{
    id: number;
    producto_id: number;
    nombre: string;
    cantidad: number;
    costo: number;
    importe: number;
}>;
export declare function ajustarInventario(productoId: number, cantidad: number, motivo: string, tipo?: string): {
    productoId: number;
    nombre: string;
    stockAnterior: number;
    stockActual: number;
};
export declare function obtenerMovimientosInventario(productoId?: number, limite?: number): (MovimientoInventario & {
    producto: string;
})[];
export declare function stockCritico(umbral?: number): ProductoCritico[];
export declare function inventarioValorizado(): {
    costo: number;
    venta: number;
    margen: number;
    productosSinCosto: number;
};
//# sourceMappingURL=compras.d.ts.map