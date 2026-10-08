// 1. Regla para un Producto del Inventario
export interface Producto {
  id: string;
  nombre: string;
  precio: number;
  stock: number;
  categoria: string;
}

// 2. Regla para un Cliente (útil para ventas al crédito)
export interface Cliente {
  id: string;
  nombre: string;
  limiteCredito: number;
  saldoPendiente: number;
}

// 3. Regla para un Elemento del Carrito de Venta
export interface ItemCarrito {
  producto: Producto;
  cantidad: number;
  subtotal: number;
}