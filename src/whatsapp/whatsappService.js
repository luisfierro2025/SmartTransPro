import 'dotenv/config';
/**
 * Envía una notificación por WhatsApp utilizando la API de Meta
 */
export async function enviarNotificacionWhatsApp(telefono, nombrePlantilla = "hello_world", idioma = "en_US") {
    const token = process.env.WHATSAPP_TOKEN;
    const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
    if (!token || !phoneId) {
        console.error("❌ Error: Faltan credenciales en el archivo .env");
        return { success: false, error: "Credenciales no encontradas en .env" };
    }
    // Eliminar espacios, guiones o caracteres especiales del teléfono
    const numeroLimpio = telefono.replace(/\D/g, '');
    const url = `https://graph.facebook.com/v25.0/${phoneId}/messages`;
    const payload = {
        messaging_product: "whatsapp",
        to: numeroLimpio,
        type: "template",
        template: {
            name: nombrePlantilla,
            language: { code: idioma }
        }
    };
    try {
        const response = await fetch(url, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${token}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify(payload)
        });
        const data = await response.json();
        if (response.ok) {
            console.log(`✅ Notificación enviada correctamente a ${numeroLimpio}`);
            return { success: true, data };
        }
        else {
            console.error("❌ Error de la API de Meta:", data);
            return { success: false, error: data };
        }
    }
    catch (error) {
        console.error("❌ Error de red al enviar WhatsApp:", error);
        return { success: false, error };
    }
}
//# sourceMappingURL=whatsappService.js.map