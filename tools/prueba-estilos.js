// ============================================================================
// Comprueba que la fila de encabezados de TODAS las tablas use el mismo color
// que el sidebar, en tema claro y en tema oscuro.
//
// Se lee el CSS real (no una copia) y se resuelve la regla que aplica a `th`,
// incluyendo el orden de las hojas: si alguien vuelve a poner un gris claro o
// un color propio en el tema oscuro, esta prueba lo detecta.
//
//   Uso: node tools/prueba-estilos.js
// ============================================================================
const fs = require('fs');
const path = require('path');

const CSS = path.join(__dirname, '..', 'src', 'renderer', 'css', 'style.css');
const UTILIDADES = path.join(__dirname, '..', 'src', 'renderer', 'js', 'utilidades.js');

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

console.log('\n=== Prueba de estilos de tabla ===\n');

const css = fs.readFileSync(CSS, 'utf8');
const sidebar = colorDelSidebar(css);
console.log(`Color del sidebar: ${sidebar}\n`);

verificar('El CSS define la variable --sidebar', !!sidebar, sidebar);

const reglas = fondosDeTh(css);
console.log('Reglas que aplican a th:');
for (const r of reglas) console.log(`   ${r.sel} -> ${r.fondo}`);

// La regla general de th (la que usa las tablas de los módulos) debe apuntar
// al color del sidebar. Se identifican por ser las que no son de una clase
// concreta (por ejemplo, no ".ficha-datos th", que es la tabla de etiquetas).
const reglaGeneral = reglas.filter(r => !/\.[a-z-]+\s+th$/i.test(r.sel));
verificar('La regla general de th usa el color del sidebar',
  reglaGeneral.length > 0 && reglaGeneral.every(r => r.fondo.includes('var(--sidebar)')),
  JSON.stringify(reglaGeneral));

// El texto del encabezado debe ir en blanco para que se lea sobre el fondo oscuro.
const textoBlanco = /th\{[^}]*color\s*:\s*#fff/i.test(css);
verificar('El texto del encabezado es blanco', textoBlanco);

// En tema oscuro el encabezado no debe cambiar de color: el sidebar tampoco.
const bloqueOscuro = (css.match(/body\.dark-theme\s*\{[^}]*\}/) || [])[0] || '';
const thEnOscuro = /body\.dark-theme\s+th\s*\{/.test(css);
verificar('El tema oscuro no redefine el color del encabezado', !thEnOscuro, 'body.dark-theme th');

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

console.log(`\nResultado: ${correctas} comprobaciones correctas, ${fallidas} fallidas.`);
process.exit(fallidas === 0 ? 0 : 1);
