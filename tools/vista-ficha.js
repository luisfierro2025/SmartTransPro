// ============================================================================
// Vista previa de la ficha de información de impresión.
//
// Abre la ficha con datos de ejemplo en la interfaz real y guarda una captura
// de cada estado (éxito, advertencia, error y tema oscuro) para revisar el
// diseño sin tener que imprimir un documento de verdad.
//
//   npx electron tools/vista-ficha.js
// ============================================================================
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const os = require('os');
const path = require('path');

const raiz = path.join(__dirname, '..');
const salida = path.join(os.tmpdir(), 'ficha-impresion');
fs.mkdirSync(salida, { recursive: true });

// Miniatura de ejemplo: un SVG que imita la foto de una licencia, para que la
// vista previa de la ficha se vea como en el uso real.
const MINIATURA = 'data:image/svg+xml;base64,' + Buffer.from(`
<svg xmlns="http://www.w3.org/2000/svg" width="320" height="200" viewBox="0 0 320 200">
  <rect width="320" height="200" fill="#eef1f5"/>
  <rect x="18" y="22" width="284" height="156" rx="8" fill="#fff" stroke="#d0d5dd" stroke-width="2"/>
  <rect x="34" y="42" width="64" height="80" rx="5" fill="#dfe4ea"/>
  <circle cx="66" cy="70" r="16" fill="#b9c2cd"/>
  <path d="M40 112a26 26 0 0 1 52 0z" fill="#b9c2cd"/>
  <rect x="112" y="44" width="172" height="10" rx="5" fill="#dfe4ea"/>
  <rect x="112" y="64" width="132" height="8" rx="4" fill="#e8ecf1"/>
  <rect x="112" y="82" width="152" height="8" rx="4" fill="#e8ecf1"/>
  <rect x="34" y="138" width="90" height="8" rx="4" fill="#e8ecf1"/>
  <rect x="34" y="154" width="120" height="8" rx="4" fill="#e8ecf1"/>
  <text x="284" y="196" font-family="Arial" font-size="9" fill="#98a2b3" text-anchor="end">Ejemplo</text>
</svg>`).toString('base64');

const CASOS = {
  exito: {
    estado: 'exito',
    titulo: 'Documento descargado',
    subtitulo: 'El archivo ya está en tu equipo.',
    documentoTitulo: 'Documentos del conductor',
    campos: [
      ['Conductor', 'Carlos Mendoza'],
      ['Cédula', '001-120584-0023K'],
      ['Documento', 'Imagen Frontal de la Licencia'],
      ['Licencia', 'T-0458213']
    ],
    miniatura: MINIATURA,
    pasos: [
      'Busca el archivo en tu carpeta de descargas o en la carpeta indicada.',
      'Ábrelo para verificar que la imagen se vea completa y legible.'
    ],
    boton: 'Entendido'
  },
  advertencia: {
    estado: 'advertencia',
    titulo: 'Permite las ventanas emergentes',
    subtitulo: 'Tu navegador bloqueó la ventana de impresión, así que el documento no se pudo abrir.',
    pasos: [
      'Haz clic en el icono de bloqueo que aparece a la derecha de la barra de direcciones.',
      'Elige "Permitir ventanas emergentes" para este sitio.',
      'Vuelve a pulsar <b>Imprimir</b>.'
    ],
    boton: 'Entendido'
  },
  error: {
    estado: 'error',
    titulo: 'No se pudo generar el PDF',
    subtitulo: 'La generación de PDF solo funciona en la app de escritorio. En la nube, usa el botón "Imprimir", que abre el diálogo de impresión del navegador.',
    documentoTitulo: 'Documento a imprimir',
    campos: [
      ['Título', 'Documento de Conductor: Carnet Federación Transporte'],
      ['Detalle', 'Conductor: Carlos Mendoza · Cédula: 001-120584-0023K'],
      ['Archivo', 'Carlos-Mendoza-carnet.pdf']
    ],
    boton: 'Cerrar'
  }
};

const esperar = (ms) => new Promise(r => setTimeout(r, ms));

app.whenReady().then(async () => {
  const ventana = new BrowserWindow({
    width: 1000,
    height: 780,
    show: false,
    backgroundColor: '#f4f6f8',
    webPreferences: { contextIsolation: true, nodeIntegration: false }
  });
  await ventana.loadFile(path.join(raiz, 'src', 'renderer', 'index.html'));
  // La ventana debe estar visible: en una ventana oculta Chromium no ejecuta
  // las animaciones y la captura sale a medio fundido.
  await ventana.show();
  await esperar(900);

  const capturar = async (nombre) => {
    const imagen = await ventana.webContents.capturePage();
    const destino = path.join(salida, nombre + '.png');
    fs.writeFileSync(destino, imagen.toPNG());
    console.log('  ' + destino);
  };

  for (const [nombre, opciones] of Object.entries(CASOS)) {
    await ventana.webContents.executeJavaScript(`mostrarFichaImpresion(${JSON.stringify(opciones)}); true`);
    await esperar(450);
    await capturar(nombre);
    await ventana.webContents.executeJavaScript(`document.getElementById('fichaImpresion').remove(); true`);
  }

  // Tema oscuro: la ficha debe acompañar el cambio de tema de la aplicación.
  await ventana.webContents.executeJavaScript(`
    document.body.classList.add('dark-theme');
    mostrarFichaImpresion(${JSON.stringify(CASOS.exito)}); true
  `);
  await esperar(450);
  await capturar('exito-oscuro');

  console.log('\nCapturas en: ' + salida);
  ventana.destroy();
  app.exit(0);
});
