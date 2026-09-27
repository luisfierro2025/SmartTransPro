// Proceso principal de Electron: prepara la base de datos, registra los canales
// IPC y abre la ventana de la aplicación.
const { app, BrowserWindow, dialog } = require('electron');
const path = require('path');
const { inicializarBaseDatos, cerrarBaseDatos, obtenerRutaBaseDatos } = require('./database');
const { registrarIPC } = require('./ipc');

let ventana;

function crearVentana() {
  ventana = new BrowserWindow({
    width: 1400,
    height: 850,
    minWidth: 1100,
    minHeight: 700,
    backgroundColor: '#f4f6f8',
    webPreferences: {
      preload: path.join(__dirname, '../preload/preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    },
    show: false
  });
  ventana.loadFile(path.join(__dirname, '../renderer/index.html'));
  ventana.once('ready-to-show', () => ventana.show());
}

app.whenReady().then(() => {
  try {
    inicializarBaseDatos();
  } catch (e) {
    dialog.showErrorBox('No se pudo abrir la base de datos', `${e.message}\n\nRuta: ${obtenerRutaBaseDatos()}`);
    app.quit();
    return;
  }
  registrarIPC();
  crearVentana();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) crearVentana();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('will-quit', () => cerrarBaseDatos());
