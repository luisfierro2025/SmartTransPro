// ============================================================================
// Comprueba estilos comunes de tablas, formato de fechas y ficha de planilla.
//
// Se lee el CSS real (no una copia) y se resuelve la regla que aplica a `th`,
// incluyendo el orden de las hojas: si alguien vuelve a poner un gris claro o
// un color propio en el tema oscuro, esta prueba lo detecta.
//
//   Uso: node tools/prueba-estilos.js
// ============================================================================
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const CSS = path.join(__dirname, '..', 'src', 'renderer', 'css', 'style.css');
const UTILIDADES = path.join(__dirname, '..', 'src', 'renderer', 'js', 'utilidades.js');
const HTML = path.join(__dirname, '..', 'src', 'renderer', 'index.html');
const MAIN = path.join(__dirname, '..', 'src', 'main', 'main.js');

let correctas = 0;
let fallidas = 0;

function verificar(descripcion, condicion, detalle) {
  if (condicion) {
    correctas++;
    console.log(`  [OK]    ${descripcion}`);
  } else {
    fallidas++;
    console.log(`  [FALLO] ${descripcion}${detalle !== undefined ? ' -> ' + detalle : ''}`);
  }
}

// El color del sidebar, tal como está definido en :root.
function colorDelSidebar(css) {
  const m = css.match(/--sidebar\s*:\s*([^;]+);/);
  return m ? m[1].trim().toLowerCase() : null;
}

// Reglas que aplican a `th` en el CSS de la aplicación. Se recorren los
// selectores terminados en "th" (como "th" o "thead th") y se queda el
// background de cada uno; el último declarado gana por orden de la hoja.
function fondosDeTh(css) {
  const encontrados = [];
  // Se parte por "}" para no cruzar reglas: cada bloque es un selector + cuerpo.
  for (const bloque of css.split('}')) {
    if (!bloque.includes('{')) continue;
    const [selector, cuerpo] = bloque.split('{');
    const sel = selector.trim();
    if (!/(\b|\s)th$/.test(sel)) continue; // solo "th" o algo terminado en " th"
    const fondo = (cuerpo.match(/background\s*:\s*([^;]+);/) || [])[1];
    if (fondo) encontrados.push({ sel, fondo: fondo.trim().toLowerCase() });
  }
  return encontrados;
}

console.log('\n=== Prueba de estilos y formato local ===\n');

const css = fs.readFileSync(CSS, 'utf8');
const sidebar = colorDelSidebar(css);
console.log(`Color del sidebar: ${sidebar}\n`);

verificar('El CSS define la variable --sidebar', !!sidebar, sidebar);
verificar('El color de marca y el sidebar usan Slate #475467',
  sidebar === '#475467' && /--primary:#475467/.test(css));

const reglas = fondosDeTh(css);
console.log('Reglas que aplican a th:');
for (const r of reglas) console.log(`   ${r.sel} -> ${r.fondo}`);

// Las tablas de trabajo usan el color de marca y texto de alto contraste.
const encabezadosMarca = reglas.filter(r =>
  r.sel === '.content table:not(.ficha-datos):not(.importar-preview) th'
);
verificar('Las tablas de módulos usan el color de marca en sus encabezados',
  encabezadosMarca.some(r => r.fondo.includes('var(--sidebar)')), JSON.stringify(encabezadosMarca));
verificar('Los encabezados de tabla mantienen contraste alto',
  /\.content table:not\(\.ficha-datos\):not\(\.importar-preview\) th\{[^}]*color:#fff!important/i.test(css));
verificar('Las tablas mantienen tipografía legible y filas espaciadas',
  /\.content table:not\(\.ficha-datos\):not\(\.importar-preview\)\{[^}]*font:400 13px\/1\.5 var\(--fuente\)/i.test(css)
    && /\.content table:not\(\.ficha-datos\):not\(\.importar-preview\) th,[\s\S]*?td\{[^}]*padding:13px 15px/i.test(css));
verificar('El resumen de utilidad del dashboard permanece visible sin tarjetas',
  /\.dash-hero-kpi\{[^}]*display:flex!important/i.test(css)
    && !/\.content \.dash-hero-kpi\{display:none!important/i.test(css));
const reglasResumenDash=[...css.matchAll(/\.dash-hero\{([^}]*)\}/g)];
const resumenDashFinal=reglasResumenDash.length?reglasResumenDash[reglasResumenDash.length-1][1]:'';
verificar('El resumen del dashboard mantiene una superficie con texto legible sobre fondos personalizados',
  /background:var\(--surface\)/.test(resumenDashFinal)
    && /border:1px solid var\(--border\)/.test(resumenDashFinal)
    && /\.dash-hero h2\{color:var\(--text\)\}/.test(css)
    && /\.dash-hero p,\.dash-hero-etiqueta,\.dash-hero-nota\{color:var\(--muted\)\}/.test(css));
verificar('Los campos de formularios comparten altura y foco visible',
  /\.content input:not\(\[type="checkbox"\]\)[^}]*min-height:36px/i.test(css)
    && /\.content select:focus,[\s\S]*?box-shadow:0 0 0 3px color-mix/i.test(css));

verificar('La navegación principal es una barra lateral persistente',
  /\.app-shell\{[^}]*grid-template-columns:224px minmax\(0,1fr\)/i.test(css)
    && /\.navbar\{[^}]*flex-direction:column/i.test(css));
verificar('El menú lateral puede plegarse sin perder etiquetas accesibles',
  /\.app-shell\.sidebar-collapsed\{grid-template-columns:72px minmax\(0,1fr\)/i.test(css)
    && /id="sidebarToggle"[^>]*aria-expanded="true"/i.test(fs.readFileSync(HTML, 'utf8'))
    && /control-empresa-sidebar-colapsado/.test(fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer', 'js', 'app.js'), 'utf8')));
verificar('La barra inferior coincide con el sidebar y mantiene texto legible en menor altura',
  /\.statusbar\{[^}]*height:30px;min-height:30px;flex-shrink:0;[^}]*background:#475467!important;[^}]*color:#f8fafc!important/i.test(css)
    && /\.statusbar strong\{color:#fff\}/i.test(css)
    && /\.ticker-item span\{color:#eef3f7;font-size:11px\}/i.test(css)
    && /\.ticker-item--positivo span\{color:#bbf7d0\}/i.test(css)
    && /\.ticker-item--negativo span\{color:#fecaca\}/i.test(css));
verificar('El sidebar usa transiciones discretas y respeta movimiento reducido',
  /@keyframes sidebar-active-in/.test(css)
    && /@media\(prefers-reduced-motion:reduce\)\{[\s\S]*?\.navbar \.menu-item\.active,\.escritorio-marca\{animation:none\}/i.test(css));
verificar('Las acciones y filtros de los módulos comparten una barra alineada',
  /\.content \.page-actions\{[^}]*display:flex/i.test(css)
    && /\.content \.toolbar\{[^}]*display:grid[^}]*grid-template-columns:repeat\(auto-fit,minmax\(170px,1fr\)\)/i.test(css)
    && /\.content \.toolbar>\.action-buttons\{[^}]*grid-column:1\/-1[^}]*justify-content:flex-end/i.test(css));
verificar('Los filtros de búsqueda, fechas y selectores comparten controles amplios y foco visible',
  /\.content \.field input[^}]*height:42px;min-height:42px/i.test(css)
    && /\.content \.toolbar :is\(input\[type="search"\],input\.input-busqueda,input\[id\*="buscar" i\]\)\{/i.test(css)
    && /\.content :is\(input,select,textarea,button\):focus-visible/i.test(css));

// La tabla de etiquetas de la ficha de pago (th como rótulo, no encabezado)
// debe seguir transparente: si heredara el fondo oscuro, el texto ya no se leería.
const fichaDatos = (css.match(/\.ficha-datos th\s*\{[^}]*\}/) || [])[0] || '';
verificar('La tabla de etiquetas de la ficha conserva su fondo transparente',
  /background\s*:\s*transparent/i.test(fichaDatos), fichaDatos);

// Los documentos impresos usan el mismo color, escritos de forma literal
// porque se generan fuera de la aplicación (en una ventana nueva sin el CSS).
const utils = fs.readFileSync(UTILIDADES, 'utf8');
const thImpresion = [...utils.matchAll(/(?:^|\s)th\s*\{[^}]*\}/g)].map(m => m[0]);
const theadImpresion = [...utils.matchAll(/thead th\s*\{[^}]*\}/g)].map(m => m[0]);
const impresionTodos = [...thImpresion, ...theadImpresion];
verificar('Los documentos impresos usan el mismo color del sidebar',
  impresionTodos.length >= 2 && impresionTodos.every(r => r.includes(sidebar)),
  JSON.stringify(impresionTodos));

const contextoFechas = { Date, Intl, setTimeout, clearTimeout, console, document: {} };
vm.createContext(contextoFechas);
vm.runInContext(utils, contextoFechas);
verificar('Las fechas ISO se muestran como día-mes-año',
  vm.runInContext("formatearFecha('2026-10-25')", contextoFechas) === '25-10-2026');
verificar('Las fechas con hora mantienen el orden día-mes-año',
  vm.runInContext("formatearFechaHora('2026-10-25 15:30:00')", contextoFechas).startsWith('25-10-2026 '));
const modalPlanilla = (css.match(/\.planilla-ficha-modal\{([^}]*)\}/) || [])[1] || '';
const cabeceraPlanilla = (css.match(/\.planilla-ficha-modal>\.planilla-ficha-header\{([^}]*)\}/) || [])[1] || '';
verificar('La ficha de edición comparte el diseño y ancho controlado de la ficha de detalle',
  /max-width:\s*1180px/.test(modalPlanilla) && /\.planilla-ficha-tabla input\[data-campo\]\{/.test(css));
verificar('La cabecera de planilla se mantiene legible durante el scroll',
  /position:\s*sticky/.test(cabeceraPlanilla) && /background:\s*var\(--surface\)/.test(cabeceraPlanilla));
const html = fs.readFileSync(HTML, 'utf8');
const main = fs.readFileSync(MAIN, 'utf8');
const app = fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer', 'js', 'app.js'), 'utf8');
const sesion = fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer', 'js', 'sesion.js'), 'utf8');
verificar('El botón ver clave queda dentro del campo y alterna de forma accesible',
  /for="loginClave">Contraseña<\/label>\s*<div class="campo-clave">\s*<svg[^>]*class="acceso-icono-clave"[\s\S]*?<\/svg>\s*<input id="loginClave"/.test(html)
    && /\.acceso \.campo \.campo-clave>input\{padding:0 48px 0 40px\}/.test(css)
    && /\.acceso \.campo \.campo-clave \.campo-ver:focus-visible/.test(css)
    && /input\.type = visible \? 'password' : 'text'/.test(utils)
    && /setAttribute\('aria-label', etiqueta\)/.test(utils));
verificar('El login usa una tarjeta refinada y adaptable',
  /\.acceso-caja\{[^}]*max-width:420px[^}]*border:1px solid var\(--border\)/.test(css)
    && /\.acceso-formulario-kicker\{/.test(css)
    && /\.acceso-presentacion\{[^}]*repeating-linear-gradient\(135deg,rgba\(255,255,255,\.025\) 0 1px,transparent 1px 42px\)/.test(css)
    && /@media\(max-width:520px\)\{[\s\S]*?\.acceso-caja\{padding:30px 24px 26px/.test(css));
verificar('Configuración permite elegir, guardar y restablecer el fondo de la aplicación',
  /id="cfgColorFondoAplicacion" type="color"/.test(app)
    && /control-empresa-color-fondo/.test(app)
    && /function colorHexValido\(color\)/.test(app)
    && /setProperty\('--bg',color\)/.test(app)
    && /localStorage\.setItem\(CLAVE_COLOR_FONDO_APLICACION,color\)/.test(app)
    && /localStorage\.removeItem\(CLAVE_COLOR_FONDO_APLICACION\)/.test(app)
    && /id="restablecerColorFondo"/.test(app));
const funcionContraste=(app.match(/function colorTextoContraste\(color\)\{[\s\S]*?\n\}/) || [])[0];
const colorTextoContraste=funcionContraste
  ? vm.runInNewContext(`${funcionContraste}; colorTextoContraste`)
  : null;
verificar('El título cambia a un color legible según la luminancia del fondo',
  typeof colorTextoContraste==='function'
    && colorTextoContraste('#101010')==='#fff'
    && colorTextoContraste('#808080')==='#000'
    && colorTextoContraste('#f5f5f5')==='#101828'
    && /\.content \.page-intro h2,\.content \.page-intro p\{[^}]*var\(--app-bg-foreground,var\(--text\)\)!important/i.test(css));
verificar('Escritorio aparece antes de Dashboard y queda como pantalla inicial tras el login',
  /data-module="escritorio"[\s\S]*?data-module="dashboard"/i.test(html)
    && /abrir\('escritorio'\)/.test(sesion)
    && /escritorio:\['Escritorio',renderEscritorio\]/.test(app));
verificar('El Escritorio tiene fondo blanco y marca de agua centrada',
  /\.content\.content-escritorio\{[^}]*background-color:#fff/i.test(css)
    && /\.escritorio-vacio\{[^}]*place-items:center/i.test(css)
    && /\.content\.content-escritorio\{[^}]*background-image:linear-gradient\(rgba\(71,84,103,\.055\)/i.test(css)
    && /\.content\.content-escritorio\{[^}]*background-size:36px 36px/i.test(css)
    && /\.escritorio-marca span\{[^}]*font-size:clamp\(48px,7vw,96px\)/i.test(css)
    && /\.escritorio-marca span\{[^}]*font-family:"Cambria","Georgia",serif/i.test(css)
    && /SmartTransPro/.test(app));
const escritorioMarkup = (app.match(/function renderEscritorio\(\)\{([\s\S]*?)\n\}/) || [])[1] || '';
verificar('La marca del Escritorio es solo texto, sin imagen ni SVG',
  /id="textoMarcaEscritorio"/.test(escritorioMarkup) && !/<svg|<img/i.test(escritorioMarkup));
verificar('Configuración permite personalizar el texto del Escritorio con valor inicial',
  /id="cfgTextoEscritorio"[^>]*maxlength="80"/.test(app)
    && /TEXTO_ESCRITORIO_DEFAULT='Transporte Fierro'/.test(app)
    && /control-empresa-texto-escritorio/.test(app)
    && /id="guardarTextoEscritorio"/.test(app));
verificar('La interfaz y los controles nativos usan locale español',
  /<html lang="es-NI">/.test(html) && /appendSwitch\('lang', 'es-NI'\)/.test(main));

console.log(`\nResultado: ${correctas} comprobaciones correctas, ${fallidas} fallidas.`);
process.exit(fallidas === 0 ? 0 : 1);
