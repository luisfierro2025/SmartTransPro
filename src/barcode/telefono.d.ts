/**
 * Dirección IP de la LAN: el teléfono entra por aquí, no por localhost.
 *
 * No se vale la primera IPv4 que aparezca. Un equipo suele tener varias
 * (Ethernet, WiFi, VPN, Hyper-V, "Conexión de área local" con 169.254.x.x) y
 * la primera no siempre es la red del router: si el QR apunta a una de esas,
 * el teléfono no llega nunca y no hay aviso que lo explique. Se descartan las
 * que no sirven y se prefieren las privadas, que es donde está el router.
 */
export declare function ipLocal(): string;
export interface EstadoEscanerTelefono {
    activo: boolean;
    url: string | null;
    qr: string | null;
    ip: string | null;
    /** true si la página se sirve por HTTPS: requisito para usar la cámara. */
    seguro: boolean;
    /** true si el certificado se rehizo y el móvil tiene el anterior instalado. */
    certCambiado?: boolean;
    error?: string;
}
/**
 * Levanta el servidor local y devuelve la dirección con su QR ya generado en
 * SVG, listo para mostrar en pantalla. Si ya estaba activo solo devuelve el
 * estado, así el botón de la interfaz puede llamarlo cada vez sin reiniciar.
 */
export declare function iniciarEscanerTelefono(alRecibir: (codigo: string) => void): Promise<EstadoEscanerTelefono>;
export declare function estadoEscanerTelefono(): Promise<EstadoEscanerTelefono>;
export declare function detenerEscanerTelefono(): void;
//# sourceMappingURL=telefono.d.ts.map