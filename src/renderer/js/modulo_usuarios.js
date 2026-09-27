// ============================================================================
// Modulo Usuarios.
//
// Alta, edicion, desactivacion, restablecimiento de contrasena y eliminacion de
// las cuentas del sistema. Solo lo ve el rol ADMIN: el servidor vuelve a
// comprobarlo en cada canal, asi que ocultar el boton no es la proteccion.
//
// Todos los datos se leen con la API (window.api.usuarios) para que funcione
// igual en la app de escritorio (preload) y en la nube (HTTP).
// ============================================================================

const ROLES_USUARIO = [
  { valor: 'ADMIN', texto: 'Administrador' },
  { valor: 'OPERADOR', texto: 'Operador' },
  { valor: 'CONSULTA', texto: 'Consulta' }
];

function etiquetaRol(rol) {
  const encontrado = ROLES_USUARIO.find(r => r.valor === rol);
  return encontrado ? encontrado.texto : rol;
}

function activoTexto(usuario) {
  return Number(usuario.activo) === 0 ? 'Inactivo' : 'Activo';
}

function claseActivo(usuario) {
  return Number(usuario.activo) === 0 ? 'badge-danger' : 'badge-success';
}

function claseRol(rol) {
  if (rol === 'ADMIN') return 'badge-info';
  if (rol === 'OPERADOR') return 'badge-success';
  return 'badge-neutral';
}

function fechaLegible(valor) {
  if (!valor) return '<span style="color:var(--muted)">Nunca</span>';
  const fecha = new Date(String(valor).replace(' ', 'T'));
  if (Number.isNaN(fecha.getTime())) return esc(valor);
  return esc(new Intl.DateTimeFormat('es-NI', { dateStyle: 'medium', timeStyle: 'short' }).format(fecha));
}

async function renderUsuarios() {
  content.innerHTML = `
    <div class="page-intro page-head">
      <div>
        <h2>Usuarios del sistema</h2>
        <p>Cuentas que pueden entrar a SmartTransPro, con su rol y estado.</p>
      </div>
      <div class="page-actions">
        <button id="btnNuevoUsuario" class="btn primary" type="button">+ Nuevo Usuario</button>
      </div>
    </div>

    <div class="cards" style="grid-template-columns:repeat(4,minmax(0,1fr)); margin-bottom:18px;">
      <div class="card"><div class="card-label">Total de cuentas</div><div id="kpiUsuariosTotal" class="card-value">0</div></div>
      <div class="card"><div class="card-label">Activos</div><div id="kpiUsuariosActivos" class="card-value positive">0</div></div>
      <div class="card"><div class="card-label">Inactivos</div><div id="kpiUsuariosInactivos" class="card-value" style="color:var(--danger)">0</div></div>
      <div class="card"><div class="card-label">Administradores</div><div id="kpiUsuariosAdmins" class="card-value">0</div></div>
    </div>

    <div class="panel">
      <div class="toolbar">
        <div class="field">
          <label>Buscar</label>
          <input id="filtroBuscarUsuario" type="search" placeholder="Nombre, usuario o correo...">
        </div>
        <div class="field">
          <label>Rol</label>
          <select id="filtroRolUsuario">
            <option value="">Todos los roles</option>
            ${ROLES_USUARIO.map(r => `<option value="${r.valor}">${r.texto}</option>`).join('')}
          </select>
        </div>
        <div class="field">
          <label>Estado</label>
          <select id="filtroEstadoUsuario">
            <option value="">Todos</option>
            <option value="1">Solo activos</option>
            <option value="0">Solo inactivos</option>
          </select>
        </div>
        <button id="btnFiltrarUsuarios" class="btn" type="button">Filtrar</button>
        <button id="btnLimpiarUsuarios" class="btn" type="button">Limpiar</button>
      </div>
      <div id="contenedorTablaUsuarios" class="table-wrap">
        <div class="empty">Cargando usuarios...</div>
      </div>
    </div>

    <div id="modalUsuarioContainer"></div>
  `;

  const tabla = document.getElementById('contenedorTablaUsuarios');
  const modalContainer = document.getElementById('modalUsuarioContainer');

  function obtenerFiltros() {
    const estado = document.getElementById('filtroEstadoUsuario').value;
    return {
      token: tokenActual(),
      busqueda: document.getElementById('filtroBuscarUsuario').value.trim(),
      rol: document.getElementById('filtroRolUsuario').value,
      soloActivos: estado === '1',
      estado
    };
  }

  async function actualizarKPIs() {
    try {
      const r = await window.api.usuarios.resumen({ token: tokenActual() });
      document.getElementById('kpiUsuariosTotal').textContent = formatoEntero(r.total);
      document.getElementById('kpiUsuariosActivos').textContent = formatoEntero(r.activos);
      document.getElementById('kpiUsuariosInactivos').textContent = formatoEntero(r.inactivos);
      const admins = (r.porRol || []).find(x => x.rol === 'ADMIN');
      document.getElementById('kpiUsuariosAdmins').textContent = formatoEntero(admins ? admins.total : 0);
    } catch (err) {
      console.error('Error al cargar el resumen de usuarios:', err);
    }
  }

  async function cargarLista() {
    tabla.innerHTML = '<div class="empty">Buscando usuarios...</div>';
    const f = obtenerFiltros();
    try {
      const usuarios = await window.api.usuarios.listar(f);
      // El canal solo conoce "soloActivos", asi que "solo inactivos" se filtra
      // aqui: con eso el selector de estado cubre los tres casos.
      const lista = f.estado === '0' ? usuarios.filter(u => Number(u.activo) === 0) : usuarios;

      if (!lista.length) {
        tabla.innerHTML = '<div class="empty">No hay usuarios con los filtros seleccionados.</div>';
        return;
      }

      tabla.innerHTML = `
        <table>
          <thead>
            <tr>
              <th>USUARIO</th>
              <th>NOMBRE</th>
              <th>ROL</th>
              <th>ESTADO</th>
              <th>ULTIMO ACCESO</th>
              <th style="text-align:right">ACCIONES</th>
            </tr>
          </thead>
          <tbody>
            ${lista.map(u => `
              <tr>
                <td><strong>${esc(u.usuario)}</strong>${u.email ? `<br><small style="color:var(--muted)">${esc(u.email)}</small>` : ''}</td>
                <td>${esc(u.nombre)}${u.debe_cambiar_clave ? '<br><small><span class="badge badge-warning">Debe cambiar clave</span></small>' : ''}</td>
                <td><span class="badge ${claseRol(u.rol)}">${esc(etiquetaRol(u.rol))}</span></td>
                <td><span class="badge ${claseActivo(u)}">${esc(activoTexto(u))}</span></td>
                <td><small>${fechaLegible(u.ultimo_acceso)}</small></td>
                <td style="text-align:right; white-space:nowrap;">
                  <button class="btn btn-sm" data-accion="editar" data-id="${u.id}" type="button">Editar</button>
                  <button class="btn btn-sm" data-accion="clave" data-id="${u.id}" type="button">Clave</button>
                  <button class="btn btn-sm" data-accion="estado" data-id="${u.id}" type="button">${Number(u.activo) === 0 ? 'Activar' : 'Desactivar'}</button>
                  <button class="btn btn-sm btn-danger" data-accion="eliminar" data-id="${u.id}" type="button">Eliminar</button>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `;
    } catch (err) {
      console.error('Error al cargar usuarios:', err);
      tabla.innerHTML = `<div class="empty">${esc(err.message || 'No se pudieron cargar los usuarios.')}</div>`;
    }
  }

  function cerrarModal() {
    modalContainer.innerHTML = '';
  }

  function abrirModalUsuario(usuario = null) {
    const esEdicion = !!usuario;
    const base = usuario || {};
    modalContainer.innerHTML = `
      <div class="modal-overlay" id="usuarioOverlay">
        <div class="modal-box">
          <div class="modal-header">
            <h3>${esEdicion ? 'Editar usuario' : 'Nuevo usuario'}</h3>
            <button class="modal-close" type="button" id="usuarioCerrar" aria-label="Cerrar">&times;</button>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label>Usuario *</label>
              <input id="usuarioCampoUsuario" type="text" value="${esc(base.usuario || '')}" placeholder="jperez" autocomplete="off">
            </div>
            <div class="form-group">
              <label>Nombre completo *</label>
              <input id="usuarioCampoNombre" type="text" value="${esc(base.nombre || '')}" placeholder="Juan Perez">
            </div>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label>Correo electronico</label>
              <input id="usuarioCampoEmail" type="email" value="${esc(base.email || '')}" placeholder="jperez@empresa.com">
            </div>
            <div class="form-group">
              <label>Rol *</label>
              <select id="usuarioCampoRol">
                ${ROLES_USUARIO.map(r => `<option value="${r.valor}" ${r.valor === (base.rol || 'OPERADOR') ? 'selected' : ''}>${r.texto}</option>`).join('')}
              </select>
            </div>
          </div>
          <div class="form-row full">
            <div class="form-group">
              <label>${esEdicion ? 'Nueva contrasena (opcional)' : 'Contrasena *'}</label>
              <input id="usuarioCampoClave" type="password" autocomplete="new-password" placeholder="${esEdicion ? 'Dejar vacio para conservarla' : 'Minimo 6 caracteres'}">
              ${esEdicion ? '<small style="color:var(--muted)">Si escribe una contrasena, se reemplaza la actual y se cierran las sesiones abiertas de este usuario.</small>' : ''}
            </div>
          </div>
          <div class="form-row full">
            <div class="form-group">
              <label style="display:flex; align-items:center; gap:8px; font-weight:400;">
                <input id="usuarioCampoActivo" type="checkbox" ${Number(base.activo) === 0 ? '' : 'checked'} style="width:auto;">
                <span>Usuario activo (puede iniciar sesion)</span>
              </label>
            </div>
            <div class="form-group">
              <label style="display:flex; align-items:center; gap:8px; font-weight:400;">
                <input id="usuarioCampoDebeCambiar" type="checkbox" ${esEdicion ? (base.debe_cambiar_clave ? 'checked' : '') : 'checked'} style="width:auto;">
                <span>Obligar a cambiar la contrasena en el proximo ingreso</span>
              </label>
            </div>
          </div>
          <div id="usuarioError" class="aviso-error" style="display:none;"></div>
          <div class="form-actions" style="display:flex; gap:9px; justify-content:flex-end;">
            <button class="btn" type="button" id="usuarioCancelar">Cancelar</button>
            <button class="btn primary" type="button" id="usuarioGuardar">${esEdicion ? 'Guardar cambios' : 'Crear usuario'}</button>
          </div>
        </div>
      </div>
    `;

    const overlay = document.getElementById('usuarioOverlay');
    const error = document.getElementById('usuarioError');
    document.getElementById('usuarioCerrar').onclick = cerrarModal;
    document.getElementById('usuarioCancelar').onclick = cerrarModal;
    overlay.onclick = (e) => { if (e.target === overlay) cerrarModal(); };
    document.getElementById('usuarioCampoUsuario').focus();

    document.getElementById('usuarioGuardar').onclick = async () => {
      const boton = document.getElementById('usuarioGuardar');
      const datos = {
        token: tokenActual(),
        id: esEdicion ? base.id : undefined,
        usuario: document.getElementById('usuarioCampoUsuario').value.trim(),
        nombre: document.getElementById('usuarioCampoNombre').value.trim(),
        email: document.getElementById('usuarioCampoEmail').value.trim(),
        rol: document.getElementById('usuarioCampoRol').value,
        clave: document.getElementById('usuarioCampoClave').value,
        activo: document.getElementById('usuarioCampoActivo').checked ? 1 : 0,
        debe_cambiar_clave: document.getElementById('usuarioCampoDebeCambiar').checked ? 1 : 0
      };
      boton.disabled = true;
      boton.textContent = 'Guardando...';
      error.style.display = 'none';
      try {
        await window.api.usuarios.guardar(datos);
        cerrarModal();
        await Promise.all([cargarLista(), actualizarKPIs()]);
        await avisarExito(
          esEdicion ? 'Usuario actualizado' : 'Usuario creado',
          esEdicion
            ? `Los cambios de <b>${esc(base.nombre)}</b> quedaron guardados.`
            : `<b>${esc(datos.nombre)}</b> ya puede entrar al sistema con el usuario <b>${esc(datos.usuario)}</b>.`
        );
      } catch (e) {
        error.textContent = e.message || 'No se pudo guardar el usuario.';
        error.style.display = 'block';
      } finally {
        boton.disabled = false;
        boton.textContent = esEdicion ? 'Guardar cambios' : 'Crear usuario';
      }
    };
  }

  // Ventana para que un ADMIN fije una contrasena nueva a otra cuenta.
  function abrirModalClave(usuario) {
    modalContainer.innerHTML = `
      <div class="modal-overlay" id="claveOverlay">
        <div class="modal-box" style="max-width:460px;">
          <div class="modal-header">
            <h3>Restablecer contrasena</h3>
            <button class="modal-close" type="button" id="claveCerrar" aria-label="Cerrar">&times;</button>
          </div>
          <p style="margin-top:0;">Se asignara una contrasena nueva a <strong>${esc(usuario.nombre)}</strong> (${esc(usuario.usuario)}). Se cerraran sus sesiones abiertas y debera cambiarla al ingresar.</p>
          <div class="form-group">
            <label>Nueva contrasena</label>
            <input id="claveCampoNueva" type="password" autocomplete="new-password" placeholder="Minimo 6 caracteres">
          </div>
          <div id="claveError" class="aviso-error" style="display:none;"></div>
          <div class="form-actions" style="display:flex; gap:9px; justify-content:flex-end;">
            <button class="btn" type="button" id="claveCancelar">Cancelar</button>
            <button class="btn primary" type="button" id="claveGuardar">Restablecer</button>
          </div>
        </div>
      </div>
    `;
    const overlay = document.getElementById('claveOverlay');
    const error = document.getElementById('claveError');
    document.getElementById('claveCerrar').onclick = cerrarModal;
    document.getElementById('claveCancelar').onclick = cerrarModal;
    overlay.onclick = (e) => { if (e.target === overlay) cerrarModal(); };
    document.getElementById('claveCampoNueva').focus();

    document.getElementById('claveGuardar').onclick = async () => {
      const boton = document.getElementById('claveGuardar');
      boton.disabled = true;
      boton.textContent = 'Restableciendo...';
      error.style.display = 'none';
      try {
        await window.api.usuarios.restablecerClave({
          token: tokenActual(),
          id: usuario.id,
          clave: document.getElementById('claveCampoNueva').value
        });
        cerrarModal();
        await Promise.all([cargarLista(), actualizarKPIs()]);
        await avisarExito(
          'Contrasena restablecida',
          `Comuniquele a <b>${esc(usuario.nombre)}</b> su nueva contrasena. ` +
          'El sistema le pedira cambiarla en el proximo ingreso.'
        );
      } catch (e) {
        error.textContent = e.message || 'No se pudo restablecer la contrasena.';
        error.style.display = 'block';
      } finally {
        boton.disabled = false;
        boton.textContent = 'Restablecer';
      }
    };
  }

  // Acciones de la tabla. Se delegan en "tabla" porque las filas se redibujan
  // en cada busqueda y los botones se volverian referencias muertas.
  tabla.addEventListener('click', async (evento) => {
    const boton = evento.target.closest('button[data-accion]');
    if (!boton) return;
    const id = Number(boton.dataset.id);
    const usuario = (await window.api.usuarios.listar(obtenerFiltros())).find(u => Number(u.id) === id);
    if (!usuario) {
      await avisar({
        estado: 'advertencia',
        titulo: 'El usuario ya no existe',
        mensaje: 'La lista se actualizara. Vuelva a intentarlo.'
      });
      return cargarLista();
    }

    if (boton.dataset.accion === 'editar') return abrirModalUsuario(usuario);
    if (boton.dataset.accion === 'clave') return abrirModalClave(usuario);

    if (boton.dataset.accion === 'estado') {
      const activando = Number(usuario.activo) === 0;
      const acepta = await confirmarAccion({
        titulo: activando ? '¿Activar este usuario?' : '¿Desactivar este usuario?',
        mensaje: activando
          ? `<b>${esc(usuario.nombre)}</b> podra volver a iniciar sesion con su usuario y contrasena.`
          : `<b>${esc(usuario.nombre)}</b> no podra iniciar sesion y sus sesiones abiertas se cerraran. ` +
            'Podra reactivarlo en cualquier momento.',
        botonOk: activando ? 'Activar' : 'Desactivar',
        okPeligroso: !activando
      });
      if (!acepta) return;
      try {
        await window.api.usuarios.guardar({
          token: tokenActual(),
          id: usuario.id,
          usuario: usuario.usuario,
          nombre: usuario.nombre,
          email: usuario.email,
          rol: usuario.rol,
          activo: activando ? 1 : 0,
          debe_cambiar_clave: usuario.debe_cambiar_clave ? 1 : 0
        });
        await Promise.all([cargarLista(), actualizarKPIs()]);
      } catch (e) {
        await avisarError('No se pudo cambiar el estado', e.message);
      }
      return;
    }

    if (boton.dataset.accion === 'eliminar') {
      const acepta = await confirmarAccion({
        titulo: '¿Eliminar este usuario?',
        mensaje: `Se eliminara la cuenta de <b>${esc(usuario.nombre)}</b> (${esc(usuario.usuario)}) ` +
          'y se cerraran sus sesiones abiertas. Esta accion no se puede deshacer.',
        botonOk: 'Eliminar usuario',
        okPeligroso: true
      });
      if (!acepta) return;
      try {
        await window.api.usuarios.eliminar({ token: tokenActual(), id: usuario.id });
        await Promise.all([cargarLista(), actualizarKPIs()]);
      } catch (e) {
        await avisarError('No se pudo eliminar el usuario', e.message);
      }
    }
  });

  document.getElementById('btnNuevoUsuario').onclick = () => abrirModalUsuario();
  document.getElementById('btnFiltrarUsuarios').onclick = cargarLista;
  document.getElementById('btnLimpiarUsuarios').onclick = () => {
    document.getElementById('filtroBuscarUsuario').value = '';
    document.getElementById('filtroRolUsuario').value = '';
    document.getElementById('filtroEstadoUsuario').value = '';
    cargarLista();
  };

  await Promise.all([cargarLista(), actualizarKPIs()]);
}
