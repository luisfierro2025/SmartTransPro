// Utilidades compartidas por todos los módulos de la interfaz.
// No dependen de ningún módulo en particular: se cargan primero para que
// cualquier render() (Bitácora, Flota, Clientes, Planilla, Ingresos, Egresos...)
// pueda usarlas sin duplicar código.

// Retrasa la ejecución de fn hasta que dejan de llegar llamadas durante "espera" ms.
// Así la búsqueda "mientras se escribe" no dispara una consulta por cada tecla.
function debounce(fn, espera = 400) {
  let temporizador;
  return function (...args) {
    clearTimeout(temporizador);
    temporizador = setTimeout(() => fn.apply(this, args), espera);
  };
}

// Recorre el contenido recién dibujado y, en cada barra de herramientas que
// tenga un botón "Buscar/Filtrar", activa dos cosas automáticamente:
//   1) Búsqueda inteligente: el campo de texto dispara la búsqueda solo con
//      escribir (con una pequeña pausa), sin necesidad de pulsar el botón.
//   2) Un botón "Imprimir" junto a "Limpiar" que imprime justo lo que está
//      filtrado y visible en ese momento en la tabla de esa barra.
function activarBusquedaInteligenteYImpresion(raiz) {
  const contenedor = raiz || document.getElementById('content');
  if (!contenedor) return;

  contenedor.querySelectorAll('.toolbar').forEach(barra => {
    const botonBuscar = barra.querySelector('button[id^="btnFiltrar"], button[id^="btnBuscar"]');
    if (!botonBuscar) return;

    // 1) Filtrado en vivo mientras se escribe.
    const campoTexto = barra.querySelector(
      'input[type="text"]:not([data-live-armado]), input[type="search"]:not([data-live-armado])'
    );
    if (campoTexto) {
      campoTexto.setAttribute('data-live-armado', '1');
      const dispararBusqueda = debounce(() => botonBuscar.click(), 400);
      campoTexto.addEventListener('input', dispararBusqueda);
    }

    // 2) Botón de impresión de lo filtrado, si esta barra aún no tiene uno.
    if (barra.querySelector('.btn-imprimir-auto')) return;
    const panelPadre = barra.closest('.panel') || barra.parentElement;
    const tabla = panelPadre ? panelPadre.querySelector('.table-wrap') : null;
    if (!tabla) return;

    const botonLimpiar = barra.querySelector('button[id^="btnLimpiar"]');
    const botonImprimir = document.createElement('button');
    botonImprimir.type = 'button';
    botonImprimir.className = 'btn btn-imprimir-auto';
    botonImprimir.innerHTML = '🖨️ Imprimir';
    botonImprimir.title = 'Imprimir lo filtrado en esta búsqueda';
    botonImprimir.onclick = () => {
      const tituloPanel = (panelPadre && panelPadre.querySelector('h2,h3'))
        ? panelPadre.querySelector('h2,h3').textContent.trim()
        : (document.getElementById('page-title') ? document.getElementById('page-title').textContent : 'Reporte');
      imprimirContenido({
        titulo: tituloPanel,
        filtrosTexto: resumenDeFiltros(barra),
        cuerpoHtml: tabla.innerHTML
      });
    };
    (botonLimpiar || botonBuscar).insertAdjacentElement('afterend', botonImprimir);
  });
}

// Construye una línea legible con los filtros activos de una barra de
// herramientas ("Buscar: Camisa | Desde: 2026-01-01 | Estado: Pendiente...").
function resumenDeFiltros(barra) {
  const partes = [];
  barra.querySelectorAll('.field').forEach(campo => {
    const etiqueta = campo.querySelector('label');
    const control = campo.querySelector('input,select');
    if (!etiqueta || !control) return;
    let valor = control.value;
    if (control.tagName === 'SELECT') {
      const opcion = control.options[control.selectedIndex];
      valor = opcion ? opcion.textContent.trim() : '';
    }
    if (!valor) return;
    const texto = String(valor).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const etiquetaTexto = etiqueta.textContent.trim().replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    partes.push(`<strong>${etiquetaTexto}:</strong> ${texto}`);
  });
  return partes.join(' &nbsp;·&nbsp; ');
}

// Abre una ventana de impresión con el encabezado de la empresa, los filtros
// aplicados y el contenido (tabla) tal como está en pantalla en ese momento.
function imprimirContenido({ titulo, filtrosTexto, resumenHtml, cuerpoHtml }) {
  const nombreEmpresa = (document.getElementById('empresaDestacada') && document.getElementById('empresaDestacada').textContent.trim())
    || 'SmartTransPro';
  const fecha = new Intl.DateTimeFormat('es-NI', { dateStyle: 'long', timeStyle: 'short' }).format(new Date());
  const ventana = window.open('', '_blank', 'width=1024,height=720');
  if (!ventana) {
    mostrarFichaImpresion({
      estado: 'advertencia',
      titulo: 'Permite las ventanas emergentes',
      subtitulo: 'Tu navegador bloqueó la ventana de impresión, así que el reporte no se pudo abrir.',
      pasos: [
        'Haz clic en el icono de bloqueo de la barra de direcciones.',
        'Elige "Permitir ventanas emergentes" para este sitio.',
        'Vuelve a pulsar <b>Imprimir</b>.'
      ]
    });
    return;
  }
  ventana.document.write(`
    <!doctype html>
    <html lang="es">
    <head>
      <meta charset="UTF-8">
      <title>${titulo} - Impresión</title>
      <style>
        *{box-sizing:border-box}
        body{font-family:Arial,Helvetica,sans-serif;color:#17202a;padding:26px;margin:0}
        .cab{display:flex;justify-content:space-between;align-items:flex-end;border-bottom:2px solid #17202a;padding-bottom:10px;margin-bottom:16px}
        .cab h1{font-size:19px;margin:0 0 2px}
        .cab h2{font-size:14px;margin:0;color:#667085;font-weight:600}
        .cab small{color:#667085;white-space:nowrap;margin-left:14px}
        .filtros{margin-bottom:14px;font-size:12.5px;color:#344054;background:#f2f4f7;padding:8px 12px;border-radius:6px}
        table{width:100%;border-collapse:collapse;font-size:12px}
        th,td{border:1px solid #d0d5dd;padding:6px 8px;text-align:left}
        th{background:#f2f4f7}
        .badge{display:inline-block;padding:2px 7px;border-radius:10px;font-size:10px;font-weight:700;border:1px solid #d0d5dd}
        .pie{margin-top:18px;font-size:10.5px;color:#98a2b3;text-align:right}
        button, .btn, .action-buttons{display:none !important}
        @page{margin:14mm}
      </style>
    </head>
    <body>
      <div class="cab">
        <div><h1>${nombreEmpresa}</h1><h2>${titulo}</h2></div>
        <small>${fecha}</small>
      </div>
      ${filtrosTexto ? `<div class="filtros">${filtrosTexto}</div>` : ''}
      ${resumenHtml || ''}
      ${cuerpoHtml}
      <div class="pie">Generado por SmartTransPro</div>
    </body>
    </html>
  `);
  ventana.document.close();
  ventana.focus();
  setTimeout(() => ventana.print(), 300);
  // Ficha informativa: el alert ya no se usa, y aquí el usuario confirmaba
  // en blanco que la impresión se había abierto.
  mostrarFichaImpresion({
    estado: 'exito',
    titulo: 'Reporte enviado a imprimir',
    subtitulo: 'Se abrió en una ventana nueva con los datos filtrados de este momento.',
    documentoTitulo: 'Contenido del reporte',
    campos: [['Reporte', titulo], ['Generado', fecha]],
    pasos: [
      'Revisa en la ventana abierta que la tabla salga completa.',
      'Elige la impresora o la opción <b>Guardar como PDF</b>.'
    ]
  });
}

// ---------------------------------------------------------------- documentos PDF profesionales
// A diferencia de imprimirContenido() (que solo copia la tabla a una ventana y
// llama a window.print()), esto arma un documento con membrete, resumen y
// firmas, y lo entrega como un PDF real generado por Electron para que el
// usuario lo guarde, revise y luego imprima o envíe.
function documentoProfesionalHtml({ titulo, subtitulo, filtrosTexto, resumenHtml, cuerpoHtml, piePersonalizado, tamanoPagina }) {
  const nombreEmpresa = (document.getElementById('empresaDestacada') && document.getElementById('empresaDestacada').textContent.trim()) || 'SmartTransPro';
  const generado = new Intl.DateTimeFormat('es-NI', { dateStyle: 'long', timeStyle: 'short' }).format(new Date());
  return `
    <!doctype html>
    <html lang="es">
    <head>
      <meta charset="UTF-8">
      <title>${titulo}</title>
      <style>
        *{box-sizing:border-box}
        @page{size:${tamanoPagina || 'letter'};margin:20mm 14mm 16mm}
        body{font-family:Arial,Helvetica,sans-serif;color:#17202a;margin:0;font-size:12.5px}
        .membrete{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #344054;padding-bottom:12px;margin-bottom:16px}
        .membrete-empresa{font-size:21px;font-weight:800;color:#344054;letter-spacing:.2px}
        .membrete-doc{margin-top:4px;font-size:14px;font-weight:700;color:#17202a}
        .membrete-sub{margin-top:2px;font-size:11.5px;color:#667085}
        .membrete-meta{text-align:right;font-size:10.5px;color:#667085;white-space:nowrap}
        .filtros{margin:0 0 16px;font-size:11.5px;color:#344054;background:#f2f4f7;padding:9px 13px;border-radius:6px;border:1px solid #e2e6ea}
        .resumen-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:18px}
        .resumen-caja{border:1px solid #e2e6ea;border-top:3px solid #344054;border-radius:7px;padding:10px 12px;background:#f8f9fa}
        .resumen-caja .et{font-size:10px;color:#667085;text-transform:uppercase;letter-spacing:.3px}
        .resumen-caja .val{font-size:16px;font-weight:700;color:#17202a;margin-top:4px}
        table{width:100%;border-collapse:collapse;font-size:11.5px}
        thead th{background:#344054;color:#fff;text-align:left;padding:8px 9px;font-weight:600}
        tbody td{border-bottom:1px solid #e2e6ea;padding:7px 9px}
        tbody tr:nth-child(even){background:#f8f9fa}
        tfoot td{border-top:2px solid #344054;padding:9px;font-weight:700;background:#f2f4f7}
        .badge{display:inline-block;padding:2px 7px;border-radius:10px;font-size:9.5px;font-weight:700;border:1px solid #d0d5dd;background:#f2f4f7;color:#344054}
        .firmas{display:grid;grid-template-columns:1fr 1fr;gap:40px;margin-top:52px}
        .firma-linea{border-top:1px solid #344054;padding-top:6px;text-align:center;font-size:11px;color:#344054}
        .pie-nota{margin-top:26px;font-size:9.5px;color:#98a2b3;text-align:center}
        button,.btn,.action-buttons{display:none !important}
      </style>
    </head>
    <body>
      <div class="membrete">
        <div>
          <div class="membrete-empresa">${nombreEmpresa}</div>
          <div class="membrete-doc">${titulo}</div>
          ${subtitulo ? `<div class="membrete-sub">${subtitulo}</div>` : ''}
        </div>
        <div class="membrete-meta">Generado: ${generado}<br>Sistema SmartTransPro</div>
      </div>
      ${filtrosTexto ? `<div class="filtros">${filtrosTexto}</div>` : ''}
      ${resumenHtml || ''}
      ${cuerpoHtml}
      ${piePersonalizado || `
        <div class="firmas">
          <div class="firma-linea">Elaborado por</div>
          <div class="firma-linea">Autorizado por</div>
        </div>`}
      <div class="pie-nota">Documento generado automáticamente por SmartTransPro.</div>
    </body>
    </html>`;
}

// ---------------------------------------------------------------- ficha de impresión
// Sustituye al alert() del navegador (que mostraba el cuadro gris del sistema y
// perdía todo el contexto) por una tarjeta con el detalle del documento, los
// pasos a seguir y el botón de cerrar. Se usa al terminar de imprimir o al
// confirmar que un documento se descargó.
const ICONOS_FICHA = {
  exito: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>',
  advertencia: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
  error: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>'
};

/**
 * Muestra la ficha de información de impresión.
 * @param {object} opciones
 * @param {'exito'|'advertencia'|'error'} opciones.estado  tono de la ficha
 * @param {string} opciones.titulo     encabezado principal
 * @param {string} [opciones.subtitulo]  frase aclaratoria bajo el título
 * @param {string} [opciones.documentoTitulo]  encabezado del bloque de detalle
 * @param {Array<[string,string]>} [opciones.campos]  pares [clave, valor] del documento
 * @param {string} [opciones.miniatura]  data URL de la imagen a previsualizar
 * @param {string[]} [opciones.pasos]   instrucciones numeradas
 * @param {string} [opciones.boton]     texto del botón principal
 * @returns {Promise<void>}  se resuelve al cerrar la ficha
 */
function mostrarFichaImpresion({
  estado = 'exito',
  titulo,
  subtitulo = '',
  documentoTitulo = 'Documento',
  campos = [],
  miniatura = '',
  pasos = [],
  boton = 'Entendido'
} = {}) {
  return new Promise(resolve => {
    // Reutiliza la ficha anterior si el usuario imprima dos veces seguidas.
    const anterior = document.getElementById('fichaImpresion');
    if (anterior) anterior.remove();

    const cerrar = () => {
      document.removeEventListener('keydown', alPulsarTecla);
      velo.remove();
      resolve();
    };
    const alPulsarTecla = (e) => { if (e.key === 'Escape') cerrar(); };

    const velo = document.createElement('div');
    velo.className = 'ficha-impresion ficha-' + estado;
    velo.id = 'fichaImpresion';
    velo.setAttribute('role', 'dialog');
    velo.setAttribute('aria-modal', 'true');
    velo.setAttribute('aria-label', titulo);
    velo.innerHTML = `
      <div class="ficha-box">
        <div class="ficha-cabecera">
          <div class="ficha-icono">${ICONOS_FICHA[estado] || ICONOS_FICHA.exito}</div>
          <div class="ficha-titulos">
            <h3 class="ficha-titulo">${titulo}</h3>
            ${subtitulo ? `<p class="ficha-subtitulo">${subtitulo}</p>` : ''}
          </div>
          <button type="button" class="ficha-cerrar" title="Cerrar" aria-label="Cerrar">&times;</button>
        </div>
        <div class="ficha-cuerpo">
          ${(campos.length || miniatura) ? `
            <div class="ficha-doc">
              <div class="ficha-doc-titulo">${documentoTitulo}</div>
              ${campos.map(([clave, valor]) => `
                <div class="ficha-doc-fila">
                  <span class="ficha-doc-clave">${clave}</span>
                  <span class="ficha-doc-valor">${valor}</span>
                </div>`).join('')}
              ${miniatura ? `<img class="ficha-doc-mini" src="${miniatura}" alt="Vista previa del documento">` : ''}
            </div>` : ''}
          ${pasos.length ? `
            <ol class="ficha-pasos">
              ${pasos.map((paso, i) => `
                <li class="ficha-paso">
                  <span class="ficha-paso-num">${i + 1}</span>
                  <span>${paso}</span>
                </li>`).join('')}
            </ol>` : ''}
        </div>
        <div class="ficha-pie">
          <button type="button" class="btn primary">${boton}</button>
        </div>
      </div>`;

    document.body.appendChild(velo);
    velo.querySelector('.ficha-cerrar').onclick = cerrar;
    velo.querySelector('.ficha-pie .btn').onclick = cerrar;
    // Clic fuera de la tarjeta: cierra, sin castigar al usuario.
    velo.addEventListener('click', (e) => { if (e.target === velo) cerrar(); });
    document.addEventListener('keydown', alPulsarTecla);
    velo.querySelector('.ficha-pie .btn').focus();
  });
}

// ============================================================================
// Diálogos profesionales: sustituyen a alert() y confirm() del navegador.
//
// Los cuadros del sistema operativo (grises, con botones del sistema) rompían
// la estética de la aplicación y, sobre todo, el confirm() de "Cerrar sesión"
// aparecía como una alerta amarilla de Windows en lugar de una ventana propia.
// Estos diálogos usan el mismo lenguaje visual que la ficha de impresión:
// velo, tarjeta, icono de estado, título y botones al pie.
//
// Devuelven una promesa, así que se leen casi como los nativos:
//   if (await confirmarAccion({...})) { ... }
// ============================================================================

const ICONOS_DIALOGO = {
  exito: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12.5 9.5 18 20 6.5"/></svg>',
  advertencia: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3.5 1.8 20.5h20.4L12 3.5Z"/><path d="M12 9.5v5"/><path d="M12 17.4h.01"/></svg>',
  error: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M15 9l-6 6M9 9l6 6"/></svg>',
  info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 11v5.5"/><path d="M12 7.8h.01"/></svg>',
  salida: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M15 17.5v1.8a1.7 1.7 0 0 1-1.7 1.7H5.7A1.7 1.7 0 0 1 4 19.3V4.7A1.7 1.7 0 0 1 5.7 3h7.6a1.7 1.7 0 0 1 1.7 1.7v1.8"/><path d="M19.5 12H9.5"/><path d="M16.5 8.8 19.7 12l-3.2 3.2"/></svg>'
};

// Solo un diálogo a la vez: un segundo reemplaza al primero, así que un doble
// clic nunca deja dos ventanas apiladas.
function quitarDialogo() {
  const anterior = document.getElementById('dialogoSistema');
  if (anterior) anterior.remove();
}

function mostrarDialogo({
  estado = 'info',
  titulo,
  mensaje = '',
  botonOk = 'Aceptar',
  botonCancelar = null,
  okPeligroso = false,
  alAceptar = null
} = {}) {
  return new Promise(resolve => {
    quitarDialogo();
    let aceptado = false;

    const cerrar = () => {
      document.removeEventListener('keydown', alPulsarTecla);
      velo.remove();
      resolve(aceptado);
    };
    // Escape cancela si hay botón de cancelar; si no, equivale a aceptar.
    const alPulsarTecla = (e) => {
      if (e.key !== 'Escape') return;
      if (botonCancelar) return cerrar();
      aceptado = true;
      cerrar();
    };
    const aceptar = async () => {
      if (alAceptar) {
        // Si la acción falla, el diálogo sigue abierto para poder reintentar.
        try {
          await alAceptar();
        } catch (error) {
          console.error('La acción del diálogo falló:', error);
          return;
        }
      }
      aceptado = true;
      cerrar();
    };

    const velo = document.createElement('div');
    velo.className = 'ficha-impresion ficha-dialogo ficha-' + estado;
    velo.id = 'dialogoSistema';
    velo.setAttribute('role', 'dialog');
    velo.setAttribute('aria-modal', 'true');
    velo.setAttribute('aria-label', titulo);
    velo.innerHTML = `
      <div class="ficha-box ficha-box-dialogo">
        <div class="ficha-cabecera">
          <div class="ficha-icono">${ICONOS_DIALOGO[estado] || ICONOS_DIALOGO.info}</div>
          <div class="ficha-titulos">
            <h3 class="ficha-titulo">${titulo}</h3>
            ${mensaje ? `<p class="ficha-subtitulo">${mensaje}</p>` : ''}
          </div>
        </div>
        <div class="ficha-pie">
          ${botonCancelar
            ? `<button type="button" class="btn" data-accion="cancelar">${botonCancelar}</button>`
            : ''}
          <button type="button" class="btn ${okPeligroso ? 'btn-danger-solido' : 'primary'}" data-accion="ok">${botonOk}</button>
        </div>
      </div>`;

    document.body.appendChild(velo);
    velo.querySelector('[data-accion="ok"]').onclick = aceptar;
    const cancelar = velo.querySelector('[data-accion="cancelar"]');
    if (cancelar) cancelar.onclick = cerrar;
    // Clic fuera equivale a cancelar, pero solo si existe esa opción.
    velo.addEventListener('click', (e) => { if (e.target === velo && botonCancelar) cerrar(); });
    document.addEventListener('keydown', alPulsarTecla);
    // El foco arranca en la opción segura: Enter nunca borra nada por accidente.
    (cancelar || velo.querySelector('[data-accion="ok"]')).focus();
  });
}

/** Confirmación con dos botones. Devuelve true solo si se acepta. */
function confirmarAccion({
  titulo,
  mensaje = '',
  estado = 'info',
  botonOk = 'Aceptar',
  botonCancelar = 'Cancelar',
  okPeligroso = false
} = {}) {
  return mostrarDialogo({ estado, titulo, mensaje, botonOk, botonCancelar, okPeligroso });
}

/** Aviso de un solo botón (sustituye a alert()). */
function avisar({ estado = 'info', titulo, mensaje = '', boton = 'Entendido' } = {}) {
  return mostrarDialogo({ estado, titulo, mensaje, botonOk: boton, botonCancelar: null });
}

/** Aviso de éxito tras guardar o completar una acción. */
function avisarExito(titulo, mensaje = '', boton = 'Entendido') {
  return avisar({ estado: 'exito', titulo, mensaje, boton });
}

/** Aviso de error con el detalle que nos pasó. */
function avisarError(titulo, mensaje = '', boton = 'Entendido') {
  return avisar({ estado: 'error', titulo, mensaje, boton });
}

// ============================================================================
// Mostrar / ocultar contraseña.
//
// Los campos de contraseña se escriben siempre encriptados (type="password",
// que enmascara los caracteres). Este botón permite apartar la vista un
// momento, para comprobar que se está tecleando bien, y volver a ocultarla.
//
// No cambia el valor del campo ni lo altera: solo alterna la propiedad "type",
// así que la contraseña sigue viajando igual al servidor.
// ============================================================================

// Iconos del ojo: abierto (mostrar) y cerrado (ocultar).
const ICONO_OJO = {
  ver: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z"/><circle cx="12" cy="12" r="3.1"/></svg>',
  ocultar: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M9.9 5.8A9.6 9.6 0 0 1 12 5.5c6 0 9.5 6.5 9.5 6.5a17 17 0 0 1-2.7 3.5"/><path d="M6.3 6.8A17.4 17.4 0 0 0 2.5 12S6 18.5 12 18.5a9.4 9.4 0 0 0 3.9-.8"/><path d="M9.8 9.9a3 3 0 0 0 4.3 4.2"/><path d="M4 4l16 16"/></svg>'
};

/**
 * Activa el botón de mostrar/ocultar sobre un campo de contraseña.
 * @param {string|HTMLElement} campo  id del input o el propio elemento
 */
function activarMostrarClave(campo) {
  const input = typeof campo === 'string' ? document.getElementById(campo) : campo;
  if (!input) return;
  // Evita poner dos botones sobre el mismo campo.
  if (input.dataset.claveVisible === '1') return;
  input.dataset.claveVisible = '1';

  const contenedor = input.closest('.campo-clave') || input.parentElement;
  if (!contenedor) return;
  contenedor.classList.add('campo-clave');

  const boton = document.createElement('button');
  boton.type = 'button';
  boton.className = 'campo-ver';
  boton.title = 'Mostrar contraseña';
  boton.setAttribute('aria-label', 'Mostrar contraseña');
  boton.innerHTML = ICONO_OJO.ver;

  boton.addEventListener('click', () => {
    const visible = input.type === 'text';
    // Al alternar, el cursor se pierde: se devuelve al final del texto para
    // poder seguir tecleando sin interrupciones.
    const posicion = input.selectionStart;
    input.type = visible ? 'password' : 'text';
    boton.innerHTML = visible ? ICONO_OJO.ver : ICONO_OJO.ocultar;
    const etiqueta = visible ? 'Mostrar contraseña' : 'Ocultar contraseña';
    boton.title = etiqueta;
    boton.setAttribute('aria-label', etiqueta);
    try { input.setSelectionRange(posicion, posicion); } catch (e) { /* campo sin selección */ }
  });

  contenedor.appendChild(boton);
}

// ¿Estamos en la app de escritorio o en el navegador (versión web/nube)?
// En Electron hay un proceso principal que convierte el HTML en un PDF real y
// que abre los diálogos "Guardar como". En la nube no existe ese proceso: la
// API web (cliente-api.js) no expone esas funciones, así que hay que recurrir a
// las del propio navegador. Estas respuestas lo detectan para no romper.
function tieneApiDeEscritorio(grupo, accion) {
  return !!(window.api && window.api[grupo] && typeof window.api[grupo][accion] === 'function');
}

function puedeGenerarPdfNativo() {
  return tieneApiDeEscritorio('reportes', 'pdf');
}

function puedeGuardarEnDisco() {
  return tieneApiDeEscritorio('archivos', 'guardarImagen');
}

// Abre el HTML en una ventana aparte y lanza el diálogo de impresión del
// navegador, donde el usuario puede imprimir o elegir "Guardar como PDF".
// Es el equivalente web de generarPdfDesdeHtml() de Electron.
function imprimirHtmlEnVentana(html, titulo = 'Documento') {
  const ventana = window.open('', '_blank', 'width=900,height=760');
  if (!ventana) {
    mostrarFichaImpresion({
      estado: 'advertencia',
      titulo: 'Permite las ventanas emergentes',
      subtitulo: 'Tu navegador bloqueó la ventana de impresión, así que el documento no se pudo abrir.',
      pasos: [
        'Haz clic en el icono de bloqueo que aparece a la derecha de la barra de direcciones.',
        'Elige "Permitir ventanas emergentes" para este sitio.',
        'Vuelve a pulsar <b>Imprimir</b>.'
      ],
      boton: 'Entendido'
    });
    return false;
  }
  ventana.document.open();
  ventana.document.write(html);
  ventana.document.close();
  try { ventana.document.title = titulo; } catch (e) { /* no crítico */ }
  ventana.focus();

  // Imprimir de inmediato produce páginas en blanco: hay que esperar a que el
  // documento esté listo y a que terminen de cargar las imágenes.
  const imprimir = () => setTimeout(() => {
    try { ventana.print(); } catch (e) { console.error('No se pudo abrir la impresión:', e); }
  }, 100);
  const pendientes = Array.from(ventana.document.images || []).filter(img => !img.complete);
  if (pendientes.length) {
    let restantes = pendientes.length;
    const alListo = () => { if (--restantes <= 0) imprimir(); };
    pendientes.forEach(img => {
      img.addEventListener('load', alListo, { once: true });
      img.addEventListener('error', alListo, { once: true });
    });
    setTimeout(imprimir, 4000); // salvavidas si alguna imagen nunca dispara 'load'
  } else {
    imprimir();
  }
  return true;
}

// Genera el documento con documentoProfesionalHtml() y lo entrega como PDF real.
// En escritorio se usa el motor de Chromium de Electron (window.api.reportes.pdf);
// en la nube se abre el mismo documento en el diálogo de impresión del navegador.
// Muestra un estado de carga breve en el botón que dispara la acción.
async function imprimirComoPdf(opciones, boton) {
  const textoOriginal = boton ? boton.innerHTML : null;
  if (boton) { boton.disabled = true; boton.innerHTML = 'Generando PDF...'; }
  // Datos del documento para la ficha: el mismo membrete que se va a imprimir.
  const ficha = {
    documentoTitulo: 'Documento a imprimir',
    campos: [
      ['Título', opciones.titulo || 'Documento'],
      ...(opciones.subtitulo ? [['Detalle', opciones.subtitulo.replace(/<[^>]+>/g, '')]] : []),
      ...(opciones.nombreArchivo ? [['Archivo', `${opciones.nombreArchivo}.pdf`]] : [])
    ]
  };
  try {
    const html = documentoProfesionalHtml(opciones);
    if (puedeGenerarPdfNativo()) {
      const resultado = await window.api.reportes.pdf(html, opciones.nombreArchivo || 'reporte');
      if (resultado && resultado.ok === false && !resultado.cancelado) {
        mostrarFichaImpresion({
          estado: 'error',
          titulo: 'No se pudo generar el PDF',
          subtitulo: (resultado && resultado.error) || 'Ocurrió un problema al crear el archivo.',
          ...ficha,
          boton: 'Cerrar'
        });
      }
    } else {
      // Sin await previo: la ventana debe abrirse dentro del clic del usuario
      // o el navegador la bloqueará como ventana emergente.
      const abierta = imprimirHtmlEnVentana(html, opciones.titulo || 'Documento');
      if (abierta) {
        mostrarFichaImpresion({
          estado: 'exito',
          titulo: 'Documento enviado a imprimir',
          subtitulo: 'Se abrió en una ventana nueva. Revisa la vista previa y elige la impresora o "Guardar como PDF".',
          ...ficha,
          pasos: [
            'En la ventana que se abrió, revisa que la imagen se vea completa.',
            'Elige la impresora o la opción <b>Guardar como PDF</b>.',
            'Vuelve aquí y cierra esta ficha cuando termines.'
          ],
          boton: 'Entendido'
        });
      }
    }
  } catch (err) {
    mostrarFichaImpresion({
      estado: 'error',
      titulo: 'No se pudo generar el PDF',
      subtitulo: err.message,
      ...ficha,
      boton: 'Cerrar'
    });
  } finally {
    // La ficha no se espera a propósito: si se esperara, el botón quedaría en
    // "Generando PDF..." hasta que el usuario la cerrara.
    if (boton) { boton.disabled = false; boton.innerHTML = textoOriginal; }
  }
}

// ---------------------------------------------------------------- descarga de documentos
// Convierte un "data:image/xxx;base64,..." en un Blob descargable.
// null si el contenido no es una imagen válida.
function blobDesdeDataUrl(dataUrl) {
  const m = /^data:([^;,]+);base64,(.+)$/.exec(String(dataUrl || ''));
  if (!m) return null;
  try {
    const binario = atob(m[2]);
    const bytes = new Uint8Array(binario.length);
    for (let i = 0; i < binario.length; i++) bytes[i] = binario.charCodeAt(i);
    return new Blob([bytes], { type: m[1] });
  } catch (e) {
    return null;
  }
}

function extensionDeDataUrl(dataUrl) {
  const m = /^data:image\/([a-zA-Z0-9.+-]+);base64,/.exec(String(dataUrl || ''));
  if (!m) return null;
  const tipo = m[1].toLowerCase();
  return tipo === 'jpeg' ? 'jpg' : tipo;
}

// Descarga UN documento (p.ej. la foto de la licencia de un conductor).
// En escritorio se abre el diálogo "Guardar como" de Electron; en la nube se
// usa la descarga nativa del navegador, que la deja en la carpeta de descargas.
async function descargarDocumento(dataUrl, nombreSugerido) {
  if (puedeGuardarEnDisco()) {
    return await window.api.archivos.guardarImagen(dataUrl, nombreSugerido);
  }
  const blob = blobDesdeDataUrl(dataUrl);
  const extension = extensionDeDataUrl(dataUrl);
  if (!blob || !extension) {
    return { ok: false, error: 'Ese documento no tiene una imagen válida para descargar.' };
  }
  const url = URL.createObjectURL(blob);
  const enlace = document.createElement('a');
  enlace.href = url;
  enlace.download = `${nombreSugerido || 'documento'}.${extension}`;
  document.body.appendChild(enlace);
  enlace.click();
  enlace.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
  return { ok: true };
}

// Descarga VARIOS documentos juntos (los 3 de la ficha de un conductor).
// En escritorio se elige una carpeta; el navegador no ofrece esa opción, así que
// se descargan uno tras otro con una pausa breve (evita que Chrome/Edge bloquee
// las descargas múltiples y da tiempo a que el usuario vea el aviso).
async function descargarDocumentos(archivos, tituloCarpeta) {
  if (tieneApiDeEscritorio('archivos', 'guardarImagenes')) {
    return await window.api.archivos.guardarImagenes(archivos, tituloCarpeta);
  }
  const validos = (archivos || []).filter(a => a && a.dataUrl);
  if (!validos.length) return { ok: false, error: 'No hay documentos disponibles para descargar.' };
  for (let i = 0; i < validos.length; i++) {
    if (i) await new Promise(r => setTimeout(r, 400));
    await descargarDocumento(validos[i].dataUrl, validos[i].nombre);
  }
  return { ok: true, guardados: validos.map(a => a.nombre) };
}
