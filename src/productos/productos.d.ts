export interface Producto {
    id: number;
    codigo: string;
    codigoBarras: string;
    nombre: string;
    precio: number;
    stock: number;
    categoria: string;
}
export interface ProductoImportacion {
    nombre: string;
    precio: number;
    stock: number;
    categoria: string;
    codigoBarras?: string | null;
    filaOrigen?: number;
}
export declare class ProductoError extends Error {
    constructor(message: string);
}
export declare function crearProducto(nombre: string, precio: number, stock: number, categoria: string, codigoBarras?: string | null): import("better-sqlite3").RunResult;
export declare function importarProductos(items: ProductoImportacion[]): {
    importados: number;
};
/** Resuelve un código de barras al producto que lo tiene asignado. */
export declare function productoPorCodigoBarras(codigo: string): Producto | null;
export declare function obtenerProductos(): unknown[];
export declare function buscar(nombre: string): Producto[];
export declare function actualizarProducto(id: number, nombre: string, precio: number, stock: number, categoria: string, codigoBarras?: string | null): import("better-sqlite3").RunResult;
export declare function borrarProducto(id: number): import("better-sqlite3").RunResult;
export declare function contarProductos(): number;
export declare function obtenerProductoPorId(id: number): Promise<Producto | undefined>;
export declare function productosBajoStock(umbral?: number): Promise<Producto[]>;
export declare function valorTotalInventario(): Promise<number>;
export declare function productosPorCategoria(categoria: string): Promise<Producto[]>;
export declare function ajustarStock(id: number, cantidad: number): Promise<import("better-sqlite3").RunResult>;
export declare function venderProducto(id: number, cantidad: number): Promise<import("better-sqlite3").RunResult>;
export declare function reabastecerProducto(id: number, cantidad: number): Promise<import("better-sqlite3").RunResult>;
//# sourceMappingURL=productos.d.ts.map