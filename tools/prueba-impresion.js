// ============================================================================
// Prueba de impresión y descarga de documentos SIN Electron.
//
// Los botones "Imprimir" y "Descargar" de la ficha del conductor llegan a la
// API de escritorio (window.api.reportes.pdf / window.api.archivos.*), que en
// la versión web no existe: ahí el trabajo lo hace el navegador. Esta prueba
// carga las funciones reales de src/renderer/js/utilidades.js sobre un DOM
// simulado y comprueba que eligen el camino correcto y no lanzan.
//
//   Uso: npm run test:impresion
// ============================================================================
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const UTILIDADES = path.join(__dirname, '..', 'src', 'renderer', 'js', 'utilidades.js');

// Un PNG de 1x1 en base64: sirve como documento de conductor válido.
const PNG_1x1 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

// Simula el entorno de una pestaña del navegador (versión web/nube).
// El DOM es mínimo pero suficiente para la ficha de impresión: registra los
// nodos añadidos al body y devuelve subnodos simulados por selector, de modo
// que la prueba pueda comprobar qué se pintó y pulsar sus botones.
function crearNavegador() {
  const registro = { alertas: [], descargas: [], impresas: 0, nodos: [] };

  const crearElemento = (etiqueta) => {
    const hijos = new Map();
    const nodo = {
      tagName: etiqueta.toUpperCase(),
      style: {},
      id: '',
      innerHTML: '',
      children: [],
      atributos: {},
      parent: null,
      setAttribute(n, v) { this.atributos[n] = v; },
      getAttribute(n) { return this.atributos[n]; },
      click() {
        if (etiqueta === 'a') registro.descargas.push({ download: this.download, href: this.href });
      },
      focus() { registro.enfocado = this; },
      // _lista recuerda dónde se insertó el nodo, para que remove() lo saque de
      // ahí (como hace un navegador real) y no de una lista inventada.
      _lista: null,
      appendChild(hijo) { hijo.parent = this; hijo._lista = this.children; this.children.push(hijo); return hijo; },
      remove() {
        const lista = this._lista || (this.parent && this.parent.children) || registro.nodos;
        const i = lista.indexOf(this);
        if (i >= 0) lista.splice(i, 1);
      },
      addEventListener() {},
      querySelector(sel) {
        if (!hijos.has(sel)) {
          const hijo = crearElemento('div');
          hijo.selector = sel;
          hijos.set(sel, hijo);
        }
        return hijos.get(sel);
      },
      querySelectorAll: () => []
    };
    return nodo;
  };

  const doc = {
    title: '',
    images: [],
    body: crearElemento('body'),
    getElementById: (id) => registro.nodos.find(n => n.id === id) || null,
    createElement: crearElemento,
    addEventListener() {},
    removeEventListener() {}
  };
  // El body real acumula lo que se le anexa (como en un navegador).
  doc.body.appendChild = (hijo) => {
    hijo.parent = doc.body;
    hijo._lista = registro.nodos;
    registro.nodos.push(hijo);
    return hijo;
  };
  doc.body.removeChild = (hijo) => {
    const i = registro.nodos.indexOf(hijo);
    if (i >= 0) registro.nodos.splice(i, 1);
  };

  const ventanaImpresion = {
    document: Object.assign({}, doc, { open() {}, write() {}, close() {} }),
    focus() {},
    print() { registro.impresas++; }
  };

  const ventana = {
    api: undefined,
    open: () => ventanaImpresion,
    document: { getElementById: () => null }
  };

  return {
    registro,
    // La ficha viva, tal como quedó en el DOM.
    ficha: () => registro.nodos.find(n => n.id === 'fichaImpresion') || null,
    contexto: {
      window: ventana,
      document: doc,
      alert: (m) => registro.alertas.push(m),
      console, setTimeout, clearTimeout, Intl, Blob, URL, atob
    }
  };
}

// Carga utilidades.js en el contexto dado (sus funciones son globales).
function cargarUtilidades(contexto) {
  vm.createContext(contexto);
  vm.runInContext(fs.readFileSync(UTILIDADES, 'utf8'), contexto, { filename: 'utilidades.js' });
  return contexto;
}

function verificar(descripcion, condicion, detalle) {
  console.log(`  ${condicion ? '[OK]   ' : '[FALLO]'} ${descripcion}`);
  if (!condicion && detalle) console.log(`          ${detalle}`);
  return !!condicion;
}

async function ejecutar() {
  console.log('\n=== Prueba de impresión y descarga (modo navegador) ===\n');
  let ok = true;

  // ---------------------------------------------------------------- 1) entorno
  console.log('1) Detección del entorno');
  {
    // Así se ve window.api en la nube: cliente-api.js no define reportes.pdf
    // ni el grupo archivos, porque el servidor no puede generar PDFs.
    const { contexto: nube } = crearNavegador();
    cargarUtilidades(nube);
    nube.window.api = { reportes: { egresos: () => {} }, sistema: { info: () => {} } };
    ok = verificar('sin API de escritorio no intenta generar el PDF nativo', nube.puedeGenerarPdfNativo() === false) && ok;
    ok = verificar('sin API de escritorio no intenta guardar en disco', nube.puedeGuardarEnDisco() === false) && ok;

    // Y así en Electron: el preload sí expone las dos funciones.
    const { contexto: escritorio } = crearNavegador();
    cargarUtilidades(escritorio);
    escritorio.window.api = { reportes: { pdf: () => {} }, archivos: { guardarImagen: () => {}, guardarImagenes: () => {} } };
    ok = verificar('con preload de Electron detecta el PDF nativo', escritorio.puedeGenerarPdfNativo() === true) && ok;
    ok = verificar('con preload de Electron detecta la descarga a disco', escritorio.puedeGuardarEnDisco() === true) && ok;
  }

  // ------------------------------------------------------- 2) imprimir en la nube
  console.log('\n2) Imprimir un documento en la nube');
  {
    const { registro, contexto } = crearNavegador();
    cargarUtilidades(contexto);
    const html = contexto.documentoProfesionalHtml({ titulo: 'Licencia', cuerpoHtml: '<p>x</p>' });
    ok = verificar('genera un documento HTML completo', /<!doctype html>/i.test(html) && html.includes('Licencia')) && ok;

    const abierto = contexto.imprimirHtmlEnVentana(html, 'Licencia');
    ok = verificar('abre la ventana de impresión en vez de fallar', abierto === true && registro.alertas.length === 0) && ok;

    await new Promise(r => setTimeout(r, 250));
    ok = verificar('lanza el diálogo de impresión del navegador', registro.impresas === 1, `impresas=${registro.impresas}`) && ok;

    // El recorrido completo desde el botón, como lo hace la ficha del conductor.
    const antes = registro.impresas;
    await contexto.imprimirComoPdf({ titulo: 'Documento de Conductor', cuerpoHtml: '<p>x</p>', nombreArchivo: 'c' });
    await new Promise(r => setTimeout(r, 250));
    ok = verificar('imprimirComoPdf() no lanza y sí imprime',
      registro.impresas === antes + 1 && registro.alertas.length === 0,
      `alertas=${JSON.stringify(registro.alertas)}`) && ok;

    const bloqueado = crearNavegador();
    cargarUtilidades(bloqueado.contexto);
    bloqueado.contexto.window.open = () => null;
    const r = bloqueado.contexto.imprimirHtmlEnVentana(html, 'x');
    ok = verificar('avisa con la ficha cuando el navegador bloquea la ventana',
      r === false && bloqueado.registro.alertas.length === 0 && !!bloqueado.ficha()) && ok;
  }

  // ------------------------------------------------------ 3) imprimir escritorio
  console.log('\n3) Imprimir un documento en el escritorio');
  {
    const { registro, contexto } = crearNavegador();
    cargarUtilidades(contexto);
    let recibido = null;
    contexto.window.api = {
      reportes: { pdf: (html, nombre) => { recibido = { html, nombre }; return { ok: true }; } }
    };
    await contexto.imprimirComoPdf({ titulo: 'Licencia', cuerpoHtml: '<p>x</p>', nombreArchivo: 'juan-frontal' });
    ok = verificar('delega en reportes:pdf de Electron', recibido && recibido.nombre === 'juan-frontal') && ok;
    ok = verificar('no abre la ventana del navegador en escritorio', registro.impresas === 0) && ok;
  }

  // --------------------------------------------------------- 4) descargar nube
  console.log('\n4) Descargar documentos en la nube');
  {
    const { registro, contexto } = crearNavegador();
    cargarUtilidades(contexto);

    const r1 = await contexto.descargarDocumento(PNG_1x1, 'juan-frontal');
    ok = verificar('descarga un documento válido', r1 && r1.ok === true) && ok;
    ok = verificar('respeta el nombre y la extensión del archivo',
      registro.descargas.length === 1 && registro.descargas[0].download === 'juan-frontal.png',
      JSON.stringify(registro.descargas)) && ok;

    const r2 = await contexto.descargarDocumento('no-es-una-imagen', 'x');
    ok = verificar('rechaza un documento corrupto con mensaje claro',
      r2 && r2.ok === false && /imagen válida/.test(r2.error), JSON.stringify(r2)) && ok;

    const r3 = await contexto.descargarDocumento(null, 'x');
    ok = verificar('rechaza un documento ausente sin romperse', r3 && r3.ok === false) && ok;

    const antes = registro.descargas.length;
    const r4 = await contexto.descargarDocumentos([
      { nombre: 'a-frontal', dataUrl: PNG_1x1 },
      { nombre: 'a-trasera', dataUrl: PNG_1x1 },
      { nombre: 'a-carnet', dataUrl: '' }
    ], 'descargar los 3');
    ok = verificar('descarga los 3 documentos de la ficha',
      r4 && r4.ok === true && r4.guardados.length === 2, JSON.stringify(r4)) && ok;
    ok = verificar('omite los documentos sin imagen', registro.descargas.length === antes + 2,
      `descargas=${registro.descargas.length - antes}`) && ok;

    const r5 = await contexto.descargarDocumentos([], 'nada');
    ok = verificar('informa cuando no hay nada que descargar', r5 && r5.ok === false && !!r5.error) && ok;
  }

  // -------------------------------------------------- 5) descargar escritorio
  console.log('\n5) Descargar documentos en el escritorio');
  {
    const { registro, contexto } = crearNavegador();
    cargarUtilidades(contexto);
    const llamadas = [];
    contexto.window.api = {
      archivos: {
        guardarImagen: (d, n) => { llamadas.push({ tipo: 'uno', n }); return { ok: true }; },
        guardarImagenes: (a, t) => { llamadas.push({ tipo: 'varios', n: a.length, t }); return { ok: true }; }
      }
    };
    await contexto.descargarDocumento(PNG_1x1, 'juan-frontal');
    await contexto.descargarDocumentos([{ nombre: 'a', dataUrl: PNG_1x1 }], 'carpeta');
    ok = verificar('delega en el diálogo "Guardar como" de Electron',
      llamadas.length === 2 && llamadas[0].tipo === 'uno' && llamadas[1].tipo === 'varios') && ok;
    ok = verificar('no usa descargas del navegador en escritorio', registro.descargas.length === 0) && ok;
  }

  // ---------------------------------------------------------------- 6) ficha
  console.log('\n6) Ficha de información de impresión');
  {
    const { registro, ficha, contexto } = crearNavegador();
    cargarUtilidades(contexto);

    const pendiente = contexto.mostrarFichaImpresion({
      estado: 'exito',
      titulo: 'Documento descargado',
      subtitulo: 'El archivo ya está en tu equipo.',
      documentoTitulo: 'Documentos del conductor',
      campos: [['Conductor', 'Carlos Mendoza'], ['Documento', 'Licencia frontal']],
      miniatura: PNG_1x1,
      pasos: ['Revisa tu carpeta de descargas.', 'Verifica que la imagen se vea completa.'],
      boton: 'Entendido'
    });

    const nodo = ficha();
    ok = verificar('la ficha se inserta en la página', !!nodo) && ok;
    ok = verificar('no usa alert() del navegador', registro.alertas.length === 0, JSON.stringify(registro.alertas)) && ok;
    ok = verificar('aplica el tono de estado', /ficha-exito/.test(nodo.className), nodo.className) && ok;
    ok = verificar('muestra el título y el subtítulo',
      nodo.innerHTML.includes('Documento descargado') && nodo.innerHTML.includes('ya está en tu equipo')) && ok;
    ok = verificar('detalla los datos del documento',
      nodo.innerHTML.includes('Carlos Mendoza') && nodo.innerHTML.includes('Licencia frontal')) && ok;
    ok = verificar('incluye la vista previa de la imagen', nodo.innerHTML.includes('ficha-doc-mini') && nodo.innerHTML.includes(PNG_1x1)) && ok;
    ok = verificar('numera los pasos a seguir',
      nodo.innerHTML.includes('ficha-pasos') && nodo.innerHTML.includes('Revisa tu carpeta')) && ok;
    ok = verificar('es accesible como diálogo', nodo.getAttribute('role') === 'dialog' && nodo.getAttribute('aria-modal') === 'true') && ok;

    // Cerrar con el botón principal debe quitar la ficha y resolver la promesa.
    nodo.querySelector('.ficha-pie .btn').onclick();
    let cerrado = false;
    pendiente.then(() => { cerrado = true; });
    await new Promise(r => setImmediate(r));
    ok = verificar('el botón principal cierra la ficha', ficha() === null && cerrado === true) && ok;

    // Abrirla dos veces seguidas no debe apilar fichas.
    contexto.mostrarFichaImpresion({ titulo: 'Primera' });
    contexto.mostrarFichaImpresion({ titulo: 'Segunda' });
    ok = verificar('no apila fichas si se abre otra encima', registro.nodos.filter(n => n.id === 'fichaImpresion').length === 1) && ok;
    ficha().querySelector('.ficha-cerrar').onclick();

    // La ficha de error se usa en lugar del alert cuando falla la impresión.
    const error = crearNavegador();
    cargarUtilidades(error.contexto);
    error.contexto.window.open = () => null;
    error.contexto.imprimirHtmlEnVentana('<html></html>', 'x');
    ok = verificar('un fallo muestra ficha de error, no alert',
      error.ficha() && /ficha-advertencia/.test(error.ficha().className) && error.registro.alertas.length === 0) && ok;
  }

  console.log(`\nResultado: ${ok ? 'impresión y descarga funcionan en ambos entornos' : 'hay fallos'}.`);
  return ok;
}

module.exports = { ejecutar };
if (require.main === module) {
  ejecutar()
    .then((ok) => process.exit(ok ? 0 : 1))
    .catch((e) => { console.error('\nFallo inesperado:', e); process.exit(1); });
}
