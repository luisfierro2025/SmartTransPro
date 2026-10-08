export interface EstadoLicencia {
    activada: boolean;
    codigo?: string | undefined;
    producto?: string | undefined;
    tipo?: string | undefined;
    estado?: string | undefined;
    fechaInicio?: string | undefined;
    fechaVencimiento?: string | null | undefined;
    maxEquipos?: number | undefined;
    equipoId: string;
    nombreEquipo: string;
    mensaje?: string | undefined;
}
export declare function urlServidorLicencias(): string | null;
export declare function obtenerEstadoLicencia(): EstadoLicencia;
export declare function licenciaVigente(): boolean;
export declare function validarLicenciaAlIniciar(): Promise<EstadoLicencia>;
export declare function activarLicencia(codigo: string): Promise<EstadoLicencia>;
export declare function obtenerEquipoLicencia(): {
    equipoId: string;
    nombreEquipo: string;
};
//# sourceMappingURL=licencia.d.ts.map