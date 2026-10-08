import { db } from "../db/database.js";
import { obtenerConfiguracion } from "../configuracion/configuracion.js";
// ===== Módulo de Compras e Inventario: proveedores, compras y kardex =====
db.exec(`
  CREATE TABLE IF NOT EXISTS proveedores (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT NOT NULL,
    contacto TEXT DEFAULT '',
    telefono TEXT DEFAULT '',
    correo TEXT DEFAULT '',
    direccion TEXT DEFAULT '',
    notas TEXT DEFAULT '',
    creado TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
  )
`);
db.exec(`
  CREATE TABLE IF NOT EXISTS compras (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    proveedor_id INTEGER,
    folio TEXT NOT NULL,
    fecha TEXT NOT NULL,
    subtotal REAL NOT NULL DEFAULT 0,
    impuesto REAL NOT NULL DEFAULT 0,
    total REAL NOT NULL DEFAULT 0,
    notas TEXT DEFAULT '',
    FOREIGN KEY (proveedor_id) REFERENCES proveedores(id)
  )
`);
db.exec(`
  CREATE TABLE IF NOT EXISTS compra_detalles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    compra_id INTEGER NOT NULL,
    producto_id INTEGER NOT NULL,
    nombre TEXT NOT NULL,
    cantidad INTEGER NOT NULL,
    costo REAL NOT NULL DEFAULT 0,
    importe REAL NOT NULL DEFAULT 0,
    FOREIGN KEY (compra_id) REFERENCES compras(id),
    FOREIGN KEY (producto_id) REFERENCES productos(id)
  )
`);
db.exec(`
  CREATE TABLE IF NOT EXISTS producto_costos (
    producto_id INTEGER PRIMARY KEY,
    costo REAL NOT NULL DEFAULT 0,
    actualizado TEXT NOT NULL
  )
`);
db.exec(`
  CREATE TABLE IF NOT EXISTS inventario_movimientos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    producto_id INTEGER NOT NULL,
    tipo TEXT NOT NULL,
    cantidad INTEGER NOT NULL,
    stock_resultante INTEGER NOT NULL DEFAULT 0,
    motivo TEXT DEFAULT '',
    referencia TEXT DEFAULT '',
    fecha TEXT NOT NULL,
    FOREIGN KEY (producto_id) REFERENCES productos(id)
  )
`);
export class CompraError extends Error {
    constructor(message) {
        super(message);
        this.name = "CompraError";
    }
}
export const TIPOS_AJUSTE = ["ajuste", "merma", "devolucion", "entrada", "salida"];
// Fecha/hora local (no UTC) para que coincida con datetime('now','localtime')
// usado por el resto de la base de datos.
function ahora() {
    const f = new Date();
    const p = (n) => String(n).padStart(2, "0");
    return (`${f.getFullYear()}-${p(f.getMonth() + 1)}-${p(f.getDate())} ` +
        `${p(f.getHours())}:${p(f.getMinutes())}:${p(f.getSeconds())}`);
}
function redondear(n) {
    return Math.round((n + Number.EPSILON) * 100) / 100;
}
function validarProveedor(datos) {
    if (!datos.nombre || datos.nombre.trim().length < 2) {
        throw new CompraError("El nombre del proveedor debe tener al menos 2 caracteres.");
    }
    if (datos.telefono && !/^[0-9+\-\s()]{7,20}$/.test(datos.telefono.trim())) {
        throw new CompraError("El teléfono del proveedor no tiene un formato válido.");
    }
    if (datos.correo && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(datos.correo.trim())) {
        throw new CompraError("El correo del proveedor no tiene un formato válido.");
    }
}
export function listarProveedores() {
    return db.prepare("SELECT * FROM proveedores ORDER BY nombre").all();
}
export function obtenerProveedor(id) {
    const fila = db.prepare("SELECT * FROM proveedores WHERE id = ?").get(id);
    return fila ? fila : null;
}
export function buscarProveedores(texto) {
    const q = "%" + String(texto || "").trim() + "%";
    return db.prepare("SELECT * FROM proveedores WHERE nombre LIKE ? OR contacto LIKE ? ORDER BY nombre").all(q, q);
}
export function crearProveedor(datos) {
    validarProveedor(datos);
    const res = db
        .prepare("INSERT INTO proveedores (nombre, contacto, telefono, correo, direccion, notas, creado) VALUES (?, ?, ?, ?, ?, ?, ?)")
        .run(datos.nombre.trim(), (datos.contacto || "").trim(), (datos.telefono || "").trim(), (datos.correo || "").trim(), (datos.direccion || "").trim(), (datos.notas || "").trim(), ahora());
    const proveedor = obtenerProveedor(Number(res.lastInsertRowid));
    if (!proveedor)
        throw new CompraError("No se pudo registrar el proveedor.");
    return proveedor;
}
export function actualizarProveedor(id, datos) {
    validarProveedor(datos);
    if (!obtenerProveedor(id))
        throw new CompraError("El proveedor indicado no existe.");
    db.prepare("UPDATE proveedores SET nombre = ?, contacto = ?, telefono = ?, correo = ?, direccion = ?, notas = ? WHERE id = ?")
        .run(datos.nombre.trim(), (datos.contacto || "").trim(), (datos.telefono || "").trim(), (datos.correo || "").trim(), (datos.direccion || "").trim(), (datos.notas || "").trim(), id);
    const proveedor = obtenerProveedor(id);
    if (!proveedor)
        throw new CompraError("No se pudo actualizar el proveedor.");
    return proveedor;
}
export function borrarProveedor(id) {
    const usados = db.prepare("SELECT COUNT(*) AS n FROM compras WHERE proveedor_id = ?").get(id);
    if (Number(usados.n) > 0) {
        throw new CompraError("No se puede eliminar: el proveedor tiene compras registradas.");
    }
    db.prepare("DELETE FROM proveedores WHERE id = ?").run(id);
    return true;
}
export function obtenerCostoProducto(productoId) {
    const fila = db.prepare("SELECT costo FROM producto_costos WHERE producto_id = ?").get(productoId);
    return fila ? Number(fila.costo) || 0 : 0;
}
function guardarCosto(productoId, costo) {
    db.prepare("INSERT INTO producto_costos (producto_id, costo, actualizado) VALUES (?, ?, ?) ON CONFLICT(producto_id) DO UPDATE SET costo = excluded.costo, actualizado = excluded.actualizado").run(productoId, redondear(costo), ahora());
}
function registrarMovimiento(productoId, tipo, cantidad, stockResultante, motivo, referencia) {
    db.prepare("INSERT INTO inventario_movimientos (producto_id, tipo, cantidad, stock_resultante, motivo, referencia, fecha) VALUES (?, ?, ?, ?, ?, ?, ?)").run(productoId, tipo, cantidad, stockResultante, motivo, referencia, ahora());
}
export function registrarCompra(datos) {
    const items = Array.isArray(datos.items) ? datos.items : [];
    if (items.length === 0)
        throw new CompraError("La compra debe incluir al menos un producto.");
    items.forEach((item) => {
        if (!Number.isFinite(item.cantidad) || item.cantidad <= 0) {
            throw new CompraError("La cantidad de cada producto debe ser mayor a cero.");
        }
        if (!Number.isFinite(item.costo) || item.costo < 0) {
            throw new CompraError("El costo de cada producto no puede ser negativo.");
        }
    });
    const pct = Number.isFinite(datos.impuestoPct) && datos.impuestoPct > 0 ? datos.impuestoPct : 0;
    if (datos.proveedorId !== null && datos.proveedorId !== undefined && !obtenerProveedor(Number(datos.proveedorId))) {
        throw new CompraError("El proveedor indicado no existe.");
    }
    const folio = datos.folio && datos.folio.trim() ? datos.folio.trim() : "C-" + Date.now();
    const notas = datos.notas ? datos.notas.trim() : "";
    const fecha = ahora();
    const ejecutar = db.transaction(() => {
        const subtotal = redondear(items.reduce((s, i) => s + i.cantidad * i.costo, 0));
        const impuesto = redondear(subtotal * (pct / 100));
        const total = redondear(subtotal + impuesto);
        const proveedor = datos.proveedorId === null || datos.proveedorId === undefined ? null : Number(datos.proveedorId);
        const res = db
            .prepare("INSERT INTO compras (proveedor_id, folio, fecha, subtotal, impuesto, total, notas) VALUES (?, ?, ?, ?, ?, ?, ?)")
            .run(proveedor, folio, fecha, subtotal, impuesto, total, notas);
        const compraId = Number(res.lastInsertRowid);
        items.forEach((item) => {
            const producto = db.prepare("SELECT id, nombre, stock, precio FROM productos WHERE id = ?").get(item.productoId);
            if (!producto)
                throw new CompraError("El producto con id " + item.productoId + " no existe.");
            const cantidad = Math.round(item.cantidad);
            const costo = redondear(item.costo);
            const importe = redondear(cantidad * costo);
            db.prepare("INSERT INTO compra_detalles (compra_id, producto_id, nombre, cantidad, costo, importe) VALUES (?, ?, ?, ?, ?, ?)")
                .run(compraId, producto.id, producto.nombre, cantidad, costo, importe);
            const stockPrevio = Number(producto.stock) || 0;
            const costoPrevio = obtenerCostoProducto(producto.id);
            const nuevoStock = stockPrevio + cantidad;
            // Costo promedio ponderado: valoriza el stock anterior más la entrada nueva
            const costoPromedio = nuevoStock > 0 ? redondear((stockPrevio * costoPrevio + cantidad * costo) / nuevoStock) : costo;
            db.prepare("UPDATE productos SET stock = ? WHERE id = ?").run(nuevoStock, producto.id);
            guardarCosto(producto.id, costoPromedio);
            registrarMovimiento(producto.id, "compra", cantidad, nuevoStock, "Compra " + folio, folio);
        });
        return { compraId, folio, subtotal, impuesto, total, items: items.length };
    });
    return ejecutar();
}
export function obtenerCompras(limite = 30) {
    const tope = Number.isFinite(limite) && limite > 0 ? Math.floor(limite) : 30;
    return db
        .prepare(`SELECT c.id, c.folio, c.fecha, c.subtotal, c.impuesto, c.total, c.notas,
              COALESCE(p.nombre, 'Sin proveedor') AS proveedor,
              (SELECT COUNT(*) FROM compra_detalles d WHERE d.compra_id = c.id) AS items
       FROM compras c
       LEFT JOIN proveedores p ON p.id = c.proveedor_id
       ORDER BY c.id DESC LIMIT ?`)
        .all(tope);
}
export function detallesCompra(compraId) {
    return db
        .prepare("SELECT id, producto_id, nombre, cantidad, costo, importe FROM compra_detalles WHERE compra_id = ? ORDER BY id")
        .all(compraId);
}
export function ajustarInventario(productoId, cantidad, motivo, tipo = "ajuste") {
    const producto = db.prepare("SELECT id, nombre, stock, precio FROM productos WHERE id = ?").get(productoId);
    if (!producto)
        throw new CompraError("El producto indicado no existe.");
    if (TIPOS_AJUSTE.indexOf(tipo) === -1)
        throw new CompraError("El tipo de movimiento no es válido.");
    const delta = Number(cantidad);
    if (!Number.isInteger(delta) || delta === 0) {
        throw new CompraError("La cantidad del ajuste debe ser un número entero distinto de cero.");
    }
    const stockPrevio = Number(producto.stock) || 0;
    const nuevoStock = stockPrevio + delta;
    if (nuevoStock < 0)
        throw new CompraError("El movimiento dejaría el stock en negativo.");
    const ejecutar = db.transaction(() => {
        db.prepare("UPDATE productos SET stock = ? WHERE id = ?").run(nuevoStock, producto.id);
        registrarMovimiento(producto.id, tipo, delta, nuevoStock, motivo && motivo.trim() ? motivo.trim() : "Ajuste manual", "");
    });
    ejecutar();
    return { productoId: producto.id, nombre: producto.nombre, stockAnterior: stockPrevio, stockActual: nuevoStock };
}
export function obtenerMovimientosInventario(productoId, limite = 60) {
    const tope = Number.isFinite(limite) && limite > 0 ? Math.floor(limite) : 60;
    if (productoId !== undefined && productoId !== null && Number(productoId) > 0) {
        return db
            .prepare(`SELECT m.*, COALESCE(p.nombre, '') AS producto FROM inventario_movimientos m
         LEFT JOIN productos p ON p.id = m.producto_id
         WHERE m.producto_id = ? ORDER BY m.id DESC LIMIT ?`)
            .all(Number(productoId), tope);
    }
    return db
        .prepare(`SELECT m.*, COALESCE(p.nombre, '') AS producto FROM inventario_movimientos m
       LEFT JOIN productos p ON p.id = m.producto_id
       ORDER BY m.id DESC LIMIT ?`)
        .all(tope);
}
export function stockCritico(umbral) {
    const config = obtenerConfiguracion();
    const tope = Number.isFinite(umbral) && Number(umbral) >= 0 ? Number(umbral) : config.stockMinimo;
    return db
        .prepare(`SELECT p.id, p.nombre, p.stock, p.precio, COALESCE(p.categoria, '') AS categoria, COALESCE(c.costo, 0) AS costo
       FROM productos p
       LEFT JOIN producto_costos c ON c.producto_id = p.id
       WHERE p.stock <= ?
       ORDER BY p.stock ASC, p.nombre ASC`)
        .all(tope);
}
export function inventarioValorizado() {
    const fila = db
        .prepare(`SELECT COALESCE(SUM(p.stock * COALESCE(c.costo, 0)), 0) AS costo,
              COALESCE(SUM(p.stock * p.precio), 0) AS venta,
              COALESCE(SUM(CASE WHEN p.stock > 0 AND c.producto_id IS NULL THEN 1 ELSE 0 END), 0) AS productosSinCosto
       FROM productos p
       LEFT JOIN producto_costos c ON c.producto_id = p.id`)
        .get();
    const costo = redondear(Number(fila.costo) || 0);
    const venta = redondear(Number(fila.venta) || 0);
    return {
        costo,
        venta,
        margen: redondear(venta - costo),
        productosSinCosto: Number(fila.productosSinCosto) || 0
    };
}
//# sourceMappingURL=compras.js.map