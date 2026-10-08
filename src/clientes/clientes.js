import { agregarCliente, listarClientes, buscarClientes, editarCliente, eliminarCliente, totalClientes, abonarCredito } from "../db/database.js";
export class ClienteError extends Error {
    constructor(message) {
        super(message);
        this.name = "ClienteError";
    }
}
function validarDatosCliente(nombre, telefono, correo, limiteCredito) {
    if (!nombre || nombre.trim().length < 2)
        throw new ClienteError("El nombre del cliente debe tener al menos 2 caracteres.");
    if (telefono && !/^[0-9+\-\s()]{7,20}$/.test(telefono))
        throw new ClienteError("El teléfono ingresado no tiene un formato válido.");
    if (correo && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo))
        throw new ClienteError("El correo ingresado no tiene un formato válido.");
    if (limiteCredito < 0)
        throw new ClienteError("El límite de crédito no puede ser negativo.");
}
export function crearCliente(nombre, telefono, direccion, correo, limiteCredito) {
    validarDatosCliente(nombre, telefono, correo, limiteCredito);
    return agregarCliente(nombre.trim(), telefono.trim(), direccion.trim(), correo.trim(), limiteCredito);
}
export function obtenerClientes() {
    return listarClientes();
}
export function buscar(nombre) {
    if (!nombre || !nombre.trim())
        return listarClientes();
    return buscarClientes(nombre.trim());
}
export function actualizarCliente(id, nombre, telefono, direccion, correo, limiteCredito) {
    validarDatosCliente(nombre, telefono, correo, limiteCredito);
    return editarCliente(id, nombre.trim(), telefono.trim(), direccion.trim(), correo.trim(), limiteCredito);
}
export function borrarCliente(id) {
    return eliminarCliente(id);
}
export function contarClientes() {
    return totalClientes();
}
export function abonarCliente(id, monto) {
    if (monto <= 0)
        throw new ClienteError("El monto del abono debe ser mayor a cero.");
    return abonarCredito(id, monto);
}
/* ---------- Funciones nuevas tipo POS ---------- */
export async function obtenerClientePorId(id) {
    const clientes = (await listarClientes());
    return clientes.find((c) => c.id === id);
}
export async function clientesConCreditoDisponible(minimo = 0) {
    const clientes = (await listarClientes());
    return clientes.filter((c) => c.limiteCredito - (c.creditoUsado || 0) >= minimo);
}
export async function clientesConCreditoExcedido() {
    const clientes = (await listarClientes());
    return clientes.filter((c) => (c.creditoUsado || 0) > c.limiteCredito);
}
export async function resumenCartera() {
    const clientes = (await listarClientes());
    const totalLimite = clientes.reduce((acc, c) => acc + c.limiteCredito, 0);
    const totalUsado = clientes.reduce((acc, c) => acc + (c.creditoUsado || 0), 0);
    return {
        totalClientes: clientes.length,
        totalLimiteCredito: totalLimite,
        totalCreditoUsado: totalUsado,
        creditoDisponible: totalLimite - totalUsado
    };
}
//# sourceMappingURL=clientes.js.map