export interface Cliente {
    id: number;
    codigo: string;
    nombre: string;
    telefono: string;
    direccion: string;
    correo: string;
    limiteCredito: number;
    creditoUsado?: number;
}
export declare class ClienteError extends Error {
    constructor(message: string);
}
export declare function crearCliente(nombre: string, telefono: string, direccion: string, correo: string, limiteCredito: number): import("better-sqlite3").RunResult;
export declare function obtenerClientes(): unknown[];
export declare function buscar(nombre: string): unknown[];
export declare function actualizarCliente(id: number, nombre: string, telefono: string, direccion: string, correo: string, limiteCredito: number): import("better-sqlite3").RunResult;
export declare function borrarCliente(id: number): import("better-sqlite3").RunResult;
export declare function contarClientes(): number;
export declare function abonarCliente(id: number, monto: number): {
    aplicado: number;
    restante: number;
    detalles: {
        facturaId: number;
        facturaNumero: string | null;
        montoAplicado: number;
        saldoAntes: number;
        saldoDespues: number;
    }[];
};
export declare function obtenerClientePorId(id: number): Promise<Cliente | undefined>;
export declare function clientesConCreditoDisponible(minimo?: number): Promise<Cliente[]>;
export declare function clientesConCreditoExcedido(): Promise<Cliente[]>;
export declare function resumenCartera(): Promise<{
    totalClientes: number;
    totalLimiteCredito: number;
    totalCreditoUsado: number;
    creditoDisponible: number;
}>;
//# sourceMappingURL=clientes.d.ts.map