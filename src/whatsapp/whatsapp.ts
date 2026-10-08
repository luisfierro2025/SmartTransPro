// ===== Módulo de WhatsApp: envío de tickets, recordatorios de crédito y catálogo =====

import { db } from "../db/database.js";

export interface ConfigWhatsApp {
  habilitado: boolean;
  numero: string; // Phone Number ID en Meta Graph API
  token: string;
  modoSimulacion: boolean;
  mensajeBienvenida: string;
  mensajeCierre: string;
  companyName: string;
  moneda: string;
  pais: string; // Prefijo telefónico del país para los números locales (ej. "505")
}

export interface DetalleVenta { 
  cantidad: number; 
  nombre: string; 
  precio: number; 
  subtotal?: number;
}

export interface Venta {
  id: number; 
  detalles: DetalleVenta[]; 
  subtotal: number; 
  descuento?: number;
  impuesto: number;
  impuestoPct?: number; 
  total: number; 
  fecha: string; 
  clienteNombre?: string;
}

export interface Cliente { nombre: string; }
export interface Producto { nombre: string; precio: number; stock: number; }

export const VALORES_WHATSAPP: ConfigWhatsApp = {
  habilitado: false, 
  numero: "", 
  token: "", 
  modoSimulacion: false,
  mensajeBienvenida: "¡Gracias por contactar *SmartPosPro*! 📱",
  mensajeCierre: "¿En qué más puedo ayudarte?",
  companyName: "SmartPosPro", 
  moneda: "C$",
  pais: "505"
};

function crearTablas() {
  db.exec(
    `CREATE TABLE IF NOT EXISTS whatsapp_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tipo TEXT NOT NULL,
      destinatario TEXT NOT NULL,
      resultado TEXT NOT NULL DEFAULT 'pendiente',
      mensaje TEXT,
      respuesta_api TEXT,
      creado TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`
  );
  db.exec(
    `CREATE TABLE IF NOT EXISTS whatsapp_config (
      clave TEXT PRIMARY KEY,
      valor TEXT NOT NULL
    )`
  );
}
crearTablas();

// === Saneamiento y validación de credenciales ===
// Limpia el valor del token quitando espacios, comillas y el prefijo "Bearer ".
// Devuelve "" si el texto no es un token (p. ej. si se pegó un comando curl o un ejemplo de la documentación).
export function limpiarToken(valor: string | undefined | null): string {
  let t = (valor || "").trim().replace(/^["']|["']$/g, "").trim();
  if (!t) return "";
  t = t.replace(/^Bearer\s+/i, "").trim();
  // Un Access Token de Meta nunca contiene espacios/saltos de línea ni comandos
  const tieneRuido = /\s/.test(t) || /\bcurl\b|Authorization:|--header|-H\s|POST\s|https?:\/\//i.test(t);
  if (tieneRuido) return "";
  return t;
}

// Un Access Token de Meta Cloud API empieza por "EAA" y es largo (100+ caracteres)
export function esTokenValido(valor: string | undefined | null): boolean {
  const t = limpiarToken(valor);
  return t.length >= 60 && t.startsWith("EAA");
}

// === Normalización del número de destino ===
// WhatsApp Cloud API exige el número en formato internacional (solo dígitos, con código de país).
// Si se envía un número local, Meta responde 131030 "recipient phone number not in allowed list".

// Prefijo telefónico del país configurado (por defecto 505 = Nicaragua)
export function obtenerPaisDefecto(): string {
  const fila = db.prepare("SELECT valor FROM whatsapp_config WHERE clave = 'pais'").get() as { valor: string } | undefined;
  const crudo = (fila?.valor || process.env.WHATSAPP_PAIS_DEFECTO || "505").replace(/\D/g, "");
  return crudo;
}

// Deja el número en formato internacional. Si ya trae código de país se respeta tal cual.
export function normalizarTelefonoWhatsApp(valor: string | undefined | null, pais?: string): string {
  const soloDigitos = String(valor ?? "").replace(/\D/g, "");
  if (!soloDigitos) return "";
  // Número internacional completo (más de 8 dígitos) o prefijo internacional 00
  if (soloDigitos.length > 8) return soloDigitos.replace(/^00/, "");
  const prefijo = (pais ?? obtenerPaisDefecto()).replace(/\D/g, "");
  return prefijo ? prefijo + soloDigitos : soloDigitos;
}

// Traduce el error de la Graph API a un mensaje entendible con pista de solución
export function describirErrorApi(data: any, httpStatus?: number): string {
  const code = data?.error?.code;
  const sub = data?.error?.error_subcode;
  const detalle = data?.error?.error_data?.details;
  const msg = data?.error?.message || (httpStatus ? `HTTP ${httpStatus}` : "Error desconocido");
  let pista = "";
  if (code === 190) {
    if (sub === 463) {
      // Meta indica la fecha exacta de expiración dentro del mensaje
      const coincide = /expired on ([^.]+)/i.exec(String(msg));
      const cuando = coincide && coincide[1] ? ` el ${coincide[1].trim()}` : "";
      pista = ` → El token temporal de Meta expiró${cuando} (duran 24 h). Genera uno nuevo en Meta Business (WhatsApp > Configuración de la API) y guárdalo en Configuración (WhatsApp).`;
    } else {
      pista = " → El token de acceso es inválido, está mal pegado o expiró. Genera uno nuevo en Meta Business (WhatsApp > Configuración de la API) y guárdalo en Configuración (WhatsApp).";
    }
  } else if (code === 131030) {
    pista = " → El número de destino no está autorizado o le falta el código de país. Verifica que se envíe en formato internacional (ej. 50588285886) y, en modo de prueba, agrégalo en Meta App > WhatsApp > Destinatarios de prueba.";
  } else if (code === 100) {
    pista = " → Verifica que el Phone Number ID sea el ID del número (no el número telefónico) y que el destinatario exista.";
  } else if (code === 131047) {
    pista = " → Pasaron más de 24 h desde el último mensaje del cliente: debes usar una plantilla (template) aprobada.";
  } else if (code === 131026) {
    pista = " → El destinatario no tiene WhatsApp o no puede recibir el mensaje.";
  } else if (code === 133010) {
    pista = " → El número remitente no está registrado en WhatsApp Cloud API.";
  }
  const subTxt = sub ? ` [subcode ${sub}]` : "";
  const detTxt = detalle ? ` — ${detalle}` : "";
  return `Error API (${code ?? "desconocido"}${subTxt}): ${msg}${detTxt}${pista}`;
}

function leerConfigCruda(): Record<string, string> {
  const filas = db.prepare("SELECT clave, valor FROM whatsapp_config").all() as { clave: string; valor: string }[];
  const mapa: Record<string, string> = {};
  filas.forEach(f => { mapa[f.clave] = f.valor; });
  return mapa;
}

export function guardarConfig(clave: string, valor: string) {
  let limpio = typeof valor === "string" ? valor : String(valor);
  // Se sanea cada credencial: evita guardar texto pegado por error (comandos curl, encabezados HTTP, etc.)
  if (clave === "token") limpio = limpiarToken(limpio);
  else if (clave === "pais") limpio = limpio.replace(/\D/g, "");
  else if (clave === "numero" || clave === "phoneId" || clave === "phoneNumberId" || clave === "habilitado" || clave === "modoSimulacion") limpio = limpio.trim();
  db.prepare("INSERT OR REPLACE INTO whatsapp_config (clave, valor) VALUES (?, ?)").run(clave, limpio);
}

export function obtenerConfigActual(): ConfigWhatsApp {
  const mapa = leerConfigCruda();
  // Si el token guardado en la BD no es válido (vacío o texto pegado por error),
  // se usa el del archivo .env como respaldo para no perder la conexión ya configurada.
  const tokenBd = limpiarToken(mapa.token);
  const tokenEnv = limpiarToken(process.env.WHATSAPP_TOKEN);
  const numeroBd = (mapa.numero || "").trim();
  const numeroEnv = (process.env.WHATSAPP_PHONE_NUMBER_ID || "").trim();
  return {
    habilitado: mapa.habilitado === "true",
    numero: numeroBd || numeroEnv,
    token: tokenBd || tokenEnv,
    modoSimulacion: mapa.modoSimulacion !== "false",
    mensajeBienvenida: mapa.mensajeBienvenida || VALORES_WHATSAPP.mensajeBienvenida,
    mensajeCierre: mapa.mensajeCierre || VALORES_WHATSAPP.mensajeCierre,
    companyName: mapa.companyName || VALORES_WHATSAPP.companyName,
    moneda: mapa.moneda || VALORES_WHATSAPP.moneda,
    pais: (mapa.pais || process.env.WHATSAPP_PAIS_DEFECTO || VALORES_WHATSAPP.pais).replace(/\D/g, "")
  };
}

export function loguearEnvio(tipo: string, destinatario: string, resultado: string, mensaje: string | null, respuestaApi: string | null) {
  const info = db.prepare(
    `INSERT INTO whatsapp_logs (tipo, destinatario, resultado, mensaje, respuesta_api)
     VALUES (?, ?, ?, ?, ?)`
  ).run(tipo, destinatario, resultado, mensaje || null, respuestaApi || null);
  return { id: info.lastInsertRowid as number };
}

export function validarConfig(config: ConfigWhatsApp) {
  if (!config.habilitado) return { ok: false, error: "WhatsApp no está habilitado" };
  if (!config.numero || config.numero.trim() === "") return { ok: false, error: "Phone Number ID de WhatsApp no configurado" };
  if (!config.modoSimulacion && (!config.token || config.token.trim() === "")) {
    return { ok: false, error: "Token de API requerido para modo real" };
  }
  if (!config.modoSimulacion && !esTokenValido(config.token)) {
    return {
      ok: false,
      error: "El token guardado no tiene el formato de un Access Token de Meta (debe empezar con EAA, sin espacios ni comandos). Vuelve a pegar el token en Configuración"
    };
  }
  return { ok: true };
}

// === Plantillas de mensajes ===

export function plantillaTicket(venta: Venta, config: ConfigWhatsApp): string {
  let msj = `*${config.companyName}*\n━━━━━━━━━━━━━━━━━━\n*Ticket de Venta #${venta.id}*\n🌟 ¡Gracias por su compra!\n\n`;
  venta.detalles.forEach(item => {
    msj += `▸ ${item.cantidad}x ${item.nombre}\n   ${config.moneda}${item.precio.toFixed(2)} c/u\n\n`;
  });
  msj += `━━━━━━━━━━━━━━━━━━\nSubtotal: ${config.moneda}${venta.subtotal.toFixed(2)}\n`;
  if ((venta.descuento ?? 0) > 0) msj += `Descuento: -${config.moneda}${(venta.descuento ?? 0).toFixed(2)}\n`;
  if (venta.impuesto > 0) {
    msj += `Impuesto (${venta.impuestoPct ?? 0}%): ${config.moneda}${venta.impuesto.toFixed(2)}\n`;
  }
  msj += `Total: *${config.moneda}${venta.total.toFixed(2)}*\n\nFecha: ${venta.fecha}\n`;
  if (venta.clienteNombre) msj += `Cliente: ${venta.clienteNombre}\n`;
  msj += `\n${config.mensajeCierre}`;
  return msj;
}

export function plantillaRecordatorio(cliente: Cliente, saldo: number, config: ConfigWhatsApp): string {
  return `*${config.companyName}*\n━━━━━━━━━━━━━━━━━━\n*Recordatorio de Pago*\n\n` +
    `Estimado/a ${cliente.nombre}:\n\nSu saldo pendiente es de *${config.moneda}${saldo.toFixed(2)}*\n` +
    `Por favor realice el pago a la brevedad.\n\n🌟 ¡Gracias por su confianza!\n\n${config.mensajeCierre}`;
}

export function plantillaCatalogo(productos: Producto[], config: ConfigWhatsApp): string {
  let msj = `*${config.companyName} - Nuestro Catálogo*\n\n`;
  productos.forEach(p => {
    msj += `▸ *${p.nombre}*\n  ${config.moneda}${p.precio.toFixed(2)} | Stock: ${p.stock}\n\n`;
  });
  msj += `\n${config.mensajeCierre}`;
  return msj;
}

// === Funciones de envío ===

// Valida las credenciales consultando el número configurado en la Graph API.
// Es una operación de SOLO LECTURA: no envía ningún mensaje ni gasta conversaciones.
export async function testConexionReal(): Promise<{ ok: boolean; mensaje: string }> {
  const config = obtenerConfigActual();
  if (!config.habilitado) return { ok: false, mensaje: "WhatsApp no está habilitado" };
  if (!config.numero || config.numero.trim() === "") return { ok: false, mensaje: "Phone Number ID no configurado" };
  if (config.modoSimulacion) return { ok: true, mensaje: "Modo simulación activo. No se realizará conexión real." };
  if (!config.token || config.token.trim() === "") return { ok: false, mensaje: "Token de acceso no configurado" };
  if (!esTokenValido(config.token)) {
    return {
      ok: false,
      mensaje: "El token guardado no tiene el formato de un Access Token de Meta (empieza con EAA, sin espacios ni comandos). Pégalo de nuevo en Configuración (WhatsApp)"
    };
  }

  const url = `https://graph.facebook.com/v18.0/${config.numero}?fields=id,display_phone_number,verified_name`;
  try {
    const response = await fetch(url, {
      headers: { "Authorization": `Bearer ${config.token}` }
    });
    const data = await response.json().catch(() => ({} as any));

    if (response.ok && data?.id) {
      const numeroMostrado = data.display_phone_number || data.id;
      const nombre = data.verified_name ? ` (${data.verified_name})` : "";
      return { ok: true, mensaje: `Credenciales válidas. Número conectado: ${numeroMostrado}${nombre}` };
    }
    return { ok: false, mensaje: describirErrorApi(data, response.status) };
  } catch (err) {
    return { ok: false, mensaje: `Error de conexión: ${err}` };
  }
}



async function enviarMensajeWhatsApp(tipo: string, numeroDestino: string, mensaje: string): Promise<{ ok: boolean; resultado: string; respuestaApi?: string }> {
  const config = obtenerConfigActual();

  const res = validarConfig(config);
  if (!res.ok) {
    return { ok: false, resultado: `Error: ${res.error}` };
  }

  // Meta exige el número en formato internacional: a los números locales se les agrega el código de país.
  // Sin esto, Meta responde 131030 ("Recipient phone number not in allowed list") aunque el número sí esté autorizado.
  const destino = normalizarTelefonoWhatsApp(numeroDestino, config.pais);
  if (!destino) {
    return { ok: false, resultado: "Número de destino vacío o inválido" };
  }

  if (config.modoSimulacion) {
    loguearEnvio(tipo, destino, "simulado", mensaje, "Modo simulación activado");
    return { ok: true, resultado: `Simulado correctamente (destino ${destino})` };
  }

  // Se usa config.numero como Phone Number ID de Meta Cloud API (v18.0)
  const url = `https://graph.facebook.com/v18.0/${config.numero}/messages`;
  const body = {
    messaging_product: "whatsapp",
    to: destino,
    type: "text",
    text: { body: mensaje }
  };

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${config.token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body)
    });

    const data = await response.json();

    if (response.ok) {
      loguearEnvio(tipo, destino, "enviado", mensaje, JSON.stringify(data));
      return { ok: true, resultado: `Enviado correctamente a ${destino}`, respuestaApi: JSON.stringify(data) };
    } else {
      loguearEnvio(tipo, destino, "error", mensaje, JSON.stringify(data));
      return { ok: false, resultado: describirErrorApi(data, response.status), respuestaApi: JSON.stringify(data) };
    }
  } catch (err) {
    loguearEnvio(tipo, destino, "error", mensaje, String(err));
    return { ok: false, resultado: `Error de conexión: ${err}` };
  }
}

export async function enviarTicketWhatsApp(ventaId: number, numero: string): Promise<{ ok: boolean; resultado: string }> {
  const config = obtenerConfigActual();
  const venta = db.prepare(
    `SELECT v.*, c.nombre as clienteNombre FROM ventas v LEFT JOIN clientes c ON c.id = v.cliente_id WHERE v.id = ?`
  ).get(ventaId) as any;
  if (!venta) return { ok: false, resultado: "Venta no encontrada" };

  const detalles = db.prepare(
    `SELECT producto_id, nombre, precio, cantidad, subtotal FROM venta_detalles WHERE venta_id = ?`
  ).all(ventaId) as DetalleVenta[];
  
  // El desglose se guardó al cobrar (ventas anteriores: subtotal = total, sin descuento ni impuesto).
  const subtotal = Number(venta.subtotal ?? venta.total) || 0;
  const descuento = Number(venta.descuento) || 0;
  const impuesto = Number(venta.impuesto) || 0;
  const impuestoPct = Number(venta.impuesto_pct) || 0;
  
  const data: Venta = {
    id: venta.id, detalles, subtotal, descuento, impuesto,
    impuestoPct,
    total: venta.total, fecha: venta.fecha, clienteNombre: venta.clienteNombre
  };
  
  const mensaje = plantillaTicket(data, config);
  const envio = await enviarMensajeWhatsApp("ticket", numero, mensaje);
  return { ok: envio.ok, resultado: envio.resultado };
}

export async function enviarRecordatorioCreditoWhatsApp(clienteId: number, numero: string): Promise<{ ok: boolean; resultado: string }> {
  const config = obtenerConfigActual();
  const cliente = db.prepare("SELECT nombre FROM clientes WHERE id = ?").get(clienteId) as { nombre: string } | undefined;
  if (!cliente) return { ok: false, resultado: "Cliente no encontrado" };
  
  const saldoRow = db.prepare(
    "SELECT COALESCE(SUM(total), 0) as total FROM ventas WHERE cliente_id = ? AND tipo_pago = 'credito'"
  ).get(clienteId) as { total: number };
  
  const saldo = saldoRow.total;
  if (saldo <= 0) return { ok: false, resultado: "El cliente no tiene saldo pendiente" };
  
  const mensaje = plantillaRecordatorio(cliente, saldo, config);
  const envio = await enviarMensajeWhatsApp("recordatorio", numero, mensaje);
  return { ok: envio.ok, resultado: envio.resultado };
}

export async function enviarCatalogoWhatsApp(numero: string): Promise<{ ok: boolean; resultado: string }> {
  const config = obtenerConfigActual();
  const productos = db.prepare("SELECT nombre, precio, stock FROM productos ORDER BY nombre LIMIT 20").all() as Producto[];
  if (productos.length === 0) return { ok: false, resultado: "No hay productos para enviar" };
  
  const mensaje = plantillaCatalogo(productos, config);
  const envio = await enviarMensajeWhatsApp("catalogo", numero, mensaje);
  return { ok: envio.ok, resultado: envio.resultado };
}

export async function enviarMensajeLibreWhatsApp(numero: string, mensaje: string): Promise<{ ok: boolean; resultado: string }> {
  const envio = await enviarMensajeWhatsApp("mensaje_libre", numero, mensaje);
  return { ok: envio.ok, resultado: envio.resultado };
}

// Valida el token contra la Graph API y lo guarda en la configuración.
// Devuelve { ok, advertencia?, error? } para que la UI informe al usuario.
export async function guardarTokenValidado(token: string): Promise<{ ok: boolean; advertencia?: string; error?: string }> {
  const limpio = limpiarToken(token);
  if (!limpio) {
    return { ok: false, error: "El texto pegado no es un token válido (contiene espacios, saltos de línea o un comando). Copia solo el Access Token, sin la palabra Bearer ni el comando curl." };
  }
  guardarConfig("token", limpio);
  if (!esTokenValido(limpio)) {
    return { ok: true, advertencia: "Token guardado, pero no tiene el formato esperado (debe empezar con EAA). Si el envío falla, genera un token nuevo en Meta Business." };
  }
  // Verificación de solo lectura contra Meta
  try {
    const r = await fetch("https://graph.facebook.com/v18.0/me?fields=id,name", {
      headers: { "Authorization": `Bearer ${limpio}` }
    });
    const data = await r.json().catch(() => ({} as any));
    if (r.ok && data?.id) {
      return { ok: true };
    }
    return { ok: true, advertencia: describirErrorApi(data, r.status) };
  } catch (err) {
    return { ok: true, advertencia: `No se pudo verificar el token por falta de conexión: ${err}` };
  }
}

export function obtenerHistorialWhatsApp(limit = 50) {
  return db.prepare(
    `SELECT * FROM whatsapp_logs ORDER BY creado DESC LIMIT ?`
  ).all(limit) as Array<{
    id: number; tipo: string; destinatario: string;
    resultado: string; mensaje: string | null;
    respuesta_api: string | null; creado: string;
  }>;
}

export function obtenerHistorialPorClienteWhatsApp(clienteId: number) {
  const cliente = db.prepare("SELECT telefono FROM clientes WHERE id = ?").get(clienteId) as { telefono: string } | undefined;
  if (!cliente?.telefono) return [];
  // El historial guarda el número en formato internacional; también se acepta el número tal como está en la ficha del cliente.
  const normalizado = normalizarTelefonoWhatsApp(cliente.telefono);
  return db.prepare(
    `SELECT * FROM whatsapp_logs WHERE destinatario IN (?, ?) ORDER BY creado DESC`
  ).all(cliente.telefono, normalizado) as Array<{
    id: number; tipo: string; destinatario: string;
    resultado: string; mensaje: string | null;
    respuesta_api: string | null; creado: string;
  }>;
}

export function obtenerEstadisticasWhatsApp() {
  const total = (db.prepare("SELECT COUNT(*) as total FROM whatsapp_logs").get() as any).total;
  const enviados = (db.prepare("SELECT COUNT(*) as total FROM whatsapp_logs WHERE resultado = 'enviado'").get() as any).total;
  const fallidos = (db.prepare("SELECT COUNT(*) as total FROM whatsapp_logs WHERE resultado = 'error'").get() as any).total;
  const hoyCount = (db.prepare("SELECT COUNT(*) as total FROM whatsapp_logs WHERE DATE(creado) = DATE('now')").get() as any).total;
  const tipos = db.prepare(
    `SELECT tipo, COUNT(*) as total FROM whatsapp_logs GROUP BY tipo ORDER BY total DESC`
  ).all() as Array<{ tipo: string; total: number }>;
  
  return {
    total_envios: total, 
    enviados_exitosamente: enviados,
    fallidos, 
    envios_hoy: hoyCount,
    tipos_mas_usados: tipos.map(t => ({ tipo: t.tipo, total: t.total }))
  };
}