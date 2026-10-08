import 'dotenv/config';
export interface WhatsAppResponse {
    success: boolean;
    data?: any;
    error?: any;
}
/**
 * Envía una notificación por WhatsApp utilizando la API de Meta
 */
export declare function enviarNotificacionWhatsApp(telefono: string, nombrePlantilla?: string, idioma?: string): Promise<WhatsAppResponse>;
//# sourceMappingURL=whatsappService.d.ts.map