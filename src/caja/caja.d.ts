export interface TurnoCaja {
    id: number;
    usuario: string;
    monto_inicial: number;
    abierto: string;
    cerrado: string | null;
    monto_contado: number | null;
    esperado: number | null;
    diferencia: number | null;
    notas: string;
    estado: string;
}
export interface MovimientoCaja {
    id: number;
    turno_id: number;
    tipo: string;
    concepto: string;
    monto: number;
    fecha: string;
}
export interface ResumenCaja {
    turnoId: number;
    montoInicial: number;
    ventasContado: number;
    ventasCredito: number;
    abonos: number;
    ingresos: number;
    egresos: number;
    esperado: number;
    movimientos: number;
}
export interface CierreCaja {
    turno: TurnoCaja;
    resumen: ResumenCaja;
    montoContado: number;
    diferencia: number;
}
export declare class CajaError extends Error {
    constructor(message: string);
}
export declare const TIPOS_MOVIMIENTO: string[];
export declare function cajaAbierta(): TurnoCaja | null;
export declare function abrirCaja(usuario: string, montoInicial: number): TurnoCaja;
export declare function registrarMovimiento(turnoId: number, tipo: string, concepto: string, monto: number): MovimientoCaja;
export declare function resumenTurno(turnoId: number): ResumenCaja;
export declare function cerrarCaja(turnoId: number, montoContado: number, notas: string): CierreCaja;
export declare function obtenerTurnos(limite?: number): TurnoCaja[];
export declare function movimientosTurno(turnoId: number): MovimientoCaja[];
export declare function ultimosMovimientos(limite?: number): MovimientoCaja[];
//# sourceMappingURL=caja.d.ts.map