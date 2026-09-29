// ============================================================================
// Servidor de desarrollo: reproduce en tu máquina lo que hará Vercel.
//
//   npm run dev:nube   ->   http://localhost:3000
//
// Sirve la interfaz (src/renderer) y la API (/api/...) con el MISMO código que
// se despliega en Vercel. Si no hay credenciales de Supabase, arranca con un
// PostgreSQL en memoria (pg-mem) para poder trabajar sin conexión.
// ============================================================================
const http = require('http');
const fs = require('fs');
const path = require('path');

const RAIZ = path.join(__dirname, '..');

// Lee el archivo .env si existe (Node 20.6+). Debe ocurrir ANTES de mirar
// DATABASE_URL, porque de ella depende arrancar contra Supabase o en memoria.
const rutaEnv = path.join(RAIZ, '.env');
if (fs.existsSync(rutaEnv)) {
  try {
    process.loadEnvFile(rutaEnv);
    console.log('  Configuración cargada desde .env');
  } catch (e) {
    console.warn('  No se pudo leer el archivo .env:', e.message);
  }
}

const PUERTO = Number(process.env.PORT) || 3000;
const SIN_BASE = !process.env.DATABASE_URL;

const TIPOS = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon'
};

function responderJson(res, codigo, cuerpo) {
  const texto = JSON.stringify(cuerpo);
  res.writeHead(codigo, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(texto)
  });
  res.end(texto);
}

function leerCuerpo(req) {
  return new Promise((resolve, reject) => {
    let datos = '';
    req.on('data', (trozo) => {
      datos += trozo;
      if (datos.length > 2 * 1024 * 1024) reject(new Error('Cuerpo demasiado grande'));
    });
    req.on('end', () => {
      if (!datos) return resolve({});
      try { resolve(JSON.parse(datos)); } catch (e) { reject(new Error('JSON inválido')); }
    });
    req.on('error', reject);
  });
}

// Sirve un archivo estático de la interfaz.
function servirEstatico(req, res) {
  const urlObj = new URL(req.url, 'http://localhost');
  let ruta = decodeURIComponent(urlObj.pathname);
  if (ruta === '/') ruta = '/index.html';
  const destino = path.join(RAIZ, 'src', 'renderer', ruta);
  // Nunca salir de la carpeta de la interfaz.
  if (!destino.startsWith(path.join(RAIZ, 'src', 'renderer'))) {
    res.writeHead(403).end('Acceso denegado');
    return;
  }
  fs.readFile(destino, (error, contenido) => {
    if (error) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('No encontrado: ' + ruta);
      return;
    }
    res.writeHead(200, { 'Content-Type': TIPOS[path.extname(destino)] || 'application/octet-stream' });
    res.end(contenido);
  });
}

// Prepara una base de datos en memoria cuando no hay Supabase configurado.
const { iniciarMemoria } = require('./iniciar-memoria');

async function main() {
  console.log('\n=== SmartTransPro - entorno web ===\n');

  if (SIN_BASE) {
    console.log('  Base de datos : PostgreSQL EN MEMORIA (pg-mem)');
    console.log('  Nota          : no hay DATABASE_URL configurado, los datos se pierden al cerrar.');
    console.log('                  Para trabajar con Supabase, copia .env.example a .env y pega tus credenciales.\n');
    await iniciarMemoria();
  } else {
    console.log('  Base de datos : Supabase (PostgreSQL)');
    // Verifica (y agrega si falta) lo que aportan las migraciones, por ejemplo
    // viaticos.conductor_id / viaticos.viaje_id. Así una base desactualizada no
    // rompe la interfaz con "column ... does not exist".
    const { inicializarBaseDatos } = require('./database-nube');
    await inicializarBaseDatos();
    const { restaurarRespaldoInicial } = require('./restaurar-respaldo-inicial');
    const recuperacion = await restaurarRespaldoInicial();
    if (recuperacion.restaurado) console.log(`  Recuperación   : ${recuperacion.alcance}\n`);
    console.log('  Esquema       : verificado contra supabase/migrations\n');
  }

  // Se cargan los canales solo después de resolver la base de datos.
  const { ejecutarCanal, listarCanales } = require('./canales');
  const { cargarDatosEjemplo } = require('./database-nube');
  if (SIN_BASE) {
    const demo = await cargarDatosEjemplo();
    console.log(`  Datos de ejemplo cargados: ${JSON.stringify(demo.insertados)}\n`);
  }
  console.log(`  Canales disponibles: ${listarCanales().length}\n`);

  const servidor = http.createServer(async (req, res) => {
    const urlObj = new URL(req.url, 'http://localhost');
    const ruta = urlObj.pathname;
    if (!ruta.startsWith('/api/')) return servirEstatico(req, res);

    const canal = ruta.replace(/^\/api\/?/, '').replace(/\/+$/, '');
    try {
      const cuerpo = ['POST', 'PUT', 'PATCH'].includes(req.method) ? await leerCuerpo(req) : {};
      const parametros = new URL(req.url, 'http://x').searchParams;
      // Los canales "eliminar" reciben el identificador suelto (un número),
      // no un objeto: en ese caso se envía tal cual.
      const datos = cuerpo && typeof cuerpo === 'object' && !Array.isArray(cuerpo)
        ? { ...Object.fromEntries(parametros), ...cuerpo }
        : cuerpo;
      const resultado = await ejecutarCanal(canal, datos, { ip: req.socket.remoteAddress, urlBase: ruta });
      responderJson(res, 200, resultado === undefined ? { ok: true } : resultado);
    } catch (error) {
      console.error(`  [API] ${canal}:`, error.code ? `[${error.code}] ${error.message}` : error.message);
      responderJson(res, 500, { error: error.message, canal });
    }
  });

     const HOST = process.env.HOST || '0.0.0.0';
  servidor.listen(PUERTO, HOST, () => {
    console.log(`  >> http://${HOST}:${PUERTO}\n`);
  });
}

main().catch((e) => {
  console.error('No se pudo iniciar el servidor:', e);
  process.exit(1);
});
