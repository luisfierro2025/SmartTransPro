// Ejecuta la prueba de la base de datos con el binario de Electron.
//
// better-sqlite3 está compilado para el ABI de Electron (NODE_MODULE_VERSION 139),
// por eso la prueba no puede ejecutarse con "node" directamente: este envoltorio
// lanza Electron en modo Node (ELECTRON_RUN_AS_NODE) y reenvía la salida.
//
// Uso:  npm run test:db
const { spawnSync } = require('child_process');
const path = require('path');

const electron = require('electron'); // devuelve la ruta al ejecutable de Electron
const script = path.join(__dirname, 'prueba-db.js');

const resultado = spawnSync(electron, [script], {
  stdio: 'inherit',
  env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }
});

if (resultado.error) {
  console.error('No se pudo iniciar Electron:', resultado.error.message);
  process.exit(1);
}

process.exit(resultado.status === null ? 1 : resultado.status);
