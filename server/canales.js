// ============================================================================
// Registro unificado de canales de la aplicación.
//
// La misma lógica de negocio alimenta tres destinos:
//   - Electron   -> ipcMain.handle(canal, ...)
//   - Vercel     -> /api/<modulo>/<accion>
//   - Desarrollo -> http://localhost:3000/api/<modulo>/<accion>
//
// Para no duplicar las ~57 operaciones, se aprovechan los archivos que ya
// existen (src/main/ipc.js y src/main/operaciones.js) interceptando sus
// dependencias con require.cache:
//
//   1. 'electron'  -> un ipcMain falso que guarda los handlers en un mapa
//   2. './database' -> la implementación de PostgreSQL
//
// Así, la lógica de negocio queda en un solo lugar: si mañana agregás un campo
// a un formulario, lo cambiás una vez y funciona en los tres destinos.
// ============================================================================
const path = require('path');

const RUTA_IPC = path.join(__dirname, '..', 'src', 'main', 'ipc.js');
const RUTA_OPERACIONES = path.join(__dirname, '..', 'src', 'main', 'operaciones.js');
const RUTA_DATABASE = path.join(__dirname, '..', 'src', 'main', 'database.js');

const capturados = new Map();

// ipcMain falso: en vez de registrar en Electron, guarda el manejador.
const ipcMainFalso = {
  handle(canal, manejador) {
    capturados.set(canal, manejador);
  }
};

function inyectar(clave, exports) {
  const ruta = require.resolve(clave);
  require.cache[ruta] = { id: ruta, filename: ruta, loaded: true, exports };
}

inyectar('electron', { ipcMain: ipcMainFalso, app: { getPath: () => '/tmp' }, shell: { openPath() {} } });
inyectar(RUTA_DATABASE, require('./database-nube'));

// ipc.js registra sus canales DENTRO de la funcion registrarIPC(), asi que
// cargar el modulo no basta: hay que ejecutarla para que el ipcMain falso los capture.
const { registrarIPC } = require(RUTA_IPC);
registrarIPC();

// Por seguridad, los canales de operaciones se aseguran uno por uno.
const { operaciones } = require(RUTA_OPERACIONES);
for (const [canal, manejador] of Object.entries(operaciones)) {
  capturados.set(canal, manejador);
}

// Los manejadores de operaciones reciben (evento, datos); los de ipc.js también.
// Se normalizan a (datos) => resultado, que es lo que entiende HTTP.
function canales() {
  const mapa = {};
  for (const [canal, manejador] of capturados) {
    mapa[canal] = (datos) => manejador(null, datos);
  }
  return mapa;
}

// Canales que solo tienen sentido en la app de escritorio y no en la nube.
// Estos usan 'dialog' y 'BrowserWindow' de Electron, que el servidor no tiene:
// ejecutarlos allí reventaba con "dialog.showSaveDialog is not a function".
// En la nube la impresión y la descarga las resuelve el propio navegador
// (ver imprimirHtmlEnVentana / descargarDocumento en renderer/js/utilidades.js),
// así que aquí se responde con un mensaje claro en vez de fingir que funcionan.
const SOLO_ESCRITORIO = {
  'sistema:abrir_carpeta': () => ({
    ok: true,
    carpeta: '(la base de datos está en la nube, no en una carpeta local)'
  }),
  'reportes:pdf': () => ({
    ok: false,
    error: 'La generación de PDF solo funciona en la app de escritorio. En la nube, usa el botón "Imprimir", que abre el diálogo de impresión del navegador.'
  }),
  'archivos:guardar_imagen': () => ({
    ok: false,
    error: 'La descarga con diálogo "Guardar como" solo funciona en la app de escritorio. En la nube, el documento se guarda en la carpeta de descargas del navegador.'
  }),
  'archivos:guardar_imagenes': () => ({
    ok: false,
    error: 'La descarga a una carpeta elegida solo funciona en la app de escritorio. En la nube, los documentos se guardan en la carpeta de descargas del navegador.'
  })
};

/**
 * Ejecuta un canal por su nombre.
 * @param {string} canal  'modulo:accion' o 'modulo/accion'
 * @param {any} datos     cuerpo de la petición
 * @param {object} contexto  { usuario, ip, urlBase }
 */
async function ejecutarCanal(canal, datos, contexto = {}) {
  const nombre = String(canal).replace(/\//g, ':');
  const registro = canales();
  // SOLO_ESCRITORIO gana sobre el registro: aunque el manejador exista en
  // operaciones.js, en la nube se resuelve con la respuesta del navegador.
  const manejador = SOLO_ESCRITORIO[nombre] || registro[nombre];
  if (!manejador) {
    const error = new Error(`El canal "${nombre}" no existe.`);
    error.codigo = 'CANAL_DESCONOCIDO';
    throw error;
  }
  return manejador(datos);
}

function listarCanales() {
  return Object.keys(canales()).sort();
}

module.exports = { ejecutarCanal, listarCanales, canales };
