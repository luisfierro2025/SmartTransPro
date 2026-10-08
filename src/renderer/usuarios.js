'use strict';

// ==========================================================================
// Módulo de Usuarios y Acceso de SmartPosPro
// - Pantalla de inicio de sesión (bloquea la app mientras no haya sesión)
// - Alta, edición, baja, desbloqueo y bitácora de usuarios
// - Panel de sesión en la barra lateral y cambio de contraseña
// Independiente de renderer.js y modulos.js: no altera su lógica.
// ==========================================================================
(function() {
  const api = (typeof window !== 'undefined' && window.api) || null;
  const porId = (id) => document.getElementById(id);

  const esc = (t) =>
    String(t == null ? '' : t)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');

  // Módulos que el menú lateral debe respetar según el rol conectado.
  const VISTAS_POR_MODULO = {
    inicio: 'inicio',
    clientes: 'clientes',
    productos: 'productos',
    ventas: 'ventas',
    abonos: 'abonos',
    caja: 'caja',
    compras: 'compras',
    reportes: 'reportes',
    whatsapp: 'whatsapp',
    configuracion: 'configuracion',
    usuarios: 'usuarios'
  };

  const estado = {
    sesion: null,
    usuarios: [],
    roles: [],
    modulos: [],
    bitacora: [],
    filtroTexto: '',
    filtroRol: 'todos',
    filtroEstado: 'todos',
    editandoId: 0,
    resolverClave: null
  };

  // ===== Utilidades =====

  function inicialesDe(nombre) {
    const partes = String(nombre || '').trim().split(/\s+/).filter(Boolean);
    if (partes.length === 0) return '?';
    if (partes.length === 1) return partes[0].substring(0, 2).toUpperCase();
    return (partes[0][0] + partes[partes.length - 1][0]).toUpperCase();
  }

  function textoDeError(error) {
    if (!error) return 'Ocurrió un error inesperado.';
    const mensaje = String(error.message || error);
    // Electron antepone el canal al error: se recorta para mostrar solo el motivo.
    return mensaje.replace(/^Error invoking remote method '[^']*':\s*/, '').replace(/^Error:\s*/, '');
  }

  function fechaLegible(texto) {
    if (!texto) return 'Nunca';
    const fecha = new Date(String(texto).replace(' ', 'T'));
    if (Number.isNaN(fecha.getTime())) return String(texto);
    return fecha.toLocaleString('es', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  function tienePermiso(modulo) {
    if (!estado.sesion) return false;
    return (estado.sesion.permisos || []).indexOf(modulo) !== -1;
  }

  // ===== Avisos (reutiliza el diálogo del sistema) =====

  function avisar(opciones) {
    if (window.posAviso) return window.posAviso(opciones);
    return Promise.resolve(true);
  }

  function confirmar(opciones) {
    if (window.posConfirmar) return window.posConfirmar(opciones);
    return Promise.resolve(window.confirm(opciones.mensaje || '¿Confirmas la acción?'));
  }

  // ===== Pantalla de inicio de sesión =====

  // ===== Licenciamiento de SmartPosPro =====

  function mostrarCapaLicencia(mensaje) {
    const capa = porId('licenciaCapa');
    if (capa) capa.removeAttribute('hidden');

    document.body.classList.add('app-bloqueada');

    const estadoLicencia = porId('licenciaEstado');

    if (estadoLicencia) {
      if (mensaje) {
        estadoLicencia.textContent = mensaje;
        estadoLicencia.removeAttribute('hidden');
      } else {
        estadoLicencia.textContent = '';
        estadoLicencia.setAttribute('hidden', 'true');
      }
    }

    setTimeout(function() {
      const campo = porId('licenciaCodigo');
      if (campo) campo.focus();
    }, 60);
  }

  function ocultarCapaLicencia() {
    const capa = porId('licenciaCapa');
    if (capa) capa.setAttribute('hidden', 'true');
  }

  function mostrarEstadoLicencia(mensaje, tipo) {
    const caja = porId('licenciaEstado');
    if (!caja) return;

    caja.textContent = mensaje || '';
    caja.className = 'licencia-estado licencia-estado-' + (tipo || 'error');
    caja.removeAttribute('hidden');
  }

  async function prepararPantallaLicencia() {
    if (!api) return false;

    try {
      const equipo = await api.obtenerEquipoLicencia();

      const nombre = porId('licenciaNombreEquipo');
      const id = porId('licenciaEquipoId');

      if (nombre) {
        nombre.textContent = equipo && equipo.nombreEquipo
          ? equipo.nombreEquipo
          : 'Equipo no identificado';
      }

      if (id) {
        id.textContent = equipo && equipo.equipoId
          ? equipo.equipoId
          : 'No disponible';
      }
    } catch (error) {
      console.warn('licencia:equipo', error);
    }

    try {
      const licencia = await api.validarLicenciaAlIniciar();

      if (licencia && licencia.activada) {
        ocultarCapaLicencia();
        return true;
      }

      mostrarCapaLicencia(licencia && licencia.mensaje ? licencia.mensaje : undefined);
      return false;
    } catch (error) {
      console.warn('licencia:estado', error);
      mostrarCapaLicencia('No fue posible comprobar el estado de la licencia.');
      return false;
    }
  }

  async function activarDesdeInterfaz() {
    const campo = porId('licenciaCodigo');
    const boton = porId('btnActivarLicencia');

    if (!campo || !api) return;

    const codigo = String(campo.value || '').trim();

    if (!codigo) {
      mostrarEstadoLicencia('Ingresa el código de licencia.', 'error');
      campo.focus();
      return;
    }

    if (boton) {
      boton.disabled = true;
      boton.textContent = 'Activando...';
    }

    mostrarEstadoLicencia('Comprobando licencia...', 'info');

    try {
      const licencia = await api.activarLicencia(codigo);

      ocultarCapaLicencia();

      if (boton) {
        boton.disabled = false;
        boton.textContent = 'Activar SmartPosPro';
      }

      campo.value = '';

      abrirLogin();

      const usuario = porId('loginUsuario');
      if (usuario) usuario.focus();

      console.info('licencia:activada', licencia);
    } catch (error) {
      const mensaje = textoDeError(error);

      mostrarEstadoLicencia(
        mensaje || 'No fue posible activar la licencia.',
        'error'
      );

      if (boton) {
        boton.disabled = false;
        boton.textContent = 'Activar SmartPosPro';
      }

      campo.focus();
      campo.select();
    }
  }
  function mostrarErrorLogin(mensaje) {
    const caja = porId('loginError');
    if (!caja) return;
    caja.innerHTML =
      '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><path d="M12 8v4"/><path d="M12 16h.01"/></svg>' +
      '<span>' + esc(mensaje) + '</span>';
    caja.removeAttribute('hidden');
  }

  function ocultarErrorLogin() {
    const caja = porId('loginError');
    if (caja) caja.setAttribute('hidden', 'true');
  }

  function abrirLogin(mensaje) {
    const capa = porId('loginCapa');
    if (capa) capa.removeAttribute('hidden');
    // La app queda cubierta por la capa: no se opera sin sesión.
    document.body.classList.add('app-bloqueada');
    if (mensaje) mostrarErrorLogin(mensaje);
    else ocultarErrorLogin();
    setTimeout(function() {
      const campo = porId('loginUsuario');
      if (campo) campo.focus();
    }, 60);
  }

  function cerrarLogin() {
    const capa = porId('loginCapa');
    if (capa) capa.setAttribute('hidden', 'true');
    document.body.classList.remove('app-bloqueada');
    // Red de seguridad: el contenedor principal nunca debe quedar oculto una vez se entra.
    const principal = porId('app');
    if (principal) principal.removeAttribute('hidden');
  }

  async function entrar() {
    const usuario = porId('loginUsuario');
    const contrasena = porId('loginContrasena');
    const boton = porId('btnIniciarSesion');
    if (!usuario || !contrasena) return;
    if (!api) {
      mostrarErrorLogin('Inicia la aplicación SmartPosPro para poder acceder.');
      return;
    }

    const valorUsuario = String(usuario.value || '').trim();
    const valorContrasena = String(contrasena.value || '');
    if (valorUsuario.length === 0 || valorContrasena.length === 0) {
      mostrarErrorLogin('Ingresa tu usuario y tu contraseña para continuar.');
      return;
    }

    ocultarErrorLogin();
    if (boton) {
      boton.disabled = true;
      boton.textContent = 'Verificando...';
    }

    try {
      const sesion = await api.iniciarSesion(valorUsuario, valorContrasena);
      estado.sesion = sesion;

      // Cambio de contraseña obligatorio (cuenta inicial o restablecida).
      if (sesion && sesion.debeCambiarContrasena) {
        cerrarLogin();
        const cambiado = await pedirCambioContrasena(true);
        if (!cambiado) {
          await api.cerrarSesion();
          estado.sesion = null;
          abrirLogin('Debes cambiar tu contraseña para poder usar el sistema.');
          return;
        }
        estado.sesion.debeCambiarContrasena = false;
      }

      cerrarLogin();
      contrasena.value = '';

      // Tras un acceso correcto se recarga la ventana: así el resto de la
      // aplicación pide sus datos con la sesión ya activa y todo queda
      // coherente (el proceso principal conserva la sesión abierta).
      await avisar({
        tipo: 'exito',
        titulo: 'Sesión iniciada',
        mensaje: 'Bienvenido, ' + (sesion ? sesion.nombre : '') + '.',
        detalle: sesion ? 'Acceso como ' + sesion.rolEtiqueta : ''
      });
      window.location.reload();
      return;
    } catch (error) {
      mostrarErrorLogin(textoDeError(error));
      contrasena.value = '';
      const campo = porId('loginContrasena');
      if (campo) campo.focus();
    } finally {
      if (boton) {
        boton.disabled = false;
        boton.textContent = 'Iniciar sesión';
      }
    }
  }
  /** Refleja la sesión activa en la esquina superior derecha de la barra. */
  function pintarUsuarioTopbar(sesion) {
    const avatar = porId('topbarAvatar');
    const nombre = porId('topbarUsuarioNombre');
    const rol = porId('topbarUsuarioRol');
    const bloque = porId('topbarUsuario');
    if (!bloque) return;

    if (!sesion) {
      if (avatar) avatar.textContent = '?';
      if (nombre) nombre.textContent = 'Sin sesión';
      if (rol) rol.textContent = 'Inicia sesión para operar';
      bloque.title = 'Sesión activa';
      return;
    }

    const etiqueta = sesion.nombre + ' · ' + sesion.rolEtiqueta;
    if (avatar) avatar.textContent = inicialesDe(sesion.nombre || sesion.usuario);
    if (nombre) nombre.textContent = sesion.nombre;
    if (rol) rol.textContent = sesion.rolEtiqueta;
    bloque.title = 'Sesión activa: ' + etiqueta;

    // El saludo del tablero se recalcula con el nombre de esta sesión.
    const saludo = porId('saludoDashboard');
    if (saludo) {
      const hora = new Date().getHours();
      const texto = hora < 12 ? 'Buenos días' : hora < 19 ? 'Buenas tardes' : 'Buenas noches';
      const primerNombre = String(sesion.nombre || '').trim().split(' ')[0];
      saludo.textContent = texto + (primerNombre ? ', ' + primerNombre : '') + ' 👋';
    }
  }

  // ===== Sesión en la barra lateral =====

  function aplicarSesionEnInterfaz() {
    // Primero la esquina superior derecha, luego el pie del menú lateral.
    pintarUsuarioTopbar(estado.sesion);

    const bloque = document.querySelector('.sidebar-footer .usuario');
    const sesion = estado.sesion;
    if (!bloque) return;

    if (!sesion) {
      bloque.innerHTML =
        '<div class="usuario-avatar">?</div>' +
        '<div class="usuario-info"><span class="usuario-nombre">Sin sesión</span>' +
        '<span class="usuario-rol">Inicia sesión para operar</span></div>';
      return;
    }

    bloque.innerHTML =
      '<div class="usuario-avatar">' + esc(inicialesDe(sesion.nombre || sesion.usuario)) + '</div>' +
      '<div class="usuario-info">' +
      '<span class="usuario-nombre">' + esc(sesion.nombre) + '</span>' +
      '<span class="usuario-rol">' + esc(sesion.rolEtiqueta) + '</span>' +
      '</div>' +
      '<div class="usuario-acciones">' +
      '<button class="usuario-accion" type="button" id="btnCambiarClave" title="Cambiar mi contraseña" aria-label="Cambiar mi contraseña">' +
      '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
      '<rect x="3" y="11" width="18" height="10" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg></button>' +
      '<button class="usuario-accion salir" type="button" id="btnCerrarSesion" title="Cerrar sesión" aria-label="Cerrar sesión">' +
      '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
      '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5"/><path d="M21 12H9"/></svg></button>' +
      '</div>';

    const btnClave = porId('btnCambiarClave');
    if (btnClave) btnClave.addEventListener('click', function() { pedirCambioContrasena(false); });
    const btnSalir = porId('btnCerrarSesion');
    if (btnSalir) btnSalir.addEventListener('click', salir);
  }

  /** Oculta los módulos del menú a los que el rol conectado no tiene acceso. */
  function aplicarPermisosEnNavegacion() {
    if (!estado.sesion) return;

    document.querySelectorAll('.nav-item').forEach(function(boton) {
      const vista = boton.getAttribute('data-vista');
      let modulo = '';
      Object.keys(VISTAS_POR_MODULO).forEach(function(clave) {
        if (VISTAS_POR_MODULO[clave] === vista) modulo = clave;
      });
      // Las vistas sin módulo asociado (impresión) no se restringen desde aquí.
      if (!modulo) return;
      const permitido = tienePermiso(modulo);
      boton.hidden = !permitido;
      boton.style.display = permitido ? '' : 'none';
    });

    // Si la vista activa quedó oculta, se vuelve a una vista permitida.
    const activa = document.querySelector('.nav-item.activo');
    if (activa && activa.hidden && window.irA) {
      window.irA(tienePermiso('inicio') ? 'inicio' : 'clientes');
    }
  }

  // ===== Cierre de sesión =====

  async function salir() {
    const ok = await confirmar({
      tipo: 'pregunta',
      titulo: 'Cerrar sesión',
      mensaje: '¿Deseas salir de SmartPosPro?',
      detalle: 'Tendrás que volver a escribir tu usuario y contraseña.',
      aceptar: 'Sí, salir'
    });
    if (!ok) return;

    try {
      if (api) await api.cerrarSesion();
    } catch (error) {
      console.warn('auth:salir', error);
    }
    estado.sesion = null;
    estado.usuarios = [];
    renderTablaUsuarios();
    renderKpisUsuarios();
    abrirLogin();
  }

  // ===== Carga de datos =====

  async function cargarUsuarios() {
    if (!api) return;
    try {
      const lista = await api.listarUsuarios();
      estado.usuarios = Array.isArray(lista) ? lista : [];
    } catch (error) {
      console.warn('usuarios:listar', error);
      estado.usuarios = [];
    }
    renderTablaUsuarios();
    renderKpisUsuarios();
  }

  async function cargarBitacora() {
    if (!api) return;
    try {
      const lista = await api.obtenerBitacoraAccesos(25);
      estado.bitacora = Array.isArray(lista) ? lista : [];
    } catch (error) {
      console.warn('usuarios:bitacora', error);
      estado.bitacora = [];
    }
    renderBitacora();
  }

  function usuariosFiltrados() {
    const texto = estado.filtroTexto.toLowerCase();
    return estado.usuarios.filter(function(u) {
      if (estado.filtroRol !== 'todos' && u.rol !== estado.filtroRol) return false;
      if (estado.filtroEstado === 'activos' && !u.activo) return false;
      if (estado.filtroEstado === 'inactivos' && u.activo) return false;
      if (estado.filtroEstado === 'bloqueados' && !u.bloqueado) return false;
      if (texto.length === 0) return true;
      return (
        String(u.nombre || '').toLowerCase().indexOf(texto) !== -1 ||
        String(u.usuario || '').toLowerCase().indexOf(texto) !== -1 ||
        String(u.correo || '').toLowerCase().indexOf(texto) !== -1
      );
    });
  }

  // ===== Renderizado =====

  function renderKpisUsuarios() {
    const set = function(id, valor) {
      const el = porId(id);
      if (el) el.textContent = String(valor);
    };
    const total = estado.usuarios.length;
    const activos = estado.usuarios.filter(function(u) { return u.activo; }).length;
    const admins = estado.usuarios.filter(function(u) { return u.rol === 'administrador' && u.activo; }).length;
    const bloqueados = estado.usuarios.filter(function(u) { return u.bloqueado; }).length;

    set('kpiUsuariosTotal', total);
    set('kpiUsuariosActivos', activos);
    set('kpiUsuariosAdmins', admins);
    set('kpiUsuariosBloqueados', bloqueados);
  }

  function distintivo(clase, texto) {
    return '<span class="distintivo ' + clase + '">' + esc(texto) + '</span>';
  }

  async function salir() {
    const ok = await confirmar({
      tipo: 'pregunta',
      titulo: 'Cerrar sesión',
      mensaje: '¿Deseas salir de SmartPosPro?',
      detalle: 'Tendrás que volver a escribir tu usuario y contraseña.',
      aceptar: 'Sí, salir'
    });
    if (!ok) return;

    try {
      if (api) await api.cerrarSesion();
    } catch (error) {
      console.warn('auth:salir', error);
    }
    estado.sesion = null;
    estado.usuarios = [];
    renderTablaUsuarios();
    renderKpisUsuarios();
    abrirLogin();
  }


  function renderTablaUsuarios() {
    const cuerpo = porId('cuerpoUsuarios');
    if (!cuerpo) return;
    const lista = usuariosFiltrados();

    if (lista.length === 0) {
      cuerpo.innerHTML = '';
      const vacio = porId('usuariosVacio');
      if (vacio) vacio.removeAttribute('hidden');
      const conteo = porId('usuariosConteo');
      if (conteo) conteo.textContent = 'Sin resultados';
      return;
    }

    const vacio = porId('usuariosVacio');
    if (vacio) vacio.setAttribute('hidden', 'true');
    const conteo = porId('usuariosConteo');
    if (conteo) {
      conteo.textContent =
        lista.length + (lista.length === 1 ? ' usuario' : ' usuarios') +
        (lista.length !== estado.usuarios.length ? ' de ' + estado.usuarios.length : '');
    }

    const soyYo = estado.sesion ? estado.sesion.id : 0;

    cuerpo.innerHTML = lista
      .map(function(u) {
        const estadoClase = u.activo ? 'distintivo-activo' : 'distintivo-inactivo';
        const estadoTexto = u.activo ? 'Activo' : 'Inactivo';
        const avatar = '<div class="usuarios-avatar' + (u.activo ? '' : ' inactivo') + '">' +
          esc(inicialesDe(u.nombre || u.usuario)) + '</div>';
        const contacto = u.correo || u.telefono || 'Sin contacto registrado';
        const distintivos = [
          distintivo('distintivo-rol-' + u.rol, u.rolEtiqueta),
          distintivo(estadoClase, estadoTexto)
        ];
        if (u.bloqueado) distintivos.push(distintivo('distintivo-bloqueado', 'Bloqueado'));
        if (u.debeCambiarContrasena) distintivos.push(distintivo('distintivo-alerta', 'Debe cambiar clave'));

        const acciones = [];
        if (u.bloqueado) {
          acciones.push('<button class="btn-mini" data-accion="desbloquear" data-id="' + u.id + '" type="button">Desbloquear</button>');
        }
        acciones.push('<button class="btn-mini" data-accion="editar" data-id="' + u.id + '" type="button">Editar</button>');
        acciones.push('<button class="btn-mini" data-accion="clave" data-id="' + u.id + '" type="button">Clave</button>');
        if (u.id !== soyYo) {
          acciones.push('<button class="btn-mini peligro" data-accion="eliminar" data-id="' + u.id + '" type="button">Eliminar</button>');
        }

        return (
          '<tr' + (u.id === soyYo ? ' class="es-yo"' : '') + '>' +
          '<td><div class="usuarios-celda-persona">' + avatar +
          '<div class="usuarios-persona-datos"><strong>' + esc(u.nombre) + '</strong>' +
          '<small>' + esc(contacto) + '</small></div></div></td>' +
          '<td><span class="usuarios-user-mono">' + esc(u.usuario) + '</span></td>' +
          '<td>' + distintivos.join(' ') + '</td>' +
          '<td>' + esc(fechaLegible(u.ultimoAcceso)) + '</td>' +
          '<td><div class="usuarios-acciones">' + acciones.join('') + '</div></td>' +
          '</tr>'
        );
      })
      .join('');
  }

  function renderBitacora() {
    const lista = porId('listaBitacora');
    if (!lista) return;
    if (estado.bitacora.length === 0) {
      lista.innerHTML = '<li class="usuarios-vacio">Aún no hay movimientos registrados.</li>';
      return;
    }
    lista.innerHTML = estado.bitacora
      .map(function(registro) {
        return (
          '<li class="bitacora-item">' +
          '<span class="bitacora-punto' + (registro.exito ? '' : ' fallo') + '"></span>' +
          '<div class="bitacora-texto">' +
          '<strong>' + esc(registro.usuario) + '</strong>' +
          '<small>' + esc(registro.motivo) + '</small>' +
          '<time>' + esc(fechaLegible(registro.fecha)) + '</time>' +
          '</div></li>'
        );
      })
      .join('');
  }

  function llenarSelectRoles(select, seleccionado) {
    if (!select) return;
    select.innerHTML = estado.roles
      .map(function(rol) {
        return '<option value="' + esc(rol.rol) + '"' +
          (rol.rol === seleccionado ? ' selected' : '') + '>' + esc(rol.etiqueta) + '</option>';
      })
      .join('');
  }


  // ===== Formulario de alta y edición =====

  function abrirFormularioUsuario(usuario) {
    const modal = porId('modalUsuario');
    if (!modal) return;
    estado.editandoId = usuario ? Number(usuario.id) : 0;

    const titulo = porId('modalTituloUsuario');
    if (titulo) titulo.textContent = usuario ? 'Editar usuario' : 'Nuevo usuario';

    const campoUsuario = porId('campoUsuarioNombre');
    const campoNombre = porId('campoUsuarioCompleto');
    const campoCorreo = porId('campoUsuarioCorreo');
    const campoTelefono = porId('campoUsuarioTelefono');
    const campoRol = porId('campoUsuarioRol');
    const campoClave = porId('campoUsuarioClave');
    const checkActivo = porId('checkUsuarioActivo');
    const ayudaClave = porId('ayudaClaveUsuario');

    if (campoUsuario) campoUsuario.value = usuario ? usuario.usuario : '';
    if (campoNombre) campoNombre.value = usuario ? usuario.nombre : '';
    if (campoCorreo) campoCorreo.value = usuario ? usuario.correo : '';
    if (campoTelefono) campoTelefono.value = usuario ? usuario.telefono : '';
    llenarSelectRoles(campoRol, usuario ? usuario.rol : 'cajero');
    if (campoClave) campoClave.value = '';
    if (checkActivo) checkActivo.checked = usuario ? usuario.activo : true;

    if (campoClave) {
      campoClave.disabled = !!usuario;
      campoClave.required = !usuario;
      campoClave.placeholder = usuario ? 'No se cambia aquí' : 'Mínimo 6 caracteres, con letra y número';
    }
    if (ayudaClave) {
      ayudaClave.textContent = usuario
        ? 'Para cambiar la contraseña de este usuario usa el botón "Clave".'
        : 'Debe tener al menos 6 caracteres, incluir una letra y un número.';
    }

    modal.removeAttribute('hidden');
    setTimeout(function() {
      const foco = campoUsuario || campoNombre;
      if (foco) foco.focus();
    }, 60);
  }

  function cerrarFormularioUsuario() {
    const modal = porId('modalUsuario');
    if (modal) modal.setAttribute('hidden', 'true');
    const form = porId('formUsuario');
    if (form) form.reset();
    estado.editandoId = 0;
  }

  async function guardarUsuario(evento) {
    if (evento) evento.preventDefault();
    if (!api) return;

    const id = estado.editandoId;
    const valor = function(idCampo) {
      const el = porId(idCampo);
      return el ? String(el.value || '') : '';
    };
    const checkActivo = porId('checkUsuarioActivo');

    const datos = {
      usuario: valor('campoUsuarioNombre').trim(),
      nombre: valor('campoUsuarioCompleto').trim(),
      correo: valor('campoUsuarioCorreo').trim(),
      telefono: valor('campoUsuarioTelefono').trim(),
      rol: valor('campoUsuarioRol') || 'cajero',
      activo: checkActivo ? checkActivo.checked !== false : true
    };

    if (!id) {
      datos.contrasena = valor('campoUsuarioClave');
      if (datos.contrasena.length === 0) {
        await avisar({ tipo: 'aviso', titulo: 'Contraseña requerida', mensaje: 'Escribe una contraseña para la nueva cuenta.' });
        return;
      }
    }

    try {
      if (id) await api.editarUsuario(id, datos);
      else await api.crearUsuario(datos);
      cerrarFormularioUsuario();
      await cargarUsuarios();
      await cargarBitacora();
      await avisar({
        tipo: 'exito',
        titulo: id ? 'Usuario actualizado' : 'Usuario creado',
        mensaje: id ? 'Los cambios se guardaron correctamente.' : 'La cuenta ' + datos.usuario + ' quedó lista para usarse.'
      });
    } catch (error) {
      await avisar({
        tipo: 'peligro',
        titulo: id ? 'No se pudo actualizar' : 'No se pudo crear el usuario',
        mensaje: textoDeError(error)
      });
    }
  }


  // ===== Cambio y restablecimiento de contraseña =====

  function abrirModalClave(usuario) {
    const modal = porId('modalClaveUsuario');
    if (!modal) return;
    estado.editandoId = usuario ? Number(usuario.id) : 0;

    const titulo = porId('modalTituloClaveUsuario');
    if (titulo) {
      titulo.textContent = usuario
        ? 'Restablecer contraseña de ' + usuario.nombre
        : 'Cambiar mi contraseña';
    }
    const ayuda = porId('ayudaClaveActual');
    if (ayuda) ayuda.textContent = usuario ? 'El usuario deberá cambiarla al volver a entrar.' : '';

    const actual = porId('campoClaveActual');
    const nueva = porId('campoClaveNueva');
    const repetir = porId('campoClaveRepetir');
    if (actual) {
      actual.value = '';
      // El restablecimiento administrativo no conoce la contraseña anterior.
      if (actual.parentElement) actual.parentElement.style.display = usuario ? 'none' : '';
    }
    if (nueva) nueva.value = '';
    if (repetir) repetir.value = '';

    modal.removeAttribute('hidden');
    setTimeout(function() {
      const foco = usuario ? nueva : actual;
      if (foco) foco.focus();
    }, 60);
  }

  function cerrarModalClave() {
    const modal = porId('modalClaveUsuario');
    if (modal) modal.setAttribute('hidden', 'true');
    const form = porId('formClaveUsuario');
    if (form) form.reset();
  }

  async function guardarClave(evento) {
    if (evento) evento.preventDefault();
    if (!api) return;

    const id = estado.editandoId;
    const valor = function(idCampo) {
      const el = porId(idCampo);
      return el ? String(el.value || '') : '';
    };
    const actual = valor('campoClaveActual');
    const nueva = valor('campoClaveNueva');
    const repetir = valor('campoClaveRepetir');

    if (id && nueva.length === 0) {
      await avisar({ tipo: 'aviso', titulo: 'Contraseña requerida', mensaje: 'Escribe la nueva contraseña.' });
      return;
    }
    if (nueva !== repetir) {
      await avisar({ tipo: 'aviso', titulo: 'No coinciden', mensaje: 'La contraseña y su repetición deben ser iguales.' });
      return;
    }

    try {
      if (id) {
        await api.restablecerContrasenaUsuario(id, nueva);
      } else if (estado.sesion) {
        await api.cambiarMiContrasena(actual, nueva);
      }
      cerrarModalClave();
      await cargarUsuarios();
      await cargarBitacora();
      await avisar({
        tipo: 'exito',
        titulo: 'Contraseña actualizada',
        mensaje: id
          ? 'La contraseña fue restablecida. El usuario deberá cambiarla al entrar.'
          : 'Tu contraseña se actualizó correctamente.'
      });
      // Si había un cambio obligatorio en curso, el flujo de acceso continúa.
      resolverCambioPendiente(true);
    } catch (error) {
      await avisar({ tipo: 'peligro', titulo: 'No se pudo cambiar la contraseña', mensaje: textoDeError(error) });
    }
  }

  /**
   * Cambio de contraseña del usuario conectado. Cuando `obligatorio` es true
   * (primer ingreso con contraseña inicial) el botón cancelar se oculta y la
   * promesa solo se resuelve al guardar la contraseña: así el flujo de acceso
   * no continúa ni se queda colgado.
   */
  function pedirCambioContrasena(obligatorio) {
    return new Promise(function(resolve) {
      abrirModalClave(null);
      estado.resolverClave = resolve;
      const botonCancelar = porId('btnCancelarClaveUsuario');
      if (botonCancelar) {
        botonCancelar.style.display = obligatorio ? 'none' : '';
        if (!obligatorio) {
          botonCancelar.addEventListener(
            'click',
            function() {
              estado.resolverClave = null;
              cerrarModalClave();
              resolve(false);
            },
            { once: true }
          );
        }
      }
    });
  }

  /** Cierra la espera del cambio de contraseña obligatorio. */
  function resolverCambioPendiente(exito) {
    const resolver = estado.resolverClave;
    estado.resolverClave = null;
    if (typeof resolver === 'function') resolver(exito);
  }

  // ===== Acciones sobre la tabla =====

  function buscarUsuario(id) {
    return estado.usuarios.find(function(u) { return Number(u.id) === Number(id); }) || null;
  }

  async function eliminarUsuario(id) {
    const usuario = buscarUsuario(id);
    if (!usuario || !api) return;

    const ok = await confirmar({
      tipo: 'peligro',
      titulo: 'Eliminar usuario',
      mensaje: '¿Deseas eliminar la cuenta de ' + usuario.nombre + '?',
      detalle: 'La cuenta "' + usuario.usuario + '" se borrará de forma permanente.',
      aceptar: 'Sí, eliminar'
    });
    if (!ok) return;

    try {
      await api.eliminarUsuario(usuario.id);
      await cargarUsuarios();
      await cargarBitacora();
      await avisar({ tipo: 'exito', titulo: 'Usuario eliminado', mensaje: 'La cuenta se eliminó correctamente.' });
    } catch (error) {
      await avisar({ tipo: 'peligro', titulo: 'No se pudo eliminar', mensaje: textoDeError(error) });
    }
  }

  async function desbloquear(id) {
    const usuario = buscarUsuario(id);
    if (!usuario || !api) return;
    try {
      await api.desbloquearUsuario(usuario.id);
      await cargarUsuarios();
      await cargarBitacora();
      await avisar({ tipo: 'exito', titulo: 'Usuario desbloqueado', mensaje: usuario.nombre + ' ya puede volver a entrar.' });
    } catch (error) {
      await avisar({ tipo: 'peligro', titulo: 'No se pudo desbloquear', mensaje: textoDeError(error) });
    }
  }

  function manejarAccionTabla(evento) {
    const boton = evento.target.closest('button[data-accion]');
    if (!boton) return;
    const id = boton.getAttribute('data-id');
    const accion = boton.getAttribute('data-accion');

    if (accion === 'editar') abrirFormularioUsuario(buscarUsuario(id));
    else if (accion === 'clave') abrirModalClave(buscarUsuario(id));
    else if (accion === 'eliminar') eliminarUsuario(id);
    else if (accion === 'desbloquear') desbloquear(id);
  }


  /**
   * Al abrir la vista de usuarios se recargan sus datos.
   * renderer.js enlaza el clic del menú a su función interna `irA`, no a
   * `window.irA`; por eso se engancha directamente el botón del menú.
   */
  function observarNavegacion() {
    if (window.__usuariosNavegacion) return;
    window.__usuariosNavegacion = true;

    const botonUsuarios = document.querySelector('.nav-item[data-vista="usuarios"]');
    if (botonUsuarios) {
      botonUsuarios.addEventListener('click', function() {
        setTimeout(function() {
          cargarUsuarios();
          cargarBitacora();
        }, 120);
      });
    }

    // Atajos del dashboard que llevan a la vista de usuarios.
    document.querySelectorAll('.acceso-card[data-ir="usuarios"]').forEach(function(tarjeta) {
      tarjeta.addEventListener('click', function() {
        setTimeout(function() {
          cargarUsuarios();
          cargarBitacora();
        }, 120);
      });
    });

    // Si otro código navega con window.irA, también se recarga.
    if (typeof window.irA === 'function') {
      const navegarOriginal = window.irA;
      window.irA = function(destino) {
        const resultado = navegarOriginal.apply(this, arguments);
        if (destino === 'usuarios') {
          cargarUsuarios();
          cargarBitacora();
        }
        return resultado;
      };
    }
  }

  // ===== Inicialización =====

  function conectarEventos() {
    const formLogin = porId('formLogin');
    if (formLogin) {
      formLogin.addEventListener('submit', function(evento) {
        evento.preventDefault();
        entrar();
      });
    }

    const formLicencia = porId('formLicencia');
    if (formLicencia) {
      formLicencia.addEventListener('submit', function(evento) {
        evento.preventDefault();
        activarDesdeInterfaz();
      });
    }

    const btnVer = porId('btnVerClave');
    if (btnVer) {
      btnVer.addEventListener('click', function() {
        const campo = porId('loginContrasena');
        if (!campo) return;
        const visible = campo.type === 'text';
        campo.type = visible ? 'password' : 'text';
        btnVer.textContent = visible ? 'Ver' : 'Ocultar';
        campo.focus();
      });
    }

    const buscador = porId('buscadorUsuarios');
    if (buscador) {
      buscador.addEventListener('input', function() {
        estado.filtroTexto = String(buscador.value || '');
        renderTablaUsuarios();
      });
    }

    const filtroRol = porId('filtroRolUsuario');
    if (filtroRol) {
      filtroRol.addEventListener('change', function() {
        estado.filtroRol = String(filtroRol.value || 'todos');
        renderTablaUsuarios();
      });
    }

    const filtroEstado = porId('filtroEstadoUsuario');
    if (filtroEstado) {
      filtroEstado.addEventListener('change', function() {
        estado.filtroEstado = String(filtroEstado.value || 'todos');
        renderTablaUsuarios();
      });
    }

    const cuerpo = porId('cuerpoUsuarios');
    if (cuerpo) cuerpo.addEventListener('click', manejarAccionTabla);

    const btnNuevo = porId('btnNuevoUsuario');
    if (btnNuevo) btnNuevo.addEventListener('click', function() { abrirFormularioUsuario(null); });

    const btnRefrescar = porId('btnRefrescarUsuarios');
    if (btnRefrescar) {
      btnRefrescar.addEventListener('click', async function() {
        await cargarUsuarios();
        await cargarBitacora();
      });
    }

    const formUsuario = porId('formUsuario');
    if (formUsuario) formUsuario.addEventListener('submit', guardarUsuario);

    const btnCancelarUsuario = porId('btnCancelarUsuario');
    if (btnCancelarUsuario) btnCancelarUsuario.addEventListener('click', cerrarFormularioUsuario);

    const formClave = porId('formClaveUsuario');
    if (formClave) formClave.addEventListener('submit', guardarClave);

    const btnCancelarClave = porId('btnCancelarClaveUsuario');
    if (btnCancelarClave) {
      btnCancelarClave.addEventListener('click', function() {
        // Cuando el cambio es obligatorio no se puede cerrar sin cambiar.
        if (btnCancelarClave.style.display === 'none') return;
        cerrarModalClave();
      });
    }

    // El proceso principal avisa cuando una operación exige iniciar sesión.
    if (api && typeof api.onSesionRequerida === 'function') {
      api.onSesionRequerida(function(mensaje) {
        estado.sesion = null;
        abrirLogin(mensaje || 'Tu sesión expiró. Inicia sesión nuevamente.');
      });
    }

    // Menú de la aplicación: Archivo > Cerrar sesión.
    if (api && typeof api.onCerrarSesionMenu === 'function') {
      api.onCerrarSesionMenu(function() {
        if (estado.sesion) salir();
      });
    }
  }

  async function iniciar() {
    conectarEventos();
    aplicarSesionEnInterfaz();
    observarNavegacion();

    if (!api) return;

    // La licencia debe estar activa antes de permitir el acceso al sistema.
    const licenciaOk = await prepararPantallaLicencia();

    if (!licenciaOk) {
      // Sin licencia válida la app sigue bloqueada: solo se ve la pantalla de activación (nunca una pantalla vacía).
      const capaLogin = porId('loginCapa');
      if (capaLogin) capaLogin.setAttribute('hidden', 'true');
      document.body.classList.add('app-bloqueada');
      return;
    }

    // Catálogos auxiliares: roles y módulos protegidos.
    try {
      const roles = await api.rolesDisponibles();
      estado.roles = Array.isArray(roles) ? roles : [];
    } catch (error) {
      console.warn('usuarios:roles', error);
    }
    try {
      const modulos = await api.modulosProtegidos();
      estado.modulos = Array.isArray(modulos) ? modulos : [];
    } catch (error) {
      console.warn('usuarios:modulos', error);
    }

    // Sesión previa: se conserva al recargar la ventana.
    let sesion = null;
    try {
      sesion = await api.obtenerSesion();
    } catch (error) {
      console.warn('auth:sesion', error);
    }

    if (!sesion) {
      abrirLogin();
      return;
    }

    estado.sesion = sesion;
    cerrarLogin();
    aplicarSesionEnInterfaz();
    aplicarPermisosEnNavegacion();
    if (window.irA) window.irA('inicio');

    // Datos del módulo listos para cuando se abra la vista de usuarios.
    await cargarUsuarios();
    await cargarBitacora();

    if (sesion.debeCambiarContrasena) {
      await pedirCambioContrasena(true);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', iniciar);
  } else {
    iniciar();
  }
})();






