import { db, agregarProducto, listarProductos, editarProducto, eliminarProducto, totalProductos, buscarProductoPorCodigoBarras, codigoBarrasEnUso, normalizarCodigoBarras } from "../db/database.js";
/**
 * Normaliza texto para poder buscarlo y compararlo sin que la tilde o la
 * mayúscula decidan el resultado: "Ropa" debe encontrar "Rôpa".
 * Se aplica NFD (descompone la tilde) y luego se retira el diacrítico.
 */
function normalizar(texto) {
    return String(texto ?? "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .trim()
        .toLowerCase();
}
export class ProductoError extends Error {
    constructor(message) {
        super(message);
        this.name = "ProductoError";
    }
}
function validarDatosProducto(nombre, precio, stock, categoria) {
    if (!nombre || nombre.trim().length < 2)
        throw new ProductoError("El nombre del producto debe tener al menos 2 caracteres.");
    if (precio <= 0)
        throw new ProductoError("El precio debe ser mayor a cero.");
    if (stock < 0)
        throw new ProductoError("El stock no puede ser negativo.");
    if (!categoria || !categoria.trim())
        throw new ProductoError("La categoría es obligatoria.");
}
/**
 * Valida que el código de barras no esté repetido. Solo es obligatorio cuando
 * el producto sí tiene código: se puede trabajar sin él y asignarlo después.
 */
function validarCodigoBarras(codigoBarras, idExcluido = null) {
    const limpio = normalizarCodigoBarras(codigoBarras);
    if (!limpio)
        return null;
    if (limpio.length > 64)
        throw new ProductoError("El código de barras no puede superar los 64 caracteres.");
    const dueno = codigoBarrasEnUso(limpio, idExcluido);
    if (dueno) {
        throw new ProductoError(`El código ${limpio} ya está asignado a "${dueno}". Cada código pertenece a un solo producto.`);
    }
    return limpio;
}
export function crearProducto(nombre, precio, stock, categoria, codigoBarras) {
    validarDatosProducto(nombre, precio, stock, categoria);
    const codigo = validarCodigoBarras(codigoBarras);
    return agregarProducto(nombre.trim(), precio, stock, categoria.trim(), codigo);
}
export function importarProductos(items) {
    if (!Array.isArray(items) || items.length === 0) {
        throw new ProductoError("No hay productos válidos para importar.");
    }
    if (items.length > 5000) {
        throw new ProductoError("La importación no puede superar los 5,000 productos por archivo.");
    }
    const importar = db.transaction(() => {
        items.forEach((item, indice) => {
            try {
                if (!item || !Number.isFinite(item.precio) || item.precio <= 0) {
                    throw new ProductoError("El precio debe ser un número mayor a cero.");
                }
                if (!Number.isInteger(item.stock) || item.stock < 0) {
                    throw new ProductoError("El stock debe ser un número entero igual o mayor a cero.");
                }
                const categoria = String(item.categoria ?? "").trim() || "General";
                const codigoBarras = String(item.codigoBarras ?? "").trim();
                if (codigoBarras && codigoBarras.length < 4) {
                    throw new ProductoError("El código de barras debe tener al menos 4 caracteres.");
                }
                if (/\s/.test(codigoBarras)) {
                    throw new ProductoError("El código de barras no puede contener espacios.");
                }
                crearProducto(String(item.nombre ?? ""), item.precio, item.stock, categoria, codigoBarras);
            }
            catch (error) {
                const mensaje = error instanceof Error ? error.message : "Error desconocido.";
                const filaOrigen = Number.isInteger(item?.filaOrigen) && Number(item.filaOrigen) >= 2
                    ? Number(item.filaOrigen)
                    : indice + 2;
                throw new ProductoError(`Fila ${filaOrigen}: ${mensaje}`);
            }
        });
    });
    importar.immediate();
    return { importados: items.length };
}
/** Resuelve un código de barras al producto que lo tiene asignado. */
export function productoPorCodigoBarras(codigo) {
    const fila = buscarProductoPorCodigoBarras(codigo);
    if (!fila)
        return null;
    return { ...fila, codigoBarras: fila.codigo_barras ?? "" };
}
export function obtenerProductos() {
    return listarProductos();
}
export function buscar(nombre) {
    const todos = listarProductos();
    if (!nombre || !nombre.trim())
        return todos;
    // SQLite no ignora tildes en LIKE, así que la búsqueda se resuelve en memoria
    // con el texto normalizado: escribir "cafe" encuentra "Café".
    const aguja = normalizar(nombre);
    if (!aguja)
        return todos;
    return todos.filter((p) => normalizar(p.nombre).includes(aguja) || normalizar(p.categoria).includes(aguja) ||
        normalizar(p.codigo).includes(aguja));
}
export function actualizarProducto(id, nombre, precio, stock, categoria, codigoBarras) {
    validarDatosProducto(nombre, precio, stock, categoria);
    // `undefined` significa "no tocar el código"; `null` o vacío lo borra.
    const codigo = codigoBarras === undefined ? undefined : validarCodigoBarras(codigoBarras, id);
    return editarProducto(id, nombre.trim(), precio, stock, categoria.trim(), codigo);
}
export function borrarProducto(id) {
    return eliminarProducto(id);
}
export function contarProductos() {
    return totalProductos();
}
/* ---------- Funciones nuevas tipo POS ---------- */
export async function obtenerProductoPorId(id) {
    const productos = (await listarProductos());
    return productos.find((p) => p.id === id);
}
export async function productosBajoStock(umbral = 5) {
    const productos = (await listarProductos());
    return productos.filter((p) => p.stock <= umbral);
}
export async function valorTotalInventario() {
    const productos = (await listarProductos());
    return productos.reduce((acc, p) => acc + p.precio * p.stock, 0);
}
export async function productosPorCategoria(categoria) {
    const productos = (await listarProductos());
    const objetivo = normalizar(categoria);
    if (!objetivo)
        return productos;
    return productos.filter((p) => normalizar(p.categoria) === objetivo);
}
export async function ajustarStock(id, cantidad) {
    const producto = await obtenerProductoPorId(id);
    if (!producto)
        throw new ProductoError(`No se encontró un producto con id ${id}.`);
    const nuevoStock = producto.stock + cantidad;
    if (nuevoStock < 0)
        throw new ProductoError("No hay suficiente stock disponible para esta operación.");
    return editarProducto(id, producto.nombre, producto.precio, nuevoStock, producto.categoria);
}
export async function venderProducto(id, cantidad) {
    if (cantidad <= 0)
        throw new ProductoError("La cantidad a vender debe ser mayor a cero.");
    return ajustarStock(id, -cantidad);
}
export async function reabastecerProducto(id, cantidad) {
    if (cantidad <= 0)
        throw new ProductoError("La cantidad a reabastecer debe ser mayor a cero.");
    return ajustarStock(id, cantidad);
}
//# sourceMappingURL=productos.js.map