// ============================================================================
// Sesión, acceso y pantalla de login.
//
// Se carga ANTES de app.js y define:
//   - mostrarLogin / ocultarLogin  : la pantalla de acceso, que tapa la app
//   - iniciarSesion / cerrarSesion : el intercambio con la base de datos
//   - usuarioActual / puedeVerModulo: el estado que consulta el resto de la app
//
// El token viaja del servidor a la interfaz y se guarda en localStorage para no
// pedir la contraseña en cada apertura. Quien tenga acceso al almacenamiento del
// navegador puede leerlo, así que el servidor lo valida siempre: el token es una
// credencial de sesión, no una llave maestra.
// ============================================================================
const CLAVE_TOKEN = 'control-empresa-sesion';

// Módulos que cada rol puede abrir. Se replican aquí (y en main/seguridad.js)
// para que la interfaz oculte lo que no corresponde, sin esperar al servidor.
const MODULOS_POR_ROL = {
  ADMIN: ['dashboard', 'bitacora', 'flota', 'clientes', 'planilla', 'ingresos', 'egresos', 'reportes', 'configuracion', 'usuarios'],
  OPERADOR: ['dashboard', 'bitacora', 'flota', 'clientes', 'planilla', 'ingresos', 'egresos', 'reportes', 'configuracion'],
  CONSULTA: ['dashboard', 'bitacora', 'flota', 'clientes', 'ingresos', 'egresos', 'reportes']
};

const ETIQUETA_ROL = { ADMIN: 'Administrador', OPERADOR: 'Operador', CONSULTA: 'Consulta' };

let sesion = null; // { token, usuario }

// ------------------------------------------------------------------ estado

function usuarioActual() {
  return sesion ? sesion.usuario : null;
}

function tokenActual() {
  return sesion ? sesion.token : null;
}

function esAdmin() {
  const u = usuarioActual();
  return !!u && u.rol === 'ADMIN';
}

/** ¿La sesión actual tiene permiso para abrir este módulo? */
function puedeVerModulo(modulo) {
  const u = usuarioActual();
  if (!u) return false;
  return (MODULOS_POR_ROL[u.rol] || []).includes(String(modulo));
}

function guardarTokenLocal(token) {
  try {
    if (token) localStorage.setItem(CLAVE_TOKEN, token);
    else localStorage.removeItem(CLAVE_TOKEN);
  } catch (e) {
    // Modo privado del navegador: la sesión durará lo que dure la ventana.
    console.warn('No se pudo guardar la sesión en este equipo:', e.message);
  }
}

function leerTokenLocal() {
  try {
    return localStorage.getItem(CLAVE_TOKEN);
  } catch (e) {
    return null;
  }
}

// Estado "verificando...": el botón se bloquea y muestra un indicador giratorio,
// para que el usuario sepa que la espera es del sistema y no un fallo.
function botonOcupado(boton, ocupado, textoOcupado, textoNormal) {
  if (!boton) return;
  if (ocupado) {
    boton.dataset.texto = boton.querySelector('.acceso-boton-texto')
      ? boton.querySelector('.acceso-boton-texto').textContent
      : boton.textContent;
    boton.disabled = true;
    boton.classList.add('cargando');
    if (boton.querySelector('.acceso-boton-texto')) {
      boton.querySelector('.acceso-boton-texto').textContent = textoOcupado;
    } else {
      boton.textContent = textoOcupado;
    }
    return;
  }
  boton.disabled = false;
  boton.classList.remove('cargando');
  const destino = boton.querySelector('.acceso-boton-texto');
  if (destino) destino.textContent = textoNormal || boton.dataset.texto || '';
  else boton.textContent = textoNormal || boton.dataset.texto || '';
}

// ---------------------------------------------------------------- instalación

// La primera vez la base no tiene ninguna cuenta: en vez del login se muestra
// este formulario para que el usuario elija su usuario y su contraseña. El
// sistema no trae credenciales de fábrica, así que no hay nada que adivinar.
function mostrarInstalacion() {
  const pantalla = document.getElementById('instalacionPantalla');
  if (!pantalla) return;
  pantalla.hidden = false;
  pantalla.classList.add('visible');
  setTimeout(() => {
    const campo = document.getElementById('instEmpresa');
    if (campo) campo.focus();
  }, 60);
}

function ocultarInstalacion() {
  const pantalla = document.getElementById('instalacionPantalla');
  if (!pantalla) return;
  pantalla.classList.remove('visible');
  pantalla.hidden = true;
}

async function enviarInstalacion() {
  const empresa = document.getElementById('instEmpresa').value.trim();
  const nombre = document.getElementById('instNombre').value.trim();
  const usuario = document.getElementById('instUsuario').value.trim();
  const clave = document.getElementById('instClave').value;
  const repetir = document.getElementById('instClaveRepetir').value;
  const boton = document.getElementById('instBoton');
  const error = document.getElementById('instError');

  const fallo = (mensaje) => {
    if (!error) return false;
    error.textContent = mensaje;
    // Se usa "hidden" y no style.display: el estilo de ".acceso-error" oculta el
    // recuadro con [hidden], y asignar display lo pisaría y lo dejaría siempre visible.
    error.hidden = false;
    error.classList.remove('sacudir');
    void error.offsetWidth; // reinicia la animación
    error.classList.add('sacudir');
    return false;
  };

  if (!nombre) return fallo('Escriba su nombre completo.');
  if (!usuario) return fallo('Escriba un nombre de usuario.');
  if (!clave) return fallo('Escriba una contraseña.');
  if (clave.length < 6) return fallo('La contraseña debe tener al menos 6 caracteres.');
  if (clave !== repetir) return fallo('La contraseña no coincide con su repetición.');

  botonOcupado(boton, true, 'Creando cuenta...', 'Crear cuenta y entrar');
  error.hidden = true;

  try {
    const r = await window.api.usuarios.instalar({
      nombre_empresa: empresa,
      nombre,
      usuario,
      clave
    });
    sesion = { token: r.token, usuario: r.usuario };
    guardarTokenLocal(r.token);
    // Las contraseñas no quedan en el formulario (ni en el historial del DOM).
    document.getElementById('instClave').value = '';
    document.getElementById('instClaveRepetir').value = '';
    ocultarInstalacion();
    alEntrarAlSistema();
    return true;
  } catch (e) {
    console.warn('No se pudo completar la instalación:', e.message);
    // Igual que en el login, al usuario se le muestra el motivo real y no el
    // envoltorio técnico de Electron ("Error invoking remote method...").
    return fallo(mensajeDeCanal(e) || 'No se pudo crear la cuenta. Revise su conexión.');
  } finally {
    botonOcupado(boton, false, '', 'Crear cuenta y entrar');
  }
}

// Decide qué pantalla mostrar al abrir: instalación (no hay cuentas), login
// normal, o entrada directa si el token guardado sigue siendo válido.
async function iniciarAcceso() {
  let estado;
  try {
    estado = await window.api.usuarios.estadoInstalacion();
  } catch (e) {
    // Si ni siquiera se puede consultar, se muestra el login: el mensaje de
    // error del canal explica mejor qué pasa que un formulario en blanco.
    console.error('No se pudo verificar el estado de la instalación:', e);
    mostrarLogin('No se pudo conectar con la base de datos. Revise e intente de nuevo.');
    return;
  }
  if (!estado || !estado.instalado) {
    mostrarInstalacion();
    return;
  }
  await restaurarSesion();
}

// ------------------------------------------------------------------ login

function mostrarLogin(mensaje, tipo = 'error') {
  const pantalla = document.getElementById('loginPantalla');
  if (!pantalla) return;
  pantalla.hidden = false;
  pantalla.classList.add('visible');
  const aviso = document.getElementById('loginError');
  if (aviso) {
    aviso.textContent = mensaje || '';
    aviso.hidden = !mensaje;
    // Un mensaje informativo ("sesión cerrada") no debe verse en rojo como si
    // fuera un fallo: por eso cambia de color y de icono según el tipo.
    aviso.classList.toggle('es-informativo', tipo === 'info');
  }
  // El foco arranca en el usuario: si la sesión venció, se teclea la clave.
  setTimeout(() => {
    const campo = document.getElementById('loginUsuario');
    if (campo) campo.focus();
  }, 60);
}

function ocultarLogin() {
  const pantalla = document.getElementById('loginPantalla');
  if (!pantalla) return;
  pantalla.classList.remove('visible');
  pantalla.hidden = true;
}

// En una base recién creada la única cuenta la crea quien instala, escribiendo
// sus propias credenciales: no hay contraseña de fábrica que recordar ni que
// adivinar.

// Al entrar (o al recuperar la sesión) hay que cargar el módulo inicial: la
// pantalla de acceso tapaba la aplicación y #content seguía vacío. Se hace
// desde aquí y no desde app.js porque app.js solo arranca una vez, y tras un
// "Cerrar sesión" hay que volver a montar todo.
async function alEntrarAlSistema() {
  actualizarSesionEnInterfaz();
  // Nombre de la empresa y moneda: se leen de la tabla "configuracion".
  aplicarConfiguracionEmpresa();
  // Solo se avisa si un ADMIN restablecer la contraseña de esta cuenta: la
  // cuenta creada en la instalación ya tiene la clave que eligió su usuario.
  const u = usuarioActual();
  if (u && u.debe_cambiar_clave) {
    const avisar = await confirmarAccion({
      titulo: 'Cambie su contraseña',
      mensaje: 'Un administrador restablecerió su contraseña. Por seguridad, conviene cambiarla ahora.',
      botonOk: 'Cambiar contraseña',
      botonCancelar: 'Ahora no'
    });
    if (avisar) {
      abrirModalCambiarClave();
      return;
    }
  }
  abrir('dashboard');
}

async function enviarLogin() {
  const usuario = document.getElementById('loginUsuario').value.trim();
  const clave = document.getElementById('loginClave').value;
  const boton = document.getElementById('loginBoton');
  const error = document.getElementById('loginError');

  const fallo = (mensaje) => {
    if (!error) return false;
    error.textContent = mensaje;
    error.hidden = false;
    // Un fallo siempre se muestra en rojo: si antes había un aviso informativo
    // ("sesión cerrada"), hay que quitarle ese estilo o parecería un error suave.
    error.classList.remove('es-informativo');
    // El aviso tiembla una vez: refuerza el rechazo sin depender solo del color,
    // que distraería de la lectura.
    error.classList.remove('sacudir');
    void error.offsetWidth; // reinicia la animación
    error.classList.add('sacudir');
    return false;
  };

  if (!usuario) return fallo('Escriba su nombre de usuario.');
  if (!clave) return fallo('Escriba su contraseña.');

  botonOcupado(boton, true, 'Verificando...', 'Entrar');
  error.hidden = true;

  try {
    const r = await window.api.usuarios.autenticar({ usuario, clave });
    sesion = { token: r.token, usuario: r.usuario };
    guardarTokenLocal(r.token);
    // La contraseña no se queda en el formulario (ni en el historial del DOM).
    document.getElementById('loginClave').value = '';
    ocultarLogin();
    alEntrarAlSistema();
    return true;
  } catch (e) {
    console.warn('No se pudo iniciar sesión:', e.message);
    // Electron envuelve el fallo del canal en un error técnico
    // ("Error invoking remote method 'usuarios:autenticar': ..."). Ese texto
    // no le sirve a nadie: se muestra solo el motivo que puso el servidor.
    return fallo(mensajeDeCanal(e) || 'No se pudo iniciar sesión. Revise su conexión.');
  } finally {
    botonOcupado(boton, false, '', 'Entrar');
  }
}

// Extrae el mensaje real de un error de IPC de Electron o de un fetch de la
// versión web. El envoltorio técnico se queda en la consola.
function mensajeDeCanal(error) {
  const texto = String(error && error.message ? error.message : '');
  if (!texto) return null;
  const marca = texto.lastIndexOf(': Error: ');
  if (marca >= 0) return texto.slice(marca + 9).trim();
  const prefijo = texto.indexOf('Error: ');
  if (prefijo === 0) return texto.slice(7).trim();
  return texto;
}

/** Cierra la sesión en el servidor y vuelve a la pantalla de login. */
async function cerrarSesion(mensaje) {
  const token = tokenActual();
  // Primero se limpia el estado local: aunque el servidor no responda
  // (base caída, red cortada), la pantalla de login aparece igual.
  sesion = null;
  guardarTokenLocal(null);
  // La ficha del sidebar y los módulos visibles se reinician: si no, seguiría
  // mostrando el nombre del usuario anterior y sus módulos habilitados.
  actualizarSesionEnInterfaz();
  try {
    if (token) await window.api.usuarios.cerrarSesion({ token });
  } catch (e) {
    console.warn('La sesión se cerró localmente, pero el servidor no respondió:', e.message);
  }
  // Es un aviso, no un fallo: se muestra en azul, no en rojo.
  mostrarLogin(mensaje || 'Sesión cerrada correctamente.', 'info');
}

/**
 * Al abrir la aplicación se revalida el token guardado. Si el servidor lo acepta
 * se entra directo; si no (expiró, se cerró desde otro equipo, usuario
 * desactivado), se cae al login con el motivo.
 */
async function restaurarSesion() {
  const token = leerTokenLocal();
  if (!token) {
    mostrarLogin();
    return false;
  }
  try {
    const r = await window.api.usuarios.sesionActual({ token });
    sesion = { token, usuario: r.usuario };
    ocultarLogin();
    alEntrarAlSistema();
    return true;
  } catch (e) {
    guardarTokenLocal(null);
    mostrarLogin(e.message || 'Inicie sesión para continuar.');
    return false;
  }
}

// ------------------------------------------------- rótulos del sidebar

// Iniciales para el avatar del usuario en el pie del sidebar.
function iniciales(nombre) {
  const partes = String(nombre || '').trim().split(/\s+/).filter(Boolean);
  if (!partes.length) return '?';
  if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase();
  return (partes[0][0] + partes[partes.length - 1][0]).toUpperCase();
}

/** Pinta la ficha del usuario y el botón de cerrar sesión del sidebar. */
function actualizarSesionEnInterfaz() {
  const u = usuarioActual();
  const nombreEl = document.getElementById('sidebarUsuarioNombre');
  const rolEl = document.getElementById('sidebarUsuarioRol');
  const avatar = document.getElementById('sidebarAvatar');

  if (nombreEl) nombreEl.textContent = u ? u.nombre : 'Sin sesión';
  if (rolEl) rolEl.textContent = u ? (ETIQUETA_ROL[u.rol] || u.rol) : '';
  if (avatar) {
    avatar.textContent = u ? iniciales(u.nombre) : '-';
    avatar.title = u ? `${u.nombre} (${u.usuario})` : '';
  }
  const ficha = document.getElementById('sidebarSesion');
  if (ficha) ficha.title = u ? `Sesión de ${u.nombre} (${u.usuario})` : '';

  // Se ocultan los módulos que el rol no puede abrir.
  document.querySelectorAll('.menu-item').forEach(b => {
    b.hidden = !puedeVerModulo(b.dataset.module);
  });
}

// ------------------------------------------------------------------ arranque

function iniciarControlSesion() {
  const boton = document.getElementById('loginBoton');
  if (boton) boton.addEventListener('click', enviarLogin);
  const clave = document.getElementById('loginClave');
  if (clave) {
    clave.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') enviarLogin();
    });
  }
  const usuario = document.getElementById('loginUsuario');
  if (usuario) {
    usuario.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && clave) clave.focus();
    });
  }

  // El botón del sidebar pide confirmación: cerrar sesión interrumpe lo que se
  // estaba haciendo y, si no se guardó, ese trabajo se pierde. Antes esto usaba
  // window.confirm(), que en Windows aparecía como un cuadro del sistema con
  // aspecto de alerta; ahora usa el diálogo de la aplicación.
  const cerrar = document.getElementById('btnCerrarSesion');
  if (cerrar) {
    cerrar.addEventListener('click', async () => {
      const u = usuarioActual();
      const acepta = await confirmarAccion({
        titulo: '¿Cerrar sesión?',
        mensaje: `Va a salir de <b>${u ? textoSeguro(u.nombre) : 'la sesión actual'}</b>. ` +
          'Si hay información sin guardar, se perderá. Necesitará escribir su usuario y contraseña para volver a entrar.',
        botonOk: 'Cerrar sesión',
        botonCancelar: 'Seguir dentro'
      });
      if (!acepta) return;
      await cerrarSesion();
    });
  }

  // Botón del ojo en cada campo de contraseña: siempre se escriben
  // encriptadas, y el botón solo permite apartar la vista para comprobar.
  ['loginClave', 'instClave', 'instClaveRepetir'].forEach(activarMostrarClave);

  // Al cambiar la contraseña se cierra la sesión, así que el aviso tiene que
  // estar a mano sin entrar al módulo Usuarios (que es solo del ADMIN).
  const miClave = document.getElementById('btnMiClave');
  if (miClave) miClave.addEventListener('click', abrirModalCambiarClave);

  // Formulario de instalación (primera vez, cuando aún no hay cuentas).
  const instBoton = document.getElementById('instBoton');
  if (instBoton) instBoton.addEventListener('click', enviarInstalacion);
  // El foco salta del último campo al botón, para no tener que usar el ratón.
  const instRepetir = document.getElementById('instClaveRepetir');
  if (instRepetir) {
    instRepetir.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') enviarInstalacion();
    });
  }
  const instUsuario = document.getElementById('instUsuario');
  if (instUsuario) {
    instUsuario.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && document.getElementById('instClave')) {
        document.getElementById('instClave').focus();
      }
    });
  }
}

// ------------------------------------------------- cambio de contraseña propia

/**
 * Abre el formulario para que el usuario en sesión cambie su contraseña.
 * Se exige la actual: así, con el equipo desbloqueado, nadie se apodera de la
 * cuenta de otro. Al cambiarla se cierra la sesión y hay que volver a entrar.
 */
function abrirModalCambiarClave() {
  const contenedor = document.getElementById('loginPantalla').parentElement;
  let caja = document.getElementById('miClaveOverlay');
  if (caja) caja.remove();

  caja = document.createElement('div');
  caja.className = 'modal-overlay';
  caja.id = 'miClaveOverlay';
  caja.innerHTML = `
    <div class="modal-box" style="max-width:460px;">
      <div class="modal-header">
        <h3>Cambiar mi contraseña</h3>
        <button class="modal-close" type="button" id="miClaveCerrar" aria-label="Cerrar">&times;</button>
      </div>
      <div class="form-group" style="margin-bottom:12px;">
        <label>Contraseña actual</label>
        <input id="miClaveActual" type="password" autocomplete="current-password">
      </div>
      <div class="form-group" style="margin-bottom:12px;">
        <label>Nueva contraseña</label>
        <input id="miClaveNueva" type="password" autocomplete="new-password" placeholder="Mínimo 6 caracteres">
      </div>
      <div class="form-group">
        <label>Repita la nueva contraseña</label>
        <input id="miClaveRepetir" type="password" autocomplete="new-password">
      </div>
      <div id="miClaveError" class="aviso-error" style="display:none;"></div>
      <div class="form-actions" style="display:flex; gap:9px; justify-content:flex-end;">
        <button class="btn" type="button" id="miClaveCancelar">Cancelar</button>
        <button class="btn primary" type="button" id="miClaveGuardar">Cambiar contraseña</button>
      </div>
    </div>
  `;
  contenedor.appendChild(caja);

  const error = document.getElementById('miClaveError');
  const cerrar = () => caja.remove();
  document.getElementById('miClaveCerrar').onclick = cerrar;
  document.getElementById('miClaveCancelar').onclick = cerrar;
  caja.onclick = (e) => { if (e.target === caja) cerrar(); };
  // Los tres campos se escriben encriptados; el botón del ojo solo permite
  // comprobarlos de un vistazo.
  ['miClaveActual', 'miClaveNueva', 'miClaveRepetir'].forEach(activarMostrarClave);
  document.getElementById('miClaveActual').focus();

  document.getElementById('miClaveGuardar').onclick = async () => {
    const boton = document.getElementById('miClaveGuardar');
    const actual = document.getElementById('miClaveActual').value;
    const nueva = document.getElementById('miClaveNueva').value;
    const repetir = document.getElementById('miClaveRepetir').value;
    const fallo = (mensaje) => {
      error.textContent = mensaje;
      error.style.display = 'block';
    };
    if (!actual) return fallo('Escriba su contraseña actual.');
    if (!nueva) return fallo('Escriba la nueva contraseña.');
    if (nueva !== repetir) return fallo('La nueva contraseña no coincide con su repetición.');

    boton.disabled = true;
    boton.textContent = 'Cambiando...';
    error.style.display = 'none';
    try {
      await window.api.usuarios.cambiarClave({ token: tokenActual(), clave_actual: actual, clave_nueva: nueva });
      cerrar();
      // Se marca que ya se usó la cuenta de fábrica, para no volver a sugerirla.
      localStorage.setItem('control-empresa-admin-creado', '1');
      await cerrarSesion('Contraseña actualizada. Inicie sesión con la nueva.');
    } catch (e) {
      fallo(e.message || 'No se pudo cambiar la contraseña.');
      boton.disabled = false;
      boton.textContent = 'Cambiar contraseña';
    }
  };
}
