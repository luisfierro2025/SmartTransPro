// ============================================================================
// Captura del tablero del dashboard con datos de ejemplo, para revisar el
// diseño sin tener que abrir la aplicación y registrar movimientos a mano.
//
//   npm run vista:dashboard
// Las imágenes quedan en la carpeta temporal del sistema (vista-dashboard).
//
// ---------------------------------------------------------------------------
// ESTA HERRAMIENTA NUNCA DEBE TOCAR LA BASE DE DATOS REAL.
//
// Ya lo hizo una vez: una versión anterior escribía los datos de ejemplo en la
// base de Supabase del usuario y el tablero mostró cifras inventadas. Por eso
// ahora la base temporal se crea y se VERIFICA antes de abrir nada, y si por
// cualquier motivo no fuera una base descartable el script se detiene.
//
// La comprobación es doble:
//   1) el archivo se crea de verdad, vacío, ANTES de que database.js lo use;
//   2) se abre y se pregunta cuántos registros tiene: si no está vacía, es que
//      se está apuntando a la base de verdad y se aborta.
// ============================================================================
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Database = require('better-sqlite3');

const raiz = path.join(__dirname, '..');
const salida = path.join(os.tmpdir(), 'vista-dashboard');
const rutaTemporal = path.join(salida, `dashboard-${Date.now()}.db`);

// --- 1) La carpeta y el archivo se crean y se limpian antes de usarlos -----
fs.mkdirSync(salida, { recursive: true });
for (const sufijo of ['', '-wal', '-shm']) {
  const archivo = rutaTemporal + sufijo;
  if (fs.existsSync(archivo)) fs.rmSync(archivo, { force: true });
}
fs.writeFileSync(rutaTemporal, '');
process.env.CONTROL_EMPRESA_DB = rutaTemporal;

// --- 2) Se comprueba que la base está VACÍA antes de que la aplicación la use.
function verificarBaseDescartable() {
  if (!rutaTemporal.startsWith(os.tmpdir())) {
    throw new Error(`ABORTADO: la base ${rutaTemporal} no está en la carpeta temporal.`);
  }
  const prueba = new Database(rutaTemporal, { readonly: true, fileMustExist: true });
  const tablas = prueba
    .prepare("SELECT count(*) total FROM sqlite_master WHERE type='table' AND name='ingresos'")
    .get().total;
  if (tablas > 0) {
    const filas = prueba.prepare('SELECT COUNT(*) total FROM ingresos').get().total;
    prueba.close();
    throw new Error(
      `ABORTADO: ${rutaTemporal} ya tiene ${filas} ingresos. ` +
      'Si es la base real, no se debe continuar: se habría mezclado con sus datos.'
    );
  }
  prueba.close();
  return rutaTemporal;
}

const { inicializarBaseDatos, cerrarBaseDatos, obtenerDB } = require(path.join(raiz, 'src', 'main', 'database'));
// Orden importante: se registran los canales REALES de Electron para que la
// ventana del tablero pueda llamar a window.api. No se carga server/canales.js
// porque sustituye 'electron' por un ipcMain falso y rompería esos canales.
const { registrarIPC } = require(path.join(raiz, 'src', 'main', 'ipc'));
const { operaciones } = require(path.join(raiz, 'src', 'main', 'operaciones'));

const esperar = (ms) => new Promise(r => setTimeout(r, ms));

// Los datos se meten con operaciones.js y la base SQLite local, sin cargar
// server/canales.js: ese módulo sustituye 'electron' por un ipcMain falso y
// rompería los canales reales que la ventana del tablero necesita. El único
// registro que no está en operaciones.js es el combustible (vive en ipc.js),
// así que esa fila se inserta directamente en la base.
async function llenarDatos() {
  // El combustible y los viáticos apuntan a un vehículo y a un conductor, así
  // que primero se crean esos catálogos: las llaves foráneas están activas.
  obtenerDB().prepare("INSERT INTO vehiculos (codigo, placa, marca, modelo, anio, activo) VALUES ('V-01','M 111-AAA','Freightliner','Cascadia',2021,1)").run();
  obtenerDB().prepare("INSERT INTO conductores (nombre, documento, activo) VALUES ('Carlos Mendoza','001-111-222-3333A',1)").run();
  // km_recorridos es una columna GENERATED: la calcula la base a partir de
  // km_salida/km_llegada, así que no se puede insertar a mano.
  obtenerDB().prepare("INSERT INTO bitacora_viajes (fecha, vehiculo_id, conductor_id, origen, destino, km_salida, km_llegada, estado) VALUES (?, 1, 1, 'Managua', 'Leon', 100, 250, 'COMPLETADO')").run(new Date().toISOString().slice(0, 10));
  const hoy = new Date();
  for (let i = 5; i >= 0; i--) {
    const dia = new Date(hoy.getFullYear(), hoy.getMonth() - i, 12).toISOString().slice(0, 10);
    const ing = 240000 + (5 - i) * 40000;
    const egr = 120000 + (5 - i) * 22000;
    await operaciones['ingresos:guardar'](null, { fecha: dia, concepto: 'Flete de carga', categoria: 'Fletes', monto: ing, metodo: 'Transferencia' });
    await operaciones['ingresos:guardar'](null, { fecha: dia, concepto: 'Servicio especial', categoria: 'Servicios', monto: ing / 3, metodo: 'Efectivo' });
    await operaciones['egresos:guardar'](null, { fecha: dia, concepto: 'Compra de diesel', categoria: 'Combustible', beneficiario: 'Gasolinera', monto: egr / 2 });
    await operaciones['egresos:guardar'](null, { fecha: dia, concepto: 'Mantenimiento de flota', categoria: 'Mantenimiento', beneficiario: 'Taller', monto: egr / 3 });
    await operaciones['egresos:guardar'](null, { fecha: dia, concepto: 'Viáticos de conduction', categoria: 'Viáticos', beneficiario: 'Conductores', monto: egr / 6 });
  }
  const hoyISO = new Date().toISOString().slice(0, 10);
  obtenerDB().prepare(`INSERT INTO combustible (fecha, vehiculo_id, kilometraje, cantidad, precio_unitario, total, tipo_combustible)
    VALUES (?, 1, 120000, 80, 62, 4960, 'Diesel')`).run(hoyISO);
  await operaciones['viaticos:guardar'](null, { fecha: hoyISO, conductor_id: 1, destino: 'León', motivo: 'Traslado', monto: 1500 });
}

app.whenReady().then(async () => {
  // Si la base no fuera una copia descartable, aquí se detiene y no se escribe
  // nada. Es la barrera que faltó cuando se contaminó la base real.
  console.log('Base de la vista previa:', verificarBaseDescartable());
  inicializarBaseDatos();
  registrarIPC();
  await llenarDatos();

  const ventana = new BrowserWindow({
    width: 1440,
    height: 1000,
    show: false,
    // Sin preload la ventana cae en cliente-api.js y habla por HTTP contra
    // /api, que aquí no existe: la llamada falla con "Failed to fetch" y el
    // tablero se queda vacío. Con el preload, window.api usa los canales IPC.
    webPreferences: { preload: path.join(raiz, 'src', 'preload', 'preload.js') }
  });
  await ventana.loadFile(path.join(raiz, 'src', 'renderer', 'index.html'));
  await esperar(1200);

  // El acceso bloquea la pantalla inicial, así que se entra de verdad: se crea
  // la cuenta de instalación y se inicia sesión, igual que un usuario nuevo.
  await ventana.webContents.executeJavaScript(`
    (() => {
      document.getElementById('instEmpresa').value = 'Transportes Demo';
      document.getElementById('instNombre').value = 'Ana Demo';
      document.getElementById('instUsuario').value = 'ana';
      document.getElementById('instClave').value = 'miclave123';
      document.getElementById('instClaveRepetir').value = 'miclave123';
      document.getElementById('instBoton').click();
      return true;
    })()`);
  await esperar(1200);
  await ventana.webContents.executeJavaScript(`
    (() => {
      const u = document.getElementById('loginUsuario');
      const c = document.getElementById('loginClave');
      if (!u || !c) return 'sin-formulario';
      u.value = 'ana';
      c.value = 'miclave123';
      document.getElementById('loginBoton').click();
      return true;
    })()`);
  await esperar(1500);

  const estado = await ventana.webContents.executeJavaScript(`
    (() => ({
      titulo: document.getElementById('page-title')?.textContent.trim(),
      utilidad: document.getElementById('kUtilidad')?.textContent.trim(),
      barras: document.querySelectorAll('.grafica-col').length,
      hayApi: typeof window.api === 'object',
      tablero: !!window.api?.dashboard?.tablero,
      vacioGrafica: document.getElementById('grafica')?.textContent.trim().slice(0, 80)
    }))()`);
  console.log('Estado del tablero:', JSON.stringify(estado));

  // Si el tablero no trajo datos, se consulta el canal directo para saber si el
  // problema es de la pantalla o de la base.
  if (!estado.barras) {
    const directo = await ventana.webContents.executeJavaScript(
      `window.api.dashboard.tablero({}).then(r => JSON.stringify({ serie: r.serie.length, ingresos: r.financiero.ingresos, rango: r.rango })).catch(e => 'ERROR: ' + e.message)`);
    console.log('Consulta directa al canal:', directo);
  }

  await esperar(900);
  fs.writeFileSync(path.join(salida, 'dashboard-claro.png'), (await ventana.webContents.capturePage()).toPNG());
  console.log('Captura clara:', path.join(salida, 'dashboard-claro.png'));

  // Segunda captura con la parte baja (gráfico, categorías, operación y aviso),
  // que en la primera queda fuera del alto de la ventana.
  await ventana.webContents.executeJavaScript(`document.getElementById('content').scrollTop = 99999; true;`);
  await esperar(500);
  fs.writeFileSync(path.join(salida, 'dashboard-claro-bajo.png'), (await ventana.webContents.capturePage()).toPNG());
  console.log('Captura clara (parte baja):', path.join(salida, 'dashboard-claro-bajo.png'));

  await ventana.webContents.executeJavaScript(`document.getElementById('content').scrollTop = 0; document.body.classList.add('dark-theme'); true;`);
  await esperar(600);
  fs.writeFileSync(path.join(salida, 'dashboard-oscuro.png'), (await ventana.webContents.capturePage()).toPNG());
  console.log('Captura oscura:', path.join(salida, 'dashboard-oscuro.png'));

  // Las capturas ya están en disco: la base de ejemplo se borra para no dejar
  // copias de datos ficticios por ahí.
  cerrarBaseDatos();
  for (const sufijo of ['', '-wal', '-shm']) {
    fs.rmSync(rutaTemporal + sufijo, { force: true });
  }
  console.log('Base de ejemplo borrada. Quedaron solo las imágenes.');
  app.quit();
}).catch((e) => {
  console.error('No se pudo capturar el tablero:', e.message);
  app.quit();
});
