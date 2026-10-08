import { createServer as createServerHttp, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { createServer as createServerHttps } from "node:https";
import { networkInterfaces } from "node:os";
import { randomBytes, X509Certificate } from "node:crypto";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import selfsigned from "selfsigned";
import QRCode from "qrcode";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * ==========================================================================
 * Escáner por teléfono
 * ==========================================================================
 * SmartPosPro corre en el PC de la caja y el teléfono hace de lector: este
 * abre una página en la red local, apunta la cámara al producto y manda el
 * código leído al PC, que lo agrega al carrito.
 *
 * Monta un servidor HTTP solo en la red local, protegido con un token
 * aleatorio por sesión: quien no abra la dirección exacta no puede inyectar
 * códigos en la caja.
 *
 * El HTML y la librería de lectura (ZXing) se sirven como archivos sueltos
 * desde `node_modules`, porque el renderer no tiene paso de compilación.
 * ==========================================================================
 */

const PUERTO_POR_DEFECTO = 4599;

let servidor: Server | null = null;
let tokenActual = "";
let alRecibirCodigo: ((codigo: string) => void) | null = null;
// Cuando hay certificado, la página se sirve por HTTPS. Es obligatorio: los
// navegadores SOLO entregan la cámara en un contexto seguro, y en
// http://192.168.x.x no existe `navigator.mediaDevices`, así que el <video>
// se queda en negro sin dar ningún error.
let usandoHttps = false;

const ARCHIVOS: Record<string, { ruta: string; tipo: string }> = {
  "/zxing.min.js": {
    ruta: path.join(__dirname, "..", "..", "node_modules", "@zxing", "library", "umd", "index.min.js"),
    tipo: "text/javascript; charset=utf-8"
  }
};

/**
 * El certificado se puede descargar desde el propio navegador. Instalar el
 * archivo como "certificado de CA" en el teléfono es lo que hace que el aviso
 * "no es un sitio seguro" desaparezca para siempre, sin depender de pulsar
 * "Avanzado" cada vez.
 */
const RUTA_CERTIFICADO = "/smartpospro-ca.crt";

/**
 * Dirección IP de la LAN: el teléfono entra por aquí, no por localhost.
 *
 * No se vale la primera IPv4 que aparezca. Un equipo suele tener varias
 * (Ethernet, WiFi, VPN, Hyper-V, "Conexión de área local" con 169.254.x.x) y
 * la primera no siempre es la red del router: si el QR apunta a una de esas,
 * el teléfono no llega nunca y no hay aviso que lo explique. Se descartan las
 * que no sirven y se prefieren las privadas, que es donde está el router.
 */
export function ipLocal(): string {
  const candidatas: string[] = [];
  for (const lista of Object.values(networkInterfaces())) {
    for (const red of lista ?? []) {
      if (red.family !== "IPv4" || red.internal) continue;
      if (!red.address) continue;
      // 169.254.x.x es "dirección autoconfigurada": solo sirve en esa misma red
      // sin router, así que desde el teléfono no se llega nunca.
      if (red.address.startsWith("169.254.")) continue;
      candidatas.push(red.address);
    }
  }

  const privadas = candidatas.filter(esPrivada);
  const base = privadas.length ? privadas : candidatas;
  if (!base.length) return "127.0.0.1";
  return base.sort((a, b) => pesoDeRed(a) - pesoDeRed(b))[0]!;
}

/** ¿Es una dirección privada de las que reparte un router de la tienda? */
function esPrivada(ip: string): boolean {
  if (ip.startsWith("192.168.")) return true;
  if (ip.startsWith("10.")) return true;
  const partes = ip.split(".");
  if (partes[0] === "172") {
    const segundo = Number(partes[1]);
    return segundo >= 16 && segundo <= 31;
  }
  return false;
}

/** Orden estable: primero 192.168.x, luego 10.x, luego el resto. */
function pesoDeRed(ip: string): number {
  if (ip.startsWith("192.168.")) return 0;
  if (ip.startsWith("10.")) return 1;
  return 2;
}

interface Certificado {
  clave: string;
  certificado: string;
}

/**
 * Se pone true cuando hubo que rehacer el certificado porque ya no cubría la
 * IP actual. El teléfono conserva el anterior, así que la cámara seguirá sin
 * funcionar hasta que se reinstale: la caja avisa de ello en vez de dejar al
 * cajero creyendo que el problema es del navegador.
 */
let avisoCertCambiado = false;

/**
 * Crea (una sola vez) un certificado autofirmado válido para la IP de esta
 * red. Se guarda junto a los datos del programa para que no cambie en cada
 * arranque: si cambiara, el teléfono volvería a pedir la instalación.
 *
 * Va autofirmado porque es una red local del propio negocio. La primera vez
 * el navegador del móvil avisará que el sitio no es de confianza; hay que
 * aceptar y, para que la cámara funcione, confiar en el certificado.
 */
async function obtenerCertificado(ip: string): Promise<Certificado | null> {
  const carpeta = path.join(os.homedir(), ".smartpospro");
  const archivoClave = path.join(carpeta, "escaner-clave.pem");
  const archivoCert = path.join(carpeta, "escaner-cert.pem");

  try {
    const [clave, certificado] = await Promise.all([
      readFile(archivoClave, "utf8"),
      readFile(archivoCert, "utf8")
    ]);
    // Se reutiliza el certificado solo si sigue sirviendo para lo que lo
    // necesita: que sea instalable como CA en el teléfono y que cubra la IP
    // actual de la caja. Si el router cambió la IP, o si es una versión
    // anterior marcada como certificado de servidor (no de CA), se rehace.
    const leido = new X509Certificate(certificado);
    const cubreIp = (leido.subjectAltName ?? "").includes(`IP Address:${ip}`);
    if (leido.ca && cubreIp) return { clave, certificado };
    // Se rehace porque el anterior ya no sirve (cambió la IP del router o era
    // de una versión antigua). El móvil tiene el certificado viejo instalado y
    // por eso seguirá sin fiarse: se avisa para que se reinstale, que si no
    // vuelve a pasar por un aviso incomprensible.
    if (leido.ca) {
      avisoCertCambiado = true;
    }
  } catch {
    // No existe todavía: se genera abajo.
  }

  try {
    await mkdir(carpeta, { recursive: true });
    // `basicConstraints cA:true` es imprescindible: Android e iOS solo
    // permiten instalar como "Certificado de CA" los que pueden firmar otros.
    // Sin esto el teléfono rechaza el archivo y el aviso de sitio no seguro
    // nunca desaparece. Además se declara para que sirva también al propio
    // servidor HTTPS de la caja.
    const pems = selfsigned.generate([{ name: "commonName", value: "SmartPosPro escaner" }], {
      days: 3650,
      keySize: 2048,
      algorithm: "sha256",
      extensions: [
        { name: "basicConstraints", cA: true },
        { name: "keyUsage", keyCertSign: true, cRLSign: true, digitalSignature: true, keyEncipherment: true },
        { name: "extKeyUsage", serverAuth: true, clientAuth: true },
        {
          // La IP va en altNames para que el móvil acepte el certificado al
          // conectarse a esa dirección concreta, y no solo a "localhost".
          name: "subjectAltName",
          altNames: [
            { type: 7, ip: "127.0.0.1" },
            { type: 7, ip },
            { type: 2, value: "localhost" }
          ]
        }
      ]
    });
    await Promise.all([
      writeFile(archivoClave, pems.private, "utf8"),
      writeFile(archivoCert, pems.cert, "utf8")
    ]);
    return { clave: pems.private, certificado: pems.cert };
  } catch (error) {
    console.warn("escaner: no se pudo crear el certificado", error);
    return null;
  }
}

/**
 * La página lleva dentro el token de la sesión. Se inyecta al servirla: sin
 * él, cada código leído por la cámara rebotaría con 403 y el carrito nunca se
 * llenaría, aunque la cámara funcionara y todo pareciera correcto.
 */
function htmlEscaner(token: string): string {
  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">
<title>SmartPosPro · Escanear</title>
<style>
  *{box-sizing:border-box}
  body{margin:0;background:#0b1220;color:#e8eef8;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;
       display:flex;flex-direction:column;height:100vh;overflow:hidden}
  header{padding:14px 16px;font-size:15px;font-weight:600;background:#111c30;display:flex;align-items:center;gap:9px}
  header .punto{width:9px;height:9px;border-radius:50%;background:#22c55e;box-shadow:0 0 8px #22c55e}
  #zona{position:relative;flex:1;background:#0b1220;overflow:hidden;display:flex;align-items:center;justify-content:center}
  video{width:100%;height:100%;object-fit:cover;display:block}
  /* El oscurecido de fuera del recuadro se activa SOLO cuando la cámara
     está funcionando; si no, se vería un recuadto negro sin explicación. */
  body.con-camara #marco{box-shadow:0 0 0 2000px rgba(0,0,0,.45)}
  body.con-camara #guia{display:block}
  #guia{position:absolute;inset:0;pointer-events:none;display:none;
        background:linear-gradient(rgba(0,0,0,.4),transparent 22%,transparent 78%,rgba(0,0,0,.4))}
  #marco{position:absolute;left:8%;right:8%;top:32%;height:22%;
         border:2px solid #38bdf8;border-radius:12px}
  /* Aviso cuando la cámara no está disponible (falta HTTPS o permiso). */
  #aviso{display:none;padding:0 26px;text-align:center}
  #aviso .icono{font-size:34px;line-height:1}
  #aviso h2{margin:12px 0 8px;font-size:16px;color:#f8fafc}
  #aviso p{margin:0 0 10px;font-size:13.5px;line-height:1.55;color:#9fb0c9}
  #aviso code{padding:2px 6px;background:#1e293b;border-radius:4px;font-size:12px;word-break:break-all}
  a.descargar-cert{color:#38bdf8;font-size:12.5px}
  details.diag{margin:10px 0 0;font-size:12px;text-align:left;color:#9fb0c9}
  details.diag summary{cursor:pointer;color:#64748b}
  #diagCuerpo{margin-top:8px;line-height:1.7;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11.5px}
  #diagCuerpo b{color:#e2e8f0}
  .mal{color:#f87171}.bien{color:#4ade80}
  .diag-boton{margin-top:9px;padding:8px 12px;font-size:12px;color:#e2e8f0;background:#1e293b;
              border:1px solid #334155;border-radius:7px;cursor:pointer}
  footer{padding:14px 16px;background:#111c30;font-size:13.5px;line-height:1.5;text-align:center}
  #estado{font-weight:600}
  .ok{color:#4ade80}.mal{color:#f87171}.info{color:#94a3b8}
  small{display:block;color:#7b8ba5;font-size:11.5px;margin-top:5px}
</style>
</head>
<body>
<header><span class="punto"></span>SmartPosPro · Escáner</header>
<div id="zona">
  <video id="camara" playsinline muted autoplay></video>
  <div id="guia"></div>
  <div id="marco"></div>
  <div id="aviso">
    <div class="icono">&#128247;</div>
    <h2 id="avisoTitulo">No se pudo abrir la cámara</h2>
    <p id="avisoTexto"></p>
    <p id="avisoExtra"></p>
    <p><a class="descargar-cert" href="/smartpospro-ca.crt" id="avisoCert">Descargar el certificado</a></p>
    <button type="button" class="diag-boton" id="avisoReintentar" style="display:none">Ya instalé el certificado — reintentar</button>
  </div>
</div>
<footer>
  <div id="estado" class="info">Iniciando cámara…</div>
  <small id="contador"></small>
  <details class="diag">
    <summary>Diagnóstico (si la cámara no funciona, abre esto)</summary>
    <div id="diagCuerpo"></div>
    <button type="button" id="btnProbarCamara" class="diag-boton">Probar la cámara otra vez</button>
  </details>
</footer>
<script src="/zxing.min.js"></script>
<script>
(function(){
  var TOTAL = 0;
  var estado = document.getElementById('estado');
  var contador = document.getElementById('contador');
  var ZX = window.ZXing || window.zxing || null;
  // Token de la sesión, puesto por la caja al servir esta página. Viaja en cada
  // envío porque es lo que el servidor comprueba antes de sumar el producto.
  var TOKEN = '__SMARTPOS_TOKEN__';

  function avisar(texto, clase){ estado.textContent = texto; estado.className = clase || 'info'; }
  if (!ZX) { avisar('No se pudo cargar el lector.', 'mal'); return; }

  // Diagnóstico: en lugar de adivinar por qué la cámara no arranca, se muestra
  // el estado real y el error exacto que devuelve el navegador.
  function linea(etiqueta, valor, clase){
    return '<div><b>' + etiqueta + ':</b> <span class="' + (clase || '') + '">' + valor + '</span></div>';
  }
  function pintarDiag(extra){
    var d = document.getElementById('diagCuerpo');
    var seguro = (window.isSecureContext === true);
    var tieneMD = !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
    var html = linea('Conexión segura', seguro ? 'sí' : 'NO', seguro ? 'bien' : 'mal');
    html += linea('Cámara disponible', tieneMD ? 'sí' : 'no', tieneMD ? 'bien' : 'mal');
    // Si el aviso "no es un sitio seguro" ya no aparece, el certificado quedó
    // instalado y el navegador confía en la caja.
    html += linea('Aviso del navegador', seguro ? 'ninguno' : 'pendiente');
    if (extra) html += '<div style="margin-top:6px">' + extra + '</div>';
    d.innerHTML = html;
  }
  function probarCamara(){
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      pintarDiag('<span class="mal">Este navegador no permite cámara en esta conexión. Es el aviso de sitio no seguro.</span>');
      return;
    }
    navigator.mediaDevices.getUserMedia({ video: true }).then(function(flujo){
      flujo.getTracks().forEach(function(t){ t.stop(); });
      pintarDiag('<span class="bien">La cámara SÍ abre. Si no ves imagen, baja el zip sobre el recuadro o usa el botón de reintentar.</span>');
    }).catch(function(err){
      pintarDiag('<span class="mal">Error ' + (err && err.name) + ': ' +
        (err && err.name === 'NotAllowedError'
          ? 'permiso denegado. En Chrome: candado de la barra de dirección → Permisos → Cámara → Permitir. Si ya se lo negaste, borra los datos del navegador o ve a Ajustes › Aplicaciones › Chrome › Permisos › Cámara.'
          : (err && err.message ? err.message : 'desconocido')) + '</span>');
    });
  }
  var btnProbar = document.getElementById('btnProbarCamara');
  if (btnProbar) btnProbar.addEventListener('click', probarCamara);

  var controles = null;
  // OJO: en ZXing 0.23 la funcion decodeFromVideoDevice(deviceId, video,
  // callback) recibe SOLO tres argumentos y devuelve una promesa. El manejador
  // de error va en .catch(): pasarlo como cuarto argumento se ignoraba y el
  // fallo quedaba mudo, con el recuadro en negro sin explicar nada.
  function reiniciar(){
    try {
      if (controles) {
        if (typeof controles.stopContinuousDecode === 'function') controles.stopContinuousDecode();
        if (typeof controles.then === 'function') controles.then(null, function(){});
      }
    } catch (e) {}
    controles = null;
    try {
      controles = ZX.BrowserMultiFormatReader.decodeFromVideoDevice(undefined, 'camara', alLeer);
      if (controles && typeof controles.catch === 'function') controles.catch(alError);
    } catch (e) { alError(e); }
  }
  function mostrarAviso(titulo, texto, extra, conReintento){
    document.getElementById('avisoTitulo').textContent = titulo;
    document.getElementById('avisoTexto').innerHTML = texto;
    document.getElementById('avisoExtra').innerHTML = extra || '';
    document.getElementById('aviso').style.display = 'block';
    document.getElementById('marco').style.display = 'none';
    // El botón de reintentar solo tiene sentido cuando el certificado ya
    // está instalado y lo que falta es que el navegador lo acepte. Cuando el
    // problema es otro, esconderlo evita el bucle de "descargar y recargar".
    document.getElementById('avisoReintentar').style.display = conReintento ? 'block' : 'none';
    avisar(titulo, 'mal');
  }
  // Tras instalar el certificado, Chrome guarda el error de TLS y la página
  // sigue igual aunque ya confíe. Recargar con un parámetro distinto obliga a
  // volver a comprobarlo en vez de mostrar la respuesta cacheada.
  document.getElementById('avisoReintentar').addEventListener('click', function(){
    avisar('Recargando…', 'info');
    var base = location.pathname + location.search.replace(/&?r=\d+/, '');
    location.replace(base + '&r=' + Date.now());
  });
  function alLeer(resultado){
    if (!resultado) return;
    document.body.classList.add('con-camara');
    var texto = String(resultado.getText() || '').trim();
    if (!texto) return;
    TOTAL++;
    contador.textContent = TOTAL + (TOTAL === 1 ? ' código leído' : ' códigos leídos');
    ultimoPendiente = texto;
    avisar('Enviando ' + texto + '…', 'ok');
    // El token va en la URL: sin él la caja responde 403 y el código se pierde.
    fetch('/api/codigo?token=' + encodeURIComponent(TOKEN), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ codigo: texto })
    }).then(function(r){
      // Antes se ignoraba la respuesta y se reiniciaba igual: si la caja
      // rechazaba el código, el teléfono seguía como si todo fuera bien y el
      // cajero no se enteraba de que el producto no entró al carrito.
      return r.json().catch(function(){ return {}; }).then(function(d){
        if (!r.ok) throw new Error(d.motivo || ('la caja respondió ' + r.status));
        return d;
      });
    }).then(function(){
      avisar('Código recibido: ' + texto, 'ok');
      setTimeout(reiniciar, 250);
    }).catch(function(e){
      avisar('No se pudo enviar: ' + (e && e.message ? e.message : 'sin conexión con el PC'), 'mal');
      // No se reinicia la lectura a ciegas: si falló el envío, el código se
      // habría perdido. Se reintenta en su lugar para no duplicar en la caja.
      setTimeout(reintentarEnvio, 1200);
    });
  }
  var ultimoPendiente = null;
  function reintentarEnvio(){
    if (!ultimoPendiente) return;
    avisar('Reintentando ' + ultimoPendiente + '…', 'info');
    var texto = ultimoPendiente;
    ultimoPendiente = null;
    alLeer({ getText: function(){ return texto; } });
  }
  function alError(err){
    var nombre = err && err.name;
    pintarDiag('<span class="mal">Error ' + (nombre || 'desconocido') + ': ' +
      (err && err.message ? err.message : 'la cámara no arrancó') + '</span>');
    if (nombre === 'NotAllowedError' || nombre === 'SecurityError') {
      mostrarAviso('Permiso de cámara denegado',
        'El navegador no dejó usar la cámara. Ábrela desde el candado o los ajustes del sitio y recarga la página.',
        '', false);
    } else if (nombre === 'NotFoundError') {
      mostrarAviso('No hay cámara en este teléfono',
        'Este dispositivo no tiene cámara disponible para la página. Usa el lector USB en la caja.', '', false);
    } else {
      mostrarAviso('No se pudo abrir la cámara',
        'Ocurrió un error al iniciar la cámara. Prueba con Chrome o Safari actualizados.', '', false);
    }
  }
  // El navegador solo entrega la cámara en un CONTEXTO SEGURO. Con el
  // certificado autofirmado el móvil deja continuar y la cámara sí arranca,
  // así que no se bloquea el intento por el valor de isSecureContext: se
  // intenta y, si falla de verdad, se explica por qué.
  //
  // Antes aquí se asumía siempre "se abrió por HTTP" y se pedía pulsar otra
  // vez el botón, aunque la página ya viniera por HTTPS: ese era el motivo de
  // que el cajero diera vueltas sin entender nada. Ahora se distingue el caso
  // real: sin HTTPS la caja debe reiniciarla, y con HTTPS lo que falta es que
  // el navegador confíe en el certificado.
  var hayCamara = !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
  pintarDiag();
  if (!hayCamara) {
    if (window.isSecureContext) {
      // HTTPS correcto y la cámara sigue sin aparecer: el navegador no confía
      // en el certificado. En iPhone/iPad, instalar NO basta: hay que activar
      // la confianza completa, y sin eso el aviso se repite para siempre.
      mostrarAviso('El navegador no confía en el certificado',
        'La página ya va por <b>HTTPS</b>, pero este navegador todav&iacute;a no considera segura la ' +
        'conexi&oacute;n, y por eso no entrega la c&aacute;mara.<br>' +
        '<b>iPhone y iPad:</b> tras instalar el certificado ve a ' +
        '<em>Ajustes &rsaquo; General &rsaquo; Informaci&oacute;n &rsaquo; Ajustes de confianza de certificados</em> ' +
        'y <b>activa el interruptor</b> junto a <em>SmartPosPro escaner</em>. Sin ese paso no funciona.<br>' +
        '<b>Android:</b> Ajustes &rsaquo; Seguridad &rsaquo; Cifrado y credenciales &rsaquo; ' +
        'Instalar un certificado &rsaquo; Certificado de CA, y elige el archivo <code>smartpospro-ca.crt</code>.',
        'Despu&eacute;s de instalarlo, cierra el navegador del todo y vuelve a abrir el QR.<br>' +
        '&iquest;Ya lo hiciste? Pulsa <b>Ya instal&eacute; el certificado</b> de abajo para recargar limpio.',
        true);
    } else {
      mostrarAviso('La cámara necesita una conexión segura',
        'Esta página se abrió por <b>HTTP</b> y el navegador no permite la cámara ah&iacute;. ' +
        'En la caja pulsa otra vez <b>Escanear con el tel&eacute;fono</b> para abrirla por HTTPS.',
        'Si no es posible, sigue usando el lector USB: funciona sin cámara.', false);
    }
  } else {
    avisar('Apunta al código de barras', 'info');
    try {
      reiniciar();
      // Encuadra el recuadro en cuanto la cámara entrega su primer fotograma;
      // antes de eso se vería un recuadro negro.
      var video = document.getElementById('camara');
      if (video && video.readyState < 2) {
        video.addEventListener('loadeddata', function(){
          document.body.classList.add('con-camara');
        }, { once: true });
      }
    } catch (e) { alError(e); }
  }
})();
</script>
</body>
</html>`.replace("__SMARTPOS_TOKEN__", token);
}

/**
 * Página que se sirve cuando el enlace ya no vale (la caja se reinició o se
 * abrió otro escáner). Antes se servía la página normal y el teléfono leía
 * códigos que la caja rechazaba en silencio.
 */
function htmlTokenInvalido(): string {
  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>SmartPosPro · Enlace caducado</title>
<style>
  body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;
       background:#0b1220;color:#e8eef8;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;padding:24px}
  div{max-width:340px;text-align:center}
  .icono{font-size:40px;line-height:1}
  h1{margin:14px 0 10px;font-size:19px}
  p{margin:0 0 8px;font-size:14px;line-height:1.6;color:#9fb0c9}
  strong{color:#e8eef8}
</style>
</head>
<body>
  <div>
    <div class="icono">&#128274;</div>
    <h1>Este enlace ya no sirve</h1>
    <p>La caja se reinició o se abrió otro escáner, y por eso esta sesión ya no es válida.</p>
    <p><strong>Cierra esta página</strong>, vuelve a la caja y pulsa otra vez
       <strong>Escanear con el teléfono</strong> para generar un QR nuevo.</p>
  </div>
</body>
</html>`;
}

function responder(res: ServerResponse, codigo: number, tipo: string, cuerpo: string): void {
  res.writeHead(codigo, {
    "Content-Type": tipo,
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff"
  });
  res.end(cuerpo);
}

async function manejar(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
  const ruta = url.pathname;

  if (ruta === "/" || ruta === "/escanear") {
    // El enlace lleva el token. Si no coincide, la sesión ya caducó (la caja
    // se reinició o se abrió otro escáner): se avisa en vez de servir una
    // página que leería códigos sin poder enviarlos nunca.
    if (url.searchParams.get("token") !== tokenActual) {
      responder(res, 200, "text/html; charset=utf-8", htmlTokenInvalido());
      return;
    }
    responder(res, 200, "text/html; charset=utf-8", htmlEscaner(tokenActual));
    return;
  }

  if (ruta === RUTA_CERTIFICADO) {
    try {
      const cert = await readFile(path.join(os.homedir(), ".smartpospro", "escaner-cert.pem"), "utf8");
      res.writeHead(200, {
        "Content-Type": "application/x-x509-ca-cert",
        "Content-Disposition": 'attachment; filename="smartpospro-ca.crt"',
        "Cache-Control": "no-store"
      });
      res.end(cert);
    } catch {
      responder(res, 404, "text/plain; charset=utf-8", "No se encontro el certificado.");
    }
    return;
  }

  if (ruta === "/api/codigo" && req.method === "POST") {
    if (url.searchParams.get("token") !== tokenActual) {
      responder(res, 403, "application/json; charset=utf-8", JSON.stringify({ ok: false, motivo: "token invalido" }));
      return;
    }
    let cuerpo = "";
    for await (const trozo of req) {
      cuerpo += trozo;
      // Un código de barras no llega a 4 KB: corta de golpe lo que sobra.
      if (cuerpo.length > 4096) break;
    }
    let codigo = "";
    try {
      codigo = String(JSON.parse(cuerpo || "{}").codigo ?? "").trim();
    } catch {
      codigo = "";
    }
    if (!codigo) {
      responder(res, 400, "application/json; charset=utf-8", JSON.stringify({ ok: false, motivo: "codigo vacio" }));
      return;
    }
    alRecibirCodigo?.(codigo);
    responder(res, 200, "application/json; charset=utf-8", JSON.stringify({ ok: true, codigo }));
    return;
  }

  const archivo = ARCHIVOS[ruta];
  if (archivo) {
    try {
      responder(res, 200, archivo.tipo, await readFile(archivo.ruta, "utf8"));
    } catch {
      responder(res, 404, "text/plain; charset=utf-8", "No se encontro la libreria de lectura.");
    }
    return;
  }

  responder(res, 404, "text/plain; charset=utf-8", "No encontrado.");
}

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
export async function iniciarEscanerTelefono(
  alRecibir: (codigo: string) => void
): Promise<EstadoEscanerTelefono> {
  if (servidor) {
    alRecibirCodigo = alRecibir;
    return await estadoEscanerTelefono();
  }

  tokenActual = randomBytes(9).toString("hex");
  alRecibirCodigo = alRecibir;
  avisoCertCambiado = false;

  try {
    const ip = ipLocal();
    const certificado = await obtenerCertificado(ip);
    const manejador = (req: IncomingMessage, res: ServerResponse) => {
      manejar(req, res).catch(() => {
        try {
          responder(res, 500, "text/plain; charset=utf-8", "Error interno.");
        } catch {
          /* la conexion ya se cerro */
        }
      });
    };

    // Con certificado la página va por HTTPS, condición sine qua non para que el
    // teléfono conceda la cámara. Sin certificado se cae a HTTP y la página
    // avisa de que la cámara no podrá funcionar.
    if (certificado) {
      usandoHttps = true;
      servidor = createServerHttps(
        { key: certificado.clave, cert: certificado.certificado },
        manejador
      ) as Server;
    } else {
      usandoHttps = false;
      servidor = createServerHttp(manejador);
    }

    await new Promise<void>((resolve, reject) => {
      servidor!.once("error", reject);
      // Se escucha en todas las interfaces para que el teléfono de la LAN
      // llegue; lo que protege el acceso es el token, no el puerto.
      servidor!.listen(PUERTO_POR_DEFECTO, "0.0.0.0", () => resolve());
    });

    return await estadoEscanerTelefono();
  } catch (error) {
    servidor = null;
    tokenActual = "";
    const mensaje = error instanceof Error ? error.message : String(error);
    return {
      activo: false,
      url: null,
      qr: null,
      ip: null,
      seguro: false,
      error: mensaje.includes("EADDRINUSE")
        ? `El puerto ${PUERTO_POR_DEFECTO} ya está ocupado. Cierra el programa que lo usa e inténtalo otra vez.`
        : `No se pudo iniciar el escáner: ${mensaje}`
    };
  }
}

export async function estadoEscanerTelefono(): Promise<EstadoEscanerTelefono> {
  if (!servidor) return { activo: false, url: null, qr: null, ip: null, seguro: false };
  const ip = ipLocal();
  const protocolo = usandoHttps ? "https" : "http";
  const url = `${protocolo}://${ip}:${PUERTO_POR_DEFECTO}/escanear?token=${tokenActual}`;
  try {
    const qr = await QRCode.toString(url, { type: "svg", margin: 1, width: 260 });
    return { activo: true, url, qr, ip, seguro: usandoHttps, certCambiado: avisoCertCambiado };
  } catch {
    // Sin QR la caja sigue funcionando: se muestra la dirección para teclearla.
    return { activo: true, url, qr: null, ip, seguro: usandoHttps, certCambiado: avisoCertCambiado };
  }
}

export function detenerEscanerTelefono(): void {
  if (servidor) {
    servidor.close();
    servidor = null;
  }
  tokenActual = "";
  alRecibirCodigo = null;
}
