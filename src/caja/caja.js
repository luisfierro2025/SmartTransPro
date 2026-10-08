import { db } from "../db/database.js";
// ===== Módulo de Caja: turnos, movimientos y arqueo =====
db.exec(`
  CREATE TABLE IF NOT EXISTS caja_turnos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    usuario TEXT NOT NULL DEFAULT 'Administrador',
    monto_inicial REAL NOT NULL DEFAULT 0,
    abierto TEXT NOT NULL,
    cerrado TEXT,
    monto_contado REAL,
    esperado REAL,
    diferencia REAL,
    notas TEXT DEFAULT '',
    estado TEXT NOT NULL DEFAULT 'abierto'
  )
`);
db.exec(`
  CREATE TABLE IF NOT EXISTS caja_movimientos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    turno_id INTEGER NOT NULL,
    tipo TEXT NOT NULL,
    concepto TEXT NOT NULL,
    monto REAL NOT NULL,
    fecha TEXT NOT NULL,
    FOREIGN KEY (turno_id) REFERENCES caja_turnos(id)
  )
`);
// ===== Migración one-shot: turnos guardados con hora UTC =====
function convertirUtcALocal(texto) {
    const fecha = new Date(`${texto.replace(" ", "T")}Z`);
    return Number.isNaN(fecha.getTime()) ? texto : formatearFechaLocal(fecha);
}
const columnasTurnos = db.pragma("table_info(caja_turnos)").map((columna) => columna.name);
if (!columnasTurnos.includes("zona")) {
    db.exec("ALTER TABLE caja_turnos ADD COLUMN zona TEXT NOT NULL DEFAULT 'utc'");
}
const turnosUtc = db
    .prepare("SELECT id, abierto, cerrado FROM caja_turnos WHERE zona = 'utc'")
    .all();
if (turnosUtc.length > 0) {
    const consultarMovimientos = db.prepare("SELECT id, fecha FROM caja_movimientos WHERE turno_id = ?");
    const actualizarTurno = db.prepare("UPDATE caja_turnos SET abierto = ?, cerrado = ?, zona = 'local' WHERE id = ?");
    const actualizarMovimiento = db.prepare("UPDATE caja_movimientos SET fecha = ? WHERE id = ?");
    const migrar = db.transaction(() => {
        for (const turno of turnosUtc) {
            actualizarTurno.run(convertirUtcALocal(turno.abierto), turno.cerrado ? convertirUtcALocal(turno.cerrado) : null, turno.id);
            const movimientos = consultarMovimientos.all(turno.id);
            for (const movimiento of movimientos) {
                actualizarMovimiento.run(convertirUtcALocal(movimiento.fecha), movimiento.id);
            }
        }
    });
    migrar();
}
export class CajaError extends Error {
    constructor(message) {
        super(message);
        this.name = "CajaError";
    }
}
export const TIPOS_MOVIMIENTO = ["ingreso", "egreso"];
function formatearFechaLocal(fecha) {
    const p = (n) => String(n).padStart(2, "0");
    return (`${fecha.getFullYear()}-${p(fecha.getMonth() + 1)}-${p(fecha.getDate())} ` +
        `${p(fecha.getHours())}:${p(fecha.getMinutes())}:${p(fecha.getSeconds())}`);
}
function ahora() {
    return formatearFechaLocal(new Date());
}
function redondear(n) {
    return Math.round((n + Number.EPSILON) * 100) / 100;
}
function escalar(sql, params) {
    const fila = db.prepare(sql).get(...params);
    if (!fila)
        return 0;
    const valor = fila.total !== undefined ? fila.total : fila.n;
    return Number(valor) || 0;
}
export function cajaAbierta() {
    const fila = db
        .prepare("SELECT * FROM caja_turnos WHERE estado = 'abierto' ORDER BY id DESC LIMIT 1")
        .get();
    return fila ? fila : null;
}
export function abrirCaja(usuario, montoInicial) {
    if (cajaAbierta()) {
        throw new CajaError("Ya existe un turno de caja abierto. Ciérralo antes de abrir uno nuevo.");
    }
    const monto = Number(montoInicial) || 0;
    if (monto < 0)
        throw new CajaError("El monto inicial no puede ser negativo.");
    const fecha = ahora();
    const insertar = db.transaction(() => {
        const res = db
            .prepare("INSERT INTO caja_turnos (usuario, monto_inicial, abierto, estado, zona) VALUES (?, ?, ?, 'abierto', 'local')")
            .run(usuario && usuario.trim() ? usuario.trim() : "Administrador", redondear(monto), fecha);
        const id = Number(res.lastInsertRowid);
        db.prepare("INSERT INTO caja_movimientos (turno_id, tipo, concepto, monto, fecha) VALUES (?, 'apertura', ?, ?, ?)")
            .run(id, "Fondo inicial de caja", redondear(monto), fecha);
        return id;
    });
    const turnoId = insertar();
    const turno = db.prepare("SELECT * FROM caja_turnos WHERE id = ?").get(turnoId);
    if (!turno)
        throw new CajaError("No se pudo abrir el turno de caja.");
    return turno;
}
export function registrarMovimiento(turnoId, tipo, concepto, monto) {
    const turno = db.prepare("SELECT * FROM caja_turnos WHERE id = ?").get(turnoId);
    if (!turno)
        throw new CajaError("El turno de caja indicado no existe.");
    if (turno.estado !== "abierto")
        throw new CajaError("El turno de caja ya está cerrado.");
    if (TIPOS_MOVIMIENTO.indexOf(tipo) === -1)
        throw new CajaError("El tipo de movimiento debe ser ingreso o egreso.");
    if (!concepto || !concepto.trim())
        throw new CajaError("El concepto del movimiento es obligatorio.");
    const valor = Number(monto) || 0;
    if (valor <= 0)
        throw new CajaError("El monto del movimiento debe ser mayor a cero.");
    const fecha = ahora();
    const res = db
        .prepare("INSERT INTO caja_movimientos (turno_id, tipo, concepto, monto, fecha) VALUES (?, ?, ?, ?, ?)")
        .run(turnoId, tipo, concepto.trim(), redondear(valor), fecha);
    const fila = db.prepare("SELECT * FROM caja_movimientos WHERE id = ?").get(Number(res.lastInsertRowid));
    if (!fila)
        throw new CajaError("No se pudo registrar el movimiento de caja.");
    return fila;
}
export function resumenTurno(turnoId) {
    const turno = db.prepare("SELECT * FROM caja_turnos WHERE id = ?").get(turnoId);
    if (!turno)
        throw new CajaError("El turno de caja indicado no existe.");
    const desde = turno.abierto;
    const hasta = turno.cerrado ? turno.cerrado : ahora();
    // Solo cupa al efectivo esperado en caja lo que realmente entra/sale en efectivo
    // durante el turno: fondo inicial + ventas en efectivo + movimientos de caja.
    const ventasContado = escalar("SELECT COALESCE(SUM(total), 0) AS total FROM ventas WHERE tipo_pago = 'contado' AND datetime(fecha) >= datetime(?) AND datetime(fecha) <= datetime(?)", [desde, hasta]);
    const ventasCredito = escalar("SELECT COALESCE(SUM(total), 0) AS total FROM ventas WHERE tipo_pago = 'credito' AND datetime(fecha) >= datetime(?) AND datetime(fecha) <= datetime(?)", [desde, hasta]);
    const ingresos = escalar("SELECT COALESCE(SUM(monto), 0) AS total FROM caja_movimientos WHERE turno_id = ? AND tipo = 'ingreso'", [turnoId]);
    const egresos = escalar("SELECT COALESCE(SUM(monto), 0) AS total FROM caja_movimientos WHERE turno_id = ? AND tipo = 'egreso'", [turnoId]);
    const movimientos = escalar("SELECT COUNT(*) AS n FROM caja_movimientos WHERE turno_id = ?", [turnoId]);
    const montoInicial = Number(turno.monto_inicial) || 0;
    // El efectivo que debe haber en caja es: fondo inicial + ventas en efectivo
    // + ingresos de caja - egresos de caja. Los abonos y las ventas a crédito no
    // aumentan el efectivo físico en caja en este turno (su registro es contable,
    // no cambia el arqueo de efectivo).
    const esperado = redondear(montoInicial + ventasContado + ingresos - egresos);
    return {
        turnoId,
        montoInicial: redondear(montoInicial),
        ventasContado: redondear(ventasContado),
        ventasCredito: redondear(ventasCredito),
        abonos: escalar("SELECT COALESCE(SUM(monto), 0) AS total FROM abonos WHERE datetime(fecha) >= datetime(?) AND datetime(fecha) <= datetime(?)", [desde, hasta]),
        ingresos: redondear(ingresos),
        egresos: redondear(egresos),
        esperado,
        movimientos
    };
}
export function cerrarCaja(turnoId, montoContado, notas) {
    const turno = db.prepare("SELECT * FROM caja_turnos WHERE id = ?").get(turnoId);
    if (!turno)
        throw new CajaError("El turno de caja indicado no existe.");
    if (turno.estado !== "abierto")
        throw new CajaError("El turno de caja ya está cerrado.");
    const contado = Number(montoContado) || 0;
    if (contado < 0)
        throw new CajaError("El monto contado no puede ser negativo.");
    const resumen = resumenTurno(turnoId);
    const diferencia = redondear(contado - resumen.esperado);
    const fecha = ahora();
    db.prepare("UPDATE caja_turnos SET estado = 'cerrado', cerrado = ?, monto_contado = ?, esperado = ?, diferencia = ?, notas = ? WHERE id = ?").run(fecha, redondear(contado), resumen.esperado, diferencia, notas ? notas.trim() : "", turnoId);
    const actualizado = db.prepare("SELECT * FROM caja_turnos WHERE id = ?").get(turnoId);
    if (!actualizado)
        throw new CajaError("No se pudo cerrar el turno de caja.");
    return { turno: actualizado, resumen, montoContado: redondear(contado), diferencia };
}
export function obtenerTurnos(limite = 15) {
    const tope = Number.isFinite(limite) && limite > 0 ? Math.floor(limite) : 15;
    return db.prepare("SELECT * FROM caja_turnos ORDER BY id DESC LIMIT ?").all(tope);
}
export function movimientosTurno(turnoId) {
    return db.prepare("SELECT * FROM caja_movimientos WHERE turno_id = ? ORDER BY id DESC").all(turnoId);
}
export function ultimosMovimientos(limite = 25) {
    const tope = Number.isFinite(limite) && limite > 0 ? Math.floor(limite) : 25;
    return db.prepare("SELECT * FROM caja_movimientos ORDER BY id DESC LIMIT ?").all(tope);
}
//# sourceMappingURL=caja.js.map