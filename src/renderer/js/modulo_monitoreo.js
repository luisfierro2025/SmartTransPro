// ============================================================================
// Monitoreo en vivo de la flota con el GPS de los teléfonos de los conductores.
//
// La oficina vincula un teléfono a cada conductor (enlace + QR). El teléfono abre
// rastreo.html y envía su posición; aquí se ve en un mapa y en una lista.
// El mapa usa Leaflet + OpenStreetMap (gratis). Si no hay internet para cargarlo,
// la lista sigue funcionando y cada fila ofrece "Ver en Google Maps".
// ============================================================================
const CDN_LEAFLET = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min';
const CDN_QR = 'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js';
const ESTADOS_MON = { EN_LINEA: ['En línea', '#12b76a'], DEMORADO: ['Demorado', '#f79009'], SIN_SENAL: ['Sin señal', '#f04438'], SIN_VINCULAR: ['Sin vincular', '#98a2b3'] };
const REFRESCO_MON_MS = 15000;

function cargarScriptExterno(src) {
  return new Promise((resolve) => {
    const s = document.createElement('script'); s.src = src; s.async = true;
    const t = setTimeout(() => resolve(false), 8000);
    s.onload = () => { clearTimeout(t); resolve(true); }; s.onerror = () => { clearTimeout(t); resolve(false); };
    document.head.appendChild(s);
  });
}

let promesaLeaflet = null;
function cargarLeaflet() {
  if (window.L) return Promise.resolve(window.L);
  if (!promesaLeaflet) {
    promesaLeaflet = (async () => {
      if (!document.getElementById('leafletCss')) { const l = document.createElement('link'); l.id = 'leafletCss'; l.rel = 'stylesheet'; l.href = CDN_LEAFLET + '.css'; document.head.appendChild(l); }
      const ok = await cargarScriptExterno(CDN_LEAFLET + '.js');
      if (!ok || !window.L) promesaLeaflet = null; // permite reintentar cuando vuelva el internet
      return ok ? window.L : null;
    })();
  }
  return promesaLeaflet;
}

function haceTiempo(iso) {
  const t = iso ? new Date(iso).getTime() : NaN;
  if (!Number.isFinite(t)) return 'Sin datos';
  const s = Math.max(0, Math.round((Date.now() - t) / 1000));
  if (s < 60) return 'hace ' + s + ' s';
  if (s < 3600) return 'hace ' + Math.round(s / 60) + ' min';
  if (s < 86400) return 'hace ' + Math.round(s / 3600) + ' h';
  return 'hace ' + Math.round(s / 86400) + ' d';
}

function iniciarMonitoreo(raiz) {
  const u = typeof usuarioActual === 'function' ? usuarioActual() : null;
  const puedeEditar = !u || u.rol !== 'CONSULTA';
  const token = () => (typeof tokenActual === 'function' ? tokenActual() : null);
  let datos = null, mapa = null, capaPuntos = null, capaRuta = null, marcadores = {}, primeraVez = true, activo = false, temporizador = null, cargando = false;

  raiz.innerHTML = `
    ${window.modoNube ? '' : '<div class="panel mon-aviso">Estás usando la <b>versión de escritorio</b>: los teléfonos de los conductores no pueden conectarse a este equipo. Para el monitoreo usa la versión web publicada en internet (con HTTPS).</div>'}
    <div class="metrics-grid" style="margin-bottom:16px;">
      <div class="card"><div class="card-label">Teléfonos vinculados</div><div id="monVinculados" class="card-value">0</div></div>
      <div class="card"><div class="card-label">En línea</div><div id="monEnLinea" class="card-value positive">0</div></div>
      <div class="card"><div class="card-label">Demorados</div><div id="monDemorados" class="card-value" style="color:#f79009">0</div></div>
      <div class="card"><div class="card-label">Sin señal</div><div id="monSinSenal" class="card-value" style="color:var(--danger)">0</div></div>
    </div>
    <div class="panel" style="margin-top:0;margin-bottom:18px;">
      <div class="mon-cabecera"><h3 style="margin:0;font-size:16px;">📍 Mapa en vivo</h3>
        <div class="mon-botones"><button class="btn" id="monComo">¿Cómo funciona?</button><button class="btn" id="monCentrar">Centrar</button><button class="btn" id="monLimpiarRuta" hidden>Quitar ruta</button><button class="btn primary" id="monActualizar">Actualizar</button></div></div>
      <div id="monMapa" class="mon-mapa"><div class="empty" id="monMapaMsg">Cargando mapa…</div></div>
      <div class="mon-pie" id="monPie">Se actualiza solo cada 15 segundos.</div>
    </div>
    <div class="panel" style="margin-top:0;"><div id="monLista" class="table-wrap"><div class="empty">Cargando conductores…</div></div></div>`;

  const $ = (id) => raiz.querySelector('#' + id);

  // ------------------------------------------------------------- mapa
  let falloMapaEn = 0;
  async function asegurarMapa() {
    if (mapa) return mapa;
    if (Date.now() - falloMapaEn < 60000) return null; // sin internet: no reintentar en cada refresco
    const L = await cargarLeaflet();
    const cont = $('monMapa');
    if (!L) { falloMapaEn = Date.now(); cont.innerHTML = '<div class="empty">No se pudo cargar el mapa (¿sin internet?). La lista de abajo sigue funcionando y cada fila tiene el enlace “Ver en Google Maps”.</div>'; return null; }
    cont.innerHTML = '';
    mapa = L.map(cont, { zoomControl: true }).setView([12.87, -85.2], 7);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(mapa);
    capaPuntos = L.layerGroup().addTo(mapa); capaRuta = L.layerGroup().addTo(mapa);
    return mapa;
  }

  function textoPopup(c) {
    return `<b>${textoSeguro(c.nombre)}</b>${c.placa ? '<br>Unidad ' + textoSeguro(c.placa) : ''}<br>${textoSeguro(ESTADOS_MON[c.estado][0])} · ${textoSeguro(haceTiempo(c.ultimo_reporte))}` +
      `${c.velocidad_kmh !== null ? '<br>' + Math.round(c.velocidad_kmh) + ' km/h' : ''}${c.destino ? '<br>Destino: ' + textoSeguro(c.destino) : ''}`;
  }

  function pintarMapa(conductores) {
    if (!mapa || !window.L) return;
    const L = window.L, vistos = new Set(), puntos = [];
    for (const c of conductores) {
      if (c.lat === null || c.lng === null || !c.vinculado) continue;
      vistos.add(c.conductor_id); puntos.push([c.lat, c.lng]);
      const estilo = { radius: 10, color: '#fff', weight: 2, fillColor: ESTADOS_MON[c.estado][1], fillOpacity: 1 };
      let m = marcadores[c.conductor_id];
      if (!m) { m = L.circleMarker([c.lat, c.lng], estilo).addTo(capaPuntos); m.bindTooltip(c.nombre, { permanent: true, direction: 'top', offset: [0, -8], className: 'mon-etiqueta' }); marcadores[c.conductor_id] = m; }
      else { m.setLatLng([c.lat, c.lng]); m.setStyle(estilo); }
      m.bindPopup(textoPopup(c));
    }
    for (const id of Object.keys(marcadores)) if (!vistos.has(Number(id))) { capaPuntos.removeLayer(marcadores[id]); delete marcadores[id]; }
    if (primeraVez && puntos.length) { mapa.fitBounds(puntos, { padding: [50, 50], maxZoom: 15 }); primeraVez = false; }
  }

  // ------------------------------------------------------------- datos
  function pintarResumen(r) {
    $('monVinculados').textContent = r.vinculados; $('monEnLinea').textContent = r.en_linea;
    $('monDemorados').textContent = r.demorados; $('monSinSenal').textContent = r.sin_senal;
  }

  function pintarLista(conductores) {
    if (!conductores.length) { $('monLista').innerHTML = '<div class="empty">No hay conductores activos. Registra un conductor en la pestaña “Conductores / Choferes”.</div>'; return; }
    $('monLista').innerHTML = `<table><thead><tr><th>Conductor</th><th>Unidad</th><th>Estado</th><th>Última señal</th><th>Velocidad</th><th>Batería</th><th>Viaje en curso</th><th>Acciones</th></tr></thead><tbody>` +
      conductores.map((c) => {
        const [etq, col] = ESTADOS_MON[c.estado];
        const gm = c.lat !== null ? `<a href="https://www.google.com/maps?q=${c.lat},${c.lng}" target="_blank" rel="noopener">Ver en Google Maps</a>` : '';
        const acc = [
          c.lat !== null ? `<button class="btn" data-acc="ver" data-id="${c.conductor_id}">Ubicar</button><button class="btn" data-acc="ruta" data-id="${c.conductor_id}">Ruta</button>` : '',
          puedeEditar ? `<button class="btn ${c.vinculado ? '' : 'primary'}" data-acc="enlace" data-id="${c.conductor_id}">${c.vinculado ? 'Nuevo enlace' : 'Vincular teléfono'}</button>` : '',
          puedeEditar && c.vinculado ? `<button class="btn btn-danger" data-acc="quitar" data-id="${c.conductor_id}">Desvincular</button>` : ''
        ].join('');
        return `<tr><td><b>${textoSeguro(c.nombre)}</b></td><td>${textoSeguro(c.placa || '—')}</td>
          <td><span class="mon-badge" style="background:${col}1f;color:${col}">● ${etq}</span></td>
          <td>${c.vinculado ? textoSeguro(haceTiempo(c.ultimo_reporte)) : '—'}${gm ? '<br><small>' + gm + '</small>' : ''}</td>
          <td>${c.velocidad_kmh !== null && c.estado !== 'SIN_SENAL' ? Math.round(c.velocidad_kmh) + ' km/h' : '—'}</td>
          <td>${c.bateria !== null ? Math.round(c.bateria) + ' %' : '—'}</td>
          <td>${textoSeguro(c.destino || '—')}</td><td class="mon-acciones">${acc}</td></tr>`;
      }).join('') + '</tbody></table>';
  }

  async function refrescar(manual = false) {
    if (cargando) return; cargando = true;
    try {
      datos = await window.api.monitoreo.listar({ token: token() });
      pintarResumen(datos.resumen); pintarLista(datos.conductores);
      await asegurarMapa(); pintarMapa(datos.conductores);
      $('monPie').textContent = 'Última actualización: ' + new Date().toLocaleTimeString() + '. Se actualiza solo cada 15 segundos.';
    } catch (err) {
      $('monPie').innerHTML = '⚠ No se pudo actualizar: ' + textoSeguro(err.message);
      if (manual) avisarError('No se pudo actualizar el monitoreo', err.message);
    } finally { cargando = false; }
  }

  // ------------------------------------------------------------- acciones
  const buscar = (id) => datos && datos.conductores.find((c) => c.conductor_id === Number(id));

  async function verRuta(c) {
    try {
      const r = await window.api.monitoreo.historial({ token: token(), conductor_id: c.conductor_id, horas: 12 });
      if (!r.puntos.length) return avisar({ estado: 'info', titulo: 'Sin recorrido', mensaje: `No hay posiciones registradas de ${textoSeguro(c.nombre)} en las últimas ${r.horas} horas.` });
      if (!(await asegurarMapa())) return;
      capaRuta.clearLayers();
      const linea = window.L.polyline(r.puntos.map((p) => [p.lat, p.lng]), { color: '#2563eb', weight: 4, opacity: .85 }).addTo(capaRuta);
      window.L.circleMarker([r.puntos[0].lat, r.puntos[0].lng], { radius: 6, color: '#fff', weight: 2, fillColor: '#12b76a', fillOpacity: 1 }).bindTooltip('Inicio').addTo(capaRuta);
      mapa.fitBounds(linea.getBounds(), { padding: [50, 50], maxZoom: 16 }); $('monLimpiarRuta').hidden = false;
      $('monMapa').scrollIntoView({ behavior: 'smooth', block: 'center' });
    } catch (err) { avisarError('No se pudo cargar la ruta', err.message); }
  }

  async function ubicar(c) {
    if (!(await asegurarMapa())) return;
    mapa.setView([c.lat, c.lng], 16);
    if (marcadores[c.conductor_id]) marcadores[c.conductor_id].openPopup();
    $('monMapa').scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  async function vincular(c) {
    if (c.vinculado && !(await confirmarAccion({ estado: 'advertencia', titulo: '¿Generar un enlace nuevo?', mensaje: `El teléfono actual de <b>${textoSeguro(c.nombre)}</b> dejará de enviar su ubicación y deberá abrir el enlace nuevo.`, botonOk: 'Generar enlace nuevo', okPeligroso: true }))) return;
    try {
      const r = await window.api.monitoreo.vincular({ token: token(), conductor_id: c.conductor_id });
      await refrescar(); fichaEnlace(c.nombre, r.clave);
    } catch (err) { avisarError('No se pudo vincular el teléfono', err.message); }
  }

  async function desvincular(c) {
    if (!(await confirmarAccion({ estado: 'error', titulo: '¿Desvincular este teléfono?', mensaje: `<b>${textoSeguro(c.nombre)}</b> dejará de aparecer en el mapa y su teléfono no podrá enviar más ubicaciones.`, botonOk: 'Desvincular', okPeligroso: true }))) return;
    try { await window.api.monitoreo.desvincular({ token: token(), conductor_id: c.conductor_id }); await refrescar(); } catch (err) { avisarError('No se pudo desvincular', err.message); }
  }

  // Ficha con el enlace, el QR y el atajo a WhatsApp. La clave solo se ve en este momento.
  function fichaEnlace(nombre, clave) {
    const previo = document.getElementById('fichaVinculo'); if (previo) previo.remove();
    let base = '';
    try { base = localStorage.getItem('srvRastreo') || ''; } catch (e) { /* sin almacenamiento */ }
    if (!base && /^https?:$/.test(location.protocol)) base = location.origin;
    const velo = document.createElement('div'); velo.id = 'fichaVinculo'; velo.className = 'ficha-impresion ficha-exito';
    velo.innerHTML = `<div class="ficha-box"><div class="ficha-cabecera"><div class="ficha-icono">${ICONOS_FICHA.exito}</div>
      <div class="ficha-titulos"><h3 class="ficha-titulo">Teléfono listo para vincular</h3><p class="ficha-subtitulo">Envía este enlace a <b>${textoSeguro(nombre)}</b> y pídele que lo abra en su teléfono.</p></div><button type="button" class="ficha-cerrar" aria-label="Cerrar">&times;</button></div>
      <div class="ficha-cuerpo">
        <label class="mon-etiq">Dirección del sistema en internet<input id="vinBase" type="url" placeholder="https://tu-sistema.vercel.app" value="${textoSeguro(base)}"></label>
        <div id="vinAviso" class="mon-nota" hidden></div>
        <label class="mon-etiq">Enlace para el teléfono<input id="vinEnlace" type="text" readonly></label>
        <div class="mon-vin-acciones"><button class="btn primary" id="vinCopiar">Copiar enlace</button><a class="btn" id="vinWhats" target="_blank" rel="noopener">Enviar por WhatsApp</a></div>
        <div id="vinQr" class="mon-qr"></div>
        <details class="mon-nota"><summary>Alternativa: app gratuita Traccar Client</summary>Servidor: <code id="vinTraccar"></code><br>Identificador del dispositivo: <code>${textoSeguro(clave)}</code></details>
        <p class="mon-nota">⚠ Este enlace se muestra <b>solo ahora</b>. Si se pierde, genera uno nuevo con “Nuevo enlace”.</p>
      </div><div class="ficha-pie"><button type="button" class="btn primary" id="vinCerrar">Listo</button></div></div>`;
    document.body.appendChild(velo);
    const cerrar = () => { document.removeEventListener('keydown', tecla); velo.remove(); };
    const tecla = (e) => { if (e.key === 'Escape') cerrar(); };
    document.addEventListener('keydown', tecla);
    velo.querySelector('.ficha-cerrar').onclick = cerrar; velo.querySelector('#vinCerrar').onclick = cerrar;
    velo.addEventListener('click', (e) => { if (e.target === velo) cerrar(); });
    const q = (id) => velo.querySelector('#' + id);
    let qr = null;
    async function actualizar() {
      const b = q('vinBase').value.trim().replace(/\/+$/, ''), enlace = b ? `${b}/rastreo.html#t=${clave}` : '';
      q('vinEnlace').value = enlace || 'Escribe primero la dirección del sistema'; q('vinTraccar').textContent = b ? b + '/api/monitoreo/osmand' : '—';
      q('vinWhats').href = enlace ? 'https://wa.me/?text=' + encodeURIComponent('Abre este enlace en tu teléfono para compartir tu ubicación durante el viaje: ' + enlace) : '#';
      const local = /^(https?:\/\/)?(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/i.test(b), sinHttps = b && !/^https:\/\//i.test(b);
      const av = q('vinAviso'); av.hidden = !(local || sinHttps);
      av.textContent = local ? '⚠ Esa dirección solo funciona dentro de tu red. Para rastrear en carretera, el sistema debe estar publicado en internet.' : sinHttps ? '⚠ Sin HTTPS el teléfono no permite compartir la ubicación. Usa una dirección que empiece con https://' : '';
      try { if (b) localStorage.setItem('srvRastreo', b); } catch (e) { /* sin almacenamiento */ }
      q('vinQr').innerHTML = '';
      if (!enlace) return;
      if (!window.QRCode) await cargarScriptExterno(CDN_QR);
      if (window.QRCode && document.body.contains(velo)) { try { qr = new window.QRCode(q('vinQr'), { text: enlace, width: 168, height: 168 }); } catch (e) { qr = null; } }
    }
    q('vinBase').addEventListener('input', actualizar);
    q('vinCopiar').onclick = async () => {
      const t = q('vinEnlace').value; if (!/^https?:/i.test(t)) return;
      try { await navigator.clipboard.writeText(t); q('vinCopiar').textContent = '¡Copiado!'; } catch (e) { q('vinEnlace').select(); q('vinCopiar').textContent = 'Selecciona y copia (Ctrl+C)'; }
      setTimeout(() => { if (q('vinCopiar')) q('vinCopiar').textContent = 'Copiar enlace'; }, 2200);
    };
    actualizar();
  }

  function fichaComoFunciona() {
    mostrarFichaImpresion({ estado: 'exito', titulo: 'Cómo funciona el monitoreo', subtitulo: 'Usa el GPS del teléfono del conductor: no necesitas comprar equipos.', boton: 'Entendido', pasos: [
      '<b>Vincula el teléfono</b>Toca “Vincular teléfono” en la fila del conductor y envíale el enlace (WhatsApp, QR o copiado).',
      '<b>El conductor abre el enlace</b>Permite la ubicación y toca “Iniciar viaje”. No instala nada; puede agregarlo a su pantalla de inicio.',
      '<b>Míralo aquí</b>Su punto aparece en el mapa y se actualiza cada 15 s. “Ruta” muestra el recorrido de las últimas 12 horas.',
      '<b>Límites del teléfono</b>El navegador solo envía con la pantalla encendida y la página abierta. Sin señal guarda los puntos y los envía al volver la cobertura.'] });
  }

  // ------------------------------------------------------------- eventos
  raiz.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-acc]'); if (!b) return;
    const c = buscar(b.dataset.id); if (!c) return;
    ({ ver: ubicar, ruta: verRuta, enlace: vincular, quitar: desvincular })[b.dataset.acc](c);
  });
  $('monComo').onclick = fichaComoFunciona;
  $('monActualizar').onclick = () => refrescar(true);
  $('monCentrar').onclick = () => { primeraVez = true; if (datos) pintarMapa(datos.conductores); };
  $('monLimpiarRuta').onclick = () => { if (capaRuta) capaRuta.clearLayers(); $('monLimpiarRuta').hidden = true; };

  // Refresco automático: solo mientras la pestaña está visible; se detiene al salir del módulo.
  function tic() {
    if (!document.body.contains(raiz)) { clearInterval(temporizador); temporizador = null; return; }
    if (activo && !document.hidden) refrescar();
  }

  return {
    activar() {
      activo = true; if (!temporizador) temporizador = setInterval(tic, REFRESCO_MON_MS);
      refrescar().then(() => { if (mapa) mapa.invalidateSize(); });
    },
    desactivar() { activo = false; }
  };
}
