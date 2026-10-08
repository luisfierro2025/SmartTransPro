'use strict';

document.addEventListener('DOMContentLoaded', function() {
const api = (typeof window !== 'undefined' && window.api) || null;
const porId = function(id) { return document.getElementById(id); };
const set = function(id, valor) {
  const elemento = porId(id);
  if (elemento) elemento.textContent = String(valor == null ? '' : valor);
};

// Impresión de informes propios de Clientes y Productos. El acceso se añade
// junto a las acciones existentes y las opciones solo aparecen en este modal.
function prepararImpresionModulos() {
  const html = '<div class="modal-overlay" id="modalImpresionModulo" hidden>' +
    '<section class="modal modal-impresion-modulo" role="dialog" aria-modal="true" aria-labelledby="impresionModuloTitulo">' +
      '<header class="modal-doc-cabecera"><div><h3 id="impresionModuloTitulo">Imprimir</h3><p class="modal-doc-sub" id="impresionModuloSubtitulo"></p></div>' +
        '<button type="button" class="modal-doc-cerrar" id="cerrarImpresionModulo" aria-label="Cerrar">&times;</button></header>' +
      '<div class="modal-doc-cuerpo"><div class="impresion-modulo-filtros">' +
        '<label id="impresionClienteFiltroWrap">Tipo de listado<select id="impresionClienteFiltro"><option value="todos">Todos los clientes</option><option value="con-saldo">Clientes con saldo pendiente</option><option value="sin-saldo">Clientes sin saldo pendiente</option></select></label>' +
        '<label id="impresionProductoFiltroWrap" hidden>Inventario<select id="impresionProductoFiltro"><option value="todos">Inventario completo</option><option value="bajo-stock">Stock bajo</option><option value="agotados">Productos agotados</option><option value="conteo">Hoja de conteo físico</option></select></label>' +
        '<label id="impresionUmbralWrap" hidden>Stock máximo considerado bajo<input id="impresionUmbral" type="number" min="0" max="1000000" value="5"></label>' +
        '<label id="impresionCategoriaWrap" hidden>Categoría contiene<input id="impresionCategoria" type="text" maxlength="80" placeholder="Todas las categorías"></label>' +
        '<label>Buscar<input id="impresionBusqueda" type="search" maxlength="80" placeholder="Código, nombre, teléfono o categoría"></label>' +
      '</div><p class="impresion-modulo-nota" id="impresionModuloNota"></p>' +
      '<div class="impresion-modulo-vista" id="impresionModuloVista" hidden><iframe id="impresionModuloMarco" title="Vista previa del reporte"></iframe></div>' +
      '<p class="impresion-modulo-estado" id="impresionModuloEstado" role="status" hidden></p></div>' +
      '<footer class="modal-doc-pie"><span class="modal-doc-nota">La vista previa se actualiza al cambiar los filtros.</span>' +
        '<button type="button" class="btn-secundario" id="btnPdfModulo">Guardar PDF</button><button type="button" class="btn-primary" id="btnImprimirModulo">Imprimir</button></footer>' +
    '</section></div>';
  document.body.insertAdjacentHTML('beforeend', html);

  function agregarAcceso(modulo, acciones) {
    if (!acciones) return;
    const boton = document.createElement('button');
    boton.type = 'button';
    boton.className = 'pos-vista-boton btn-impresion-modulo';
    boton.title = 'Filtrar, previsualizar, imprimir o guardar este listado en PDF';
    boton.innerHTML = '<svg class="pos-vista-boton-icono" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9V2h12v7"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><path d="M6 14h12v8H6z"/></svg><span class="pos-vista-boton-texto">Imprimir</span>';
    boton.addEventListener('click', function() { abrirImpresionModulo(modulo); });
    const cambioVista = acciones.querySelector('.pos-vista-boton');
    if (cambioVista) acciones.insertBefore(boton, cambioVista);
    else acciones.appendChild(boton);
  }

  agregarAcceso('clientes', porId('btnCambiarVistaClientes') && porId('btnCambiarVistaClientes').parentElement);
  agregarAcceso('productos', porId('btnCambiarVistaProductosAdmin') && porId('btnCambiarVistaProductosAdmin').parentElement);

  const modal = porId('modalImpresionModulo');
  porId('cerrarImpresionModulo').addEventListener('click', cerrarImpresionModulo);
  document.addEventListener('keydown', function(evento) {
    if (evento.key === 'Escape' && modal && !modal.hidden) cerrarImpresionModulo();
  });
  ['impresionClienteFiltro', 'impresionProductoFiltro', 'impresionUmbral', 'impresionCategoria', 'impresionBusqueda'].forEach(function(idCampo) {
    const campo = porId(idCampo);
    campo.addEventListener('input', function() { programarVistaPreviaModulo(idCampo === 'impresionBusqueda' || idCampo === 'impresionCategoria'); });
    campo.addEventListener('change', function() { programarVistaPreviaModulo(false); });
  });
  porId('impresionProductoFiltro').addEventListener('change', actualizarFiltrosImpresionModulo);
  porId('btnImprimirModulo').addEventListener('click', function() { ejecutarImpresionModulo('imprimir'); });
  porId('btnPdfModulo').addEventListener('click', function() { ejecutarImpresionModulo('pdf'); });
}

let impresionModuloActual = null;
let solicitudVistaPreviaModulo = 0;
let temporizadorVistaPreviaModulo = null;

function abrirImpresionModulo(modulo) {
  impresionModuloActual = modulo;
  const esCliente = modulo === 'clientes';
  set('impresionModuloTitulo', esCliente ? 'Imprimir clientes' : 'Imprimir inventario');
  set('impresionModuloSubtitulo', esCliente
    ? 'Elige qué clientes incluir y revisa el documento antes de imprimirlo.'
    : 'Filtra el inventario o prepara una hoja para conteo físico.');
  porId('impresionClienteFiltroWrap').hidden = !esCliente;
  porId('impresionProductoFiltroWrap').hidden = esCliente;
  porId('impresionUmbralWrap').hidden = esCliente;
  porId('impresionCategoriaWrap').hidden = esCliente;
  porId('impresionClienteFiltro').value = 'todos';
  porId('impresionProductoFiltro').value = 'todos';
  porId('impresionUmbral').value = '5';
  porId('impresionCategoria').value = '';
  porId('impresionBusqueda').value = '';
  set('impresionModuloNota', esCliente
    ? 'La base actual no registra fecha de ingreso ni estado activo del cliente; esos filtros todavía no están disponibles.'
    : 'El valor se calcula a precio de venta. El sistema aún no registra costo de compra por producto.');
  actualizarFiltrosImpresionModulo();
  invalidarVistaPrevia();
  porId('impresionModuloEstado').hidden = true;
  porId('modalImpresionModulo').hidden = false;
  programarVistaPreviaModulo(false);
}

function actualizarFiltrosImpresionModulo() {
  const esProducto = impresionModuloActual === 'productos';
  const stockBajo = porId('impresionProductoFiltro').value === 'bajo-stock';
  porId('impresionUmbralWrap').hidden = !esProducto || !stockBajo;
  programarVistaPreviaModulo(false);
}

function opcionesImpresionModulo() {
  if (impresionModuloActual === 'clientes') {
    return { filtro: porId('impresionClienteFiltro').value, busqueda: porId('impresionBusqueda').value.trim() };
  }
  const umbral = Number(porId('impresionUmbral').value);
  if (!Number.isInteger(umbral) || umbral < 0 || umbral > 1000000) {
    throw new Error('El stock máximo debe ser un número entero entre 0 y 1,000,000.');
  }
  return {
    filtro: porId('impresionProductoFiltro').value,
    umbralStock: umbral,
    categoria: porId('impresionCategoria').value.trim(),
    busqueda: porId('impresionBusqueda').value.trim()
  };
}

function invalidarVistaPrevia() {
  const vista = porId('impresionModuloVista');
  if (vista) {
    vista.hidden = false;
    porId('impresionModuloMarco').srcdoc = '<p style="padding:24px;font:14px Segoe UI,Arial,sans-serif;color:#64748b">Actualizando vista previa…</p>';
  }
}

function cerrarImpresionModulo() {
  const modal = porId('modalImpresionModulo');
  if (modal) modal.hidden = true;
  impresionModuloActual = null;
  solicitudVistaPreviaModulo++;
  if (temporizadorVistaPreviaModulo) clearTimeout(temporizadorVistaPreviaModulo);
  temporizadorVistaPreviaModulo = null;
}

function programarVistaPreviaModulo(conDemora) {
  if (!impresionModuloActual) return;
  solicitudVistaPreviaModulo++;
  if (temporizadorVistaPreviaModulo) clearTimeout(temporizadorVistaPreviaModulo);
  const solicitar = function() {
    temporizadorVistaPreviaModulo = null;
    actualizarVistaPreviaModulo();
  };
  if (conDemora) temporizadorVistaPreviaModulo = setTimeout(solicitar, 250);
  else solicitar();
}

async function actualizarVistaPreviaModulo() {
  if (!impresionModuloActual) return;
  const secuencia = solicitudVistaPreviaModulo;
  const estado = porId('impresionModuloEstado');
  estado.hidden = true;
  invalidarVistaPrevia();
  const idActual = impresionModuloActual;
  try {
    const opciones = opcionesImpresionModulo();
    if (!api) throw new Error('El servicio de vista previa no está disponible.');
    const html = await api.previaImpresionModulo(idActual, opciones);
    if (secuencia !== solicitudVistaPreviaModulo || impresionModuloActual !== idActual) return;
    if (typeof html !== 'string' || !html.trim()) throw new Error('El reporte no contiene contenido para mostrar.');
    porId('impresionModuloMarco').srcdoc = html;
  } catch (error) {
    if (secuencia !== solicitudVistaPreviaModulo || impresionModuloActual !== idActual) return;
    const mensaje = error && error.message ? error.message : 'No fue posible actualizar la vista previa.';
    porId('impresionModuloMarco').srcdoc = '<p style="padding:24px;font:14px Segoe UI,Arial,sans-serif;color:#b91c1c">' + esc(mensaje) + '</p>';
    estado.textContent = mensaje;
    estado.hidden = false;
  }
}

async function ejecutarImpresionModulo(accion) {
  if (!impresionModuloActual) return;
  const estado = porId('impresionModuloEstado');
  const botonId = accion === 'pdf' ? 'btnPdfModulo' : 'btnImprimirModulo';
  const boton = porId(botonId);
  const texto = boton.textContent;
  boton.disabled = true;
  boton.textContent = 'Preparando…';
  estado.hidden = true;
  try {
    const opciones = opcionesImpresionModulo();
    if (!api) throw new Error('El servicio de impresión no está disponible.');
    const resultado = accion === 'pdf'
      ? await api.pdfModulo(impresionModuloActual, opciones)
      : await api.imprimirModulo(impresionModuloActual, opciones);
    if (resultado && resultado.ok) {
      if (window.posAviso) await window.posAviso({ titulo: accion === 'pdf' ? 'PDF generado' : 'Impresión', mensaje: resultado.mensaje || 'El documento se procesó correctamente.', icono: accion === 'pdf' ? '📄' : '🖨️' });
      if (!resultado.cancelado) cerrarImpresionModulo();
    } else if (!resultado || !resultado.cancelado) {
      throw new Error(resultado && resultado.mensaje ? resultado.mensaje : 'No fue posible completar la operación.');
    }
  } catch (error) {
    const mensaje = error && error.message ? error.message : 'No fue posible preparar el documento.';
    estado.textContent = mensaje;
    estado.hidden = false;
    if (window.posAviso) await window.posAviso({ titulo: 'Error de impresión', mensaje: mensaje, icono: '⚠️' });
  } finally {
    boton.disabled = false;
    boton.textContent = texto;
  }
}

prepararImpresionModulos();
});

// ==========================================================================
// Módulos profesionales de SmartPosPro: Caja, Compras/Inventario, Reportes
// y Configuración. Independiente de renderer.js (no modifica la lógica existente).
// ==========================================================================
document.addEventListener('DOMContentLoaded', function() {
  const api = (typeof window !== 'undefined' && window.api) || null;

  // Ejecuta la carga inicial solo si ya hay sesion (evita errores 'Debe iniciar sesion' antes del login).
  async function conSesion(tarea) {
    try { if (api && !(await api.obtenerSesion())) return; } catch (err) { return; }
    return tarea();
  }
  const porId = function(id) { return document.getElementById(id); };
  const esc = function(t) {
    return String(t == null ? '' : t)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  };
  const num = function(v) { const n = parseFloat(v); return Number.isFinite(n) ? n : 0; };
  const set = function(id, v) { const el = porId(id); if (el) el.textContent = String(v == null ? '' : v); };
  let moneda = 'C$';
  let configActual = null;
  let turnoCaja = null;
  let resumenCajaActual = null;

  function fmt(monto) { return moneda + (Number(monto) || 0).toFixed(2); }

  // Iniciales para el avatar de las tablas (mismo algoritmo que clienteIniciales en renderer.js):
  // "Distribuidora Central" -> "DC"; una sola palabra usa sus dos primeras letras -> "MO".
  function inicialesDe(nombre) {
    const partes = String(nombre || '').trim().split(/\s+/).filter(Boolean);
    if (partes.length === 0) return '?';
    if (partes.length === 1) return partes[0].substring(0, 2).toUpperCase();
    return (partes[0][0] + partes[partes.length - 1][0]).toUpperCase();
  }

  async function llamar(nombre, fn, aviso) {
    if (!api) {
      if (aviso !== false) await window.posAviso({ tipo: 'aviso', mensaje: 'Esta función requiere ejecutar la aplicación SmartPosPro.' });
      return null;
    }
    try { return await fn(); }
    catch (err) {
      console.warn(nombre, err);
      const detalle = err && err.message ? err.message : 'error inesperado';
      if (aviso !== false) {
        await window.posAviso({ tipo: 'peligro', titulo: 'No se pudo completar', mensaje: 'No se pudo completar la operación.', detalle: detalle });
      }
      return null;
    }
  }

  // ===== 1. CONFIGURACIÓN =====
  function aplicarTema(tema) {
    const valor = tema === 'codigo' ? 'codigo' : tema === 'ejecutivo' ? 'ejecutivo' : 'corporativo';
    document.body.dataset.tema = valor;
    try { localStorage.setItem('pos.tema', valor); } catch (err) { console.warn('tema:preferencia', err); }
  }

  try {
    const temaGuardado = localStorage.getItem('pos.tema');
    if (temaGuardado) aplicarTema(temaGuardado);
  } catch (err) { /* preferencia opcional */ }

  function llenarFormularioConfig(c) {
    if (!c) return;
    const n = porId('configNombre'); if (n) n.value = c.nombre || '';
    const r = porId('configRuc'); if (r) r.value = c.ruc || '';
    const t = porId('configTelefono'); if (t) t.value = c.telefono || '';
    const d = porId('configDireccion'); if (d) d.value = c.direccion || '';
    const m = porId('configMoneda'); if (m) m.value = c.moneda || 'C$';
    const i = porId('configImpuesto'); if (i) i.value = c.impuesto != null ? c.impuesto : 0;
    const impuestoCompra = porId('campoImpuestoCompra'); if (impuestoCompra) impuestoCompra.value = c.impuesto != null ? c.impuesto : 0;
    const s = porId('configStockMinimo'); if (s) s.value = c.stockMinimo != null ? c.stockMinimo : 5;
    const p = porId('configPieTicket'); if (p) p.value = c.pieTicket || '';
    const tema = porId('configTema'); if (tema) tema.value = c.tema || 'corporativo';
    aplicarTema(c.tema || 'corporativo');
  }

  function renderConfigEstado() {
    const cont = porId('configEstado');
    if (!cont || !configActual) return;
    const dato = function(etiqueta, valor) {
      return '<div class="config-dato"><small>' + esc(etiqueta) + '</small><strong>' + esc(valor) + '</strong></div>';
    };
    cont.innerHTML =
      dato('Negocio', configActual.nombre) +
      dato('Moneda', configActual.moneda) +
      dato('Impuesto', configActual.impuesto + ' %') +
      dato('Stock mínimo', configActual.stockMinimo + ' uds');
  }

  async function cargarConfiguracion() {
    const c = await llamar('configuracion:obtener', function() { return api.obtenerConfiguracion(); }, false);
    if (!c) return;
    configActual = c;
    moneda = c.moneda || 'C$';
    llenarFormularioConfig(c);
    renderConfigEstado();
  }

  const btnGuardarConfig = porId('btnGuardarConfig');
  if (btnGuardarConfig) {
    btnGuardarConfig.addEventListener('click', async function() {
      const datos = {
        nombre: (porId('configNombre').value || '').trim(),
        ruc: (porId('configRuc').value || '').trim(),
        telefono: (porId('configTelefono').value || '').trim(),
        direccion: (porId('configDireccion').value || '').trim(),
        moneda: (porId('configMoneda').value || '').trim(),
        impuesto: num(porId('configImpuesto').value),
        stockMinimo: Math.round(num(porId('configStockMinimo').value)),
        pieTicket: (porId('configPieTicket').value || '').trim(),
        tema: porId('configTema') ? porId('configTema').value : 'corporativo'
      };
      const c = await llamar('configuracion:guardar', function() { return api.guardarConfiguracion(datos); });
      if (!c) return;
      configActual = c;
      moneda = c.moneda || 'C$';
      llenarFormularioConfig(c);
      renderConfigEstado();
      refrescarTodo();
      window.dispatchEvent(new CustomEvent('config-actualizada', { detail: c }));
      const aviso = porId('configGuardado');
      if (aviso) aviso.textContent = 'Guardado ✓';
      setTimeout(function() { if (aviso) aviso.textContent = ''; }, 3000);
    });
  }

  function formatearFechaRespaldo(valor) {
    if (!valor) return 'Sin respaldo';
    try {
      return new Intl.DateTimeFormat('es-NI', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(valor));
    } catch (_) { return String(valor); }
  }

  async function actualizarEstadoRespaldo() {
    const estado = await llamar('respaldo:estado', function() { return api.estadoRespaldo(); }, false);
    if (!estado) return;
    const ultimo = porId('respaldoUltimo');
    const cantidad = porId('respaldoCantidad');
    const badge = porId('respaldoEstadoBadge');
    if (ultimo) ultimo.textContent = formatearFechaRespaldo(estado.ultimoRespaldo);
    if (cantidad) cantidad.textContent = String(estado.automaticos || 0);
    if (badge) {
      badge.textContent = estado.existe ? 'Protegida' : 'Sin respaldo automático';
      badge.classList.toggle('respaldo-estado-badge--ok', !!estado.existe);
      badge.classList.toggle('respaldo-estado-badge--alerta', !estado.existe);
    }
  }

  const btnRespaldoConfig = porId('btnRespaldoConfig');
  if (btnRespaldoConfig) {
    btnRespaldoConfig.addEventListener('click', async function() {
      btnRespaldoConfig.disabled = true;
      try {
        const resultado = await llamar('respaldo:exportar', function() { return api.exportarRespaldo(); });
        if (!resultado || !resultado.ok) return;
        await window.posAviso({
          tipo: 'exito',
          titulo: 'Respaldo creado y verificado',
          mensaje: 'La copia completa de la base de datos fue creada correctamente.',
          detalle: resultado.ruta
        });
        await actualizarEstadoRespaldo();
      } finally { btnRespaldoConfig.disabled = false; }
    });
  }

  const btnRestaurarRespaldo = porId('btnRestaurarRespaldo');
  if (btnRestaurarRespaldo) {
    btnRestaurarRespaldo.addEventListener('click', async function() {
      btnRestaurarRespaldo.disabled = true;
      try {
        const seleccionado = await llamar('respaldo:seleccionar', function() { return api.seleccionarRespaldo(); });
        if (!seleccionado || !seleccionado.ok) return;
        const mb = (Number(seleccionado.tamanoBytes || 0) / 1024 / 1024).toFixed(2);
        const confirmado = await window.posConfirmar({
          tipo: 'peligro',
          titulo: 'Restaurar base de datos',
          mensaje: 'Se reemplazarán los datos actuales por los del respaldo seleccionado.',
          detalle: 'Archivo: ' + seleccionado.ruta + '\nTamaño: ' + mb + ' MB\nTablas verificadas: ' + seleccionado.tablas + '.\n\nSmartPosPro creará primero una copia de seguridad de la base actual. La aplicación se reiniciará automáticamente.',
          aceptar: 'Sí, restaurar y reiniciar'
        });
        if (!confirmado) return;
        const resultado = await llamar('respaldo:restaurar', function() { return api.restaurarRespaldo(seleccionado.ruta); });
        if (resultado && resultado.ok) {
          await window.posAviso({ tipo: 'exito', titulo: 'Restauración completada', mensaje: 'La base de datos fue restaurada. SmartPosPro se reiniciará.' });
        }
      } finally { btnRestaurarRespaldo.disabled = false; }
    });
  }

  const btnAbrirCarpetaRespaldos = porId('btnAbrirCarpetaRespaldos');
  if (btnAbrirCarpetaRespaldos) {
    btnAbrirCarpetaRespaldos.addEventListener('click', async function() {
      await llamar('respaldo:abrir-carpeta', function() { return api.abrirCarpetaRespaldos(); });
    });
  }
  conSesion(actualizarEstadoRespaldo);

  const btnRestablecerConfig = porId('btnRestablecerConfig');
  if (btnRestablecerConfig) {
    btnRestablecerConfig.addEventListener('click', async function() {
      const confirmado = await window.posConfirmar({
        tipo: 'peligro',
        titulo: 'Restablecer configuración',
        mensaje: 'Se devolverán todos los datos del negocio, impuestos y ticket a los valores predeterminados.',
        detalle: 'Moneda, nombre, RUC, teléfono, dirección, impuesto, stock mínimo, pie de ticket y tema.',
        aceptar: 'Sí, restablecer'
      });
      if (!confirmado) return;
      const c = await llamar('configuracion:restablecer', function() { return api.restablecerConfiguracion(); });
      if (!c) return;
      configActual = c;
      moneda = c.moneda || 'C$';
      llenarFormularioConfig(c);
      renderConfigEstado();
      refrescarTodo();
      window.dispatchEvent(new CustomEvent('config-actualizada', { detail: c }));
    });
  }

  // --- Mejoras de Configuración: resumen en vivo, cambios sin guardar y vista previa del ticket ---
  // Todo usa canales IPC que ya existen (stats:resumen, proveedores:listar,
  // compras:listar, inventario:valorizado, caja:turnos). No se crearon canales
  // nuevos ni se modificaron los flujos de guardar/restablecer: solo se añaden
  // listeners extra que complementan los existentes.
  async function renderActividadSistema() {
    const cont = porId('configActividad');
    if (!cont) return;
    const resultados = await Promise.all([
      llamar('stats:resumen', function() { return api.obtenerResumen(); }, false),
      llamar('proveedores:listar', function() { return api.listarProveedores(); }, false),
      llamar('compras:listar', function() { return api.listarCompras(); }, false),
      llamar('inventario:valorizado', function() { return api.inventarioValorizado(); }, false),
      llamar('caja:turnos', function() { return api.cajaTurnos(); }, false)
    ]);
    const stats = resultados[0] || {};
    const proveedores = Array.isArray(resultados[1]) ? resultados[1] : null;
    const compras = Array.isArray(resultados[2]) ? resultados[2] : null;
    const valorizado = resultados[3] || null;
    const turnos = Array.isArray(resultados[4]) ? resultados[4] : null;
    const items = [
      { clase: 'clientes', etiqueta: 'Clientes', valor: stats.totalClientes != null ? String(stats.totalClientes) : '—' },
      { clase: 'productos', etiqueta: 'Productos', valor: stats.totalProductos != null ? String(stats.totalProductos) : '—' },
      { clase: 'ventas', etiqueta: 'Ventas', valor: stats.totalVentas != null ? String(stats.totalVentas) : '—' },
      { clase: 'proveedores', etiqueta: 'Proveedores', valor: proveedores ? String(proveedores.length) : '—' },
      { clase: 'compras', etiqueta: 'Compras', valor: compras ? String(compras.length) : '—' },
      {
        clase: 'inventario',
        etiqueta: 'Inventario (venta)',
        valor: valorizado && valorizado.venta != null ? fmt(valorizado.venta) : '—',
        detalle: valorizado
          ? 'Costo registrado: ' + fmt(valorizado.costo) +
            (Number(valorizado.productosSinCosto) > 0
              ? ' · ' + Number(valorizado.productosSinCosto) + ' producto(s) sin costo'
              : '')
          : ''
      },
      { clase: 'caja', etiqueta: 'Turnos de caja', valor: turnos ? String(turnos.length) : '—' }
    ];
    cont.innerHTML = items.map(function(it) {
      return '<div class="config-sistema-item config-sistema--' + it.clase + '"><small>' + esc(it.etiqueta) + '</small><strong>' + esc(it.valor) + '</strong>' +
        (it.detalle ? '<span class="config-sistema-detalle">' + esc(it.detalle) + '</span>' : '') + '</div>';
    }).join('');
  }

  function actualizarPreviewTicket() {
    const nombreEl = porId('configPreviewNombre');
    const pieEl = porId('configPreviewPie');
    if (!nombreEl || !pieEl) return;
    const campoNombre = porId('configNombre');
    const campoPie = porId('configPieTicket');
    const campoMoneda = porId('configMoneda');
    const campoImpuesto = porId('configImpuesto');
    nombreEl.textContent = (campoNombre && campoNombre.value.trim()) || 'Mi negocio';
    pieEl.textContent = (campoPie && campoPie.value.trim()) || '¡Gracias por su compra!';
    const simbolo = (campoMoneda && campoMoneda.value.trim()) || 'C$';
    const impuesto = Math.max(0, num(campoImpuesto ? campoImpuesto.value : 0));
    const subtotal = 100;
    const cuotaImpuesto = Math.round(subtotal * impuesto) / 100;
    const etiqueta = porId('configPreviewImpuestoEtiqueta');
    if (etiqueta) etiqueta.textContent = 'Impuesto (' + impuesto + ' %)';
    const put = function(idCelda, valor) { const el = porId(idCelda); if (el) el.textContent = valor; };
    put('configPreviewSubtotal', simbolo + subtotal.toFixed(2));
    put('configPreviewImpuesto', simbolo + cuotaImpuesto.toFixed(2));
    put('configPreviewTotal', simbolo + (subtotal + cuotaImpuesto).toFixed(2));
  }

  const camposConfig = ['configNombre', 'configRuc', 'configTelefono', 'configDireccion', 'configMoneda', 'configImpuesto', 'configStockMinimo', 'configPieTicket', 'configTema'];
  function actualizarEstadoSucio() {
    const aviso = porId('configPendiente');
    const boton = porId('btnGuardarConfig');
    if (!configActual) { if (aviso) aviso.hidden = true; if (boton) boton.classList.remove('config-sucio'); return; }
    const cambio = camposConfig.some(function(nombreCampo) {
      const el = porId(nombreCampo);
      if (!el) return false;
      const valor = (el.value || '').trim();
      if (nombreCampo === 'configImpuesto') return Math.abs(num(valor) - num(configActual.impuesto != null ? configActual.impuesto : 0)) > 0.0001;
      if (nombreCampo === 'configStockMinimo') return Math.round(num(valor)) !== Math.round(num(configActual.stockMinimo != null ? configActual.stockMinimo : 5));
      if (nombreCampo === 'configNombre') return valor !== (configActual.nombre || '');
      if (nombreCampo === 'configRuc') return valor !== (configActual.ruc || '');
      if (nombreCampo === 'configTelefono') return valor !== (configActual.telefono || '');
      if (nombreCampo === 'configDireccion') return valor !== (configActual.direccion || '');
      if (nombreCampo === 'configMoneda') return valor !== (configActual.moneda || 'C$');
      if (nombreCampo === 'configPieTicket') return valor !== (configActual.pieTicket || '');
      if (nombreCampo === 'configTema') return valor !== (configActual.tema || 'corporativo');
      return false;
    });
    if (aviso) aviso.hidden = !cambio;
    if (boton) boton.classList.toggle('config-sucio', cambio);
  }
  const selectorTema = porId('configTema');
  if (selectorTema) selectorTema.addEventListener('change', function() {
    aplicarTema(selectorTema.value);
    actualizarEstadoSucio();
  });

  camposConfig.forEach(function(nombreCampo) {
    const el = porId(nombreCampo);
    if (!el) return;
    el.addEventListener('input', function() {
      actualizarEstadoSucio();
      actualizarPreviewTicket();
    });
  });
  ['btnGuardarConfig', 'btnRestablecerConfig'].forEach(function(idBoton) {
    const el = porId(idBoton);
    if (el) el.addEventListener('click', function() { setTimeout(function() { actualizarEstadoSucio(); actualizarPreviewTicket(); }, 600); });
  });
  const btnActualizarEstado = porId('btnActualizarEstado');
  if (btnActualizarEstado) btnActualizarEstado.addEventListener('click', function() { renderActividadSistema(); });
  conSesion(renderActividadSistema);
  actualizarPreviewTicket();
  setTimeout(function() { actualizarEstadoSucio(); actualizarPreviewTicket(); }, 900);

  // ===== 2. CAJA =====
  // Relee el turno abierto y su resumen con datos vivos del proceso principal.
  // Es imprescindible volver a consultarlos antes de mostrar el arqueo: las
  // ventas se registran desde el módulo de ventas, así que la vista de caja
  // puede quedarse con cifras viejas (sin las ventas del turno) si solo se
  // refresca al arrancar la app o al abrir/mover el turno.
  async function actualizarResumenCaja() {
    // La API expone el turno abierto y su resumen por separado (preload.js)
    const turno = await llamar('caja:turno-abierto', function() { return api.cajaTurnoAbierto(); }, false);
    turnoCaja = turno || null;
    resumenCajaActual = turnoCaja
      ? await llamar('caja:resumen', function() { return api.cajaResumen(turnoCaja.id); }, false)
      : null;

    const btnCerrar = porId('btnCerrarCaja');
    if (btnCerrar) btnCerrar.hidden = !turnoCaja;

    if (resumenCajaActual) {
      set('cajaFondoInicial', fmt(resumenCajaActual.montoInicial));
      set('cajaVentasContado', fmt(resumenCajaActual.ventasContado));
      set('cajaVentasCredito', fmt(resumenCajaActual.ventasCredito));
      set('cajaAbonosCobrados', fmt(resumenCajaActual.abonos));
      set('cajaEfectivoEsperado', fmt(resumenCajaActual.esperado));
      set('cajaMovimientosNetos', fmt((resumenCajaActual.ingresos || 0) - (resumenCajaActual.egresos || 0)));
    } else {
      set('cajaFondoInicial', fmt(0));
      set('cajaVentasContado', fmt(0));
      set('cajaVentasCredito', fmt(0));
      set('cajaAbonosCobrados', fmt(0));
      set('cajaEfectivoEsperado', fmt(0));
      set('cajaMovimientosNetos', fmt(0));
    }

    const btnAbrir = porId('btnAbrirCaja');
    const btnMov = porId('btnMovimientoCaja');
    if (btnAbrir) btnAbrir.hidden = !!turnoCaja;
    if (btnMov) btnMov.hidden = !turnoCaja;

    const estadoCaja = porId('estadoCaja');
    if (estadoCaja) {
      estadoCaja.textContent = turnoCaja
        ? 'Turno abierto · Responsable: ' + (turnoCaja.usuario || 'Administrador') + ' · Desde: ' + turnoCaja.abierto
        : 'No hay un turno de caja abierto.';
    }

    return resumenCajaActual;
  }

  // Refresca la vista completa de caja: cifras del turno, estado y tablas.
  async function refrescarCaja() {
    await actualizarResumenCaja();

    if (turnoCaja) {
      const movs = await llamar('caja:movimientos', function() { return api.cajaMovimientos(turnoCaja.id); }, false);
      renderTablaMovimientosCaja(Array.isArray(movs) ? movs : []);
    } else {
      renderTablaMovimientosCaja([]);
    }
    const turnos = await llamar('caja:turnos', function() { return api.cajaTurnos(20); }, false);
    renderTablaTurnosCaja(Array.isArray(turnos) ? turnos : []);
  }

  // Al volver a la vista de caja se relee el turno: así el panel muestra las
  // ventas de contado registradas mientras la vista estaba oculta.
  const vistaCaja = porId('vista-caja');
  if (vistaCaja && typeof MutationObserver === 'function') {
    new MutationObserver(function() {
      if (!vistaCaja.hasAttribute('hidden')) refrescarCaja();
    }).observe(vistaCaja, { attributes: true, attributeFilter: ['hidden'] });
  }

  function renderTablaMovimientosCaja(movs) {
    const tbody = porId('tablaMovimientosCaja');
    if (!tbody) return;
    tbody.innerHTML = movs.map(function(m) {
      return '<tr><td>' + esc(m.fecha) + '</td><td>' + esc(m.tipo) + '</td><td>' + esc(m.concepto) + '</td><td class="num">' + esc(fmt(m.monto)) + '</td></tr>';
    }).join('');
    const vacio = porId('sinMovimientosCaja');
    if (vacio) vacio.hidden = movs.length > 0;
  }

  function renderTablaTurnosCaja(turnos) {
    const tbody = porId('tablaTurnosCaja');
    if (!tbody) return;
    tbody.innerHTML = turnos.map(function(t) {
      return '<tr><td>' + t.id + '</td><td>' + esc(t.abierto) + '</td><td>' + esc(t.cerrado || '—') + '</td>' +
        '<td>' + esc(t.usuario) + '</td><td class="num">' + esc(fmt(t.monto_inicial)) + '</td>' +
        '<td class="num">' + esc(t.esperado != null ? fmt(t.esperado) : '—') + '</td>' +
        '<td class="num">' + esc(t.monto_contado != null ? fmt(t.monto_contado) : '—') + '</td>' +
        '<td class="num">' + esc(t.diferencia != null ? fmt(t.diferencia) : '—') + '</td>' +
        '<td>' + esc(t.estado) + '</td></tr>';
    }).join('');
    const vacio = porId('sinTurnosCaja');
    if (vacio) vacio.hidden = turnos.length > 0;
  }

  // ---- Abrir caja ----
  const btnAbrirCaja = porId('btnAbrirCaja');
  if (btnAbrirCaja) {
    btnAbrirCaja.addEventListener('click', function() {
      const form = porId('formAbrirCaja');
      if (form) form.reset();
      const modal = porId('modalAbrirCaja');
      if (modal) modal.removeAttribute('hidden');
    });
  }
  const btnCancelarAbrirCaja = porId('btnCancelarAbrirCaja');
  if (btnCancelarAbrirCaja) {
    btnCancelarAbrirCaja.addEventListener('click', function() {
      porId('modalAbrirCaja').setAttribute('hidden', 'true');
    });
  }
  const formAbrirCaja = porId('formAbrirCaja');
  if (formAbrirCaja) {
    formAbrirCaja.addEventListener('submit', async function(e) {
      e.preventDefault();
      const usuario = (porId('campoResponsableCaja').value || '').trim() || 'Administrador';
      const monto = num(porId('campoMontoInicial').value);
      const turno = await llamar('caja:abrir', function() { return api.cajaAbrir(usuario, monto); });
      if (!turno) return;
      porId('modalAbrirCaja').setAttribute('hidden', 'true');
      formAbrirCaja.reset();
      await refrescarCaja();
      await actualizarEstadoCajaGlobal();
    });
  }

  // ---- Movimiento de efectivo (ingreso / egreso) ----
  const btnMovimientoCaja = porId('btnMovimientoCaja');
  if (btnMovimientoCaja) {
    btnMovimientoCaja.addEventListener('click', async function() {
      if (!turnoCaja) {
        await window.posAviso({ tipo: 'aviso', titulo: 'Sin turno abierto', mensaje: 'Abre un turno de caja antes de registrar movimientos.' });
        return;
      }
      const form = porId('formMovimientoCaja');
      if (form) form.reset();
      const modal = porId('modalMovimientoCaja');
      if (modal) modal.removeAttribute('hidden');
    });
  }
  const btnCancelarMovCaja = porId('btnCancelarMovCaja');
  if (btnCancelarMovCaja) {
    btnCancelarMovCaja.addEventListener('click', function() {
      porId('modalMovimientoCaja').setAttribute('hidden', 'true');
    });
  }
  const formMovimientoCaja = porId('formMovimientoCaja');
  if (formMovimientoCaja) {
    formMovimientoCaja.addEventListener('submit', async function(e) {
      e.preventDefault();
      if (!turnoCaja) return;
      const tipo = porId('selectTipoMovimientoCaja').value || 'ingreso';
      const concepto = (porId('campoConceptoCaja').value || '').trim();
      const monto = num(porId('campoMontoCaja').value);
      if (!concepto) {
        await window.posAviso({ tipo: 'aviso', titulo: 'Concepto requerido', mensaje: 'Escribe un concepto para el movimiento.' });
        return;
      }
      if (monto <= 0) {
        await window.posAviso({ tipo: 'aviso', titulo: 'Monto inválido', mensaje: 'El monto debe ser mayor a cero.' });
        return;
      }
      const res = await llamar('caja:movimiento', function() { return api.cajaMovimiento(turnoCaja.id, tipo, concepto, monto); });
      if (!res) return;
      porId('modalMovimientoCaja').setAttribute('hidden', 'true');
      formMovimientoCaja.reset();
      await refrescarCaja();
      await actualizarEstadoCajaGlobal();
    });
  }

  // ---- Cerrar caja ----
  // Desglose del efectivo que debe haber en caja: se muestra en el arqueo para
  // que el cajero sepa cuánto se vendió de contado antes de contar el dinero.
  function desgloseEfectivoEsperado(resumen) {
    if (!resumen) return 'No se pudo leer el resumen del turno de caja.';
    return 'Efectivo esperado: ' + fmt(resumen.esperado) +
      ' = fondo inicial ' + fmt(resumen.montoInicial) +
      ' + ventas de contado ' + fmt(resumen.ventasContado) +
      ' + movimientos ' + fmt((resumen.ingresos || 0) - (resumen.egresos || 0));
  }

  // Diferencia en vivo entre el efectivo contado y el esperado del turno.
  function mostrarDiferenciaCierre() {
    const aviso = porId('cierreDiferencia');
    const campo = porId('campoMontoContado');
    if (!aviso) return;
    if (!resumenCajaActual || !campo) {
      aviso.hidden = true;
      aviso.textContent = '';
      return;
    }
    const esperado = Number(resumenCajaActual.esperado) || 0;
    const contado = num(campo.value);
    const diferencia = Math.round((contado - esperado) * 100) / 100;
    aviso.hidden = false;
    if (Math.abs(diferencia) < 0.005) {
      aviso.textContent = 'Cuadra con lo esperado (' + fmt(esperado) + ').';
    } else {
      aviso.textContent = (diferencia > 0 ? 'Sobrante ' : 'Faltante ') + fmt(Math.abs(diferencia)) +
        ' · Contado ' + fmt(contado) + ' vs esperado ' + fmt(esperado);
    }
  }

  const btnCerrarCaja = porId('btnCerrarCaja');
  if (btnCerrarCaja) {
    btnCerrarCaja.addEventListener('click', async function() {
      const aviso = porId('cierreResumen');
      if (aviso) aviso.textContent = 'Leyendo las ventas del turno…';
      // Recalcular ANTES de mostrar el arqueo: el cierre debe reflejar las
      // ventas de contado del turno, no las que había en el último refresco.
      await actualizarResumenCaja();
      if (aviso) aviso.textContent = desgloseEfectivoEsperado(resumenCajaActual);
      const campoContado = porId('campoMontoContado');
      if (campoContado && resumenCajaActual) {
        campoContado.value = (Number(resumenCajaActual.esperado) || 0).toFixed(2);
      }
      mostrarDiferenciaCierre();
      const modal = porId('modalCerrarCaja');
      if (modal) modal.removeAttribute('hidden');
    });
  }

  const campoMontoContado = porId('campoMontoContado');
  if (campoMontoContado) campoMontoContado.addEventListener('input', mostrarDiferenciaCierre);

  const formCerrarCaja = porId('formCerrarCaja');
  if (formCerrarCaja) {
    formCerrarCaja.addEventListener('submit', async function(e) {
      e.preventDefault();
      if (!turnoCaja) {
        await window.posAviso({ tipo: 'aviso', titulo: 'Turno cerrado', mensaje: 'No hay un turno de caja abierto.' });
        return;
      }
      const montoContado = num(porId('campoMontoContado').value);
      const notas = (porId('campoNotasCierre').value || '').trim();
      const cierre = await llamar('caja:cerrar', function() { return api.cajaCerrar(turnoCaja.id, montoContado, notas); });
      if (!cierre) return;
      porId('modalCerrarCaja').setAttribute('hidden', 'true');
      formCerrarCaja.reset();
      const cuadra = Math.abs(Number(cierre.diferencia) || 0) < 0.005;
      await window.posAviso({
        tipo: cuadra ? 'exito' : 'aviso',
        titulo: cuadra ? 'Cierre cuadrado' : 'Cierre con diferencia',
        mensaje: cuadra
          ? 'El efectivo contado coincide con lo esperado.'
          : 'Revisa el arqueo del turno: lo contado no coincide con lo esperado.',
        detalle: 'Contado: ' + fmt(montoContado) +
          ' · Esperado: ' + fmt(cierre.resumen ? cierre.resumen.esperado : 0) +
          ' · Diferencia: ' + fmt(cierre.diferencia) + (cuadra ? '' : (cierre.diferencia > 0 ? ' (sobrante)' : ' (faltante)'))
      });
      await refrescarCaja();
      await actualizarEstadoCajaGlobal();
    });
  }

  const btnCancelarCerrarCaja = porId('btnCancelarCerrarCaja');
  if (btnCancelarCerrarCaja) {
    btnCancelarCerrarCaja.addEventListener('click', function() {
      porId('modalCerrarCaja').setAttribute('hidden', 'true');
    });
  }

  // ===== 3. COMPRAS: subpestañas y proveedores =====
  function activarSubpestana(panel) {
    document.querySelectorAll('#vista-compras .subpestana').forEach(function(b) {
      const activo = b.getAttribute('data-panel') === panel;
      b.classList.toggle('activo', activo);
      b.setAttribute('aria-pressed', String(activo));
    });
    const paneles = { prov: 'paneProveedores', compra: 'paneCompra', inv: 'paneInventario' };
    Object.keys(paneles).forEach(function(clave) {
      const el = porId(paneles[clave]);
      if (!el) return;
      if (clave === panel) el.removeAttribute('hidden');
      else el.setAttribute('hidden', 'true');
    });
  }

  document.querySelectorAll('#vista-compras .subpestana').forEach(function(b) {
    b.addEventListener('click', function() {
      const panel = b.getAttribute('data-panel');
      if (panel) activarSubpestana(panel);
    });
  });

  let proveedores = [];
  let comprasRegistradas = [];
  let catalogoProductos = [];

  function renderTablaProveedores() {
    const tbody = porId('tablaProveedores');
    if (!tbody) return;
    const buscador = porId('buscadorProveedores');
    const q = (buscador ? buscador.value : '').trim().toLowerCase();
    const lista = proveedores.filter(function(p) {
      if (!q) return true;
      return (p.nombre || '').toLowerCase().indexOf(q) !== -1 || (p.contacto || '').toLowerCase().indexOf(q) !== -1;
    });
    const conteo = {};
    comprasRegistradas.forEach(function(c) {
      const clave = c.proveedor_id === null || c.proveedor_id === undefined ? 'sin' : String(c.proveedor_id);
      conteo[clave] = (conteo[clave] || 0) + 1;
    });
    tbody.innerHTML = lista.map(function(p) {
      const nCompras = conteo[String(p.id)] || 0;
      return '<tr>' +
        '<td>' + p.id + '</td>' +
        '<td><div class="tabla-celda-nombre">' +
          '<span class="tabla-avatar" aria-hidden="true">' + esc(inicialesDe(p.nombre)) + '</span>' +
          '<span class="celda-texto" title="' + esc(p.nombre) + '">' + esc(p.nombre) + '</span>' +
        '</div></td>' +
        '<td>' + esc(p.contacto || '—') + '</td>' +
        '<td>' + esc(p.telefono || '—') + '</td>' +
        '<td>' + esc(p.correo || '—') + '</td>' +
        '<td class="num">' + nCompras + '</td>' +
        '<td>' +
          '<button type="button" class="btn-editar" onclick="editarProveedor(' + p.id + ')">Editar</button>' +
          '<button type="button" class="btn-eliminar" onclick="eliminarProveedor(' + p.id + ')">Eliminar</button>' +
        '</td>' +
      '</tr>';
    }).join('');
    const contador = porId('contadorProveedores');
    if (contador) contador.textContent = lista.length + (lista.length === 1 ? ' proveedor' : ' proveedores');
    const vacio = porId('sinProveedores');
    if (vacio) vacio.hidden = lista.length > 0;
  }

  async function cargarProveedores() {
    const lista = await llamar('proveedores:listar', function() { return api.listarProveedores(); }, false);
    proveedores = Array.isArray(lista) ? lista : [];
    renderTablaProveedores();
    llenarSelectProveedores();
  }

  const buscadorProveedores = porId('buscadorProveedores');
  if (buscadorProveedores) buscadorProveedores.addEventListener('input', renderTablaProveedores);

  window.editarProveedor = function(id) {
    const p = proveedores.find(function(x) { return Number(x.id) === Number(id); });
    if (!p) return;
    const titulo = porId('modalTituloProveedor');
    if (titulo) titulo.textContent = 'Editar proveedor';
    const mapa = {
      proveedorId: p.id,
      campoNombreProveedor: p.nombre,
      campoContactoProveedor: p.contacto,
      campoTelefonoProveedor: p.telefono,
      campoCorreoProveedor: p.correo,
      campoDireccionProveedor: p.direccion,
      campoNotasProveedor: p.notas
    };
    Object.keys(mapa).forEach(function(cid) { const el = porId(cid); if (el) el.value = mapa[cid]; });
    const modal = porId('modalProveedor');
    if (modal) modal.removeAttribute('hidden');
  };

  window.eliminarProveedor = async function(id) {
    const proveedor = proveedores.find(function(x) { return Number(x.id) === Number(id); }) || null;
    const confirmado = await window.posConfirmar({
      tipo: 'peligro',
      titulo: 'Eliminar proveedor',
      mensaje: 'El proveedor se quitará de la lista y no se puede deshacer.',
      detalle: proveedor ? proveedor.nombre : '',
      aceptar: 'Sí, eliminar'
    });
    if (!confirmado) return;
    const ok = await llamar('proveedores:eliminar', function() { return api.eliminarProveedor(Number(id)); });
    if (ok === null) return;
    await cargarProveedores();
  };

  const btnNuevoProveedor = porId('btnNuevoProveedor');
  if (btnNuevoProveedor) {
    btnNuevoProveedor.addEventListener('click', function() {
      const titulo = porId('modalTituloProveedor');
      if (titulo) titulo.textContent = 'Nuevo proveedor';
      const form = porId('formProveedor');
      if (form) form.reset();
      const pid = porId('proveedorId');
      if (pid) pid.value = '';
      const modal = porId('modalProveedor');
      if (modal) modal.removeAttribute('hidden');
    });
  }
  const btnCancelarProveedor = porId('btnCancelarProveedor');
  if (btnCancelarProveedor) {
    btnCancelarProveedor.addEventListener('click', function() {
      porId('modalProveedor').setAttribute('hidden', 'true');
    });
  }
  const formProveedor = porId('formProveedor');
  if (formProveedor) {
    formProveedor.addEventListener('submit', async function(e) {
      e.preventDefault();
      const datos = {
        nombre: (porId('campoNombreProveedor').value || '').trim(),
        contacto: (porId('campoContactoProveedor').value || '').trim(),
        telefono: (porId('campoTelefonoProveedor').value || '').trim(),
        correo: (porId('campoCorreoProveedor').value || '').trim(),
        direccion: (porId('campoDireccionProveedor').value || '').trim(),
        notas: (porId('campoNotasProveedor').value || '').trim()
      };
      const pid = parseInt(porId('proveedorId').value, 10) || 0;
      const guardado = pid > 0
        ? await llamar('proveedores:editar', function() { return api.editarProveedor(pid, datos); })
        : await llamar('proveedores:crear', function() { return api.crearProveedor(datos); });
      if (!guardado) return;
      porId('modalProveedor').setAttribute('hidden', 'true');
      formProveedor.reset();
      await cargarProveedores();
    });
  }

  // ===== 4. COMPRAS: registro de compras =====
  function llenarSelectProveedores() {
    const sel = porId('selectProveedorCompra');
    if (!sel) return;
    const prev = sel.value;
    sel.innerHTML = '<option value="">Sin proveedor (compra libre)</option>' +
      proveedores.map(function(p) { return '<option value="' + p.id + '">' + esc(p.nombre) + '</option>'; }).join('');
    if (prev && sel.querySelector('option[value="' + prev + '"]')) sel.value = prev;
  }

  function llenarSelectProductos() {
    const opciones = catalogoProductos.map(function(p) {
      return '<option value="' + p.id + '">' + esc(p.nombre) + ' · stock ' + p.stock + '</option>';
    }).join('');
    ['selectProductoCompra', 'selectProductoAjuste'].forEach(function(sid) {
      const sel = porId(sid);
      if (!sel) return;
      const prev = sel.value;
      sel.innerHTML = opciones;
      if (prev && sel.querySelector('option[value="' + prev + '"]')) sel.value = prev;
    });
  }

  async function cargarCatalogoProductos() {
    const lista = await llamar('productos:listar', function() { return api.listarProductos(); }, false);
    catalogoProductos = Array.isArray(lista)
      ? lista.map(function(p) {
          return { id: Number(p.id), nombre: p.nombre, stock: Number(p.stock) || 0, precio: Number(p.precio) || 0, categoria: p.categoria || '' };
        })
      : [];
    llenarSelectProductos();
  }

  let itemsCompra = [];

  function renderItemsCompra() {
    const tbody = porId('tablaItemsCompra');
    if (tbody) {
      tbody.innerHTML = itemsCompra.map(function(item, i) {
        const prod = catalogoProductos.find(function(p) { return Number(p.id) === Number(item.productoId); });
        const nombre = prod ? prod.nombre : 'Producto #' + item.productoId;
        return '<tr>' +
          '<td>' + esc(nombre) + '</td>' +
          '<td class="num">' + item.cantidad + '</td>' +
          '<td class="num">' + esc(fmt(item.costo)) + '</td>' +
          '<td class="num">' + esc(fmt(item.cantidad * item.costo)) + '</td>' +
          '<td><button type="button" class="btn-eliminar" onclick="quitarItemCompra(' + i + ')">Quitar</button></td>' +
        '</tr>';
      }).join('');
    }
    const subtotal = itemsCompra.reduce(function(s, i) { return s + i.cantidad * i.costo; }, 0);
    const pct = num((porId('campoImpuestoCompra') || {}).value);
    const impuesto = subtotal * (pct / 100);
    set('subtotalCompra', fmt(subtotal));
    set('impuestoCompra', fmt(impuesto));
    set('totalCompra', fmt(subtotal + impuesto));
    const contador = porId('contadorItemsCompra');
    const articulos = itemsCompra.reduce(function(s, i) { return s + i.cantidad; }, 0);
    if (contador) contador.textContent = articulos + (articulos === 1 ? ' artículo' : ' artículos');
    const vacio = porId('sinItemsCompra');
    if (vacio) vacio.hidden = itemsCompra.length > 0;
    const btn = porId('btnRegistrarCompra');
    if (btn) btn.disabled = itemsCompra.length === 0;
  }

  window.quitarItemCompra = function(idx) {
    itemsCompra.splice(idx, 1);
    renderItemsCompra();
  };

  const campoImpuestoCompra = porId('campoImpuestoCompra');
  if (campoImpuestoCompra) campoImpuestoCompra.addEventListener('input', renderItemsCompra);

  const btnAgregarItemCompra = porId('btnAgregarItemCompra');
  if (btnAgregarItemCompra) {
    btnAgregarItemCompra.addEventListener('click', async function() {
      const sel = porId('selectProductoCompra');
      const productoId = parseInt(sel ? sel.value : '0', 10) || 0;
      const cantidad = Math.round(num((porId('campoCantidadCompra') || {}).value));
      const costo = num((porId('campoCostoCompra') || {}).value);
      if (!productoId) {
        await window.posAviso({ tipo: 'aviso', titulo: 'Producto requerido', mensaje: 'Selecciona un producto para agregarlo a la compra.' });
        return;
      }
      if (cantidad <= 0) {
        await window.posAviso({ tipo: 'aviso', titulo: 'Cantidad inválida', mensaje: 'La cantidad debe ser mayor a cero.' });
        return;
      }
      if (costo < 0) {
        await window.posAviso({ tipo: 'aviso', titulo: 'Costo inválido', mensaje: 'El costo no puede ser negativo.' });
        return;
      }
      const existente = itemsCompra.find(function(i) { return Number(i.productoId) === productoId; });
      if (existente) existente.cantidad += cantidad;
      else itemsCompra.push({ productoId: productoId, cantidad: cantidad, costo: costo });
      const campoCantidad = porId('campoCantidadCompra');
      if (campoCantidad) campoCantidad.value = '1';
      renderItemsCompra();
    });
  }

  function renderTablaCompras() {
    const tbody = porId('tablaCompras');
    if (!tbody) return;
    tbody.innerHTML = comprasRegistradas.map(function(c) {
      return '<tr>' +
        '<td>' + c.id + '</td>' +
        '<td>' + esc(c.folio) + '</td>' +
        '<td>' + esc(c.fecha) + '</td>' +
        '<td><div class="tabla-celda-nombre">' +
          '<span class="tabla-avatar" aria-hidden="true">' + esc(inicialesDe(c.proveedor)) + '</span>' +
          '<span class="celda-texto" title="' + esc(c.proveedor) + '">' + esc(c.proveedor) + '</span>' +
        '</div></td>' +
        '<td class="num">' + (c.items || 0) + '</td>' +
        '<td class="num">' + esc(fmt(c.subtotal)) + '</td>' +
        '<td class="num">' + esc(fmt(c.impuesto)) + '</td>' +
        '<td class="num">' + esc(fmt(c.total)) + '</td>' +
      '</tr>';
    }).join('');
    const vacio = porId('sinCompras');
    if (vacio) vacio.hidden = comprasRegistradas.length > 0;
  }

  async function cargarCompras() {
    const lista = await llamar('compras:listar', function() { return api.listarCompras(30); }, false);
    comprasRegistradas = Array.isArray(lista) ? lista : [];
    renderTablaCompras();
    renderTablaProveedores();
  }

  const btnRegistrarCompra = porId('btnRegistrarCompra');
  if (btnRegistrarCompra) {
    btnRegistrarCompra.addEventListener('click', async function() {
      if (itemsCompra.length === 0) {
        await window.posAviso({ tipo: 'aviso', titulo: 'Compra vacía', mensaje: 'Agrega al menos un artículo a la compra.' });
        return;
      }
      const proveedorSel = porId('selectProveedorCompra');
      const proveedorId = proveedorSel && proveedorSel.value ? parseInt(proveedorSel.value, 10) : null;
      const datos = {
        proveedorId: proveedorId,
        folio: (porId('campoFolioCompra').value || '').trim(),
        notas: (porId('campoNotasCompra').value || '').trim(),
        impuestoPct: num((porId('campoImpuestoCompra') || {}).value),
        items: itemsCompra.map(function(i) { return { productoId: Number(i.productoId), cantidad: i.cantidad, costo: i.costo }; })
      };
      const compra = await llamar('compras:registrar', function() { return api.registrarCompra(datos); });
      if (!compra) return;
      itemsCompra = [];
      const folio = porId('campoFolioCompra');
      const notas = porId('campoNotasCompra');
      if (folio) folio.value = '';
      if (notas) notas.value = '';
      renderItemsCompra();
      await window.posAviso({
        tipo: 'exito',
        titulo: 'Compra registrada',
        mensaje: 'El stock y el costo promedio se actualizaron correctamente.',
        detalle: 'Folio ' + compra.folio + ' · Total ' + fmt(compra.total) + ' · ' + (compra.items || 0) + ' artículo(s)'
      });
      await Promise.all([cargarCompras(), cargarCatalogoProductos(), refrescarInventario(), actualizarBadgeCompras()]);
    });
  }

  // ===== 5. INVENTARIO: ajustes, kardex y stock crítico =====
  function renderTablaKardex(movimientos) {
    const tbody = porId('tablaKardex');
    if (!tbody) return;
    tbody.innerHTML = movimientos.map(function(m) {
      const delta = Number(m.cantidad) || 0;
      return '<tr>' +
        '<td>' + esc(m.fecha) + '</td>' +
        '<td>' + esc(m.producto || '—') + '</td>' +
        '<td><span class="badge-mov ' + esc(m.tipo) + '">' + esc(m.tipo) + '</span></td>' +
        '<td class="num">' + (delta < 0 ? '' : '+') + delta + '</td>' +
        '<td class="num">' + m.stock_resultante + '</td>' +
        '<td>' + esc(m.motivo || '—') + '</td>' +
        '<td>' + esc(m.referencia || '—') + '</td>' +
      '</tr>';
    }).join('');
    const vacio = porId('sinKardex');
    if (vacio) vacio.hidden = movimientos.length > 0;
  }

  function renderTablaCriticos(criticos) {
    const tbody = porId('tablaStockCritico');
    if (!tbody) return;
    tbody.innerHTML = criticos.map(function(p) {
      return '<tr>' +
        '<td>' + esc(p.nombre) + '</td>' +
        '<td>' + esc(p.categoria || '—') + '</td>' +
        '<td class="num"><span class="badge-stock stock-bajo">' + p.stock + ' uds</span></td>' +
        '<td class="num">' + esc(fmt(p.costo)) + '</td>' +
        '<td class="num">' + esc(fmt(p.precio)) + '</td>' +
        '<td class="num">' + esc(fmt(p.stock * p.costo)) + '</td>' +
      '</tr>';
    }).join('');
    const vacio = porId('sinStockCritico');
    if (vacio) vacio.hidden = criticos.length > 0;
  }

  async function refrescarInventario() {
    const movimientos = (await llamar('inventario:movimientos', function() { return api.movimientosInventario(null, 60); }, false)) || [];
    const criticos = (await llamar('inventario:critico', function() { return api.inventarioCritico(configActual && configActual.stockMinimo != null ? configActual.stockMinimo : 5); }, false)) || [];
    const valorizado = await llamar('inventario:valorizado', function() { return api.inventarioValorizado(); }, false);
    renderTablaKardex(movimientos);
    renderTablaCriticos(criticos);
    if (valorizado) set('invValorizado', 'Costo ' + fmt(valorizado.costo));
    return criticos;
  }

  const btnAplicarAjuste = porId('btnAplicarAjuste');
  if (btnAplicarAjuste) {
    btnAplicarAjuste.addEventListener('click', async function() {
      const sel = porId('selectProductoAjuste');
      const productoId = parseInt(sel ? sel.value : '0', 10) || 0;
      const cantidad = Math.round(num((porId('campoCantidadAjuste') || {}).value));
      const tipo = porId('selectTipoAjuste').value || 'ajuste';
      const motivo = (porId('campoMotivoAjuste').value || '').trim();
      if (!productoId) {
        await window.posAviso({ tipo: 'aviso', titulo: 'Producto requerido', mensaje: 'Selecciona un producto para el ajuste.' });
        return;
      }
      if (cantidad === 0) {
        await window.posAviso({ tipo: 'aviso', titulo: 'Ajuste inválido', mensaje: 'La cantidad del ajuste no puede ser cero.' });
        return;
      }
      const res = await llamar('inventario:ajustar', function() {
        return api.ajustarInventario(productoId, cantidad, motivo, tipo);
      });
      if (!res) return;
      const campo = porId('campoCantidadAjuste');
      if (campo) campo.value = '0';
      const motivoCampo = porId('campoMotivoAjuste');
      if (motivoCampo) motivoCampo.value = '';
      await window.posAviso({
        tipo: 'exito',
        titulo: 'Ajuste aplicado',
        mensaje: 'El inventario se actualizó correctamente.',
        detalle: res.nombre + ': ' + res.stockAnterior + ' → ' + res.stockActual + ' uds'
      });
      await Promise.all([refrescarInventario(), cargarCatalogoProductos(), actualizarBadgeCompras()]);
    });
  }

  async function actualizarBadgeCompras() {
    const badge = porId('badgeCompras');
    if (!badge) return;
    const criticos = (await llamar('inventario:critico', function() { return api.inventarioCritico(configActual && configActual.stockMinimo != null ? configActual.stockMinimo : 5); }, false)) || [];
    badge.textContent = String(criticos.length);
    badge.hidden = criticos.length === 0;
  }

  // ===== 6. REPORTES =====
  function fechaLocal(d) {
    const dos = function(n) { return n < 10 ? '0' + n : String(n); };
    return d.getFullYear() + '-' + dos(d.getMonth() + 1) + '-' + dos(d.getDate());
  }

  function fijarRango(dias) {
    const hasta = new Date();
    const desde = new Date();
    desde.setDate(hasta.getDate() - (dias - 1));
    const campoDesde = porId('reporteDesde');
    const campoHasta = porId('reporteHasta');
    if (campoDesde) campoDesde.value = fechaLocal(desde);
    if (campoHasta) campoHasta.value = fechaLocal(hasta);
  }

  function fijarMesActual() {
    const hoy = new Date();
    const campoDesde = porId('reporteDesde');
    const campoHasta = porId('reporteHasta');
    if (campoDesde) campoDesde.value = fechaLocal(new Date(hoy.getFullYear(), hoy.getMonth(), 1));
    if (campoHasta) campoHasta.value = fechaLocal(hoy);
  }

  function renderTabla(idTabla, idVacio, filas, columnas) {
    const tbody = porId(idTabla);
    if (!tbody) return;
    tbody.innerHTML = filas.map(function(fila) { return '<tr>' + columnas(fila) + '</tr>'; }).join('');
    const vacio = porId(idVacio);
    if (vacio) vacio.hidden = filas.length > 0;
  }

  async function generarReporte() {
    const desde = (porId('reporteDesde').value || '').trim();
    const hasta = (porId('reporteHasta').value || '').trim();
    const r = await llamar('reportes:completo', function() { return api.reporteCompleto(desde, hasta); });
    if (!r) return;
    moneda = r.moneda || moneda;
    const resumen = r.resumen || {};
    set('rVentas', String(resumen.ventas || 0));
    set('rTotal', fmt(resumen.total || 0));
    set('rTicket', fmt(resumen.ticketPromedio || 0));
    set('rCredito', fmt(resumen.credito || 0));
    const utilidad = r.utilidad || {};
    set('rUtilidad', fmt(utilidad.utilidad || 0));
    const cartera = r.cartera || {};
    set('rCartera', fmt(cartera.total || 0));
    set('rCarteraResumen', (cartera.cantidad || 0) + ' cliente(s)');

    renderTabla('tablaReporteDias', 'sinReporteDias', r.porDia || [], function(d) {
      return '<td>' + esc(d.dia) + '</td><td class="num">' + d.ventas + '</td>' +
        '<td class="num">' + esc(fmt(d.total)) + '</td><td class="num">' + esc(fmt(d.credito)) + '</td>';
    });
    const dias = r.porDia || [];
    set('rDiasContador', dias.length + ' día(s)');

    const top = r.topProductos || [];
    renderTabla('tablaReporteTop', 'sinReporteTop', top, function(p) {
      return '<td>' + esc(p.nombre) + '</td><td class="num">' + p.cantidad + '</td>' +
        '<td class="num">' + esc(fmt(p.importe)) + '</td><td class="num">' + esc(fmt(p.utilidad)) + '</td>';
    });
    const margen = resumen.total > 0 ? Math.round(((utilidad.utilidad || 0) / resumen.total) * 100) : 0;
    set('rMargenLabel', 'Margen ' + margen + ' %');

    renderTabla('tablaReporteCategorias', 'sinReporteCategorias', r.porCategoria || [], function(c) {
      return '<td>' + esc(c.categoria) + '</td><td class="num">' + c.cantidad + '</td><td class="num">' + esc(fmt(c.importe)) + '</td>';
    });

    renderTabla('tablaReporteCartera', 'sinReporteCartera', cartera.clientes || [], function(c) {
      return '<td>' + esc(c.nombre) + '</td><td>' + esc(c.telefono || '—') + '</td><td class="num">' + esc(fmt(c.saldo)) + '</td>';
    });

    const criticos = r.criticos || [];
    renderTabla('tablaReporteCriticos', 'sinReporteCriticos', criticos, function(p) {
      return '<td>' + esc(p.nombre) + '</td><td class="num">' + p.stock + ' uds</td><td class="num">' + esc(fmt(p.stock * p.costo)) + '</td>';
    });
  }

  // ==========================================================================
  // Impresión por documento.
  // Antes solo se podía imprimir el reporte completo. Ahora se elige un documento
  // del catálogo (solo ventas, solo cuentas por cobrar, etc.) y se imprime o se
  // guarda en PDF por separado, con vista previa opcional. El catálogo lo expone
  // el proceso principal (impresion/documentos.ts).
  // ==========================================================================
  const documentosCache = [];
  let documentoPreviaActual = null;

  function rangoReporte() {
    return {
      desde: (porId('reporteDesde').value || '').trim(),
      hasta: (porId('reporteHasta').value || '').trim()
    };
  }

  async function validarRango() {
    const rango = rangoReporte();
    if (rango.desde && rango.hasta && rango.desde > rango.hasta) {
      if (window.posAviso) await window.posAviso({ titulo: 'Rango de fechas', mensaje: 'La fecha inicial no puede ser posterior a la fecha final.', icono: '⚠️' });
      else window.alert('La fecha inicial no puede ser posterior a la fecha final.');
      return null;
    }
    return rango;
  }

  function opcionesDelDocumento() {
    const firmas = porId('docFirmas');
    return { firmas: !!firmas && firmas.checked };
  }

  function pintarDocumentos(grupos) {
    const cont = porId('documentosGrupos');
    if (!cont) return;
    if (!grupos || !grupos.length) {
      cont.innerHTML = '<p class="modal-doc-cargando">No hay documentos disponibles.</p>';
      return;
    }
    cont.innerHTML = grupos.map(function(g) {
      const tarjetas = (g.documentos || []).map(function(d) {
        const secciones = (d.secciones || []).length;
        const chip = d.ignoraPeriodo
          ? '<span class="doc-chip doc-chip-sin-fecha">Sin fechas</span>'
          : '<span class="doc-chip">' + secciones + ' secci\u00F3n' + (secciones === 1 ? '' : 'es') + '</span>';
        return '<article class="doc-tarjeta">' +
          '<h4 class="doc-tarjeta-nombre">' + esc(d.etiqueta) + '</h4>' +
          '<p class="doc-tarjeta-desc">' + esc(d.descripcion) + '</p>' +
          '<div class="doc-tarjeta-pie">' + chip +
            '<div class="doc-acciones">' +
              '<button type="button" class="doc-btn doc-btn-previa" data-docid="' + esc(d.id) + '">Vista previa</button>' +
              '<button type="button" class="doc-btn doc-btn-pdf" data-docid="' + esc(d.id) + '">PDF</button>' +
              '<button type="button" class="doc-btn doc-btn-primario doc-btn-imprimir" data-docid="' + esc(d.id) + '">Imprimir</button>' +
            '</div>' +
          '</div></article>';
      }).join('');
      return '<section class="modal-doc-grupo"><h4>' + esc(g.grupo) + '</h4>' +
        '<div class="modal-doc-rejilla">' + tarjetas + '</div></section>';
    }).join('');

    const enlazar = function(sel, fn) {
      cont.querySelectorAll(sel).forEach(function(b) {
        b.addEventListener('click', function(e) {
          e.stopPropagation();
          fn(b.getAttribute('data-docid'), b);
        });
      });
    };
    enlazar('.doc-btn-imprimir', imprimirDocumentoP);
    enlazar('.doc-btn-pdf', pdfDocumentoP);
    enlazar('.doc-btn-previa', function(docId) { abrirPrevia(docId); });
  }

  async function cargarDocumentos(forzar) {
    if (documentosCache.length && !forzar) return documentosCache;
    if (!api || typeof api.listarDocumentos !== 'function') return [];
    const grupos = (await api.listarDocumentos()) || [];
    documentosCache.length = 0;
    documentosCache.push.apply(documentosCache, grupos);
    return documentosCache;
  }

  async function conBoton(boton, fn) {
    const texto = boton ? boton.textContent : '';
    if (boton) { boton.disabled = true; boton.textContent = '…'; }
    try { await fn(); }
    finally { if (boton) { boton.disabled = false; boton.textContent = texto; } }
  }

  async function imprimirDocumentoP(documentoId, boton) {
    if (!documentoId) return;
    const rango = await validarRango();
    if (!rango) return;
    await conBoton(boton, async function() {
      try {
        if (!api || typeof api.imprimirDocumento !== 'function') throw new Error('La impresión de documentos no está disponible en esta instalación.');
        const r = await api.imprimirDocumento(documentoId, rango.desde, rango.hasta, opcionesDelDocumento());
        if (r && r.ok) {
          if (window.posAviso) await window.posAviso({ titulo: 'Impresión', mensaje: r.mensaje || 'Documento enviado a impresión.', icono: '🖨️' });
          cerrarDocumentos();
        } else if (r && !r.cancelado) {
          if (window.posAviso) await window.posAviso({ titulo: 'No se pudo imprimir', mensaje: r.mensaje || 'No fue posible imprimir el documento.', icono: '⚠️' });
        }
      } catch (error) {
        const m = error && error.message ? error.message : 'No fue posible imprimir.';
        if (window.posAviso) await window.posAviso({ titulo: 'Error de impresión', mensaje: m, icono: '⚠️' });
        else window.alert(m);
      }
    });
  }

  async function pdfDocumentoP(documentoId, boton) {
    if (!documentoId) return;
    const rango = await validarRango();
    if (!rango) return;
    await conBoton(boton, async function() {
      try {
        if (!api || typeof api.pdfDocumento !== 'function') throw new Error('La exportación a PDF no está disponible en esta instalación.');
        const r = await api.pdfDocumento(documentoId, rango.desde, rango.hasta, opcionesDelDocumento());
        if (r && r.ok && !r.cancelado) {
          if (window.posAviso) await window.posAviso({ titulo: 'PDF generado', mensaje: r.mensaje || 'Documento guardado en PDF.', icono: '📄' });
          cerrarDocumentos();
        }
      } catch (error) {
        const m = error && error.message ? error.message : 'No fue posible exportar.';
        if (window.posAviso) await window.posAviso({ titulo: 'No se pudo generar el PDF', mensaje: m, icono: '⚠️' });
        else window.alert(m);
      }
    });
  }

  async function abrirPrevia(documentoId) {
    if (!documentoId) return;
    const rango = await validarRango();
    if (!rango) return;
    const modal = porId('modalPreviaDocumento');
    const marco = porId('previaMarco');
    if (!modal || !marco) return;
    const sub = porId('previaSubtitulo');
    if (sub) sub.textContent = 'Generando documento…';
    modal.removeAttribute('hidden');
    try {
      if (!api || typeof api.previaDocumento !== 'function') throw new Error('La vista previa no está disponible en esta instalación.');
      const html = await api.previaDocumento(documentoId, rango.desde, rango.hasta, opcionesDelDocumento());
      marco.srcdoc = html || '<p style="font-family:sans-serif;padding:20px">Documento vacío.</p>';
      documentoPreviaActual = documentoId;
      if (sub) sub.textContent = 'Así se va a imprimir exactamente. Puedes imprimir o guardar el PDF.';
    } catch (error) {
      const m = error && error.message ? error.message : 'No se pudo generar la vista previa.';
      marco.srcdoc = '<p style="font-family:sans-serif;padding:20px;color:#b91c1c">' + esc(m) + '</p>';
      documentoPreviaActual = null;
    }
  }

  function cerrarDocumentos() {
    const m = porId('modalDocumentos');
    if (m) m.setAttribute('hidden', 'true');
  }

  function cerrarPrevia() {
    const m = porId('modalPreviaDocumento');
    if (m) m.setAttribute('hidden', 'true');
    documentoPreviaActual = null;
  }

  async function abrirSelectorDocumentos() {
    const modal = porId('modalDocumentos');
    const cont = porId('documentosGrupos');
    if (!modal || !cont) return;
    modal.removeAttribute('hidden');
    try {
      const grupos = await cargarDocumentos(true);
      pintarDocumentos(grupos);
    } catch (error) {
      cont.innerHTML = '<p class="modal-doc-cargando">No se pudo cargar el catálogo de documentos.</p>';
    }
  }

  async function imprimirReporteActual() {
    const desde = (porId('reporteDesde').value || '').trim();
    const hasta = (porId('reporteHasta').value || '').trim();
    if (desde && hasta && desde > hasta) {
      if (window.posAviso) await window.posAviso({ titulo: 'Rango de fechas', mensaje: 'La fecha inicial no puede ser posterior a la fecha final.', icono: '⚠️' }); else window.alert('La fecha inicial no puede ser posterior a la fecha final.');
      return;
    }
    const boton = porId('btnImprimirReporte');
    if (boton) { boton.disabled = true; boton.dataset.textoOriginal = boton.textContent || 'Imprimir'; boton.textContent = 'Preparando…'; }
    try {
      if (!api || typeof api.reportesImprimir !== 'function') throw new Error('La impresión profesional de reportes no está disponible en esta instalación.');
      const resultado = await api.reportesImprimir(desde, hasta);
      if (resultado && resultado.ok) if (window.posAviso) await window.posAviso({ titulo: 'Impresión', mensaje: resultado.mensaje || 'Reporte enviado a impresión.', icono: '🖨️' });
      else if (resultado && !resultado.cancelado) if (window.posAviso) await window.posAviso({ titulo: 'No se pudo imprimir', mensaje: resultado.mensaje || 'No fue posible imprimir el reporte.', icono: '⚠️' }); else window.alert(resultado.mensaje || 'No fue posible imprimir el reporte.');
    } catch (error) {
      if (window.posAviso) await window.posAviso({ titulo: 'Error de impresión', mensaje: error && error.message ? error.message : 'No fue posible imprimir el reporte.', icono: '⚠️' }); else window.alert(error && error.message ? error.message : 'No fue posible imprimir el reporte.');
    } finally {
      if (boton) { boton.disabled = false; boton.textContent = boton.dataset.textoOriginal || 'Imprimir'; }
    }
  }

  const btnGenerarReporte = porId('btnGenerarReporte');
  if (btnGenerarReporte) btnGenerarReporte.addEventListener('click', generarReporte);

  // El botón principal abre el catálogo de documentos. Para imprimir el
  // reporte completo de una sola vez, la primera tarjeta es "Reporte de gestión".
  const btnImprimirReporte = porId('btnImprimirReporte');
  if (btnImprimirReporte) btnImprimirReporte.addEventListener('click', abrirSelectorDocumentos);

  const btnVistaPreviaReporte = porId('btnVistaPreviaReporte');
  if (btnVistaPreviaReporte) btnVistaPreviaReporte.addEventListener('click', function() { abrirPrevia('general'); });

  const btnCerrarDocumentos = porId('btnCerrarDocumentos');
  if (btnCerrarDocumentos) btnCerrarDocumentos.addEventListener('click', cerrarDocumentos);
  const btnCancelarDocumentos = porId('btnCancelarDocumentos');
  if (btnCancelarDocumentos) btnCancelarDocumentos.addEventListener('click', cerrarDocumentos);
  const btnCerrarPrevia = porId('btnCerrarPrevia');
  if (btnCerrarPrevia) btnCerrarPrevia.addEventListener('click', cerrarPrevia);
  const btnPreviaImprimir = porId('btnPreviaImprimir');
  if (btnPreviaImprimir) btnPreviaImprimir.addEventListener('click', async function() {
    const docId = documentoPreviaActual;
    cerrarPrevia();
    if (docId) await imprimirDocumentoP(docId, null);
  });
  const btnPreviaPdf = porId('btnPreviaPdf');
  if (btnPreviaPdf) btnPreviaPdf.addEventListener('click', async function() {
    const docId = documentoPreviaActual;
    cerrarPrevia();
    if (docId) await pdfDocumentoP(docId, null);
  });
  document.addEventListener('keydown', function(e) {
    if (e.key !== 'Escape') return;
    cerrarDocumentos();
    cerrarPrevia();
  });

  const btnPresetHoy = porId('btnPresetHoy');
  if (btnPresetHoy) btnPresetHoy.addEventListener('click', function() { fijarRango(1); generarReporte(); });

  const btnPresetSemana = porId('btnPresetSemana');
  if (btnPresetSemana) btnPresetSemana.addEventListener('click', function() { fijarRango(7); generarReporte(); });

  const btnPresetMes = porId('btnPresetMes');
  if (btnPresetMes) btnPresetMes.addEventListener('click', function() { fijarMesActual(); generarReporte(); });

  // ===== 7. ESTADO DE CAJA EN LA BARRA DE ESTADO GLOBAL =====
  // Actualiza solo el indicador del pie de página (statusbarCaja), sin tocar
  // la vista de caja (#estadoCaja y demás elementos del módulo de caja).
  // Mensajes objetivos según el turno real: "Caja abierta" / "Caja cerrada".
  // Si no hay API o falla la consulta, se muestra "Sin conexión".
  async function actualizarEstadoCajaGlobal() {
    const punto = porId('statusbarCajaPunto');
    const texto = porId('statusbarCajaTexto');
    if (!punto || !texto) return;

    punto.className = 'statusbar-punto statusbar-punto--desconocida';
    texto.textContent = 'Sin conexión';

    if (!api) return;

    try {
      // Preferir el turno que ya tengamos en memoria desde refrescarCaja().
      // Si no estuviera disponible, consultar al backend.
      let turno = turnoCaja || null;
      if (!turno) {
        turno = await llamar('caja:turno-abierto', function() { return api.cajaTurnoAbierto(); }, false);
      }

      // En abas fuentes, lo que importa es si existe un turno abierto.
      const hayTurnoAbierto = !!(turno && turno.estado === 'abierto');
      if (hayTurnoAbierto) {
        punto.className = 'statusbar-punto statusbar-punto--abierta';
        texto.textContent = 'Caja abierta';
      } else {
        punto.className = 'statusbar-punto statusbar-punto--cerrada';
        texto.textContent = 'Caja cerrada';
      }
    } catch (err) {
      punto.className = 'statusbar-punto statusbar-punto--desconocida';
      texto.textContent = 'Sin conexión';
    }
  }

  // ===== INICIALIZACIÓN GLOBAL DE MÓDULOS =====
  async function refrescarTodo() {
    await cargarConfiguracion();
    await refrescarCaja();
    await cargarProveedores();
    await cargarCatalogoProductos();
    await cargarCompras();
    await refrescarInventario();
    await actualizarBadgeCompras();
    fijarRango(7);
    await generarReporte();
    await actualizarEstadoCajaGlobal();
  }

  conSesion(refrescarTodo);
});