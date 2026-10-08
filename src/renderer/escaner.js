'use strict';

// ==========================================================================
// Lector de códigos de barras (SmartPosPro)
// ==========================================================================
// Los lectores de código de barras que se venden para el comercio (Honeywell,
// Zebra, Datalogic, Symbol...) se enumeran en Windows como teclado USB (HID)
// y "teclean" el código leído seguido de Enter. Eso es el modo *keyboard
// wedge*, y es el que usa este módulo: no hace falta driver, ni permiso, ni
// dependencia externa, y la lectura es instantánea.
//
// Criterio para distinguir una lectura de una persona escribiendo: un lector
// manda el código entero en milisegundos. Aquí se mide la ráfaga COMPLETA, con su
// media de milisegundos por tecla y su desviación: un lector es rápido y muy
// regular, una persona es más lenta e irregular. Medir la ráfaga entera, y no
// cada tecla por separado, es lo que permite que un lector inalámbrico lento
// siga contándose como lector sin declarar lector a quien teclea a pulso.
//
// La escucha tampoco se abandona por que el foco esté en un campo de texto: el
// cajero deja el cursor puesto a menudo, y si se dejara de escuchar ahí la
// lectura se perdería justo en el uso normal. Cuando la ráfaga resulta ser de
// una máquina, el campo queda como estaba antes, sin el código pegado dentro.
//
// La interfaz es deliberadamente mínima (conectar / desconectar / pitar) para
// que más adelante se pueda enchufar otra fuente de lectura -una cámara con
// ZXing, por ejemplo- llamando a `conectar` con el mismo manejador.
// ==========================================================================
(function () {
  // ===== F1: lectura por duración de la ráfaga, no por intervalo entre teclas =====
  // El criterio antiguo era "cada tecla llega antes de MAX_INTERVALO_MS". Un lector
  // USB lo cumplía de sobra, pero un inalámbrico por Bluetooth puede tardar más, y
  // entonces el búfer se vaciaba en cada tecla: no leía nada, nunca.
  //
  // Ahora se mide la ráfaga COMPLETA: la media de milisegundos por tecla y cuánto
  // bailan esos valores. Un lector es rápido y muy regular; una persona es más
  // lenta y además irregular (acelera, duda, se equivoca y corrige). Pedir las dos
  // cosas a la vez evita los dos errores: declarar lector a quien escribe, y
  // declarar humano a un lector lento pero bienintencionado.
  // El listón es generoso a propósito. El criterio viejo (90 ms por tecla) era lo
// bastante estricto como para que un lector Bluetooth mediocre no llegara nunca
  // al final. Con la desviación como segunda condición, se puede subir la media
  // sin abrir la puerta a la escritura humana: lo que separa a un lector de una
  // persona no es solo la velocidad, es que la máquina es REGULAR.
  const MAX_PROMEDIO_MS = 220;   // media máxima por tecla para considerarlo lector
  const MAX_DESVIACION_MS = 60;  // salto máximo entre teclas: lo regular es del lector
  // Con el foco dentro de un campo de texto el listón es más alto: ahí el propio
  // campo ya resuelve el Enter tecleado a mano (renderer.js), así que sólo se
  // acepta lo que es claramente una máquina. Nadie teclea a 55 ms sostenidos.
  const MAX_PROMEDIO_ESTRICTO_MS = 55;
  const MAX_DESVIACION_ESTRICTA_MS = 40;
  // Dos teclas separadas por más de esto ya no son la misma ráfaga. Va muy por
  // encima del promedio porque solo marca "empezó algo nuevo", no "es un lector":
  // un lector de 120 ms por tecla sigue formando su ráfaga sin problema.
  const PAUSA_ENTRE_RAFAGAS_MS = 700;
  // Muchos lectores vienen configurados SIN sufijo Enter. Si tras este tiempo no
  // llegó ninguna tecla más, el código ya se leyó completo. Tiene que quedar por
  // debajo de la pausa entre ráfagas para que el lector lento gane siempre.
  const ESPERA_SIN_SUFIJO_MS = 400;
  // Por debajo de 4 caracteres no es un código de barras, es ruido.
  const MIN_CARACTERES = 4;
  const MAX_CARACTERES = 64;

  let buffer = '';
  let ultimaTecla = 0;
  let intervalos = [];
  let temporizador = null;
  let manejador = null;
  // Estado del campo de texto donde empezó la ráfaga, para poder deshacer lo
  // que el lector escribió dentro (F2).
  let campoEnRafaga = null;
  let valorEnRafaga = '';

  /**
   * El campo de texto que tiene el foco, o null si el foco está en otro lado.
   * Antes esto era una pregunta de sí o no y devolvía `true` para dejar de
   * escuchar; ahora hace falta saber CUÁL es, para poder restaurarlo.
   */
  function campoDeEscritura() {
    const el = document.activeElement;
    if (!el) return null;
    if (el.isContentEditable) return el;
    const etiqueta = el.tagName;
    if (etiqueta === 'TEXTAREA') return el;
    if (etiqueta === 'SELECT') return null;
    if (etiqueta !== 'INPUT') return null;
    // Los input que no son de texto (checkbox, botón, color...) nunca son foco
    // de escritura, así que no bloquean la lectura.
    const tipo = (el.getAttribute('type') || 'text').toLowerCase();
    return ['text', 'search', 'tel', 'url', 'password', 'number', ''].indexOf(tipo) !== -1 ? el : null;
  }

  /**
   * ¿Lo acumulado hasta ahora fue un lector o una persona tecleando?
   *
   * Se decide con la media y la desviación de los intervalos, y no tecla por
   * tecla: es lo que permite que un lector inalámbrico lento cuente como lector
   * sin que una escritura a pulso cuente como escaneo.
   *
   * `estricto` se usa cuando el foco está dentro de un campo de texto. Ahí la
   * certeza tiene que ser mayor, porque el propio campo ya sabe manejar un Enter
   * escrito a mano: si también lo tomáramos como lectura, el producto entraría
   * dos veces al carrito.
   */
  function esRafagaDeLector(estricto) {
    if (buffer.length < MIN_CARACTERES) return false;
    if (!intervalos.length) return true; // llegó de golpe, no hay nada que promediar
    const media = intervalos.reduce(function (a, b) { return a + b; }, 0) / intervalos.length;
    if (media > (estricto ? MAX_PROMEDIO_ESTRICTO_MS : MAX_PROMEDIO_MS)) return false;
    let suma = 0;
    intervalos.forEach(function (ms) { suma += Math.pow(ms - media, 2); });
    const desviacion = Math.sqrt(suma / intervalos.length);
    return desviacion <= (estricto ? MAX_DESVIACION_ESTRICTA_MS : MAX_DESVIACION_MS);
  }

  /** F2: devuelve el campo a como estaba antes de que el lector escribiera. */
  function restaurarCampo() {
    const campo = campoEnRafaga;
    campoEnRafaga = null;
    if (!campo || !campo.isConnected) return;
    // `value` no existe en un contenteditable: ahí se borra el texto suelto.
    if ('value' in campo) campo.value = valorEnRafaga;
    else if (campo.textContent !== undefined) campo.textContent = valorEnRafaga;
  }

  function limpiar() {
    buffer = '';
    ultimaTecla = 0;
    intervalos = [];
    campoEnRafaga = null;
    valorEnRafaga = '';
    if (temporizador) {
      clearTimeout(temporizador);
      temporizador = null;
    }
  }

  function emitir(codigo) {
    limpiar();
    if (!manejador) return;
    manejador(codigo);
  }

  function programarEspera() {
    if (temporizador) clearTimeout(temporizador);
    temporizador = setTimeout(function () {
      // Lector sin sufijo Enter: se decide con la misma media y desviación que
      // serviría con Enter, y no solo por la cantidad de caracteres.
      if (esRafagaDeLector(!!campoEnRafaga)) {
        restaurarCampo();
        emitir(buffer);
      } else {
        limpiar();
      }
    }, ESPERA_SIN_SUFIJO_MS);
  }

  function alPresionarTecla(evento) {
    if (!manejador) return;
    if (evento.ctrlKey || evento.altKey || evento.metaKey) return;

    const ahora = Date.now();
    const campo = campoDeEscritura();

    if (evento.key === 'Enter') {
      // `campoEnRafaga` a null significa que la ráfaga empezó con el foco fuera
      // de un campo: ahí el listón es el normal.
      if (esRafagaDeLector(!!campoEnRafaga)) {
        evento.preventDefault();
        restaurarCampo();
        emitir(buffer);
      } else {
        limpiar();
      }
      return;
    }

    // Solo un carácter imprimible, de un solo code point: algunos lectores con
    // key rollover ("Shift" pulsado junto a otra tecla) envían "undefined" o
    // "Unidentified" como key, y por eso se filtra por longitud.
    if (evento.key.length !== 1) return;

    // F1: la pausa larga es lo único que corta la ráfaga. Ya no se descarta el
    // búfer por que una tecla tarde más de 90 ms: por dentro del mismo código un
    // lector inalámbrico puede ir más lento que eso y aun así es una sola lectura.
    if (buffer.length === 0 || ahora - ultimaTecla > PAUSA_ENTRE_RAFAGAS_MS) {
      // Ráfaga nueva. Se recuerda el campo y lo que tenía, para poder devolverlo
      // a como estaba si al final resulta que era un lector.
      intervalos = [];
      // F2: si el foco está en un campo de texto se sigue escuchando. Antes aquí
      // se abandonaba la lectura entera y el escaneo se perdía en cuanto el cajero
      // dejaba el cursor puesto, que es lo que pasa tras escribir o elegir cliente.
      campoEnRafaga = campo;
      valorEnRafaga = campo && 'value' in campo ? campo.value : '';
    } else {
      intervalos.push(ahora - ultimaTecla);
    }
    ultimaTecla = ahora;

    if (buffer.length >= MAX_CARACTERES) buffer = '';
    buffer += evento.key;
    programarEspera();
  }

  // --- Aviso sonoro: Web Audio, sin archivos ni dependencias --------------
  let contexto = null;
  function pitar(tipo) {
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      if (!contexto) contexto = new AC();
      if (contexto.state === 'suspended') contexto.resume();
      const ahora = contexto.currentTime;
      const notas = tipo === 'error' ? [420, 300] : tipo === 'aviso' ? [760] : [1250];
      notas.forEach(function (hz, i) {
        const osc = contexto.createOscillator();
        const vol = contexto.createGain();
        osc.type = 'sine';
        osc.frequency.value = hz;
        const inicio = ahora + i * 0.11;
        vol.gain.setValueAtTime(0.0001, inicio);
        vol.gain.exponentialRampToValueAtTime(0.12, inicio + 0.01);
        vol.gain.exponentialRampToValueAtTime(0.0001, inicio + 0.09);
        osc.connect(vol).connect(contexto.destination);
        osc.start(inicio);
        osc.stop(inicio + 0.1);
      });
    } catch {
      // Sin audio disponible (política del sistema): la lectura sigue igual.
    }
  }

  window.escaner = {
    /** Registra el manejador que recibe cada código leído y activa la escucha. */
    conectar: function (fn) {
      manejador = fn;
      limpiar();
      if (manejador) document.addEventListener('keydown', alPresionarTecla, true);
    },
    desconectar: function () {
      document.removeEventListener('keydown', alPresionarTecla, true);
      manejador = null;
      limpiar();
    },
    pitar: pitar,
    activo: function () { return !!manejador; }
  };
})();
