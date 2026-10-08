'use strict';

document.addEventListener('DOMContentLoaded', function() {
  // ===== ESTADO GLOBAL =====
  const clientes = [];
  const productos = [];
  let historialVentas = [];
  let carrito = [];
  let metodoPagoActual = 'contado';
  let impuestoPctVenta = 0; // % de Configuración; lo aplica el backend al guardar, aquí solo se muestra
  let descuentoTipo = 'porcentaje';
  let descuentoValor = 0;
  let categoriaActual = 'Todos';
  let clienteAbonoId = 0;
  const filtrosHistorial = { fecha: 'todo', tipo: 'todo' };
  window.filtrosHistorial = filtrosHistorial;

  const api = (typeof window !== 'undefined' && window.api) || null;
  const porId = function(id) { return document.getElementById(id); };
  let moneda = 'C$';
  const fmt = function(n) { return moneda + (Number(n) || 0).toFixed(2); };
  const esc = function(txt) {
    return String(txt == null ? '' : txt)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  };
  const dos = function(n) { return String(n).padStart(2, '0'); };

  function normalizarCliente(c) {
    return {
      id: Number(c.id),
      codigo: c.codigo || '',
      nombre: c.nombre || '',
      telefono: c.telefono || '',
      direccion: c.direccion || '',
      correo: c.correo || '',
      limite: Number(c.limiteCredito != null ? c.limiteCredito : (c.limite_credito != null ? c.limite_credito : c.limite)) || 0,
      saldo: Number(c.saldoPendiente != null ? c.saldoPendiente : (c.saldo_pendiente != null ? c.saldo_pendiente : c.saldo)) || 0
    };
  }

  function codigoProductoVisible(producto) {
    if (producto && producto.codigo) return String(producto.codigo);
    const id = Number(producto && producto.id) || 0;
    return id > 0 ? 'PRD-' + String(id).padStart(5, '0') : 'Comun';
  }

  // ===== 0. DIÁLOGOS DEL SISTEMA =====
  // Reemplazan a alert()/confirm() nativos (que muestran el título de la ventana
  // y rompen la estética del sistema). Usan el modal #modalDialogo de index.html.
  //   window.posAviso(mensaje | opciones)    -> Promise<true>   (solo botón Aceptar)
  //   window.posConfirmar(mensaje | opciones) -> Promise<boolean>
  //   window.posDialogo(opciones)             -> Promise<boolean> (control total)
  const ICONOS_DIALOGO = { pregunta: '?', peligro: '!', aviso: '!', exito: '✓', info: 'i' };
  const TITULOS_DIALOGO = {
    pregunta: 'Confirmar acción',
    peligro: 'Confirmar eliminación',
    aviso: 'Aviso',
    exito: 'Listo',
    info: 'Información'
  };
  const TIPOS_DIALOGO = ['pregunta', 'peligro', 'aviso', 'exito', 'info'];
  let dialogoPendiente = null;      // { resolver }
  let dialogoFocoPrevio = null;
  const dialogoCola = [];

  function completarDialogo(base) {
    const cfg = base;
    if (TIPOS_DIALOGO.indexOf(cfg.tipo) === -1) cfg.tipo = 'pregunta';
    cfg.titulo = cfg.titulo || TITULOS_DIALOGO[cfg.tipo];
    cfg.icono = cfg.icono || ICONOS_DIALOGO[cfg.tipo];
    cfg.mensaje = cfg.mensaje == null ? '' : String(cfg.mensaje);
    cfg.detalle = cfg.detalle == null ? '' : String(cfg.detalle);
    cfg.aceptar = cfg.aceptar || (cfg.tipo === 'peligro' ? 'Sí, continuar' : 'Aceptar');
    cfg.cancelar = cfg.cancelar || 'Cancelar';
    cfg.soloAceptar = cfg.soloAceptar === true;
    cfg.botonPeligro = cfg.botonPeligro === true || cfg.tipo === 'peligro';
    return cfg;
  }

  function opcionesDialogo(opciones, tipoPorDefecto, soloAceptarPorDefecto) {
    const base = (opciones && typeof opciones === 'object') ? Object.assign({}, opciones) : { mensaje: opciones };
    if (!base.tipo) base.tipo = tipoPorDefecto;
    if (base.soloAceptar == null) base.soloAceptar = soloAceptarPorDefecto;
    return completarDialogo(base);
  }

  function abrirDialogo(cfg) {
    return new Promise(function(resolver) {
      if (dialogoPendiente) { dialogoCola.push({ cfg: cfg, resolver: resolver }); return; }
      montarDialogo(cfg, resolver);
    });
  }

  window.posDialogo = function(opciones) {
    return abrirDialogo(opcionesDialogo(opciones, 'info', true));
  };
  window.posAviso = function(opciones) {
    return abrirDialogo(opcionesDialogo(opciones, 'info', true)).then(function() { return true; });
  };
  window.posConfirmar = function(opciones) {
    return abrirDialogo(opcionesDialogo(opciones, 'pregunta', false));
  };

  function montarDialogo(cfg, resolver) {
    const overlay = porId('modalDialogo');
    const caja = porId('dialogoCaja');
    if (!overlay || !caja) {
      // Respaldo defensivo si el HTML del diálogo no estuviera disponible.
      if (cfg.soloAceptar || !window.confirm) { resolver(true); return; }
      resolver(window.confirm(cfg.mensaje));
      return;
    }
    dialogoPendiente = { resolver: resolver };
    dialogoFocoPrevio = document.activeElement;
    const icono = porId('dialogoIcono');
    const titulo = porId('dialogoTitulo');
    const mensaje = porId('dialogoMensaje');
    const detalle = porId('dialogoDetalle');
    const btnAceptar = porId('dialogoAceptar');
    const btnCancelar = porId('dialogoCancelar');
    if (icono) icono.textContent = cfg.icono;
    if (titulo) titulo.textContent = cfg.titulo;
    if (mensaje) mensaje.textContent = cfg.mensaje;
    if (detalle) {
      detalle.textContent = cfg.detalle;
      if (cfg.detalle) detalle.removeAttribute('hidden');
      else detalle.setAttribute('hidden', 'true');
    }
    caja.className = 'modal dialogo tipo-' + cfg.tipo;
    if (btnAceptar) {
      btnAceptar.textContent = cfg.aceptar;
      btnAceptar.className = cfg.botonPeligro ? 'btn-peligro' : 'btn-primary';
    }
    if (btnCancelar) {
      btnCancelar.textContent = cfg.cancelar;
      btnCancelar.hidden = cfg.soloAceptar;
    }
    overlay.removeAttribute('hidden');
    const foco = (cfg.soloAceptar || !cfg.botonPeligro) ? btnAceptar : btnCancelar;
    if (foco) foco.focus();
  }
function cerrarDialogo(resultado) {
    const overlay = porId('modalDialogo');
    if (overlay) overlay.setAttribute('hidden', 'true');
    const pendiente = dialogoPendiente;
    dialogoPendiente = null;
    const focoPrevio = dialogoFocoPrevio;
    dialogoFocoPrevio = null;
    if (focoPrevio && typeof focoPrevio.focus === 'function') {
      try { focoPrevio.focus(); } catch (err) { /* el elemento ya no existe */ }
    }
    if (pendiente) pendiente.resolver(resultado === true);
    const siguiente = dialogoCola.shift();
    if (siguiente) montarDialogo(siguiente.cfg, siguiente.resolver);
  }

  // El diálogo se maneja con el teclado: Enter confirma, Esc cancela.
  // Se registra en captura para que el diálogo tenga prioridad sobre otros modales.
  const overlayDialogo = porId('modalDialogo');
  const btnAceptarDialogo = porId('dialogoAceptar');
  const btnCancelarDialogo = porId('dialogoCancelar');
  if (btnAceptarDialogo) btnAceptarDialogo.addEventListener('click', function() { cerrarDialogo(true); });
  if (btnCancelarDialogo) btnCancelarDialogo.addEventListener('click', function() { cerrarDialogo(false); });
  if (overlayDialogo) {
    overlayDialogo.addEventListener('mousedown', function(e) {
      if (e.target === overlayDialogo) cerrarDialogo(false);
    });
  }
  document.addEventListener('keydown', function(e) {
    if (!dialogoPendiente) return;
    if (!overlayDialogo || overlayDialogo.hasAttribute('hidden')) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      cerrarDialogo(false);
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      cerrarDialogo(!(document.activeElement && document.activeElement.id === 'dialogoCancelar'));
    }
  }, true);

  // Red de seguridad: si algún alert() se escapa en el código, se muestra
  // con el diálogo del sistema en lugar de la ventana nativa.
  window.alert = function(mensaje) { return window.posAviso(mensaje); };

  // ===== 1. NAVEGACIÓN (barra lateral + accesos rápidos del dashboard) =====
  const botonesNav = document.querySelectorAll('.nav-item');
  const vistas = document.querySelectorAll('.vista');

  function irA(vistaDestino) {
    vistas.forEach(function(v) { v.setAttribute('hidden', 'true'); });
    botonesNav.forEach(function(b) { b.classList.remove('activo'); });
    const vistaActiva = porId('vista-' + vistaDestino);
    const botonNav = document.querySelector('.nav-item[data-vista="' + vistaDestino + '"]');
    if (vistaActiva) vistaActiva.removeAttribute('hidden');
    if (botonNav) botonNav.classList.add('activo');
        actualizarCabeceraModulo(vistaDestino);
    if (vistaDestino === 'clientes') renderTablaClientes();
    if (vistaDestino === 'productos') renderTablaProductos();
    if (vistaDestino === 'abonos') renderTablaAbonos();
    if (vistaDestino === 'whatsapp') { actualizarSelectClientesWhatsapp(); actualizarSelectVentasWhatsapp(); initWhatsapp(); }
  }
  window.irA = irA;

  botonesNav.forEach(function(boton) {
    boton.addEventListener('click', function() {
      const destino = boton.getAttribute('data-vista');
      if (destino) irA(destino);
    });
  });

  // Conexión de las tarjetas "Accesos rápidos" del dashboard principal con los módulos
  document.querySelectorAll('.acceso-card').forEach(function(card) {
    card.addEventListener('click', function() {
      const destino = card.getAttribute('data-ir');
      if (destino) irA(destino);
    });
  });

  // Botón "Central de abonos" en la cabecera de Ventas
  const btnCentralAbonos = porId('btnCentralAbonos');
  if (btnCentralAbonos) {
    btnCentralAbonos.addEventListener('click', function() { irA('abonos'); });
  }

  // Pestañas del módulo de ventas
  const pestanasVentas = document.querySelectorAll('#vista-ventas .ventas-navegacion .pestana');
  pestanasVentas.forEach(function(pestana) {
    pestana.addEventListener('click', function() {
      const target = pestana.getAttribute('data-pestana');
      if (!target) return;
      document.querySelectorAll('.pestana-contenido').forEach(function(el) { el.setAttribute('hidden', 'true'); });
      pestanasVentas.forEach(function(p) {
        p.classList.remove('activo');
        if (p.hasAttribute('aria-pressed')) p.setAttribute('aria-pressed', 'false');
      });
      const idContenido = target === 'nueva' ? 'pestanaNueva' : target === 'copia' ? 'pestanaCopia' : 'pestanaHistorial';
      const elContenido = porId(idContenido);
      if (elContenido) {
        elContenido.removeAttribute('hidden');
        pestana.classList.add('activo');
        pestana.setAttribute('aria-pressed', 'true');
      }
    });
  });

  // ===== 1b. INTERFAZ ERP: menú colapsable, ruta, búsqueda global y barra de estado =====
  const appEl = porId('app');

  // Título y descripción que se muestran en la barra superior según el módulo activo
  const INFO_MODULOS = {
    inicio: { titulo: 'Inicio', detalle: 'Resumen general del negocio' },
    clientes: { titulo: 'Clientes', detalle: 'Directorio, crédito y saldos de clientes' },
    productos: { titulo: 'Productos', detalle: 'Inventario, precios y categorías' },
    etiquetas: { titulo: 'Etiquetas', detalle: 'Diseñador profesional, códigos de barras e impresión' },
    ventas: { titulo: 'Ventas', detalle: 'Punto de venta, historial y copias de venta' },
    abonos: { titulo: 'Central de Abonos', detalle: 'Cobranza de saldos pendientes' },
    caja: { titulo: 'Caja', detalle: 'Turnos, movimientos de efectivo y arqueo' },
    compras: { titulo: 'Compras e Inventario', detalle: 'Proveedores, compras y kardex de existencias' },
    reportes: { titulo: 'Reportes', detalle: 'Indicadores de ventas, utilidad y cartera' },
        configuracion: { titulo: 'Configuración', detalle: 'Datos del negocio y parámetros del sistema' },
    usuarios: { titulo: 'Usuarios', detalle: 'Cuentas, roles y permisos de acceso' },
    whatsapp: { titulo: 'WhatsApp', detalle: 'Envío de tickets, recordatorios y catálogo vía WhatsApp' }
  };

  // Buscador propio de cada módulo (lo alimenta la búsqueda global de la barra superior)
  const BUSCADORES_MODULO = {
    inicio: null,
    clientes: 'buscadorClientes',
    productos: 'buscadorProductos',
    etiquetas: 'etBuscarProducto',
    ventas: 'buscadorVenta',
    abonos: 'buscadorAbonos',
    caja: null,
    compras: 'buscadorProveedores',
        reportes: null,
    configuracion: null,
    usuarios: 'buscadorUsuarios',
    whatsapp: null
  };

  let vistaActual = 'inicio';

  // Actualiza la ruta de navegación y el título de la ventana
  function actualizarCabeceraModulo(destino) {
    vistaActual = destino || 'inicio';
    const info = INFO_MODULOS[vistaActual] || INFO_MODULOS.inicio;
    const crumb = porId('crumbModulo');
    const detalle = porId('crumbDetalle');
    if (crumb) crumb.textContent = info.titulo;
    if (detalle) detalle.textContent = info.detalle;
    document.title = info.titulo + ' · SmartPosPro';
  }

  // Muestra u oculta el menú lateral recordando la preferencia del usuario
  function alternarMenu() {
    if (!appEl) return;
    appEl.classList.toggle('colapsado');
    try { localStorage.setItem('pos.menu.colapsado', appEl.classList.contains('colapsado') ? '1' : '0'); }
    catch (err) { console.warn('menu:preferencia', err); }
  }

  try {
    if (appEl && localStorage.getItem('pos.menu.colapsado') === '1') appEl.classList.add('colapsado');
  } catch (err) { console.warn('menu:preferencia', err); }

  const btnColapsar = porId('btnColapsar');
  if (btnColapsar) btnColapsar.addEventListener('click', alternarMenu);
  const btnMenu = porId('btnMenu');
  if (btnMenu) btnMenu.addEventListener('click', alternarMenu);

  // Búsqueda global: escribe en el buscador del módulo visible
  const busquedaGlobal = porId('busquedaGlobal');
  function aplicarBusquedaGlobal(valor) {
    const idBuscador = BUSCADORES_MODULO[vistaActual];
    const campo = idBuscador ? porId(idBuscador) : null;
    if (!campo) return;
    campo.value = valor;
    campo.dispatchEvent(new Event('input', { bubbles: true }));
  }
  if (busquedaGlobal) {
    busquedaGlobal.addEventListener('input', function() { aplicarBusquedaGlobal(busquedaGlobal.value); });
    busquedaGlobal.addEventListener('keydown', function(e) {
      if (e.key !== 'Escape') return;
      busquedaGlobal.value = '';
      aplicarBusquedaGlobal('');
    });
  }

  // Acción rápida de la barra superior
  const btnAccionRapida = porId('btnAccionRapida');
  if (btnAccionRapida) btnAccionRapida.addEventListener('click', function() { irA('ventas'); });

  // Reloj de la barra superior y fecha de la barra de estado
  function actualizarBarraEstado() {
    const ahora = new Date();
    const relojSup = porId('relojTopbar');
    if (relojSup) relojSup.textContent = dos(ahora.getHours()) + ':' + dos(ahora.getMinutes()) + ':' + dos(ahora.getSeconds());
    const fechaBarra = porId('statusbarFecha');
    if (fechaBarra) {
      fechaBarra.textContent = ahora.toLocaleDateString('es-NI', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
    }
  }
  setInterval(actualizarBarraEstado, 1000);
  actualizarBarraEstado();

  // Reloj y fechas
  function actualizarReloj() {
    const ahora = new Date();
    const reloj = porId('relojVentas');
    if (reloj) reloj.textContent = dos(ahora.getHours()) + ':' + dos(ahora.getMinutes()) + ':' + dos(ahora.getSeconds());
  }
  setInterval(actualizarReloj, 1000);
  actualizarReloj();

  const fechaActualEl = porId('fechaActual');
  if (fechaActualEl) {
    fechaActualEl.textContent = new Date().toLocaleDateString('es-NI', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  }
  const saludoEl = porId('saludoDashboard');
  if (saludoEl) {
    const horaActual = new Date().getHours();
    const saludoTexto = horaActual < 12 ? 'Buenos días' : (horaActual < 19 ? 'Buenas tardes' : 'Buenas noches');
    const nombreEl = document.querySelector('.topbar-usuario-info strong');
    const primerNombre = nombreEl && nombreEl.textContent ? nombreEl.textContent.trim().split(' ')[0] : '';
    saludoEl.textContent = saludoTexto + (primerNombre ? ', ' + primerNombre : '') + ' 👋';
  }
  const fechaTicketEl = porId('fechaTicket');
  if (fechaTicketEl) {
    fechaTicketEl.textContent = new Date().toLocaleDateString('es-NI', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }

  // ===== 2. DASHBOARD (KPIs, top productos y respaldo) =====
  function actualizarBadges() {
    const bCli = porId('badgeClientes');
    const bPro = porId('badgeProductos');
    const bAbo = porId('badgeAbonos');
    const nConSaldo = clientes.filter(function(c) { return c.saldo > 0; }).length;
    if (bCli) { bCli.textContent = String(clientes.length); bCli.hidden = clientes.length === 0; }
    if (bPro) { bPro.textContent = String(productos.length); bPro.hidden = productos.length === 0; }
    if (bAbo) { bAbo.textContent = String(nConSaldo); bAbo.hidden = nConSaldo === 0; }
    const resumenBarra = porId('statusbarResumen');
    if (resumenBarra) {
      resumenBarra.textContent = 'Clientes: ' + clientes.length + ' · Productos: ' + productos.length + ' · Con saldo: ' + nConSaldo;
    }
  }

  // --- Zona de reportes del tablero -------------------------------------------
  // Formato corto para las etiquetas pequeñas del gráfico (C$1.2k, C$1.3M).
  const fmtCorto = function(n) {
    const v = Number(n) || 0;
    if (v >= 1000000) return moneda + (v / 1000000).toFixed(1) + 'M';
    if (v >= 1000) return moneda + Math.round(v / 1000) + 'k';
    return moneda + String(Math.round(v));
  };

  // Convierte 'YYYY-MM-DD' en un Date local seguro (evita el corrimiento de UTC).
  const fechaDesdeTexto = function(texto) {
    const p = String(texto || '').split('-');
    if (p.length !== 3) return null;
    return new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
  };

  const DIAS_CORTOS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];

  // Pinta el gráfico de barras de los últimos 7 días. Los días sin ventas se
  // muestran con barra mínima para que la serie nunca tenga huecos.
  function pintarGraficoSemana(serie) {
    const cont = porId('graficoSemana');
    const vacio = porId('sinGrafico');
    if (!cont) return;
    const filas = Array.isArray(serie) ? serie : [];
    if (!filas.length) {
      cont.innerHTML = '';
      if (vacio) vacio.hidden = false;
      return;
    }
    if (vacio) vacio.hidden = true;

    const hoy = new Date();
    const maximo = filas.reduce(function(m, f) { return Math.max(m, Number(f.total) || 0); }, 0);
    cont.innerHTML = filas.map(function(f) {
      const total = Number(f.total) || 0;
      const fecha = fechaDesdeTexto(f.dia);
      const diaTexto = fecha ? DIAS_CORTOS[fecha.getDay()] : '';
      const esHoy = fecha && fecha.getFullYear() === hoy.getFullYear() &&
        fecha.getMonth() === hoy.getMonth() && fecha.getDate() === hoy.getDate();
      // Altura proporcional dentro de la pista: el máximo llena el carril y el
      // resto se escala respecto a él (mínimo 3% para que el día sea visible).
      const pct = maximo > 0 ? Math.max(3, Math.round((total / maximo) * 100)) : 0;
      const clases = 'dash-barra-col' + (esHoy ? ' dash-barra-col--hoy' : '') + (total <= 0 ? ' dash-barra-col--vacia' : '');
      return '<div class="' + clases + '" title="' + esc(f.dia) + ': ' + fmt(total) + '">' +
        '<span class="dash-barra-valor">' + (total > 0 ? fmtCorto(total) : '') + '</span>' +
        '<span class="dash-barra-pista"><span class="dash-barra" style="height:' + pct + '%"></span></span>' +
        '<span class="dash-barra-dia">' + esc(diaTexto) + '</span>' +
        '</div>';
    }).join('');
  }

  // Pinta la barra apilada contado/crédito y su leyenda con porcentajes.
  function pintarPagos(pagos) {
    const segContado = porId('pagosContado');
    const segCredito = porId('pagosCredito');
    const leyenda = porId('pagosLeyenda');
    const vacio = porId('sinPagos');
    if (!leyenda) return;
    const contado = Number(pagos && pagos.contado) || 0;
    const credito = Number(pagos && pagos.credito) || 0;
    const total = contado + credito;
    if (total <= 0) {
      if (segContado) segContado.style.width = '0%';
      if (segCredito) segCredito.style.width = '0%';
      leyenda.innerHTML = '';
      if (vacio) vacio.hidden = false;
      return;
    }
    if (vacio) vacio.hidden = true;
    const pcContado = Math.round((contado / total) * 100);
    if (segContado) segContado.style.width = pcContado + '%';
    if (segCredito) segCredito.style.width = (100 - pcContado) + '%';
    const fila = function(clase, nombre, valor, pct) {
      return '<li><span class="leyenda-marca leyenda-marca--' + clase + '"></span>' +
        '<span class="leyenda-nombre">' + nombre + '</span>' +
        '<span class="leyenda-valor">' + fmt(valor) + '</span>' +
        '<span class="leyenda-pct">' + pct + '%</span></li>';
    };
    leyenda.innerHTML = fila('contado', 'Contado', contado, pcContado) +
      fila('credito', 'Crédito', credito, 100 - pcContado);
  }

  // Feed compacto de las últimas ventas.
  function pintarActividad(ventas) {
    const lista = porId('listaActividad');
    const vacio = porId('sinActividad');
    if (!lista) return;
    const filas = Array.isArray(ventas) ? ventas : [];
    if (!filas.length) {
      lista.innerHTML = '';
      if (vacio) vacio.hidden = false;
      return;
    }
    if (vacio) vacio.hidden = true;
    lista.innerHTML = filas.map(function(v) {
      // La BD guarda 'YYYY-MM-DD HH:MM:SS'; al tablero solo le interesa la hora
      const hora = String(v.fecha || '').split(' ')[1] || '';
      const esCredito = v.tipoPago === 'credito';
      return '<li>' +
        '<span class="act-punto act-punto--' + (esCredito ? 'credito' : 'contado') + '"></span>' +
        '<span class="act-cliente">' + esc(v.cliente) + '</span>' +
        '<span class="act-hora">' + esc(hora) + '</span>' +
        '<span class="act-total">' + fmt(v.total) + '</span>' +
        '</li>';
    }).join('');
  }

  // Aviso de productos agotados dentro del panel de actividad.
  function pintarAgotados(agotados) {
    const panel = porId('panelAlertas');
    const lista = porId('listaAgotados');
    if (!panel || !lista) return;
    const filas = Array.isArray(agotados) ? agotados : [];
    if (!filas.length) { panel.hidden = true; return; }
    panel.hidden = false;
    lista.innerHTML = filas.map(function(p) {
      return '<li>' + esc(p.nombre) + '</li>';
    }).join('');
  }

  // Actualiza el subtítulo del encabezado de reportes con el total semanal.
  function pintarResumenReportes(resumen) {
    const rotulo = porId('dashReportesResumen');
    if (!rotulo) return;
    const serie = resumen && Array.isArray(resumen.ventasSemana) ? resumen.ventasSemana : [];
    const conDatos = serie.filter(function(f) { return (Number(f.total) || 0) > 0; }).length;
    const totalSemana = serie.reduce(function(s, f) { return s + (Number(f.total) || 0); }, 0);
    rotulo.textContent = conDatos > 0
      ? (conDatos + (conDatos === 1 ? ' día con ventas' : ' días con ventas') + ' · ' + fmt(totalSemana) + ' en total')
      : 'Sin ventas en los últimos 7 días';
  }

  window.cargarResumen = async function() {
    const kpiCli = porId('kpiClientes');
    const kpiPro = porId('kpiProductos');
    const kpiVen = porId('kpiVentas');
    const kpiMon = porId('kpiMonto');
    const listaTop = porId('listaTopProductos');
    const sinTop = porId('sinTopProductos');
    let resumen = null;
    if (api) {
      try { resumen = await api.obtenerResumen(); } catch (err) { console.warn('stats:resumen', err); }
    }
    if (kpiCli) kpiCli.textContent = String(resumen && resumen.totalClientes != null ? resumen.totalClientes : clientes.length);
    if (kpiPro) kpiPro.textContent = String(resumen && resumen.totalProductos != null ? resumen.totalProductos : productos.length);
    if (kpiVen) kpiVen.textContent = String(resumen && resumen.totalVentas != null ? resumen.totalVentas : 0);
    if (kpiMon) kpiMon.textContent = fmt(resumen && resumen.montoVentasDia != null ? resumen.montoVentasDia : 0);

    // Notas al pie de cada KPI: contexto real en una línea (compacta)
    const ventasHoy = Number(resumen && resumen.totalVentas) || 0;
    const montoHoy = Number(resumen && resumen.montoVentasDia) || 0;
    const pieCli = porId('kpiPieClientes');
    const piePro = porId('kpiPieProductos');
    const pieVen = porId('kpiPieVentas');
    const pieMon = porId('kpiPieMonto');
    if (pieCli) pieCli.textContent = 'Cartera y crédito';
    if (piePro) piePro.textContent = productos.length === 1 ? '1 artículo' : (productos.length + ' artículos');
    if (pieVen) pieVen.textContent = ventasHoy === 1 ? '1 ticket emitido' : (ventasHoy + ' tickets emitidos');
    if (pieMon) pieMon.textContent = ventasHoy > 0 ? ('Ticket prom. ' + fmt(montoHoy / ventasHoy)) : 'Sin ventas aún';
    const kpiCart = porId('kpiCartera');
    const kpiCartTxt = porId('kpiCarteraTexto');
    if (kpiCart) {
      const totalSaldo = clientes.reduce(function(s, c) { return s + Math.max(0, Number(c.saldo) || 0); }, 0);
      const conSaldo = clientes.filter(function(c) { return (Number(c.saldo) || 0) > 0.001; }).length;
      kpiCart.textContent = fmt(totalSaldo);
      if (kpiCartTxt) kpiCartTxt.textContent = conSaldo > 0 ? (conSaldo + (conSaldo === 1 ? ' cliente con saldo' : ' clientes con saldo')) : 'Sin saldos pendientes';
    }
    if (listaTop) {
      const top = resumen && Array.isArray(resumen.topProductos) ? resumen.topProductos : [];
      const maxCant = top.reduce(function(m, t) { return Math.max(m, Number(t.cantidad) || 0); }, 0) || 1;
      listaTop.innerHTML = top.map(function(t, i) {
        const cantidad = Number(t.cantidad) || 0;
        const porcentaje = Math.round((cantidad / maxCant) * 100);
        return '<div class="top-item' + (i < 3 ? ' top-item--top' : '') + '">' +
          '<div class="top-info"><span>#' + (i + 1) + '</span><strong>' + esc(t.nombre) + '</strong></div>' +
          '<span class="top-cantidad">' + cantidad + ' uds · ' + fmt(t.importe) + '</span>' +
          '<div class="top-barra"><div class="top-fill" style="width:' + porcentaje + '%"></div></div>' +
          '</div>';
      }).join('');
    }
    if (sinTop) sinTop.hidden = !!(listaTop && listaTop.children.length > 0);

    // --- Zona de reportes: gráfico semanal, formas de pago y actividad ---
    pintarGraficoSemana(resumen && resumen.ventasSemana);
    pintarPagos(resumen && resumen.pagosHoy);
    pintarActividad(resumen && resumen.ultimasVentas);
    pintarAgotados(resumen && resumen.agotados);
    pintarResumenReportes(resumen);

    actualizarBadges();
  };

  // Respaldo de la base de datos
  const btnRespaldo = porId('btnRespaldo');
  if (btnRespaldo) {
    btnRespaldo.addEventListener('click', async function() {
      if (!api) {
        await window.posAviso({ tipo: 'aviso', mensaje: 'La función de respaldo requiere ejecutar la aplicación SmartPosPro.' });
        return;
      }
      try {
        const res = await api.exportarRespaldo();
        if (res && res.ok) {
          await window.posAviso({ tipo: 'exito', titulo: 'Respaldo exportado', mensaje: 'La copia de seguridad se guardó correctamente.', detalle: res.ruta });
        } else if (!(res && res.cancelado)) {
          await window.posAviso({ tipo: 'aviso', titulo: 'Respaldo no exportado', mensaje: 'No se pudo exportar el respaldo.' });
        }
      } catch (err) {
        console.error('respaldo:exportar', err);
        await window.posAviso({
          tipo: 'peligro',
          titulo: 'Error al exportar',
          mensaje: 'Error al exportar el respaldo.',
          detalle: err && err.message ? err.message : ''
        });
      }
    });
  }

  // Botón "Actualizar" del tablero: recarga los datos con una animación breve
  const btnActualizar = porId('btnActualizarDashboard');
  if (btnActualizar) {
    btnActualizar.addEventListener('click', async function() {
      if (btnActualizar.classList.contains('girando')) return; // evita clics encadenados
      btnActualizar.classList.add('girando');
      try {
        await window.cargarResumen();
      } catch (err) {
        console.error('dashboard:actualizar', err);
        await window.posAviso({ tipo: 'aviso', titulo: 'No se pudo actualizar', mensaje: 'Ocurrió un error al recargar los datos del tablero.' });
      } finally {
        setTimeout(function() { btnActualizar.classList.remove('girando'); }, 700);
      }
    });
  }

  // Enlace "Ver reporte completo" de la zona de reportes
  const btnIrReportes = porId('btnIrReportes');
  if (btnIrReportes) btnIrReportes.addEventListener('click', function() { window.irA('reportes'); });

  // ===== 3. MÓDULO DE CLIENTES =====
  const modalCliente = porId('modalCliente');
  const formCliente = porId('formCliente');

  // Filtro y búsqueda compartidos por la vista de fichas y la de tabla
  // (una sola fuente de verdad, igual que en el catálogo de ventas)
  let filtroClientesActual = 'todos'; // 'todos' | 'con-saldo'

  function clientesFiltrados() {
    const buscador = porId('buscadorClientes') || porId('buscador');
    const q = (buscador ? buscador.value : '').trim().toLowerCase();
    let lista = clientes;
    if (filtroClientesActual === 'con-saldo') {
      lista = lista.filter(function(c) { return (Number(c.saldo) || 0) > 0.001; });
    }
    if (!q) return lista;
    return lista.filter(function(c) {
      return c.nombre.toLowerCase().indexOf(q) !== -1 ||
        (c.codigo || '').toLowerCase().indexOf(q) !== -1 ||
        (c.telefono || '').toLowerCase().indexOf(q) !== -1 ||
        (c.direccion || '').toLowerCase().indexOf(q) !== -1 ||
        (c.correo || '').toLowerCase().indexOf(q) !== -1;
    });
  }

  function clienteIniciales(nombre) {
    const partes = String(nombre || '').trim().split(/\s+/).filter(Boolean);
    if (partes.length === 0) return '?';
    if (partes.length === 1) return partes[0].substring(0, 2).toUpperCase();
    return (partes[0][0] + partes[partes.length - 1][0]).toUpperCase();
  }

  // Etiqueta visible de un cliente: antepone su código (CLI-0001) para poder
  // distinguir a clientes que se llaman igual. Los identificadores internos
  // ya no se muestran al usuario.
  function etiquetaCliente(c) {
    if (!c) return '';
    return (c.codigo ? c.codigo + ' · ' : '') + (c.nombre || '');
  }

  const SVG_TEL = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>';
  const SVG_MAIL = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>';
  const SVG_PIN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>';
  const SVG_OJO = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>';
  const SVG_MAS = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>';
  const SVG_LAPIZ = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>';
  const SVG_PAPELERA = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>';

  function renderTablaClientes() {
    const grid = porId('clientesGrid');
    const tbody = porId('tablaClientes');
    if (!grid && !tbody) return;
    const lista = clientesFiltrados();
    const html = lista.map(function(c) {
      const saldo = Math.max(0, Number(c.saldo) || 0);
      const limite = Math.max(0, Number(c.limite) || 0);
      const disponible = Math.max(0, limite - saldo);
      const sinSaldo = saldo <= 0.001;
      return '<article class="cliente-card">' +
        '<span class="cliente-id">' + esc(c.codigo || ('#' + c.id)) + '</span>' +
        '<div class="cliente-cabecera">' +
          '<div class="cliente-avatar" aria-hidden="true">' + esc(clienteIniciales(c.nombre)) + '</div>' +
          '<div style="min-width:0">' +
            '<h4 class="cliente-nombre" title="' + esc(c.nombre) + '">' + esc(c.nombre) + '</h4>' +
            '<p class="cliente-telefono">' + SVG_TEL + (c.telefono ? esc(c.telefono) : 'Sin teléfono') + '</p>' +
          '</div>' +
        '</div>' +
        '<div class="cliente-creditos">' +
          '<div class="cliente-metrica"><span class="cliente-metrica-label">Saldo</span><span class="cliente-metrica-valor' + (sinSaldo ? ' sin-saldo' : ' destacar') + '">' + fmt(saldo) + '</span></div>' +
          '<div class="cliente-metrica"><span class="cliente-metrica-label">Disponible</span><span class="cliente-metrica-valor' + (disponible > 0.001 ? ' disponible' : ' sin-saldo') + '">' + fmt(disponible) + '</span></div>' +
        '</div>' +
        '<div class="cliente-acciones">' +
          '<button type="button" class="cliente-btn-ficha" title="Ver ficha del cliente" onclick="abrirFichaCliente(' + c.id + ')">' + SVG_OJO + 'Ficha</button>' +
          '<button type="button" class="cliente-btn-abonar" title="' + (sinSaldo ? 'Sin saldo pendiente' : 'Registrar abono') + '" onclick="abrirModalAbono(' + c.id + ')"' + (sinSaldo ? ' disabled' : '') + '>' + SVG_MAS + 'Abonar</button>' +
          '<button type="button" class="cliente-btn-editar" title="Editar" onclick="editarCliente(' + c.id + ')">' + SVG_LAPIZ + '</button>' +
          '<button type="button" class="cliente-btn-eliminar" title="Eliminar" onclick="eliminarCliente(' + c.id + ')">' + SVG_PAPELERA + '</button>' +
        '</div>' +
      '</article>';
    }).join('');
    if (grid) grid.innerHTML = html;
    if (tbody) tbody.innerHTML = renderFilasClientes(lista);
    const contador = porId('contadorClientes');
    if (contador) contador.textContent = lista.length + (lista.length === 1 ? ' cliente' : ' clientes');
    actualizarTarjetasClientes();
    const resumen = porId('clientesResumen');
    if (resumen) {
      const totalSaldo = lista.reduce(function(s, c) { return s + Math.max(0, Number(c.saldo) || 0); }, 0);
      const conDeuda = lista.filter(function(c) { return (Number(c.saldo) || 0) > 0.001; }).length;
      resumen.textContent = lista.length + ' de ' + clientes.length + ' clientes · ' + conDeuda + ' con saldo · Total: ' + fmt(totalSaldo);
    }
    const sinResultados = porId('sinResultadosClientes') || porId('sinResultados');
    if (sinResultados) sinResultados.hidden = lista.length > 0;
    actualizarBadges();
  }

  // Filas del directorio: la tabla y las fichas comparten exactamente los mismos datos
  function renderFilasClientes(lista) {
    return lista.map(function(c) {
      const saldo = Math.max(0, Number(c.saldo) || 0);
      const limite = Math.max(0, Number(c.limite) || 0);
      const disponible = Math.max(0, limite - saldo);
      const sinSaldo = saldo <= 0.001;
      return '<tr>' +
        '<td><span class="producto-id">' + esc(c.codigo || ('#' + c.id)) + '</span></td>' +
        '<td><div class="producto-celda-nombre">' +
          '<span class="cliente-avatar-sm" aria-hidden="true">' + esc(clienteIniciales(c.nombre)) + '</span>' +
          '<span class="cliente-celda-datos">' +
            '<span class="cliente-nombre" title="' + esc(c.nombre) + '">' + esc(c.nombre) + '</span>' +
            '<small class="cliente-celda-sub" title="' + esc(c.direccion || 'Sin dirección') + '">' + (c.direccion ? esc(c.direccion) : 'Sin dirección') + '</small>' +
          '</span>' +
        '</div></td>' +
        '<td>' + (c.telefono ? '<span class="cliente-celda-contacto" title="' + esc(c.telefono) + '">' + esc(c.telefono) + '</span>' : '<em class="sin-dato">Sin teléfono</em>') + '</td>' +
        '<td>' + (c.correo ? '<span class="cliente-celda-contacto" title="' + esc(c.correo) + '">' + esc(c.correo) + '</span>' : '<em class="sin-dato">Sin correo</em>') + '</td>' +
        '<td class="num">' + fmt(limite) + '</td>' +
        '<td class="num"><span class="cliente-saldo' + (sinSaldo ? ' sin-saldo' : ' con-saldo') + '">' + fmt(saldo) + '</span></td>' +
        '<td class="num"><span class="cliente-disponible' + (disponible > 0.001 ? '' : ' sin-saldo') + '">' + fmt(disponible) + '</span></td>' +
        '<td>' + accionesFilaCliente(c, sinSaldo) + '</td>' +
      '</tr>';
    }).join('');
  }

  // Acciones compactas de cada fila (mismos destinos que los botones de la ficha)
  function accionesFilaCliente(c, sinSaldo) {
    return '<button type="button" class="btn-detalle btn-icono" title="Ver ficha del cliente" onclick="abrirFichaCliente(' + c.id + ')">' + SVG_OJO + '</button>' +
      '<button type="button" class="btn-abonar-sm btn-icono" title="' + (sinSaldo ? 'Sin saldo pendiente' : 'Registrar abono') + '" onclick="abrirModalAbono(' + c.id + ')"' + (sinSaldo ? ' disabled' : '') + '>' + SVG_MAS + '</button>' +
      '<button type="button" class="btn-editar btn-icono" title="Editar cliente" onclick="editarCliente(' + c.id + ')">' + SVG_LAPIZ + '</button>' +
      '<button type="button" class="btn-eliminar btn-icono" title="Eliminar cliente" onclick="eliminarCliente(' + c.id + ')">' + SVG_PAPELERA + '</button>';
  }

  // Tarjetas de resumen de la cabecera del módulo (mismo patrón del módulo de Compras)
  function actualizarTarjetasClientes() {
    const total = clientes.length;
    const conSaldo = clientes.filter(function(c) { return (Number(c.saldo) || 0) > 0.001; }).length;
    const totalSaldo = clientes.reduce(function(s, c) { return s + Math.max(0, Number(c.saldo) || 0); }, 0);
    const kpiTotal = porId('kpiClientesTotal');
    if (kpiTotal) kpiTotal.textContent = total + (total === 1 ? ' cliente' : ' clientes');
    const kpiSaldo = porId('kpiClientesSaldo');
    if (kpiSaldo) kpiSaldo.textContent = fmt(totalSaldo);
    const kpiConSaldo = porId('kpiClientesConSaldo');
    if (kpiConSaldo) kpiConSaldo.textContent = conSaldo + ' con saldo';
    const tabTodos = porId('tabClientesTodos');
    if (tabTodos) {
      const activo = filtroClientesActual === 'todos';
      tabTodos.classList.toggle('activo', activo);
      tabTodos.setAttribute('aria-pressed', activo ? 'true' : 'false');
    }
    const tabConSaldo = porId('tabClientesConSaldo');
    if (tabConSaldo) {
      const activo = filtroClientesActual === 'con-saldo';
      tabConSaldo.classList.toggle('activo', activo);
      tabConSaldo.setAttribute('aria-pressed', activo ? 'true' : 'false');
    }
  }

  // ===== 3b. VISTA INTERCAMBIABLE DEL DIRECTORIO: FICHAS / TABLA =====
  let vistaClientesModo = 'fichas'; // 'fichas' | 'tabla'

  window.cambiarVistaClientes = function() {
    const grid = porId('clientesGrid');
    const wrap = porId('wrapTablaClientes');
    const lbl = porId('lblVistaClientes');
    const icono = porId('iconoVistaClientes');
    if (!grid || !wrap) return;
    vistaClientesModo = (vistaClientesModo === 'fichas') ? 'tabla' : 'fichas';
    const esTabla = vistaClientesModo === 'tabla';
    grid.hidden = esTabla;
    wrap.hidden = !esTabla;
    if (lbl) lbl.textContent = esTabla ? 'Fichas' : 'Tabla';
    if (icono) icono.textContent = esTabla ? '⊞' : '⊟';
  };

  function configurarVistaClientes() {
    const btn = porId('btnCambiarVistaClientes');
    if (btn) btn.addEventListener('click', window.cambiarVistaClientes);
    const tabTodos = porId('tabClientesTodos');
    if (tabTodos) {
      tabTodos.addEventListener('click', function() {
        filtroClientesActual = 'todos';
        renderTablaClientes();
      });
    }
    const tabConSaldo = porId('tabClientesConSaldo');
    if (tabConSaldo) {
      tabConSaldo.addEventListener('click', function() {
        filtroClientesActual = (filtroClientesActual === 'con-saldo') ? 'todos' : 'con-saldo';
        renderTablaClientes();
      });
    }
  }
  configurarVistaClientes();

  // ===== 3a. FICHA DE CLIENTE (panel lateral con datos reales de la BD) =====
  const fichaOverlay = porId('fichaClienteOverlay');
  const fichaEl = porId('fichaCliente');
  const fichaCuerpo = porId('fichaClienteCuerpo');
  const fichaNombre = porId('fichaClienteNombre');
  const fichaSub = porId('fichaClienteSub');
  const fichaAvatar = porId('fichaClienteAvatar');
  const fichaBtnCerrar = porId('fichaClienteCerrar');
  const fichaBtnEditar = porId('fichaBtnEditar');
  const fichaBtnAbonar = porId('fichaBtnAbonar');
  let fichaClienteActual = 0;

  window.cerrarFichaCliente = function() {
    if (fichaEl) fichaEl.classList.add('cliente-ficha-cerrado');
    if (fichaOverlay) fichaOverlay.classList.add('cliente-ficha-cerrado');
  };
  if (fichaOverlay) fichaOverlay.addEventListener('click', window.cerrarFichaCliente);
  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape' && fichaEl && !fichaEl.classList.contains('cliente-ficha-cerrado')) window.cerrarFichaCliente();
  });

  function fichaDato(svg, etiqueta, valor) {
    const limpio = String(valor == null ? '' : valor).trim();
    return '<div class="ficha-dato">' + svg + '<span>' + etiqueta + ': ' + (limpio ? esc(limpio) : '<em class="sin-dato">No especificado</em>') + '</span></div>';
  }

  window.abrirFichaCliente = async function(id) {
    const c = clientes.find(function(cl) { return cl.id === Number(id); });
    if (!c || !fichaCuerpo) return;
    if (fichaNombre) fichaNombre.textContent = c.nombre;
    if (fichaSub) fichaSub.textContent = (c.codigo ? c.codigo : 'Cliente #' + c.id) + (c.telefono ? ' · ' + c.telefono : '');
    if (fichaAvatar) fichaAvatar.textContent = clienteIniciales(c.nombre);
    fichaClienteActual = c.id;
    const saldo = Math.max(0, Number(c.saldo) || 0);
    const limite = Math.max(0, Number(c.limite) || 0);
    const disponible = Math.max(0, limite - saldo);
    fichaCuerpo.innerHTML =
      '<div class="ficha-metricas">' +
        '<div class="ficha-metrica"><span class="ficha-metrica-label">Saldo pendiente</span><span class="ficha-metrica-valor" id="fichaMetricaSaldo">' + fmt(saldo) + '</span></div>' +
        '<div class="ficha-metrica"><span class="ficha-metrica-label">Disponible</span><span class="ficha-metrica-valor" id="fichaMetricaDisp">' + fmt(disponible) + '</span></div>' +
        '<div class="ficha-metrica"><span class="ficha-metrica-label">Límite de crédito</span><span class="ficha-metrica-valor">' + fmt(limite) + '</span></div>' +
        '<div class="ficha-metrica"><span class="ficha-metrica-label">Total abonado</span><span class="ficha-metrica-valor" id="fichaMetricaAbonos">—</span></div>' +
      '</div>' +
      '<div class="ficha-seccion"><h4 class="ficha-seccion-titulo">Datos de contacto</h4><div class="ficha-datos">' +
        fichaDato(SVG_TEL, 'Teléfono', c.telefono) +
        fichaDato(SVG_MAIL, 'Correo', c.correo) +
        fichaDato(SVG_PIN, 'Dirección', c.direccion) +
      '</div></div>' +
      '<div class="ficha-seccion"><h4 class="ficha-seccion-titulo">Facturas con saldo pendiente</h4><div id="fichaFacturasWrap"><p class="ficha-vacio">Cargando…</p></div></div>' +
      '<div class="ficha-seccion"><h4 class="ficha-seccion-titulo">Historial de abonos</h4><div id="fichaAbonosWrap"><p class="ficha-vacio">Cargando…</p></div></div>';
    if (fichaEl) fichaEl.classList.remove('cliente-ficha-cerrado');
    if (fichaOverlay) fichaOverlay.classList.remove('cliente-ficha-cerrado');

    let facturas = [];
    let abonos = [];
    if (api) {
      try {
        const res = await Promise.all([
          api.obtenerFacturasPendientes(c.id),
          api.obtenerHistorialAbonos(c.id)
        ]);
        facturas = Array.isArray(res[0]) ? res[0] : [];
        abonos = Array.isArray(res[1]) ? res[1] : [];
      } catch (err) { console.warn('ficha:datos', err); }
    }
    // El saldo autoritativo es la suma de facturas pendientes en la BD
    let saldoReal = 0;
    facturas.forEach(function(f) { saldoReal += Math.max(0, Number(f.saldo_pendiente) || 0); });
    if (facturas.length > 0) c.saldo = saldoReal;
    const saldoFinal = Math.max(0, Number(c.saldo) || 0);
    const dispFinal = Math.max(0, limite - saldoFinal);
    const mSaldo = porId('fichaMetricaSaldo');
    if (mSaldo) { mSaldo.textContent = fmt(saldoFinal); mSaldo.className = 'ficha-metrica-valor' + (saldoFinal > 0.001 ? ' destacar' : ' sin-saldo'); }
    const mDisp = porId('fichaMetricaDisp');
    if (mDisp) { mDisp.textContent = fmt(dispFinal); mDisp.className = 'ficha-metrica-valor' + (dispFinal > 0.001 ? ' disponible' : ' sin-saldo'); }
    fichaRenderTablas(facturas, abonos);
  }

  // Acciones del pie de la ficha
  if (fichaBtnCerrar) fichaBtnCerrar.addEventListener('click', window.cerrarFichaCliente);
  if (fichaBtnEditar) fichaBtnEditar.addEventListener('click', function() {
    const idAct = fichaClienteActual;
    window.cerrarFichaCliente();
    if (idAct) window.editarCliente(idAct);
  });
  if (fichaBtnAbonar) fichaBtnAbonar.addEventListener('click', async function() {
    const idAct = fichaClienteActual;
    if (!idAct) return;
    const c = clientes.find(function(cl) { return cl.id === idAct; });
    if (c && (Number(c.saldo) || 0) <= 0.001) {
      await window.posAviso({ tipo: 'info', titulo: 'Sin saldo pendiente', mensaje: 'Este cliente no tiene saldo pendiente.' });
      return;
    }
    window.cerrarFichaCliente();
    window.abrirModalAbono(idAct);
  });
  function fichaRenderTablas(facturas, abonos) {
    const wrapF = porId('fichaFacturasWrap');
    const wrapA = porId('fichaAbonosWrap');
    if (wrapF) {
      if (facturas.length === 0) {
        wrapF.innerHTML = '<p class="ficha-vacio">No hay facturas con saldo pendiente registradas.</p>';
      } else {
        let total = 0;
        facturas.forEach(function(f) { total += Math.max(0, Number(f.saldo_pendiente) || 0); });
        wrapF.innerHTML = '<div class="ficha-tabla-wrap"><table><thead><tr><th>Factura</th><th>Fecha</th><th class="num">Total</th><th class="num">Pendiente</th></tr></thead><tbody>' +
          facturas.map(function(f) {
            const pend = Math.max(0, Number(f.saldo_pendiente) || 0);
            const tot = Math.max(0, Number(f.total) || 0);
            return '<tr><td>' + esc(f.numero || ('#' + f.id)) + (pend < tot ? ' <span class="ficha-badge-deuda">parcial</span>' : '') + '</td><td>' + esc(f.fecha || '-') + '</td><td class="num">' + fmt(tot) + '</td><td class="num rojo">' + fmt(pend) + '</td></tr>';
          }).join('') +
          '</tbody></table></div>';
      }
    }
    let totalAbonado = 0;
    abonos.forEach(function(a) { totalAbonado += Math.max(0, Number(a.monto) || 0); });
    const mAbonos = porId('fichaMetricaAbonos');
    if (mAbonos) mAbonos.textContent = fmt(totalAbonado);
    if (wrapA) {
      if (abonos.length === 0) {
        wrapA.innerHTML = '<p class="ficha-vacio">Sin abonos registrados.</p>';
      } else {
        wrapA.innerHTML = '<div class="ficha-tabla-wrap"><table><thead><tr><th>Fecha</th><th class="num">Monto</th><th>Factura</th><th>Detalle</th></tr></thead><tbody>' +
          abonos.map(function(a) {
            return '<tr><td>' + esc(a.fecha || '-') + '</td><td class="num verde">' + fmt(a.monto) + '</td><td>' + esc(referenciaAbono(a)) + '</td><td>' + esc(a.descripcion || 'Sin comentario registrado') + '</td></tr>';
          }).join('') +
          '</tbody></table></div>';
      }
    }
  }


  function proximoIdLocal() {
    return clientes.length > 0 ? Math.max.apply(null, clientes.map(function(c) { return c.id; })) + 1 : 1;
  }

  // Código local (modo sin base de datos): replica el formato CLI-0001 del backend.
  function codigoClienteLocal(id) {
    return 'CLI-' + String(Number(id) || 0).padStart(4, '0');
  }

  // ---- Ficha "Nuevo / Editar cliente" (coherente con la pantalla de clientes) ----
  let clienteModalActual = 0; // id del cliente en edición (0 = nuevo)

  function mostrarErrorCliente(mensaje) {
    const err = porId('errorCliente');
    if (!err) return;
    if (mensaje) { err.textContent = mensaje; err.hidden = false; }
    else { err.textContent = ''; err.hidden = true; }
  }

  // Vista previa en vivo: iniciales del avatar y crédito disponible (límite − saldo)
  function actualizarPreviewCliente() {
    const c = clienteModalActual > 0 ? clientes.find(function(cl) { return cl.id === clienteModalActual; }) : null;
    const nombre = ((porId('campoNombre') || {}).value || '').trim();
    const avatar = porId('clienteAvatarPreview');
    if (avatar) avatar.textContent = nombre ? clienteIniciales(nombre) : '?';
    const limite = Math.max(0, parseFloat((porId('campoLimite') || {}).value) || 0);
    const saldo = c ? Math.max(0, Number(c.saldo) || 0) : 0;
    const disp = porId('clienteDispPreview');
    if (disp) disp.textContent = fmt(Math.max(0, limite - saldo));
  }

  function prepararFichaModal(clienteEnEdicion) {
    clienteModalActual = clienteEnEdicion ? clienteEnEdicion.id : 0;
    const sub = porId('clienteModalSub');
    if (sub) sub.textContent = clienteEnEdicion
      ? 'Editando ' + (clienteEnEdicion.codigo || ('cliente #' + clienteEnEdicion.id)) + ' · ' + clienteEnEdicion.nombre
      : 'Registra un nuevo cliente en el directorio';
    mostrarErrorCliente('');
    actualizarPreviewCliente();
  }

  const btnNuevoCliente = porId('btnNuevo');
  if (btnNuevoCliente) {
    btnNuevoCliente.addEventListener('click', function() {
      const mt = porId('modalTitulo');
      if (mt) mt.textContent = 'Nuevo cliente';
      if (formCliente) formCliente.reset();
      const ci = porId('clienteId');
      if (ci) ci.value = '';
      prepararFichaModal(null);
      if (modalCliente) modalCliente.removeAttribute('hidden');
      const campoNombre = porId('campoNombre');
      if (campoNombre) campoNombre.focus();
    });
  }
  const btnCancelarCliente = porId('btnCancelar');
  if (btnCancelarCliente) {
    btnCancelarCliente.addEventListener('click', function() {
      if (modalCliente) modalCliente.setAttribute('hidden', 'true');
    });
  }
  // Cierre con Esc o clic fuera, igual que la ficha lateral del cliente
  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape' && modalCliente && !modalCliente.hasAttribute('hidden')) {
      modalCliente.setAttribute('hidden', 'true');
    }
  });
  if (modalCliente) {
    modalCliente.addEventListener('mousedown', function(e) {
      if (e.target === modalCliente) modalCliente.setAttribute('hidden', 'true');
    });
  }
  ['campoNombre', 'campoLimite'].forEach(function(cid) {
    const el = porId(cid);
    if (el) el.addEventListener('input', function() { actualizarPreviewCliente(); });
  });

  window.editarCliente = function(id) {
    const c = clientes.find(function(cl) { return cl.id === Number(id); });
    if (!c) return;
    const mt = porId('modalTitulo');
    if (mt) mt.textContent = 'Editar cliente';
    const mapa = { campoNombre: c.nombre, campoTelefono: c.telefono, campoDireccion: c.direccion, campoCorreo: c.correo, campoLimite: c.limite };
    Object.keys(mapa).forEach(function(cid) { const el = porId(cid); if (el) el.value = mapa[cid]; });
    // CRÍTICO: registrar el id en el campo oculto; sin esto el submit cree que es alta y crea un cliente nuevo en vez de editar.
    const ci = porId('clienteId');
    if (ci) ci.value = String(c.id);
    prepararFichaModal(c);
    if (modalCliente) modalCliente.removeAttribute('hidden');
    const campoNombre = porId('campoNombre');
    if (campoNombre) campoNombre.focus();
  };

    window.eliminarCliente = async function(id) {
    const cliente = clientes.find(function(c) { return c.id === Number(id); }) || null;
    const confirmado = await window.posConfirmar({
      tipo: 'peligro',
      titulo: 'Eliminar cliente',
      mensaje: 'El cliente se quitará del directorio y no se puede deshacer.',
      detalle: cliente ? cliente.nombre : '',
      aceptar: 'Sí, eliminar'
    });
    if (!confirmado) return;
    let ok = false;
    if (api) {
      try {
        await api.eliminarCliente(Number(id));
        ok = true;
      } catch (err) {
        console.warn('clientes:eliminar', err);
        await window.posAviso({
          tipo: 'peligro',
          titulo: 'No se pudo eliminar',
          mensaje: 'No se pudo eliminar el cliente.',
          detalle: err && err.message ? err.message : 'Error inesperado'
        });
        return;
      }
    }
    // Solo remover de la lista local cuando el backend confirmó el borrado.
    if (ok) {
      const idx = clientes.findIndex(function(c) { return c.id === Number(id); });
      if (idx !== -1) clientes.splice(idx, 1);
    }
    renderTablaClientes();
    actualizarSelectClientes();
    renderTablaAbonos();
    cargarResumen();
  };

  if (formCliente) {
    formCliente.addEventListener('submit', async function(e) {
      e.preventDefault();
      const campoNombre = porId('campoNombre');
      const nombre = (campoNombre ? campoNombre.value : '').trim();
      // Validaciones alineadas con src/clientes/clientes.ts (validarDatosCliente)
      if (nombre.length < 2) {
        mostrarErrorCliente('El nombre del cliente debe tener al menos 2 caracteres.');
        if (campoNombre) campoNombre.focus();
        return;
      }
      const telefono = (porId('campoTelefono') || {}).value ? porId('campoTelefono').value.trim() : '';
      const direccion = (porId('campoDireccion') || {}).value ? porId('campoDireccion').value.trim() : '';
      const correo = (porId('campoCorreo') || {}).value ? porId('campoCorreo').value.trim() : '';
      const limite = parseFloat((porId('campoLimite') || {}).value) || 0;
      if (telefono && !/^[0-9+\-\s()]{7,20}$/.test(telefono)) {
        mostrarErrorCliente('El teléfono ingresado no tiene un formato válido.');
        const tel = porId('campoTelefono'); if (tel) tel.focus();
        return;
      }
      if (correo && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)) {
        mostrarErrorCliente('El correo ingresado no tiene un formato válido.');
        const co = porId('campoCorreo'); if (co) co.focus();
        return;
      }
      if (limite < 0) {
        mostrarErrorCliente('El límite de crédito no puede ser negativo.');
        const lim = porId('campoLimite'); if (lim) lim.focus();
        return;
      }
      mostrarErrorCliente('');
      const ci = porId('clienteId');
      // El id del modal en edición (clienteModalActual) respalda al campo oculto por si el DOM se redibujó.
      const id = parseInt(ci ? ci.value : '0', 10) || clienteModalActual || 0;
      const datos = { nombre: nombre, telefono: telefono, direccion: direccion, correo: correo, limiteCredito: limite };
      let guardado = false;
      if (api) {
        try {
          if (id > 0) {
            await api.editarCliente(id, datos);
            const c = clientes.find(function(x) { return x.id === id; });
            if (c) { c.nombre = nombre; c.telefono = telefono; c.direccion = direccion; c.correo = correo; c.limite = limite; }
            guardado = true;
          } else {
            const res = await api.crearCliente(datos);
            const nuevoId = res && res.lastInsertRowid != null ? Number(res.lastInsertRowid) : proximoIdLocal();
            clientes.push({ id: nuevoId, codigo: (res && res.codigo) || codigoClienteLocal(nuevoId), nombre: nombre, telefono: telefono, direccion: direccion, correo: correo, limite: limite, saldo: 0 });
            guardado = true;
          }
        } catch (err) { console.warn('clientes:guardar', err); }
      }
      if (!guardado) {
        if (id > 0) {
          const c = clientes.find(function(x) { return x.id === id; });
          if (c) { c.nombre = nombre; c.telefono = telefono; c.direccion = direccion; c.correo = correo; c.limite = limite; }
        } else {
          const idLocal = proximoIdLocal();
          clientes.push({ id: idLocal, codigo: codigoClienteLocal(idLocal), nombre: nombre, telefono: telefono, direccion: direccion, correo: correo, limite: limite, saldo: 0 });
        }
      }
      renderTablaClientes();
      actualizarSelectClientes();
      renderTablaAbonos();
      cargarResumen();
      if (modalCliente) modalCliente.setAttribute('hidden', 'true');
      formCliente.reset();
      if (ci) ci.value = '';
      prepararFichaModal(null);
    });
  }

  // ===== 3b. ABONOS A CRÉDITO (modal) =====
  const modalAbono = porId('modalAbono');
  const formAbono = porId('formAbono');

  window.abrirModalAbono = async function(id) {
    const c = clientes.find(function(cl) { return cl.id === Number(id); });
    if (!c) return;
    clienteAbonoId = c.id;
    const saldoAbono = porId('saldoAbono');
    if (saldoAbono) {
      saldoAbono.textContent = 'Saldo pendiente de ' + etiquetaCliente(c) + ': ' + fmt(c.saldo) + ' — Máximo a abonar: ' + fmt(c.saldo);
    }
    const montoInput = porId('campoMontoAbono');
    const notaInput = porId('campoNotaAbono');
    if (notaInput) notaInput.value = '';
    if (montoInput) { montoInput.value = ''; montoInput.max = c.saldo.toFixed(2); }
    const errorEl = porId('errorAbono');
    if (errorEl) { errorEl.hidden = true; errorEl.textContent = ''; }
    const wrap = porId('listaAbonosWrapper');
    const det = porId('detalleAbonos');
    if (wrap) wrap.hidden = true;
    if (det) { det.textContent = ''; det.className = 'detalle-pago-applied hidden'; }
    if (modalAbono) modalAbono.removeAttribute('hidden');
    // Sincronizar el saldo con la fuente autoritativa (suma de facturas pendientes en la BD)
    if (api) {
      try {
        const conSaldo = await api.listarClientesConSaldo();
        if (Array.isArray(conSaldo)) {
          const fila = conSaldo.find(function(x) { return Number(x.id) === c.id; });
          if (fila && fila.saldoPendiente != null) {
            c.saldo = Math.max(0, Number(fila.saldoPendiente));
            if (saldoAbono) {
              saldoAbono.textContent = 'Saldo pendiente de ' + etiquetaCliente(c) + ': ' + fmt(c.saldo) + ' — Máximo a abonar: ' + fmt(c.saldo);
            }
            if (montoInput) montoInput.max = c.saldo.toFixed(2);
          }
        }
      } catch (err) { console.warn('abonos:listar-clientes-con-saldo', err); }
    }
    if (api) {
      try {
        const hist = await api.obtenerHistorialAbonos(c.id);
        if (Array.isArray(hist) && hist.length > 0 && wrap) {
          const cuerpo = porId('listaAbonos');
          if (cuerpo) {
            cuerpo.innerHTML = hist.map(function(a) {
              return '<tr><td>' + esc(a.fecha || '-') + '</td><td class="num">' + fmt(a.monto) + '</td><td>' + esc(referenciaAbono(a)) + '</td><td>' + esc(a.descripcion || 'Sin comentario registrado') + '</td></tr>';
            }).join('');
          }
          wrap.hidden = false;
        }
      } catch (err) { console.warn('abonos:historial', err); }
    }
  };

  const btnCancelarAbono = porId('btnCancelarAbono');
  if (btnCancelarAbono) {
    btnCancelarAbono.addEventListener('click', function() {
      if (modalAbono) modalAbono.setAttribute('hidden', 'true');
    });
  }

  if (formAbono) {
    formAbono.addEventListener('submit', async function(e) {
      e.preventDefault();
      const cliente = clientes.find(function(c) { return c.id === clienteAbonoId; });
      if (!cliente) return;
      const montoInput = porId('campoMontoAbono');
      const errorEl = porId('errorAbono');
      const monto = parseFloat(montoInput ? montoInput.value : '0') || 0;
      function mostrarError(msg) {
        if (errorEl) { errorEl.textContent = msg; errorEl.hidden = false; }
      }
      if (monto <= 0) { mostrarError('Ingresa un monto de abono válido.'); return; }
      if (monto > cliente.saldo) {
        mostrarError('El abono no puede ser mayor al saldo pendiente (' + fmt(cliente.saldo) + ').');
        return;
      }
      let restante = cliente.saldo - monto;
      let detalles = null;
      if (api) {
        try {
          const notaEl = porId('campoNotaAbono');
          const nota = ((notaEl && notaEl.value) || '').trim();
          const res = await api.aplicarAbonoInteligente(clienteAbonoId, monto, nota);
          if (res && res.restante != null) restante = Number(res.restante);
          detalles = res && Array.isArray(res.detalles) ? res.detalles : null;
        } catch (err) {
          console.warn('clientes:abonar', err);
          mostrarError('No se pudo registrar el abono: ' + (err && err.message ? err.message : 'error inesperado'));
          return;
        }
      }
      cliente.saldo = Math.max(0, restante);
      const det = porId('detalleAbonos');
      if (det) {
        det.className = 'detalle-pago-applied';
        det.textContent = 'Abono de ' + fmt(monto) + ' registrado. Saldo restante: ' + fmt(cliente.saldo) +
          (detalles && detalles.length > 0 ? ' · Aplicado a ' + detalles.length + ' factura(s).' : '');
      }
      renderTablaClientes();
      renderTablaAbonos();
      cargarResumen();
      if (modalAbono) modalAbono.setAttribute('hidden', 'true');
      formAbono.reset();
    });
  }

  // ===== 4. MÓDULO DE PRODUCTOS =====
  const modalProducto = porId('modalProducto');
  const formProducto = porId('formProducto');
  let categoriaProductoAdminActual = 'Todos';
  let vistaProductosAdminModo = 'tarjetas'; // 'tarjetas' | 'tabla'
  let filtroStockAdminActual = 'todos'; // 'todos' | 'bajo' | 'agotados'

  function productosFiltrados() {
    const buscador = porId('buscadorProductos');
    const q = (buscador ? buscador.value : '').trim().toLowerCase();
    const filtroStock = filtroStockAdminActual;
    return productos.filter(function(p) {
      const stock = Math.max(0, Number(p.stock) || 0);
      if (filtroStock === 'bajo' && !(stock > 0 && stock <= 5)) return false;
      if (filtroStock === 'agotados' && !(stock <= 0)) return false;
      const okCat = categoriaProductoAdminActual === 'Todos' || (p.categoria || '').trim() === categoriaProductoAdminActual;
      const okQ = !q ||
        p.nombre.toLowerCase().indexOf(q) !== -1 ||
        String(p.codigo || '').toLowerCase().indexOf(q) !== -1 ||
        (p.categoria || '').toLowerCase().indexOf(q) !== -1 ||
        String(p.codigoBarras || '').toLowerCase().indexOf(q) !== -1;
      return okCat && okQ;
    });
  }

  function productoIniciales(nombre) {
    const partes = String(nombre || '').trim().split(/\s+/).filter(Boolean);
    if (partes.length === 0) return '?';
    if (partes.length === 1) return partes[0].substring(0, 2).toUpperCase();
    return (partes[0][0] + partes[partes.length - 1][0]).toUpperCase();
  }

  function estadoStock(stock) {
    if (stock <= 0) return { clase: 'agotado', etiqueta: 'Agotado' };
    if (stock <= 5) return { clase: 'bajo', etiqueta: 'Bajo' };
    return { clase: 'ok', etiqueta: 'Disponible' };
  }

  function renderChipsProductosAdmin() {
    const chips = porId('chipsCategoriasProductos');
    if (!chips) return;
    const cats = ['Todos'];
    productos.forEach(function(p) {
      const cat = (p.categoria || '').trim();
      if (cat && cats.indexOf(cat) === -1) cats.push(cat);
    });
    if (cats.indexOf(categoriaProductoAdminActual) === -1) categoriaProductoAdminActual = 'Todos';
    chips.innerHTML = cats.map(function(cat) {
      return '<button type="button" class="pos-chip' + (cat === categoriaProductoAdminActual ? ' activo' : '') + '" data-cat="' + esc(cat) + '">' + esc(cat) + '</button>';
    }).join('');
    chips.querySelectorAll('.pos-chip').forEach(function(chip) {
      chip.addEventListener('click', function() {
        categoriaProductoAdminActual = chip.getAttribute('data-cat');
        renderTablaProductos();
      });
    });
  }

  window.cambiarVistaProductosAdmin = function() {
    const grid = porId('productosGrid');
    const wrap = porId('wrapTablaProductosAdmin');
    const lbl = porId('lblVistaProductosAdmin');
    const icono = porId('iconoVistaProductosAdmin');
    if (!grid || !wrap) return;
    vistaProductosAdminModo = (vistaProductosAdminModo === 'tarjetas') ? 'tabla' : 'tarjetas';
    if (vistaProductosAdminModo === 'tabla') {
      grid.hidden = true;
      wrap.hidden = false;
      if (lbl) lbl.textContent = 'Tarjetas';
      if (icono) icono.textContent = '⊞';
    } else {
      grid.hidden = false;
      wrap.hidden = true;
      if (lbl) lbl.textContent = 'Tabla';
      if (icono) icono.textContent = '⊟';
    }
  };

  function renderGridProductosAdmin(lista) {
    const grid = porId('productosGrid');
    if (!grid) return;
    grid.innerHTML = lista.map(function(p) {
      const stock = Math.max(0, Number(p.stock) || 0);
      const est = estadoStock(stock);
      const badgeClase = est.clase === 'ok' ? 'badge-stock' : (est.clase === 'bajo' ? 'badge-stock stock-bajo-suave' : 'badge-stock stock-agotado');
      const valorTotal = (Number(p.precio) || 0) * stock;
      const agotado = stock <= 0;
      return '<article class="producto-admin-card' + (agotado ? ' agotado' : '') + '" data-id="' + p.id + '">' +
        '<div class="producto-admin-top">' +
          '<div class="producto-admin-top-left">' +
            '<span class="producto-id">' + esc(codigoProductoVisible(p)) + '</span>' +
            '<span class="producto-categoria" title="' + esc(p.categoria || 'General') + '">' + esc((p.categoria || 'General').trim() || 'General') + '</span>' +
          '</div>' +
          '<span class="pos-avatar" aria-hidden="true">' + esc(productoIniciales(p.nombre)) + '</span>' +
        '</div>' +
        '<div class="producto-admin-cuerpo">' +
          '<div class="producto-admin-info">' +
            '<h4 class="producto-nombre" title="' + esc(p.nombre) + '">' + esc(p.nombre) + '</h4>' +
            '<span class="producto-precio">' + fmt(p.precio) + '</span>' +
          '</div>' +
        '</div>' +
        '<div class="producto-admin-metricas">' +
          '<span class="' + badgeClase + '">' + stock + ' uds · ' + est.etiqueta + '</span>' +
          '<span class="producto-admin-valor">Total: <strong>' + fmt(valorTotal) + '</strong></span>' +
        '</div>' +
        '<div class="producto-card-acciones">' +
          '<button type="button" class="producto-btn-editar" title="Editar producto" data-id="' + p.id + '">' + SVG_LAPIZ + 'Editar</button>' +
          '<button type="button" class="producto-btn-eliminar" title="Eliminar producto" data-id="' + p.id + '">' + SVG_PAPELERA + 'Eliminar</button>' +
        '</div>' +
      '</article>';
    }).join('');

    grid.querySelectorAll('.producto-admin-card').forEach(function(card) {
      card.addEventListener('click', function(e) {
        if (e.target.closest('.producto-btn-eliminar')) return;
        const pid = parseInt(card.getAttribute('data-id'), 10);
        if (pid) editarProducto(pid);
      });
    });

    grid.querySelectorAll('.producto-btn-eliminar').forEach(function(btn) {
      btn.addEventListener('click', function(e) {
        e.stopPropagation();
        const pid = parseInt(btn.getAttribute('data-id'), 10);
        if (pid) eliminarProducto(pid);
      });
    });
  }

  function renderTablaProductos() {
    const tbody = porId('tablaProductos');
    if (!tbody) return;
    const lista = productosFiltrados();
    renderChipsProductosAdmin();
    renderGridProductosAdmin(lista);
    tbody.innerHTML = lista.map(function(p) {
      const stock = Math.max(0, Number(p.stock) || 0);
      const est = estadoStock(stock);
      return '<tr>' +
        '<td><span class="producto-id">' + esc(p.codigo || ('PRD-' + String(p.id).padStart(5, '0'))) + '</span></td>' +
        '<td><div class="producto-celda-nombre">' +
          '<span class="producto-avatar-sm" aria-hidden="true">' + esc(productoIniciales(p.nombre)) + '</span>' +
          '<span class="producto-nombre" title="' + esc(p.nombre) + '">' + esc(p.nombre) + '</span>' +
          (p.codigoBarras ? '<span class="producto-codigo-barras" title="Código de barras">' + esc(p.codigoBarras) + '</span>' : '') +
        '</div></td>' +
        '<td class="num celda-precio">' + fmt(p.precio) + '</td>' +
        '<td class="num"><span class="producto-stock ' + est.clase + '" title="' + est.etiqueta + '">' + stock + ' · ' + est.etiqueta + '</span></td>' +
        '<td>' + (p.categoria ? '<span class="producto-chip-cat">' + esc(p.categoria) + '</span>' : '<em class="sin-dato">Sin categoría</em>') + '</td>' +
        '<td>' +
          '<button type="button" class="btn-editar btn-icono" title="Editar producto" onclick="editarProducto(' + p.id + ')">' + SVG_LAPIZ + '</button>' +
          '<button type="button" class="btn-eliminar btn-icono" title="Eliminar producto" onclick="eliminarProducto(' + p.id + ')">' + SVG_PAPELERA + '</button>' +
        '</td>' +
      '</tr>';
    }).join('');
    const contador = porId('contadorProductos');
    if (contador) contador.textContent = lista.length + (lista.length === 1 ? ' producto' : ' productos');
    const resumen = porId('productosResumen');
    if (resumen) {
      const totalCatalogo = productos.length;
      const bajoStock = productos.filter(function(p) { const st = Number(p.stock) || 0; return st > 0 && st <= 5; }).length;
      const agotados = productos.filter(function(p) { return (Number(p.stock) || 0) <= 0; }).length;
      const valorInventario = lista.reduce(function(s, p) { return s + (Number(p.precio) || 0) * Math.max(0, Number(p.stock) || 0); }, 0);
      const valorTotalCatalogo = productos.reduce(function(s, p) { return s + (Number(p.precio) || 0) * Math.max(0, Number(p.stock) || 0); }, 0);
      resumen.textContent = lista.length + ' de ' + totalCatalogo + ' productos · ' + bajoStock + ' bajo stock · Valor: ' + fmt(valorTotalCatalogo);
      const kTot = porId('kpiProdTotal'); if (kTot) kTot.textContent = totalCatalogo + (totalCatalogo === 1 ? ' producto' : ' productos');
      const kVal = porId('kpiProdValor'); if (kVal) kVal.textContent = fmt(valorTotalCatalogo);
      const kBaj = porId('kpiProdBajo'); if (kBaj) kBaj.textContent = bajoStock + ' por agotarse';
      const kAgot = porId('kpiProdAgotados'); if (kAgot) kAgot.textContent = agotados + ' agotados';
      const cTot = porId('kpiCardTotalProd'); if (cTot) cTot.classList.toggle('activo', filtroStockAdminActual === 'todos');
      const cBaj = porId('kpiCardBajoStock'); if (cBaj) cBaj.classList.toggle('activo', filtroStockAdminActual === 'bajo');
      const cAgot = porId('kpiCardAgotados'); if (cAgot) cAgot.classList.toggle('activo', filtroStockAdminActual === 'agotados');
    }
    const sinProductos = porId('sinProductos');
    if (sinProductos) sinProductos.hidden = lista.length > 0;
    actualizarBadges();
  }

  // ---- Ficha "Nuevo / Editar producto" (coherente con la ficha de cliente) ----
  let productoModalActual = 0; // id del producto en edición (0 = nuevo)

  function mostrarErrorProducto(mensaje) {
    const err = porId('errorProducto');
    if (!err) return;
    if (mensaje) { err.textContent = mensaje; err.hidden = false; }
    else { err.textContent = ''; err.hidden = true; }
  }

  // Vista previa en vivo: iniciales del avatar y valor en inventario (precio × stock)
  function actualizarPreviewProducto() {
    const nombre = ((porId('campoProductoNombre') || {}).value || '').trim();
    const avatar = porId('productoAvatarPreview');
    if (avatar) avatar.textContent = nombre ? productoIniciales(nombre) : '?';
    const precio = Math.max(0, parseFloat((porId('campoProductoPrecio') || {}).value) || 0);
    const stock = Math.max(0, parseInt((porId('campoProductoStock') || {}).value, 10) || 0);
    const valor = porId('productoValorPreview');
    if (valor) valor.textContent = fmt(precio * stock);
    const stockPrev = porId('productoStockPreview');
    if (stockPrev) {
      const est = estadoStock(stock);
      stockPrev.textContent = stock + ' (' + est.etiqueta + ')';
      stockPrev.title = est.etiqueta;
    }
  }

  function prepararFichaProducto(productoEnEdicion) {
    productoModalActual = productoEnEdicion ? productoEnEdicion.id : 0;
    const sub = porId('productoModalSub');
    if (sub) sub.textContent = productoEnEdicion ? 'Editando datos de ' + productoEnEdicion.nombre : 'Agrega un producto al inventario';
    mostrarErrorProducto('');
    actualizarPreviewProducto();
  }

  const btnNuevoProducto = porId('btnNuevoProducto');
  if (btnNuevoProducto) {
    btnNuevoProducto.addEventListener('click', function() {
      const mt = porId('modalTituloProducto');
      if (mt) mt.textContent = 'Nuevo producto';
      if (formProducto) formProducto.reset();
      const pi = porId('productoId');
      if (pi) pi.value = '';
      prepararFichaProducto(null);
      if (modalProducto) modalProducto.removeAttribute('hidden');
      const campoNombre = porId('campoProductoNombre');
      if (campoNombre) campoNombre.focus();
    });
  }

  function prepararImportadorProductos() {
    const acciones = document.querySelector('#vista-productos .productos-header .page-header-acciones');
    if (!acciones || porId('btnImportarProductos')) return;
    const botonAbrir = document.createElement('button');
    botonAbrir.type = 'button';
    botonAbrir.id = 'btnImportarProductos';
    botonAbrir.className = 'btn-secundario productos-btn-importar';
    botonAbrir.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v12m0 0 4-4m-4 4-4-4"/><path d="M5 17v3h14v-3"/></svg><span>Importar hoja</span>';
    acciones.insertBefore(botonAbrir, btnNuevoProducto || acciones.firstChild);

    const html = '<div class="modal-overlay" id="modalImportarProductos" hidden>' +
      '<section class="modal modal-importar-productos" role="dialog" aria-modal="true" aria-labelledby="tituloImportarProductos">' +
        '<header class="modal-doc-cabecera">' +
          '<div><h3 id="tituloImportarProductos">Importar productos</h3><p class="modal-doc-sub">Carga el catálogo desde Excel o CSV y asigna cada columna antes de confirmar.</p></div>' +
          '<button type="button" class="modal-doc-cerrar" id="btnCerrarImportarProductos" aria-label="Cerrar">&times;</button>' +
        '</header>' +
        '<div class="modal-importar-cuerpo">' +
          '<section class="importar-archivo-panel"><div class="importar-archivo-icono" aria-hidden="true">XLS</div><div class="importar-archivo-datos"><strong id="importarArchivoNombre">Selecciona una hoja de cálculo</strong><small id="importarArchivoAyuda">Formatos admitidos: .xlsx y .csv · Máximo 20 MB</small></div><button type="button" class="btn-secundario" id="btnElegirArchivoProductos">Elegir archivo</button></section>' +
          '<p class="importar-estado" id="importarProductosEstado" role="status" aria-live="polite">La primera fila de la hoja se utilizará como encabezado.</p>' +
          '<section id="importarProductosConfiguracion" hidden>' +
            '<div class="importar-seccion-titulo"><div><h4>Asignar columnas</h4><p id="importarHojaNombre"></p></div><span class="importar-hoja-etiqueta">Mapeo de datos</span></div>' +
            '<div class="importar-mapeo" id="importarProductosMapeo"></div>' +
            '<div class="importar-resumen" id="importarProductosResumen"></div>' +
            '<div class="importar-preview-wrap"><table class="importar-preview"><thead><tr><th>Fila</th><th>Producto</th><th>Precio</th><th>Stock</th><th>Categoría</th><th>Validación</th></tr></thead><tbody id="importarProductosPreview"></tbody></table></div>' +
          '</section>' +
        '</div>' +
        '<footer class="modal-doc-pie"><span class="modal-doc-nota">Los códigos internos se asignan automáticamente al importar.</span><button type="button" class="btn-secundario" id="btnCancelarImportarProductos">Cancelar</button><button type="button" class="btn-primary" id="btnConfirmarImportarProductos" disabled>Importar productos</button></footer>' +
      '</section></div>';
    document.body.insertAdjacentHTML('beforeend', html);

    const modal = porId('modalImportarProductos');
    const campos = [
      { id: 'nombre', label: 'Nombre del producto', required: true, aliases: ['nombre', 'producto', 'articulo', 'descripcion', 'name', 'product'] },
      { id: 'precio', label: 'Precio de venta', required: true, aliases: ['precio', 'precio venta', 'precio de venta', 'pvp', 'price'] },
      { id: 'stock', label: 'Existencias iniciales', required: false, aliases: ['stock', 'existencia', 'existencias', 'cantidad', 'inventario', 'qty'] },
      { id: 'categoria', label: 'Categoría', required: false, aliases: ['categoria', 'category', 'familia', 'departamento'] },
      { id: 'codigoBarras', label: 'Código de barras', required: false, aliases: ['codigo de barras', 'codigobarras', 'ean', 'upc', 'barcode'] }
    ];
    let hojaActual = null;
    let importando = false;

    function normalizarEncabezado(valor) {
      return String(valor || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    }

    function prepararMapeo() {
      const contenedor = porId('importarProductosMapeo');
      if (!contenedor || !hojaActual) return;
      const opciones = hojaActual.encabezados.map(function(encabezado, indice) {
        const nombre = encabezado || ('Columna ' + (indice + 1));
        return '<option value="' + indice + '">' + esc(nombre) + '</option>';
      }).join('');
      contenedor.innerHTML = campos.map(function(campo) {
        const indice = hojaActual.encabezados.findIndex(function(encabezado) {
          return campo.aliases.indexOf(normalizarEncabezado(encabezado)) !== -1;
        });
        return '<label class="importar-mapeo-campo"><span>' + esc(campo.label) + (campo.required ? ' <b>*</b>' : '') + '</span><select data-importar-campo="' + campo.id + '">' +
          '<option value="">— ' + (campo.required ? 'Selecciona columna' : 'No importar') + ' —</option>' + opciones +
        '</select></label>';
      }).join('');
      campos.forEach(function(campo) {
        const select = contenedor.querySelector('[data-importar-campo="' + campo.id + '"]');
        const indice = hojaActual.encabezados.findIndex(function(encabezado) {
          return campo.aliases.indexOf(normalizarEncabezado(encabezado)) !== -1;
        });
        if (select && indice >= 0) select.value = String(indice);
      });
      renderizarPreviaImportacion();
    }

    function textoColumna(fila, campo) {
      const select = document.querySelector('[data-importar-campo="' + campo + '"]');
      if (!select || select.value === '') return '';
      const valor = fila.valores[Number(select.value)];
      return valor == null ? '' : String(valor).trim();
    }

    function numeroImportado(valor) {
      if (typeof valor === 'number') return Number.isFinite(valor) ? valor : NaN;
      let limpio = String(valor || '').replace(/[\s\u00a0]/g, '').replace(/[^\d,.-]/g, '');
      if (!limpio) return NaN;
      const coma = limpio.lastIndexOf(',');
      const punto = limpio.lastIndexOf('.');
      if (coma >= 0 && punto >= 0) {
        limpio = coma > punto ? limpio.replace(/\./g, '').replace(',', '.') : limpio.replace(/,/g, '');
      } else if (coma >= 0) {
        const decimales = limpio.length - coma - 1;
        limpio = decimales > 0 && decimales <= 2 ? limpio.replace(',', '.') : limpio.replace(/,/g, '');
      }
      return Number(limpio);
    }

    function convertirFilaImportacion(fila) {
      const nombre = textoColumna(fila, 'nombre');
      const precio = numeroImportado(textoColumna(fila, 'precio'));
      const stockTexto = textoColumna(fila, 'stock');
      const stock = stockTexto === '' ? 0 : numeroImportado(stockTexto);
      const categoria = textoColumna(fila, 'categoria') || 'General';
      const codigoBarras = textoColumna(fila, 'codigoBarras');
      const errores = [];
      if (!nombre || nombre.length < 2) errores.push('Nombre obligatorio (mínimo 2 caracteres).');
      if (!Number.isFinite(precio) || precio <= 0) errores.push('El precio debe ser mayor a cero.');
      if (!Number.isInteger(stock) || stock < 0) errores.push('El stock debe ser entero y no negativo.');
      if (codigoBarras && (codigoBarras.length < 4 || /\s/.test(codigoBarras))) errores.push('Código de barras inválido.');
      return {
        datos: { nombre: nombre, precio: precio, stock: stock, categoria: categoria, codigoBarras: codigoBarras, filaOrigen: fila.numero },
        errores: errores
      };
    }

    function renderizarPreviaImportacion() {
      const cuerpo = porId('importarProductosPreview');
      const resumen = porId('importarProductosResumen');
      const boton = porId('btnConfirmarImportarProductos');
      const estado = porId('importarProductosEstado');
      if (!hojaActual || !cuerpo || !resumen || !boton) return;
      const filas = hojaActual.filas.filter(function(fila) {
        return fila.valores.some(function(valor) { return String(valor == null ? '' : valor).trim() !== ''; });
      });
      const preparadas = filas.map(function(fila) {
        return { fila: fila, resultado: convertirFilaImportacion(fila) };
      });
      const columnasAsignadas = campos.map(function(campo) {
        const select = document.querySelector('[data-importar-campo="' + campo.id + '"]');
        return select && select.value !== '' ? select.value : null;
      }).filter(function(indice) { return indice !== null; });
      const mapeoDuplicado = new Set(columnasAsignadas).size !== columnasAsignadas.length;
      const codigos = new Set();
      preparadas.forEach(function(item) {
        const codigo = item.resultado.datos.codigoBarras.replace(/[\s-]/g, '').toLocaleUpperCase();
        if (!codigo) return;
        const existente = productos.some(function(p) {
          return String(p.codigoBarras || '').replace(/[\s-]/g, '').toLocaleUpperCase() === codigo;
        });
        if (existente || codigos.has(codigo)) {
          item.resultado.errores.push('Código de barras duplicado.');
          return;
        }
        codigos.add(codigo);
      });
      const erroresFinales = preparadas.filter(function(item) { return item.resultado.errores.length > 0; }).length;
      const listos = preparadas.length - erroresFinales;
      resumen.innerHTML =
        '<span class="importar-resumen-total"><strong>' + preparadas.length + '</strong> filas con datos</span>' +
        '<span class="importar-resumen-validos"><strong>' + listos + '</strong> listas para importar</span>' +
        (erroresFinales ? '<span class="importar-resumen-errores"><strong>' + erroresFinales + '</strong> por corregir</span>' : '');
      cuerpo.innerHTML = preparadas.slice(0, 12).map(function(item) {
        const errores = item.resultado.errores;
        return '<tr class="' + (errores.length ? 'fila-importar-error' : '') + '">' +
          '<td>' + item.fila.numero + '</td><td>' + esc(item.resultado.datos.nombre || '—') + '</td>' +
          '<td class="num">' + (Number.isFinite(item.resultado.datos.precio) ? esc(item.resultado.datos.precio.toFixed(2)) : '—') + '</td>' +
          '<td class="num">' + (Number.isFinite(item.resultado.datos.stock) ? esc(String(item.resultado.datos.stock)) : '—') + '</td>' +
          '<td>' + esc(item.resultado.datos.categoria || 'General') + '</td>' +
          '<td>' + (errores.length ? '<span class="importar-validacion error" title="' + esc(errores.join(' ')) + '">Revisar: ' + esc(errores[0]) + '</span>' : '<span class="importar-validacion ok">Lista</span>') + '</td></tr>';
      }).join('') || '<tr><td colspan="6" class="importar-sin-filas">No hay filas con datos para previsualizar.</td></tr>';
      if (preparadas.length > 12) {
        cuerpo.insertAdjacentHTML('beforeend', '<tr><td colspan="6" class="importar-mas-filas">Vista previa de 12 de ' + preparadas.length + ' filas.</td></tr>');
      }
      if (estado) {
        estado.className = 'importar-estado' + (erroresFinales ? ' error' : ' ok');
        estado.textContent = mapeoDuplicado
          ? 'Una misma columna está asignada a más de un dato. Ajusta el mapeo antes de importar.'
          : erroresFinales
          ? 'Corrige el mapeo o los datos señalados en la hoja. No se importará parcialmente.'
          : (preparadas.length ? 'Columnas listas. Revisa la vista previa y confirma la importación.' : 'La hoja no contiene filas con datos.');
      }
      boton.disabled = importando || listos === 0 || erroresFinales > 0 || mapeoDuplicado;
      boton.textContent = erroresFinales ? 'Corrige los datos para importar' : 'Importar ' + listos + (listos === 1 ? ' producto' : ' productos');
      boton.dataset.total = String(listos);
      boton.dataset.invalidas = String(erroresFinales);
      boton.dataset.filas = String(preparadas.length);
    }

    function cerrarImportador() {
      if (importando) return;
      if (modal) modal.hidden = true;
      botonAbrir.focus();
    }

    botonAbrir.addEventListener('click', function() {
      hojaActual = null;
      porId('importarProductosConfiguracion').hidden = true;
      porId('importarArchivoNombre').textContent = 'Selecciona una hoja de cálculo';
      porId('importarArchivoAyuda').textContent = 'Formatos admitidos: .xlsx y .csv · Máximo 20 MB';
      porId('importarProductosEstado').className = 'importar-estado';
      porId('importarProductosEstado').textContent = 'La primera fila de la hoja se utilizará como encabezado.';
      porId('btnConfirmarImportarProductos').disabled = true;
      porId('btnConfirmarImportarProductos').textContent = 'Importar productos';
      modal.hidden = false;
      porId('btnElegirArchivoProductos').focus();
    });
    porId('btnElegirArchivoProductos').addEventListener('click', async function() {
      const elegir = porId('btnElegirArchivoProductos');
      if (!api || typeof api.seleccionarHojaProductos !== 'function') {
        porId('importarProductosEstado').className = 'importar-estado error';
        porId('importarProductosEstado').textContent = 'La función de selección de archivos no está disponible.';
        return;
      }
      elegir.disabled = true;
      porId('importarProductosEstado').className = 'importar-estado';
      porId('importarProductosEstado').textContent = 'Leyendo hoja de cálculo…';
      try {
        const resultado = await api.seleccionarHojaProductos();
        if (resultado.cancelado) {
          porId('importarProductosEstado').textContent = 'No se seleccionó ningún archivo.';
          return;
        }
        if (!Array.isArray(resultado.encabezados) || !Array.isArray(resultado.filas)) {
          throw new Error('El archivo no devolvió encabezados y filas válidas.');
        }
        hojaActual = resultado;
        porId('importarArchivoNombre').textContent = 'Archivo cargado correctamente';
        porId('importarArchivoAyuda').textContent = 'Hoja: ' + (resultado.hoja || 'Hoja 1') + ' · ' + resultado.filas.length + ' filas leídas';
        porId('importarHojaNombre').textContent = 'Hoja: ' + (resultado.hoja || 'Hoja 1') + ' · Selecciona qué columna corresponde a cada dato.';
        porId('importarProductosConfiguracion').hidden = false;
        prepararMapeo();
      } catch (error) {
        hojaActual = null;
        porId('importarProductosConfiguracion').hidden = true;
        porId('importarProductosEstado').className = 'importar-estado error';
        porId('importarProductosEstado').textContent = 'No se pudo leer el archivo. ' + (error && error.message ? error.message : 'Comprueba que sea un .xlsx o .csv válido.');
      } finally {
        elegir.disabled = false;
      }
    });
    porId('importarProductosMapeo').addEventListener('change', renderizarPreviaImportacion);
    porId('btnCerrarImportarProductos').addEventListener('click', cerrarImportador);
    porId('btnCancelarImportarProductos').addEventListener('click', cerrarImportador);
    porId('btnConfirmarImportarProductos').addEventListener('click', async function() {
      const boton = porId('btnConfirmarImportarProductos');
      if (!hojaActual || importando || boton.disabled) return;
      const preparadas = hojaActual.filas.filter(function(fila) {
        return fila.valores.some(function(valor) { return String(valor == null ? '' : valor).trim() !== ''; });
      }).map(convertirFilaImportacion);
      if (preparadas.some(function(item) { return item.errores.length > 0; })) {
        renderizarPreviaImportacion();
        return;
      }
      importando = true;
      boton.disabled = true;
      boton.textContent = 'Importando…';
      porId('btnElegirArchivoProductos').disabled = true;
      try {
        const resultado = await api.importarProductos(preparadas.map(function(item) { return item.datos; }));
        const lista = await api.listarProductos();
        productos.splice(0, productos.length);
        lista.forEach(function(p) {
          productos.push({ id: Number(p.id), codigo: p.codigo || ('PRD-' + String(p.id).padStart(5, '0')), codigoBarras: (p.codigoBarras || p.codigo_barras || '').trim(), nombre: p.nombre, precio: Number(p.precio), stock: Number(p.stock), categoria: p.categoria || '' });
        });
        renderTablaProductos();
        renderGridProductosVentas();
        await cargarResumen();
        modal.hidden = true;
        await window.posAviso({ tipo: 'exito', titulo: 'Importación completada', mensaje: 'Se importaron ' + resultado.importados + (resultado.importados === 1 ? ' producto.' : ' productos.') });
      } catch (error) {
        const estado = porId('importarProductosEstado');
        estado.className = 'importar-estado error';
        estado.textContent = 'No se importó ningún producto. ' + (error && error.message ? error.message.replace(/^Error invocado en el canal IPC[^:]*:\s*/, '').trim() : 'Revisa la fila indicada y vuelve a intentarlo.');
      } finally {
        importando = false;
        porId('btnElegirArchivoProductos').disabled = false;
        if (!modal.hidden) renderizarPreviaImportacion();
      }
    });
    document.addEventListener('keydown', function(evento) {
      if (evento.key === 'Escape' && modal && !modal.hidden) cerrarImportador();
    });
  }
  prepararImportadorProductos();

  const btnVistaAdmin = porId('btnCambiarVistaProductosAdmin');
  if (btnVistaAdmin) {
    btnVistaAdmin.addEventListener('click', window.cambiarVistaProductosAdmin);
  }
  const cardKpiTotal = porId('kpiCardTotalProd');
  if (cardKpiTotal) {
    cardKpiTotal.addEventListener('click', function() {
      filtroStockAdminActual = 'todos';
      renderTablaProductos();
    });
  }
  const cardKpiBajo = porId('kpiCardBajoStock');
  if (cardKpiBajo) {
    cardKpiBajo.addEventListener('click', function() {
      filtroStockAdminActual = (filtroStockAdminActual === 'bajo') ? 'todos' : 'bajo';
      renderTablaProductos();
    });
  }
  const cardKpiAgotados = porId('kpiCardAgotados');
  if (cardKpiAgotados) {
    cardKpiAgotados.addEventListener('click', function() {
      filtroStockAdminActual = (filtroStockAdminActual === 'agotados') ? 'todos' : 'agotados';
      renderTablaProductos();
    });
  }
  const btnCancelarProducto = porId('btnCancelarProducto');
  if (btnCancelarProducto) {
    btnCancelarProducto.addEventListener('click', function() {
      if (modalProducto) modalProducto.setAttribute('hidden', 'true');
    });
  }
  // Cierre con Esc o clic fuera, igual que la ficha de cliente
  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape' && modalProducto && !modalProducto.hasAttribute('hidden')) {
      modalProducto.setAttribute('hidden', 'true');
    }
  });
  if (modalProducto) {
    modalProducto.addEventListener('mousedown', function(e) {
      if (e.target === modalProducto) modalProducto.setAttribute('hidden', 'true');
    });
  }
  ['campoProductoNombre', 'campoProductoPrecio', 'campoProductoStock'].forEach(function(pid) {
    const el = porId(pid);
    if (el) el.addEventListener('input', function() { actualizarPreviewProducto(); });
  });

  // Ficha de producto: leer el código con el escáner sin tener que hacer clic
  // en el campo. El botón pone el foco; el Enter del lector solo rellena.
  const campoCodigoBarras = porId('campoProductoCodigoBarras');
  const btnLeerCodigoBarras = porId('btnLeerCodigoBarras');
  if (btnLeerCodigoBarras && campoCodigoBarras) {
    btnLeerCodigoBarras.addEventListener('click', function () {
      campoCodigoBarras.focus();
      campoCodigoBarras.select();
    });
  }
  if (campoCodigoBarras) {
    // Enter tras leer: si el código pertenece a otro producto se avisa aquí
    // mismo, sin esperar al guardado.
    campoCodigoBarras.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      const dueno = productos.find(function (x) {
        return limpiarCodigo(x.codigoBarras || '') === limpiarCodigo(campoCodigoBarras.value) &&
          x.id !== productoModalActual;
      });
      if (dueno) {
        mostrarErrorProducto('Ese código ya lo usa "' + dueno.nombre + '".');
        campoCodigoBarras.focus();
      } else if (campoCodigoBarras.value.trim()) {
        // No se guarda solo: el cajero revisa nombre, precio y stock y luego
        // confirma. Enter solo confirma que el código se leyó completo.
        window.escaner.pitar('ok');
        mostrarErrorProducto('');
        campoCodigoBarras.select();
      }
    });
  }

  window.editarProducto = function(id) {
    const p = productos.find(function(x) { return x.id === Number(id); });
    if (!p) return;
    const mt = porId('modalTituloProducto');
    if (mt) mt.textContent = 'Editar producto';
    const mapa = { campoProductoNombre: p.nombre, campoProductoPrecio: p.precio, campoProductoStock: p.stock, campoProductoCategoria: p.categoria, campoProductoCodigoBarras: p.codigoBarras || '' };
    Object.keys(mapa).forEach(function(pid) { const el = porId(pid); if (el) el.value = mapa[pid]; });
    // CRÍTICO: registrar el id en el campo oculto; sin esto el submit cree que es alta y crea un producto nuevo en vez de editar.
    const pi = porId('productoId');
    if (pi) pi.value = String(p.id);
    prepararFichaProducto(p);
    if (modalProducto) modalProducto.removeAttribute('hidden');
    const campoNombre = porId('campoProductoNombre');
    if (campoNombre) campoNombre.focus();
  };

  window.eliminarProducto = async function(id) {
    const producto = productos.find(function(x) { return x.id === Number(id); }) || null;
    const confirmado = await window.posConfirmar({
      tipo: 'peligro',
      titulo: 'Eliminar producto',
      mensaje: 'El producto saldrá del catálogo y del inventario. Esta acción no se puede deshacer.',
      detalle: producto ? producto.nombre + ((producto.categoria || '').trim() ? ' · ' + producto.categoria.trim() : '') : '',
      aceptar: 'Sí, eliminar'
    });
    if (!confirmado) return;
    let eliminadoDb = false;
    if (api) {
      try {
        await api.eliminarProducto(Number(id));
        eliminadoDb = true;
      } catch (err) {
        const mensaje = err && err.message ? err.message : 'Error al eliminar del inventario';
        await window.posAviso({
          tipo: 'peligro',
          titulo: 'No se pudo eliminar el producto',
          mensaje: 'El producto no se pudo borrar de la base de datos.',
          detalle: 'Causa: ' + mensaje + '. Verifica si el producto tiene ventas registradas asociadas.'
        });
        return;
      }
    }
    // Solo eliminar del array local si la DB confirmó la eliminación
    const idx = productos.findIndex(function(p) { return p.id === Number(id); });
    if (idx !== -1) productos.splice(idx, 1);
    renderTablaProductos();
    renderGridProductosVentas();
    cargarResumen();
  };

  if (formProducto) {
    formProducto.addEventListener('submit', async function(e) {
      e.preventDefault();
      const nombre = (porId('campoProductoNombre') || {}).value ? porId('campoProductoNombre').value.trim() : '';
      // Validaciones alineadas con src/productos/productos.ts (validarDatosProducto)
      if (nombre.length < 2) {
        mostrarErrorProducto('El nombre del producto debe tener al menos 2 caracteres.');
        const n = porId('campoProductoNombre'); if (n) n.focus();
        return;
      }
      const precio = parseFloat((porId('campoProductoPrecio') || {}).value) || 0;
      const stock = parseInt((porId('campoProductoStock') || {}).value, 10) || 0;
      const categoria = (porId('campoProductoCategoria') || {}).value ? porId('campoProductoCategoria').value.trim() : '';
      if (precio <= 0) {
        mostrarErrorProducto('El precio debe ser mayor a cero.');
        const pr = porId('campoProductoPrecio'); if (pr) pr.focus();
        return;
      }
      if (stock < 0) {
        mostrarErrorProducto('El stock no puede ser negativo.');
        const st = porId('campoProductoStock'); if (st) st.focus();
        return;
      }
      if (!categoria) {
        mostrarErrorProducto('La categoría es obligatoria.');
        const cat = porId('campoProductoCategoria'); if (cat) cat.focus();
        return;
      }
      mostrarErrorProducto('');
      // El código de barras es opcional, pero si viene debe tener sentido.
      const codigoBarras = ((porId('campoProductoCodigoBarras') || {}).value || '').trim();
      if (codigoBarras && codigoBarras.length < 4) {
        mostrarErrorProducto('El código de barras debe tener al menos 4 caracteres.');
        const cb = porId('campoProductoCodigoBarras'); if (cb) cb.focus();
        return;
      }
      if (/\s/.test(codigoBarras)) {
        mostrarErrorProducto('El código de barras no puede contener espacios.');
        const cb = porId('campoProductoCodigoBarras'); if (cb) cb.focus();
        return;
      }
      const pi = porId('productoId');
      // El id del modal en edición (productoModalActual) respalda al campo oculto por si el DOM se redibujó.
      const id = parseInt(pi ? pi.value : '0', 10) || productoModalActual || 0;
      let guardado = false;
      if (api) {
        try {
          if (id > 0) {
            await api.editarProducto(id, { nombre: nombre, precio: precio, stock: stock, categoria: categoria, codigoBarras: codigoBarras });
            const p = productos.find(function(x) { return x.id === id; });
            if (p) { p.nombre = nombre; p.precio = precio; p.stock = stock; p.categoria = categoria; p.codigoBarras = codigoBarras; }
            guardado = true;
          } else {
            const res = await api.crearProducto({ nombre: nombre, precio: precio, stock: stock, categoria: categoria, codigoBarras: codigoBarras });
            const nuevoId = res && res.lastInsertRowid != null ? Number(res.lastInsertRowid) : proximoIdProductoLocal();
            productos.push({ id: nuevoId, codigo: (res && res.codigo) || ('PRD-' + String(nuevoId).padStart(5, '0')), codigoBarras: codigoBarras, nombre: nombre, precio: precio, stock: stock, categoria: categoria });
            guardado = true;
          }
        } catch (err) {
          // El proceso principal rechaza códigos repetidos: el mensaje llega
          // desde productos.ts y ya explica cuál producto los usa.
          const mensaje = err && err.message ? err.message : '';
          if (mensaje) mostrarErrorProducto(mensaje.replace(/^Error invocado en el canal IPC[^:]*:\s*/, '').trim());
          else console.warn('productos:guardar', err);
          return;
        }
      }
      if (!guardado) {
        if (id > 0) {
          const p = productos.find(function(x) { return x.id === id; });
          if (p) { p.nombre = nombre; p.precio = precio; p.stock = stock; p.categoria = categoria; p.codigoBarras = codigoBarras; }
        } else {
          const nuevoIdLocal = proximoIdProductoLocal();
          productos.push({ id: nuevoIdLocal, codigo: 'PRD-' + String(nuevoIdLocal).padStart(5, '0'), codigoBarras: codigoBarras, nombre: nombre, precio: precio, stock: stock, categoria: categoria });
        }
      }
      renderTablaProductos();
      renderGridProductosVentas();
      cargarResumen();
      if (modalProducto) modalProducto.setAttribute('hidden', 'true');
      formProducto.reset();
      if (pi) pi.value = '';
      prepararFichaProducto(null);
    });
  }

  function proximoIdProductoLocal() {
    return productos.length > 0 ? Math.max.apply(null, productos.map(function(p) { return p.id; })) + 1 : 1;
  }

  // ===== 5. MÓDULO DE VENTAS =====
  function actualizarSelectClientes() {
    const sel = porId('selectClienteVenta');
    if (!sel) return;
    const prev = sel.value;
    sel.innerHTML = '<option value="">Cliente de mostrador (contado)</option>' +
      clientes.map(function(c) { return '<option value="' + c.id + '">' + esc(etiquetaCliente(c)) + '</option>'; }).join('');
    if (prev && sel.querySelector('option[value="' + prev + '"]')) sel.value = prev;
    actualizarBotonSelectorCliente();
  }

  function clienteSeleccionadoParaVenta() {
    const sel = porId('selectClienteVenta');
    if (!sel || !sel.value) return null;
    return clientes.find(function(c) { return c.id === Number(sel.value); }) || null;
  }

  function actualizarBotonSelectorCliente() {
    const boton = porId('btnAbrirSelectorClienteVenta');
    if (!boton) return;
    const cliente = clienteSeleccionadoParaVenta();
    const texto = boton.querySelector('.pos-cliente-buscar-texto');
    if (texto) texto.textContent = cliente ? (cliente.nombre || 'Cliente sin nombre') : 'Buscar cliente';
    boton.classList.toggle('seleccionado', !!cliente);
    boton.setAttribute('aria-label', cliente
      ? 'Cambiar cliente de la venta. Cliente actual: ' + (cliente.nombre || 'Cliente sin nombre')
      : 'Buscar cliente para esta venta');
  }

  function renderListaClientesVenta() {
    const lista = porId('listaClientesVentaModal');
    const campo = porId('buscadorClientesVentaModal');
    if (!lista) return;
    const consulta = String(campo ? campo.value : '').trim().toLocaleLowerCase();
    const seleccion = clienteSeleccionadoParaVenta();
    const visibles = clientes.filter(function(cliente) {
      const texto = [cliente.nombre, cliente.telefono].join(' ').toLocaleLowerCase();
      return !consulta || texto.indexOf(consulta) !== -1;
    }).sort(function(a, b) {
      return String(a.nombre || '').localeCompare(String(b.nombre || ''), 'es', { sensitivity: 'base' });
    });
    const total = porId('totalClientesVentaModal');
    if (total) total.textContent = visibles.length + (visibles.length === 1 ? ' cliente' : ' clientes');
    if (!visibles.length) {
      lista.innerHTML = '<p class="pos-clientes-vacio">No hay clientes que coincidan con la búsqueda.</p>';
      return;
    }
    lista.innerHTML = visibles.map(function(cliente) {
      const activo = seleccion && seleccion.id === cliente.id;
      const saldo = Math.max(0, Number(cliente.saldo) || 0);
      return '<button type="button" class="pos-cliente-opcion' + (activo ? ' activo' : '') + '" data-cliente-id="' + cliente.id + '"' +
        (activo ? ' aria-current="true"' : '') + '>' +
        '<span class="pos-cliente-opcion-datos">' +
          '<strong>' + esc(cliente.nombre || 'Cliente sin nombre') + '</strong>' +
          (cliente.telefono ? '<small>' + esc(cliente.telefono) + '</small>' : '') +
        '</span>' +
        '<span class="pos-cliente-opcion-saldo"><small>Saldo actual</small><strong>' + fmt(saldo) + '</strong></span>' +
        (activo ? '<span class="pos-cliente-opcion-check" aria-label="Cliente seleccionado">✓</span>' : '') +
      '</button>';
    }).join('');
  }

  function abrirSelectorClienteVenta() {
    const modal = porId('modalSelectorClienteVenta');
    const campo = porId('buscadorClientesVentaModal');
    if (!modal) return;
    if (campo) campo.value = '';
    renderListaClientesVenta();
    modal.hidden = false;
    if (campo) campo.focus();
  }

  function cerrarSelectorClienteVenta() {
    const modal = porId('modalSelectorClienteVenta');
    if (modal) modal.hidden = true;
    const boton = porId('btnAbrirSelectorClienteVenta');
    if (boton) boton.focus();
  }

  function seleccionarClienteVenta(clienteId) {
    const select = porId('selectClienteVenta');
    if (!select) return;
    select.value = clienteId ? String(clienteId) : '';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    actualizarBotonSelectorCliente();
    cerrarSelectorClienteVenta();
  }

  function prepararSelectorClienteVenta() {
    const select = porId('selectClienteVenta');
    if (!select || porId('modalSelectorClienteVenta')) return;
    const contenedor = document.createElement('div');
    contenedor.className = 'pos-cliente-selector';
    select.parentNode.insertBefore(contenedor, select);
    contenedor.appendChild(select);
    const boton = document.createElement('button');
    boton.type = 'button';
    boton.id = 'btnAbrirSelectorClienteVenta';
    boton.className = 'pos-cliente-buscar';
    boton.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg><span class="pos-cliente-buscar-texto">Buscar cliente</span><kbd>F2</kbd>';
    boton.addEventListener('click', abrirSelectorClienteVenta);
    contenedor.appendChild(boton);

    const html = '<div class="modal-overlay" id="modalSelectorClienteVenta" hidden>' +
      '<section class="modal modal-selector-cliente-venta" role="dialog" aria-modal="true" aria-labelledby="tituloSelectorClienteVenta">' +
        '<header class="comun-cabecera">' +
          '<span class="comun-icono" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg></span>' +
          '<div class="comun-cabecera-textos"><h3 id="tituloSelectorClienteVenta">Seleccionar cliente</h3><p>Asigna el cliente a esta venta · Atajo <kbd>F2</kbd></p></div>' +
          '<button type="button" class="modal-doc-cerrar pos-cliente-cerrar" id="btnCerrarSelectorClienteVenta" aria-label="Cerrar">&times;</button>' +
        '</header>' +
        '<div class="pos-selector-cliente-cuerpo">' +
          '<label class="pos-cliente-buscador-modal"><span>Buscar por nombre o teléfono</span><input type="search" id="buscadorClientesVentaModal" autocomplete="off" placeholder="Ej.: María López"></label>' +
          '<div class="pos-cliente-acciones-modal"><span class="pos-cliente-total" id="totalClientesVentaModal"></span><button type="button" class="btn-secundario" id="btnClienteMostradorVenta">Cliente de mostrador</button></div>' +
          '<div class="pos-clientes-lista" id="listaClientesVentaModal" role="listbox" aria-label="Clientes disponibles"></div>' +
        '</div>' +
      '</section></div>';
    document.body.insertAdjacentHTML('beforeend', html);

    porId('btnCerrarSelectorClienteVenta').addEventListener('click', cerrarSelectorClienteVenta);
    porId('btnClienteMostradorVenta').addEventListener('click', function() { seleccionarClienteVenta(''); });
    porId('buscadorClientesVentaModal').addEventListener('input', renderListaClientesVenta);
    porId('listaClientesVentaModal').addEventListener('click', function(evento) {
      const opcion = evento.target.closest('[data-cliente-id]');
      if (opcion) seleccionarClienteVenta(opcion.getAttribute('data-cliente-id'));
    });
    const modal = porId('modalSelectorClienteVenta');
    modal.addEventListener('mousedown', function(evento) {
      if (evento.target === modal) cerrarSelectorClienteVenta();
    });
    document.addEventListener('keydown', function(evento) {
      if (evento.key === 'Escape' && !modal.hidden) {
        evento.preventDefault();
        cerrarSelectorClienteVenta();
      }
    });
    actualizarBotonSelectorCliente();
  }

  function renderChips() {
    const chips = porId('chipsCategorias');
    if (!chips) return;
    const cats = ['Todos'];
    productos.forEach(function(p) {
      const cat = (p.categoria || '').trim();
      if (cat && cats.indexOf(cat) === -1) cats.push(cat);
    });
    if (cats.indexOf(categoriaActual) === -1) categoriaActual = 'Todos';
    chips.innerHTML = cats.map(function(cat) {
      return '<button type="button" class="pos-chip' + (cat === categoriaActual ? ' activo' : '') + '" data-cat="' + esc(cat) + '">' + esc(cat) + '</button>';
    }).join('');
    chips.querySelectorAll('.pos-chip').forEach(function(chip) {
      chip.addEventListener('click', function() {
        categoriaActual = chip.getAttribute('data-cat');
        renderGridProductosVentas();
      });
    });
  }

  window.configurarClicksTablaProductos = function() {
    const body = porId('tablaProductosBody');
    if (!body) return;
    body.querySelectorAll('.producto-tabla-boton').forEach(function(btn) {
      btn.addEventListener('click', function() {
        const pid = parseInt(btn.getAttribute('data-id'), 10);
        const p = productos.find(function(x) { return x.id === pid; });
        if (p) agregarAlCarrito(pid, 1);
      });
    });
  };

  window.cambiarVistaProductos = function() {
    const grid = porId('gridProductos');
    const wrap = porId('tableProductosWrap');
    const body = porId('tablaProductosBody');
    if (!grid || !wrap || !body) return;
    const esFilas = grid.classList.toggle('vista-filas');
    wrap.hidden = !esFilas;
    if (esFilas) {
      sincronizarTablaFilas();
    } else {
      body.innerHTML = '';
    }
    const lbl = porId('lblVistaProductos');
    const icono = porId('btnCambiarVistaProductos')?.querySelector('.pos-vista-boton-icono');
    if (lbl) lbl.textContent = esFilas ? 'Fichas' : 'Filas';
    if (icono) icono.textContent = esFilas ? '⊞' : '⊟';
  };

  // Filtro compartido por la vista de fichas y la vista de filas (una sola fuente de verdad)
  function productosVisiblesVenta() {
    const buscador = porId('buscadorVenta');
    const q = (buscador ? buscador.value : '').trim().toLowerCase();
    return productos.filter(function(p) {
      const okCat = categoriaActual === 'Todos' || (p.categoria || '').trim() === categoriaActual;
      const okQ = !q ||
        p.nombre.toLowerCase().indexOf(q) !== -1 ||
        codigoProductoVisible(p).toLowerCase().indexOf(q) !== -1 ||
        (p.categoria || '').toLowerCase().indexOf(q) !== -1 ||
        (p.codigoBarras || '').toLowerCase().indexOf(q) !== -1;
      return okCat && okQ;
    });
  }

  function cantidadEnCarrito(prodId) {
    return carrito.reduce(function(s, i) { return s + (i.producto.id === prodId ? i.cantidad : 0); }, 0);
  }

  function enVistaFilas() {
    const grid = porId('gridProductos');
    return !!grid && grid.classList.contains('vista-filas');
  }

  // Cuerpo de la tabla de filas: 4 columnas alineadas con el <thead> (Producto, Categoría, Precio, Stock)
  function renderTablaBodyProductos() {
    return productosVisiblesVenta().map(function(p) {
      const stock = Math.max(0, Number(p.stock) || 0);
      const est = estadoStock(stock);
      const badgeClase = est.clase === 'ok' ? 'badge-stock' : (est.clase === 'bajo' ? 'badge-stock stock-bajo-suave' : 'badge-stock stock-agotado');
      const enCarrito = cantidadEnCarrito(p.id);
      return '<tr>' +
        '<td><button type="button" class="producto-tabla-boton" data-id="' + p.id + '"' + (stock <= 0 ? ' disabled' : '') + '>' +
          '<span class="pos-avatar" aria-hidden="true">' + esc(productoIniciales(p.nombre)) + '</span>' +
          '<span class="producto-tabla-datos"><span class="producto-nombre">' + esc(p.nombre) + '</span>' +
            '<small class="producto-codigo">Código: ' + esc(codigoProductoVisible(p)) + '</small></span>' +
          (enCarrito > 0 ? '<span class="pos-en-carrito-fila">+' + enCarrito + ' en carrito</span>' : '') +
        '</button></td>' +
        '<td>' + esc((p.categoria || 'General').trim() || 'General') + '</td>' +
        '<td class="num">' + fmt(p.precio) + '</td>' +
        '<td class="num"><span class="' + badgeClase + '">' + stock + ' uds · ' + est.etiqueta + '</span></td>' +
      '</tr>';
    }).join('');
  }

  // La tabla de filas se redibuja con el mismo filtro y el mismo carrito que las fichas
  function sincronizarTablaFilas() {
    const body = porId('tablaProductosBody');
    if (!body) return;
    body.innerHTML = renderTablaBodyProductos();
    if (typeof window.configurarClicksTablaProductos === 'function') window.configurarClicksTablaProductos();
  }



  function renderGridProductosVentas() {
    renderChips();
    const grid = porId('gridProductos');
    if (!grid) return;
    const lista = productosVisiblesVenta();
    grid.innerHTML = lista.map(function(p) {
      const stock = Math.max(0, Number(p.stock) || 0);
      const enCarrito = cantidadEnCarrito(p.id);
      const est = estadoStock(stock);
      const badgeClase = est.clase === 'ok' ? 'badge-stock' : (est.clase === 'bajo' ? 'badge-stock stock-bajo-suave' : 'badge-stock stock-agotado');
      const agotado = stock <= 0;
      return '<button type="button" class="producto-card' + (agotado ? ' agotado' : '') + '" data-id="' + p.id + '"' + (agotado ? ' disabled' : '') + '>' +
        '<span class="pos-avatar" aria-hidden="true">' + esc(productoIniciales(p.nombre)) + '</span>' +
        '<span class="producto-categoria">' + esc((p.categoria || 'General').trim() || 'General') + '</span>' +
        '<span class="producto-nombre">' + esc(p.nombre) + '</span>' +
        '<span class="producto-codigo">Código: ' + esc(codigoProductoVisible(p)) + '</span>' +
        (p.codigoBarras ? '<span class="producto-codigo-barras">' + esc(p.codigoBarras) + '</span>' : '') +
        '<span class="producto-precio">' + fmt(p.precio) + '</span>' +
        '<span class="' + badgeClase + '">' + stock + ' uds · ' + est.etiqueta + '</span>' +
        (enCarrito > 0 ? '<span class="pos-en-carrito">+' + enCarrito + ' en carrito</span>' : '') +
      '</button>';
    }).join('');
    const vacio = porId('sinProductosVenta');
    if (vacio) vacio.hidden = lista.length > 0;
    // La vista de filas es la MISMA tabla que dibuja sincronizarTablaFilas()
    if (enVistaFilas()) sincronizarTablaFilas();
    grid.querySelectorAll('.producto-card').forEach(function(card) {
      card.addEventListener('click', function() {
        const pid = parseInt(card.getAttribute('data-id'), 10);
        const p = productos.find(function(x) { return x.id === pid; });
        if (p) agregarAlCarrito(pid, 1);
      });
    });
  }

  // Producto común: modal activado con F1 desde la pestaña de ventas
  const modalProductoComun = porId('modalProductoComun');
  const formProductoComun = porId('formProductoComun');
  const btnCancelarComun = porId('btnCancelarComun');
  const campoComunDescripcion = porId('campoComunDescripcion');
  const campoComunPrecio = porId('campoComunPrecio');
  const campoComunCantidad = porId('campoComunCantidad');
  const errorComun = porId('errorComun');

  function mostrarErrorComun(mensaje) {
    if (!errorComun) return;
    if (mensaje) { errorComun.textContent = mensaje; errorComun.hidden = false; }
    else { errorComun.textContent = ''; errorComun.hidden = true; }
  }

  window.abrirModalProductoComun = function() {
    if (!modalProductoComun || !formProductoComun) return;
    formProductoComun.reset();
    mostrarErrorComun('');
    if (campoComunDescripcion) campoComunDescripcion.focus();
    modalProductoComun.removeAttribute('hidden');
  };

  window.cerrarModalProductoComun = function() {
    if (!modalProductoComun) return;
    modalProductoComun.setAttribute('hidden', 'true');
  };

  if (btnCancelarComun) {
    btnCancelarComun.addEventListener('click', window.cerrarModalProductoComun);
  }
  if (modalProductoComun) {
    modalProductoComun.addEventListener('mousedown', function(e) {
      if (e.target === modalProductoComun) window.cerrarModalProductoComun();
    });
    document.addEventListener('keydown', function(e) {
      if (e.key === 'Escape' && modalProductoComun && !modalProductoComun.hasAttribute('hidden')) {
        window.cerrarModalProductoComun();
      }
    });
  }

  // Resumen en vivo: total a cobrar y desglose de la ficha de producto común.
  const comunTotalEl = porId('comunTotal');
  const comunDesgloseEl = porId('comunDesglose');
  const comunMonedaEl = porId('comunMoneda');

  function actualizarResumenComun() {
    if (!comunTotalEl) return;
    const precio = parseFloat(campoComunPrecio ? campoComunPrecio.value : '');
    const cantidad = parseInt(campoComunCantidad ? campoComunCantidad.value : '', 10);
    const unidades = Number.isFinite(cantidad) && cantidad > 0 ? cantidad : 0;
    const unitario = Number.isFinite(precio) && precio > 0 ? precio : 0;
    const total = Math.round(unitario * unidades * 100) / 100;

    comunTotalEl.textContent = fmt(total);
    if (comunDesgloseEl) {
      comunDesgloseEl.textContent =
        unidades + (unidades === 1 ? ' unidad' : ' unidades') + ' · ' + fmt(unitario) + ' c/u';
    }
  }

  // La moneda configurada se refleja en el prefijo del monto.
  if (comunMonedaEl) comunMonedaEl.textContent = moneda;

  if (campoComunPrecio) campoComunPrecio.addEventListener('input', actualizarResumenComun);
  if (campoComunCantidad) campoComunCantidad.addEventListener('input', actualizarResumenComun);

  // Botones de un clic para la cantidad: nunca baja de 1.
  const comunMas = porId('comunMas');
  const comunMenos = porId('comunMenos');
  function ajustarCantidadComun(delta) {
    if (!campoComunCantidad) return;
    const actual = parseInt(campoComunCantidad.value, 10);
    const base = Number.isFinite(actual) ? actual : 0;
    const siguiente = Math.max(1, base + delta);
    campoComunCantidad.value = String(siguiente);
    actualizarResumenComun();
  }
  if (comunMas) comunMas.addEventListener('click', function() { ajustarCantidadComun(1); });
  if (comunMenos) comunMenos.addEventListener('click', function() { ajustarCantidadComun(-1); });

  // Sugerencias rápidas: rellenan la descripción con un clic.
  document.querySelectorAll('#modalProductoComun .comun-chip').forEach(function(chip) {
    chip.addEventListener('click', function() {
      const texto = chip.getAttribute('data-texto') || '';
      if (campoComunDescripcion) {
        campoComunDescripcion.value = texto;
        campoComunDescripcion.focus();
      }
    });
  });

  // Al abrir la ficha se muestran la cantidad mínima y el total en cero.
  const abrirModalProductoComunBase = window.abrirModalProductoComun;
  window.abrirModalProductoComun = function() {
    if (abrirModalProductoComunBase) abrirModalProductoComunBase();
    if (campoComunCantidad && !campoComunCantidad.value) campoComunCantidad.value = '1';
    if (comunMonedaEl) comunMonedaEl.textContent = moneda;
    actualizarResumenComun();
  };

  if (formProductoComun) {
    formProductoComun.addEventListener('submit', async function(e) {
      e.preventDefault();
      mostrarErrorComun('');
      const descripcion = (campoComunDescripcion ? campoComunDescripcion.value : '').trim();
      const precioTexto = campoComunPrecio ? campoComunPrecio.value : '';
      const cantidadTexto = campoComunCantidad ? campoComunCantidad.value : '';
      const precio = parseFloat(precioTexto);
      const cantidad = parseInt(cantidadTexto, 10);

      if (!descripcion) {
        mostrarErrorComun('Ingresa la descripción del producto.');
        if (campoComunDescripcion) campoComunDescripcion.focus();
        return;
      }
      if (!Number.isFinite(precio) || precio <= 0) {
        mostrarErrorComun('Ingresa un precio mayor a 0.');
        if (campoComunPrecio) campoComunPrecio.focus();
        return;
      }
      if (!Number.isFinite(cantidad) || cantidad < 1) {
        mostrarErrorComun('Ingresa una cantidad mayor o igual a 1.');
        if (campoComunCantidad) campoComunCantidad.focus();
        return;
      }

      // Item de producto comun con codigo, descripcion, precio y cantidad
      const itemComun = {
        productoId: 0,
        codigo: 'Comun',
        descripcion: descripcion,
        nombre: descripcion,
        precio: Math.round(precio * 100) / 100
      };

      const enCarrito = carrito.find(function(i) { return i.codigo === 'Comun'; });
      if (enCarrito) {
        enCarrito.cantidad += cantidad;
        enCarrito.descripcion = descripcion;
        enCarrito.precio = Math.round(itemComun.precio * 100) / 100;
        enCarrito.producto = enCarrito.producto || {};
        enCarrito.producto.codigo = 'Comun';
        enCarrito.producto.descripcion = descripcion;
        enCarrito.producto.nombre = descripcion;
        enCarrito.producto.precio = Math.round(itemComun.precio * 100) / 100;
      } else {
        carrito.push({
          producto: { id: 0, codigo: 'Comun', descripcion: descripcion, nombre: descripcion, precio: Math.round(precio * 100) / 100, stock: Infinity },
          cantidad: cantidad,
          codigo: 'Comun',
          descripcion: descripcion,
          precio: Math.round(precio * 100) / 100
        });
      }

      renderCarrito();
      window.cerrarModalProductoComun();
    });
  }

  document.addEventListener('keydown', function(e) {
    const vistaVentas = porId('vista-ventas');
    if (!vistaVentas || vistaVentas.hasAttribute('hidden') || e.repeat) return;
    if (e.key === 'F1' && modalProductoComun) {
      e.preventDefault();
      window.abrirModalProductoComun();
      return;
    }
    if (e.key === 'F2') {
      const modalSelector = porId('modalSelectorClienteVenta');
      const modalComunAbierto = modalProductoComun && !modalProductoComun.hidden;
      const modalPago = porId('modalPago');
      const modalPagoAbierto = modalPago && !modalPago.hidden;
      if (modalComunAbierto || modalPagoAbierto || (modalSelector && !modalSelector.hidden)) return;
      e.preventDefault();
      abrirSelectorClienteVenta();
    }
  });


  // Atajos del punto de venta.
  // El Enter del buscador lo registra el bloque "5.1 Lector de código de barras":
  // primero intenta resolver un código de barras y, si no, agrega el primer
  // producto del resultado. Aquí solo se prepara el resto de atajos.
  function configurarAtajosPos() {
    const buscador = porId('buscadorVenta');
    if (!buscador) return;
  }

  function configurarVistaProductos() {
    const btn = porId('btnCambiarVistaProductos');
    if (btn) {
      btn.addEventListener('click', window.cambiarVistaProductos);
    } else {
      // Fallback a prueba de tiempos: si el botón se renderiza después, este listener lo captura.
      document.addEventListener('click', function(e) {
        if (e.target && (e.target.id === 'btnCambiarVistaProductos' || e.target.closest('#btnCambiarVistaProductos'))) {
          window.cambiarVistaProductos();
        }
      });
    }
    window.addEventListener('resize', function() {
      if (porId('gridProductos')?.classList.contains('vista-filas')) {
        configurarClicksTablaProductos();
      }
    });
  }
  configurarAtajosPos();
  configurarVistaProductos();

  async function agregarAlCarrito(prodId, cant) {
    const p = productos.find(function(x) { return x.id === prodId; });
    if (!p) return;
    if (Number(p.stock) <= 0) {
      await window.posAviso({ tipo: 'aviso', titulo: 'Producto agotado', mensaje: 'Este producto está agotado.', detalle: p.nombre });
      return;
    }
    const enCarrito = carrito.find(function(i) { return i.producto.id === prodId; });
    const yaEnCarrito = enCarrito ? enCarrito.cantidad : 0;
    if (yaEnCarrito + cant > p.stock) {
      await window.posAviso({
        tipo: 'aviso',
        titulo: 'Stock insuficiente',
        mensaje: 'No hay suficiente stock disponible.',
        detalle: p.nombre + ' · disponible: ' + p.stock + ' uds'
      });
      return;
    }
    if (enCarrito) enCarrito.cantidad += cant;
    else carrito.push({ producto: p, cantidad: cant });
    renderCarrito();
  }

  window.actualizarCantidadCarrito = async function(idx, valor) {
    const item = carrito[idx];
    if (!item) return;
    let cant = parseInt(valor, 10) || 0;
    if (cant < 1) cant = 1;
    if (cant > item.producto.stock) {
      cant = item.producto.stock;
      await window.posAviso({
        tipo: 'aviso',
        titulo: 'Stock insuficiente',
        mensaje: 'Se ajustó la cantidad al stock disponible.',
        detalle: item.producto.nombre + ' · ' + item.producto.stock + ' uds'
      });
    }
    item.cantidad = cant;
    renderCarrito();
  };

  window.removerDelCarrito = function(idx) {
    carrito.splice(idx, 1);
    renderCarrito();
  };

  // Misma fórmula y redondeo que calcularTotalesVenta() del backend: subtotal -> descuento -> impuesto -> total.
  function redondear2(n) { return Math.round((Number(n) + Number.EPSILON) * 100) / 100; }
  function calcularTotales() {
    const subtotal = redondear2(carrito.reduce(function(s, i) { return s + i.producto.precio * i.cantidad; }, 0));
    const valor = Math.max(0, Number(descuentoValor) || 0);
    const descuento = redondear2(descuentoTipo === 'porcentaje' ? subtotal * Math.min(valor, 100) / 100 : Math.min(valor, subtotal));
    const impuesto = redondear2((subtotal - descuento) * impuestoPctVenta / 100);
    return { subtotal: subtotal, descuento: descuento, impuestoPct: impuestoPctVenta, impuesto: impuesto, total: redondear2(subtotal - descuento + impuesto) };
  }
  function totalCarrito() { return calcularTotales().total; }

  function renderCarrito() {
    const lista = porId('listaCarrito');
    if (lista) {
      lista.innerHTML = carrito.map(function(item, i) {
        return '<div class="carrito-item">' +
          '<div class="carrito-item-info"><strong>' + esc(item.producto.nombre) + '</strong>' +
            '<small class="carrito-item-codigo">Código: ' + esc(codigoProductoVisible(item.producto)) + '</small>' +
            '<span>' + fmt(item.producto.precio) + ' c/u</span></div>' +
          '<div class="carrito-item-controles">' +
            '<button type="button" class="btn-cant" title="Restar" onclick="actualizarCantidadCarrito(' + i + ',' + (item.cantidad - 1) + ')">−</button>' +
            '<span class="carrito-cantidad">' + item.cantidad + '</span>' +
            '<button type="button" class="btn-cant" title="Sumar" onclick="actualizarCantidadCarrito(' + i + ',' + (item.cantidad + 1) + ')">+</button>' +
            '<button type="button" class="btn-quitar" title="Quitar" onclick="removerDelCarrito(' + i + ')">✕</button>' +
          '</div>' +
          '<div class="carrito-subtotal">' + fmt(item.producto.precio * item.cantidad) + '</div>' +
        '</div>';
      }).join('');
    }
    const vacio = porId('carritoVacio');
    if (vacio) vacio.hidden = carrito.length > 0;
    const contador = porId('contadorCarrito');
    if (contador) {
      const n = carrito.reduce(function(s, i) { return s + i.cantidad; }, 0);
      contador.textContent = n + (n === 1 ? ' artículo' : ' artículos');
    }
    const resumen = porId('resumenCarrito');
    if (resumen) {
      if (carrito.length === 0) { resumen.textContent = ''; }
      else {
        const n = carrito.reduce(function(s, i) { return s + i.cantidad; }, 0);
        resumen.textContent = carrito.length + ' producto(s) · ' + n + ' artículo(s)';
      }
    }
    const totalEl = porId('totalVenta');
    const tot = calcularTotales();
    if (totalEl) totalEl.textContent = fmt(tot.total);
    const ponTexto = function(id, txt) { const el = porId(id); if (el) el.textContent = txt; };
    ponTexto('ticketSubtotal', fmt(tot.subtotal)); ponTexto('ticketDescuento', '-' + fmt(tot.descuento)); ponTexto('ticketImpuesto', fmt(tot.impuesto)); ponTexto('ticketImpuestoEtiqueta', 'Impuesto (' + tot.impuestoPct + ' %)');
    const ocultar = function(id, oculto) { const el = porId(id); if (el) el.hidden = oculto; };
    ocultar('filaSubtotal', tot.descuento <= 0 && tot.impuesto <= 0); ocultar('filaDescuento', tot.descuento <= 0); ocultar('filaImpuesto', tot.impuesto <= 0);
    renderGridProductosVentas();
    actualizarAvisoCredito();
    actualizarEstadoCobrar();
  }

  function clienteSeleccionado() {
    const sel = porId('selectClienteVenta');
    if (!sel || !sel.value) return null;
    return clientes.find(function(c) { return c.id === parseInt(sel.value, 10); }) || null;
  }

  function actualizarAvisoCredito() {
    const info = porId('infoCredito');
    const aviso = porId('avisoCredito');
    const cliente = clienteSeleccionado();
    const total = totalCarrito();
    function limpiar() {
      if (info) { info.hidden = true; info.textContent = ''; }
      if (aviso) { aviso.hidden = true; aviso.textContent = ''; aviso.className = 'credito-alerta'; }
    }
    if (metodoPagoActual !== 'credito') { limpiar(); return; }
    if (!cliente) {
      if (info) { info.hidden = true; info.textContent = ''; }
      if (aviso) {
        aviso.hidden = false;
        aviso.className = 'credito-alerta';
        aviso.textContent = 'Selecciona un cliente para vender al crédito.';
      }
      return;
    }
    const disponible = Math.max(0, cliente.limite - cliente.saldo);
    if (info) {
      info.hidden = false;
      info.textContent = etiquetaCliente(cliente) + ' — Límite: ' + fmt(cliente.limite) + ' · Disponible: ' + fmt(disponible);
    }
    if (aviso) {
      if (cliente.limite > 0 && total > disponible) {
        aviso.hidden = false;
        aviso.className = 'credito-alerta error';
        aviso.textContent = 'El total ' + fmt(total) + ' excede el crédito disponible (' + fmt(disponible) + ').';
      } else if (cliente.limite <= 0) {
        aviso.hidden = false;
        aviso.className = 'credito-alerta';
        aviso.textContent = 'Este cliente no tiene límite de crédito configurado.';
      } else {
        aviso.hidden = true;
        aviso.textContent = '';
        aviso.className = 'credito-alerta';
      }
    }
  }

  function actualizarEstadoCobrar() {
    const btn = porId('btnCobrar');
    if (!btn) return;
    const total = totalCarrito();
    const cliente = clienteSeleccionado();
    btn.disabled = carrito.length === 0 ||
      (metodoPagoActual === 'credito' && !!cliente && cliente.limite > 0 && total > cliente.limite - cliente.saldo);
    btn.textContent = carrito.length === 0 ? 'Cobrar venta' : 'Cobrar venta — ' + fmt(total);
  }

  document.querySelectorAll('.metodo-pago-boton').forEach(function(boton) {
    boton.addEventListener('click', function() {
      metodoPagoActual = boton.getAttribute('data-metodo') || 'contado';
      document.querySelectorAll('.metodo-pago-boton').forEach(function(b) { b.classList.toggle('activo', b === boton); });
      actualizarAvisoCredito();
      actualizarEstadoCobrar();
    });
  });

  const selectClienteVenta = porId('selectClienteVenta');
  if (selectClienteVenta) {
    selectClienteVenta.addEventListener('change', function() {
      actualizarBotonSelectorCliente();
      actualizarAvisoCredito();
      actualizarEstadoCobrar();
    });
  }
  prepararSelectorClienteVenta();

  const buscadorVenta = porId('buscadorVenta');
  if (buscadorVenta) {
    buscadorVenta.placeholder = 'Buscar por nombre, código, categoría o código de barras...';
    buscadorVenta.addEventListener('input', renderGridProductosVentas);
  }

  // ===== 5.1 LECTOR DE CÓDIGO DE BARRAS =====
  // El escáner USB se comporta como un teclado: entrega el código y Enter.
  // Acá se resuelve el código contra el catálogo y, si estamos en la pestaña
  // de venta, el producto entra solo al carrito. Ver src/renderer/escaner.js.
  const MIN_CARACTERES_CODIGO = 4;

  /** Quita espacios y guiones: así "750-1234" y "750 1234" son el mismo código. */
  function limpiarCodigo(texto) {
    return String(texto == null ? '' : texto).trim().replace(/[\s-]+/g, '');
  }

  /**
   * Acepta el formato de cantidad por peso que usan los lectores configurados
   * con prefijo: "3*7501234567890" o "3x7501234567890" agregan 3 unidades.
   */
  function separarCantidad(texto) {
    const partes = String(texto).match(/^(\d{1,4})\s*[*xX]\s*(.+)$/);
    if (!partes) return { cantidad: 1, codigo: texto };
    return { cantidad: parseInt(partes[1], 10), codigo: partes[2] };
  }

  function coincidenciaPorCodigo(codigo) {
    const limpio = limpiarCodigo(codigo);
    if (!limpio) return null;
    // 1) Código de barras exacto, como está en la base de datos.
    let p = productos.find(function (x) { return limpiarCodigo(x.codigoBarras || '') === limpio; });
    if (p) return p;
    // 2) Código interno (PRD-00001) por si alguien imprime la etiqueta del
    //    propio negocio en lugar del código del proveedor.
    p = productos.find(function (x) { return String(x.codigo || '').toLowerCase() === limpio.toLowerCase(); });
    return p || null;
  }

  function mostrarLectura(texto, ok) {
    const badge = porId('posLectura');
    if (!badge) return;
    const etiqueta = porId('posLecturaTexto');
    if (etiqueta) etiqueta.textContent = (ok ? '\u2713 ' : '\u2717 ') + texto;
    badge.title = texto;
    badge.className = 'pos-lectura ' + (ok ? 'ok' : 'error');
    badge.classList.remove('destello');
    // Reinicia la animación para que dos lecturas seguidas se noten.
    void badge.offsetWidth;
    badge.classList.add('destello');
  }

  /** Núcleo de la lectura: resuelve el código y lo mete al carrito. */
  async function procesarCodigoBarras(texto) {
    const crudo = String(texto == null ? '' : texto).trim();
    if (!crudo) return;
    const partes = separarCantidad(crudo);
    const codigo = limpiarCodigo(partes.codigo);
    if (codigo.length < MIN_CARACTERES_CODIGO) {
      mostrarLectura(crudo, false);
      window.escaner.pitar('error');
      return;
    }

    let producto = coincidenciaPorCodigo(codigo);
    // El catálogo del renderer ya trae todos los productos, así que el caso
    // normal se resuelve sin IPC. La consulta a la base solo hace falta si el
    // producto se creó en otra ventana después de la última carga.
    if (!producto && api && api.buscarProductoPorCodigoBarras) {
      try {
        const encontrado = await api.buscarProductoPorCodigoBarras(codigo);
        if (encontrado && !productos.some(function (x) { return x.id === Number(encontrado.id); })) {
          productos.push({
            id: Number(encontrado.id),
            codigo: encontrado.codigo || '',
            codigoBarras: encontrado.codigoBarras || encontrado.codigo_barras || '',
            nombre: encontrado.nombre,
            precio: Number(encontrado.precio) || 0,
            stock: Number(encontrado.stock) || 0,
            categoria: encontrado.categoria || ''
          });
        }
        producto = encontrado ? productos.find(function (x) { return x.id === Number(encontrado.id); }) : null;
      } catch (err) {
        console.warn('escaner:consulta', err);
      }
    }

    const enVentas = porId('vista-ventas');
    const enPestanaNueva = porId('pestanaNueva');
    const activaVenta =
      enVentas && !enVentas.hasAttribute('hidden') &&
      enPestanaNueva && !enPestanaNueva.hasAttribute('hidden');

    // Con la ficha de producto abierta, lo útil es rellenar el código: así se
    // da de alta un producto sin escribir el número a mano.
    const fichaProducto = porId('modalProducto');
    if (fichaProducto && !fichaProducto.hasAttribute('hidden')) {
      const campo = porId('campoProductoCodigoBarras');
      if (campo) {
        const dueno = productos.find(function (x) {
          return limpiarCodigo(x.codigoBarras || '') === codigo && x.id !== productoModalActual;
        });
        campo.value = codigo;
        if (dueno) {
          mostrarErrorProducto('Ese código ya lo usa "' + dueno.nombre + '".');
          window.escaner.pitar('error');
        } else {
          mostrarErrorProducto('');
          window.escaner.pitar('ok');
        }
        campo.focus();
        return;
      }
    }

    if (!activaVenta) {
      // Fuera del punto de venta el escáner no debe alterar nada: se avisa
      // para que el cajero sepa por qué no se agregó el producto.
      window.escaner.pitar('aviso');
      await window.posAviso({
        tipo: 'aviso',
        titulo: producto ? producto.nombre : 'Código no encontrado',
        mensaje: producto
          ? 'El código corresponde a un producto, pero solo se agrega al carrito desde la pestaña "Nueva venta".'
          : 'Ningún producto del catálogo tiene el código ' + codigo + '.',
        detalle: producto ? fmt(producto.precio) + ' · ' + producto.stock + ' uds disponibles' : ''
      });
      return;
    }

    if (!producto) {
      mostrarLectura(codigo, false);
      window.escaner.pitar('error');
      await window.posAviso({
        tipo: 'aviso',
        titulo: 'Código no encontrado',
        mensaje: 'Ningún producto del catálogo tiene ese código de barras.',
        detalle: 'Código leído: ' + codigo
      });
      return;
    }

    mostrarLectura(codigo, true);
    window.escaner.pitar('ok');
    await agregarAlCarrito(producto.id, Math.max(1, partes.cantidad));

    // Devuelve el foco al buscador para que el siguiente escaneo entre solo.
    if (buscadorVenta) {
      buscadorVenta.value = '';
      buscadorVenta.focus();
    }
  }

  if (window.escaner) {
    window.escaner.conectar(procesarCodigoBarras);
  }

  // --- Escáner por teléfono -------------------------------------------------
  // El proceso principal levanta un servidor en la red local; cada código que
  // lee la cámara del teléfono llega por aquí y pasa por EXACTAMENTE el mismo
  // camino que un lector USB: procesarCodigoBarras.
  const modalEscaner = porId('modalEscanerTelefono');
  const btnEscanerTelefono = porId('btnEscanerTelefono');
  const btnCerrarEscaner = porId('btnCerrarEscaner');
  const btnCerrarEscanerX = porId('btnCerrarEscanerTelefono');
  const btnDetenerEscaner = porId('btnDetenerEscaner');

  function cerrarModalEscaner() {
    if (modalEscaner) modalEscaner.setAttribute('hidden', 'true');
  }

  function estadoEscaner(texto, clase) {
    const el = porId('escanerEstado');
    if (!el) return;
    el.textContent = texto;
    el.className = 'escaner-estado ' + (clase || '');
  }

  window.abrirEscanerTelefono = async function () {
    if (!api || !api.iniciarEscanerTelefono) {
      await window.posAviso({
        tipo: 'aviso',
        titulo: 'Escáner no disponible',
        mensaje: 'Ejecuta SmartPosPro desde la aplicación: el escáner del teléfono necesita la caja encendida.'
      });
      return;
    }
    if (modalEscaner) modalEscaner.removeAttribute('hidden');
    estadoEscaner('Preparando el escáner…');
    const qr = porId('escanerQr');
    if (qr) qr.innerHTML = '';
    const url = porId('escanerUrl');
    if (url) url.textContent = '';

    try {
      const info = await api.iniciarEscanerTelefono();
      if (!info || !info.activo) {
        estadoEscaner((info && info.error) || 'No se pudo iniciar el escáner.', 'error');
        return;
      }
      // El QR viene ya dibujado en SVG desde el proceso principal.
      if (qr) qr.innerHTML = info.qr || '';
      if (url) url.textContent = info.url || '';
      // Con HTTPS el móvil pide confiar en el certificado: el cajero tiene las
      // instrucciones a mano en el desplegable del modal.
      const notaSeguridad = porId('escanerAyuda');
      if (notaSeguridad) notaSeguridad.hidden = !info.seguro;
      estadoEscaner(
        info.seguro
          ? 'Listo. Escanea desde el teléfono.'
          : 'Sin cámara: la cámara exige HTTPS. Reinicia SmartPosPro para generar el certificado.',
        info.seguro ? 'ok' : 'error'
      );
      // Si el certificado se rehizo (el router cambió la IP), el móvil sigue
      // teniendo el anterior instalado y la cámara no abrirá. Decirlo aquí
      // evita que el cajero repita el mismo ritual de certificados sin éxito.
      if (info.certCambiado) {
        estadoEscaner(
          'El certificado se rehizo porque cambió la IP de la caja. ' +
          'Vuelve a instalar smartpospro-ca.crt en el teléfono.',
          'error'
        );
        if (notaSeguridad) notaSeguridad.hidden = false;
      }
    } catch (err) {
      estadoEscaner((err && err.message) || 'No se pudo iniciar el escáner.', 'error');
    }
  };

  if (btnEscanerTelefono) btnEscanerTelefono.addEventListener('click', window.abrirEscanerTelefono);
  if (btnCerrarEscaner) btnCerrarEscaner.addEventListener('click', cerrarModalEscaner);
  if (btnCerrarEscanerX) btnCerrarEscanerX.addEventListener('click', cerrarModalEscaner);
  if (btnDetenerEscaner) {
    btnDetenerEscaner.addEventListener('click', async function () {
      if (api && api.detenerEscanerTelefono) {
        try { await api.detenerEscanerTelefono(); } catch (err) { console.warn('escaner:detener', err); }
      }
      estadoEscaner('Escáner detenido.', '');
      const qr = porId('escanerQr');
      if (qr) qr.innerHTML = '';
      const url = porId('escanerUrl');
      if (url) url.textContent = '';
    });
  }
  if (modalEscaner) {
    modalEscaner.addEventListener('mousedown', function (e) {
      if (e.target === modalEscaner) cerrarModalEscaner();
    });
  }

  if (api && api.onCodigoEscaner) {
    api.onCodigoEscaner(function (codigo) {
      // Confirmación en el modal: el cajero ve que el código entró a la caja.
      estadoEscaner('Código recibido: ' + codigo, 'ok');
      procesarCodigoBarras(codigo);
    });
  }

  // Enter en el buscador: si el texto es un código de barras exacto, se trata
  // como lectura (así funciona también con el lector enfocado en la caja).
  if (buscadorVenta) {
    buscadorVenta.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      const codigo = limpiarCodigo(buscadorVenta.value);
      if (codigo.length >= MIN_CARACTERES_CODIGO && coincidenciaPorCodigo(codigo)) {
        procesarCodigoBarras(buscadorVenta.value);
        return;
      }
      const cards = document.querySelectorAll('#gridProductos .producto-card:not(.agotado)');
      if (cards.length > 0) cards[0].click();
    });
  }

  // ---- Descuento de la venta (% o monto fijo) e impuesto de Configuración ----
  const selDescuentoTipo = porId('descuentoTipo');
  const inpDescuentoValor = porId('descuentoValor');
  if (selDescuentoTipo) selDescuentoTipo.addEventListener('change', function() { descuentoTipo = selDescuentoTipo.value === 'monto' ? 'monto' : 'porcentaje'; renderCarrito(); });
  if (inpDescuentoValor) inpDescuentoValor.addEventListener('input', function() { descuentoValor = Math.max(0, parseFloat(inpDescuentoValor.value) || 0); renderCarrito(); });
  function reiniciarDescuento() {
    descuentoTipo = 'porcentaje'; descuentoValor = 0;
    if (selDescuentoTipo) selDescuentoTipo.value = 'porcentaje';
    if (inpDescuentoValor) inpDescuentoValor.value = '';
  }
  // modulos.js avisa al guardar o restablecer Configuración: el impuesto nuevo se aplica al instante.
  window.addEventListener('config-actualizada', function(e) {
    const c = (e && e.detail) || {};
    impuestoPctVenta = Number(c.impuesto) > 0 ? Number(c.impuesto) : 0;
    renderCarrito();
  });

  const btnVaciarVenta = porId('btnVaciarVenta');
  if (btnVaciarVenta) {
    btnVaciarVenta.addEventListener('click', async function() {
      if (carrito.length === 0) return;
      const articulos = carrito.reduce(function(s, i) { return s + i.cantidad; }, 0);
      const confirmado = await window.posConfirmar({
        tipo: 'peligro',
        titulo: 'Vaciar ticket',
        mensaje: 'Se quitarán todos los productos del ticket actual.',
        detalle: carrito.length + ' producto(s) · ' + articulos + ' artículo(s) · ' + fmt(totalCarrito()),
        aceptar: 'Sí, vaciar'
      });
      if (!confirmado) return;
      carrito = [];
      reiniciarDescuento();
      renderCarrito();
    });
  }

  const btnCobrar = porId('btnCobrar');
  if (btnCobrar) btnCobrar.addEventListener('click', function() { cobrarVenta(); });

  // ---- Cobro pro: modal con efectivo, botones rápidos y cambio ----
  let pagoEnProceso = null; // { total, cliente, metodo, items }
  let guardandoPago = false;

  function mostrarErrorPago(mensaje) {
    const err = porId('pagoError');
    if (!err) return;
    if (mensaje) { err.textContent = mensaje; err.hidden = false; }
    else { err.textContent = ''; err.hidden = true; }
  }

  function cerrarModalPago() {
    if (guardandoPago) return;
    pagoEnProceso = null;
    mostrarErrorPago('');
    const modal = porId('modalPago');
    if (modal) modal.setAttribute('hidden', 'true');
  }

  function renderBotonesRapidosPago() {
    const wrap = porId('pagoRapidos');
    if (!wrap || !pagoEnProceso) return;
    const total = pagoEnProceso.total;
    let html = '';
    if (total > 0 && Math.abs(total - Math.round(total)) < 0.005) {
      html += '<button type="button" class="pago-rapido" data-monto="' + total + '">Exacto</button>';
    }
    [50, 100, 200, 500, 1000].filter(function(m) { return m >= total; }).slice(0, 3).forEach(function(m) {
      html += '<button type="button" class="pago-rapido" data-monto="' + m + '">C$' + m + '</button>';
    });
    wrap.innerHTML = html;
    wrap.querySelectorAll('.pago-rapido').forEach(function(b) {
      b.addEventListener('click', function() {
        const ef = porId('pagoEfectivo');
        if (ef) { ef.value = b.getAttribute('data-monto'); actualizarCambioPago(); }
      });
    });
  }

  function actualizarCambioPago() {
    const box = porId('pagoCambioBox');
    const valor = porId('pagoCambio');
    const etq = porId('pagoCambioEtiqueta');
    if (!box || !valor || !etq || !pagoEnProceso) return;
    if (porId('pagoError')) porId('pagoError').hidden = true;
    const recibido = Math.max(0, parseFloat((porId('pagoEfectivo') || {}).value) || 0);
    if (recibido <= 0) { box.hidden = true; return; }
    const diferencia = recibido - pagoEnProceso.total;
    box.hidden = false;
    if (diferencia < 0) {
      etq.textContent = 'Falta';
      valor.textContent = fmt(Math.abs(diferencia));
      valor.className = 'pago-cambio-valor falta';
    } else {
      etq.textContent = 'Cambio';
      valor.textContent = fmt(diferencia);
      valor.className = 'pago-cambio-valor listo';
    }
  }

  window.cobrarVenta = async function() {
    if (carrito.length === 0) {
      await window.posAviso({ tipo: 'aviso', titulo: 'Ticket vacío', mensaje: 'El carrito está vacío. Agrega productos para cobrar.' });
      return;
    }
    const total = totalCarrito();
    const cliente = clienteSeleccionado();
    if (metodoPagoActual === 'credito') {
      if (!cliente) {
        await window.posAviso({ tipo: 'aviso', titulo: 'Cliente requerido', mensaje: 'Debes seleccionar un cliente para ventas al crédito.' });
        return;
      }
      if (cliente.limite > 0 && total > cliente.limite - cliente.saldo) {
        await window.posAviso({
          tipo: 'peligro',
          titulo: 'Crédito excedido',
          mensaje: 'El total de la venta excede el crédito disponible del cliente.',
          detalle: 'Total: ' + fmt(total) + ' · Disponible: ' + fmt(Math.max(0, cliente.limite - cliente.saldo))
        });
        return;
      }
    }
    pagoEnProceso = {
      total: total,
      cliente: cliente,
      metodo: metodoPagoActual,
      descuentoTipo: descuentoTipo,
      descuentoValor: descuentoValor,
      totales: calcularTotales(),
      items: carrito.map(function(i) {
        return { productoId: i.producto.id, nombre: i.producto.nombre, precio: i.producto.precio, cantidad: i.cantidad };
      })
    };
    abrirModalPago();
  };

  async function registrarVentaCobrada(pago, efectivo, cambio) {
    let ventaId = null;
    if (!api) throw new Error('No hay conexión con el servicio de ventas.');
    ventaId = await api.crearVenta({ clienteId: pago.cliente ? pago.cliente.id : null, tipoPago: pago.metodo, items: pago.items, descuentoTipo: pago.descuentoTipo, descuentoValor: pago.descuentoValor });
    ventaId = Number(ventaId);
    if (!Number.isInteger(ventaId) || ventaId <= 0) throw new Error('No se recibió la confirmación del guardado. Revisa el historial antes de volver a cobrar.');
    pago.items.forEach(function(item) {
      const prod = productos.find(function(x) { return x.id === item.productoId; });
      if (prod) prod.stock -= item.cantidad;
    });
    if (pago.metodo === 'credito' && pago.cliente) pago.cliente.saldo += pago.total;
    // Fecha/hora local (no UTC) para que coincida con el resto de la base de datos
    const f = new Date();
    const p = function(n) { return String(n).padStart(2, '0'); };
    const fecha = f.getFullYear() + '-' + p(f.getMonth() + 1) + '-' + p(f.getDate()) +
      ' ' + p(f.getHours()) + ':' + p(f.getMinutes()) + ':' + p(f.getSeconds());
    const nuevaVenta = {
      id: ventaId || (historialVentas.length > 0 ? Math.max.apply(null, historialVentas.map(function(v) { return Number(v.id) || 0; })) + 1 : 1),
      cliente_id: pago.cliente ? pago.cliente.id : null,
      cliente_nombre: pago.cliente ? pago.cliente.nombre : null,
      cliente_codigo: pago.cliente ? (pago.cliente.codigo || '') : '',
      tipo_pago: pago.metodo,
      total: pago.total,
      subtotal: pago.totales.subtotal,
      descuento: pago.totales.descuento,
      impuesto_pct: pago.totales.impuestoPct,
      impuesto: pago.totales.impuesto,
      fecha: fecha,
      detalles: pago.items.map(function(item) {
        return { producto_id: item.productoId, nombre: item.nombre, precio: item.precio, cantidad: item.cantidad };
      })
    };
    historialVentas.unshift(nuevaVenta);
    renderTablaClientes();
    renderTablaProductos();
    renderGridProductosVentas();
    renderTablaAbonos();
    renderTablaCopia();
    carrito = [];
    reiniciarDescuento();
    renderCarrito();
    // Recargamos el historial desde la base para que la venta recién guardada ya
    // traiga su número de factura (FCT-0001) y el código del cliente (CLI-0001),
    // que asigna el backend al insertar.
    await window.cargarHistorial();
    mostrarReciboDeVenta(nuevaVenta.id, pago.metodo === 'credito' ? null : { efectivo: efectivo, cambio: cambio }, nuevaVenta, true);
    cargarResumen();
    // La siguiente venta arranca de cero: sin cliente heredado y en Contado.
    reiniciarVentaTrasCobro();
  }

  /**
   * Devuelve el formulario de venta a su estado inicial tras cobrar: el cliente
   * vuelve a "Cliente de mostrador (contado)" y el método de pago a Contado.
   * Así la siguiente venta no hereda el cliente de la venta anterior por error.
   */
  function reiniciarVentaTrasCobro() {
    const sel = porId('selectClienteVenta');
    if (sel) sel.value = '';

    metodoPagoActual = 'contado';
    document.querySelectorAll('#vista-ventas .metodo-pago-boton').forEach(function(boton) {
      boton.classList.toggle('activo', boton.getAttribute('data-metodo') === 'contado');
    });

    const infoCredito = porId('infoCredito');
    if (infoCredito) infoCredito.hidden = true;
    const avisoCredito = porId('avisoCredito');
    if (avisoCredito) avisoCredito.hidden = true;
  }

  const formPago = porId('formPago');
  if (formPago) {
    formPago.addEventListener('submit', async function(e) {
      e.preventDefault();
      if (!pagoEnProceso || guardandoPago) return;
      const total = pagoEnProceso.total;
      let efectivo = null;
      let cambio = 0;
      if (pagoEnProceso.metodo !== 'credito') {
        efectivo = Math.max(0, parseFloat((porId('pagoEfectivo') || {}).value) || 0);
        if (efectivo <= 0 && total > 0) {
          mostrarErrorPago('Ingresa el efectivo recibido o usa un botón rápido.');
          const inp = porId('pagoEfectivo'); if (inp) inp.focus();
          return;
        }
        if (efectivo < total) {
          mostrarErrorPago('El efectivo recibido (' + fmt(efectivo) + ') no cubre el total (' + fmt(total) + ').');
          const inp = porId('pagoEfectivo'); if (inp) inp.focus();
          return;
        }
        cambio = efectivo - total;
      }
      const pagoActual = pagoEnProceso;
      const confirmar = porId('btnConfirmarPago');
      guardandoPago = true;
      confirmar.disabled = true;
      confirmar.textContent = 'Guardando…';
      try {
        await registrarVentaCobrada(pagoActual, efectivo, cambio);
        guardandoPago = false;
        cerrarModalPago();
      } catch (err) {
        mostrarErrorPago('No se pudo completar el cobro. ' + (err.message || 'Revisa la conexión e inténtalo de nuevo.'));
      } finally {
        guardandoPago = false;
        confirmar.disabled = false;
        confirmar.textContent = 'Confirmar cobro';
      }
    });
  }
  const btnCancelarPago = porId('btnCancelarPago');
  if (btnCancelarPago) btnCancelarPago.addEventListener('click', cerrarModalPago);
  const pagoEfectivoInput = porId('pagoEfectivo');
  if (pagoEfectivoInput) pagoEfectivoInput.addEventListener('input', actualizarCambioPago);
  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
      const mp = porId('modalPago');
      if (mp && !mp.hasAttribute('hidden')) cerrarModalPago();
    }
  });
  const modalPagoEl = porId('modalPago');
  if (modalPagoEl) {
    modalPagoEl.addEventListener('mousedown', function(e) {
      if (e.target === modalPagoEl) cerrarModalPago();
    });
  }

  function abrirModalPago() {
    if (!pagoEnProceso) return;
    const totalEl = porId('pagoTotal');
    if (totalEl) totalEl.textContent = fmt(pagoEnProceso.total);
    const meta = porId('pagoMeta');
    if (meta) {
      const n = carrito.reduce(function(s, i) { return s + i.cantidad; }, 0);
      meta.textContent = n + (n === 1 ? ' artículo' : ' artículos') + ' · ' + (pagoEnProceso.metodo === 'credito' ? 'Crédito' : 'Contado');
    }
    const ef = porId('pagoEfectivo');
    if (ef) ef.value = '';
    mostrarErrorPago('');
    const secEfectivo = porId('pagoSeccionEfectivo');
    const secCredito = porId('pagoSeccionCredito');
    const titulo = porId('pagoTitulo');
    const resumen = porId('pagoResumenCredito');
    if (pagoEnProceso.metodo === 'credito') {
      if (secEfectivo) secEfectivo.hidden = true;
      if (secCredito) secCredito.hidden = false;
      if (titulo) titulo.textContent = 'Cobrar al crédito';
      if (resumen) {
        const c = pagoEnProceso.cliente;
        resumen.innerHTML =
          '<div class="pago-fila"><span>Cliente</span><strong>' + esc(etiquetaCliente(c)) + '</strong></div>' +
          '<div class="pago-fila"><span>Límite de crédito</span><strong>' + fmt(c.limite) + '</strong></div>' +
          '<div class="pago-fila"><span>Saldo actual</span><strong>' + fmt(Math.max(0, c.saldo)) + '</strong></div>' +
          '<div class="pago-fila"><span>Valor de la venta</span><strong>' + fmt(pagoEnProceso.total) + '</strong></div>' +
          '<div class="pago-fila destaque"><span>Saldo después de la venta</span><strong>' + fmt(Math.max(0, Number(c.saldo) + pagoEnProceso.total)) + '</strong></div>';
      }
    } else {
      if (secEfectivo) secEfectivo.hidden = false;
      if (secCredito) secCredito.hidden = true;
      if (titulo) titulo.textContent = 'Cobrar venta';
      renderBotonesRapidosPago();
      const cb = porId('pagoCambioBox');
      if (cb) cb.hidden = true;
    }
    const modal = porId('modalPago');
    if (modal) modal.removeAttribute('hidden');
    if (pagoEnProceso.metodo !== 'credito' && ef) ef.focus();
  }

  // ===== 6. RECIBO E HISTORIAL DE VENTAS =====
  window.mostrarReciboDeVenta = async function(id, extra, ventaData, preguntarImpresion) {
    const v = historialVentas.find(function(x) { return Number(x.id) === Number(id); }) || ventaData;
    if (!v) return;

    const f80Nombre = porId("f80Nombre");
    const f80Ruc = porId("f80Ruc");
    const f80Direccion = porId("f80Direccion");
    const f80Telefono = porId("f80Telefono");
    const f80Titulo = porId("f80Titulo");
    const f80Meta = porId("f80Meta");
    const f80Tbody = porId("f80Tbody");
    const f80Total = porId("f80Total");
    const f80Pago = porId("f80Pago");
    const f80PieTicket = porId("f80PieTicket");
    const f80PieFecha = porId("f80PieFecha");
    const f80PieMensaje = porId("f80PieMensaje");

    if (!f80Nombre) return;

    // Cargar datos del negocio para el encabezado
    if (api) {
      try {
        const config = await api.obtenerConfiguracion();
        if (config) {
          if (f80Nombre) f80Nombre.textContent = config.nombre || "SmartPosPro";
          if (f80Ruc) f80Ruc.textContent = config.ruc ? "RUC: " + config.ruc : "";
          if (f80Direccion) f80Direccion.textContent = config.direccion || "";
          if (f80Telefono) f80Telefono.textContent = config.telefono ? "Telf: " + config.telefono : "";
          if (f80PieMensaje) f80PieMensaje.textContent = config.pieTicket || "¡Gracias por su compra!";
        }
      } catch (e) { /* usar valores por defecto del HTML */ }
    }

    var detalles = Array.isArray(v.detalles) ? v.detalles : [];

    // Titulo
    if (f80Titulo) f80Titulo.textContent = "FACTURA DE VENTA " + (v.numero || ("#" + v.id));

    // Meta: fecha, tipo pago, cliente
    if (f80Meta) {
      var fecha = v.fecha || "";
      var tipo = v.tipo_pago === "credito" ? "Crédito" : "Contado";
      var cliente = esc(etiquetaCliente({ codigo: v.cliente_codigo, nombre: v.cliente_nombre || "Mostrador" }));
      f80Meta.innerHTML = "";
      var span1 = document.createElement("span");
      span1.innerHTML = "Fecha: " + esc(fecha);
      var span2 = document.createElement("span");
      span2.innerHTML = "Pago: " + tipo;
      var span3 = document.createElement("span");
      span3.innerHTML = "Cliente: " + cliente;
      f80Meta.appendChild(span1);
      f80Meta.appendChild(span2);
      f80Meta.appendChild(span3);
    }

    // Tabla de productos
    if (f80Tbody) {
      f80Tbody.innerHTML = "";
      detalles.forEach(function(d) {
        var tr = document.createElement("tr");
        var tdArticulo = document.createElement("td");
        tdArticulo.className = "f80-articulo";
        var codigo = d.codigo || (d.producto_id ? ("PRD-" + String(d.producto_id).padStart(5, "0")) : "COMÚN");
        var codigoSpan = document.createElement("span");
        codigoSpan.className = "f80-codigo";
        codigoSpan.textContent = codigo;
        var nombreSpan = document.createElement("span");
        nombreSpan.className = "f80-descripcion";
        nombreSpan.textContent = d.nombre || "Producto";
        tdArticulo.appendChild(codigoSpan);
        tdArticulo.appendChild(nombreSpan);

        var tdCantidad = document.createElement("td");
        tdCantidad.className = "num f80-cantidad";
        tdCantidad.textContent = Number(d.cantidad) || 0;

        var tdPrecio = document.createElement("td");
        tdPrecio.className = "num f80-precio";
        tdPrecio.textContent = fmt(d.precio);

        var tdImporte = document.createElement("td");
        tdImporte.className = "num f80-importe";
        tdImporte.textContent = fmt(Number(d.subtotal) || ((Number(d.precio) || 0) * (Number(d.cantidad) || 0)));

        tr.appendChild(tdArticulo);
        tr.appendChild(tdCantidad);
        tr.appendChild(tdPrecio);
        tr.appendChild(tdImporte);
        f80Tbody.appendChild(tr);
      });
    }

    // Total
    // Desglose: solo aparece si la venta tuvo descuento o impuesto (las ventas anteriores no cambian)
    var f80Desglose = porId("f80Desglose");
    if (f80Desglose) {
      f80Desglose.innerHTML = "";
      var dDesc = Number(v.descuento) || 0, dImp = Number(v.impuesto) || 0;
      var filaDesglose = function(etq, val) {
        var r = document.createElement("div"); r.className = "f80-desglose-fila";
        var a = document.createElement("span"); a.textContent = etq;
        var b = document.createElement("span"); b.textContent = val;
        r.appendChild(a); r.appendChild(b); f80Desglose.appendChild(r);
      };
      if (dDesc > 0 || dImp > 0) {
        filaDesglose("Subtotal", fmt(v.subtotal != null ? v.subtotal : v.total));
        if (dDesc > 0) filaDesglose("Descuento", "-" + fmt(dDesc));
        if (dImp > 0) filaDesglose("Impuesto (" + (Number(v.impuesto_pct) || 0) + "%)", fmt(dImp));
      }
    }
    if (f80Total) f80Total.textContent = fmt(v.total);

    // Pago: efectivo y cambio
    if (f80Pago) {
      f80Pago.innerHTML = "";
      if (extra && typeof extra.efectivo === "number") {
        var pagoRow = document.createElement("div");
                pagoRow.className = "f80-pago-fila";
        var efSpan = document.createElement("span");
        efSpan.className = "f80-pago-lab";
        efSpan.textContent = "Efectivo: ";
        var efVal = document.createElement("span");
        efVal.className = "f80-pago-val";
        efVal.textContent = fmt(extra.efectivo);
        efSpan.appendChild(efVal);
        var camSpan = document.createElement("span");
        camSpan.className = "f80-pago-lab";
        camSpan.textContent = "Cambio: ";
        var camVal = document.createElement("span");
        camVal.className = "f80-pago-val";
        if (extra.cambio > 0) {
          camVal.textContent = fmt(extra.cambio);
        } else {
          camVal.textContent = "(exacto)";
        }
        camSpan.appendChild(camVal);
        pagoRow.appendChild(efSpan);
        pagoRow.appendChild(camSpan);
        f80Pago.appendChild(pagoRow);
      }
    }

// Pie: ticket y fecha
    if (f80PieTicket) f80PieTicket.textContent = "N° Ticket: " + (v.numero || ("#" + v.id));
    if (f80PieFecha) f80PieFecha.textContent = v.fecha ? v.fecha.split(" ")[0] : "";

        var modal = porId("modalRecibo");
    if (modal) modal.removeAttribute("hidden");

    // Después de una venta nueva, preguntar si desea imprimir el comprobante
    if (preguntarImpresion && window.posConfirmar) {
      window.posConfirmar({
        tipo: 'pregunta',
        titulo: '¿Desea imprimir el recibo?',
        mensaje: 'La venta fue registrada correctamente. ¿Desea imprimir el comprobante?',
        icono: '🖨️',
        aceptar: 'Imprimir',
        cancelar: 'No, gracias'
      }).then(function(imprimir) {
        if (imprimir) window.imprimirReciboDirecto();
      });
    }
  };

  const btnCerrarRecibo = porId('btnCerrarRecibo');
  if (btnCerrarRecibo) {
    btnCerrarRecibo.addEventListener('click', function() {
      const modal = porId('modalRecibo');
      if (modal) modal.setAttribute('hidden', 'true');
    });
  }
  [porId('btnCerrarDetalleVenta'), porId('btnCerrarDetalleVentaPie')].forEach(function(boton) {
    if (boton) boton.addEventListener('click', function() {
      const modal = porId('modalDetalleVenta');
      if (modal) modal.hidden = true;
    });
  });
  document.addEventListener('keydown', function(e) {
    const modal = porId('modalDetalleVenta');
    if (e.key === 'Escape' && modal && !modal.hidden) modal.hidden = true;
  });
  // ===== 6.1 IMPRESIÓN PROFESIONAL DEL COMPROBANTE (80 mm / 58 mm / A4) =====
  // El comprobante se manda a la impresora desde el proceso principal: allí se
  // arma un documento con el diseño del ticket, se fija el tamaño de papel en
  // micras y se envía directo a la térmica (o se exporta a PDF). Ya no se usa
  // window.print(), que imprimía la ventana completa de la aplicación.
  const PAPELES_TICKET = {
    '80': { anchoMm: 80, altoMm: null, etiqueta: '80 mm · rollo térmico' },
    '58': { anchoMm: 58, altoMm: null, etiqueta: '58 mm · rollo compacto' },
    'hoja': { anchoMm: 210, altoMm: 297, etiqueta: 'A4 · hoja completa' }
  };
  const CLAVE_IMPRESION = 'pos.impresionTicket';
  const PREFERENCIAS_IMPRESION_BASE = { impresora: '', papel: '80', copias: 1, directo: true };
  let preferenciasImpresion = null;
  let impresorasDetectadas = [];
  let impresionEnCurso = false;

  function leerPreferenciasImpresion() {
    try {
      const crudo = window.localStorage.getItem(CLAVE_IMPRESION);
      if (!crudo) return null;
      const datos = JSON.parse(crudo);
      if (!datos || typeof datos !== 'object') return null;
      return {
        impresora: typeof datos.impresora === 'string' ? datos.impresora : '',
        papel: PAPELES_TICKET[datos.papel] ? datos.papel : '80',
        copias: Math.min(20, Math.max(1, parseInt(datos.copias, 10) || 1)),
        directo: datos.directo !== false
      };
    } catch (err) {
      console.warn('impresion:preferencias', err);
      return null;
    }
  }

  function guardarPreferenciasImpresion(prefs) {
    preferenciasImpresion = prefs;
    try {
      window.localStorage.setItem(CLAVE_IMPRESION, JSON.stringify(prefs));
    } catch (err) {
      console.warn('impresion:guardar-preferencias', err);
    }
  }

  // Datos visibles del comprobante (el HTML ya lo maquetó la aplicación).
  function comprobanteActual() {
    const titulo = porId('f80Titulo');
    const total = porId('f80Total');
    const partes = String((titulo && titulo.textContent) || '').trim().split(/\s+/);
    const numero = (partes.length ? partes[partes.length - 1] : '').replace(/[^0-9A-Za-z-]/g, '');
    return {
      numero: numero || 'venta',
      titulo: titulo ? String(titulo.textContent || '').trim() : '',
      total: total ? String(total.textContent || '').trim() : ''
    };
  }

  // Petición que viaja al proceso principal: el HTML del ticket y el papel.
  function crearPeticionImpresion(prefs) {
    const contenedor = porId('reciboCuerpo');
    if (!contenedor) return null;
    const usadas = prefs || PREFERENCIAS_IMPRESION_BASE;
    const papel = PAPELES_TICKET[usadas.papel] || PAPELES_TICKET['80'];
    return {
      html: contenedor.outerHTML,
      impresora: usadas.impresora || '',
      copias: usadas.copias,
      anchoMm: papel.anchoMm,
      altoMm: papel.altoMm,
      silencioso: usadas.directo !== false,
      nombreArchivo: 'comprobante-' + comprobanteActual().numero + '.pdf'
    };
  }

  function estadoImpresion(mensaje, tipo) {
    const estado = porId('impresionEstado');
    if (!estado) return;
    estado.textContent = mensaje || '';
    estado.className = 'impresion-estado' + (tipo ? ' ' + tipo : '');
    estado.hidden = !mensaje;
  }

  function bloquearBotonesImpresion(bloqueado) {
    ['btnConfirmarImpresion', 'btnPdfDesdeModal', 'btnPdfRecibo'].forEach(function(id) {
      const boton = porId(id);
      if (!boton) return;
      const sinEquipos = id === 'btnConfirmarImpresion' && impresorasDetectadas.length === 0;
      boton.disabled = bloqueado || sinEquipos;
    });
    const confirmar = porId('btnConfirmarImpresion');
    if (confirmar) confirmar.textContent = bloqueado ? 'Enviando...' : 'Imprimir ahora';
    const pdf = porId('btnPdfDesdeModal');
    if (pdf) pdf.textContent = bloqueado ? 'Generando...' : 'Guardar PDF';
  }

  async function cargarImpresorasDelSistema() {
    impresorasDetectadas = [];
    if (api && typeof api.listarImpresoras === 'function') {
      try {
        const lista = await api.listarImpresoras();
        if (Array.isArray(lista)) impresorasDetectadas = lista;
      } catch (err) {
        console.warn('impresion:listar-impresoras', err);
      }
    }
    pintarImpresorasEnSelector();
  }

  function pintarImpresorasEnSelector() {
    const selector = porId('selImpresoraTicket');
    if (selector) {
      const opciones = ['<option value="">Impresora predeterminada de Windows</option>'];
      impresorasDetectadas.forEach(function(equipo) {
        const nombre = equipo && equipo.nombre ? String(equipo.nombre) : '';
        if (!nombre) return;
        const etiqueta = String(equipo.mostrado || nombre) + (equipo.predeterminada ? ' · predeterminada' : '');
        opciones.push('<option value="' + esc(nombre) + '">' + esc(etiqueta) + '</option>');
      });
      selector.innerHTML = opciones.join('');
    }
    const aviso = porId('impresionSinEquipos');
    if (aviso) aviso.hidden = impresorasDetectadas.length > 0;
    const confirmar = porId('btnConfirmarImpresion');
    if (confirmar) confirmar.disabled = impresorasDetectadas.length === 0;
  }

  function sincronizarOpcionesImpresion() {
    const prefs = preferenciasImpresion || PREFERENCIAS_IMPRESION_BASE;
    const selector = porId('selImpresoraTicket');
    const papel = porId('selPapelTicket');
    const copias = porId('campoCopiasTicket');
    const directo = porId('checkImpresionDirecta');
    if (selector) {
      const objetivo = prefs.impresora || '';
      let existe = false;
      for (let i = 0; i < selector.options.length; i += 1) {
        if (selector.options[i].value === objetivo) existe = true;
      }
      selector.value = existe ? objetivo : '';
    }
    if (papel) papel.value = PAPELES_TICKET[prefs.papel] ? prefs.papel : '80';
    if (copias) copias.value = String(prefs.copias || 1);
    if (directo) directo.checked = prefs.directo !== false;
    actualizarResumenImpresion();
  }

  function actualizarResumenImpresion() {
    const resumen = porId('impresionResumen');
    if (!resumen) return;
    const papel = porId('selPapelTicket');
    const clave = papel && PAPELES_TICKET[papel.value] ? papel.value : '80';
    const datos = comprobanteActual();
    const partes = [];
    if (datos.titulo) partes.push(datos.titulo);
    if (datos.total) partes.push('Total ' + datos.total);
    partes.push(PAPELES_TICKET[clave].etiqueta);
    resumen.textContent = partes.join('   ·   ');
  }

  function leerOpcionesImpresionDelFormulario() {
    const selector = porId('selImpresoraTicket');
    const papel = porId('selPapelTicket');
    const copias = porId('campoCopiasTicket');
    const directo = porId('checkImpresionDirecta');
    const base = preferenciasImpresion || PREFERENCIAS_IMPRESION_BASE;
    const clavePapel = papel && PAPELES_TICKET[papel.value] ? papel.value : base.papel;
    return {
      impresora: selector ? selector.value : base.impresora,
      papel: clavePapel,
      copias: Math.min(20, Math.max(1, parseInt(copias && copias.value, 10) || 1)),
      directo: directo ? directo.checked : base.directo
    };
  }

  function ocultarModalImpresion() {
    const modal = porId('modalImprimirRecibo');
    if (modal) modal.setAttribute('hidden', 'true');
  }

  // Panel de impresión: impresora, papel y copias del comprobante en pantalla.
  async function abrirOpcionesImpresion(mensajeError) {
    const modal = porId('modalImprimirRecibo');
    if (!modal) return;
    await cargarImpresorasDelSistema();
    sincronizarOpcionesImpresion();
    estadoImpresion(mensajeError || '', mensajeError ? 'error' : '');
    modal.removeAttribute('hidden');
    const confirmar = porId('btnConfirmarImpresion');
    if (confirmar && !confirmar.disabled) confirmar.focus();
  }

  async function enviarComprobanteAImpresora(prefs) {
    if (impresionEnCurso) return { ok: false, mensaje: 'Ya hay un comprobante en proceso de impresión.' };
    if (!api || typeof api.imprimirTicket !== 'function') {
      return { ok: false, mensaje: 'La impresión no está disponible en esta instalación.' };
    }
    const peticion = crearPeticionImpresion(prefs);
    if (!peticion) return { ok: false, mensaje: 'No hay comprobante para imprimir.' };

    impresionEnCurso = true;
    bloquearBotonesImpresion(true);
    estadoImpresion('Enviando el comprobante a la impresora...');
    try {
      const respuesta = await api.imprimirTicket(peticion);
      if (respuesta && respuesta.ok) {
        guardarPreferenciasImpresion(prefs);
        estadoImpresion(respuesta.mensaje || 'Comprobante enviado a la impresora.', 'ok');
        return { ok: true, mensaje: respuesta.mensaje || '' };
      }
      const mensaje = (respuesta && respuesta.mensaje) || 'No se pudo imprimir el comprobante.';
      estadoImpresion(mensaje, 'error');
      return { ok: false, mensaje: mensaje };
    } catch (err) {
      const mensaje = 'Error al imprimir: ' + (err && err.message ? err.message : err);
      estadoImpresion(mensaje, 'error');
      return { ok: false, mensaje: mensaje };
    } finally {
      impresionEnCurso = false;
      bloquearBotonesImpresion(false);
    }
  }

  async function guardarComprobanteEnPDF(prefs) {
    if (impresionEnCurso) return { ok: false, mensaje: 'Ya hay un comprobante en proceso.' };
    if (!api || typeof api.guardarTicketPDF !== 'function') {
      return { ok: false, mensaje: 'La exportación a PDF no está disponible en esta instalación.' };
    }
    const peticion = crearPeticionImpresion(prefs);
    if (!peticion) return { ok: false, mensaje: 'No hay comprobante para exportar.' };

    impresionEnCurso = true;
    bloquearBotonesImpresion(true);
    estadoImpresion('Generando el PDF del comprobante...');
    try {
      const respuesta = await api.guardarTicketPDF(peticion);
      if (respuesta && respuesta.ok) {
        guardarPreferenciasImpresion(prefs);
        estadoImpresion('PDF guardado en: ' + respuesta.ruta, 'ok');
        if (window.posAviso) {
          window.posAviso({
            tipo: 'exito',
            titulo: 'Comprobante exportado',
            mensaje: 'El comprobante se guardó en PDF.',
            detalle: String(respuesta.ruta || '')
          });
        }
        return { ok: true, ruta: respuesta.ruta };
      }
      if (respuesta && respuesta.cancelado) {
        estadoImpresion('Exportación cancelada.');
        return { ok: false, mensaje: '' };
      }
      const mensaje = (respuesta && respuesta.mensaje) || 'No se pudo generar el PDF.';
      estadoImpresion(mensaje, 'error');
      return { ok: false, mensaje: mensaje };
    } catch (err) {
      const mensaje = 'Error al generar el PDF: ' + (err && err.message ? err.message : err);
      estadoImpresion(mensaje, 'error');
      return { ok: false, mensaje: mensaje };
    } finally {
      impresionEnCurso = false;
      bloquearBotonesImpresion(false);
    }
  }

  // Configuración recordada en este equipo: impresora, papel y copias.
  preferenciasImpresion = leerPreferenciasImpresion();

  // Botón "Imprimir ticket" del comprobante: abre el panel de impresión.
  window.imprimirRecibo = function() {
    return abrirOpcionesImpresion('');
  };

  // Tras cobrar: imprime directo con la configuración guardada. La primera vez
  // (o si el envío falla) se abre el panel para elegir impresora y papel.
  window.imprimirReciboDirecto = async function() {
    if (!preferenciasImpresion) {
      await abrirOpcionesImpresion('');
      return;
    }
    const resultado = await enviarComprobanteAImpresora(preferenciasImpresion);
    if (!resultado.ok) await abrirOpcionesImpresion(resultado.mensaje);
  };

  // --- Enlaces del comprobante y del panel de impresión ---
  const btnImprimirRecibo = porId('btnImprimirRecibo');
  if (btnImprimirRecibo) {
    btnImprimirRecibo.addEventListener('click', function() { abrirOpcionesImpresion(''); });
  }
  const btnPdfRecibo = porId('btnPdfRecibo');
  if (btnPdfRecibo) {
    btnPdfRecibo.addEventListener('click', function() {
      guardarComprobanteEnPDF(preferenciasImpresion || PREFERENCIAS_IMPRESION_BASE);
    });
  }
  const btnConfirmarImpresion = porId('btnConfirmarImpresion');
  if (btnConfirmarImpresion) {
    btnConfirmarImpresion.addEventListener('click', function() {
      enviarComprobanteAImpresora(leerOpcionesImpresionDelFormulario());
    });
  }
  const btnPdfDesdeModal = porId('btnPdfDesdeModal');
  if (btnPdfDesdeModal) {
    btnPdfDesdeModal.addEventListener('click', function() {
      guardarComprobanteEnPDF(leerOpcionesImpresionDelFormulario());
    });
  }
  const btnCancelarImpresion = porId('btnCancelarImpresion');
  if (btnCancelarImpresion) btnCancelarImpresion.addEventListener('click', ocultarModalImpresion);
  const btnCerrarModalImpresion = porId('btnCerrarModalImpresion');
  if (btnCerrarModalImpresion) btnCerrarModalImpresion.addEventListener('click', ocultarModalImpresion);
  const selPapelTicket = porId('selPapelTicket');
  if (selPapelTicket) selPapelTicket.addEventListener('change', actualizarResumenImpresion);
  const modalImprimirRecibo = porId('modalImprimirRecibo');
  if (modalImprimirRecibo) {
    document.addEventListener('keydown', function(e) {
      if (e.key === 'Escape' && !modalImprimirRecibo.hasAttribute('hidden')) {
        e.preventDefault();
        ocultarModalImpresion();
      }
    }, true);
  }

  function fechaLocalHoy() {
    const d = new Date();
    return d.getFullYear() + '-' + dos(d.getMonth() + 1) + '-' + dos(d.getDate());
  }

  window.cargarHistorial = async function() {
    if (api) {
      try {
        const lista = await api.listarVentasConDetalles();
        if (Array.isArray(lista)) historialVentas = lista;
      } catch (err) { console.warn('ventas:historial', err); }
    }
    renderHistorial();
    renderTablaCopia();
  };

  window.aplicarFiltrosHistorial = function() {
    renderHistorial();
  };

  // ===== Buscador inteligente del historial de ventas =====
  // Un solo campo busca en varias formas: número de factura, cliente (nombre o
  // código), producto vendido, forma de pago, monto y fecha. No distingue
  // mayúsculas, acentos ni el símbolo de la moneda.
  function normalizarBusqueda(texto) {
    return String(texto == null ? '' : texto)
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim();
  }

  function coincideVentaBusqueda(venta, consulta) {
    if (!consulta) return true;

    // --- Montos: acepta "50", "50.50", "C$50" o "$ 50" ---
    const soloNumero = consulta.replace(/[^0-9.]/g, '');
    if (soloNumero && /[0-9]/.test(soloNumero)) {
      const monto = Number(venta.total);
      if (Number.isFinite(monto)) {
        if (monto.toFixed(2) === Number(soloNumero).toFixed(2)) return true;
        if (String(monto).indexOf(soloNumero) !== -1) return true;
        if (String(Math.round(monto)).indexOf(soloNumero) !== -1) return true;
      }
    }

    // --- Fechas: "2026-09", "29/09", "29" con el día del mes ---
    if (/^[\d\-/]+$/.test(consulta)) {
      const fecha = String(venta.fecha || '');
      const partes = consulta.split(/[\-/]/);
      if (fecha.indexOf(consulta) !== -1) return true;
      if (partes.length === 2 && fecha.indexOf('-' + partes[0] + '-' + partes[1]) !== -1) return true;
      if (partes.length === 1 && partes[0].length === 2 && fecha.slice(8, 10) === partes[0]) return true;
    }

    // --- Texto libre sobre los campos visibles ---
    const campos = [
      venta.numero,
      venta.id,
      venta.cliente_nombre,
      venta.cliente_codigo,
      venta.tipo_pago,
      venta.fecha,
      venta.tipo_pago === 'credito' ? 'credito crédito credito' : 'contado efectivo'
    ];
    for (const campo of campos) {
      if (normalizarBusqueda(campo).indexOf(consulta) !== -1) return true;
    }

    // --- Productos vendidos en esa venta ---
    if (Array.isArray(venta.detalles)) {
      for (const detalle of venta.detalles) {
        if (normalizarBusqueda(detalle.nombre || detalle.descripcion || '').indexOf(consulta) !== -1) return true;
      }
    }
    return false;
  }

  function aplicarFiltrosHistorial() {
    renderHistorial();
  }

  function buscarEnHistorial() {
    const campo = porId('buscadorHistorial');
    if (!campo) return;
    filtrosHistorial.texto = normalizarBusqueda(campo.value);
    const botonLimpiar = porId('btnLimpiarBusqueda');
    if (botonLimpiar) botonLimpiar.hidden = !filtrosHistorial.texto;
    renderHistorial();
  }

  function limpiarBusquedaHistorial() {
    const campo = porId('buscadorHistorial');
    if (campo) {
      campo.value = '';
      campo.focus();
    }
    buscarEnHistorial();
  }

  // Conexiones del buscador (este código ya corre dentro de DOMContentLoaded).
  const campoBusqueda = porId('buscadorHistorial');
  if (campoBusqueda) {
    campoBusqueda.addEventListener('input', buscarEnHistorial);
    // Escape limpia la búsqueda.
    campoBusqueda.addEventListener('keydown', function(e) {
      if (e.key === 'Escape') {
        e.preventDefault();
        limpiarBusquedaHistorial();
      }
    });
  }
  const botonLimpiarBusqueda = porId('btnLimpiarBusqueda');
  if (botonLimpiarBusqueda) {
    botonLimpiarBusqueda.addEventListener('click', limpiarBusquedaHistorial);
  }

  // La tecla "/" enfoca el buscador cuando la pestaña de historial está visible.
  document.addEventListener('keydown', function(e) {
    if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey) return;
    const activo = document.activeElement;
    const escribiendo = activo && (activo.tagName === 'INPUT' || activo.tagName === 'TEXTAREA' || activo.tagName === 'SELECT');
    if (escribiendo) return;
    const panel = porId('pestanaHistorial');
    if (!panel || panel.hasAttribute('hidden')) return;
    e.preventDefault();
    if (campoBusqueda) campoBusqueda.focus();
  });

  function renderHistorial() {
    const tbody = porId('tablaHistorial');
    if (!tbody) return;
    const hoy = fechaLocalHoy();
    const limite7 = new Date();
    limite7.setDate(limite7.getDate() - 7);
    const lista = historialVentas.filter(function(v) {
      const f = String(v.fecha || '').slice(0, 10);
      let okFecha = true;
      if (filtrosHistorial.fecha === 'hoy') okFecha = f === hoy;
      else if (filtrosHistorial.fecha === 'semana') {
        const fd = new Date(String(v.fecha || '').replace(' ', 'T'));
        okFecha = !isNaN(fd) && fd >= limite7;
      }
      const okTipo = filtrosHistorial.tipo === 'todo' || v.tipo_pago === filtrosHistorial.tipo;
      // Búsqueda inteligente: factura, cliente, producto, monto, fecha o tipo.
      const okTexto = !filtrosHistorial.texto || coincideVentaBusqueda(v, filtrosHistorial.texto);
      return okFecha && okTipo && okTexto;
    });
    tbody.innerHTML = lista.map(function(v) {
      const fecha = String(v.fecha || '').replace('T', ' ').split(' ');
      return '<tr>' +
        '<td><span class="historial-folio">' + esc(String(v.numero || ('#' + v.id))) + '</span></td>' +
        '<td><span class="historial-fecha">' + esc(fecha[0] || '-') + '</span><span class="historial-hora">' + esc((fecha[1] || '').slice(0, 8)) + '</span></td>' +
        '<td class="historial-cliente">' +
          '<span class="tabla-avatar" aria-hidden="true">' + esc(clienteIniciales(v.cliente_nombre || 'Mostrador')) + '</span>' +
          '<span class="cliente-celda-datos">' +
            '<span class="cliente-nombre" title="' + esc(v.cliente_nombre || 'Mostrador') + '">' + esc(v.cliente_nombre || 'Mostrador') + '</span>' +
            '<small class="cliente-celda-sub">' + (v.cliente_codigo ? esc(v.cliente_codigo) : 'Cliente de mostrador') + '</small>' +
          '</span>' +
        '</td>' +
        '<td><span class="badge-tipo ' + esc(v.tipo_pago) + '">' + esc(v.tipo_pago === 'credito' ? 'Crédito' : v.tipo_pago === 'contado' ? 'Contado' : v.tipo_pago) + '</span></td>' +
        '<td class="num">' + fmt(v.total) + '</td>' +
        '<td><div class="historial-acciones">' +
          '<button type="button" class="btn-detalle btn-recibo" onclick="mostrarReciboDeVenta(' + Number(v.id) + ')">Ver recibo</button>' +
          '<button type="button" class="btn-detalle btn-factura-detalle" onclick="mostrarDetalleVentaDeHistorial(' + Number(v.id) + ')">Ver detalle</button>' +
        '</div></td>' +
      '</tr>';
    }).join('');
    const vacio = porId('sinVentas');
    if (vacio) {
      vacio.hidden = lista.length > 0;
      // El mensaje cambia según sea una búsqueda o el filtro de fecha/tipo.
      const texto = vacio.querySelector('span') || vacio;
      if (lista.length === 0) {
        texto.textContent = filtrosHistorial.texto
          ? 'Ninguna venta coincide con «' + (porId('buscadorHistorial') || {}).value + '».'
          : 'No hay ventas para los filtros seleccionados.';
      }
    }
    const resumen = porId('resumenHistorial');
    if (resumen) {
      const total = lista.reduce(function(s, v) { return s + Number(v.total || 0); }, 0);
      const contado = lista.filter(function(v) { return v.tipo_pago === 'contado'; }).reduce(function(s, v) { return s + Number(v.total || 0); }, 0);
      const credito = lista.filter(function(v) { return v.tipo_pago === 'credito'; }).reduce(function(s, v) { return s + Number(v.total || 0); }, 0);
      resumen.textContent = lista.length + ' venta(s) · Contado: ' + fmt(contado) + ' · Crédito: ' + fmt(credito) + ' · Total: ' + fmt(total);
    }
  }

  window.mostrarDetalleVentaDeHistorial = function(id) {
    const venta = historialVentas.find(function(v) { return Number(v.id) === Number(id); });
    const modal = porId('modalDetalleVenta');
    const contenido = porId('detalleVentaContenido');
    if (!venta || !modal || !contenido) return;

    const total = Number(venta.total) || 0;
    const subtotal = Number(venta.subtotal == null ? total : venta.subtotal) || 0;
    const descuento = Number(venta.descuento) || 0;
    const impuesto = Number(venta.impuesto) || 0;
    const esCredito = venta.tipo_pago === 'credito';
    const tieneFactura = Number(venta.factura_id) > 0;
    const saldo = tieneFactura ? Math.max(0, Number(venta.saldo_pendiente) || 0) : null;
    const pagado = esCredito && tieneFactura ? Math.max(0, total - saldo) : esCredito ? null : total;
    const fecha = String(venta.fecha || '').replace('T', ' ').split(' ');
    const productos = Array.isArray(venta.detalles) ? venta.detalles : [];
    const abonos = Array.isArray(venta.abonos) ? venta.abonos : [];
    const estadoPago = !esCredito ? 'Pagada' : !tieneFactura ? 'Saldo no disponible' : saldo <= 0.009 ? 'Liquidada' : 'Pendiente';
    const tipoPago = esCredito ? 'Crédito' : venta.tipo_pago === 'contado' ? 'Contado' : String(venta.tipo_pago || 'No especificado');
    const lineas = productos.map(function(detalle) {
      const cantidad = Number(detalle.cantidad) || 0;
      const precio = Number(detalle.precio) || 0;
      return '<tr>' +
        '<td><strong>' + esc(detalle.nombre || 'Producto') + '</strong>' +
          (detalle.codigo ? '<small class="detalle-venta-codigo">' + esc(detalle.codigo) + '</small>' : '') + '</td>' +
        '<td class="num">' + cantidad + '</td>' +
        '<td class="num">' + fmt(precio) + '</td>' +
        '<td class="num">' + fmt(detalle.subtotal == null ? cantidad * precio : detalle.subtotal) + '</td>' +
      '</tr>';
    }).join('');
    const filasAbonos = abonos.map(function(abono) {
      return '<tr><td>' + esc(abono.fecha || '-') + '</td><td>' + esc(abono.descripcion || 'Abono a factura') +
        '</td><td class="num">' + fmt(abono.monto) + '</td></tr>';
    }).join('');

    contenido.innerHTML =
      '<section class="detalle-venta-resumen">' +
        '<div><span>Factura</span><strong>' + esc(venta.numero || ('Venta #' + venta.id)) + '</strong></div>' +
        '<div><span>Fecha y hora</span><strong>' + esc(fecha[0] || '-') + (fecha[1] ? ' · ' + esc(fecha[1].slice(0, 8)) : '') + '</strong></div>' +
        '<div><span>Forma de pago</span><strong>' + esc(tipoPago) + '</strong></div>' +
        '<div><span>Estado</span><strong class="detalle-venta-estado ' + (estadoPago === 'Liquidada' || estadoPago === 'Pagada' ? 'pagada' : 'pendiente') + '">' + esc(estadoPago) + '</strong></div>' +
      '</section>' +
      '<section class="detalle-venta-seccion"><h4>Cliente</h4><div class="detalle-venta-cliente">' +
        '<strong>' + esc(venta.cliente_nombre || 'Mostrador') + '</strong>' +
        (venta.cliente_codigo ? '<span>Código: ' + esc(venta.cliente_codigo) + '</span>' : '<span>Venta de mostrador</span>') +
        (venta.cliente_telefono ? '<span>Teléfono: ' + esc(venta.cliente_telefono) + '</span>' : '') +
        (venta.cliente_correo ? '<span>Correo: ' + esc(venta.cliente_correo) + '</span>' : '') +
        (venta.cliente_direccion ? '<span>Dirección: ' + esc(venta.cliente_direccion) + '</span>' : '') +
      '</div></section>' +
      '<section class="detalle-venta-seccion"><h4>Productos (' + productos.length + ')</h4>' +
        '<div class="detalle-venta-tabla"><table><thead><tr><th>Producto</th><th class="num">Cant.</th><th class="num">Precio unit.</th><th class="num">Importe</th></tr></thead>' +
          '<tbody>' + (lineas || '<tr><td colspan="4">No hay productos registrados para esta venta.</td></tr>') + '</tbody></table></div>' +
      '</section>' +
      '<div class="detalle-venta-pie-grid">' +
        '<section class="detalle-venta-seccion detalle-venta-pagos"><h4>Pagos y saldo</h4>' +
          '<div class="detalle-venta-pago-fila"><span>Forma de pago</span><strong>' + esc(tipoPago) + '</strong></div>' +
          (esCredito
            ? (tieneFactura
              ? '<div class="detalle-venta-pago-fila"><span>Abonado</span><strong>' + fmt(pagado) + '</strong></div>' +
                '<div class="detalle-venta-pago-fila"><span>Saldo pendiente</span><strong>' + fmt(saldo) + '</strong></div>'
              : '<p class="detalle-venta-nota">Esta venta no tiene una factura vinculada; el saldo y los abonos no están disponibles.</p>')
            : '<div class="detalle-venta-pago-fila"><span>Recibido</span><strong>' + fmt(total) + '</strong></div>') +
          (esCredito && tieneFactura
            ? '<h5>Abonos registrados</h5>' + (filasAbonos
              ? '<div class="detalle-venta-tabla"><table><thead><tr><th>Fecha</th><th>Descripción</th><th class="num">Monto</th></tr></thead><tbody>' + filasAbonos + '</tbody></table></div>'
              : '<p class="detalle-venta-nota">Esta factura todavía no tiene abonos registrados.</p>')
            : '') +
        '</section>' +
        '<section class="detalle-venta-seccion detalle-venta-totales"><h4>Totales</h4>' +
          '<div class="detalle-venta-pago-fila"><span>Subtotal</span><strong>' + fmt(subtotal) + '</strong></div>' +
          (descuento > 0 ? '<div class="detalle-venta-pago-fila"><span>Descuento</span><strong>- ' + fmt(descuento) + '</strong></div>' : '') +
          (impuesto > 0 ? '<div class="detalle-venta-pago-fila"><span>Impuesto (' + (Number(venta.impuesto_pct) || 0) + '%)</span><strong>' + fmt(impuesto) + '</strong></div>' : '') +
          '<div class="detalle-venta-pago-fila detalle-venta-total"><span>Total factura</span><strong>' + fmt(total) + '</strong></div>' +
        '</section>' +
      '</div>';

    porId('detalleVentaTitulo').textContent = 'Detalle de factura ' + String(venta.numero || ('#' + venta.id));
    modal.hidden = false;
    const cerrar = porId('btnCerrarDetalleVenta');
    if (cerrar) cerrar.focus();
  };

  document.querySelectorAll('.filtro-grupo .filtro-boton').forEach(function(boton) {
    boton.addEventListener('click', function() {
      const grupo = boton.closest('.filtro-grupo');
      if (!grupo) return;
      grupo.querySelectorAll('.filtro-boton').forEach(function(b) { b.classList.toggle('activo', b === boton); });
      const valor = boton.getAttribute('data-valor');
      if (grupo.id === 'filtroFecha') filtrosHistorial.fecha = valor;
      if (grupo.id === 'filtroTipo') filtrosHistorial.tipo = valor;
      aplicarFiltrosHistorial();
    });
  });

  // Pestaña "Copiar venta"
  function renderTablaCopia() {
    const tbody = porId('tablaCopiaVentas');
    if (!tbody) return;
    tbody.innerHTML = historialVentas.map(function(v) {
      const articulos = Array.isArray(v.detalles) ? v.detalles.reduce(function(s, d) { return s + (Number(d.cantidad) || 0); }, 0) : 0;
      return '<tr>' +
        '<td><span class="historial-folio">' + esc(String(v.numero || ('#' + v.id))) + '</span></td>' +
        '<td>' + esc(v.fecha || '-') + '</td>' +
        '<td class="historial-cliente">' +
          '<span class="tabla-avatar" aria-hidden="true">' + esc(clienteIniciales(v.cliente_nombre || 'Mostrador')) + '</span>' +
          '<span class="historial-cliente-nombre">' + esc(etiquetaCliente({ codigo: v.cliente_codigo, nombre: v.cliente_nombre || 'Mostrador' })) + '</span>' +
        '</td>' +
        '<td><span class="badge-tipo ' + esc(v.tipo_pago) + '">' + esc(v.tipo_pago) + '</span></td>' +
        '<td class="num">' + articulos + '</td>' +
        '<td class="num">' + fmt(v.total) + '</td>' +
        '<td><button type="button" class="btn-detalle" onclick="copiarVenta(' + v.id + ')">Copiar</button></td>' +
      '</tr>';
    }).join('');
    const vacio = porId('sinVentasCopia');
    if (vacio) vacio.hidden = historialVentas.length > 0;
  }

  window.copiarVenta = function(id) {
    const v = historialVentas.find(function(x) { return Number(x.id) === Number(id); });
    if (!v || !Array.isArray(v.detalles)) return;
    carrito = v.detalles.map(function(d) {
      const p = productos.find(function(x) { return x.id === Number(d.producto_id); }) ||
        { id: Number(d.producto_id), nombre: d.nombre, precio: Number(d.precio), stock: 9999, categoria: '' };
      return { producto: p, cantidad: Number(d.cantidad) };
    });
    const pNueva = document.querySelector('.pestana[data-pestana="nueva"]');
    if (pNueva) pNueva.click();
    renderCarrito();
  };

  // ===== 7. CENTRAL DE ABONOS =====
  function referenciaAbono(a) {
    if (a.factura_numero) return a.factura_numero;
    if (a.factura_id) return '#' + a.factura_id;
    const referencias = String(a.descripcion || '').match(/Factura (FCT-\d+|#\d+)/g);
    return referencias ? referencias.map(function(r) { return r.replace('Factura ', ''); }).join(', ') : 'Sin referencia registrada';
  }

  async function cargarResumenAbonos() {
    if (!api || !porId('abonosPendiente')) return;
    try { if (!(await api.obtenerSesion())) return; } catch (err) { return; }
    try {
      const datos = await Promise.all([api.listarClientesConSaldo(), api.obtenerHistorialAbonos()]);
      const deudores = datos[0].filter(function(c) { return Number(c.saldoPendiente) > 0; });
      const historial = datos[1].slice().sort(function(a, b) { return String(b.fecha).localeCompare(String(a.fecha)) || Number(b.id) - Number(a.id); });
      const hoy = fechaLocalHoy();
      porId('abonosTotal').textContent = clientes.length + (clientes.length === 1 ? ' cliente' : ' clientes');
      porId('abonosPendiente').textContent = fmt(deudores.reduce(function(s, c) { return s + Number(c.saldoPendiente); }, 0));
      porId('abonosClientes').textContent = deudores.length + ' con saldo';
      const abonadoHoy = historial.filter(function(a) { return String(a.fecha).slice(0, 10) === hoy; }).reduce(function(s, a) { return s + Number(a.monto); }, 0);
      porId('abonosResumenEstado').textContent = historial.length
        ? 'Abonado hoy: ' + fmt(abonadoHoy) + ' · Último abono: ' + fmt(historial[0].monto) + ' · ' + historial[0].fecha
        : 'Aún no hay abonos registrados.';
    } catch (err) {
      ['abonosTotal', 'abonosPendiente', 'abonosClientes'].forEach(function(id) { porId(id).textContent = '—'; });
      porId('abonosResumenEstado').textContent = 'No se pudo actualizar el resumen de abonos.';
      console.warn('abonos:resumen', err);
    }
  }

  let filtroAbonosActual = 'todos'; // 'todos' | 'con-saldo'

  function renderTablaAbonos() {
    cargarResumenAbonos();
    const tbody = porId('tablaAbonos');
    if (!tbody) return;
    // Estado activo de las tarjetas de filtro (igual que en Clientes)
    const tabTodos = porId('tabAbonosTodos');
    if (tabTodos) {
      const activo = filtroAbonosActual === 'todos';
      tabTodos.classList.toggle('activo', activo);
      tabTodos.setAttribute('aria-pressed', activo ? 'true' : 'false');
    }
    const tabConSaldo = porId('tabAbonosConSaldo');
    if (tabConSaldo) {
      const activo = filtroAbonosActual === 'con-saldo';
      tabConSaldo.classList.toggle('activo', activo);
      tabConSaldo.setAttribute('aria-pressed', activo ? 'true' : 'false');
    }
    const buscador = porId('buscadorAbonos');
    const q = (buscador ? buscador.value : '').trim().toLowerCase();
    let lista = clientes;
    if (filtroAbonosActual === 'con-saldo') {
      lista = lista.filter(function(c) { return (Number(c.saldo) || 0) > 0.001; });
    }
    lista = lista.filter(function(c) { return !q || c.nombre.toLowerCase().indexOf(q) !== -1 || (c.codigo || '').toLowerCase().indexOf(q) !== -1; });
    tbody.innerHTML = lista.map(function(c) {
      const conSaldo = (Number(c.saldo) || 0) > 0.001;
      return '<tr>' +
        '<td><span class="producto-id">' + esc(c.codigo || ('#' + c.id)) + '</span></td>' +
        '<td><div class="producto-celda-nombre">' +
          '<span class="cliente-avatar-sm" aria-hidden="true">' + esc(clienteIniciales(c.nombre)) + '</span>' +
          '<span class="cliente-celda-datos">' +
            '<span class="cliente-nombre" title="' + esc(c.nombre) + '">' + esc(c.nombre) + '</span>' +
            '<small class="cliente-celda-sub">' + esc(c.codigo || '') + (c.codigo && c.direccion ? ' · ' : '') + (c.direccion ? esc(c.direccion) : '') + '</small>' +
          '</span>' +
        '</div></td>' +
        '<td>' + (c.telefono ? esc(c.telefono) : '<em class="sin-dato">Sin teléfono</em>') + '</td>' +
        '<td class="num">' + (conSaldo ? '<span class="cliente-saldo con-saldo">' + fmt(c.saldo) + '</span>' : '<em class="sin-dato">Sin saldo</em>') + '</td>' +
        '<td>' + (c.limite > 0 ? 'Límite ' + fmt(c.limite) : 'Sin límite') + '</td>' +
        '<td>' + (conSaldo
          ? '<button type="button" class="btn-abonar-sm" onclick="abrirModalAbono(' + c.id + ')">Abonar</button>'
          : '<button type="button" class="btn-abonar-sm" disabled title="Sin saldo pendiente">Abonar</button>') + '</td>' +
      '</tr>';
    }).join('');
    const contadorAbonos = porId('contadorAbonos');
    if (contadorAbonos) contadorAbonos.textContent = lista.length + (lista.length === 1 ? ' cliente' : ' clientes');
    const vacio = porId('vacioAbonos');
    if (vacio) {
      vacio.textContent = filtroAbonosActual === 'con-saldo' ? 'No hay clientes con saldo pendiente.' : 'No hay clientes registrados aún.';
      vacio.hidden = lista.length > 0;
    }
  }

    const buscadorAbonos = porId('buscadorAbonos');
  if (buscadorAbonos) buscadorAbonos.addEventListener('input', renderTablaAbonos);
  // Tarjetas de filtro de la cabecera (misma mecánica que el módulo de Clientes)
  const tabAbonosTodos = porId('tabAbonosTodos');
  if (tabAbonosTodos) {
    tabAbonosTodos.addEventListener('click', function() {
      filtroAbonosActual = 'todos';
      renderTablaAbonos();
    });
  }
  const tabAbonosConSaldo = porId('tabAbonosConSaldo');
  if (tabAbonosConSaldo) {
    tabAbonosConSaldo.addEventListener('click', function() {
      filtroAbonosActual = (filtroAbonosActual === 'con-saldo') ? 'todos' : 'con-saldo';
      renderTablaAbonos();
    });
  }

  // ===== WHATSAPP =====
  let configWhatsappActual = null;

  function actualizarSelectClientesWhatsapp() {
    var sel = porId('selectClienteWhatsapp');
    if (!sel) return;
    var prev = sel.value;
    sel.innerHTML = '<option value="">Selecciona un cliente...</option>' +
      clientes.map(function(c) {
        return '<option value="' + c.id + '">' + esc(etiquetaCliente(c)) + (c.telefono ? ' (' + esc(c.telefono) + ')' : '') + '</option>';
      }).join('');
    if (prev && sel.querySelector('option[value="' + prev + '"]')) sel.value = prev;
  }

  function actualizarSelectVentasWhatsapp() {
    var sel = porId('selectVentaWhatsapp');
    if (!sel) return;
    var prev = sel.value;
    if (historialVentas.length === 0) {
      sel.innerHTML = '<option value="">No hay ventas registradas</option>';
      return;
    }
    sel.innerHTML = '<option value="">Selecciona una venta...</option>' +
      historialVentas.map(function(v) {
        var cliente = etiquetaCliente({ codigo: v.cliente_codigo, nombre: v.cliente_nombre || 'Mostrador' });
        return '<option value="' + v.id + '">' + esc(String(v.numero || ('#' + v.id))) + ' ' + esc(cliente) + ' | ' + fmt(v.total) + '</option>';
      }).join('');
    if (prev && sel.querySelector('option[value="' + prev + '"]')) sel.value = prev;
  }

  function tipoWhatsappActivo() {
    var tab = document.querySelector('.tab-whatsapp.activo');
    return tab ? (tab.getAttribute('data-tipo') || 'ticket') : 'ticket';
  }

  function actualizarCamposWhatsapp() {
    var tipo = tipoWhatsappActivo();
    var cw = porId('campoVentaWrap');
    var cc = porId('campoClienteWrap');
    var cm = porId('campoMensajeLibreWrap');
    if (cw) cw.hidden = tipo !== 'ticket';
    if (cc) cc.hidden = tipo !== 'recordatorio';
    if (cm) cm.hidden = tipo !== 'libre';
    actualizarPreviewWhatsapp();
  }
    function actualizarPreviewWhatsapp() {
    var preview = porId('whatsappPreview');
    if (!preview) return;
    var tipo = tipoWhatsappActivo();
    var config = configWhatsappActual;
    var moneda = (config && config.moneda) || 'C$';
    var companyName = (config && config.companyName) || 'SmartPosPro';
    var mensajeCierre = (config && config.mensajeCierre) || '¿En qué más puedo ayudar?';
    var linea = '━'.repeat(18);
    var msj = '';

    if (tipo === 'ticket') {
      var ventaId = parseInt((porId('selectVentaWhatsapp').value || ''), 10);
      var venta = historialVentas.find(function(v) { return Number(v.id) === ventaId; });
      if (venta) {
        msj += '*' + companyName + '*\n' + linea + '\n*Ticket de Venta ' + (venta.numero || ('#' + venta.id)) + '*\n🌟 ¡Gracias por su compra!\n\n';
        var detalles = venta.detalles || [];
        detalles.forEach(function(d) {
          msj += '▸ ' + d.cantidad + 'x ' + d.nombre + '\n   ' + moneda + Number(d.precio).toFixed(2) + ' c/u\n\n';
        });
        msj += linea + '\nSubtotal: ' + moneda + Number(venta.subtotal != null ? venta.subtotal : venta.total).toFixed(2) + '\n';
        if (Number(venta.descuento) > 0) msj += 'Descuento: -' + moneda + Number(venta.descuento).toFixed(2) + '\n';
        if (Number(venta.impuesto) > 0) msj += 'Impuesto (' + (Number(venta.impuesto_pct) || 0) + '%): ' + moneda + Number(venta.impuesto).toFixed(2) + '\n';
        msj += 'Total: *' + moneda + Number(venta.total).toFixed(2) + '*\n\nFecha: ' + venta.fecha + '\n';
        if (venta.cliente_nombre) msj += 'Cliente: ' + etiquetaCliente({ codigo: venta.cliente_codigo, nombre: venta.cliente_nombre }) + '\n';
        msj += '\n' + mensajeCierre;
      } else {
        msj = 'Selecciona una venta para ver la vista previa del ticket.';
      }
    } else if (tipo === 'recordatorio') {
      var cId = parseInt((porId('selectClienteWhatsapp').value || ''), 10);
      var cli = clientes.find(function(c) { return c.id === cId; });
      if (cli) {
        msj += '*' + companyName + '*\n' + linea + '\n*Recordatorio de Pago*\n\n';
        msj += 'Estimado/a ' + cli.nombre + ':\n\nSu saldo pendiente es de *' + moneda + cli.saldo.toFixed(2) + '*\n';
        msj += 'Por favor realice el pago a la brevedad.\n\n🌟 ¡Gracias por su confianza!\n\n' + mensajeCierre;
      } else {
        msj = 'Selecciona un cliente para ver la vista previa del recordatorio.';
      }
    } else if (tipo === 'catalogo') {
      if (productos.length === 0) {
        msj = 'No hay productos para enviar.';
      } else {
        msj += '*' + companyName + ' - Nuestro Catálogo*\n\n';
        productos.slice(0, 10).forEach(function(p) {
          msj += '▸ *' + p.nombre + '*\n  ' + moneda + Number(p.precio).toFixed(2) + ' | Stock: ' + p.stock + '\n\n';
        });
        msj += '\n' + mensajeCierre;
      }
    } else if (tipo === 'libre') {
      var campoLibre = porId('campoMensajeLibre');
      msj = campoLibre ? (campoLibre.value || 'Escribe tu mensaje aquí...') : 'Escribe tu mensaje aquí...';
    }
    preview.textContent = msj;
  }
    function renderEstadoWhatsapp(config) {
    var estado = porId('whatsappEstadoConexion');
    if (!estado) return;
    if (!config) {
      estado.innerHTML = '<p style="color:var(--texto-suave);font-size:12.5px">Cargando configuración...</p>';
      return;
    }
    var habilitado = !!config.habilitado;
    var simulacion = config.modoSimulacion !== false;
    var tieneToken = !!(config.token && String(config.token).trim());
    var tieneNumero = !!(config.numero && String(config.numero).trim());
    var clase = 'estado-pendiente';
    var label = 'No configurado';
    if (habilitado && simulacion) { clase = 'estado-ok'; label = 'Simulación activa'; }
    else if (habilitado && !simulacion && tieneToken && tieneNumero) { clase = 'estado-ok'; label = 'Conectado (producción)'; }
    else if (habilitado) { clase = 'estado-alerta'; label = 'Habilitado (faltan datos)'; }
    else { clase = 'estado-pendiente'; label = 'Deshabilitado'; }
    var dato = function(et, val) {
      return '<div class="config-dato"><small>' + esc(et) + '</small><strong>' + esc(val) + '</strong></div>';
    };
    estado.innerHTML =
      '<div class="whatsapp-estado-badge">' +
        '<span class="estado-badge ' + clase + '">' + esc(label) + '</span>' +
      '</div>' +
      dato('Phone Number ID', tieneNumero ? 'Configurado' : 'No configurado') +
      dato('Token', tieneToken ? 'Configurado' : 'No configurado') +
      dato('Modo', simulacion ? 'Simulación' : 'Producción') +
      dato('Empresa', config.companyName || 'SmartPosPro');
  }

  function renderHistorialWhatsapp(historial) {
    var tbody = porId('tablaWhatsappHistorial');
    var sinDatos = porId('sinWhatsappHistorial');
    var contador = porId('contadorWhatsappHistorial');
    if (!tbody) return;
    if (!historial || historial.length === 0) {
      tbody.innerHTML = '';
      if (sinDatos) sinDatos.hidden = false;
      if (contador) contador.textContent = '';
      return;
    }
    if (sinDatos) sinDatos.hidden = true;
    if (contador) contador.textContent = historial.length + ' envío(s)';
    var tiposLabels = { ticket: 'Ticket', recordatorio: 'Recordatorio', catalogo: 'Catálogo', mensaje_libre: 'Mensaje libre' };
    var resultadoLabels = { enviado: 'Enviado', simulado: 'Simulado', error: 'Error', pendiente: 'Pendiente' };
    tbody.innerHTML = historial.map(function(h) {
      var badge = 'estado-pendiente';
      if (h.resultado === 'enviado' || h.resultado === 'simulado') badge = 'estado-ok';
      else if (h.resultado === 'error') badge = 'estado-error';
      return '<tr>' +
        '<td>' + esc(h.creado || '-') + '</td>' +
        '<td>' + esc(tiposLabels[h.tipo] || h.tipo) + '</td>' +
        '<td>' + esc(h.destinatario || '-') + '</td>' +
        '<td><span class="estado-badge ' + badge + '">' + esc(resultadoLabels[h.resultado] || h.resultado) + '</span></td>' +
        '</tr>';
    }).join('');
  }

  function renderEstadisticasWhatsapp(stats) {
    var t = porId('whatsappTotalEnvios');
    var e = porId('whatsappExitosos');
    var f = porId('whatsappFallidos');
    var h = porId('whatsappHoy');
    if (t) t.textContent = String((stats && stats.total_envios) || 0);
    if (e) e.textContent = String((stats && stats.enviados_exitosamente) || 0);
    if (f) f.textContent = String((stats && stats.fallidos) || 0);
    if (h) h.textContent = String((stats && stats.envios_hoy) || 0);
  }

  function mostrarResultadoWhatsapp(ok, mensaje) {
    var r = porId('whatsappResultado');
    if (!r) return;
    r.textContent = mensaje;
    r.hidden = false;
    r.style.color = ok ? 'var(--exito)' : 'var(--peligro)';
    setTimeout(function() { if (r) r.hidden = true; }, 5000);
  }

  async function cargarConfigWhatsapp() {
    if (!api) return null;
    try { return await api.obtenerWhatsappConfig(); }
    catch (err) { console.warn('whatsapp:config', err); return null; }
  }

  async function cargarHistorialWhatsapp() {
    if (!api) return;
    try { renderHistorialWhatsapp(await api.obtenerWhatsappHistorial(50)); }
    catch (err) { console.warn('whatsapp:historial', err); }
  }

  async function cargarEstadisticasWhatsapp() {
    if (!api) return;
    try { renderEstadisticasWhatsapp(await api.obtenerWhatsappEstadisticas()); }
    catch (err) { console.warn('whatsapp:estadisticas', err); }
  }

  async function initWhatsapp() {
    configWhatsappActual = await cargarConfigWhatsapp();
    renderEstadoWhatsapp(configWhatsappActual);
    actualizarDestinoEfectivo();
    cargarHistorialWhatsapp();
    cargarEstadisticasWhatsapp();
    actualizarCamposWhatsapp();
  }
  // WhatsApp: tab switching
  document.querySelectorAll('.tab-whatsapp').forEach(function(tab) {
    tab.addEventListener('click', function() {
      document.querySelectorAll('.tab-whatsapp').forEach(function(t) { t.classList.remove('activo'); });
      tab.classList.add('activo');
      actualizarCamposWhatsapp();
    });
  });

  // WhatsApp: preview updates on input change
  var swv = porId('selectVentaWhatsapp');
  if (swv) swv.addEventListener('change', actualizarPreviewWhatsapp);
  var scw = porId('selectClienteWhatsapp');
  if (scw) scw.addEventListener('change', actualizarPreviewWhatsapp);
  // Muestra el número internacional real que se enviará (agrega el código de país configurado).
  // Replica la lógica del backend (normalizarTelefonoWhatsApp) para que el usuario vea el destino final.
  function normalizarDestinoWhatsapp(valor, pais) {
    var paisDefecto = String(pais || '505').replace(/\D/g, '');
    var n = String(valor || '').replace(/\D/g, '');
    if (!n) return '';
    if (n.indexOf('00') === 0) n = n.slice(2);
    if (paisDefecto && n.indexOf(paisDefecto) === 0 && n.length > paisDefecto.length + 6) return n;
    if (n.length >= 11) return n;
    return paisDefecto + n;
  }
  function actualizarDestinoEfectivo() {
    var el = porId('waDestinoEfectivo');
    if (!el) return;
    var campo = porId('campoNumeroWhatsapp');
    if (!campo) return;
    var config = configWhatsappActual;
    var pais = String((config && config.pais) || '505').replace(/\D/g, '') || '505';
    var destino = normalizarDestinoWhatsapp(campo.value, pais);
    if (!destino) { el.textContent = ''; return; }
    el.textContent = 'Se enviará a ' + destino + '  ·  código de país ' + pais;
  }
  var cnw = porId('campoNumeroWhatsapp');
  if (cnw) {
    cnw.addEventListener('input', actualizarPreviewWhatsapp);
    cnw.addEventListener('input', actualizarDestinoEfectivo);
  }
  var cmlw = porId('campoMensajeLibre');
  if (cmlw) cmlw.addEventListener('input', actualizarPreviewWhatsapp);

  // WhatsApp: probar conexión
  var btnTestConn = porId('btnTestConexion');
  if (btnTestConn) {
    btnTestConn.addEventListener('click', async function() {
      if (!api) { mostrarResultadoWhatsapp(false, 'WhatsApp no disponible'); return; }
      try {
        var res = await api.testWhatsappConexion();
        mostrarResultadoWhatsapp(res.ok, res.mensaje || (res.ok ? 'Conexión OK' : 'Error de conexión'));
      } catch (err) {
        mostrarResultadoWhatsapp(false, 'Error: ' + (err && err.message ? err.message : err));
      }
    });
  }

  // WhatsApp: enviar mensaje
  var btnEnvW = porId('btnEnviarWhatsapp');
  if (btnEnvW) {
    btnEnvW.addEventListener('click', async function() {
      if (!api) { mostrarResultadoWhatsapp(false, 'WhatsApp no disponible'); return; }
      var tipo = tipoWhatsappActivo();
      var numero = (porId('campoNumeroWhatsapp').value || '').trim();
      if (!numero) { mostrarResultadoWhatsapp(false, 'Ingresa un número de WhatsApp'); return; }
      var res = { ok: false, resultado: 'Error desconocido' };
      if (tipo === 'ticket') {
        var vid = parseInt((porId('selectVentaWhatsapp').value || ''), 10);
        if (!vid || isNaN(vid)) { mostrarResultadoWhatsapp(false, 'Selecciona una venta'); return; }
        res = await api.enviarWhatsappTicket(vid, numero);
      } else if (tipo === 'recordatorio') {
        var cid = parseInt((porId('selectClienteWhatsapp').value || ''), 10);
        if (!cid || isNaN(cid)) { mostrarResultadoWhatsapp(false, 'Selecciona un cliente'); return; }
        res = await api.enviarWhatsappRecordatorio(cid, numero);
      } else if (tipo === 'catalogo') {
        res = await api.enviarWhatsappCatalogo(numero);
      } else if (tipo === 'libre') {
        var msg = porId('campoMensajeLibre').value || '';
        if (!msg.trim()) { mostrarResultadoWhatsapp(false, 'Escribe un mensaje'); return; }
        res = await api.enviarWhatsappMensajeLibre(numero, msg);
      }
      mostrarResultadoWhatsapp(res.ok, res.resultado || (res.ok ? 'Enviado' : 'Error'));
      cargarEstadisticasWhatsapp();
      cargarHistorialWhatsapp();
    });
  }
  // WhatsApp: configuración modal
  var btnCfgW = porId('btnConfigWhatsapp');
  var modalCfgW = porId('modalWhatsappConfig');
  var formCfgW = porId('formWhatsappConfig');
  var btnCancelCfgW = porId('btnCancelarWhatsappConfig');
  var resCfgW = porId('whatsappConfigResultado');

  function cargarFormularioConfigWhatsapp(config) {
    if (!config) return;
    porId('waNumero').value = config.numero || '';
    porId('waPais').value = config.pais || '505';
    // Si el token guardado no parece un Access Token válido, NO se copia al campo
    // (así se evita volver a guardar texto pegado por error) y se avisa al usuario.
    var tokenGuardado = (config.token || '').trim();
    var tokenPareceValido = tokenGuardado.length >= 60 && tokenGuardado.indexOf('EAA') === 0 && !/\s/.test(tokenGuardado);
    porId('waToken').value = tokenPareceValido ? tokenGuardado : '';
    if (resCfgW) {
      if (tokenGuardado && !tokenPareceValido) {
        resCfgW.textContent = 'El token guardado no es válido (parece un comando o texto pegado). Pega aquí el Access Token que empieza con EAA.';
        resCfgW.hidden = false;
        resCfgW.style.color = 'var(--peligro)';
      } else {
        resCfgW.hidden = true;
      }
    }
    porId('waCompanyName').value = config.companyName || '';
    porId('waMoneda').value = config.moneda || 'C$';
    porId('waMensajeBienvenida').value = config.mensajeBienvenida || '';
    porId('waMensajeCierre').value = config.mensajeCierre || '';
    porId('waHabilitado').checked = !!config.habilitado;
    porId('waModoSimulacion').checked = config.modoSimulacion !== false && config.modoSimulacion !== undefined && config.modoSimulacion !== null;
  }

  function mostrarResultadoConfigWhatsapp(ok, mensaje) {
    if (!resCfgW) return;
    resCfgW.textContent = mensaje;
    resCfgW.hidden = false;
    resCfgW.style.color = ok ? 'var(--exito)' : 'var(--peligro)';
    setTimeout(function() { if (resCfgW) resCfgW.hidden = true; }, 5000);
  }

  if (btnCfgW && modalCfgW) {
    btnCfgW.addEventListener('click', async function() {
      var config = await cargarConfigWhatsapp();
      if (config) {
        configWhatsappActual = config;
        cargarFormularioConfigWhatsapp(config);
        renderEstadoWhatsapp(config);
      }
      modalCfgW.removeAttribute('hidden');
    });
    modalCfgW.addEventListener('click', function(e) {
      if (e.target === modalCfgW) modalCfgW.setAttribute('hidden', 'true');
    });
  }

  if (btnCancelCfgW && modalCfgW) {
    btnCancelCfgW.addEventListener('click', function() {
      modalCfgW.setAttribute('hidden', 'true');
    });
  }

  if (formCfgW) {
    formCfgW.addEventListener('submit', async function(e) {
      e.preventDefault();
      if (!api) { mostrarResultadoConfigWhatsapp(false, 'WhatsApp no disponible'); return; }
      var tokenIngresado = (porId('waToken').value || '').trim();
      var datos = {
        habilitado: porId('waHabilitado').checked ? 'true' : 'false',
        numero: (porId('waNumero').value || '').trim(),
        pais: (porId('waPais').value || '505').replace(/\D/g, ''),
        token: tokenIngresado,
        modoSimulacion: porId('waModoSimulacion').checked ? 'true' : 'false',
        mensajeBienvenida: porId('waMensajeBienvenida').value || '',
        mensajeCierre: porId('waMensajeCierre').value || '',
        companyName: (porId('waCompanyName').value || '').trim(),
        moneda: (porId('waMoneda').value || 'C$').trim()
      };
      // Validación previa: evita guardar comandos curl o texto con espacios en el campo Token
      if (tokenIngresado) {
        if (/\s/.test(tokenIngresado) || tokenIngresado.indexOf('EAA') !== 0) {
          mostrarResultadoConfigWhatsapp(false, 'Token inválido: pega solo el Access Token (empieza con EAA, sin espacios ni la palabra Bearer).');
          return;
        }
      }
      try {
        var guardado = await api.guardarWhatsappConfig(datos);
        if (guardado && guardado.ok === false) {
          mostrarResultadoConfigWhatsapp(false, guardado.error || 'No se pudo guardar la configuración');
          return;
        }
        if (guardado && guardado.advertencia) {
          mostrarResultadoConfigWhatsapp(false, guardado.advertencia);
        } else {
          mostrarResultadoConfigWhatsapp(true, 'Configuración guardada correctamente');
        }
        modalCfgW.setAttribute('hidden', 'true');
        configWhatsappActual = await cargarConfigWhatsapp();
        renderEstadoWhatsapp(configWhatsappActual);
        actualizarDestinoEfectivo();
      } catch (err) {
        mostrarResultadoConfigWhatsapp(false, 'Error: ' + (err && err.message ? err.message : err));
      }
    });
  }

  // WhatsApp: botones rápidos del encabezado
  var btnTik = porId('btnEnviarTicket');
  if (btnTik) {
    btnTik.addEventListener('click', function() {
      document.querySelectorAll('.tab-whatsapp').forEach(function(t) { t.classList.remove('activo'); });
      var t = document.querySelector('.tab-whatsapp[data-tipo="ticket"]');
      if (t) t.classList.add('activo');
      actualizarCamposWhatsapp();
    });
  }

  var btnRec = porId('btnEnviarRecordatorio');
  if (btnRec) {
    btnRec.addEventListener('click', function() {
      document.querySelectorAll('.tab-whatsapp').forEach(function(t) { t.classList.remove('activo'); });
      var r = document.querySelector('.tab-whatsapp[data-tipo="recordatorio"]');
      if (r) r.classList.add('activo');
      actualizarCamposWhatsapp();
    });
  }

  // ===== 8. BÚSQUEDAS Y CARGA INICIAL =====
  const buscadorClientes = porId('buscadorClientes') || porId('buscador');
  if (buscadorClientes) buscadorClientes.addEventListener('input', renderTablaClientes);
  const buscadorProductos = porId('buscadorProductos');
  if (buscadorProductos) {
    buscadorProductos.placeholder = 'Buscar producto por nombre, código, categoría o código de barras...';
    buscadorProductos.addEventListener('input', renderTablaProductos);
  }

  async function cargarDatosIniciales() {
    // Antes del login/licencia el proceso principal rechaza las consultas: se esperan a la recarga posterior al acceso.
    let hayAcceso = false;
    if (api) { try { hayAcceso = !!(await api.obtenerSesion()); } catch (err) { hayAcceso = false; } }
    if (api && hayAcceso) {
      try {
        const configBase = await api.obtenerConfiguracion();
        if (configBase && configBase.moneda) moneda = String(configBase.moneda).trim() || 'C$';
        if (configBase) impuestoPctVenta = Number(configBase.impuesto) > 0 ? Number(configBase.impuesto) : 0;
      } catch (err) { console.warn('configuracion:obtener', err); }
      try {
        const listaClientes = await api.listarClientes();
        if (Array.isArray(listaClientes)) listaClientes.forEach(function(c) { clientes.push(normalizarCliente(c)); });
      } catch (err) { console.warn('clientes:listar', err); }
      try {
        const listaProductos = await api.listarProductos();
        if (Array.isArray(listaProductos)) {
          listaProductos.forEach(function(p) {
            productos.push({ id: Number(p.id), codigo: p.codigo || ('PRD-' + String(p.id).padStart(5, '0')), codigoBarras: (p.codigoBarras || p.codigo_barras || '').trim(), nombre: p.nombre, precio: Number(p.precio), stock: Number(p.stock), categoria: p.categoria || '' });
          });
        }
      } catch (err) { console.warn('productos:listar', err); }
      try {
        const listaVentas = await api.listarVentasConDetalles();
        if (Array.isArray(listaVentas)) historialVentas = listaVentas;
      } catch (err) { console.warn('ventas:historial', err); }
    }
        actualizarSelectClientes();
    actualizarSelectClientesWhatsapp();
    actualizarSelectVentasWhatsapp();
    renderTablaClientes();
    renderTablaProductos();
    renderGridProductosVentas();
    renderCarrito();
    renderTablaAbonos();
    renderHistorial();
    renderTablaCopia();
    if (hayAcceso) await cargarResumen();
  }

  cargarDatosIniciales();
});
