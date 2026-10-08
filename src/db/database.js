import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import Database from "better-sqlite3";
// Recrear __filename y __dirname para ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// `require` no existe dentro de un módulo ESM. createRequire lo habilita sin
// salir de ESM, necesario para leer app.getPath("userData") al empaquetar.
const requireESM = createRequire(import.meta.url);
/** Indica si se puede escribir en la carpeta destino (necesario para SQLite). */
function carpetaEscribible(dir) {
    try {
        fs.mkdirSync(dir, { recursive: true });
        fs.accessSync(dir, fs.constants.W_OK);
        return true;
    }
    catch {
        return false;
    }
}
function resolverRutaDb() {
    // Permite apuntar a otra base de datos (verificaciones y pruebas) sin tocar
    // la base real del negocio: POS_DB_PATH=C:\ruta\copia.db
    const rutaAlterna = process.env.POS_DB_PATH;
    if (rutaAlterna && rutaAlterna.trim())
        return path.resolve(rutaAlterna.trim());
    // Carpeta de datos del usuario. Es la única ubicación escribiente cuando la
    // app está instalada (Program Files es de solo lectura).
    let carpetaUsuario = null;
    try {
        const electron = requireESM("electron");
        if (electron && electron.app && electron.app.getPath) {
            carpetaUsuario = electron.app.getPath("userData");
        }
    }
    catch {
        // Sin Electron disponible (pruebas con node puro)
    }
    // Ruta del proyecto, usada en desarrollo.
    const rutaProyecto = path.resolve(__dirname, "..", "..", "pos.db");
    const carpetaProyecto = path.dirname(rutaProyecto);
    // Al empaquetar, la ruta del proyecto cae DENTRO de app.asar, que es de solo
    // lectura: SQLite no puede abrir la base ahí y la app no arranca. Por eso se
    // comprueba la escritura antes de elegir la ruta.
    if (carpetaEscribible(carpetaProyecto))
        return rutaProyecto;
    if (carpetaUsuario && carpetaEscribible(carpetaUsuario)) {
        return path.join(carpetaUsuario, "pos.db");
    }
    throw new Error("No se encontró una carpeta escribible para la base de datos. " +
        `Probado: ${carpetaProyecto} y ${carpetaUsuario ?? "(sin carpeta de usuario)"}`);
}
const rutaDb = resolverRutaDb();
export const db = new Database(rutaDb);
db.pragma("journal_mode = WAL");
db.exec(`
  CREATE TABLE IF NOT EXISTS clientes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT NOT NULL,
    telefono TEXT,
    direccion TEXT,
    correo TEXT,
    limite_credito REAL NOT NULL DEFAULT 0,
    saldo_pendiente REAL NOT NULL DEFAULT 0,
    codigo TEXT
  )
`);
db.exec(`
  CREATE TABLE IF NOT EXISTS productos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT NOT NULL,
    precio REAL NOT NULL DEFAULT 0,
    stock INTEGER NOT NULL DEFAULT 0,
    categoria TEXT
  )
`);
// Migración: incorporar código interno a productos existentes.
(function asegurarCodigoProductos() {
    const columnas = db.prepare("PRAGMA table_info(productos)").all();
    if (!columnas.some((c) => c.name === "codigo")) {
        db.exec("ALTER TABLE productos ADD COLUMN codigo TEXT");
    }
    db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_productos_codigo ON productos(codigo)");
    const pendientes = db.prepare("SELECT id FROM productos WHERE codigo IS NULL OR trim(codigo) = '' ORDER BY id ASC").all();
    const asignar = db.prepare("UPDATE productos SET codigo = ? WHERE id = ?");
    const rellenar = db.transaction(() => {
        for (const producto of pendientes) {
            asignar.run(`PRD-${String(producto.id).padStart(5, "0")}`, producto.id);
        }
    });
    rellenar();
})();
// Migración: código de barras del producto.
// Es una columna APARTE del código interno `codigo` porque este lo genera la
// aplicación (PRD-00001) y el de barras viene impreso en el producto del
// proveedor (EAN-13, UPC-A, Code 39...) y lo captura el escáner del POS.
(function asegurarCodigoBarrasProductos() {
    const columnas = db.prepare("PRAGMA table_info(productos)").all();
    if (!columnas.some((c) => c.name === "codigo_barras")) {
        db.exec("ALTER TABLE productos ADD COLUMN codigo_barras TEXT");
    }
    // Un mismo código no puede pertenecer a dos productos. Si una base antigua
    // trajera duplicados se cae a un índice normal: es preferible permitir el
    // duplico a impedir que la aplicación no abra.
    try {
        db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_productos_codigo_barras ON productos(codigo_barras)");
    }
    catch {
        db.exec("CREATE INDEX IF NOT EXISTS idx_productos_codigo_barras ON productos(codigo_barras)");
    }
    // Sin código se guarda NULL y no texto vacío: SQLite considera duplicados a
    // los vacíos en un índice único, y casi todos los productos los tendrán.
    db.exec("UPDATE productos SET codigo_barras = NULL WHERE TRIM(COALESCE(codigo_barras, '')) = ''");
})();
db.exec(`
  CREATE TABLE IF NOT EXISTS ventas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    cliente_id INTEGER,
    total REAL NOT NULL DEFAULT 0,
    tipo_pago TEXT NOT NULL DEFAULT 'contado',
    fecha TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
    FOREIGN KEY (cliente_id) REFERENCES clientes(id)
  )
`);
db.exec(`
  CREATE TABLE IF NOT EXISTS venta_detalles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    venta_id INTEGER NOT NULL,
    producto_id INTEGER,
    nombre TEXT NOT NULL,
    precio REAL NOT NULL,
    cantidad INTEGER NOT NULL,
    subtotal REAL NOT NULL,
    FOREIGN KEY (venta_id) REFERENCES ventas(id),
    FOREIGN KEY (producto_id) REFERENCES productos(id)
  )
`);
// Migración: bases de datos creadas antes de "producto común" tienen
// venta_detalles.producto_id como NOT NULL. Como CREATE TABLE IF NOT EXISTS
// no modifica una tabla que ya existe, aquí se recrea preservando todos los
// datos si todavía tiene la restricción vieja (se salta si ya está corregida).
(function migrarVentaDetallesProductoIdNulleable() {
    const columnas = db.prepare("PRAGMA table_info(venta_detalles)").all();
    const columnaProductoId = columnas.find((c) => c.name === "producto_id");
    if (!columnaProductoId || columnaProductoId.notnull === 0)
        return;
    const migrar = db.transaction(() => {
        db.exec(`
      CREATE TABLE venta_detalles_nueva (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        venta_id INTEGER NOT NULL,
        producto_id INTEGER,
        nombre TEXT NOT NULL,
        precio REAL NOT NULL,
        cantidad INTEGER NOT NULL,
        subtotal REAL NOT NULL,
        FOREIGN KEY (venta_id) REFERENCES ventas(id),
        FOREIGN KEY (producto_id) REFERENCES productos(id)
      )
    `);
        db.exec(`
      INSERT INTO venta_detalles_nueva (id, venta_id, producto_id, nombre, precio, cantidad, subtotal)
      SELECT id, venta_id, producto_id, nombre, precio, cantidad, subtotal FROM venta_detalles
    `);
        db.exec("DROP TABLE venta_detalles");
        db.exec("ALTER TABLE venta_detalles_nueva RENAME TO venta_detalles");
    });
    migrar();
})();
// Migración: cada venta guarda su desglose (subtotal, descuento, impuesto) para que el recibo
// y los reportes no tengan que recalcularlo. Las ventas anteriores quedan con subtotal = total
// y descuento/impuesto en 0, así que su historial no cambia.
(function asegurarColumnasImpuestoDescuento() {
    const cols = db.prepare("PRAGMA table_info(ventas)").all().map((c) => c.name);
    const nuevas = [["subtotal", "REAL"], ["descuento", "REAL NOT NULL DEFAULT 0"], ["impuesto_pct", "REAL NOT NULL DEFAULT 0"], ["impuesto", "REAL NOT NULL DEFAULT 0"]];
    nuevas.forEach(([nombre, def]) => { if (!cols.includes(nombre))
        db.exec(`ALTER TABLE ventas ADD COLUMN ${nombre} ${def}`); });
    db.exec("UPDATE ventas SET subtotal = total WHERE subtotal IS NULL");
})();
db.exec(`
  CREATE TABLE IF NOT EXISTS facturas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    cliente_id INTEGER NOT NULL,
    total REAL NOT NULL DEFAULT 0,
    saldo_pendiente REAL NOT NULL DEFAULT 0,
    fecha TEXT NOT NULL,
    tipo_pago TEXT NOT NULL DEFAULT 'credito',
    venta_id INTEGER,
    FOREIGN KEY (cliente_id) REFERENCES clientes(id),
    FOREIGN KEY (venta_id) REFERENCES ventas(id)
  )
`);
db.exec(`
  CREATE TABLE IF NOT EXISTS abonos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    cliente_id INTEGER NOT NULL,
    monto REAL NOT NULL,
    fecha TEXT NOT NULL,
    descripcion TEXT DEFAULT '',
    factura_id INTEGER,
    FOREIGN KEY (cliente_id) REFERENCES clientes(id),
    FOREIGN KEY (factura_id) REFERENCES facturas(id)
  )
`);
// --- Nomenclatura de facturas (FCT-0001) ------------------------------------
// Toda factura (crédito o contado) lleva un número consecutivo con formato
// FCT-0001. La columna `numero` se agrega por migración para bases existentes.
function asegurarColumnaNumeroFacturas() {
    const columnas = db.prepare("PRAGMA table_info(facturas)").all();
    if (columnas.some((c) => c.name === "numero"))
        return;
    db.exec("ALTER TABLE facturas ADD COLUMN numero TEXT");
    // Rellenar las facturas ya existentes respetando su orden de creación.
    const existentes = db.prepare("SELECT id FROM facturas ORDER BY id ASC").all();
    const asignar = db.prepare("UPDATE facturas SET numero = ? WHERE id = ?");
    const rellenar = db.transaction(() => {
        existentes.forEach((f, i) => asignar.run(`FCT-${String(i + 1).padStart(4, "0")}`, f.id));
    });
    rellenar();
}
// Genera el siguiente número de factura con formato FCT-0001, basándose en el
// último número existente (no en el id, para que sea un consecutivo propio).
export function siguienteNumeroFactura() {
    const fila = db.prepare("SELECT numero FROM facturas WHERE numero LIKE 'FCT-%' ORDER BY id DESC LIMIT 1").get();
    const ultimo = fila ? parseInt(fila.numero.replace("FCT-", ""), 10) : 0;
    return `FCT-${String((Number.isNaN(ultimo) ? 0 : ultimo) + 1).padStart(4, "0")}`;
}
// --- Código de cliente (CLI-0001) -------------------------------------------
// Cada cliente tiene un código propio e irrepetible, con formato CLI-0001, para
// poder distinguir clientes que se llaman igual. La columna `codigo` se agrega
// por migración para las bases ya existentes y se rellena respetando el orden
// de creación (id ascendente) para que los códigos sean estables.
function asegurarColumnaCodigoClientes() {
    const columnas = db.prepare("PRAGMA table_info(clientes)").all();
    if (columnas.some((c) => c.name === "codigo"))
        return;
    db.exec("ALTER TABLE clientes ADD COLUMN codigo TEXT");
    const existentes = db.prepare("SELECT id FROM clientes ORDER BY id ASC").all();
    const asignar = db.prepare("UPDATE clientes SET codigo = ? WHERE id = ?");
    const rellenar = db.transaction(() => {
        existentes.forEach((c, i) => asignar.run(`CLI-${String(i + 1).padStart(4, "0")}`, c.id));
    });
    rellenar();
}
// Genera el siguiente código de cliente con formato CLI-0001, basándose en el
// último código existente (no en el id, para que sea un consecutivo propio).
export function siguienteCodigoCliente() {
    const fila = db.prepare("SELECT codigo FROM clientes WHERE codigo LIKE 'CLI-%' ORDER BY codigo DESC LIMIT 1").get();
    const ultimo = fila ? parseInt(fila.codigo.replace("CLI-", ""), 10) : 0;
    return `CLI-${String((Number.isNaN(ultimo) ? 0 : ultimo) + 1).padStart(4, "0")}`;
}
// --- Migración: facturas para saldos históricos -----------------------------
// Las ventas a crédito registradas antes de existir el módulo de facturas solo
// incrementaban clientes.saldo_pendiente sin crear fila en `facturas`. Eso
// provocaba que la ficha del cliente dijera "Sin facturas pendientes" aunque
// tuviera deuda, y que los abonos FIFO quedaran "Sin referencia registrada".
// Esta rutina reconstruye las facturas a partir de las ventas a crédito sin
// factura (las más antiguas primero, mismo criterio FIFO de los abonos),
// respetando el saldo pendiente actual del cliente. Es idempotente: solo
// procesa clientes que no tienen facturas pendientes.
asegurarColumnaNumeroFacturas();
asegurarColumnaCodigoClientes();
function migrarSaldosHistoricosAFacturas() {
    const clientesConSaldo = db.prepare("SELECT id, saldo_pendiente FROM clientes WHERE saldo_pendiente > 0.009").all();
    for (const cliente of clientesConSaldo) {
        const filaPendiente = db.prepare("SELECT COALESCE(SUM(saldo_pendiente), 0) AS total FROM facturas WHERE cliente_id = ?").get(cliente.id);
        const pendienteEnFacturas = redondearDinero(filaPendiente ? filaPendiente.total : 0);
        if (pendienteEnFacturas > 0.009)
            continue; // ya tiene facturas: no tocar
        const restante = redondearDinero(cliente.saldo_pendiente);
        if (restante <= 0.009)
            continue;
        const ventasCredito = db.prepare(`
      SELECT v.id, v.total, v.fecha
      FROM ventas v
      LEFT JOIN facturas f ON f.venta_id = v.id
      WHERE v.cliente_id = ? AND v.tipo_pago = 'credito' AND f.id IS NULL
      ORDER BY v.fecha ASC, v.id ASC
    `).all(cliente.id);
        const insertarFactura = db.prepare("INSERT INTO facturas (cliente_id, total, saldo_pendiente, fecha, tipo_pago, venta_id, numero) VALUES (?, ?, ?, ?, 'credito', ?, ?)");
        const migrar = db.transaction(() => {
            let porAplicar = restante;
            for (const venta of ventasCredito) {
                if (porAplicar <= 0.009)
                    break;
                const saldoVenta = redondearDinero(Math.min(venta.total, porAplicar));
                insertarFactura.run(cliente.id, redondearDinero(venta.total), saldoVenta, venta.fecha, venta.id, siguienteNumeroFactura());
                porAplicar = redondearDinero(porAplicar - saldoVenta);
            }
            // Saldo que no corresponde a ninguna venta a crédito registrada: se
            // conserva como factura de "saldo histórico" para no perder la deuda.
            if (porAplicar > 0.009) {
                const filaBase = ventasCredito[0];
                const fechaBase = filaBase ? filaBase.fecha : fechaHoraLocal();
                insertarFactura.run(cliente.id, redondearDinero(porAplicar), redondearDinero(porAplicar), fechaBase, null, siguienteNumeroFactura());
            }
        });
        migrar();
    }
}
// Se ejecuta una vez al inicializar la base de datos.
migrarSaldosHistoricosAFacturas();
export function obtenerSaldoPendiente(clienteId) {
    const fila = db.prepare("SELECT COALESCE(SUM(saldo_pendiente), 0) AS total FROM facturas WHERE cliente_id = ?").get(clienteId);
    return fila ? fila.total : 0;
}
// Redondeo monetario a 2 decimales (evita comparaciones flotantes como 39.999999 > 40)
function redondearDinero(n) {
    return Math.round((n + Number.EPSILON) * 100) / 100;
}
// Fecha/hora local (no UTC) para que coincida con datetime('now','localtime')
// usado en los INSERT sin fecha explícita (ventas, etc.); en UTC los abonos
// quedaban "a futuro" y se salían del rango del resumen de caja y los reportes.
export function fechaHoraLocal() {
    const f = new Date();
    const p = (n) => String(n).padStart(2, "0");
    return (`${f.getFullYear()}-${p(f.getMonth() + 1)}-${p(f.getDate())} ` +
        `${p(f.getHours())}:${p(f.getMinutes())}:${p(f.getSeconds())}`);
}
export function obtenerFacturasPendientes(clienteId) {
    return db.prepare(`
    SELECT id, numero, total, saldo_pendiente, fecha
    FROM facturas
    WHERE cliente_id = ? AND saldo_pendiente > 0
    ORDER BY fecha ASC
  `).all(clienteId);
}
export function agregarCliente(nombre, telefono, direccion, correo, limiteCredito) {
    const stmt = db.prepare(`
    INSERT INTO clientes (nombre, telefono, direccion, correo, limite_credito, codigo)
    VALUES (@nombre, @telefono, @direccion, @correo, @limiteCredito, @codigo)
  `);
    return stmt.run({ nombre, telefono, direccion, correo, limiteCredito, codigo: siguienteCodigoCliente() });
}
export function listarClientes() {
    return db.prepare(`SELECT id, codigo, nombre, telefono, direccion, correo, limite_credito AS limiteCredito, saldo_pendiente AS saldoPendiente FROM clientes ORDER BY id DESC`).all();
}
export function buscarClientes(nombre) {
    // Busca por nombre o por código (CLI-0001), para poder localizar exactamente
    // a un cliente aunque existan homónimos.
    return db.prepare(`SELECT id, codigo, nombre, telefono, direccion, correo, limite_credito AS limiteCredito, saldo_pendiente AS saldoPendiente FROM clientes WHERE nombre LIKE ? OR codigo LIKE ? ORDER BY id DESC`).all(`%${nombre}%`, `%${nombre}%`);
}
export function editarCliente(id, nombre, telefono, direccion, correo, limiteCredito) {
    const stmt = db.prepare(`
    UPDATE clientes
    SET nombre = @nombre, telefono = @telefono, direccion = @direccion,
        correo = @correo, limite_credito = @limiteCredito
    WHERE id = @id
  `);
    return stmt.run({ id, nombre, telefono, direccion, correo, limiteCredito });
}
export function eliminarCliente(id) {
    // Borrado en cascada manual: al clientes referencian abonos -> facturas ->
    // ventas -> venta_detalles.  Como la tabla no tiene ON DELETE CASCADE, el
    // DELETE directo lanza "FOREIGN KEY constraint failed".  Limpiamos las
    // dependencias dentro de una transacción antes de borrar al cliente.
    const borrar = db.transaction(() => {
        db.prepare("DELETE FROM abonos WHERE cliente_id = ?").run(id);
        db.prepare("DELETE FROM facturas WHERE cliente_id = ?").run(id);
        db.prepare("DELETE FROM venta_detalles WHERE venta_id IN (SELECT id FROM ventas WHERE cliente_id = ?)").run(id);
        db.prepare("DELETE FROM ventas WHERE cliente_id = ?").run(id);
        const r = db.prepare("DELETE FROM clientes WHERE id = ?").run(id);
        return r;
    });
    return borrar();
}
export function totalClientes() {
    const fila = db.prepare("SELECT COUNT(*) AS total FROM clientes").get();
    return fila ? fila.total : 0;
}
export function agregarProducto(nombre, precio, stock, categoria, codigoBarras) {
    const insertar = db.prepare(`
    INSERT INTO productos (nombre, precio, stock, categoria, codigo_barras)
    VALUES (@nombre, @precio, @stock, @categoria, @codigoBarras)
  `);
    const resultado = insertar.run({
        nombre,
        precio,
        stock,
        categoria,
        codigoBarras: normalizarCodigoBarras(codigoBarras)
    });
    const id = Number(resultado.lastInsertRowid);
    db.prepare("UPDATE productos SET codigo = ? WHERE id = ?").run(`PRD-${String(id).padStart(5, "0")}`, id);
    return resultado;
}
/**
 * Normaliza un código de barras capturado por el escáner o tecleado: quita
 * espacios y guiones, y devuelve null cuando no hay código, para guardarlo
 * como NULL y no chocar con el índice único.
 */
export function normalizarCodigoBarras(codigo) {
    const limpio = String(codigo ?? "").trim().replace(/[\s-]+/g, "");
    return limpio === "" ? null : limpio;
}
/**
 * Busca un producto por su código de barras. Primero por coincidencia exacta
 * y, si no hay, ignorando los ceros iniciales, porque según la configuración
 * del escáner un UPC-A (12 dígitos) puede llegar como EAN-13 con un 0 por
 * delante, y un EAN-8 (8) con cinco.
 */
export function buscarProductoPorCodigoBarras(codigo) {
    // El código interno va primero y SIN normalizar: "PRD-00108" es una
    // referencia propia y sus guiones son parte del código.
    const crudo = String(codigo ?? "").trim();
    if (!crudo)
        return undefined;
    const interno = db.prepare("SELECT * FROM productos WHERE codigo = ?").get(crudo.toUpperCase());
    if (interno)
        return interno;
    const limpio = normalizarCodigoBarras(codigo);
    if (!limpio)
        return undefined;
    const exacto = db.prepare("SELECT * FROM productos WHERE codigo_barras = ?").get(limpio);
    if (exacto)
        return exacto;
    if (/^\d+$/.test(limpio)) {
        // ltrim quita los ceros por la izquierda en ambos lados, así que el 0 de
        // relleno con el que reporta el escáner no decide si el código existe.
        const porCeros = db
            .prepare("SELECT * FROM productos WHERE ltrim(codigo_barras, '0') = ltrim(?, '0')")
            .get(limpio);
        if (porCeros)
            return porCeros;
    }
    return undefined;
}
/** Indica si el código ya pertenece a otro producto (excluye el id indicado). */
export function codigoBarrasEnUso(codigo, idExcluido = null) {
    const limpio = normalizarCodigoBarras(codigo);
    if (!limpio)
        return undefined;
    const fila = db
        .prepare("SELECT nombre FROM productos WHERE codigo_barras = ? AND id IS NOT ?")
        .get(limpio, idExcluido);
    return fila ? fila.nombre : undefined;
}
export function listarProductos() {
    return db.prepare("SELECT * FROM productos ORDER BY id DESC").all();
}
export function buscarProductos(nombre) {
    return db.prepare("SELECT * FROM productos WHERE nombre LIKE ? ORDER BY id DESC").all(`%${nombre}%`);
}
export function editarProducto(id, nombre, precio, stock, categoria, codigoBarras) {
    const stmt = db.prepare(`
    UPDATE productos
    SET nombre = @nombre, precio = @precio, stock = @stock, categoria = @categoria,
        codigo_barras = @codigoBarras
    WHERE id = @id
  `);
    return stmt.run({
        id,
        nombre,
        precio,
        stock,
        categoria,
        // Sin argumento se conserva el código que ya tenía el producto: los
        // ajustes de stock (ventas, compras) no deben borrarlo.
        codigoBarras: codigoBarras === undefined
            ? (db.prepare("SELECT codigo_barras FROM productos WHERE id = ?").get(id)?.codigo_barras ?? null)
            : normalizarCodigoBarras(codigoBarras)
    });
}
export function eliminarProducto(id) {
    return db.prepare("DELETE FROM productos WHERE id = ?").run(id);
}
export function totalProductos() {
    const fila = db.prepare("SELECT COUNT(*) AS total FROM productos").get();
    return fila ? fila.total : 0;
}
const redondear2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
/** Porcentaje de impuesto de Configuración (0 si no está definido o es inválido). */
export function porcentajeImpuestoVenta() {
    try {
        const fila = db.prepare("SELECT valor FROM configuracion WHERE clave = 'impuesto'").get();
        const n = fila ? parseFloat(fila.valor) : 0;
        return Number.isFinite(n) && n > 0 && n <= 100 ? n : 0;
    }
    catch {
        return 0;
    }
}
/** Subtotal -> descuento (% o monto fijo, nunca mayor al subtotal) -> impuesto sobre lo que queda -> total. */
export function calcularTotalesVenta(items, opciones = {}) {
    const subtotal = redondear2(items.reduce((s, i) => s + i.precio * i.cantidad, 0));
    const valor = Math.max(0, Number(opciones.descuentoValor) || 0);
    const bruto = opciones.descuentoTipo === "porcentaje" ? subtotal * Math.min(valor, 100) / 100 : Math.min(valor, subtotal);
    const descuento = redondear2(bruto);
    const impuestoPct = porcentajeImpuestoVenta();
    const impuesto = redondear2((subtotal - descuento) * impuestoPct / 100);
    return { subtotal, descuento, impuestoPct, impuesto, total: redondear2(subtotal - descuento + impuesto) };
}
export function crearVenta(clienteId, tipoPago, items, opciones = {}) {
    const registrar = db.transaction(() => {
        // El total lo calcula siempre el backend (la pantalla solo lo muestra), para que nunca se desfase.
        const t = calcularTotalesVenta(items, opciones);
        const total = t.total;
        const res = db.prepare("INSERT INTO ventas (cliente_id, tipo_pago, total, subtotal, descuento, impuesto_pct, impuesto) VALUES (?, ?, ?, ?, ?, ?, ?)").run(clienteId, tipoPago, total, t.subtotal, t.descuento, t.impuestoPct, t.impuesto);
        const ventaId = Number(res.lastInsertRowid);
        const insertarDetalle = db.prepare(`
      INSERT INTO venta_detalles (venta_id, producto_id, nombre, precio, cantidad, subtotal)
      VALUES (@ventaId, @productoId, @nombre, @precio, @cantidad, @subtotal)
    `);
        const descontarStock = db.prepare("UPDATE productos SET stock = stock - ? WHERE id = ?");
        for (const item of items) {
            // El "producto común" ad-hoc no está en la tabla `productos`, por lo que
            // no referencia un producto real: se persiste con producto_id NULL (FK
            // opcional) y no se descuenta stock.
            const pid = Number(item.productoId);
            const esProductoComun = !pid || pid <= 0;
            insertarDetalle.run({
                ventaId,
                productoId: esProductoComun ? null : item.productoId,
                nombre: item.nombre,
                precio: item.precio,
                cantidad: item.cantidad,
                subtotal: item.precio * item.cantidad
            });
            if (!esProductoComun) {
                descontarStock.run(item.cantidad, item.productoId);
            }
        }
        if (clienteId !== null) {
            if (tipoPago === "credito") {
                db.prepare("UPDATE clientes SET saldo_pendiente = saldo_pendiente + ? WHERE id = ?").run(total, clienteId);
            }
            // Toda venta con cliente genera su factura (FCT-XXXX) para que
            // la ficha del cliente muestre el comprobante y el número de
            // ticket sea siempre una referencia profesional en el recibo.
            const filaVenta = db.prepare("SELECT fecha FROM ventas WHERE id = ?").get(ventaId);
            const fechaVenta = filaVenta ? filaVenta.fecha : fechaHoraLocal();
            const saldoInicial = tipoPago === "credito" ? total : 0;
            db.prepare("INSERT INTO facturas (cliente_id, total, saldo_pendiente, fecha, tipo_pago, venta_id, numero) VALUES (?, ?, ?, ?, ?, ?, ?)").run(clienteId, total, saldoInicial, fechaVenta, tipoPago, ventaId, siguienteNumeroFactura());
        }
        return ventaId;
    });
    return registrar();
}
export function listarVentas() {
    return db.prepare("SELECT v.*, f.numero AS numero FROM ventas v LEFT JOIN facturas f ON f.venta_id = v.id ORDER BY v.id DESC").all();
}
export function listarVentasConDetalles() {
    const ventas = db.prepare(`
    SELECT v.id, v.cliente_id, v.tipo_pago, v.total, COALESCE(v.subtotal, v.total) AS subtotal, v.descuento, v.impuesto_pct, v.impuesto, v.fecha,
           c.nombre AS cliente_nombre, c.codigo AS cliente_codigo, c.telefono AS cliente_telefono,
           c.correo AS cliente_correo, c.direccion AS cliente_direccion,
           f.id AS factura_id, f.numero AS numero, f.saldo_pendiente
    FROM ventas v
    LEFT JOIN clientes c ON c.id = v.cliente_id
    LEFT JOIN facturas f ON f.venta_id = v.id
    ORDER BY v.id DESC
  `).all();
    const stmtDetalles = db.prepare(`
    SELECT vd.id, vd.producto_id, COALESCE(p.codigo, '') AS codigo,
           vd.nombre, vd.precio, vd.cantidad, vd.subtotal
    FROM venta_detalles vd
    LEFT JOIN productos p ON p.id = vd.producto_id
    WHERE vd.venta_id = ?
  `);
    const stmtAbonos = db.prepare(`
    SELECT id, monto, fecha, COALESCE(descripcion, '') AS descripcion
    FROM abonos
    WHERE factura_id = ?
    ORDER BY fecha ASC, id ASC
  `);
    return ventas.map((venta) => {
        const fila = venta;
        return {
            ...venta,
            detalles: stmtDetalles.all(fila.id),
            abonos: fila.factura_id ? stmtAbonos.all(fila.factura_id) : []
        };
    });
}
export function ventasDelDia() {
    const fila = db.prepare("SELECT COUNT(*) AS total FROM ventas WHERE date(fecha) = date('now', 'localtime')").get();
    return fila ? fila.total : 0;
}
export function montoVentasDelDia() {
    const fila = db.prepare("SELECT COALESCE(SUM(total), 0) AS monto FROM ventas WHERE date(fecha) = date('now', 'localtime')").get();
    return fila ? fila.monto : 0;
}
export function topProductosVendidos(limite = 5) {
    return db.prepare(`
    SELECT nombre, SUM(cantidad) AS cantidad, SUM(subtotal) AS importe
    FROM venta_detalles
    GROUP BY nombre
    ORDER BY cantidad DESC
    LIMIT ?
  `).all(limite);
}
/**
 * Serie de ventas de los últimos `dias` días, en orden cronológico ascendente.
 * Genera el calendario completo (incluidos los días sin ventas, con total 0)
 * mediante una CTE recursiva, para que el gráfico del tablero siempre tenga
 * una barra por día y nunca presente huecos.
 */
export function ventasPorUltimosDias(dias = 7) {
    const tope = Math.max(1, Math.min(31, Math.floor(Number(dias) || 7)));
    return db
        .prepare(`
      WITH RECURSIVE dias(dia) AS (
        SELECT date('now', 'localtime', '-' || (? - 1) || ' days')
        UNION ALL
        SELECT date(dia, '+1 day') FROM dias WHERE dia < date('now', 'localtime')
      )
      SELECT dias.dia AS dia,
             COUNT(v.id) AS ventas,
             COALESCE(SUM(v.total), 0) AS total
      FROM dias
      LEFT JOIN ventas v ON date(v.fecha) = dias.dia
      GROUP BY dias.dia
      ORDER BY dias.dia ASC
    `)
        .all(tope);
}
/** Desglose de las ventas de hoy por forma de pago (contado / crédito). */
export function pagosDeHoy() {
    const fila = db
        .prepare(`
      SELECT
        COALESCE(SUM(CASE WHEN tipo_pago = 'credito' THEN 1 ELSE 0 END), 0) AS ticketsCredito,
        COALESCE(SUM(CASE WHEN tipo_pago = 'credito' THEN total ELSE 0 END), 0) AS credito,
        COALESCE(SUM(CASE WHEN tipo_pago <> 'credito' THEN total ELSE 0 END), 0) AS contado
      FROM ventas
      WHERE date(fecha) = date('now', 'localtime')
    `)
        .get();
    if (!fila)
        return { contado: 0, credito: 0, total: 0 };
    const credito = redondearDinero(Number(fila.credito) || 0);
    const contado = redondearDinero(Number(fila.contado) || 0);
    return { contado, credito, total: redondearDinero(contado + credito) };
}
/** Clientes con saldo pendiente, del mayor al menor (cartera por cobrar). */
export function topDeudores(limite = 5) {
    return db
        .prepare(`
      SELECT nombre, ROUND(saldo_pendiente, 2) AS saldo
      FROM clientes
      WHERE saldo_pendiente > 0
      ORDER BY saldo_pendiente DESC, nombre ASC
      LIMIT ?
    `)
        .all(limite);
}
/** Productos agotados (stock <= 0): los que hay que reponer cuanto antes. */
export function productosAgotados(limite = 5) {
    return db
        .prepare(`
      SELECT nombre, stock, COALESCE(categoria, '') AS categoria
      FROM productos
      WHERE stock <= 0
      ORDER BY nombre ASC
      LIMIT ?
    `)
        .all(limite);
}
/** Últimas ventas registradas (para el feed de actividad del tablero). */
export function ultimasVentas(limite = 5) {
    return db
        .prepare(`
      SELECT v.fecha, v.total, v.tipo_pago AS tipoPago,
             COALESCE(c.nombre, 'Cliente de mostrador') AS cliente
      FROM ventas v
      LEFT JOIN clientes c ON c.id = v.cliente_id
      ORDER BY v.id DESC
      LIMIT ?
    `)
        .all(limite);
}
export function aplicarAbonoInteligente(clienteId, monto, nota) {
    if (monto <= 0)
        throw new Error("Monto debe ser mayor a 0");
    const montoAplicable = redondearDinero(monto);
    // La deuda del cliente se valida contra clientes.saldo_pendiente, porque incluye
    // también créditos históricos registrados antes de existir el sistema de facturas.
    const filaCliente = db.prepare("SELECT saldo_pendiente FROM clientes WHERE id = ?").get(clienteId);
    if (!filaCliente)
        throw new Error("Cliente no encontrado");
    const saldoCliente = redondearDinero(filaCliente.saldo_pendiente);
    if (montoAplicable > saldoCliente)
        throw new Error("El abono no puede ser mayor al saldo pendiente");
    // Distribuir el abono entre las facturas pendientes (si existen); el sobrante
    // queda registrado como abono general sin factura asociada.
    const facturas = obtenerFacturasPendientes(clienteId);
    const detalles = [];
    const registrar = db.transaction(() => {
        let montoRestante = montoAplicable;
        for (const factura of facturas) {
            if (montoRestante <= 0)
                break;
            const saldoAntes = redondearDinero(factura.saldo_pendiente);
            const aplicar = redondearDinero(Math.min(montoRestante, saldoAntes));
            const saldoDespues = redondearDinero(saldoAntes - aplicar);
            detalles.push({ facturaId: factura.id, facturaNumero: factura.numero ?? null, montoAplicado: aplicar, saldoAntes, saldoDespues });
            db.prepare("UPDATE facturas SET saldo_pendiente = ? WHERE id = ?").run(saldoDespues, factura.id);
            montoRestante = redondearDinero(montoRestante - aplicar);
        }
        db.prepare("UPDATE clientes SET saldo_pendiente = MAX(0, saldo_pendiente - ?) WHERE id = ?").run(montoAplicable, clienteId);
        const fecha = fechaHoraLocal();
        // Registrar a qué factura(s) se aplicó el abono y una descripción legible,
        // para que el historial y la ficha del cliente muestren el detalle real.
        const facturaPrincipal = detalles.length === 1 && montoRestante === 0 ? (detalles[0]?.facturaId ?? null) : null;
        const notaLimpia = (nota || "").trim().replace(/\s+/g, " ").slice(0, 200);
        let descripcion = detalles.map((d) => "Factura " + (d.facturaNumero || ("#" + d.facturaId)) + ": C$" + d.montoAplicado.toFixed(2)).join(" · ");
        if (montoRestante > 0)
            descripcion += (descripcion ? " · " : "") + "Saldo histórico sin factura: C$" + montoRestante.toFixed(2);
        if (notaLimpia)
            descripcion += " — Nota: " + notaLimpia;
        db.prepare("INSERT INTO abonos (cliente_id, monto, fecha, factura_id, descripcion) VALUES (?, ?, ?, ?, ?)")
            .run(clienteId, montoAplicable, fecha, facturaPrincipal, descripcion);
    });
    registrar();
    return { aplicado: montoAplicable, restante: redondearDinero(saldoCliente - montoAplicable), detalles };
}
export function abonosPorCliente(clienteId) {
    return db.prepare(`
    SELECT a.id, a.monto, a.fecha, a.factura_id, a.descripcion, f.numero AS factura_numero
    FROM abonos a
    LEFT JOIN facturas f ON f.id = a.factura_id
    WHERE a.cliente_id = ? ORDER BY a.fecha DESC
  `).all(clienteId);
}
export function registrarFactura(ventaId, clienteId, monto, fecha) {
    const result = db.prepare("INSERT INTO facturas (venta_id, cliente_id, total, saldo_pendiente, fecha, tipo_pago, numero) VALUES (?, ?, ?, ?, ?, 'credito', ?)").run(ventaId, clienteId, monto, monto, fecha, siguienteNumeroFactura());
    return Number(result.lastInsertRowid);
}
export function actualizarSaldoFactura(facturaId, nuevoSaldo) {
    db.prepare("UPDATE facturas SET saldo_pendiente = ? WHERE id = ?").run(nuevoSaldo, facturaId);
    return true;
}
export function obtenerAbonosPorFactura(facturaId) {
    return db.prepare("SELECT id, cliente_id, monto, fecha, descripcion FROM abonos WHERE factura_id = ? ORDER BY fecha DESC").all(facturaId);
}
export function obtenerAbonos(clienteId) {
    const cols = "a.id, a.monto, a.fecha, a.factura_id, a.descripcion, f.numero AS factura_numero";
    const join = "FROM abonos a LEFT JOIN facturas f ON f.id = a.factura_id";
    if (clienteId !== undefined) {
        return db.prepare(`SELECT ${cols} ${join} WHERE a.cliente_id = ? ORDER BY a.fecha DESC`).all(clienteId);
    }
    return db.prepare(`SELECT ${cols} ${join} ORDER BY a.fecha DESC`).all();
}
const SMARTPOS_BACKUP_MAGIC = 0x53505031; // "SPP1"
const SMARTPOS_BACKUP_FORMAT = 1;
// Solo exigimos el núcleo estable del sistema. Las tablas de módulos nuevos
// pueden aparecer en versiones posteriores y ser creadas por sus migraciones.
const TABLAS_MINIMAS_REQUERIDAS = [
    "clientes", "productos", "ventas", "venta_detalles", "facturas", "abonos",
    "configuracion", "usuarios", "caja_turnos", "caja_movimientos"
];
function rutaCarpetaRespaldos() {
    const carpeta = path.join(path.dirname(rutaDb), "respaldos");
    fs.mkdirSync(carpeta, { recursive: true });
    return carpeta;
}
function fechaArchivoLocal(fecha = new Date()) {
    const pad = (n) => String(n).padStart(2, "0");
    return `${fecha.getFullYear()}-${pad(fecha.getMonth() + 1)}-${pad(fecha.getDate())}_${pad(fecha.getHours())}-${pad(fecha.getMinutes())}-${pad(fecha.getSeconds())}`;
}
function sqliteLiteral(valor) {
    return `'${valor.replace(/'/g, "''")}'`;
}
function esArchivoSQLite(ruta) {
    if (!fs.existsSync(ruta))
        return false;
    const fd = fs.openSync(ruta, "r");
    try {
        const encabezado = Buffer.alloc(16);
        fs.readSync(fd, encabezado, 0, 16, 0);
        return encabezado.toString("ascii", 0, 16) === "SQLite format 3\u0000";
    }
    finally {
        fs.closeSync(fd);
    }
}
function convertirRespaldoLegacySQL(ruta) {
    const contenido = fs.readFileSync(ruta, "utf8");
    if (!/CREATE TABLE/i.test(contenido) || !/INSERT INTO/i.test(contenido)) {
        throw new Error("El archivo seleccionado no es un respaldo SQLite ni un respaldo SQL compatible de SmartPosPro.");
    }
    const carpeta = path.join(rutaCarpetaRespaldos(), "importados");
    fs.mkdirSync(carpeta, { recursive: true });
    const convertido = path.join(carpeta, `smartpospro-importado-${fechaArchivoLocal()}-${process.pid}.db`);
    const nueva = new Database(convertido);
    try {
        nueva.exec(contenido);
        nueva.pragma("journal_mode = DELETE");
        nueva.pragma(`application_id = ${SMARTPOS_BACKUP_MAGIC}`);
        nueva.pragma(`user_version = ${SMARTPOS_BACKUP_FORMAT}`);
        nueva.exec(`
      CREATE TABLE IF NOT EXISTS smartpos_backup_meta (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        producto TEXT NOT NULL,
        formato INTEGER NOT NULL,
        creado_en TEXT NOT NULL,
        motivo TEXT NOT NULL
      )
    `);
        nueva.prepare(`
      INSERT OR REPLACE INTO smartpos_backup_meta (id, producto, formato, creado_en, motivo)
      VALUES (1, 'SmartPosPro', ?, ?, 'legacy-importado')
    `).run(SMARTPOS_BACKUP_FORMAT, new Date().toISOString());
        nueva.pragma("wal_checkpoint(TRUNCATE)");
    }
    finally {
        nueva.close();
    }
    validarBaseRespaldo(convertido);
    return convertido;
}
function validarBaseRespaldo(ruta) {
    if (!fs.existsSync(ruta))
        throw new Error("El archivo de respaldo no existe.");
    const stat = fs.statSync(ruta);
    if (stat.size < 1024)
        throw new Error("El archivo seleccionado no parece una base de datos válida.");
    let copia = null;
    try {
        copia = new Database(ruta, { readonly: true, fileMustExist: true });
        const encabezado = Buffer.alloc(16);
        const fd = fs.openSync(ruta, "r");
        try {
            fs.readSync(fd, encabezado, 0, 16, 0);
        }
        finally {
            fs.closeSync(fd);
        }
        if (encabezado.toString("ascii", 0, 16) !== "SQLite format 3\u0000") {
            throw new Error("El archivo no es una base SQLite válida de SmartPosPro.");
        }
        const integridad = copia.pragma("integrity_check", { simple: true });
        if (String(integridad).toLowerCase() !== "ok") {
            throw new Error(`La comprobación de integridad falló: ${String(integridad)}`);
        }
        const fk = copia.pragma("foreign_key_check");
        if (fk.length > 0)
            throw new Error("La comprobación de relaciones entre registros detectó inconsistencias.");
        const tablas = copia.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all();
        const nombres = new Set(tablas.map((t) => t.name));
        const faltantes = TABLAS_MINIMAS_REQUERIDAS.filter((t) => !nombres.has(t));
        if (faltantes.length > 0) {
            throw new Error(`El respaldo está incompleto. Faltan tablas esenciales: ${faltantes.join(", ")}.`);
        }
        const magic = Number(copia.pragma("application_id", { simple: true }));
        const version = Number(copia.pragma("user_version", { simple: true }));
        if (magic !== SMARTPOS_BACKUP_MAGIC && magic !== 0) {
            throw new Error("El archivo no corresponde a un respaldo compatible con SmartPosPro.");
        }
        return { tablas: tablas.length, version };
    }
    finally {
        try {
            copia?.close();
        }
        catch { /* no-op */ }
    }
}
export function prepararRespaldoParaRestaurar(ruta) {
    const original = path.resolve(ruta);
    const normalizado = esArchivoSQLite(original) ? original : convertirRespaldoLegacySQL(original);
    const info = validarBaseRespaldo(normalizado);
    return { ruta: normalizado, tablas: info.tablas, tamanoBytes: fs.statSync(normalizado).size, legacy: normalizado !== original };
}
export function validarRespaldoParaRestaurar(ruta) {
    const info = prepararRespaldoParaRestaurar(ruta);
    return { tablas: info.tablas, tamanoBytes: info.tamanoBytes };
}
/**
 * Crea una copia SQLite consistente usando VACUUM INTO, nunca copiando pos.db
 * directamente. El resultado se valida antes de considerarlo un respaldo válido.
 */
export function crearRespaldo(rutaDestino, motivo = "manual") {
    const destino = path.resolve(rutaDestino);
    const carpetaDestino = path.dirname(destino);
    fs.mkdirSync(carpetaDestino, { recursive: true });
    if (path.resolve(destino) === path.resolve(rutaDb)) {
        throw new Error("El respaldo no puede sobrescribir la base de datos activa.");
    }
    const temporal = `${destino}.tmp-${process.pid}-${Date.now()}`;
    try {
        try {
            fs.rmSync(temporal, { force: true });
        }
        catch { /* no-op */ }
        // El checkpoint es una medida adicional: VACUUM INTO crea igualmente una
        // copia consistente, incluso cuando SQLite está usando WAL.
        try {
            db.pragma("wal_checkpoint(PASSIVE)");
        }
        catch { /* no-op */ }
        db.exec(`VACUUM INTO ${sqliteLiteral(temporal)}`);
        // Marcamos la copia para poder reconocerla en restauraciones futuras.
        const copia = new Database(temporal);
        try {
            copia.pragma("journal_mode = DELETE");
            copia.pragma(`application_id = ${SMARTPOS_BACKUP_MAGIC}`);
            copia.pragma(`user_version = ${SMARTPOS_BACKUP_FORMAT}`);
            copia.exec(`
        CREATE TABLE IF NOT EXISTS smartpos_backup_meta (
          id INTEGER PRIMARY KEY CHECK (id = 1),
          producto TEXT NOT NULL,
          formato INTEGER NOT NULL,
          creado_en TEXT NOT NULL,
          motivo TEXT NOT NULL
        )
      `);
            copia.prepare(`
        INSERT INTO smartpos_backup_meta (id, producto, formato, creado_en, motivo)
        VALUES (1, 'SmartPosPro', ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET formato=excluded.formato, creado_en=excluded.creado_en, motivo=excluded.motivo
      `).run(SMARTPOS_BACKUP_FORMAT, new Date().toISOString(), motivo);
            copia.pragma("wal_checkpoint(TRUNCATE)");
        }
        finally {
            copia.close();
        }
        const validado = validarBaseRespaldo(temporal);
        const stat = fs.statSync(temporal);
        const fecha = new Date().toISOString();
        // Reemplazo atómico: el archivo final solo aparece después de superar la validación.
        fs.rmSync(destino, { force: true });
        fs.renameSync(temporal, destino);
        return { ruta: destino, fecha, tamanoBytes: stat.size, tablas: validado.tablas };
    }
    catch (error) {
        try {
            fs.rmSync(temporal, { force: true });
        }
        catch { /* no-op */ }
        throw error;
    }
}
/** Compatibilidad con el botón antiguo de exportación. Ahora crea un SQLite real. */
export function exportarRespaldo(rutaDestino) {
    return crearRespaldo(rutaDestino, "manual");
}
export function obtenerEstadoRespaldo() {
    const carpeta = rutaCarpetaRespaldos();
    const archivos = fs.readdirSync(carpeta)
        .filter((nombre) => /^smartpospro-(automatico|pre-restauracion)-.*\.db$/i.test(nombre))
        .map((nombre) => {
        const ruta = path.join(carpeta, nombre);
        try {
            return { nombre, stat: fs.statSync(ruta) };
        }
        catch {
            return null;
        }
    })
        .filter((x) => x !== null)
        .sort((a, b) => b.stat.mtimeMs - a.stat.mtimeMs);
    const ultimo = archivos[0];
    return {
        existe: !!ultimo,
        ultimoRespaldo: ultimo ? ultimo.stat.mtime.toISOString() : null,
        tamanoBytes: ultimo ? ultimo.stat.size : 0,
        automaticos: archivos.filter((x) => x.nombre.startsWith("smartpospro-automatico-")).length,
        carpeta
    };
}
export function crearRespaldoAutomatico() {
    const carpeta = rutaCarpetaRespaldos();
    const hoy = fechaArchivoLocal().slice(0, 10);
    const nombre = `smartpospro-automatico-${hoy}.db`;
    const destino = path.join(carpeta, nombre);
    if (fs.existsSync(destino))
        return null;
    const resultado = crearRespaldo(destino, "automatico");
    // Conservamos los 7 respaldos automáticos más recientes.
    const archivos = fs.readdirSync(carpeta)
        .filter((n) => /^smartpospro-automatico-.*\.db$/i.test(n))
        .map((n) => {
        const ruta = path.join(carpeta, n);
        return { ruta, mtime: fs.statSync(ruta).mtimeMs };
    })
        .sort((a, b) => b.mtime - a.mtime);
    for (const viejo of archivos.slice(7)) {
        try {
            fs.rmSync(viejo.ruta, { force: true });
        }
        catch { /* no-op */ }
    }
    return resultado;
}
export function restaurarRespaldo(rutaRespaldo) {
    const preparado = prepararRespaldoParaRestaurar(rutaRespaldo);
    const origen = path.resolve(preparado.ruta);
    const validado = validarBaseRespaldo(origen);
    const actual = path.resolve(rutaDb);
    if (origen === actual)
        throw new Error("No se puede restaurar la base de datos sobre sí misma.");
    const seguridad = path.join(rutaCarpetaRespaldos(), `smartpospro-pre-restauracion-${fechaArchivoLocal()}.db`);
    crearRespaldo(seguridad, "pre-restauracion");
    const temporal = `${actual}.restore-${process.pid}-${Date.now()}`;
    const anterior = `${actual}.before-restore-${process.pid}-${Date.now()}`;
    let conexionCerrada = false;
    let anteriorMovida = false;
    try {
        // Nunca tocamos la base activa hasta que la copia seleccionada haya pasado
        // una segunda validación independiente.
        fs.copyFileSync(origen, temporal);
        validarBaseRespaldo(temporal);
        // Elimina WAL/SHM de forma controlada después del checkpoint y antes del cambio.
        try {
            db.pragma("wal_checkpoint(TRUNCATE)");
        }
        catch { /* no-op */ }
        db.close();
        conexionCerrada = true;
        try {
            fs.rmSync(`${actual}-wal`, { force: true });
        }
        catch { /* no-op */ }
        try {
            fs.rmSync(`${actual}-shm`, { force: true });
        }
        catch { /* no-op */ }
        // Conservamos físicamente la base anterior hasta que la nueva haya ocupado
        // el nombre definitivo. Si el segundo rename falla, podemos volver atrás.
        fs.renameSync(actual, anterior);
        anteriorMovida = true;
        fs.renameSync(temporal, actual);
        try {
            fs.rmSync(anterior, { force: true });
        }
        catch { /* no-op */ }
        return { ok: true, ruta: actual, tablas: validado.tablas };
    }
    catch (error) {
        try {
            fs.rmSync(temporal, { force: true });
        }
        catch { /* no-op */ }
        if (anteriorMovida && !fs.existsSync(actual) && fs.existsSync(anterior)) {
            try {
                fs.renameSync(anterior, actual);
            }
            catch { /* se conserva la copia pre-restauración */ }
        }
        // Si SQLite ya fue cerrado, el proceso principal debe reiniciar la aplicación
        // en lugar de dejar al usuario con una conexión inválida.
        if (conexionCerrada) {
            try {
                fs.rmSync(`${actual}-wal`, { force: true });
            }
            catch { /* no-op */ }
            try {
                fs.rmSync(`${actual}-shm`, { force: true });
            }
            catch { /* no-op */ }
        }
        throw error;
    }
}
export function obtenerRutaBaseDatos() {
    return rutaDb;
}
// Exportaciones alias para compatibilidad de modulos
export const registrarVenta = crearVenta;
export const obtenerVentas = listarVentas;
export const obtenerHistorial = listarVentasConDetalles;
export const contarVentasDelDia = ventasDelDia;
export const abonarCredito = aplicarAbonoInteligente;
//# sourceMappingURL=database.js.map