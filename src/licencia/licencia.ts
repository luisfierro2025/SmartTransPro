import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { app } from "electron";

export interface EstadoLicencia {
  activada: boolean; codigo?: string | undefined; producto?: string | undefined; tipo?: string | undefined; estado?: string | undefined;
  fechaInicio?: string | undefined; fechaVencimiento?: string | null | undefined; maxEquipos?: number | undefined;
  equipoId: string; nombreEquipo: string; mensaje?: string | undefined;
}

interface DatosLicenciaLocal {
  codigo: string; equipoId: string; nombreEquipo: string; producto?: string | undefined; tipo?: string | undefined; estado?: string | undefined;
  fechaInicio?: string | undefined; fechaVencimiento?: string | null | undefined; maxEquipos?: number | undefined;
  activadaEn: string; ultimaValidacion: string; firma?: string | undefined;
}

// Estados con los que el servidor de licencias NO debe permitir operar.
const ESTADOS_BLOQUEADOS = ["suspendida", "revocada", "bloqueada", "cancelada", "vencida", "expirada", "inactiva"];
const TIMEOUT_MS = 15000;          // activación
const TIMEOUT_VALIDAR_MS = 5000;   // validación al iniciar: no debe dejar la pantalla esperando
const GRACIA_DIAS = 7;             // días que se puede trabajar sin poder consultar al servidor
const CACHE_VALIDACION_MS = 10 * 60 * 1000; // evita volver a consultar al recargar la ventana tras el login

const ARCHIVO_LICENCIA = () => path.join(app.getPath("userData"), "smartpospro-license.json");
const ARCHIVO_EQUIPO = () => path.join(app.getPath("userData"), "smartpospro-equipo.json");

// Estado en memoria.
let cacheVigente: { hasta: number; ok: boolean } | null = null;
let validadoHasta = 0;                  // hasta cuándo se considera válida la última consulta al servidor
let bloqueoRemoto: string | null = null; // motivo si el servidor RECHAZÓ explícitamente este equipo

// El JSON editado en el Bloc de notas de Windows puede traer BOM.
function leerJson(archivo: string): any {
  try {
    if (!fs.existsSync(archivo)) return null;
    return JSON.parse(fs.readFileSync(archivo, "utf8").replace(/^\uFEFF/, ""));
  } catch { return null; }
}

// ================================================================
// URL DEL SERVIDOR DE LICENCIAS
// ================================================================

function normalizarUrl(valor: string): string | null {
  let url = String(valor || "").trim().replace(/\/+$/, "");
  if (!url) return null;
  if (!/^https?:\/\//i.test(url)) url = "http://" + url;
  try { new URL(url); return url; } catch { return null; }
}

export function urlServidorLicencias(): string | null {
  const deEntorno = normalizarUrl(process.env.ALIS_LICENSING_URL || "");
  if (deEntorno) return deEntorno;

  const candidatos = [
    path.join(app.getPath("userData"), "licencia-config.json"),
    path.join(app.getAppPath(), "licencia-config.json"),
    path.join(path.dirname(app.getPath("exe")), "licencia-config.json")
  ];

  for (const archivo of candidatos) {
    const cfg = leerJson(archivo);
    const url = cfg && typeof cfg.url === "string" ? normalizarUrl(cfg.url) : null;
    if (url) return url;
  }

  return app.isPackaged ? null : "http://localhost:3000";
}

// ================================================================
// IDENTIDAD DEL EQUIPO
// ================================================================

function generarEquipoId(): string {
  const datos = [os.hostname(), os.platform(), os.arch(), os.cpus()[0]?.model || "", os.userInfo().username || ""].join("|");
  return crypto.createHash("sha256").update(datos).digest("hex").slice(0, 32).toUpperCase();
}

// El ID se fija una vez en un archivo propio.
function obtenerEquipoId(): string {
  const guardado = leerJson(ARCHIVO_EQUIPO());
  if (guardado && typeof guardado.equipoId === "string" && guardado.equipoId.length >= 16) return guardado.equipoId;

  const nuevo = generarEquipoId();
  try {
    fs.mkdirSync(path.dirname(ARCHIVO_EQUIPO()), { recursive: true });
    fs.writeFileSync(ARCHIVO_EQUIPO(), JSON.stringify({ equipoId: nuevo }, null, 2), { encoding: "utf8", mode: 0o600 });
  } catch {
    // Si no se puede escribir, se usa el ID calculado igualmente.
  }
  return nuevo;
}

// ================================================================
// LICENCIA LOCAL FIRMADA
// ================================================================

function firmar(d: DatosLicenciaLocal): string {
  const clave = crypto.createHash("sha256").update("SmartPosPro|ALIS|" + d.equipoId).digest();
  const cuerpo = JSON.stringify([d.codigo, d.equipoId, d.producto ?? "", d.tipo ?? "", d.estado ?? "", d.fechaInicio ?? "", d.fechaVencimiento ?? "", d.maxEquipos ?? 0, d.activadaEn]);
  return crypto.createHmac("sha256", clave).update(cuerpo).digest("hex");
}

function firmaValida(d: DatosLicenciaLocal): boolean {
  if (!d.firma) return false;
  const a = Buffer.from(d.firma, "hex");
  const b = Buffer.from(firmar(d), "hex");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function leerLicenciaLocal(): DatosLicenciaLocal | null {
  const datos = leerJson(ARCHIVO_LICENCIA());
  if (!datos || typeof datos.codigo !== "string" || typeof datos.equipoId !== "string") return null;
  return datos as DatosLicenciaLocal;
}

function guardarLicenciaLocal(datos: DatosLicenciaLocal): void {
  const archivo = ARCHIVO_LICENCIA();
  fs.mkdirSync(path.dirname(archivo), { recursive: true });
  const temporal = archivo + ".tmp";
  fs.writeFileSync(temporal, JSON.stringify({ ...datos, firma: firmar(datos) }, null, 2), { encoding: "utf8", mode: 0o600 });
  fs.renameSync(temporal, archivo);
  cacheVigente = null;
}

/** Devuelve el motivo por el que la licencia local no sirve. */
function motivoInvalida(lic: DatosLicenciaLocal, equipoId: string): string | null {
  if (lic.equipoId !== equipoId) return "La licencia pertenece a otro equipo. Actívala de nuevo en este equipo.";

  if (!firmaValida(lic)) {
    // Licencias activadas con versiones anteriores no traían firma.
    if (lic.firma) return "El archivo de licencia fue modificado. Actívala de nuevo.";
    try { guardarLicenciaLocal(lic); } catch { /* Se respeta la licencia heredada. */ }
  }

  const estado = String(lic.estado || "").trim().toLowerCase();
  if (estado && ESTADOS_BLOQUEADOS.includes(estado)) return "La licencia está " + estado + ". Contacta a ALIS Software.";

  if (lic.fechaVencimiento) {
    const vence = new Date(lic.fechaVencimiento);
    if (!Number.isNaN(vence.getTime()) && vence.getTime() < Date.now()) return "La licencia venció el " + vence.toLocaleDateString("es") + ". Renueva tu licencia para continuar.";
  }

  return null;
}

// ================================================================
// ESTADO LOCAL
// ================================================================

export function obtenerEstadoLicencia(): EstadoLicencia {
  const equipoId = obtenerEquipoId();
  const nombreEquipo = os.hostname();
  const lic = leerLicenciaLocal();

  if (!lic) return { activada: false, equipoId, nombreEquipo, mensaje: "SmartPosPro no está activado." };

  const motivo = motivoInvalida(lic, equipoId);
  if (motivo) return { activada: false, codigo: lic.codigo, equipoId, nombreEquipo, mensaje: motivo };

  return {
    activada: true, codigo: lic.codigo, producto: lic.producto, tipo: lic.tipo, estado: lic.estado,
    fechaInicio: lic.fechaInicio, fechaVencimiento: lic.fechaVencimiento, maxEquipos: lic.maxEquipos, equipoId, nombreEquipo
  };
}

// ================================================================
// VALIDACIÓN REMOTA
// ================================================================

interface ResultadoRemoto {
  ok: boolean;
  /** true = el servidor respondió y RECHAZÓ el equipo. false = no se pudo consultar (servidor apagado, sin internet, error 5xx...). */
  rechazada: boolean;
  mensaje?: string;
}

async function validarLicenciaRemota(): Promise<ResultadoRemoto> {
  const lic = leerLicenciaLocal();
  if (!lic) return { ok: false, rechazada: false, mensaje: "SmartPosPro no está activado." };

  const base = urlServidorLicencias();
  if (!base) return { ok: false, rechazada: false, mensaje: "No se configuró el servidor de licencias." };

  const equipoId = obtenerEquipoId();
  const motivo = motivoInvalida(lic, equipoId);
  if (motivo) return { ok: false, rechazada: true, mensaje: motivo };

  const control = new AbortController();
  const temporizador = setTimeout(() => control.abort(), TIMEOUT_VALIDAR_MS);
  let respuesta: Response;

  try {
    // GET: NO activa, NO crea activaciones, NO modifica la licencia. Solo pregunta si este equipo sigue autorizado.
    const parametros = new URLSearchParams({ codigo: lic.codigo, equipoId, nombreEquipo: os.hostname(), version: app.getVersion() });
    respuesta = await fetch(base + "/api/licencias/validar?" + parametros.toString(), { method: "GET", headers: { Accept: "application/json" }, signal: control.signal });
  } catch (error) {
    const agotado = error instanceof Error && error.name === "AbortError";
    return { ok: false, rechazada: false, mensaje: agotado ? "El servidor de licencias tardó demasiado en responder." : "No se pudo conectar con el servidor de licencias." };
  } finally {
    clearTimeout(temporizador);
  }

  let resultado: any = null;
  try { resultado = await respuesta.json(); } catch { resultado = null; }

  // Servidor autoriza el equipo.
  if (respuesta.ok && resultado?.ok === true) {
    const l = resultado.licencia;
    const datosActualizados: DatosLicenciaLocal = {
      ...lic,
      codigo: l?.codigo || lic.codigo, producto: l?.producto || lic.producto, tipo: l?.tipo || lic.tipo, estado: l?.estado || lic.estado,
      fechaInicio: l?.fechaInicio || lic.fechaInicio, fechaVencimiento: l?.fechaVencimiento ?? lic.fechaVencimiento ?? null,
      maxEquipos: l?.maxEquipos ?? lic.maxEquipos, ultimaValidacion: new Date().toISOString()
    };
    try { guardarLicenciaLocal(datosActualizados); } catch { /* Si no se puede guardar la fecha, la licencia sigue siendo válida. */ }
    return { ok: true, rechazada: false, mensaje: resultado.mensaje || "Licencia válida." };
  }

  // Sin JSON (HTML de error, ruta inexistente) o error 5xx: el servidor no está funcionando bien, NO es un rechazo.
  if (resultado === null || typeof resultado !== "object" || respuesta.status >= 500) {
    return { ok: false, rechazada: false, mensaje: "El servidor de licencias no está disponible (HTTP " + respuesta.status + ")." };
  }

  // El servidor respondió y rechaza: caso del botón "Liberar", suspendida, vencida, etc.
  return { ok: false, rechazada: true, mensaje: resultado.motivo || resultado.error || resultado.mensaje || "El equipo ya no está autorizado para usar esta licencia." };
}

// ================================================================
// VIGENCIA DE LICENCIA
// ================================================================

export function licenciaVigente(): boolean {
  // Si el servidor rechazó el equipo, se bloquea todo hasta que se active de nuevo.
  if (bloqueoRemoto) return false;

  const ahora = Date.now();
  if (cacheVigente && cacheVigente.hasta > ahora) return cacheVigente.ok;

  // Función síncrona usada por el flujo IPC: comprueba la licencia local. La consulta remota la hace validarLicenciaAlIniciar().
  const ok = obtenerEstadoLicencia().activada;
  cacheVigente = { hasta: ahora + 3000, ok };
  return ok;
}

// ================================================================
// VALIDACIÓN REMOTA AL INICIAR
// ================================================================

/*
 * Se ejecuta al iniciar (y tras recargar la ventana). Reglas:
 *  - El servidor confirma            -> se trabaja normal.
 *  - El servidor RECHAZA             -> se bloquea (activada: false) y se muestra el motivo.
 *  - El servidor NO responde         -> período de gracia (GRACIA_DIAS) desde la última validación correcta;
 *                                       pasado ese plazo se bloquea. Así la app no se queda en blanco si el servidor está apagado.
 * Nunca borra smartpospro-license.json ni smartpospro-equipo.json.
 */
export async function validarLicenciaAlIniciar(): Promise<EstadoLicencia> {
  const local = obtenerEstadoLicencia();
  if (!local.activada) return local;

  // Consulta reciente: no se vuelve a llamar al servidor (p. ej. al recargar la ventana después del login).
  if (validadoHasta > Date.now() && !bloqueoRemoto) return local;

  const r = await validarLicenciaRemota();

  if (r.ok) {
    bloqueoRemoto = null;
    validadoHasta = Date.now() + CACHE_VALIDACION_MS;
    cacheVigente = { hasta: Date.now() + 3000, ok: true };
    return obtenerEstadoLicencia();
  }

  if (!r.rechazada) {
    const lic = leerLicenciaLocal();
    const ultima = Date.parse(String(lic?.ultimaValidacion || lic?.activadaEn || ""));
    const dentroDeGracia = Number.isFinite(ultima) && Date.now() - ultima <= GRACIA_DIAS * 86400000;

    if (dentroDeGracia) {
      console.warn("[licencia] Servidor no disponible, se trabaja con la licencia local (gracia):", r.mensaje);
      bloqueoRemoto = null;
      validadoHasta = Date.now() + 2 * 60 * 1000; // no reintentar (y esperar) en cada recarga
      cacheVigente = { hasta: Date.now() + 3000, ok: true };
      return local;
    }

    bloqueoRemoto = "No se pudo validar la licencia en más de " + GRACIA_DIAS + " días. " + (r.mensaje || "") + " Conéctate al servidor de licencias.";
  } else {
    bloqueoRemoto = r.mensaje || "Este equipo ya no está autorizado para usar la licencia.";
  }

  validadoHasta = 0;
  cacheVigente = { hasta: Date.now() + 3000, ok: false };
  return { ...local, activada: false, mensaje: bloqueoRemoto };
}

// ================================================================
// ACTIVACIÓN CONTRA EL SERVIDOR ALIS
// ================================================================

export async function activarLicencia(codigo: string): Promise<EstadoLicencia> {
  const codigoLimpio = String(codigo || "").trim().toUpperCase();
  if (!codigoLimpio) throw new Error("Ingresa el código de licencia.");

  const base = urlServidorLicencias();
  if (!base) throw new Error("No se configuró el servidor de licencias. Crea el archivo licencia-config.json con { \"url\": \"https://tu-servidor\" } o define ALIS_LICENSING_URL.");

  const equipoId = obtenerEquipoId();
  const nombreEquipo = os.hostname();
  const control = new AbortController();
  const temporizador = setTimeout(() => control.abort(), TIMEOUT_MS);
  let respuesta: Response;

  try {
    respuesta = await fetch(base + "/api/licencias/activar", {
      method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ codigo: codigoLimpio, equipoId, nombreEquipo, version: app.getVersion() }), signal: control.signal
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") throw new Error("El servidor de licencias tardó demasiado en responder (" + base + "). Inténtalo de nuevo.");
    throw new Error("No se pudo conectar con el servidor de licencias (" + base + "). Revisa tu conexión a internet o que el servidor esté en línea.");
  } finally {
    clearTimeout(temporizador);
  }

  let resultado: any = null;
  try { resultado = await respuesta.json(); } catch { resultado = null; }

  if (!respuesta.ok || !resultado?.ok) {
    throw new Error(resultado?.mensaje || resultado?.error || "El servidor de licencias respondió con error (HTTP " + respuesta.status + ") en " + base + ".");
  }

  const licencia = resultado.licencia || {};
  const ahora = new Date().toISOString();

  const datos: DatosLicenciaLocal = {
    codigo: licencia.codigo || codigoLimpio, equipoId, nombreEquipo, producto: licencia.producto, tipo: licencia.tipo, estado: licencia.estado,
    fechaInicio: licencia.fechaInicio, fechaVencimiento: licencia.fechaVencimiento ?? null, maxEquipos: licencia.maxEquipos, activadaEn: ahora, ultimaValidacion: ahora
  };

  const motivo = motivoInvalida({ ...datos, firma: firmar(datos) }, equipoId);
  if (motivo) throw new Error(motivo);

  guardarLicenciaLocal(datos);

  // Activación correcta: se limpia cualquier bloqueo o validación anterior.
  bloqueoRemoto = null;
  validadoHasta = Date.now() + CACHE_VALIDACION_MS;
  cacheVigente = { hasta: Date.now() + 3000, ok: true };

  return {
    activada: true, codigo: datos.codigo, producto: datos.producto, tipo: datos.tipo, estado: datos.estado,
    fechaInicio: datos.fechaInicio, fechaVencimiento: datos.fechaVencimiento, maxEquipos: datos.maxEquipos, equipoId, nombreEquipo, mensaje: resultado.mensaje
  };
}

// ================================================================
// INFORMACIÓN DEL EQUIPO
// ================================================================

export function obtenerEquipoLicencia(): { equipoId: string; nombreEquipo: string } {
  return { equipoId: obtenerEquipoId(), nombreEquipo: os.hostname() };
}
