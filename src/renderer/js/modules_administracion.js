// Módulos administrativos conectados a la base de datos:
// Empleados, Planilla, Viáticos, Ingresos y Egresos.
// Requiere la API expuesta en window.api (src/preload/preload.js).

const CATEGORIAS_INGRESO = ['Fletes / Transporte', 'Venta de servicios', 'Alquiler de equipo', 'Otros ingresos'];
const CATEGORIAS_EGRESO = ['Combustible', 'Mantenimiento', 'Repuestos', 'Planilla', 'Viáticos', 'Comisiones', 'Peajes', 'Servicios básicos', 'Impuestos', 'Otros gastos'];
const METODOS_PAGO = ['Efectivo', 'Transferencia', 'Cheque', 'Tarjeta'];

function aFormatoIso(fecha) {
  const p = n => String(n).padStart(2, '0');
  return `${fecha.getFullYear()}-${p(fecha.getMonth() + 1)}-${p(fecha.getDate())}`;
}

function fechaHoy() {
  return aFormatoIso(new Date());
}

function fechaHaceDias(dias) {
  return aFormatoIso(new Date(Date.now() - dias * 86400000));
}

// Último día del mes en curso: las planillas suelen pagarse al cierre del período.
function ultimoDiaDelMesActual() {
  const hoy = new Date();
  return aFormatoIso(new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0));
}

function esc(texto) {
  return String(texto === undefined || texto === null ? '' : texto)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function opcionesHtml(lista, seleccionado) {
  return lista.map(x => `<option value="${esc(x)}" ${String(x) === String(seleccionado) ? 'selected' : ''}>${esc(x)}</option>`).join('');
}

function listaDatalist(id, valores) {
  return `<datalist id="${id}">${valores.map(v => `<option value="${esc(v)}"></option>`).join('')}</datalist>`;
}

function indicadorCantidad(valor) {
  return new Intl.NumberFormat('es-NI').format(valor || 0);
}

function vacio(mensaje) {
  return `<div class="empty">${mensaje}</div>`;
}

async function obtenerCategorias(tipo, base) {
  try {
    const guardadas = await window.api.finanzas.categorias(tipo);
    return [...new Set([...guardadas, ...base])];
  } catch (err) {
    return base;
  }
}

// ---------------------------------------------------------------- ingresos y egresos

async function renderIngresos() {
  await renderMovimientoFinanciero({
    titulo: 'Ingresos',
    descripcion: 'Registro de ingresos, categorías, clientes, referencias y formas de cobro.',
    etiqueta: 'Ingreso',
    etiquetaTercero: 'Cliente',
    api: window.api.ingresos,
    tipo: 'ingresos',
    categorias: CATEGORIAS_INGRESO,
    conCliente: true
  });
}

async function renderEgresos() {
  await renderMovimientoFinanciero({
    titulo: 'Egresos / Gastos',
    descripcion: 'Control de gastos, categorías, beneficiarios, referencias y formas de pago.',
    etiqueta: 'Egreso',
    etiquetaTercero: 'Beneficiario',
    api: window.api.egresos,
    tipo: 'egresos',
    categorias: CATEGORIAS_EGRESO,
    conCliente: false
  });
}

async function renderMovimientoFinanciero(cfg) {
  content.innerHTML = `
    <div class="page-intro page-head">
      <div>
        <h2>${cfg.titulo}</h2>
        <p>${cfg.descripcion}</p>
      </div>
      <div class="page-actions">
        <button id="btnAgregarFilaMov" class="btn" type="button">+ Agregar en tabla</button>
        <button id="btnNuevoMovimiento" class="btn primary">+ Registrar ${cfg.etiqueta}</button>
      </div>
    </div>

    <div class="metrics-grid" style="margin-bottom:18px;">
      <div class="card"><div class="card-label">Total del período</div><div id="finTotal" class="card-value">-</div></div>
      <div class="card"><div class="card-label">Registros</div><div id="finCantidad" class="card-value">0</div></div>
      <div class="card"><div class="card-label">Promedio por registro</div><div id="finPromedio" class="card-value">-</div></div>
      <div class="card"><div class="card-label">Categoría principal</div><div id="finCategoria" class="card-value" style="font-size:16px;">-</div></div>
    </div>

    <div class="panel">
      <div class="toolbar">
        <div class="field"><label>Desde</label><input id="finDesde" type="date" value="${fechaHaceDias(30)}"></div>
        <div class="field"><label>Hasta</label><input id="finHasta" type="date" value="${fechaHoy()}"></div>
        <div class="field"><label>Categoría</label><select id="finFiltroCategoria"><option value="">Todas las categorías</option></select></div>
        <div class="field"><label>Buscar</label><input id="finBuscar" type="text" placeholder="Concepto, referencia, ${cfg.etiquetaTercero.toLowerCase()}..."></div>
        <button id="btnFiltrarFin" class="btn primary">Buscar</button>
        <button id="btnLimpiarFin" class="btn">Limpiar</button>
        <button id="btnImprimirFin" class="btn btn-imprimir-auto" type="button">🖨️ Imprimir PDF</button>
      </div>
      <div id="tablaFinanciera" class="table-wrap">${vacio('Cargando registros...')}</div>
    </div>

    <div id="modalMovimientoContainer"></div>
  `;

  const clientes = cfg.conCliente ? await window.api.clientes.listar({ soloActivos: true }) : [];
  const categorias = await obtenerCategorias(cfg.tipo, cfg.categorias);
  let filaNuevaMovimientoActiva = false;
  const selectFiltro = document.getElementById('finFiltroCategoria');
  categorias.forEach(c => {
    const opt = document.createElement('option');
    opt.value = c;
    opt.textContent = c;
    selectFiltro.appendChild(opt);
  });

  const filtros = () => ({
    desde: document.getElementById('finDesde').value,
    hasta: document.getElementById('finHasta').value,
    categoria: document.getElementById('finFiltroCategoria').value,
    busqueda: document.getElementById('finBuscar').value.trim()
  });
  async function cargarLista() {
    const datos = await cfg.api.listar(filtros());
    const cont = document.getElementById('tablaFinanciera');
    const tercero = cfg.conCliente
      ? d => esc(d.cliente_nombre || 'Sin cliente')
      : d => esc(d.beneficiario || '-');
    cont.innerHTML = `
      <table>
        <thead>
          <tr>
            <th>Fecha</th>
            <th>Concepto</th>
            <th>Categoría</th>
            <th>${cfg.etiquetaTercero}</th>
            <th>Método</th>
            <th style="text-align:right">Monto</th>
            <th style="text-align:right">Acciones</th>
          </tr>
        </thead>
        <tbody>
          ${filaNuevaMovimientoActiva ? `
            <tr class="bitacora-inline-row">
              <td><input class="bitacora-inline-control" data-campo="fecha" aria-label="Fecha" type="date" required value="${fechaHoy()}"></td>
              <td>
                <input class="bitacora-inline-control bitacora-inline-wide" data-campo="concepto" aria-label="Concepto" type="text" required placeholder="Concepto">
                <input class="bitacora-inline-control bitacora-inline-wide" data-campo="referencia" aria-label="Referencia" type="text" placeholder="Referencia">
                <input class="bitacora-inline-control bitacora-inline-wide" data-campo="observacion" aria-label="Observación" type="text" placeholder="Observación">
              </td>
              <td>
                <input class="bitacora-inline-control bitacora-inline-wide" data-campo="categoria" aria-label="Categoría" type="text" list="categoriasInlineMov" placeholder="Categoría">
                <datalist id="categoriasInlineMov">${categorias.map(c => `<option value="${esc(c)}"></option>`).join('')}</datalist>
              </td>
              <td>${cfg.conCliente
                ? `<select class="bitacora-inline-control" data-campo="cliente" aria-label="Cliente"><option value="">Sin cliente / mostrador</option>${clientes.map(c => `<option value="${esc(c.id)}">${esc(c.nombre)}</option>`).join('')}</select>`
                : `<input class="bitacora-inline-control bitacora-inline-wide" data-campo="beneficiario" aria-label="Beneficiario" type="text" placeholder="Beneficiario">`}</td>
              <td><select class="bitacora-inline-control" data-campo="metodo" aria-label="Método de pago">${opcionesHtml(METODOS_PAGO, 'Efectivo')}</select></td>
              <td><input class="bitacora-inline-control" data-campo="monto" aria-label="Monto" type="number" min="0.01" step="0.01" required placeholder="Monto"></td>
              <td><div class="bitacora-inline-actions"><button class="btn btn-sm primary" data-accion="guardar" type="button">Guardar</button><button class="btn btn-sm" data-accion="cancelar" type="button">Cancelar</button></div></td>
            </tr>` : ''}
          ${!datos.length && !filaNuevaMovimientoActiva ? `<tr><td class="empty" colspan="7">No hay ${cfg.titulo.toLowerCase()} registrados para el período seleccionado.</td></tr>` : ''}
          ${datos.map(d => `
            <tr>
              <td><strong>${esc(formatearFecha(d.fecha))}</strong></td>
              <td>${esc(d.concepto)}${d.referencia ? `<br><small style="color:var(--muted)">Ref: ${esc(d.referencia)}</small>` : ''}</td>
              <td>${d.categoria ? `<span class="badge badge-neutral">${esc(d.categoria)}</span>` : '-'}</td>
              <td>${tercero(d)}</td>
              <td>${esc(d.metodo || '-')}</td>
              <td style="text-align:right"><strong>${formatoMonto(d.monto)}</strong></td>
              <td style="text-align:right">
                <div class="action-buttons" style="justify-content:flex-end;">
                  <button class="btn btn-sm btn-secondary btnEditarMov" data-id="${d.id}">Editar</button>
                  <button class="btn btn-sm btn-danger btnEliminarMov" data-id="${d.id}">Eliminar</button>
                </div>
              </td>
            </tr>`).join('')}
        </tbody>
      </table>`;

    const filaNueva = cont.querySelector('.bitacora-inline-row');
    if (filaNueva) {
      filaNueva.querySelector('[data-accion="cancelar"]').onclick = () => { filaNuevaMovimientoActiva = false; cargarLista(); };
      filaNueva.querySelector('[data-accion="guardar"]').onclick = async event => {
        const boton = event.currentTarget;
        const invalidos = [...filaNueva.querySelectorAll('input, select')].find(input => !input.checkValidity());
        if (invalidos) { invalidos.reportValidity(); return; }
        const valor = campo => filaNueva.querySelector(`[data-campo="${campo}"]`)?.value.trim() || '';
        const monto = Number(valor('monto')) || 0;
        if (monto <= 0) {
          avisarAdvertencia('Monto inválido', 'El monto debe ser mayor que cero.');
          return;
        }
        const payload = {
          id: null,
          fecha: valor('fecha'),
          concepto: valor('concepto'),
          categoria: valor('categoria'),
          monto,
          metodo: valor('metodo'),
          referencia: valor('referencia'),
          observacion: valor('observacion'),
          cliente_id: cfg.conCliente ? (valor('cliente') || null) : null,
          beneficiario: cfg.conCliente ? null : valor('beneficiario')
        };
        boton.disabled = true;
        boton.textContent = 'Guardando...';
        try {
          await cfg.api.guardar(payload);
          filaNuevaMovimientoActiva = false;
          await Promise.all([cargarLista(), cargarResumen()]);
        } catch (err) {
          console.error(`No se pudo guardar ${cfg.etiqueta.toLowerCase()} desde la tabla:`, err);
          avisarError(`No se pudo guardar el ${cfg.etiqueta.toLowerCase()}`, err.message);
          boton.disabled = false;
          boton.textContent = 'Guardar';
        }
      };
    }

    cont.querySelectorAll('.btnEditarMov').forEach(b => {
      b.onclick = () => modalMovimiento(datos.find(x => x.id == b.dataset.id));
    });
    cont.querySelectorAll('.btnEliminarMov').forEach(b => {
      b.onclick = async () => {
        if (!await confirmarAccion({ estado: 'error', titulo: `¿Eliminar este ${cfg.etiqueta.toLowerCase()}?`, mensaje: 'Esta acción no se puede deshacer.', botonOk: 'Eliminar', okPeligroso: true })) return;
        try {
          await cfg.api.eliminar(b.dataset.id);
          await Promise.all([cargarLista(), cargarResumen()]);
        } catch (err) {
          avisarError('No se pudo eliminar el registro', err.message);
        }
      };
    });
  }

  async function cargarResumen() {
    const resumen = await cfg.api.resumen(filtros());
    document.getElementById('finTotal').textContent = formatoMonto(resumen.total);
    document.getElementById('finCantidad').textContent = indicadorCantidad(resumen.cantidad);
    document.getElementById('finPromedio').textContent = formatoMonto(resumen.promedio);
    const principal = resumen.porCategoria && resumen.porCategoria.length ? resumen.porCategoria[0] : null;
    document.getElementById('finCategoria').textContent = principal
      ? `${principal.categoria} (${formatoMonto(principal.total)})`
      : 'Sin datos';
  }
  function modalMovimiento(item = null) {
    const modal = document.getElementById('modalMovimientoContainer');
    modal.innerHTML = `
      <div class="modal-overlay">
        <div class="modal-box">
          <div class="modal-header">
            <h3>${item ? 'Editar' : 'Registrar'} ${cfg.etiqueta}</h3>
            <button class="modal-close" id="btnCerrarModalMov">&times;</button>
          </div>
          <form id="formMovimiento">
            <div class="form-row">
              <div class="form-group">
                <label>Fecha *</label>
                <input id="movFecha" type="date" required value="${item ? esc(item.fecha) : fechaHoy()}">
              </div>
              <div class="form-group">
                <label>Monto *</label>
                <input id="movMonto" type="number" step="0.01" min="0" required value="${item ? item.monto : ''}">
              </div>
            </div>
            <div class="form-row full">
              <div class="form-group">
                <label>Concepto *</label>
                <input id="movConcepto" type="text" required value="${item ? esc(item.concepto) : ''}">
              </div>
            </div>
            <div class="form-row">
              <div class="form-group">
                <label>Categoría</label>
                <input id="movCategoria" type="text" list="listaCategoriasMov" value="${item && item.categoria ? esc(item.categoria) : ''}">
                ${listaDatalist('listaCategoriasMov', categorias)}
              </div>
              <div class="form-group">
                <label>Método de ${cfg.conCliente ? 'cobro' : 'pago'}</label>
                <select id="movMetodo">${opcionesHtml(METODOS_PAGO, item ? item.metodo : 'Efectivo')}</select>
              </div>
            </div>
            <div class="form-row">
              ${cfg.conCliente ? `
                <div class="form-group">
                  <label>Cliente</label>
                  <select id="movCliente">
                    <option value="">Sin cliente / Mostrador</option>
                    ${clientes.map(c => `<option value="${c.id}" ${item && item.cliente_id == c.id ? 'selected' : ''}>${esc(c.nombre)}</option>`).join('')}
                  </select>
                </div>` : `
                <div class="form-group">
                  <label>Beneficiario</label>
                  <input id="movBeneficiario" type="text" value="${item && item.beneficiario ? esc(item.beneficiario) : ''}">
                </div>`}
              <div class="form-group">
                <label>Referencia / Documento</label>
                <input id="movReferencia" type="text" value="${item && item.referencia ? esc(item.referencia) : ''}">
              </div>
            </div>
            <div class="form-row full">
              <div class="form-group">
                <label>Observación</label>
                <textarea id="movObservacion">${item && item.observacion ? esc(item.observacion) : ''}</textarea>
              </div>
            </div>
            <div class="modal-actions">
              <button type="button" class="btn" id="btnCancelarMov">Cancelar</button>
              <button type="submit" class="btn primary">Guardar ${cfg.etiqueta}</button>
            </div>
          </form>
        </div>
      </div>`;

    document.getElementById('btnCerrarModalMov').onclick = () => modal.innerHTML = '';
    document.getElementById('btnCancelarMov').onclick = () => modal.innerHTML = '';
    document.getElementById('formMovimiento').onsubmit = async (e) => {
      e.preventDefault();
      const payload = {
        id: item ? item.id : null,
        fecha: document.getElementById('movFecha').value,
        concepto: document.getElementById('movConcepto').value.trim(),
        categoria: document.getElementById('movCategoria').value.trim(),
        monto: parseFloat(document.getElementById('movMonto').value) || 0,
        metodo: document.getElementById('movMetodo').value,
        referencia: document.getElementById('movReferencia').value.trim(),
        observacion: document.getElementById('movObservacion').value.trim()
      };
      payload.cliente_id = cfg.conCliente ? (document.getElementById('movCliente').value || null) : null;
      payload.beneficiario = cfg.conCliente ? null : document.getElementById('movBeneficiario').value.trim();
      if (!payload.concepto || payload.monto <= 0) {
        avisarAdvertencia('Faltan datos', 'El concepto es obligatorio y el monto debe ser mayor que cero.');
        return;
      }
      try {
        await cfg.api.guardar(payload);
        modal.innerHTML = '';
        await Promise.all([cargarLista(), cargarResumen()]);
      } catch (err) {
        avisarError('No se pudo guardar el registro', err.message);
      }
    };
  }

  // Reporte profesional en PDF de lo filtrado (no window.print básico): trae
  // de nuevo los datos con los filtros vigentes para asegurar que el PDF
  // refleje exactamente el período/categoría/búsqueda aplicados, aunque la
  // tabla en pantalla esté paginada o se haya desplazado.
  async function imprimirReporte(boton) {
    const f = filtros();
    const [datos, resumen] = await Promise.all([cfg.api.listar(f), cfg.api.resumen(f)]);
    const tercero = cfg.conCliente
      ? d => esc(d.cliente_nombre || 'Sin cliente')
      : d => esc(d.beneficiario || '-');
    const total = datos.reduce((s, d) => s + (Number(d.monto) || 0), 0);
    const periodo = (f.desde || f.hasta) ? `Del ${f.desde || '—'} al ${f.hasta || '—'}` : 'Todo el historial registrado';
    const partesFiltro = [];
    if (f.categoria) partesFiltro.push(`<strong>Categoría:</strong> ${esc(f.categoria)}`);
    if (f.busqueda) partesFiltro.push(`<strong>Búsqueda:</strong> ${esc(f.busqueda)}`);
    const principal = resumen.porCategoria && resumen.porCategoria.length ? resumen.porCategoria[0] : null;
    const resumenHtml = `
      <div class="resumen-grid">
        <div class="resumen-caja"><div class="et">Total del período</div><div class="val">${formatoMonto(resumen.total)}</div></div>
        <div class="resumen-caja"><div class="et">Registros</div><div class="val">${indicadorCantidad(resumen.cantidad)}</div></div>
        <div class="resumen-caja"><div class="et">Promedio por registro</div><div class="val">${formatoMonto(resumen.promedio)}</div></div>
        <div class="resumen-caja"><div class="et">Categoría principal</div><div class="val" style="font-size:13px">${principal ? `${esc(principal.categoria)} (${formatoMonto(principal.total)})` : 'Sin datos'}</div></div>
      </div>`;
    const cuerpoHtml = !datos.length ? `<p>No hay ${cfg.titulo.toLowerCase()} registrados para el período y filtros seleccionados.</p>` : `
      <table>
        <thead>
          <tr>
            <th>Fecha</th><th>Concepto</th><th>Categoría</th><th>${cfg.etiquetaTercero}</th><th>Método</th><th style="text-align:right">Monto</th>
          </tr>
        </thead>
        <tbody>
          ${datos.map(d => `
            <tr>
              <td>${esc(formatearFecha(d.fecha))}</td>
              <td>${esc(d.concepto)}${d.referencia ? `<br><small style="color:#667085">Ref: ${esc(d.referencia)}</small>` : ''}</td>
              <td>${d.categoria ? `<span class="badge">${esc(d.categoria)}</span>` : '-'}</td>
              <td>${tercero(d)}</td>
              <td>${esc(d.metodo || '-')}</td>
              <td style="text-align:right">${formatoMonto(d.monto)}</td>
            </tr>`).join('')}
        </tbody>
        <tfoot>
          <tr><td colspan="5">TOTAL</td><td style="text-align:right">${formatoMonto(total)}</td></tr>
        </tfoot>
      </table>`;
    await imprimirComoPdf({
      titulo: cfg.titulo,
      subtitulo: periodo,
      filtrosTexto: partesFiltro.join(' &nbsp;·&nbsp; '),
      resumenHtml,
      cuerpoHtml,
      nombreArchivo: `${cfg.tipo}-${fechaHoy()}`
    }, boton);
  }

  document.getElementById('btnNuevoMovimiento').onclick = () => modalMovimiento();
  document.getElementById('btnAgregarFilaMov').onclick = async () => {
    if (filaNuevaMovimientoActiva) { document.querySelector('#tablaFinanciera [data-campo="fecha"]')?.focus(); return; }
    filaNuevaMovimientoActiva = true; await cargarLista();
    document.querySelector('#tablaFinanciera [data-campo="fecha"]')?.focus();
  };
  document.getElementById('btnImprimirFin').onclick = (e) => imprimirReporte(e.currentTarget);
  document.getElementById('btnFiltrarFin').onclick = () => Promise.all([cargarLista(), cargarResumen()]);
  document.getElementById('btnLimpiarFin').onclick = () => {
    document.getElementById('finDesde').value = fechaHaceDias(30);
    document.getElementById('finHasta').value = fechaHoy();
    document.getElementById('finFiltroCategoria').value = '';
    document.getElementById('finBuscar').value = '';
    Promise.all([cargarLista(), cargarResumen()]);
  };

  await Promise.all([cargarLista(), cargarResumen()]);
}

// ---------------------------------------------------------------- planilla y empleados

async function renderPlanilla() {
  content.innerHTML = `
    <section class="planilla-modulo">
    <div class="page-intro page-head">
      <div>
        <h2>Planilla, Viáticos y Comisiones</h2>
        <p>Empleados y salarios base, planillas por período, viáticos por conductor y comisiones por viaje.</p>
      </div>
      <div class="page-actions">
        <button id="btnNuevoEmpleado" class="btn primary">+ Registrar Empleado</button>
        <button id="btnGenerarPlanilla" class="btn btn-warning">Generar Planilla</button>
        <button id="btnImprimirPlanilla" class="btn btn-secondary">🖨️ Imprimir</button>
      </div>
    </div>

    <div class="nav-tabs">
      <button class="tab-btn active" data-tab="tabPlanillas">Planillas</button>
      <button class="tab-btn" data-tab="tabEmpleados">Empleados</button>
      <button class="tab-btn" data-tab="tabViaticos">Viáticos</button>
      <button class="tab-btn" data-tab="tabComisiones">Comisiones</button>
    </div>

    <div id="tabPlanillas" class="tab-content active">
      <div class="metrics-grid planilla-resumen-grid">
        <div class="card"><div class="card-label">Planillas en el período</div><div id="plaCantidad" class="card-value">0</div></div>
        <div class="card"><div class="card-label">Bruto de nómina</div><div id="plaBruto" class="card-value">-</div></div>
        <div class="card"><div class="card-label">Comisiones</div><div id="plaComisiones" class="card-value">-</div></div>
        <div class="card"><div class="card-label">Deducciones</div><div id="plaDeducciones" class="card-value negative">-</div></div>
        <div class="card"><div class="card-label">Neto de nómina</div><div id="plaNeto" class="card-value positive">-</div></div>
        <div class="card"><div class="card-label">Viáticos reembolsados</div><div id="plaViaticos" class="card-value">-</div></div>
        <div class="card"><div class="card-label">Total a pagar</div><div id="plaTotalPagar" class="card-value positive">-</div></div>
      </div>
      <div class="panel" style="margin-top:0;">
        <div class="toolbar">
          <div class="field"><label>Desde</label><input id="plaDesde" type="date" value="${fechaHaceDias(120)}"></div>
          <div class="field"><label>Hasta</label><input id="plaHasta" type="date" value="${ultimoDiaDelMesActual()}"></div>
          <div class="field">
            <label>Estado</label>
            <select id="plaFiltroEstado">
              <option value="">Todos los estados</option>
              <option value="BORRADOR">Borrador</option>
              <option value="PAGADA">Pagada</option>
            </select>
          </div>
          <div class="field"><label>Buscar</label><input id="plaBuscar" type="text" placeholder="Período u observación..."></div>
          <button id="btnFiltrarPla" class="btn primary">Buscar</button>
          <button id="btnLimpiarPla" class="btn">Limpiar</button>
        </div>
        <div id="tablaPlanillas" class="table-wrap">${vacio('Cargando planillas...')}</div>
      </div>
    </div>

    <div id="tabEmpleados" class="tab-content">
      <div class="metrics-grid planilla-resumen-grid">
        <div class="card"><div class="card-label">Empleados activos</div><div id="empActivos" class="card-value">0</div></div>
        <div class="card"><div class="card-label">Empleados inactivos</div><div id="empInactivos" class="card-value">0</div></div>
        <div class="card"><div class="card-label">Nómina base mensual</div><div id="empNomina" class="card-value">-</div></div>
        <div class="card"><div class="card-label">Conductores vinculados</div><div id="empConductoresVinculados" class="card-value">0</div></div>
        <div class="card"><div class="card-label">Total registrados</div><div id="empTotal" class="card-value">0</div></div>
      </div>
      <div class="panel" style="margin-top:0;">
        <div class="toolbar">
          <div class="field"><label>Buscar Empleado</label><input id="buscarEmpleado" type="text" placeholder="Nombre, cédula, código o cargo..."></div>
          <button id="btnBuscarEmpleado" class="btn primary">Buscar</button>
          <button id="btnLimpiarEmpleado" class="btn">Limpiar</button>
          <button id="btnAgregarFilaEmpleado" class="btn">+ Agregar en tabla</button>
        </div>
        <div id="tablaEmpleados" class="table-wrap">${vacio('Cargando empleados...')}</div>
      </div>
    </div>

    <div id="tabViaticos" class="tab-content">
      <div class="page-head compact">
        <p style="margin:0; color:var(--muted); font-size:13px;">Viáticos por conductor, vinculados a su viaje correspondiente en Bitácora.</p>
        <div class="page-actions">
          <button id="btnImprimirViaticos" class="btn btn-secondary">🖨️ Imprimir</button>
          <button id="btnAgregarFilaViatico" class="btn">+ Agregar en tabla</button>
          <button id="btnNuevoViatico" class="btn primary">+ Registrar Viático</button>
        </div>
      </div>
      <div class="metrics-grid" style="margin-bottom:16px;">
        <div class="card"><div class="card-label">Total asignado</div><div id="viaTotal" class="card-value">-</div></div>
        <div class="card"><div class="card-label">Pendiente por liquidar</div><div id="viaPendiente" class="card-value" style="color:#d97706;">-</div></div>
        <div class="card"><div class="card-label">Liquidado</div><div id="viaLiquidado" class="card-value positive">-</div></div>
        <div class="card"><div class="card-label">Registros / Pendientes</div><div id="viaCantidad" class="card-value">0</div></div>
      </div>
      <div class="panel" style="margin-top:0;">
        <div class="toolbar">
          <div class="field"><label>Desde</label><input id="viaDesde" type="date" value="${fechaHaceDias(60)}"></div>
          <div class="field"><label>Hasta</label><input id="viaHasta" type="date" value="${fechaHoy()}"></div>
          <div class="field">
            <label>Estado</label>
            <select id="viaFiltroEstado">
              <option value="">Todos los estados</option>
              <option value="PENDIENTE">Pendiente</option>
              <option value="LIQUIDADO">Liquidado</option>
            </select>
          </div>
          <div class="field">
            <label>Conductor</label>
            <select id="viaFiltroConductor"><option value="">Todos los conductores</option></select>
          </div>
          <div class="field"><label>Buscar</label><input id="viaBuscar" type="text" placeholder="Destino, motivo, conductor..."></div>
          <button id="btnFiltrarVia" class="btn primary">Buscar</button>
          <button id="btnLimpiarVia" class="btn">Limpiar</button>
        </div>
        <div id="tablaViaticos" class="table-wrap">${vacio('Cargando viáticos...')}</div>
      </div>
      <div id="modalViaticoContainer"></div>
      <div id="modalFichaViajeContainer"></div>
      <div id="modalPagoViaticoContainer"></div>
    </div>

    <div id="tabComisiones" class="tab-content">
      <div class="page-head compact">
        <p style="margin:0; color:var(--muted); font-size:13px;">Comisiones de conductores por viaje: porcentaje del flete, monto fijo o pago por kilómetro recorrido.</p>
        <div class="page-actions">
          <button id="btnImprimirComisiones" class="btn btn-secondary">🖨️ Imprimir</button>
          <button id="btnAgregarFilaComision" class="btn">+ Agregar en tabla</button>
          <button id="btnNuevaComision" class="btn primary">+ Registrar Comisión</button>
          <button id="btnGenerarComisiones" class="btn btn-warning">Generar del período</button>
          <button id="btnTarifasDestino" class="btn btn-secondary">Crear destinos</button>
        </div>
      </div>
      <div class="metrics-grid" style="margin-bottom:16px;">
        <div class="card"><div class="card-label">Total comisionado</div><div id="comTotal" class="card-value">-</div></div>
        <div class="card"><div class="card-label">Pendiente de pagar</div><div id="comPendiente" class="card-value" style="color:#d97706;">-</div></div>
        <div class="card"><div class="card-label">Pagado</div><div id="comPagado" class="card-value positive">-</div></div>
        <div class="card"><div class="card-label">Registros / Pendientes</div><div id="comCantidad" class="card-value">0</div></div>
      </div>
      <div class="panel" style="margin-top:0;">
        <div class="toolbar">
          <div class="field"><label>Desde</label><input id="comDesde" type="date" value="${fechaHaceDias(60)}"></div>
          <div class="field"><label>Hasta</label><input id="comHasta" type="date" value="${fechaHoy()}"></div>
          <div class="field">
            <label>Estado</label>
            <select id="comFiltroEstado">
              <option value="">Todos los estados</option>
              <option value="PENDIENTE">Pendiente</option>
              <option value="PAGADA">Pagada</option>
            </select>
          </div>
          <div class="field">
            <label>Tipo de cálculo</label>
            <select id="comFiltroTipo">
              <option value="">Todos los tipos</option>
              <option value="PORCENTAJE">Porcentaje del flete</option>
              <option value="POR_KM">Pago por kilómetro</option>
              <option value="FIJO">Monto fijo</option>
              <option value="POR_DESTINO">Comisión por destino</option>
            </select>
          </div>
          <div class="field">
            <label>Conductor</label>
            <select id="comFiltroConductor"><option value="">Todos los conductores</option></select>
          </div>
          <div class="field"><label>Buscar</label><input id="comBuscar" type="text" placeholder="Concepto, referencia, conductor..."></div>
          <button id="btnFiltrarCom" class="btn primary">Buscar</button>
          <button id="btnLimpiarCom" class="btn">Limpiar</button>
        </div>
        <div id="tablaComisiones" class="table-wrap">${vacio('Cargando comisiones...')}</div>
      </div>
      <div class="panel">
        <h3>Resumen por conductor</h3>
        <p style="margin-top:0; color:var(--muted); font-size:13px;">Comisiones del período filtrado, con lo que queda pendiente de pagar a cada conductor.</p>
        <div id="resumenComisionesConductor" class="table-wrap">${vacio('Cargando resumen...')}</div>
      </div>
      <div id="modalComisionContainer"></div>
      <div id="modalFichaComisionContainer"></div>
      <div id="modalFichaViajeComContainer"></div>
    </div>

    <div id="modalPlanillaContainer"></div>
    </section>
  `;

  const tabBtns = content.querySelectorAll('.tab-btn');
  const tabContents = content.querySelectorAll('.tab-content');
  tabBtns.forEach(b => {
    b.addEventListener('click', () => {
      tabBtns.forEach(x => x.classList.remove('active'));
      tabContents.forEach(x => x.classList.remove('active'));
      b.classList.add('active');
      document.getElementById(b.dataset.tab).classList.add('active');
    });
  });

  // ---------------------------------------------------------- viáticos (pestaña)

  const [conductoresVia, conductoresTodos] = await Promise.all([
    window.api.conductores.listar({ soloActivos: true }),
    window.api.conductores.listar({})
  ]);
  let empleadosCache = [];
  let filaEmpleadoActiva = false;
  let filaViaticoActiva = false;
  let filaComisionActiva = false;
  const selectConductorFiltro = document.getElementById('viaFiltroConductor');
  conductoresVia.forEach(c => {
    const opt = document.createElement('option');
    opt.value = c.id;
    opt.textContent = c.nombre;
    selectConductorFiltro.appendChild(opt);
  });

  const rotuloViaje = v => `${esc(formatearFecha(v.fecha))} · ${esc(v.lugar_salida || v.origen || '?')} → ${esc(v.destino)}`;

  function filtrosViaticos() {
    return {
      desde: document.getElementById('viaDesde').value,
      hasta: document.getElementById('viaHasta').value,
      estado: document.getElementById('viaFiltroEstado').value,
      conductor_id: document.getElementById('viaFiltroConductor').value || undefined,
      busqueda: document.getElementById('viaBuscar').value.trim()
    };
  }

  async function cargarResumenViaticos() {
    try {
      const r = await window.api.viaticos.resumen(filtrosViaticos());
      document.getElementById('viaTotal').textContent = formatoMonto(r.total);
      document.getElementById('viaPendiente').textContent = formatoMonto(r.pendiente);
      document.getElementById('viaLiquidado').textContent = formatoMonto(r.liquidado);
      document.getElementById('viaCantidad').textContent = `${indicadorCantidad(r.cantidad)} / ${indicadorCantidad(r.cantidadPendiente || 0)}`;
    } catch (err) {
      // El error se informa en los indicadores y en la consola: no se deja el
      // valor anterior como si la consulta hubiera funcionado.
      console.error('No se pudo cargar el resumen de viáticos:', err);
      ['viaTotal', 'viaPendiente', 'viaLiquidado', 'viaCantidad'].forEach(id => {
        document.getElementById(id).textContent = '-';
      });
    }
  }

  async function cargarListaViaticos() {
    const cont = document.getElementById('tablaViaticos');
    let datos;
    try {
      datos = await window.api.viaticos.listar(filtrosViaticos());
    } catch (err) {
      // Si la base rechaza la consulta (por ejemplo una columna faltante), el
      // motivo se muestra en la tabla en vez de quedar "Cargando viáticos...".
      console.error('No se pudieron listar los viáticos:', err);
      cont.innerHTML = vacio(`No se pudieron cargar los viáticos: ${esc(err.message)}`);
      return;
    }
    cont.innerHTML = `
      <table>
        <thead>
          <tr>
            <th>Fecha</th>
            <th>Conductor</th>
            <th>Viaje</th>
            <th>Destino / Motivo</th>
            <th>Monto</th>
            <th>Estado</th>
            <th style="text-align:right">Acciones</th>
          </tr>
        </thead>
        <tbody>
          ${filaViaticoActiva ? `
            <tr class="bitacora-inline-row">
              <td><input class="bitacora-inline-control" data-campo="fecha" aria-label="Fecha" type="date" required value="${fechaHoy()}"></td>
              <td><select class="bitacora-inline-control" data-campo="conductor" aria-label="Conductor" required><option value="">Seleccione</option>${conductoresVia.map(c => `<option value="${esc(c.id)}">${esc(c.nombre)}</option>`).join('')}</select></td>
              <td><select class="bitacora-inline-control" data-campo="viaje" aria-label="Viaje" disabled><option value="">Seleccione conductor primero</option></select></td>
              <td>
                <input class="bitacora-inline-control bitacora-inline-wide" data-campo="destino" aria-label="Destino" type="text" required placeholder="Destino">
                <input class="bitacora-inline-control bitacora-inline-wide" data-campo="motivo" aria-label="Motivo" type="text" placeholder="Motivo">
                <input class="bitacora-inline-control bitacora-inline-wide" data-campo="observacion" aria-label="Observación" type="text" placeholder="Observación">
              </td>
              <td><input class="bitacora-inline-control" data-campo="monto" aria-label="Monto" type="number" min="0.01" step="0.01" required placeholder="Monto"></td>
              <td><select class="bitacora-inline-control" data-campo="estado" aria-label="Estado"><option value="PENDIENTE">Pendiente</option><option value="LIQUIDADO">Liquidado</option></select></td>
              <td><div class="bitacora-inline-actions"><button class="btn btn-sm primary" data-accion="guardar" type="button">Guardar</button><button class="btn btn-sm" data-accion="cancelar" type="button">Cancelar</button></div></td>
            </tr>` : ''}
          ${!datos.length && !filaViaticoActiva ? '<tr><td class="empty" colspan="7">No hay viáticos registrados para el período seleccionado.</td></tr>' : ''}
          ${datos.map(v => `
            <tr>
              <td><strong>${esc(formatearFecha(v.fecha))}</strong></td>
              <td>${v.conductor_id ? `<a href="#" class="btnViaticosConductor" data-conductor="${v.conductor_id}" title="Ver viáticos pendientes">${esc(v.conductor_nombre || 'Sin asignar')}</a>` : esc(v.conductor_nombre || 'Sin asignar')}</td>
              <td>${v.viaje_id ? `<small>${esc(formatearFecha(v.viaje_fecha))} → ${esc(v.viaje_destino || '-')}</small>` : '<small style="color:var(--muted)">Sin viaje vinculado</small>'}</td>
              <td><strong>${esc(v.destino || '-')}</strong>${v.motivo ? `<br><small style="color:var(--muted)">${esc(v.motivo)}</small>` : ''}</td>
              <td><strong>${formatoMonto(v.monto)}</strong></td>
              <td><span class="badge ${v.liquidado ? 'badge-success' : 'badge-warning'}">${esc(v.estado)}</span></td>
              <td style="text-align:right">
                <div class="action-buttons" style="justify-content:flex-end;">
                  ${v.viaje_id ? `<button class="btn btn-sm btn-secondary btnFichaVia" data-viaje="${v.viaje_id}">Ver ficha</button>` : ''}
                  ${v.liquidado
                    ? `<button class="btn btn-sm btn-secondary btnComprobanteVia" data-id="${v.id}">Comprobante</button>`
                    : (v.viaje_id && v.viaje_estado && v.viaje_estado !== 'COMPLETADO')
                      ? `<button class="btn btn-sm btn-secondary" disabled title="El viaje está ${esc(v.viaje_estado)}. Se podrá pagar cuando se complete en Bitácora.">Viaje en curso</button>`
                      : `<button class="btn btn-sm primary btnLiquidarVia" data-id="${v.id}">Liquidar</button>`}
                  <button class="btn btn-sm btn-secondary btnEditarVia" data-id="${v.id}">Editar</button>
                  <button class="btn btn-sm btn-danger btnEliminarVia" data-id="${v.id}">Eliminar</button>
                </div>
              </td>
            </tr>`).join('')}
        </tbody>
      </table>`;

    const filaNueva = cont.querySelector('.bitacora-inline-row');
    if (filaNueva) {
      const conductor = filaNueva.querySelector('[data-campo="conductor"]');
      const viaje = filaNueva.querySelector('[data-campo="viaje"]');
      conductor.onchange = async () => {
        viaje.disabled = true;
        viaje.innerHTML = '<option value="">Cargando viajes...</option>';
        if (!conductor.value) {
          viaje.innerHTML = '<option value="">Seleccione conductor primero</option>';
          return;
        }
        try {
          const viajes = await window.api.viaticos.viajes_disponibles({ conductor_id: conductor.value });
          viaje.innerHTML = `<option value="">Sin viaje vinculado</option>${viajes.map(v => `<option value="${esc(v.id)}">${rotuloViaje(v)} · ${formatoMonto(Number(v.viatico) || 0)}</option>`).join('')}`;
          viaje.disabled = false;
        } catch (err) {
          console.error('No se pudieron cargar viajes para el viático en línea:', err);
          viaje.innerHTML = '<option value="">No se pudieron cargar los viajes</option>';
          avisarError('No se pudieron cargar los viajes', err.message);
        }
      };
      viaje.onchange = async () => {
        if (!viaje.value) return;
        try {
          const registro = await window.api.bitacora.obtener(viaje.value);
          if (!registro) return;
          filaNueva.querySelector('[data-campo="fecha"]').value = registro.fecha || fechaHoy();
          filaNueva.querySelector('[data-campo="destino"]').value = registro.destino || '';
          filaNueva.querySelector('[data-campo="monto"]').value = Number(registro.viatico) > 0 ? registro.viatico : '';
          const motivo = filaNueva.querySelector('[data-campo="motivo"]');
          if (!motivo.value) motivo.value = registro.modulo || registro.carga_descripcion || '';
        } catch (err) {
          console.error('No se pudo consultar el viaje para el viático en línea:', err);
          avisarError('No se pudo consultar el viaje', err.message);
        }
      };
      filaNueva.querySelector('[data-accion="cancelar"]').onclick = () => { filaViaticoActiva = false; cargarListaViaticos(); };
      filaNueva.querySelector('[data-accion="guardar"]').onclick = async event => {
        const boton = event.currentTarget;
        const invalidos = [...filaNueva.querySelectorAll('input, select')].find(input => !input.disabled && !input.checkValidity());
        if (invalidos) { invalidos.reportValidity(); return; }
        const valor = campo => filaNueva.querySelector(`[data-campo="${campo}"]`).value.trim();
        const monto = Number(valor('monto')) || 0;
        if (monto <= 0) {
          avisarAdvertencia('Monto inválido', 'El monto del viático debe ser mayor que cero.');
          return;
        }
        boton.disabled = true;
        boton.textContent = 'Guardando...';
        try {
          await window.api.viaticos.guardar({
            id: null,
            empleado_id: null,
            fecha: valor('fecha'),
            conductor_id: valor('conductor'),
            viaje_id: valor('viaje') || null,
            destino: valor('destino'),
            motivo: valor('motivo'),
            monto,
            liquidado: valor('estado') === 'LIQUIDADO' ? 1 : 0,
            observacion: valor('observacion')
          });
          filaViaticoActiva = false;
          await Promise.all([cargarListaViaticos(), cargarResumenViaticos()]);
        } catch (err) {
          console.error('No se pudo guardar el viático desde la tabla:', err);
          avisarError('No se pudo guardar el viático', err.message);
          boton.disabled = false;
          boton.textContent = 'Guardar';
        }
      };
    }

    cont.querySelectorAll('.btnViaticosConductor').forEach(a => {
      a.onclick = e => { e.preventDefault(); modalViaticosPendientes(a.dataset.conductor); };
    });
    cont.querySelectorAll('.btnFichaVia').forEach(b => {
      b.onclick = () => modalFichaViaje(b.dataset.viaje);
    });
    // "Liquidar" y "Comprobante" abren la misma ficha de pago: si el viático está
    // pendiente se confirma el pago desde ahí, y si ya se pagó se consulta el
    // comprobante. Reemplaza al confirm()/alert del navegador.
    cont.querySelectorAll('.btnLiquidarVia, .btnComprobanteVia').forEach(b => {
      b.onclick = () => modalFichaPago(datos.find(x => x.id == b.dataset.id));
    });
    cont.querySelectorAll('.btnEditarVia').forEach(b => {
      b.onclick = () => modalViatico(datos.find(x => x.id == b.dataset.id));
    });
    cont.querySelectorAll('.btnEliminarVia').forEach(b => {
      b.onclick = async () => {
        if (!await confirmarAccion({ estado: 'error', titulo: '¿Eliminar este viático?', mensaje: 'Esta acción no se puede deshacer.', botonOk: 'Eliminar', okPeligroso: true })) return;
        try {
          await window.api.viaticos.eliminar(b.dataset.id);
          await Promise.all([cargarListaViaticos(), cargarResumenViaticos()]);
        } catch (err) {
          avisarError('No se pudo eliminar el viático', err.message);
        }
      };
    });
  }

  // Ficha de solo lectura con los viáticos pendientes de un conductor.
  async function modalViaticosPendientes(conductorId) {
    const modal = document.getElementById('modalFichaViajeContainer');
    modal.innerHTML = `<div class="modal-overlay"><div class="modal-box">${vacio('Cargando viáticos pendientes...')}</div></div>`;
    let pendientes;
    try {
      pendientes = await window.api.viaticos.listar({ conductor_id: conductorId, estado: 'PENDIENTE' });
    } catch (err) {
      modal.innerHTML = '';
      avisarError('No se pudieron cargar los viáticos', err.message);
      return;
    }
    const nombre = (pendientes[0] && pendientes[0].conductor_nombre)
      || (conductoresVia.find(c => String(c.id) === String(conductorId)) || {}).nombre || 'Conductor';
    const total = redondear(pendientes.reduce((s, v) => s + (Number(v.monto) || 0), 0));
    modal.innerHTML = `
      <div class="modal-overlay">
        <div class="modal-box planilla-ficha-modal planilla-ficha-edicion" style="max-width:720px;">
          <div class="modal-header planilla-ficha-header">
            <div class="planilla-heading">
              <span class="planilla-heading-mark" aria-hidden="true">ST</span>
              <div>
                <span class="planilla-kicker">VIÁTICOS · PENDIENTES DE PAGO</span>
                <h3>${esc(nombre)}</h3>
                <p>${indicadorCantidad(pendientes.length)} ${pendientes.length === 1 ? 'viático pendiente' : 'viáticos pendientes'}</p>
              </div>
            </div>
            <button class="modal-close" id="btnCerrarViaPend">&times;</button>
          </div>
          <div class="planilla-ficha-cuerpo" style="margin-top:10px;">
            <div class="planilla-ficha-tabla table-wrap">
              <table style="min-width:0">
                <thead><tr><th>Fecha</th><th>Destino / Motivo</th><th>Monto</th></tr></thead>
                <tbody>
                  ${pendientes.map(v => `
                    <tr>
                      <td>${esc(formatearFecha(v.fecha))}</td>
                      <td>${esc(v.destino || '-')}${v.motivo ? `<br><small style="color:var(--muted)">${esc(v.motivo)}</small>` : ''}</td>
                      <td><strong>${formatoMonto(v.monto)}</strong></td>
                    </tr>`).join('')}
                  ${pendientes.length ? '' : '<tr><td colspan="3" class="planilla-detalle-vacio">Este conductor no tiene viáticos pendientes.</td></tr>'}
                </tbody>
              </table>
            </div>
          </div>
          <div class="planilla-ficha-totales" style="grid-template-columns:1fr;">
            <div class="planilla-ficha-total-pagar"><span>Total pendiente</span><strong>${formatoMonto(total)}</strong></div>
          </div>
          <div class="modal-actions">
            <button type="button" class="btn primary" id="btnCerrarViaPend2">Cerrar</button>
          </div>
        </div>
      </div>`;
    const cerrar = () => modal.innerHTML = '';
    document.getElementById('btnCerrarViaPend').onclick = cerrar;
    document.getElementById('btnCerrarViaPend2').onclick = cerrar;
  }

  // Modal de solo lectura: la ficha completa del viaje de Bitácora. El
  // contenedor es un parámetro porque la misma ficha se consulta desde la
  // pestaña Comisiones, y cada pestaña oculta su propio contenido (los ids
  // llevan sufijo para que no choquen entre pestañas).
  async function modalFichaViaje(viajeId, idContenedor = 'modalFichaViajeContainer') {
    const sufijo = idContenedor === 'modalFichaViajeContainer' ? '' : 'Com';
    const modal = document.getElementById(idContenedor);
    modal.innerHTML = `<div class="modal-overlay"><div class="modal-box">${vacio('Cargando ficha del viaje...')}</div></div>`;
    let v;
    try {
      v = await window.api.bitacora.obtener(viajeId);
    } catch (err) {
      modal.innerHTML = '';
      avisarError('No se pudo cargar la ficha del viaje', err.message);
      return;
    }
    if (!v) { modal.innerHTML = ''; avisarAdvertencia('El viaje ya no existe', 'Ese viaje fue eliminado de Bitácora.'); return; }
    const dato = (etiqueta, valor) => `<div><span>${etiqueta}</span><strong>${esc(valor || '-')}</strong></div>`;
    const vehiculo = [v.vehiculo_placa, v.vehiculo_marca, v.vehiculo_modelo].filter(Boolean).join(' · ');
    const estadoViaje = String(v.estado || '').toUpperCase();
    const claseEstado = /COMPLET|FINAL/.test(estadoViaje) ? 'badge-success' : 'badge-warning';
    const kmRecorridos = Number(v.km_llegada) && Number(v.km_salida) ? Number(v.km_llegada) - Number(v.km_salida) : null;
    modal.innerHTML = `
      <div class="modal-overlay">
        <div class="modal-box planilla-ficha-modal planilla-ficha-edicion" style="max-width:760px;">
          <div class="modal-header planilla-ficha-header">
            <div class="planilla-heading">
              <span class="planilla-heading-mark" aria-hidden="true">ST</span>
              <div>
                <span class="planilla-kicker">BITÁCORA · FICHA DEL VIAJE</span>
                <h3>Viaje #${esc(v.id)}</h3>
                <p>${esc(v.lugar_salida || v.origen || '?')} → ${esc(v.destino || '-')}</p>
              </div>
            </div>
            <button class="modal-close" id="btnCerrarFicha${sufijo}">&times;</button>
          </div>
          <div class="planilla-ficha-meta">
            <div><span>Estado</span><strong class="badge ${claseEstado}">${esc(v.estado || '-')}</strong></div>
            ${dato('Fecha', formatearFecha(v.fecha))}
            ${dato('Conductor', v.conductor_nombre)}
            ${dato('Vehículo', vehiculo)}
          </div>
          <div class="planilla-ficha-cuerpo">
            <div class="planilla-ficha-tabla table-wrap">
              <table style="min-width:0">
                <thead><tr><th>Recorrido</th><th>Salida</th><th>Llegada</th></tr></thead>
                <tbody>
                  <tr><td>Lugar</td><td>${esc(v.lugar_salida || v.origen || '-')}</td><td>${esc(v.destino || '-')}</td></tr>
                  <tr><td>Hora</td><td>${esc(v.hora_salida || '-')}</td><td>${esc(v.hora_llegada || '-')}</td></tr>
                  <tr><td>Kilometraje</td><td>${esc(v.km_salida || '-')}</td><td>${esc(v.km_llegada || '-')}</td></tr>
                </tbody>
              </table>
            </div>
          </div>
          <div class="planilla-ficha-meta">
            ${dato('Cliente', v.cliente_nombre_rel || v.cliente)}
            ${dato('Carga', v.carga_descripcion)}
            ${kmRecorridos !== null ? dato('Km recorridos', kmRecorridos) : ''}
            ${v.observaciones ? `<div class="planilla-ficha-observacion"><span>Observaciones</span><strong>${esc(v.observaciones)}</strong></div>` : ''}
          </div>
          <div class="planilla-ficha-totales" style="grid-template-columns:repeat(2,minmax(0,1fr));">
            <div><span>Estadía</span><strong>${formatoMonto(v.estadia)}</strong></div>
            <div class="planilla-ficha-total-pagar"><span>Viático asignado</span><strong>${formatoMonto(v.viatico)}</strong></div>
          </div>
          <div class="modal-actions">
            <button type="button" class="btn primary" id="btnCerrarFicha2${sufijo}">Cerrar</button>
          </div>
        </div>
      </div>`;    const cerrar = () => modal.innerHTML = '';
    document.getElementById(`btnCerrarFicha${sufijo}`).onclick = cerrar;
    document.getElementById(`btnCerrarFicha2${sufijo}`).onclick = cerrar;
  }

  // Ficha de pago del viático: reemplaza al confirm()/alert del navegador. Antes
  // de pagar muestra a quién se le paga, el monto y con qué vehículo se hizo el
  // viaje; al confirmar, la misma ficha queda como comprobante del pago.
  async function modalFichaPago(item) {
    const modal = document.getElementById('modalPagoViaticoContainer');
    modal.innerHTML = `<div class="modal-overlay"><div class="modal-box" style="max-width:620px;">${vacio('Preparando la ficha de pago...')}</div></div>`;

    // El vehículo no viene en la lista de viáticos: se toma del viaje de Bitácora.
    let viaje = null;
    if (item.viaje_id) {
      try {
        viaje = await window.api.bitacora.obtener(item.viaje_id);
      } catch (err) {
        console.error('No se pudo leer el viaje del viático:', err);
      }
    }
    const conductor = conductoresVia.find(c => String(c.id) === String(item.conductor_id));
    const nombreConductor = (conductor && conductor.nombre) || item.conductor_nombre || 'Sin asignar';
    const documentoConductor = conductor && conductor.documento ? esc(conductor.documento) : '';
    const vehiculo = viaje
      ? [viaje.vehiculo_placa, [viaje.vehiculo_marca, viaje.vehiculo_modelo].filter(Boolean).join(' ')].filter(Boolean).join(' · ')
      : '';
    const ruta = viaje ? `${esc(viaje.lugar_salida || viaje.origen || '?')} → ${esc(viaje.destino || '-')}` : '';
    const fila = (etiqueta, valor) => `<tr><th>${etiqueta}</th><td>${valor}</td></tr>`;

    const pintar = (pagado, mensajeError) => {
      modal.innerHTML = `
        <div class="modal-overlay">
          <div class="modal-box" style="max-width:620px;">
            <div class="modal-header">
              <h3>${pagado ? 'Ficha de viático pagado' : 'Ficha de viático por pagar'}</h3>
              <button class="modal-close" id="btnCerrarPagoVia">&times;</button>
            </div>
            <div class="ficha-pago${pagado ? ' pagada' : ''}">
              <div class="ficha-pago-cabecera">
                <div>
                  <div class="ficha-pago-rotulo">${pagado ? 'Monto pagado' : 'Monto a pagar'}</div>
                  <div class="ficha-pago-monto">${formatoMonto(item.monto)}</div>
                  <div class="ficha-pago-ref">Comprobante de viático #${esc(item.id)} · ${esc(formatearFecha(item.fecha))}</div>
                </div>
                <span class="badge ${pagado ? 'badge-success' : 'badge-warning'}">${pagado ? 'Pagado' : 'Pendiente'}</span>
              </div>
              <table class="ficha-datos">
                ${fila('Conductor', `${esc(nombreConductor)}${documentoConductor ? ` <small style="color:var(--muted)">(doc. ${documentoConductor})</small>` : ''}`)}
                ${fila('Vehículo', vehiculo ? esc(vehiculo) : '<span style="color:var(--muted)">Sin vehículo vinculado</span>')}
                ${fila('Viaje', viaje ? `#${esc(viaje.id)} · ${esc(formatearFecha(viaje.fecha))} · ${ruta}` : '<span style="color:var(--muted)">Sin viaje vinculado en Bitácora</span>')}
                ${fila('Destino del viático', esc(item.destino || '-'))}
                ${fila('Motivo', esc(item.motivo || '-'))}
                ${fila('Observación', esc(item.observacion || '-'))}
              </table>
              ${mensajeError ? `<div class="ficha-pago-error">${mensajeError}</div>` : ''}
              <p class="ficha-pago-nota">${pagado
                ? 'Pago registrado: el monto pasó de "Pendiente por liquidar" a "Liquidado".'
                : 'Al confirmar el pago, el viático queda marcado como <strong>LIQUIDADO</strong> a nombre del conductor indicado.'}</p>
            </div>
            <div class="modal-actions">
              <button type="button" class="btn" id="btnCerrarPagoVia2">${pagado ? 'Cerrar' : 'Cancelar'}</button>
              ${pagado ? '' : '<button type="button" class="btn primary" id="btnConfirmarPagoVia">Confirmar pago</button>'}
            </div>
          </div>
        </div>`;
      const cerrar = () => modal.innerHTML = '';
      document.getElementById('btnCerrarPagoVia').onclick = cerrar;
      document.getElementById('btnCerrarPagoVia2').onclick = cerrar;
      const confirmar = document.getElementById('btnConfirmarPagoVia');
      if (!confirmar) return;
      confirmar.onclick = async () => {
        confirmar.disabled = true;
        confirmar.textContent = 'Registrando el pago...';
        try {
          await window.api.viaticos.liquidar(item.id);
          await Promise.all([cargarListaViaticos(), cargarResumenViaticos()]);
          pintar(true, '');
        } catch (err) {
          // El motivo del fallo se muestra dentro de la ficha y el botón vuelve a
          // habilitarse: no se pierde el contexto del pago que se está haciendo.
          console.error('No se pudo liquidar el viático:', err);
          pintar(false, `No se pudo registrar el pago: ${esc(err.message)}`);
        }
      };
    };
    pintar(!!item.liquidado, '');
  }

  function modalViatico(item = null) {
    const modal = document.getElementById('modalViaticoContainer');
    modal.innerHTML = `
      <div class="modal-overlay">
        <div class="modal-box" style="max-width:760px;">
          <div class="modal-header">
            <h3>${item ? 'Editar Viático' : 'Registrar Viático'}</h3>
            <button class="modal-close" id="btnCerrarModalVia">&times;</button>
          </div>
          <form id="formViatico">
            <div class="form-row">
              <div class="form-group">
                <label>Fecha *</label>
                <input id="viatFecha" type="date" required value="${item ? esc(item.fecha) : fechaHoy()}">
              </div>
              <div class="form-group">
                <label>Conductor *</label>
                <select id="viatConductor" required>
                  <option value="">Seleccione conductor...</option>
                  ${conductoresVia.map(c => `<option value="${c.id}" ${item && item.conductor_id == c.id ? 'selected' : ''}>${esc(c.nombre)}</option>`).join('')}
                </select>
              </div>
            </div>

            <div class="form-row">
              <div class="form-group" style="grid-column:1 / -1;">
                <label>Viaje correspondiente</label>
                <div style="display:flex; gap:6px;">
                  <select id="viatViaje" style="flex:1;" disabled>
                    <option value="">Seleccione conductor primero...</option>
                  </select>
                  <button type="button" class="btn btn-sm btn-secondary" id="btnVerViajeForm" disabled>Ver ficha</button>
                </div>
                <small id="viatViajeAyuda" style="display:block; margin-top:6px; color:var(--muted);">
                  Solo aparecen los viajes sin viático registrado: cada viaje se cobra una sola vez.
                  Al seleccionar uno se cargarán automáticamente el destino y el viático de Bitácora. Ambos datos seguirán siendo editables.
                </small>
              </div>
            </div>

            <div id="viatViajeResumen" class="panel" style="margin:0 0 14px; padding:12px; display:none;">
              <div style="display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:10px;">
                <div><small style="color:var(--muted);">Ruta</small><div id="viatRutaResumen" style="font-weight:600;">-</div></div>
                <div><small style="color:var(--muted);">Viático en Bitácora</small><div id="viatMontoOrigen" style="font-weight:600;">-</div></div>
                <div><small style="color:var(--muted);">Fecha del viaje</small><div id="viatFechaViaje" style="font-weight:600;">-</div></div>
              </div>
            </div>

            <div class="form-row">
              <div class="form-group">
                <label>Monto del viático *</label>
                <input id="viatMonto" type="number" step="0.01" min="0" required value="${item ? item.monto : ''}" placeholder="Se carga desde Bitácora al seleccionar el viaje">
                <small style="display:block; margin-top:5px; color:var(--muted);">Se toma de Bitácora automáticamente y puede modificarse antes de guardar.</small>
              </div>
              <div class="form-group">
                <label>Destino *</label>
                <input id="viatDestino" type="text" required placeholder="Se carga desde el viaje seleccionado" value="${item && item.destino ? esc(item.destino) : ''}">
              </div>
            </div>

            <div class="form-row">
              <div class="form-group">
                <label>Estado</label>
                <select id="viatEstado">
                  <option value="PENDIENTE" ${item && item.liquidado ? '' : 'selected'}>Pendiente de liquidar</option>
                  <option value="LIQUIDADO" ${item && item.liquidado ? 'selected' : ''}>Liquidado</option>
                </select>
              </div>
              <div class="form-group">
                <label>Motivo</label>
                <input id="viatMotivo" type="text" placeholder="Comisión, entrega, supervisión..." value="${item && item.motivo ? esc(item.motivo) : ''}">
              </div>
            </div>

            <div class="form-row full">
              <div class="form-group">
                <label>Observación</label>
                <textarea id="viatObservacion">${item && item.observacion ? esc(item.observacion) : ''}</textarea>
              </div>
            </div>

            <div class="modal-actions">
              <button type="button" class="btn" id="btnCancelarVia">Cancelar</button>
              <button type="submit" class="btn primary">Guardar Viático</button>
            </div>
          </form>
        </div>
      </div>`;

    const selectConductor = document.getElementById('viatConductor');
    const selectViaje = document.getElementById('viatViaje');
    const btnVerViaje = document.getElementById('btnVerViajeForm');
    const inputMonto = document.getElementById('viatMonto');
    const inputDestino = document.getElementById('viatDestino');
    const inputFecha = document.getElementById('viatFecha');
    const inputMotivo = document.getElementById('viatMotivo');
    const resumenViaje = document.getElementById('viatViajeResumen');
    const rutaResumen = document.getElementById('viatRutaResumen');
    const montoOrigen = document.getElementById('viatMontoOrigen');
    const fechaViaje = document.getElementById('viatFechaViaje');

    let viajesDisponibles = [];
    let viajeActual = null;

    const mostrarViajeSeleccionado = (v, aplicarDatosBitacora = true) => {
      viajeActual = v || null;
      btnVerViaje.disabled = !v;
      if (!v) {
        resumenViaje.style.display = 'none';
        rutaResumen.textContent = '-';
        montoOrigen.textContent = '-';
        fechaViaje.textContent = '-';
        return;
      }

      resumenViaje.style.display = 'block';
      rutaResumen.textContent = `${v.lugar_salida || v.origen || '-'} → ${v.destino || '-'}`;
      montoOrigen.textContent = formatoMonto(Number(v.viatico) || 0);
      fechaViaje.textContent = formatearFecha(v.fecha);

      // La Bitácora es la fuente de origen. Solo se sobrescriben los campos
      // cuando el viaje cambia; después el usuario puede editarlos libremente.
      if (aplicarDatosBitacora) {
        inputMonto.value = Number(v.viatico) > 0 ? v.viatico : '';
        inputDestino.value = v.destino || '';
        if (!item) {
          inputFecha.value = v.fecha || inputFecha.value;
        }
        if (!inputMotivo.value.trim()) {
          inputMotivo.value = v.modulo || v.carga_descripcion || '';
        }
      }
    };

    async function cargarViajesDelConductor(conductorId, viajeSeleccionado) {
      selectViaje.disabled = true;
      btnVerViaje.disabled = true;
      resumenViaje.style.display = 'none';
      selectViaje.innerHTML = '<option value="">Cargando viajes...</option>';
      viajesDisponibles = [];
      viajeActual = null;

      if (!conductorId) {
        selectViaje.innerHTML = '<option value="">Seleccione conductor primero...</option>';
        return;
      }

      try {
        // Solo se ofrecen los viajes que NO tienen un viático: un viaje se cobra
        // una sola vez. Al editar se manda el id del viático para que su propio
        // viaje no se excluya y se pueda seguir modificando. La fecha se usa
        // como referencia, pero no bloquea viajes anteriores o pendientes.
        viajesDisponibles = await window.api.viaticos.viajes_disponibles({
          conductor_id: conductorId,
          viatico_id: item ? item.id : null
        });
      } catch (err) {
        selectViaje.innerHTML = '<option value="">No se pudieron cargar los viajes</option>';
        avisarError('No se pudieron cargar los viajes del conductor', err.message);
        return;
      }

      if (!viajesDisponibles.length) {
        // Se distingue el motivo: si el conductor sí tiene viajes pero todos
        // tienen viático, el mensaje debe decir eso y no "no tiene viajes".
        let tieneViajes = false;
        try {
          tieneViajes = (await window.api.bitacora.listar({ conductor_id: conductorId })).length > 0;
        } catch (err) {
          console.error('No se pudo verificar los viajes del conductor:', err);
        }
        selectViaje.innerHTML = tieneViajes
          ? '<option value="">Todos los viajes ya tienen un viático registrado</option>'
          : '<option value="">Este conductor no tiene viajes en Bitácora</option>';
        return;
      }

      selectViaje.innerHTML = `
        <option value="">Seleccione un viaje...</option>
        ${viajesDisponibles.map(v => `<option value="${v.id}" ${viajeSeleccionado == v.id ? 'selected' : ''}>${rotuloViaje(v)} · Viático ${formatoMonto(Number(v.viatico) || 0)}</option>`).join('')}
      `;
      selectViaje.disabled = false;

      if (viajeSeleccionado) {
        const v = viajesDisponibles.find(x => String(x.id) === String(viajeSeleccionado));
        if (v) mostrarViajeSeleccionado(v, false);
      }
    }

    selectConductor.addEventListener('change', async (e) => {
      await cargarViajesDelConductor(e.target.value, null);
    });

    selectViaje.addEventListener('change', async () => {
      const id = selectViaje.value;
      if (!id) {
        mostrarViajeSeleccionado(null);
        return;
      }
      try {
        // Consultamos la Bitácora nuevamente para usar los datos vigentes del viaje,
        // especialmente viatico y destino.
        const v = await window.api.bitacora.obtener(id);
        mostrarViajeSeleccionado(v || null);
        if (!v) avisarAdvertencia('El viaje ya no existe', 'El viaje seleccionado fue eliminado de Bitácora.');
      } catch (err) {
        mostrarViajeSeleccionado(null);
        avisarError('No se pudo consultar el viaje seleccionado', err.message);
      }
    });

    btnVerViaje.addEventListener('click', () => {
      if (selectViaje.value) modalFichaViaje(selectViaje.value);
    });

    if (item && item.conductor_id) {
      cargarViajesDelConductor(item.conductor_id, item.viaje_id);
    }

    document.getElementById('btnCerrarModalVia').onclick = () => modal.innerHTML = '';
    document.getElementById('btnCancelarVia').onclick = () => modal.innerHTML = '';
    document.getElementById('formViatico').onsubmit = async (e) => {
      e.preventDefault();
      const payload = {
        id: item ? item.id : null,
        empleado_id: item ? item.empleado_id : null,
        fecha: inputFecha.value,
        conductor_id: selectConductor.value,
        viaje_id: selectViaje.value || null,
        destino: inputDestino.value.trim(),
        motivo: inputMotivo.value.trim(),
        monto: parseFloat(inputMonto.value) || 0,
        liquidado: document.getElementById('viatEstado').value === 'LIQUIDADO' ? 1 : 0,
        observacion: document.getElementById('viatObservacion').value.trim()
      };
      if (!payload.fecha || !payload.conductor_id || !payload.destino || payload.monto <= 0) {
        avisarAdvertencia('Faltan datos', 'Indique la fecha, seleccione un conductor, escriba el destino y un monto mayor que cero.');
        return;
      }
      try {
        await window.api.viaticos.guardar(payload);
        modal.innerHTML = '';
        await Promise.all([cargarListaViaticos(), cargarResumenViaticos()]);
      } catch (err) {
        avisarError('No se pudo guardar el viático', err.message);
      }
    };
  }

  document.getElementById('btnNuevoViatico').onclick = () => modalViatico();
  document.getElementById('btnAgregarFilaViatico').onclick = async () => {
    if (filaViaticoActiva) { document.querySelector('#tablaViaticos [data-campo="fecha"]')?.focus(); return; }
    filaViaticoActiva = true; await cargarListaViaticos();
    document.querySelector('#tablaViaticos [data-campo="fecha"]')?.focus();
  };
  document.getElementById('btnFiltrarVia').onclick = () => Promise.all([cargarListaViaticos(), cargarResumenViaticos()]);
  document.getElementById('btnLimpiarVia').onclick = () => {
    document.getElementById('viaDesde').value = fechaHaceDias(60);
    document.getElementById('viaHasta').value = fechaHoy();
    document.getElementById('viaFiltroEstado').value = '';
    document.getElementById('viaFiltroConductor').value = '';
    document.getElementById('viaBuscar').value = '';
    Promise.all([cargarListaViaticos(), cargarResumenViaticos()]);
  };

  // Reporte PDF de viáticos con los filtros vigentes, por conductor y estado.
  document.getElementById('btnImprimirViaticos').onclick = async (e) => {
    const boton = e.currentTarget;
    try {
      const f = filtrosViaticos();
      const [datos, resumen] = await Promise.all([
        window.api.viaticos.listar(f),
        window.api.viaticos.resumen(f)
      ]);
      const partes = [];
      if (f.desde || f.hasta) partes.push(`<strong>Período:</strong> ${f.desde || '—'} al ${f.hasta || '—'}`);
      if (f.estado) partes.push(`<strong>Estado:</strong> ${esc(f.estado)}`);
      if (f.conductor_id) {
        const cond = conductoresVia.find(c => String(c.id) === String(f.conductor_id));
        if (cond) partes.push(`<strong>Conductor:</strong> ${esc(cond.nombre)}`);
      }
      if (f.busqueda) partes.push(`<strong>Búsqueda:</strong> ${esc(f.busqueda)}`);
      await imprimirListadoModulo({
        titulo: 'Viáticos de Conductores',
        subtitulo: `${datos.length} ${datos.length === 1 ? 'registro' : 'registros'}`,
        filtrosTexto: partes.join(' &nbsp;·&nbsp; '),
        resumenCajas: [
          { etiqueta: 'Total asignado', valor: formatoMonto(resumen.total) },
          { etiqueta: 'Pendiente', valor: formatoMonto(resumen.pendiente) },
          { etiqueta: 'Liquidado', valor: formatoMonto(resumen.liquidado) },
          { etiqueta: 'Pendientes', valor: `${indicadorCantidad(resumen.cantidad)} / ${indicadorCantidad(resumen.cantidadPendiente || 0)}` }
        ],
        columnas: [
          { titulo: 'Fecha' }, { titulo: 'Conductor' }, { titulo: 'Viaje' },
          { titulo: 'Destino / Motivo' }, { titulo: 'Monto', numero: true }, { titulo: 'Estado' }
        ],
        filas: datos.map(v => [
          esc(formatearFecha(v.fecha)),
          `<strong>${esc(v.conductor_nombre || 'Sin asignar')}</strong>`,
          v.viaje_id ? `#${esc(v.viaje_id)} · ${esc(formatearFecha(v.viaje_fecha))} → ${esc(v.viaje_destino || '-')}` : 'Sin viaje',
          `${esc(v.destino || '-')}${v.motivo ? `<br><small style="color:#667085">${esc(v.motivo)}</small>` : ''}`,
          formatoMonto(v.monto),
          esc(v.estado || '-')
        ]),
        nombreArchivo: `viaticos-${fechaHoy()}`,
        boton
      });
    } catch (err) {
      avisarError('No se pudo generar el reporte de viáticos', err.message);
    }
  };

  // ---------------------------------------------------------- comisiones (pestaña)

  const TIPOS_COMISION = [
    { valor: 'PORCENTAJE', etiqueta: 'Porcentaje del flete', corto: '% del flete' },
    { valor: 'POR_KM', etiqueta: 'Pago por kilómetro', corto: 'por km' },
    { valor: 'FIJO', etiqueta: 'Monto fijo', corto: 'fijo' },
    { valor: 'POR_DESTINO', etiqueta: 'Comisión por destino', corto: 'por destino' }
  ];
  const etiquetaTipoComision = t => (TIPOS_COMISION.find(x => x.valor === t) || {}).corto || t;
  const claseBadgeTipoComision = t => t === 'PORCENTAJE' ? 'badge-info' : t === 'POR_KM' ? 'badge-neutral' : (t === 'FIJO' || t === 'POR_DESTINO') ? 'badge-success' : 'badge-neutral';

  // Detalle del cálculo tal como quedó guardado: "C$ 18,000.00 × 5%" o "200 km × C$ 4.00".
  function calculoComision(c) {
    if (c.tipo === 'FIJO') return 'Monto fijo';
    if (c.tipo === 'POR_DESTINO') {
      return c.viaje_origen || c.viaje_destino
        ? `Tarifa ${c.viaje_origen || '?'} → ${c.viaje_destino || '?'}`
        : 'Tarifa por destino';
    }
    if (c.tipo === 'POR_KM') return `${indicadorCantidad(c.base_calculo)} km × ${formatoMonto(c.valor_calculo)}`;
    return `${formatoMonto(c.base_calculo)} × ${indicadorCantidad(c.valor_calculo)}%`;
  }

  // Período (AAAA-MM) del mes al que pertenece una fecha.
  const periodoDeFecha = fecha => String(fecha || fechaHoy()).slice(0, 7);

  const selectConductorCom = document.getElementById('comFiltroConductor');
  conductoresVia.forEach(c => {
    const opt = document.createElement('option');
    opt.value = c.id;
    opt.textContent = c.nombre;
    selectConductorCom.appendChild(opt);
  });

  function filtrosComisiones() {
    return {
      desde: document.getElementById('comDesde').value,
      hasta: document.getElementById('comHasta').value,
      estado: document.getElementById('comFiltroEstado').value,
      tipo: document.getElementById('comFiltroTipo').value,
      conductor_id: document.getElementById('comFiltroConductor').value || undefined,
      busqueda: document.getElementById('comBuscar').value.trim()
    };
  }

  async function cargarResumenComisiones() {
    try {
      const r = await window.api.comisiones.resumen(filtrosComisiones());
      document.getElementById('comTotal').textContent = formatoMonto(r.total);
      document.getElementById('comPendiente').textContent = formatoMonto(r.pendiente);
      document.getElementById('comPagado').textContent = formatoMonto(r.pagado);
      document.getElementById('comCantidad').textContent = `${indicadorCantidad(r.cantidad)} / ${indicadorCantidad(r.cantidadPendiente || 0)}`;
    } catch (err) {
      // Igual que en viáticos: el fallo se refleja en los indicadores en vez de
      // dejar el valor anterior como si la consulta hubiera funcionado.
      console.error('No se pudo cargar el resumen de comisiones:', err);
      ['comTotal', 'comPendiente', 'comPagado', 'comCantidad'].forEach(id => {
        document.getElementById(id).textContent = '-';
      });
    }
  }

  async function recargarComisiones() {
    await Promise.all([cargarListaComisiones(), cargarResumenComisiones()]);
  }

  async function seleccionarDestinoComision(alSeleccionar) {
    let tarifas = [];
    try {
      tarifas = await window.api.tarifasDestino.listar({});
    } catch (err) {
      avisarError('No se pudieron cargar los destinos', err.message);
      return;
    }
    const capa = document.createElement('div');
    capa.className = 'modal-overlay';
    capa.style.zIndex = 10001;
    capa.innerHTML = `
      <div class="modal-box" style="max-width:900px; width:92vw;">
        <div class="modal-header">
          <h3>Elegir destino</h3>
          <button class="modal-close" type="button" data-cerrar>&times;</button>
        </div>
        <input id="buscarDestinoCom" type="text" placeholder="Buscar origen o destino..." style="width:calc(100% - 0px); box-sizing:border-box; margin-bottom:8px;">
        <div class="table-wrap" style="max-height:60vh; overflow:auto;">
          <table>
            <thead><tr><th>Origen</th><th>Destino</th><th style="text-align:right">Valor</th></tr></thead>
            <tbody id="listaDestinosCom"></tbody>
          </table>
        </div>
      </div>`;
    document.body.appendChild(capa);
    const cerrar = () => capa.remove();
    capa.querySelector('[data-cerrar]').onclick = cerrar;
    const pintarLista = () => {
      const q = capa.querySelector('#buscarDestinoCom').value.trim().toLowerCase();
      const visibles = tarifas.filter(t => !q || `${t.origen} ${t.destino}`.toLowerCase().includes(q));
      capa.querySelector('#listaDestinosCom').innerHTML = visibles.length
        ? visibles.map(t => `<tr class="fila-destino" data-id="${t.id}" style="cursor:pointer"><td>${esc(t.origen)}</td><td>${esc(t.destino)}</td><td style="text-align:right"><strong>${formatoMonto(t.valor)}</strong></td></tr>`).join('')
        : '<tr><td colspan="3" style="text-align:center; color:var(--muted);">No hay destinos. Créelos en "Crear destinos".</td></tr>';
      capa.querySelectorAll('.fila-destino').forEach(fila => {
        fila.onclick = () => {
          const tarifa = tarifas.find(x => String(x.id) === fila.dataset.id);
          if (!tarifa) return;
          alSeleccionar(tarifa);
          cerrar();
        };
      });
    };
    capa.querySelector('#buscarDestinoCom').oninput = pintarLista;
    pintarLista();
  }

  // El listado y el resumen por conductor salen de la misma consulta filtrada:
  // así los dos muestran exactamente el mismo período.
  async function cargarListaComisiones() {
    const cont = document.getElementById('tablaComisiones');
    let datos;
    try {
      datos = await window.api.comisiones.listar(filtrosComisiones());
    } catch (err) {
      console.error('No se pudieron listar las comisiones:', err);
      cont.innerHTML = vacio(`No se pudieron cargar las comisiones: ${esc(err.message)}`);
      document.getElementById('resumenComisionesConductor').innerHTML = vacio('Sin datos.');
      return;
    }
    pintarResumenConductores(datos);
    cont.innerHTML = `
      <table>
        <thead>
          <tr>
            <th>Fecha</th>
            <th>Conductor</th>
            <th>Viaje</th>
            <th>Concepto</th>
            <th>Cálculo</th>
            <th style="text-align:right">Monto</th>
            <th>Estado</th>
            <th style="text-align:right">Acciones</th>
          </tr>
        </thead>
        <tbody>
          ${filaComisionActiva ? `
            <tr class="bitacora-inline-row">
              <td>
                <input class="bitacora-inline-control" data-campo="fecha" aria-label="Fecha" type="date" required value="${fechaHoy()}">
                <input class="bitacora-inline-control" data-campo="periodo" aria-label="Período" type="month" value="${periodoDeFecha(fechaHoy())}">
              </td>
              <td><select class="bitacora-inline-control" data-campo="conductor" aria-label="Conductor" required><option value="">Seleccione</option>${conductoresVia.map(c => `<option value="${esc(c.id)}">${esc(c.nombre)}</option>`).join('')}</select></td>
              <td><select class="bitacora-inline-control" data-campo="viaje" aria-label="Viaje" disabled><option value="">Seleccione conductor primero</option></select></td>
              <td>
                <input class="bitacora-inline-control bitacora-inline-wide" data-campo="concepto" aria-label="Concepto" type="text" placeholder="Concepto">
                <input class="bitacora-inline-control bitacora-inline-wide" data-campo="referencia" aria-label="Referencia" type="text" placeholder="Referencia">
                <input class="bitacora-inline-control bitacora-inline-wide" data-campo="observacion" aria-label="Observación" type="text" placeholder="Observación">
              </td>
              <td>
                <select class="bitacora-inline-control" data-campo="tipo" aria-label="Tipo de cálculo">${TIPOS_COMISION.map(t => `<option value="${t.valor}">${esc(t.etiqueta)}</option>`).join('')}</select>
                <button class="btn btn-sm btn-secondary" data-accion="elegir-destino" type="button" hidden>Elegir destino</button>
                <input class="bitacora-inline-control" data-campo="base" aria-label="Base de cálculo" type="number" min="0" step="0.01" placeholder="Base">
                <input class="bitacora-inline-control" data-campo="valor" aria-label="Porcentaje o tarifa" type="number" min="0.01" step="0.01" required placeholder="% / tarifa">
                <select class="bitacora-inline-control" data-campo="metodo" aria-label="Método de pago">${opcionesHtml(METODOS_PAGO, '')}</select>
              </td>
              <td><input class="bitacora-inline-control" data-campo="monto" aria-label="Monto de la comisión" type="number" min="0.01" step="0.01" required placeholder="Monto"></td>
              <td><select class="bitacora-inline-control" data-campo="estado" aria-label="Estado"><option value="PENDIENTE">Pendiente</option><option value="PAGADA">Pagada</option></select></td>
              <td><div class="bitacora-inline-actions"><button class="btn btn-sm primary" data-accion="guardar" type="button">Guardar</button><button class="btn btn-sm" data-accion="cancelar" type="button">Cancelar</button></div></td>
            </tr>` : ''}
          ${!datos.length && !filaComisionActiva ? '<tr><td class="empty" colspan="8">No hay comisiones registradas para el período seleccionado.</td></tr>' : ''}
          ${datos.map(c => `
            <tr>
              <td><strong>${esc(formatearFecha(c.fecha))}</strong>${c.periodo ? `<br><small style="color:var(--muted)">Período ${esc(c.periodo)}</small>` : ''}</td>
              <td>${esc(c.conductor_nombre || 'Sin asignar')}${c.conductor_documento ? `<br><small style="color:var(--muted)">${esc(c.conductor_documento)}</small>` : ''}</td>
              <td>${c.viaje_id
                ? `<small>#${esc(c.viaje_id)} · ${esc(formatearFecha(c.viaje_fecha))} → ${esc(c.viaje_destino || '-')}</small>`
                : '<small style="color:var(--muted)">Sin viaje vinculado</small>'}</td>
              <td>${esc(c.concepto || '-')}<br><span class="badge ${claseBadgeTipoComision(c.tipo)}" style="margin-top:4px;">${esc(etiquetaTipoComision(c.tipo))}</span></td>
              <td><small>${calculoComision(c)}</small></td>
              <td style="text-align:right"><strong>${formatoMonto(c.monto)}</strong></td>
              <td><span class="badge ${c.estado === 'PAGADA' ? 'badge-success' : 'badge-warning'}">${esc(c.estado)}</span></td>
              <td style="text-align:right">
                <div class="action-buttons" style="justify-content:flex-end;">
                  ${c.viaje_id ? `<button class="btn btn-sm btn-secondary btnViajeCom" data-viaje="${c.viaje_id}">Viaje</button>` : ''}
                  ${c.estado === 'PAGADA'
                    ? `<button class="btn btn-sm btn-secondary btnComprobanteCom" data-id="${c.id}">Comprobante</button>`
                    : `<button class="btn btn-sm primary btnPagarCom" data-id="${c.id}">Pagar</button>`}
                  <button class="btn btn-sm btn-secondary btnEditarCom" data-id="${c.id}">Editar</button>
                  <button class="btn btn-sm btn-danger btnEliminarCom" data-id="${c.id}">Eliminar</button>
                </div>
              </td>
            </tr>`).join('')}
        </tbody>
      </table>`;

    const filaNueva = cont.querySelector('.bitacora-inline-row');
    if (filaNueva) {
      const conductor = filaNueva.querySelector('[data-campo="conductor"]');
      const viaje = filaNueva.querySelector('[data-campo="viaje"]');
      const tipo = filaNueva.querySelector('[data-campo="tipo"]');
      const base = filaNueva.querySelector('[data-campo="base"]');
      const valor = filaNueva.querySelector('[data-campo="valor"]');
      const monto = filaNueva.querySelector('[data-campo="monto"]');
      const calcularMonto = () => {
        const baseNumero = Number(base.value) || 0;
        const valorNumero = Number(valor.value) || 0;
        if (tipo.value === 'FIJO' || tipo.value === 'POR_DESTINO') {
          base.disabled = true;
          base.value = '';
        } else {
          base.disabled = false;
        }
        const calculado = tipo.value === 'PORCENTAJE'
          ? baseNumero * valorNumero / 100
          : tipo.value === 'POR_KM' ? baseNumero * valorNumero : valorNumero;
        monto.value = calculado > 0 ? redondear(calculado) : '';
      };
      const elegirDestino = () => seleccionarDestinoComision(tarifa => {
        valor.value = Number(tarifa.valor) || '';
        calcularMonto();
        const concepto = filaNueva.querySelector('[data-campo="concepto"]');
        if (!concepto.value.trim()) concepto.value = `Comisión por destino ${tarifa.origen} → ${tarifa.destino}`;
      });
      conductor.onchange = async () => {
        viaje.disabled = true;
        viaje.innerHTML = '<option value="">Cargando viajes...</option>';
        if (!conductor.value) {
          viaje.innerHTML = '<option value="">Seleccione conductor primero</option>';
          return;
        }
        try {
          const viajes = await window.api.bitacora.listar({ conductor_id: conductor.value });
          viaje.innerHTML = `<option value="">Sin viaje vinculado</option>${viajes.map(v => `<option value="${esc(v.id)}">${rotuloViaje(v)}</option>`).join('')}`;
          viaje.disabled = false;
        } catch (err) {
          console.error('No se pudieron cargar viajes para la comisión en línea:', err);
          viaje.innerHTML = '<option value="">No se pudieron cargar los viajes</option>';
          avisarError('No se pudieron cargar los viajes', err.message);
        }
      };
      viaje.onchange = async () => {
        if (!viaje.value || tipo.value !== 'POR_KM') return;
        try {
          const registro = await window.api.bitacora.obtener(viaje.value);
          if (registro) {
            base.value = Number(registro.km_recorridos) || Math.max(0, (Number(registro.km_llegada) || 0) - (Number(registro.km_salida) || 0));
            calcularMonto();
          }
        } catch (err) {
          console.error('No se pudo consultar el viaje para la comisión en línea:', err);
          avisarError('No se pudo consultar el viaje', err.message);
        }
      };
      [tipo, base, valor].forEach(control => control.addEventListener('input', calcularMonto));
      tipo.onchange = () => {
        calcularMonto();
        const botonDestino = filaNueva.querySelector('[data-accion="elegir-destino"]');
        botonDestino.hidden = tipo.value !== 'POR_DESTINO';
        if (!botonDestino.hidden) elegirDestino();
      };
      filaNueva.querySelector('[data-accion="elegir-destino"]').onclick = elegirDestino;
      filaNueva.querySelector('[data-accion="cancelar"]').onclick = () => { filaComisionActiva = false; cargarListaComisiones(); };
      filaNueva.querySelector('[data-accion="guardar"]').onclick = async event => {
        const boton = event.currentTarget;
        const invalidos = [...filaNueva.querySelectorAll('input, select')].find(input => !input.disabled && !input.checkValidity());
        if (invalidos) { invalidos.reportValidity(); return; }
        const leer = campo => filaNueva.querySelector(`[data-campo="${campo}"]`).value.trim();
        const valorCalculo = Number(leer('valor')) || 0;
        const montoFinal = Number(leer('monto')) || 0;
        if (valorCalculo <= 0 || montoFinal <= 0) {
          avisarAdvertencia('Faltan datos', 'Indique un valor de cálculo y un monto de comisión mayor que cero.');
          return;
        }
        boton.disabled = true;
        boton.textContent = 'Guardando...';
        try {
          await window.api.comisiones.guardar({
            id: null,
            conductor_id: leer('conductor'),
            viaje_id: leer('viaje') || null,
            fecha: leer('fecha'),
            periodo: leer('periodo'),
            concepto: leer('concepto'),
            tipo: leer('tipo'),
            base_calculo: Number(leer('base')) || 0,
            valor_calculo: valorCalculo,
            monto: montoFinal,
            estado: leer('estado'),
            metodo: leer('metodo'),
            referencia: leer('referencia'),
            observacion: leer('observacion')
          });
          filaComisionActiva = false;
          await recargarComisiones();
        } catch (err) {
          console.error('No se pudo guardar la comisión desde la tabla:', err);
          avisarError('No se pudo guardar la comisión', err.message);
          boton.disabled = false;
          boton.textContent = 'Guardar';
        }
      };
      calcularMonto();
    }

    // "Pagar" y "Comprobante" abren la misma ficha: si la comisión está pendiente
    // se confirma el pago desde ahí y, si ya se pagó, se consulta el comprobante.
    cont.querySelectorAll('.btnPagarCom, .btnComprobanteCom').forEach(b => {
      b.onclick = () => modalFichaComision(datos.find(x => x.id == b.dataset.id));
    });
    cont.querySelectorAll('.btnViajeCom').forEach(b => {
      b.onclick = () => modalFichaViaje(b.dataset.viaje, 'modalFichaViajeComContainer');
    });
    cont.querySelectorAll('.btnEditarCom').forEach(b => {
      b.onclick = () => modalComision(datos.find(x => x.id == b.dataset.id));
    });
    cont.querySelectorAll('.btnEliminarCom').forEach(b => {
      b.onclick = async () => {
        if (!await confirmarAccion({ estado: 'error', titulo: '¿Eliminar esta comisión?', mensaje: 'Esta acción no se puede deshacer.', botonOk: 'Eliminar', okPeligroso: true })) return;
        try {
          await window.api.comisiones.eliminar(b.dataset.id);
          await recargarComisiones();
        } catch (err) {
          avisarError('No se pudo eliminar la comisión', err.message);
        }
      };
    });
  }

  // Totales por conductor de lo que se está viendo: sirve para saber a quién
  // liquidar y permite pagarle todo lo pendiente de una sola vez.
  function pintarResumenConductores(datos) {
    const cont = document.getElementById('resumenComisionesConductor');
    const grupos = new Map();
    datos.forEach(c => {
      const clave = c.conductor_id ? String(c.conductor_id) : 'sin';
      const actual = grupos.get(clave) || { conductor_id: c.conductor_id, nombre: c.conductor_nombre || 'Sin asignar', registros: 0, pendiente: 0, pagado: 0, total: 0 };
      const monto = Number(c.monto) || 0;
      actual.registros += 1;
      actual.total += monto;
      if (c.estado === 'PAGADA') actual.pagado += monto; else actual.pendiente += monto;
      grupos.set(clave, actual);
    });
    const filas = [...grupos.values()].sort((a, b) => b.pendiente - a.pendiente || b.total - a.total);
    if (!filas.length) {
      cont.innerHTML = vacio('Sin comisiones en el período seleccionado.');
      return;
    }
    cont.innerHTML = `
      <table>
        <thead>
          <tr>
            <th>Conductor</th>
            <th>Registros</th>
            <th style="text-align:right">Pendiente</th>
            <th style="text-align:right">Pagado</th>
            <th style="text-align:right">Total</th>
            <th style="text-align:right">Acciones</th>
          </tr>
        </thead>
        <tbody>
          ${filas.map(f => `
            <tr>
              <td><strong>${esc(f.nombre)}</strong></td>
              <td>${indicadorCantidad(f.registros)}</td>
              <td style="text-align:right">${formatoMonto(f.pendiente)}</td>
              <td style="text-align:right">${formatoMonto(f.pagado)}</td>
              <td style="text-align:right"><strong>${formatoMonto(f.total)}</strong></td>
              <td style="text-align:right">
                ${f.pendiente > 0 && f.conductor_id
                  ? `<button class="btn btn-sm primary btnPagarConductor" data-conductor="${f.conductor_id}">Pagar pendientes</button>`
                  : '<span style="color:var(--muted); font-size:12px;">Sin pendientes</span>'}
              </td>
            </tr>`).join('')}
        </tbody>
      </table>`;
    cont.querySelectorAll('.btnPagarConductor').forEach(b => {
      b.onclick = () => {
        const grupo = filas.find(f => String(f.conductor_id) === String(b.dataset.conductor));
        const propias = datos.filter(c => String(c.conductor_id) === String(b.dataset.conductor) && c.estado !== 'PAGADA');
        modalPagarConductor(grupo, propias);
      };
    });
  }

  document.getElementById('btnNuevaComision').onclick = () => modalComision();
  document.getElementById('btnAgregarFilaComision').onclick = async () => {
    if (filaComisionActiva) { document.querySelector('#tablaComisiones [data-campo="fecha"]')?.focus(); return; }
    filaComisionActiva = true; await cargarListaComisiones();
    document.querySelector('#tablaComisiones [data-campo="fecha"]')?.focus();
  };
  document.getElementById('btnGenerarComisiones').onclick = () => modalGenerarComisiones();
  document.getElementById('btnTarifasDestino').onclick = () => modalTarifasDestino();
  document.getElementById('btnFiltrarCom').onclick = () => recargarComisiones();
  document.getElementById('btnLimpiarCom').onclick = () => {
    document.getElementById('comDesde').value = fechaHaceDias(60);
    document.getElementById('comHasta').value = fechaHoy();
    document.getElementById('comFiltroEstado').value = '';
    document.getElementById('comFiltroTipo').value = '';
    document.getElementById('comFiltroConductor').value = '';
    document.getElementById('comBuscar').value = '';
    recargarComisiones();
  };

  // Reporte PDF de comisiones con los filtros vigentes, más el resumen por
  // conductor (pendiente vs pagado) tal como se ve en pantalla.
  document.getElementById('btnImprimirComisiones').onclick = async (e) => {
    const boton = e.currentTarget;
    try {
      const f = filtrosComisiones();
      const [datos, resumen] = await Promise.all([
        window.api.comisiones.listar(f),
        window.api.comisiones.resumen(f)
      ]);
      const partes = [];
      if (f.desde || f.hasta) partes.push(`<strong>Período:</strong> ${f.desde || '—'} al ${f.hasta || '—'}`);
      if (f.estado) partes.push(`<strong>Estado:</strong> ${esc(f.estado)}`);
      if (f.tipo) partes.push(`<strong>Tipo:</strong> ${esc(etiquetaTipoComision(f.tipo))}`);
      if (f.conductor_id) {
        const cond = conductoresTodos.find(c => String(c.id) === String(f.conductor_id));
        if (cond) partes.push(`<strong>Conductor:</strong> ${esc(cond.nombre)}`);
      }
      if (f.busqueda) partes.push(`<strong>Búsqueda:</strong> ${esc(f.busqueda)}`);
      const grupos = new Map();
      datos.forEach(c => {
        const clave = c.conductor_id ? String(c.conductor_id) : 'sin';
        const g = grupos.get(clave) || { nombre: c.conductor_nombre || 'Sin asignar', registros: 0, pendiente: 0, pagado: 0, total: 0 };
        const monto = Number(c.monto) || 0;
        g.registros += 1; g.total += monto;
        if (c.estado === 'PAGADA') g.pagado += monto; else g.pendiente += monto;
        grupos.set(clave, g);
      });
      const resumenFilas = [...grupos.values()].map(g => [
        `<strong>${esc(g.nombre)}</strong>`,
        String(g.registros),
        formatoMonto(g.pendiente),
        formatoMonto(g.pagado),
        `<strong>${formatoMonto(g.total)}</strong>`
      ]);
      await imprimirListadoModulo({
        titulo: 'Comisiones de Conductores',
        subtitulo: `${datos.length} ${datos.length === 1 ? 'registro' : 'registros'}`,
        filtrosTexto: partes.join(' &nbsp;·&nbsp; '),
        resumenCajas: [
          { etiqueta: 'Total comisionado', valor: formatoMonto(resumen.total) },
          { etiqueta: 'Pendiente de pagar', valor: formatoMonto(resumen.pendiente) },
          { etiqueta: 'Pagado', valor: formatoMonto(resumen.pagado) },
          { etiqueta: 'Pendientes', valor: `${indicadorCantidad(resumen.cantidad)} / ${indicadorCantidad(resumen.cantidadPendiente || 0)}` }
        ],
        columnas: [
          { titulo: 'Fecha' }, { titulo: 'Conductor' }, { titulo: 'Viaje' },
          { titulo: 'Concepto' }, { titulo: 'Cálculo' }, { titulo: 'Monto', numero: true }, { titulo: 'Estado' }
        ],
        filas: datos.map(c => [
          esc(formatearFecha(c.fecha)),
          `<strong>${esc(c.conductor_nombre || 'Sin asignar')}</strong>`,
          c.viaje_id ? `#${esc(c.viaje_id)} · ${esc(formatearFecha(c.viaje_fecha))} → ${esc(c.viaje_destino || '-')}` : 'Sin viaje',
          `${esc(c.concepto || '-')} (${esc(etiquetaTipoComision(c.tipo))})`,
          calculoComision(c),
          formatoMonto(c.monto),
          esc(c.estado || '-')
        ]),
        cuerpoExtraHtml: `
          <h3 style="margin:20px 0 6px;font-size:13px;">Resumen por conductor</h3>
          <table style="margin-top:8px">
            <thead><tr><th>Conductor</th><th style="text-align:right">Registros</th><th style="text-align:right">Pendiente</th><th style="text-align:right">Pagado</th><th style="text-align:right">Total</th></tr></thead>
            <tbody>${resumenFilas.map(r => `<tr>${r.map((c, i) => `<td${i === 0 ? '' : ' style="text-align:right"'}>${c}</td>`).join('')}</tr>`).join('')}</tbody>
          </table>`,
        nombreArchivo: `comisiones-${fechaHoy()}`,
        boton
      });
    } catch (err) {
      avisarError('No se pudo generar el reporte de comisiones', err.message);
    }
  };

  const filtrosPlanilla = () => ({
    desde: document.getElementById('plaDesde').value,
    hasta: document.getElementById('plaHasta').value,
    estado: document.getElementById('plaFiltroEstado').value,
    busqueda: document.getElementById('plaBuscar').value.trim()
  });
  async function cargarPlanillas() {
    const datos = await window.api.planilla.listar(filtrosPlanilla());
    document.getElementById('plaCantidad').textContent = indicadorCantidad(datos.length);
    const sumar = campo => datos.reduce((total, p) => total + (Number(p[campo]) || 0), 0);
    document.getElementById('plaBruto').textContent = formatoMonto(sumar('total_bruto'));
    document.getElementById('plaComisiones').textContent = formatoMonto(sumar('total_comisiones'));
    document.getElementById('plaDeducciones').textContent = formatoMonto(sumar('total_deducciones'));
    document.getElementById('plaNeto').textContent = formatoMonto(sumar('total_neto'));
    document.getElementById('plaViaticos').textContent = formatoMonto(sumar('total_viaticos'));
    document.getElementById('plaTotalPagar').textContent = formatoMonto(sumar('total_a_pagar'));

    const cont = document.getElementById('tablaPlanillas');
    if (!datos.length) {
      cont.innerHTML = vacio('No hay planillas registradas. Use "Generar Planilla" para crearla desde los empleados activos.');
      return;
    }
    cont.innerHTML = `
      <table>
        <thead>
          <tr>
            <th>Período</th>
            <th>Fecha de pago</th>
            <th>Empleados</th>
            <th style="text-align:right">Bruto</th>
            <th style="text-align:right">Comisiones</th>
            <th style="text-align:right">Deducciones</th>
            <th style="text-align:right">Viáticos</th>
            <th style="text-align:right">Total a pagar</th>
            <th>Estado</th>
            <th style="text-align:right">Acciones</th>
          </tr>
        </thead>
        <tbody>
          ${datos.map(p => `
            <tr>
              <td><strong>${esc(p.periodo)}</strong>${p.observacion ? `<br><small style="color:var(--muted)">${esc(p.observacion)}</small>` : ''}</td>
              <td>${esc(p.fecha_pago ? formatearFecha(p.fecha_pago) : '-')}</td>
              <td>${indicadorCantidad(p.empleados)}</td>
              <td style="text-align:right">${formatoMonto(p.total_bruto)}</td>
              <td style="text-align:right">${formatoMonto(p.total_comisiones)}</td>
              <td style="text-align:right">${formatoMonto(p.total_deducciones)}</td>
              <td style="text-align:right">${formatoMonto(p.total_viaticos)}</td>
              <td style="text-align:right"><strong>${formatoMonto(p.total_a_pagar)}</strong></td>
              <td><span class="badge ${p.estado === 'PAGADA' ? 'badge-success' : 'badge-warning'}">${esc(p.estado)}</span></td>
              <td style="text-align:right">
                <div class="action-buttons" style="justify-content:flex-end;">
                  <button class="btn btn-sm btn-secondary btnVerPla" data-id="${p.id}">Ver</button>
                  ${p.estado === 'PAGADA' ? '' : `<button class="btn btn-sm primary btnEditarPla" data-id="${p.id}">Editar</button>
                  <button class="btn btn-sm btn-secondary btnPagarPla" data-id="${p.id}">Marcar pagada</button>`}
                  <button class="btn btn-sm btn-danger btnEliminarPla" data-id="${p.id}">Eliminar</button>
                </div>
              </td>
            </tr>`).join('')}
        </tbody>
      </table>`;

    cont.querySelectorAll('.btnVerPla').forEach(b => {
      b.onclick = () => modalDetallePlanilla(b.dataset.id);
    });

    // Botón de impresión del listado de planillas filtrado.
    const btnImprimirPla = document.getElementById('btnImprimirPlanilla');
    if (btnImprimirPla) {
      btnImprimirPla.onclick = async (e) => {
        const boton = e.currentTarget;
        try {
          const f = filtrosPlanilla();
          const datos = await window.api.planilla.listar(f);
          const sumar = campo => datos.reduce((total, p) => total + (Number(p[campo]) || 0), 0);
          const partes = [];
          if (f.desde || f.hasta) partes.push(`<strong>Período:</strong> ${f.desde || '—'} al ${f.hasta || '—'}`);
          if (f.estado) partes.push(`<strong>Estado:</strong> ${esc(f.estado)}`);
          if (f.busqueda) partes.push(`<strong>Búsqueda:</strong> ${esc(f.busqueda)}`);
          await imprimirListadoModulo({
            titulo: 'Planillas',
            subtitulo: `${datos.length} ${datos.length === 1 ? 'planilla' : 'planillas'}`,
            filtrosTexto: partes.join(' &nbsp;·&nbsp; '),
            resumenCajas: [
              { etiqueta: 'Bruto de nómina', valor: formatoMonto(sumar('total_bruto')) },
              { etiqueta: 'Neto de nómina', valor: formatoMonto(sumar('total_neto')) },
              { etiqueta: 'Viáticos', valor: formatoMonto(sumar('total_viaticos')) },
              { etiqueta: 'Total a pagar', valor: formatoMonto(sumar('total_a_pagar')) }
            ],
            columnas: [
              { titulo: 'Período' }, { titulo: 'Fecha de pago' }, { titulo: 'Empleados', numero: true },
              { titulo: 'Bruto', numero: true }, { titulo: 'Comisiones', numero: true },
              { titulo: 'Deducciones', numero: true }, { titulo: 'Viáticos', numero: true },
              { titulo: 'Total a pagar', numero: true }, { titulo: 'Estado' }
            ],
            filas: datos.map(p => [
              `<strong>${esc(p.periodo)}</strong>${p.observacion ? `<br><small style="color:#667085">${esc(p.observacion)}</small>` : ''}`,
              esc(p.fecha_pago ? formatearFecha(p.fecha_pago) : '-'),
              indicadorCantidad(p.empleados),
              formatoMonto(p.total_bruto),
              formatoMonto(p.total_comisiones),
              formatoMonto(p.total_deducciones),
              formatoMonto(p.total_viaticos),
              `<strong>${formatoMonto(p.total_a_pagar)}</strong>`,
              esc(p.estado)
            ]),
            nombreArchivo: `planillas-${fechaHoy()}`,
            boton
          });
        } catch (err) {
          avisarError('No se pudo generar el reporte de planillas', err.message);
        }
      };
    }
    cont.querySelectorAll('.btnEditarPla').forEach(b => {
      b.onclick = async () => {
        const planilla = await window.api.planilla.obtener(b.dataset.id);
        modalPlanilla(planilla);
      };
    });
    cont.querySelectorAll('.btnPagarPla').forEach(b => {
      b.onclick = async () => {
        if (!await confirmarAccion({ titulo: '¿Marcar como pagada?', mensaje: 'La planilla quedará registrada como pagada.', botonOk: 'Marcar como pagada' })) return;
        try {
          await window.api.planilla.pagar(b.dataset.id);
          await cargarPlanillas();
        } catch (err) {
          avisarError('No se pudo actualizar la planilla', err.message);
        }
      };
    });
    cont.querySelectorAll('.btnEliminarPla').forEach(b => {
      b.onclick = async () => {
        if (!await confirmarAccion({ estado: 'error', titulo: '¿Eliminar esta planilla?', mensaje: 'Se eliminará también todo su detalle. Esta acción no se puede deshacer.', botonOk: 'Eliminar', okPeligroso: true })) return;
        try {
          await window.api.planilla.eliminar(b.dataset.id);
          await cargarPlanillas();
        } catch (err) {
          avisarError('No se pudo eliminar la planilla', err.message);
        }
      };
    });
  }

  function redondear(valor) {
    return Math.round((Number(valor) || 0) * 100) / 100;
  }

  async function modalPlanilla(planilla = null) {
    const modal = document.getElementById('modalPlanillaContainer');
    const todosEmpleados = await window.api.empleados.listar();
    const sugerencia = await window.api.planilla.sugerencia();
    const detalle = planilla && planilla.detalle
      ? planilla.detalle.map(d => ({
        empleado_id: d.empleado_id,
        salario: d.salario,
        horas_extra: d.horas_extra,
        bonificaciones: d.bonificaciones,
        comisiones: d.comisiones || 0,
        viaticos: d.viaticos || 0,
        deducciones: d.deducciones
      }))
      : [];
    let movimientosListos = false;
    let solicitudMovimientos = 0;
    const empleadosAutoAgregados = new Set();

    const nombreEmpleado = id => {
      const e = todosEmpleados.find(x => x.id == id);
      return e ? e.nombre : 'Empleado #' + id;
    };

    modal.innerHTML = `
      <div class="modal-overlay">
        <form id="formPlanilla" class="modal-box planilla-ficha-modal planilla-ficha-edicion">
          <div class="modal-header planilla-ficha-header">
            <div class="planilla-heading">
              <span class="planilla-heading-mark" aria-hidden="true">ST</span>
              <div>
                <span class="planilla-kicker">NÓMINA · ${planilla ? 'EDICIÓN' : 'NUEVA'} PLANILLA</span>
                <h3>${planilla ? 'Editar Planilla' : 'Nueva Planilla'}</h3>
                <p id="plaConteoDetalle">0 empleados incluidos</p>
              </div>
            </div>
            <button type="button" class="modal-close" id="btnCerrarModalPla">&times;</button>
          </div>
          <div class="planilla-ficha-meta planilla-ficha-meta-edicion">
            <div><label for="plaPeriodo">Período *</label><input id="plaPeriodo" type="text" required placeholder="Ej. 2026-09" value="${planilla ? esc(planilla.periodo) : sugerencia.periodo}"></div>
            <div><label for="plaFechaPago">Fecha de pago</label><input id="plaFechaPago" type="date" value="${planilla && planilla.fecha_pago ? esc(planilla.fecha_pago) : fechaHoy()}"></div>
            <div><label for="plaEstado">Estado</label>
              <select id="plaEstado">
                <option value="BORRADOR" ${planilla && planilla.estado === 'PAGADA' ? '' : 'selected'}>Borrador</option>
                <option value="PAGADA" ${planilla && planilla.estado === 'PAGADA' ? 'selected' : ''}>Pagada</option>
              </select>
            </div>
            <div class="planilla-ficha-observacion"><label for="plaObservacion">Observación</label><input id="plaObservacion" type="text" value="${planilla && planilla.observacion ? esc(planilla.observacion) : ''}" placeholder="Nota interna opcional"></div>
          </div>
          <div class="planilla-ficha-cuerpo">
            <div id="plaAvisoMovimientos" class="planilla-movimientos-aviso" role="status"></div>
            <div class="planilla-agregar-empleado">
              <div class="form-group">
                <label for="plaAgregarEmpleado">Añadir empleado manualmente</label>
                <select id="plaAgregarEmpleado">
                  <option value="">Seleccione empleado...</option>
                  ${todosEmpleados.map(e => `<option value="${e.id}">${esc(e.nombre)}${e.cargo ? ' - ' + esc(e.cargo) : ''}</option>`).join('')}
                </select>
              </div>
              <button type="button" class="btn primary" id="btnAgregarEmpleado">Agregar empleado</button>
            </div>

            <div class="planilla-ficha-tabla table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Empleado</th>
                    <th>Salario</th>
                    <th>H. extra</th>
                    <th>Bonificaciones</th>
                    <th>Comisiones</th>
                    <th>Deducciones</th>
                    <th>Viáticos</th>
                    <th>Neto nómina</th>
                    <th>Total a pagar</th>
                  </tr>
                </thead>
                <tbody id="cuerpoDetallePlanilla"></tbody>
              </table>
            </div>
          </div>
          <div class="planilla-ficha-totales">
            <div><span>Bruto de nómina</span><strong id="plaTotalBruto">${formatoMonto(0)}</strong></div>
            <div><span>Comisiones</span><strong id="plaTotalComisiones">${formatoMonto(0)}</strong></div>
            <div><span>Deducciones</span><strong id="plaTotalDeduc">${formatoMonto(0)}</strong></div>
            <div><span>Neto de nómina</span><strong id="plaTotalNeto">${formatoMonto(0)}</strong></div>
            <div><span>Viáticos reembolsados</span><strong id="plaTotalViaticos">${formatoMonto(0)}</strong></div>
            <div class="planilla-ficha-total-pagar"><span>Total a pagar</span><strong id="plaTotalPagar">${formatoMonto(0)}</strong></div>
          </div>
          <div class="modal-actions">
            <button type="button" class="btn" id="btnCancelarPla">Cancelar</button>
          <button type="submit" class="btn primary">Guardar Planilla</button>
        </div>
      </form>`;

    const cuerpo = () => document.getElementById('cuerpoDetallePlanilla');

    function totalFila(f) {
      return redondear(netoFila(f) + (f.viaticos || 0));
    }

    function netoFila(f) {
      return redondear((f.salario || 0) + (f.horas_extra || 0) + (f.bonificaciones || 0) + (f.comisiones || 0) - (f.deducciones || 0));
    }

    function recalcularTotales() {
      const bruto = detalle.reduce((s, f) => s + (f.salario || 0) + (f.horas_extra || 0) + (f.bonificaciones || 0) + (f.comisiones || 0), 0);
      const comisiones = detalle.reduce((s, f) => s + (f.comisiones || 0), 0);
      const deducc = detalle.reduce((s, f) => s + (f.deducciones || 0), 0);
      const viaticos = detalle.reduce((s, f) => s + (f.viaticos || 0), 0);
      const neto = bruto - deducc;
      document.getElementById('plaTotalBruto').textContent = formatoMonto(redondear(bruto));
      document.getElementById('plaTotalComisiones').textContent = formatoMonto(redondear(comisiones));
      document.getElementById('plaTotalDeduc').textContent = formatoMonto(redondear(deducc));
      document.getElementById('plaTotalNeto').textContent = formatoMonto(redondear(neto));
      document.getElementById('plaTotalViaticos').textContent = formatoMonto(redondear(viaticos));
      document.getElementById('plaTotalPagar').textContent = formatoMonto(redondear(neto + viaticos));
    }

    function editarMovimientos(movimientos, tipo, fila) {
      if (!movimientos || !movimientos.length) return '<span class="planilla-movimiento-vacio">—</span>';
      return `<div class="planilla-movimiento-edicion">${movimientos.map(m => {
        const descripcion = tipo === 'COMISION'
          ? (m.concepto || 'Comisión')
          : [m.destino, m.motivo].filter(Boolean).join(' · ') || 'Viático';
        return `
          <label class="planilla-movimiento-linea" title="${esc(formatearFecha(m.fecha))} · ${esc(descripcion)}">
            <input type="number" step="0.01" min="0" data-fila="${fila}" data-tipo-movimiento="${tipo}" data-movimiento="${m.id}" value="${Number(m.monto) || 0}" aria-label="Monto de ${esc(descripcion)}">
          </label>`;
      }).join('')}</div>`;
    }

    function pintarDetalle() {
      document.getElementById('plaConteoDetalle').textContent =
        `${indicadorCantidad(detalle.length)} ${detalle.length === 1 ? 'empleado incluido' : 'empleados incluidos'}`;
      if (!detalle.length) {
        cuerpo().innerHTML = '<tr><td colspan="9" class="planilla-detalle-vacio">No hay empleados en el detalle. Los movimientos pendientes se agregan automáticamente o puede añadir un empleado manualmente.</td></tr>';
        recalcularTotales();
        return;
      }
      const campo = (f, i, nombre, clave) =>
        `<td><input type="number" step="0.01" min="0" data-index="${i}" data-campo="${clave}" value="${f[clave] || 0}" aria-label="${nombre} de ${esc(nombreEmpleado(f.empleado_id))}"></td>`;
      cuerpo().innerHTML = detalle.map((f, i) => {
        const empleado = todosEmpleados.find(e => String(e.id) === String(f.empleado_id));
        return `
        <tr data-empleado="${f.empleado_id}">
          <td>
            ${esc(nombreEmpleado(f.empleado_id))}${empleado && empleado.cargo ? `<br><small style="color:var(--muted)">${esc(empleado.cargo)}</small>` : ''}
            <br><button type="button" class="btn btn-sm btn-danger btnQuitarFila" data-index="${i}" aria-label="Quitar a ${esc(nombreEmpleado(f.empleado_id))}">Quitar</button>
          </td>
          ${campo(f, i, 'Salario', 'salario')}
          ${campo(f, i, 'Horas extra', 'horas_extra')}
          ${campo(f, i, 'Bonificaciones', 'bonificaciones')}
          <td>${editarMovimientos(f.comisionesMovimientos, 'COMISION', i)}</td>
          ${campo(f, i, 'Deducciones', 'deducciones')}
          <td><strong id="viaticosFila${i}">${formatoMonto(f.viaticos || 0)}</strong>${(f.viaticosMovimientos || []).length ? `<br><button type="button" class="btn btn-sm btn-secondary btnVerViaticosPla" data-index="${i}">Ver detalle</button>` : ''}</td>
          <td><strong id="netoFila${i}">${formatoMonto(netoFila(f))}</strong></td>
          <td><strong id="totalFila${i}" class="planilla-total-fila">${formatoMonto(totalFila(f))}</strong></td>
        </tr>`;
      }).join('');

      cuerpo().querySelectorAll('input[data-campo]').forEach(inp => {
        inp.oninput = () => {
          const i = parseInt(inp.dataset.index, 10);
          detalle[i][inp.dataset.campo] = parseFloat(inp.value) || 0;
          document.getElementById('netoFila' + i).textContent = formatoMonto(netoFila(detalle[i]));
          document.getElementById('totalFila' + i).textContent = formatoMonto(totalFila(detalle[i]));
          recalcularTotales();
        };
      });
      cuerpo().querySelectorAll('input[data-movimiento]').forEach(inp => {
        inp.oninput = () => {
          const fila = detalle[parseInt(inp.dataset.fila, 10)];
          const comision = inp.dataset.tipoMovimiento === 'COMISION';
          const movimientos = comision ? fila.comisionesMovimientos : fila.viaticosMovimientos;
          const movimiento = movimientos.find(m => String(m.id) === inp.dataset.movimiento);
          if (!movimiento) return;
          movimiento.monto = parseFloat(inp.value) || 0;
          fila.comisiones = redondear((fila.comisionesMovimientos || []).reduce((s, m) => s + (Number(m.monto) || 0), 0));
          fila.viaticos = redondear((fila.viaticosMovimientos || []).reduce((s, m) => s + (Number(m.monto) || 0), 0));
          document.getElementById('netoFila' + inp.dataset.fila).textContent = formatoMonto(netoFila(fila));
          document.getElementById('totalFila' + inp.dataset.fila).textContent = formatoMonto(totalFila(fila));
          recalcularTotales();
        };
      });
      cuerpo().querySelectorAll('.btnVerViaticosPla').forEach(b => {
        b.onclick = () => {
          const f = detalle[parseInt(b.dataset.index, 10)];
          fichaViaticosEmpleadoPlanilla(
            { periodo: document.getElementById('plaPeriodo').value.trim() },
            { empleado_nombre: nombreEmpleado(f.empleado_id), viaticos: f.viaticos, viaticosMovimientos: f.viaticosMovimientos },
            () => {
              f.viaticos = redondear((f.viaticosMovimientos || []).reduce((s, m) => s + (Number(m.monto) || 0), 0));
              const i = b.dataset.index;
              document.getElementById('viaticosFila' + i).textContent = formatoMonto(f.viaticos);
              document.getElementById('netoFila' + i).textContent = formatoMonto(netoFila(f));
              document.getElementById('totalFila' + i).textContent = formatoMonto(totalFila(f));
              recalcularTotales();
            }
          );
        };
      });
      cuerpo().querySelectorAll('.btnQuitarFila').forEach(b => {
        b.onclick = () => {
          detalle.splice(parseInt(b.dataset.index, 10), 1);
          pintarDetalle();
        };
      });
      recalcularTotales();
    }

    async function actualizarMovimientos() {
      const solicitud = ++solicitudMovimientos;
      movimientosListos = false;
      const aviso = document.getElementById('plaAvisoMovimientos');
      aviso.className = 'planilla-movimientos-aviso';
      aviso.textContent = 'Consultando comisiones y viáticos pendientes...';
      try {
        const resultado = await window.api.planilla.movimientosPendientes({
          periodo: document.getElementById('plaPeriodo').value.trim(),
          planilla_id: planilla ? planilla.id : undefined
        });
        if (solicitud !== solicitudMovimientos || !document.getElementById('plaAvisoMovimientos')) return;
        const sumarPorEmpleado = movimientos => {
          const grupos = new Map();
          movimientos.forEach(m => {
            const clave = String(m.empleado_id);
            const grupo = grupos.get(clave) || { total: 0, cantidad: 0, movimientos: [] };
            grupo.total += Number(m.monto) || 0;
            grupo.cantidad++;
            m.monto = Number(m.monto) || 0;
            m.monto_original = m.monto;
            grupo.movimientos.push(m);
            grupos.set(clave, grupo);
          });
          return grupos;
        };
        const comisiones = sumarPorEmpleado(resultado.comisiones);
        const viaticos = sumarPorEmpleado(resultado.viaticos);
        empleadosAutoAgregados.forEach(id => {
          const indice = detalle.findIndex(f => String(f.empleado_id) === id);
          if (indice < 0) return;
          const fila = detalle[indice];
          const empleado = todosEmpleados.find(e => String(e.id) === id);
          const filaSinCambios = empleado
            && Number(fila.salario) === Number(empleado.salario_base)
            && !fila.horas_extra && !fila.bonificaciones && !fila.deducciones;
          if (filaSinCambios) detalle.splice(indice, 1);
        });
        empleadosAutoAgregados.clear();
        [...new Set([...comisiones.keys(), ...viaticos.keys()])].forEach(id => {
          if (detalle.some(f => String(f.empleado_id) === id)) return;
          const empleado = todosEmpleados.find(e => String(e.id) === id);
          if (!empleado) return;
          detalle.push({
            empleado_id: empleado.id,
            salario: Number(empleado.salario_base) || 0,
            horas_extra: 0,
            bonificaciones: 0,
            comisiones: 0,
            viaticos: 0,
            deducciones: 0
          });
          empleadosAutoAgregados.add(id);
        });
        detalle.forEach(f => {
          const grupoComisiones = comisiones.get(String(f.empleado_id));
          const grupoViaticos = viaticos.get(String(f.empleado_id));
          f.comisionesMovimientos = grupoComisiones ? grupoComisiones.movimientos : [];
          f.viaticosMovimientos = grupoViaticos ? grupoViaticos.movimientos : [];
          f.comisiones = redondear(grupoComisiones ? grupoComisiones.total : 0);
          f.viaticos = redondear(grupoViaticos ? grupoViaticos.total : 0);
        });
        const pendientesSinVincular = [];
        if (resultado.sinVincular.comisiones) pendientesSinVincular.push(`${indicadorCantidad(resultado.sinVincular.comisiones)} comisión(es)`);
        if (resultado.sinVincular.viaticos) pendientesSinVincular.push(`${indicadorCantidad(resultado.sinVincular.viaticos)} viático(s)`);
        aviso.className = pendientesSinVincular.length ? 'planilla-movimientos-aviso advertencia' : 'planilla-movimientos-aviso';
        aviso.textContent = pendientesSinVincular.length
          ? `${pendientesSinVincular.join(' y ')} no se pueden asignar: vincule el conductor con su empleado desde la pestaña Empleados.`
          : 'Los movimientos pendientes se agregan automáticamente. Los viáticos de meses anteriores siguen incluidos hasta que se paguen; puede ajustar cada monto antes de guardar.';
        movimientosListos = true;
        pintarDetalle();
      } catch (err) {
        if (solicitud !== solicitudMovimientos) return;
        aviso.className = 'planilla-movimientos-aviso error';
        const canalDesactualizado = /canal "planilla:movimientos_pendientes" no existe/i.test(err.message);
        aviso.textContent = canalDesactualizado
          ? 'El servicio activo todavía no reconoce la consulta de movimientos. Reinicia la aplicación o actualiza y reinicia el servidor para cargar la versión más reciente.'
          : `No se pudieron consultar comisiones y viáticos: ${err.message}`;
        console.error('No se pudieron cargar movimientos de planilla:', err);
      }
    }

    document.getElementById('btnCerrarModalPla').onclick = () => modal.innerHTML = '';
    document.getElementById('btnCancelarPla').onclick = () => modal.innerHTML = '';
    document.getElementById('plaPeriodo').addEventListener('change', actualizarMovimientos);
    document.getElementById('btnAgregarEmpleado').onclick = () => {
      const select = document.getElementById('plaAgregarEmpleado');
      const id = parseInt(select.value, 10);
      if (!id) {
        avisarAdvertencia('Falta el empleado', 'Seleccione un empleado para agregarlo al detalle.');
        return;
      }
      if (detalle.some(f => String(f.empleado_id) === String(id))) {
        avisarAdvertencia('Empleado repetido', 'El empleado ya está incluido en el detalle.');
        return;
      }
      const empleado = todosEmpleados.find(e => e.id === id);
      detalle.push({
        empleado_id: id,
        salario: empleado ? empleado.salario_base : 0,
        horas_extra: 0,
        bonificaciones: 0,
        comisiones: 0,
        viaticos: 0,
        deducciones: 0
      });
      select.value = '';
      pintarDetalle();
    };

    document.getElementById('formPlanilla').onsubmit = async (e) => {
      e.preventDefault();
      const periodo = document.getElementById('plaPeriodo').value.trim();
      if (!periodo) {
        avisarAdvertencia('Falta el período', 'Indique el período de la planilla.');
        return;
      }
      if (!movimientosListos) {
        avisarAdvertencia('Movimientos pendientes', 'Espere a que se carguen las comisiones y los viáticos del período antes de guardar.');
        return;
      }
      if (!detalle.length) {
        avisarAdvertencia('Detalle vacío', 'Agregue al menos un empleado al detalle.');
        return;
      }
      try {
        await window.api.planilla.guardar({
          id: planilla ? planilla.id : null,
          periodo,
          fecha_pago: document.getElementById('plaFechaPago').value,
          observacion: document.getElementById('plaObservacion').value.trim(),
          estado: document.getElementById('plaEstado').value,
          detalle,
          movimientos: detalle.flatMap(fila => [
            ...(fila.comisionesMovimientos || [])
              .filter(m => Number(m.monto) !== Number(m.monto_original))
              .map(m => ({ tipo: 'COMISION', id: m.id, monto: m.monto })),
            ...(fila.viaticosMovimientos || [])
              .filter(m => Number(m.monto) !== Number(m.monto_original))
              .map(m => ({ tipo: 'VIATICO', id: m.id, monto: m.monto }))
          ])
        });
        modal.innerHTML = '';
        await cargarPlanillas();
      } catch (err) {
        avisarError('No se pudo guardar la planilla', err.message);
      }
    };

    pintarDetalle();
    await actualizarMovimientos();
  }

  async function modalGenerarPlanilla() {
    const modal = document.getElementById('modalPlanillaContainer');
    const sugerencia = await window.api.planilla.sugerencia();
    const resumen = await window.api.empleados.resumen();
    modal.innerHTML = `
      <div class="modal-overlay">
        <div class="modal-box" style="max-width:540px;">
          <div class="modal-header">
            <h3>Generar Planilla del Período</h3>
            <button class="modal-close" id="btnCerrarGenerar">&times;</button>
          </div>
          <form id="formGenerarPlanilla">
            <p style="font-size:13px; color:var(--muted); margin-top:0;">
              Se creará la planilla con el salario base de <strong>${indicadorCantidad(resumen.activos)}</strong> empleado(s) activo(s).
              Nómina base estimada: <strong>${formatoMonto(resumen.nominaMensual)}</strong>.
              Después podrá ajustar horas extra, bonificaciones y deducciones.
            </p>
            <div class="form-row">
              <div class="form-group">
                <label>Período *</label>
                <input id="genPeriodo" type="text" required value="${sugerencia.periodo}" placeholder="Ej. 2026-09">
              </div>
              <div class="form-group">
                <label>Fecha de pago</label>
                <input id="genFechaPago" type="date" value="${sugerencia.hasta}">
              </div>
            </div>
            <div class="form-row full">
              <div class="form-group">
                <label>Observación</label>
                <input id="genObservacion" type="text" placeholder="Planilla ordinaria del período...">
              </div>
            </div>
            <div class="form-row full">
              <div class="form-group">
                <label style="display:flex; align-items:center; gap:8px;">
                  <input type="checkbox" id="genIncluirInactivos" style="width:auto;"> Incluir empleados inactivos
                </label>
              </div>
            </div>
            <div class="modal-actions">
              <button type="button" class="btn" id="btnCancelarGenerar">Cancelar</button>
              <button type="submit" class="btn primary">Generar Planilla</button>
            </div>
          </form>
        </div>
      </div>`;

    document.getElementById('btnCerrarGenerar').onclick = () => modal.innerHTML = '';
    document.getElementById('btnCancelarGenerar').onclick = () => modal.innerHTML = '';
    document.getElementById('formGenerarPlanilla').onsubmit = async (e) => {
      e.preventDefault();
      try {
        const res = await window.api.planilla.generar({
          periodo: document.getElementById('genPeriodo').value.trim(),
          fecha_pago: document.getElementById('genFechaPago').value,
          observacion: document.getElementById('genObservacion').value.trim(),
          incluirInactivos: document.getElementById('genIncluirInactivos').checked
        });
        modal.innerHTML = '';
        await cargarPlanillas();
        avisarExito('Planilla generada', `Se incluyeron ${res.empleados} empleado(s). Puede ajustar los montos con el botón Editar.`);
      } catch (err) {
        avisarError('No se pudo generar la planilla', err.message);
      }
    };
  }

  async function modalDetallePlanilla(id) {
    const modal = document.getElementById('modalPlanillaContainer');
    const planilla = await window.api.planilla.obtener(id);
    modal.innerHTML = `
      <div class="modal-overlay">
        <div class="modal-box planilla-ficha-modal">
          <div class="modal-header planilla-ficha-header">
            <div class="planilla-heading">
              <span class="planilla-heading-mark" aria-hidden="true">ST</span>
              <div>
                <span class="planilla-kicker">NÓMINA · DETALLE DE PAGO</span>
                <h3>Planilla ${esc(planilla.periodo)}</h3>
                <p>${indicadorCantidad(planilla.detalle.length)} ${planilla.detalle.length === 1 ? 'empleado' : 'empleados'} incluidos</p>
              </div>
            </div>
            <button class="modal-close" id="btnCerrarDetalle">&times;</button>
          </div>
          <div class="planilla-ficha-meta">
            <div><span>Estado</span><strong class="badge ${planilla.estado === 'PAGADA' ? 'badge-success' : 'badge-warning'}">${esc(planilla.estado)}</strong></div>
            <div><span>Fecha de pago</span><strong>${esc(planilla.fecha_pago ? formatearFecha(planilla.fecha_pago) : 'No definida')}</strong></div>
            ${planilla.observacion ? `<div class="planilla-ficha-observacion"><span>Observación</span><strong>${esc(planilla.observacion)}</strong></div>` : ''}
          </div>
          <div class="table-wrap planilla-ficha-tabla">
            <table>
              <thead>
                <tr>
                  <th>Empleado</th>
                  <th>Salario</th>
                  <th>H. extra</th>
                  <th>Bonificaciones</th>
                  <th>Comisiones</th>
                  <th>Deducciones</th>
                  <th>Viáticos</th>
                  <th>Neto nómina</th>
                    <th>Total a pagar</th>
                </tr>
              </thead>
              <tbody>
                ${planilla.detalle.map(d => `
                  <tr>
                    <td>${esc(d.empleado_nombre || 'Empleado eliminado')}${d.empleado_cargo ? `<br><small style="color:var(--muted)">${esc(d.empleado_cargo)}</small>` : ''}</td>
                    <td>${formatoMonto(d.salario)}</td>
                    <td>${formatoMonto(d.horas_extra)}</td>
                    <td>${formatoMonto(d.bonificaciones)}</td>
                    <td>${formatoMonto(d.comisiones)}</td>
                    <td>${formatoMonto(d.deducciones)}</td>
                    <td>${Number(d.viaticos) > 0
                      ? `<button type="button" class="btn btn-sm btn-secondary btnVerViaticosPla" data-empleado="${d.empleado_id}" title="Ver detalle de viáticos">${formatoMonto(d.viaticos)} ›</button>`
                      : formatoMonto(d.viaticos)}</td>
                    <td><strong>${formatoMonto(d.neto)}</strong></td>
                    <td><strong class="planilla-total-fila">${formatoMonto((Number(d.neto) || 0) + (Number(d.viaticos) || 0))}</strong></td>
                  </tr>`).join('')}
                  ${planilla.detalle.length ? '' : '<tr><td colspan="9" class="planilla-detalle-vacio">Esta planilla no tiene empleados en el detalle.</td></tr>'}
              </tbody>
            </table>
          </div>
          <div class="planilla-ficha-totales">
            <div><span>Bruto de nómina</span><strong>${formatoMonto(planilla.total_bruto)}</strong></div>
            <div><span>Comisiones</span><strong>${formatoMonto(planilla.detalle.reduce((s, d) => s + (Number(d.comisiones) || 0), 0))}</strong></div>
            <div><span>Deducciones</span><strong>${formatoMonto(planilla.total_deducciones)}</strong></div>
            <div><span>Neto de nómina</span><strong>${formatoMonto(planilla.total_neto)}</strong></div>
            <div><span>Viáticos reembolsados</span><strong>${formatoMonto(planilla.total_viaticos)}</strong></div>
            <div class="planilla-ficha-total-pagar"><span>Total a pagar</span><strong>${formatoMonto(planilla.total_a_pagar)}</strong></div>
          </div>
          <div class="modal-actions">
            <button type="button" class="btn" id="btnImprimirDetallePla">🖨️ Imprimir esta planilla</button>
            <button type="button" class="btn primary" id="btnCerrarDetalle2">Cerrar</button>
          </div>
        </div>
      </div>`;

    document.getElementById('btnCerrarDetalle').onclick = () => modal.innerHTML = '';
    document.getElementById('btnCerrarDetalle2').onclick = () => modal.innerHTML = '';
    // Planilla imprimible: nómina completa del período, con lo que gana cada
    // empleado y el total a pagar de la planilla.
    document.getElementById('btnImprimirDetallePla').onclick = async (e) => {
      const boton = e.currentTarget;
      try {
        await imprimirListadoModulo({
          titulo: `Planilla ${planilla.periodo}`,
          subtitulo: `Nómina de ${indicadorCantidad(planilla.detalle.length)} ${planilla.detalle.length === 1 ? 'empleado' : 'empleados'} · Estado: ${esc(planilla.estado)}`,
          filtrosTexto: `<strong>Fecha de pago:</strong> ${planilla.fecha_pago ? esc(formatearFecha(planilla.fecha_pago)) : 'No definida'}${planilla.observacion ? ` &nbsp;·&nbsp; <strong>Observación:</strong> ${esc(planilla.observacion)}` : ''}`,
          resumenCajas: [
            { etiqueta: 'Bruto de nómina', valor: formatoMonto(planilla.total_bruto) },
            { etiqueta: 'Deducciones', valor: formatoMonto(planilla.total_deducciones) },
            { etiqueta: 'Neto de nómina', valor: formatoMonto(planilla.total_neto) },
            { etiqueta: 'Total a pagar', valor: formatoMonto(planilla.total_a_pagar) }
          ],
          columnas: [
            { titulo: 'Empleado' }, { titulo: 'Salario', numero: true }, { titulo: 'H. extra', numero: true },
            { titulo: 'Bonif.', numero: true }, { titulo: 'Comisiones', numero: true },
            { titulo: 'Deducciones', numero: true }, { titulo: 'Viáticos', numero: true },
            { titulo: 'Neto', numero: true }, { titulo: 'Total a pagar', numero: true }
          ],
          filas: planilla.detalle.map(d => [
            `<strong>${esc(d.empleado_nombre || 'Empleado eliminado')}</strong>${d.empleado_cargo ? `<br><small style="color:#667085">${esc(d.empleado_cargo)}</small>` : ''}`,
            formatoMonto(d.salario),
            formatoMonto(d.horas_extra),
            formatoMonto(d.bonificaciones),
            formatoMonto(d.comisiones),
            formatoMonto(d.deducciones),
            formatoMonto(d.viaticos),
            formatoMonto(d.neto),
            `<strong>${formatoMonto((Number(d.neto) || 0) + (Number(d.viaticos) || 0))}</strong>`
          ]),
          nombreArchivo: `planilla-${String(planilla.periodo || 'periodo').replace(/[^a-zA-Z0-9-]/g, '-')}`,
          boton
        });
      } catch (err) {
        avisarError('No se pudo generar el reporte de la planilla', err.message);
      }
    };
    modal.querySelectorAll('.btnVerViaticosPla').forEach(b => {
      b.onclick = () => {
        const fila = planilla.detalle.find(d => String(d.empleado_id) === b.dataset.empleado);
        if (fila) fichaViaticosEmpleadoPlanilla(planilla, fila);
      };
    });
  }

  // Ficha de solo lectura con los viáticos incluidos en la planilla para un empleado.
  function fichaViaticosEmpleadoPlanilla(planilla, fila, alCambiar = null) {
    const movimientos = fila.viaticosMovimientos || [];
    const total = redondear(movimientos.reduce((s, m) => s + (Number(m.monto) || 0), 0));
    const capa = document.createElement('div');
    capa.className = 'modal-overlay';
    capa.style.zIndex = '10001';
    capa.innerHTML = `
      <div class="modal-box planilla-ficha-modal planilla-ficha-edicion" style="max-width:640px;">
        <div class="modal-header planilla-ficha-header">
          <div class="planilla-heading">
            <span class="planilla-heading-mark" aria-hidden="true">ST</span>
            <div>
              <span class="planilla-kicker">VIÁTICOS · PLANILLA ${esc(planilla.periodo)}</span>
              <h3>${esc(fila.empleado_nombre || 'Empleado')}</h3>
              <p>${indicadorCantidad(movimientos.length)} ${movimientos.length === 1 ? 'viático incluido' : 'viáticos incluidos'}</p>
            </div>
          </div>
          <button class="modal-close" data-cerrar>&times;</button>
        </div>
        <div class="planilla-ficha-cuerpo" style="margin-top:10px;">
          <div class="planilla-ficha-tabla table-wrap">
            <table style="min-width:0">
              <thead><tr><th>Fecha</th><th>Destino / Motivo</th><th>Estado</th><th>Monto</th></tr></thead>
              <tbody>
                ${movimientos.map(m => `
                  <tr>
                    <td>${esc(formatearFecha(m.fecha))}</td>
                    <td>${esc(m.destino || '-')}${m.motivo ? `<br><small style="color:var(--muted)">${esc(m.motivo)}</small>` : ''}</td>
                    <td><span class="badge ${m.estado === 'LIQUIDADO' ? 'badge-success' : 'badge-warning'}">${esc(m.estado || 'PENDIENTE')}</span></td>
                    <td>${alCambiar
                      ? `<input type="number" step="0.01" min="0" class="planilla-viatico-monto" data-viatico="${m.id}" value="${Number(m.monto) || 0}" aria-label="Monto del viático" style="width:96px;text-align:right">`
                      : `<strong>${formatoMonto(m.monto)}</strong>`}</td>
                  </tr>`).join('')}
                ${movimientos.length ? '' : '<tr><td colspan="4" class="planilla-detalle-vacio">Sin detalle de viáticos para este empleado.</td></tr>'}
              </tbody>
            </table>
          </div>
        </div>
        <div class="planilla-ficha-totales" style="grid-template-columns:1fr;">
          <div class="planilla-ficha-total-pagar"><span>Total viáticos</span><strong>${formatoMonto(total || fila.viaticos)}</strong></div>
        </div>
        <div class="modal-actions">
          <button type="button" class="btn primary" data-cerrar>Cerrar</button>
        </div>
      </div>`;
    capa.querySelectorAll('[data-cerrar]').forEach(b => { b.onclick = () => capa.remove(); });
    const totalEtiqueta = capa.querySelector('.planilla-ficha-total-pagar strong');
    capa.querySelectorAll('.planilla-viatico-monto').forEach(inp => {
      inp.oninput = () => {
        const mov = movimientos.find(m => String(m.id) === inp.dataset.viatico);
        if (!mov) return;
        mov.monto = parseFloat(inp.value) || 0;
        totalEtiqueta.textContent = formatoMonto(redondear(movimientos.reduce((s, m) => s + (Number(m.monto) || 0), 0)));
        alCambiar();
      };
    });
    document.getElementById('modalPlanillaContainer').appendChild(capa);
  }



  // Formulario de alta y edición de una comisión.
  function modalComision(item = null) {
    const modal = document.getElementById('modalComisionContainer');
    const tipo = item ? item.tipo : 'PORCENTAJE';
    modal.innerHTML = `
      <div class="modal-overlay">
        <div class="modal-box" style="max-width:1000px;">
          <div class="modal-header">
            <h3>${item ? 'Editar Comisión' : 'Nueva Comisión'}</h3>
            <button class="modal-close" id="btnCerrarModalCom">&times;</button>
          </div>
          <form id="formComision">
            <style>#formComision .form-row{grid-template-columns:repeat(3,minmax(0,1fr))}#formComision .form-row.full{grid-template-columns:1fr}#formComision .form-row.dos{grid-template-columns:repeat(2,minmax(0,1fr))}</style>
            <div class="form-row">
              <div class="form-group">
                <label>Conductor *</label>
                <select id="comConductor">
                  <option value="">Seleccione conductor...</option>
                  ${conductoresVia.map(c => `<option value="${c.id}" ${item && String(item.conductor_id) === String(c.id) ? 'selected' : ''}>${esc(c.nombre)}${c.documento ? ' - ' + esc(c.documento) : ''}</option>`).join('')}
                </select>
              </div>
              <div class="form-group">
                <label>Viaje en Bitácora (opcional)</label>
                <select id="comViaje" disabled><option value="">Seleccione conductor primero...</option></select>
              </div>
              <div class="form-group">
                <label>Fecha *</label>
                <input id="comFecha" type="date" value="${item && item.fecha ? esc(item.fecha) : fechaHoy()}">
              </div>
            </div>
            <div class="form-row">
              <div class="form-group">
                <label>Período de pago</label>
                <input id="comPeriodoForm" type="text" placeholder="Ej. 2026-09" value="${item && item.periodo ? esc(item.periodo) : periodoDeFecha(fechaHoy())}">
              </div>
              <div class="form-group" style="grid-column:span 2">
                <label>Concepto</label>
                <input id="comConceptoForm" type="text" placeholder="Comisión del viaje, bono por ruta..." value="${item && item.concepto ? esc(item.concepto) : ''}">
              </div>
            </div>
            <div class="form-row">
              <div class="form-group">
                <label>Tipo de cálculo *</label>
                <select id="comTipoForm">
                  ${TIPOS_COMISION.map(t => `<option value="${t.valor}" ${t.valor === tipo ? 'selected' : ''}>${esc(t.etiqueta)}</option>`).join('')}
                </select>
              </div>
              <div class="form-group">
                <label id="comEtiquetaBase">Base de cálculo</label>
                <input id="comBaseForm" type="number" step="0.01" min="0" value="${item ? Number(item.base_calculo) || '' : ''}">
              </div>
              <div class="form-group">
                <label id="comEtiquetaValor">Valor</label>
                <input id="comValorForm" type="number" step="0.01" min="0" value="${item ? Number(item.valor_calculo) || '' : ''}">
                <button type="button" class="btn btn-sm btn-secondary" id="btnElegirDestino" ${tipo === 'POR_DESTINO' ? '' : 'hidden'}>Elegir destino</button>
              </div>
            </div>
            <div class="form-row">
              <div class="form-group">
                <label>Monto a pagar</label>
                <input id="comMontoForm" type="number" step="0.01" min="0" value="${item ? Number(item.monto) || '' : ''}">
              </div>
              <div class="form-group">
                <label>Estado</label>
                <select id="comEstadoForm">
                  <option value="PENDIENTE" ${item && item.estado === 'PAGADA' ? '' : 'selected'}>Pendiente de pago</option>
                  <option value="PAGADA" ${item && item.estado === 'PAGADA' ? 'selected' : ''}>Pagada</option>
                </select>
              </div>
              <div class="form-group">
                <label>Método de pago</label>
                <select id="comMetodoForm">${opcionesHtml(METODOS_PAGO, item ? item.metodo : '')}</select>
              </div>
            </div>
            <p id="comAyudaCalculo" style="margin:0 0 12px; color:var(--muted); font-size:12px;"></p>
            <div class="form-row">
              <div class="form-group">
                <label>Referencia</label>
                <input id="comReferenciaForm" type="text" placeholder="Factura, viaje, recibo..." value="${item && item.referencia ? esc(item.referencia) : ''}">
              </div>
              <div class="form-group" style="grid-column:span 2">
                <label>Observación</label>
                <textarea id="comObservacionForm" style="min-height:38px">${item && item.observacion ? esc(item.observacion) : ''}</textarea>
              </div>
            </div>
            <div class="modal-actions">
              <button type="button" class="btn" id="btnCancelarCom">Cancelar</button>
              <button type="submit" class="btn primary">Guardar Comisión</button>
            </div>
          </form>
        </div>
      </div>`;

    const selectConductorForm = document.getElementById('comConductor');
    const selectViajeForm = document.getElementById('comViaje');
    const tipoSelect = document.getElementById('comTipoForm');
    const inputBase = document.getElementById('comBaseForm');
    const inputValor = document.getElementById('comValorForm');
    const inputMonto = document.getElementById('comMontoForm');
    const etiquetaBase = document.getElementById('comEtiquetaBase');
    const etiquetaValor = document.getElementById('comEtiquetaValor');
    const ayuda = document.getElementById('comAyudaCalculo');
    const inputFecha = document.getElementById('comFecha');
    const inputPeriodo = document.getElementById('comPeriodoForm');
    const inputConcepto = document.getElementById('comConceptoForm');
    const inputReferencia = document.getElementById('comReferenciaForm');

    const tipoActual = () => tipoSelect.value;

    // El monto se recalcula mientras se escribe, pero queda editable: puede
    // haber ajustes manuales sobre el cálculo.
    function montoCalculado() {
      const base = parseFloat(inputBase.value) || 0;
      const valor = parseFloat(inputValor.value) || 0;
      if (tipoActual() === 'FIJO' || tipoActual() === 'POR_DESTINO') return redondear(valor);
      if (tipoActual() === 'POR_KM') return redondear(base * valor);
      return redondear(base * valor / 100);
    }

    function ajustarEtiquetas() {
      const t = tipoActual();
      document.getElementById('btnElegirDestino').hidden = t !== 'POR_DESTINO';
      if (t === 'POR_KM') {
        etiquetaBase.textContent = 'Kilómetros recorridos';
        etiquetaValor.textContent = 'Tarifa por kilómetro';
        inputBase.disabled = false;
        ayuda.textContent = 'El monto se calcula multiplicando los kilómetros por la tarifa. Si vincula un viaje, se usan sus kilómetros.';
      } else if (t === 'FIJO') {
        etiquetaBase.textContent = 'Base de cálculo (no aplica)';
        etiquetaValor.textContent = 'Monto fijo';
        inputBase.disabled = true;
        ayuda.textContent = 'La comisión es un monto fijo: no usa base ni porcentaje.';
      } else if (t === 'POR_DESTINO') {
        etiquetaBase.textContent = 'Base de cálculo (no aplica)';
        etiquetaValor.textContent = 'Tarifa de la ruta';
        inputBase.disabled = true;
        ayuda.textContent = 'La comisión toma la tarifa de la ruta (origen → destino) del viaje vinculado. Las tarifas se definen en "Tarifas por destino".';
      } else {
        etiquetaBase.textContent = 'Base de cálculo (monto del flete)';
        etiquetaValor.textContent = 'Porcentaje de comisión (%)';
        inputBase.disabled = false;
        ayuda.textContent = 'El monto se calcula como porcentaje del flete: base × porcentaje ÷ 100.';
      }
    }

    function recalcular() {
      if (tipoActual() === 'FIJO' || tipoActual() === 'POR_DESTINO') inputBase.value = '';
      inputMonto.value = montoCalculado() || '';
    }

    async function elegirDestino() {
      await seleccionarDestinoComision(tarifa => {
        inputValor.value = Number(tarifa.valor) || '';
        recalcular();
        if (!inputConcepto.value.trim()) inputConcepto.value = `Comisión por destino ${tarifa.origen} → ${tarifa.destino}`;
        ayuda.textContent = `Destino elegido: ${tarifa.origen} → ${tarifa.destino} (${formatoMonto(tarifa.valor)}).`;
      });
    }

    // Busca la tarifa de la ruta del viaje vinculado y la pone como valor.
    async function aplicarTarifaDestino() {
      if (tipoActual() !== 'POR_DESTINO' || inputValor.value) return;
      if (!selectViajeForm.value) {
        ayuda.textContent = 'Vincule un viaje para tomar la tarifa de su ruta, o escriba la tarifa a mano.';
        return;
      }
      try {
        const tarifa = await window.api.tarifasDestino.buscar({ viaje_id: selectViajeForm.value });
        if (tarifa) {
          inputValor.value = Number(tarifa.valor) || '';
          recalcular();
          ayuda.textContent = `Tarifa ${tarifa.origen} → ${tarifa.destino}: ${formatoMonto(tarifa.valor)}.`;
        } else {
          ayuda.textContent = 'Esa ruta no tiene tarifa. Créela en "Tarifas por destino" o escriba el valor a mano.';
        }
      } catch (err) {
        console.error('No se pudo consultar la tarifa de la ruta:', err);
      }
    }

    // Viajes del conductor para vincular la comisión (opcional).
    async function cargarViajesDelConductorCom(conductorId, viajeSeleccionado) {
      selectViajeForm.disabled = true;
      selectViajeForm.innerHTML = '<option value="">Cargando viajes...</option>';
      if (!conductorId) {
        selectViajeForm.innerHTML = '<option value="">Seleccione conductor primero...</option>';
        return;
      }
      let viajes = [];
      try {
        viajes = await window.api.bitacora.listar({ conductor_id: conductorId });
      } catch (err) {
        console.error('No se pudieron cargar los viajes del conductor:', err);
        selectViajeForm.innerHTML = '<option value="">No se pudieron cargar los viajes</option>';
        return;
      }
      selectViajeForm.innerHTML = viajes.length
        ? `<option value="">Sin viaje vinculado</option>${viajes.map(v => `<option value="${v.id}" ${String(viajeSeleccionado) === String(v.id) ? 'selected' : ''}>${rotuloViaje(v)} · ${indicadorCantidad(v.km_recorridos)} km</option>`).join('')}`
        : '<option value="">Este conductor no tiene viajes en Bitácora</option>';
      selectViajeForm.disabled = false;
    }

    // Los datos del viaje solo rellenan campos vacíos: lo escrito a mano manda.
    selectViajeForm.addEventListener('change', async () => {
      if (!selectViajeForm.value) return;
      let viaje = null;
      try {
        viaje = await window.api.bitacora.obtener(selectViajeForm.value);
      } catch (err) {
        console.error('No se pudo consultar el viaje seleccionado:', err);
        return;
      }
      if (!viaje) return;
      if (!item) inputFecha.value = viaje.fecha || inputFecha.value;
      inputPeriodo.value = periodoDeFecha(inputFecha.value);
      if (!inputConcepto.value.trim()) inputConcepto.value = `Comisión del viaje a ${viaje.destino || ''}`.trim();
      if (!inputReferencia.value.trim()) inputReferencia.value = `VIA-${viaje.id}`;
      if (tipoActual() === 'POR_KM') {
        inputBase.value = Number(viaje.km_recorridos) || '';
        recalcular();
      }
      await aplicarTarifaDestino();
    });

    selectConductorForm.addEventListener('change', () => cargarViajesDelConductorCom(selectConductorForm.value, null));
    tipoSelect.addEventListener('change', () => {
      ajustarEtiquetas(); recalcular();
      if (tipoActual() === 'POR_DESTINO') elegirDestino();
    });
    document.getElementById('btnElegirDestino').onclick = elegirDestino;
    inputBase.addEventListener('input', recalcular);
    inputValor.addEventListener('input', recalcular);
    inputFecha.addEventListener('change', () => { inputPeriodo.value = periodoDeFecha(inputFecha.value); });

    document.getElementById('btnCerrarModalCom').onclick = () => modal.innerHTML = '';
    document.getElementById('btnCancelarCom').onclick = () => modal.innerHTML = '';
    document.getElementById('formComision').onsubmit = async (e) => {
      e.preventDefault();
      const payload = {
        id: item ? item.id : null,
        conductor_id: selectConductorForm.value,
        viaje_id: selectViajeForm.value || null,
        fecha: inputFecha.value,
        periodo: inputPeriodo.value.trim(),
        concepto: inputConcepto.value.trim(),
        tipo: tipoActual(),
        base_calculo: parseFloat(inputBase.value) || 0,
        valor_calculo: parseFloat(inputValor.value) || 0,
        monto: parseFloat(inputMonto.value) || 0,
        estado: document.getElementById('comEstadoForm').value,
        metodo: document.getElementById('comMetodoForm').value,
        referencia: inputReferencia.value.trim(),
        observacion: document.getElementById('comObservacionForm').value.trim()
      };
      if (!payload.fecha || !payload.conductor_id) {
        avisarAdvertencia('Faltan datos', 'Indique la fecha y seleccione el conductor de la comisión.');
        return;
      }
      if (payload.valor_calculo <= 0 || payload.monto <= 0) {
        avisarAdvertencia('Faltan datos', 'Indique el valor del cálculo y un monto de comisión mayor que cero.');
        return;
      }
      try {
        await window.api.comisiones.guardar(payload);
        modal.innerHTML = '';
        await recargarComisiones();
      } catch (err) {
        avisarError('No se pudo guardar la comisión', err.message);
      }
    };

    ajustarEtiquetas();
    if (item && item.conductor_id) cargarViajesDelConductorCom(item.conductor_id, item.viaje_id);
  }

  // Tarifas por destino: valor de la comisión para cada ruta origen → destino.
  async function modalTarifasDestino() {
    const modal = document.getElementById('modalComisionContainer');
    modal.innerHTML = `<div class="modal-overlay"><div class="modal-box" style="max-width:720px;">${vacio('Cargando tarifas...')}</div></div>`;
    let tarifas = [];
    try {
      tarifas = await window.api.tarifasDestino.listar({});
    } catch (err) {
      modal.innerHTML = '';
      avisarError('No se pudieron cargar las tarifas', err.message);
      return;
    }
    let editando = null;

    const pintar = () => {
      modal.innerHTML = `
        <div class="modal-overlay">
          <div class="modal-box" style="max-width:720px;">
            <div class="modal-header">
              <h3>Crear destinos</h3>
              <button class="modal-close" id="btnCerrarTarifas" type="button">&times;</button>
            </div>
            <p style="font-size:12px;">Cada ruta (punto A → punto B) tiene un valor. Al registrar una comisión "por destino" se toma la tarifa de la ruta del viaje.</p>
            <form id="formTarifaDestino" class="form-row" style="grid-template-columns:1fr 1fr 130px auto; align-items:end;">
              <div class="form-group"><label>Origen *</label><input id="tarOrigen" type="text" required value="${editando ? esc(editando.origen) : ''}" placeholder="Ej. Managua"></div>
              <div class="form-group"><label>Destino *</label><input id="tarDestino" type="text" required value="${editando ? esc(editando.destino) : ''}" placeholder="Ej. Estelí"></div>
              <div class="form-group"><label>Valor (C$) *</label><input id="tarValor" type="number" step="0.01" min="0" required value="${editando ? Number(editando.valor) : ''}"></div>
              <div class="form-group"><button type="submit" class="btn primary">${editando ? 'Actualizar' : 'Agregar'}</button></div>
            </form>
            ${editando ? '<p style="margin:0 18px 8px;"><a href="#" id="btnCancelarTarifa">Cancelar edición</a></p>' : ''}
            <div class="table-wrap" style="max-height:55vh;">
              <table>
                <thead><tr><th>Origen</th><th>Destino</th><th style="text-align:right">Valor</th><th style="text-align:right">Acciones</th></tr></thead>
                <tbody>
                  ${tarifas.length ? tarifas.map(t => `
                    <tr>
                      <td>${esc(t.origen)}</td>
                      <td>${esc(t.destino)}</td>
                      <td style="text-align:right"><strong>${formatoMonto(t.valor)}</strong></td>
                      <td style="text-align:right">
                        <button class="btn btn-sm btn-secondary btnEditarTarifa" data-id="${t.id}" type="button">Editar</button>
                        <button class="btn btn-sm btn-danger btnEliminarTarifa" data-id="${t.id}" type="button">✕</button>
                      </td>
                    </tr>`).join('') : '<tr><td colspan="4" style="text-align:center; color:var(--muted);">Aún no hay tarifas. Agregue la primera arriba.</td></tr>'}
                </tbody>
              </table>
            </div>
          </div>
        </div>`;

      document.getElementById('btnCerrarTarifas').onclick = () => { modal.innerHTML = ''; };
      const cancelar = document.getElementById('btnCancelarTarifa');
      if (cancelar) cancelar.onclick = e => { e.preventDefault(); editando = null; pintar(); };
      modal.querySelectorAll('.btnEditarTarifa').forEach(b => {
        b.onclick = () => { editando = tarifas.find(t => String(t.id) === b.dataset.id) || null; pintar(); };
      });
      modal.querySelectorAll('.btnEliminarTarifa').forEach(b => {
        b.onclick = async () => {
          if (!await confirmarAccion({ estado: 'error', titulo: '¿Eliminar esta tarifa?', mensaje: 'Las comisiones ya registradas no cambian.', botonOk: 'Eliminar', okPeligroso: true })) return;
          try {
            await window.api.tarifasDestino.eliminar(b.dataset.id);
            tarifas = await window.api.tarifasDestino.listar({});
            editando = null;
            pintar();
          } catch (err) {
            avisarError('No se pudo eliminar la tarifa', err.message);
          }
        };
      });
      document.getElementById('formTarifaDestino').onsubmit = async e => {
        e.preventDefault();
        try {
          await window.api.tarifasDestino.guardar({
            id: editando ? editando.id : null,
            origen: document.getElementById('tarOrigen').value.trim(),
            destino: document.getElementById('tarDestino').value.trim(),
            valor: parseFloat(document.getElementById('tarValor').value) || 0
          });
          tarifas = await window.api.tarifasDestino.listar({});
          editando = null;
          pintar();
        } catch (err) {
          avisarError('No se pudo guardar la tarifa', err.message);
        }
      };
    };
    pintar();
  }

  // Genera comisiones del período a partir de los viajes de Bitácora: pago por
  // kilómetro o monto fijo por conductor.
  function modalGenerarComisiones() {
    const modal = document.getElementById('modalComisionContainer');
    modal.innerHTML = `
      <div class="modal-overlay">
        <div class="modal-box" style="max-width:560px;">
          <div class="modal-header">
            <h3>Generar comisiones del período</h3>
            <button class="modal-close" id="btnCerrarGenerarCom">&times;</button>
          </div>
          <form id="formGenerarComisiones">
            <p style="font-size:13px; color:var(--muted); margin-top:0;">
              Se crea <strong>una comisión por conductor</strong> con los viajes que tenga en Bitácora durante el período.
              Si el conductor ya tiene comisión en ese período se omite, para no duplicar el pago.
            </p>
            <div class="form-row">
              <div class="form-group">
                <label>Período *</label>
                <input id="genComPeriodo" type="text" required placeholder="Ej. 2026-09" value="${periodoDeFecha(fechaHoy())}">
              </div>
              <div class="form-group">
                <label>Conductor</label>
                <select id="genComConductor">
                  <option value="">Todos los conductores con viajes</option>
                  ${conductoresVia.map(c => `<option value="${c.id}">${esc(c.nombre)}</option>`).join('')}
                </select>
              </div>
            </div>
            <div class="form-row">
              <div class="form-group">
                <label>Tipo de cálculo *</label>
                <select id="genComTipo">
                  <option value="POR_KM" selected>Pago por kilómetro</option>
                  <option value="FIJO">Monto fijo por conductor</option>
                </select>
              </div>
              <div class="form-group">
                <label id="genComEtiquetaValor">Tarifa por kilómetro *</label>
                <input id="genComValor" type="number" step="0.01" min="0" value="">
              </div>
            </div>
            <p id="genComAyuda" style="margin:0 0 12px; color:var(--muted); font-size:12px;"></p>
            <div class="modal-actions">
              <button type="button" class="btn" id="btnCancelarGenerarCom">Cancelar</button>
              <button type="submit" class="btn primary">Generar comisiones</button>
            </div>
          </form>
        </div>
      </div>`;

    const tipoSelect = document.getElementById('genComTipo');
    const etiquetaValor = document.getElementById('genComEtiquetaValor');
    const ayuda = document.getElementById('genComAyuda');
    const ajustar = () => {
      const esKm = tipoSelect.value === 'POR_KM';
      etiquetaValor.textContent = esKm ? 'Tarifa por kilómetro *' : 'Monto fijo por conductor *';
      ayuda.textContent = esKm
        ? 'La base de cada comisión son los kilómetros recorridos por el conductor en el período.'
        : 'Se paga el mismo monto a cada conductor con viajes en el período.';
    };

    tipoSelect.addEventListener('change', ajustar);
    document.getElementById('btnCerrarGenerarCom').onclick = () => modal.innerHTML = '';
    document.getElementById('btnCancelarGenerarCom').onclick = () => modal.innerHTML = '';
    document.getElementById('formGenerarComisiones').onsubmit = async (e) => {
      e.preventDefault();
      try {
        const res = await window.api.comisiones.generar({
          periodo: document.getElementById('genComPeriodo').value.trim(),
          conductor_id: document.getElementById('genComConductor').value || undefined,
          tipo: tipoSelect.value,
          valor_calculo: parseFloat(document.getElementById('genComValor').value) || 0
        });
        modal.innerHTML = '';
        await recargarComisiones();
        avisar({ estado: 'exito', titulo: 'Comisiones generadas', mensaje: `Período ${textoSeguro(res.periodo)}`, detalles: [['Comisiones creadas', res.creadas], ['Viajes considerados', res.viajes]].concat(res.omitidas ? [['Conductores omitidos (ya tenían comisión)', res.omitidas]] : []) });
      } catch (err) {
        avisarError('No se pudieron generar las comisiones', err.message);
      }
    };

    ajustar();
  }

  // Ficha de pago de la comisión: reemplaza al confirm()/alert del navegador.
  // Antes de pagar muestra a quién se le paga, el cálculo y el monto; al
  // confirmar, la misma ficha queda como comprobante del pago.
  async function modalFichaComision(item) {
    const modal = document.getElementById('modalFichaComisionContainer');
    modal.innerHTML = `<div class="modal-overlay"><div class="modal-box" style="max-width:620px;">${vacio('Preparando la ficha de pago...')}</div></div>`;

    // El vehículo no viene en la comisión: se toma del viaje de Bitácora.
    let viaje = null;
    if (item.viaje_id) {
      try {
        viaje = await window.api.bitacora.obtener(item.viaje_id);
      } catch (err) {
        console.error('No se pudo leer el viaje de la comisión:', err);
      }
    }
    const conductor = conductoresVia.find(c => String(c.id) === String(item.conductor_id));
    const nombreConductor = (conductor && conductor.nombre) || item.conductor_nombre || 'Sin asignar';
    const documentoConductor = (conductor && conductor.documento) || item.conductor_documento || '';
    const vehiculo = viaje
      ? [viaje.vehiculo_placa, [viaje.vehiculo_marca, viaje.vehiculo_modelo].filter(Boolean).join(' ')].filter(Boolean).join(' · ')
      : '';
    const ruta = viaje ? `${esc(viaje.lugar_salida || viaje.origen || '?')} → ${esc(viaje.destino || '-')}` : '';
    const fila = (etiqueta, valor) => `<tr><th>${etiqueta}</th><td>${valor}</td></tr>`;

    const pintar = (pagado, mensajeError) => {
      modal.innerHTML = `
        <div class="modal-overlay">
          <div class="modal-box" style="max-width:620px;">
            <div class="modal-header">
              <h3>${pagado ? 'Ficha de comisión pagada' : 'Ficha de comisión por pagar'}</h3>
              <button class="modal-close" id="btnCerrarPagoCom">&times;</button>
            </div>
            <div class="ficha-pago${pagado ? ' pagada' : ''}">
              <div class="ficha-pago-cabecera">
                <div>
                  <div class="ficha-pago-rotulo">${pagado ? 'Monto pagado' : 'Monto a pagar'}</div>
                  <div class="ficha-pago-monto">${formatoMonto(item.monto)}</div>
                  <div class="ficha-pago-ref">Comprobante de comisión #${esc(item.id)} · ${esc(formatearFecha(item.fecha))}</div>
                </div>
                <span class="badge ${pagado ? 'badge-success' : 'badge-warning'}">${pagado ? 'Pagada' : 'Pendiente'}</span>
              </div>
              <table class="ficha-datos">
                ${fila('Conductor', `${esc(nombreConductor)}${documentoConductor ? ` <small style="color:var(--muted)">(doc. ${esc(documentoConductor)})</small>` : ''}`)}
                ${fila('Vehículo', vehiculo ? esc(vehiculo) : '<span style="color:var(--muted)">Sin vehículo vinculado</span>')}
                ${fila('Viaje', viaje ? `#${esc(viaje.id)} · ${esc(formatearFecha(viaje.fecha))} · ${ruta}` : '<span style="color:var(--muted)">Sin viaje vinculado en Bitácora</span>')}
                ${fila('Período', esc(item.periodo || '-'))}
                ${fila('Cálculo', `${esc(etiquetaTipoComision(item.tipo))} · ${calculoComision(item)}`)}
                ${fila('Concepto', esc(item.concepto || '-'))}
                ${fila('Referencia', esc(item.referencia || '-'))}
                ${fila('Observación', esc(item.observacion || '-'))}
                ${pagado ? fila('Fecha de pago', esc(formatearFecha(item.fecha_pago))) : ''}
                ${pagado ? fila('Método de pago', esc(item.metodo || '-')) : ''}
              </table>
              ${mensajeError ? `<div class="ficha-pago-error">${mensajeError}</div>` : ''}
              ${pagado ? '' : `
                <div style="padding:14px 18px 0;">
                  <div class="form-group">
                    <label>Método de pago</label>
                    <select id="comPagoMetodo">${opcionesHtml(METODOS_PAGO, item.metodo || 'Efectivo')}</select>
                  </div>
                </div>`}
              <p class="ficha-pago-nota">${pagado
                ? 'Pago registrado: la comisión pasó de "Pendiente" a "Pagada".'
                : 'Al confirmar el pago, la comisión queda marcada como <strong>PAGADA</strong> a nombre del conductor indicado.'}</p>
            </div>
            <div class="modal-actions">
              <button type="button" class="btn" id="btnCerrarPagoCom2">${pagado ? 'Cerrar' : 'Cancelar'}</button>
              ${pagado ? '' : '<button type="button" class="btn primary" id="btnConfirmarPagoCom">Confirmar pago</button>'}
            </div>
          </div>
        </div>`;
      const cerrar = () => modal.innerHTML = '';
      document.getElementById('btnCerrarPagoCom').onclick = cerrar;
      document.getElementById('btnCerrarPagoCom2').onclick = cerrar;
      const confirmar = document.getElementById('btnConfirmarPagoCom');
      if (!confirmar) return;
      confirmar.onclick = async () => {
        const selector = document.getElementById('comPagoMetodo');
        confirmar.disabled = true;
        confirmar.textContent = 'Registrando el pago...';
        try {
          const metodo = selector ? selector.value : null;
          await window.api.comisiones.pagar({ id: item.id, metodo });
          await recargarComisiones();
          item.estado = 'PAGADA';
          item.metodo = metodo || item.metodo;
          pintar(true, '');
        } catch (err) {
          // El motivo del fallo se muestra dentro de la ficha y el botón vuelve
          // a habilitarse: no se pierde el contexto del pago en curso.
          console.error('No se pudo pagar la comisión:', err);
          pintar(false, `No se pudo registrar el pago: ${esc(err.message)}`);
        }
      };
    };
    pintar(item.estado === 'PAGADA', '');
  }

  // Liquidación de todas las comisiones pendientes de un conductor: la ficha
  // lista lo que se le va a pagar y, al confirmar, queda como comprobante.
  function modalPagarConductor(grupo, pendientes) {
    const modal = document.getElementById('modalFichaComisionContainer');
    const filtros = filtrosComisiones();
    const total = pendientes.reduce((s, c) => s + (Number(c.monto) || 0), 0);
    let detallePago = '';

    const pintar = (pagado, mensajeError) => {
      modal.innerHTML = `
        <div class="modal-overlay">
          <div class="modal-box" style="max-width:620px;">
            <div class="modal-header">
              <h3>${pagado ? 'Ficha de comisiones pagadas' : 'Ficha de comisiones por pagar'}</h3>
              <button class="modal-close" id="btnCerrarPagoCom">&times;</button>
            </div>
            <div class="ficha-pago${pagado ? ' pagada' : ''}">
              <div class="ficha-pago-cabecera">
                <div>
                  <div class="ficha-pago-rotulo">${pagado ? 'Total pagado' : 'Total a pagar'}</div>
                  <div class="ficha-pago-monto">${formatoMonto(total)}</div>
                  <div class="ficha-pago-ref">${pendientes.length} comisión(es) · ${esc(grupo.nombre)} · ${esc(filtros.desde)} a ${esc(filtros.hasta)}</div>
                </div>
                <span class="badge ${pagado ? 'badge-success' : 'badge-warning'}">${pagado ? 'Pagadas' : 'Pendientes'}</span>
              </div>
              <table class="ficha-datos">
                ${pendientes.map(c => `<tr><th>${esc(formatearFecha(c.fecha))}${c.periodo ? ` <small style="color:var(--muted)">(${esc(c.periodo)})</small>` : ''}</th><td>${esc(c.concepto || etiquetaTipoComision(c.tipo))} · <strong>${formatoMonto(c.monto)}</strong></td></tr>`).join('')}
              </table>
              ${mensajeError ? `<div class="ficha-pago-error">${mensajeError}</div>` : ''}
              ${pagado ? '' : `
                <div style="padding:14px 18px 0;">
                  <div class="form-group">
                    <label>Método de pago</label>
                    <select id="comPagoMetodo">${opcionesHtml(METODOS_PAGO, 'Efectivo')}</select>
                  </div>
                </div>`}
              <p class="ficha-pago-nota">${pagado
                ? `Pago registrado: ${detallePago}`
                : 'Al confirmar, todas las comisiones pendientes de este conductor dentro del período filtrado quedan marcadas como <strong>PAGADAS</strong>.'}</p>
            </div>
            <div class="modal-actions">
              <button type="button" class="btn" id="btnCerrarPagoCom2">${pagado ? 'Cerrar' : 'Cancelar'}</button>
              ${pagado ? '' : '<button type="button" class="btn primary" id="btnConfirmarPagoCom">Confirmar pago</button>'}
            </div>
          </div>
        </div>`;
      const cerrar = () => modal.innerHTML = '';
      document.getElementById('btnCerrarPagoCom').onclick = cerrar;
      document.getElementById('btnCerrarPagoCom2').onclick = cerrar;
      const confirmar = document.getElementById('btnConfirmarPagoCom');
      if (!confirmar) return;
      confirmar.onclick = async () => {
        const selector = document.getElementById('comPagoMetodo');
        confirmar.disabled = true;
        confirmar.textContent = 'Registrando el pago...';
        try {
          const res = await window.api.comisiones.pagarConductor({
            conductor_id: grupo.conductor_id,
            desde: filtros.desde,
            hasta: filtros.hasta,
            metodo: selector ? selector.value : null
          });
          detallePago = `${indicadorCantidad(res.pagadas)} comisión(es) por ${formatoMonto(res.total)} quedaron pagadas.`;
          await recargarComisiones();
          pintar(true, '');
        } catch (err) {
          console.error('No se pudieron pagar las comisiones del conductor:', err);
          pintar(false, `No se pudo registrar el pago: ${esc(err.message)}`);
        }
      };
    };
    pintar(false, '');
  }

  async function cargarEmpleados() {
    const busqueda = document.getElementById('buscarEmpleado').value.trim();
    const [datos, resumen, todos] = await Promise.all([
      window.api.empleados.listar({ busqueda }),
      window.api.empleados.resumen(),
      window.api.empleados.listar()
    ]);
    empleadosCache = todos;
    document.getElementById('empActivos').textContent = indicadorCantidad(resumen.activos);
    document.getElementById('empInactivos').textContent = indicadorCantidad(resumen.inactivos);
    document.getElementById('empNomina').textContent = formatoMonto(resumen.nominaMensual);
    document.getElementById('empConductoresVinculados').textContent = indicadorCantidad(todos.filter(e => e.conductor_id).length);
    document.getElementById('empTotal').textContent = indicadorCantidad(resumen.total);

    const cont = document.getElementById('tablaEmpleados');
    cont.innerHTML = `
      <table>
        <thead>
          <tr>
            <th>Código</th>
            <th>Nombre</th>
            <th>Cédula</th>
            <th>Cargo</th>
            <th>Conductor vinculado</th>
            <th style="text-align:right">Salario base</th>
            <th>Ingreso</th>
            <th>Estado</th>
            <th style="text-align:right">Acciones</th>
          </tr>
        </thead>
        <tbody>
          ${filaEmpleadoActiva ? `
            <tr class="bitacora-inline-row">
              <td><input class="bitacora-inline-control" data-campo="codigo" aria-label="Código" type="text" placeholder="Código"></td>
              <td><input class="bitacora-inline-control bitacora-inline-wide" data-campo="nombre" aria-label="Nombre del empleado" type="text" required placeholder="Nombre completo"></td>
              <td><input class="bitacora-inline-control" data-campo="cedula" aria-label="Cédula" type="text" placeholder="Cédula"></td>
              <td><input class="bitacora-inline-control" data-campo="cargo" aria-label="Cargo" type="text" placeholder="Cargo"></td>
              <td>
                <select class="bitacora-inline-control" data-campo="conductor" aria-label="Conductor vinculado">
                  <option value="">Sin vínculo</option>
                  ${conductoresTodos.map(c => {
                    const ocupado = empleadosCache.some(e => String(e.conductor_id) === String(c.id));
                    return `<option value="${esc(c.id)}"${ocupado ? ' disabled' : ''}>${esc(c.nombre)}${ocupado ? ' — vinculado' : ''}</option>`;
                  }).join('')}
                </select>
              </td>
              <td><input class="bitacora-inline-control" data-campo="salario" aria-label="Salario base" type="number" min="0" step="0.01" required placeholder="Salario"></td>
              <td><input class="bitacora-inline-control" data-campo="fechaIngreso" aria-label="Fecha de ingreso" type="date" value="${fechaHoy()}"></td>
              <td><select class="bitacora-inline-control" data-campo="activo" aria-label="Estado"><option value="1">Activo</option><option value="0">Inactivo</option></select></td>
              <td><div class="bitacora-inline-actions"><button class="btn btn-sm primary" data-accion="guardar" type="button">Guardar</button><button class="btn btn-sm" data-accion="cancelar" type="button">Cancelar</button></div></td>
            </tr>` : ''}
          ${!datos.length && !filaEmpleadoActiva ? '<tr><td class="empty" colspan="9">No hay empleados registrados. Use "+ Registrar Empleado" para comenzar.</td></tr>' : ''}
          ${datos.map(e => `
            <tr>
              ${(() => {
                const conductor = conductoresTodos.find(c => String(c.id) === String(e.conductor_id));
                return `
              <td><strong>${esc(e.codigo || '-')}</strong></td>
              <td>${esc(e.nombre)}</td>
              <td>${esc(e.cedula || '-')}</td>
              <td>${esc(e.cargo || '-')}</td>
              <td>${conductor ? esc(conductor.nombre) : '<span class="badge badge-warning">Sin vínculo</span>'}</td>
              <td style="text-align:right"><strong>${formatoMonto(e.salario_base)}</strong></td>
              <td>${esc(e.fecha_ingreso ? formatearFecha(e.fecha_ingreso) : '-')}</td>
              <td><span class="badge ${e.activo ? 'badge-success' : 'badge-danger'}">${e.activo ? 'Activo' : 'Inactivo'}</span></td>
              <td style="text-align:right">
                <div class="action-buttons" style="justify-content:flex-end;">
                  <button class="btn btn-sm btn-secondary btnEditarEmp" data-id="${e.id}">Editar</button>
                  <button class="btn btn-sm btn-danger btnEliminarEmp" data-id="${e.id}">Eliminar</button>
                </div>
              </td>
              `;
              })()}
            </tr>`).join('')}
        </tbody>
      </table>`;

    const filaNueva = cont.querySelector('.bitacora-inline-row');
    if (filaNueva) {
      filaNueva.querySelector('[data-accion="cancelar"]').onclick = () => { filaEmpleadoActiva = false; cargarEmpleados(); };
      filaNueva.querySelector('[data-accion="guardar"]').onclick = async event => {
        const boton = event.currentTarget;
        const invalidos = [...filaNueva.querySelectorAll('input, select')].find(input => !input.checkValidity());
        if (invalidos) { invalidos.reportValidity(); return; }
        const valor = campo => filaNueva.querySelector(`[data-campo="${campo}"]`).value.trim();
        boton.disabled = true;
        boton.textContent = 'Guardando...';
        try {
          await window.api.empleados.guardar({
            id: null,
            codigo: valor('codigo'),
            cedula: valor('cedula'),
            nombre: valor('nombre'),
            cargo: valor('cargo'),
            salario_base: Number(valor('salario')) || 0,
            conductor_id: valor('conductor') || null,
            fecha_ingreso: valor('fechaIngreso'),
            activo: parseInt(valor('activo'), 10)
          });
          filaEmpleadoActiva = false;
          await cargarEmpleados();
        } catch (err) {
          console.error('No se pudo guardar el empleado desde la tabla:', err);
          avisarError('No se pudo guardar el empleado', err.message);
          boton.disabled = false;
          boton.textContent = 'Guardar';
        }
      };
    }

    cont.querySelectorAll('.btnEditarEmp').forEach(b => {
      b.onclick = () => modalEmpleado(datos.find(x => x.id == b.dataset.id));
    });
    cont.querySelectorAll('.btnEliminarEmp').forEach(b => {
      b.onclick = async () => {
        if (!await confirmarAccion({ estado: 'error', titulo: '¿Eliminar este empleado?', mensaje: 'Esta acción no se puede deshacer.', botonOk: 'Eliminar', okPeligroso: true })) return;
        try {
          await window.api.empleados.eliminar(b.dataset.id);
          await cargarEmpleados();
        } catch (err) {
          avisarError('No se pudo completar la acción', err.message);
        }
      };
    });
  }

  function modalEmpleado(item = null) {
    const modal = document.getElementById('modalPlanillaContainer');
    const opcionesConductores = conductoresTodos.map(c => {
      const ocupado = empleadosCache.find(e => String(e.conductor_id) === String(c.id) && (!item || String(e.id) !== String(item.id)));
      const seleccionado = item && String(item.conductor_id) === String(c.id);
      return `<option value="${c.id}" ${seleccionado ? 'selected' : ''} ${ocupado ? 'disabled' : ''}>${esc(c.nombre)}${c.activo ? '' : ' (inactivo)'}${ocupado ? ` — vinculado a ${esc(ocupado.nombre)}` : ''}</option>`;
    }).join('');
    modal.innerHTML = `
      <div class="modal-overlay">
        <div class="modal-box">
          <div class="modal-header">
            <h3>${item ? 'Editar Empleado' : 'Registrar Empleado'}</h3>
            <button class="modal-close" id="btnCerrarModalEmp">&times;</button>
          </div>
          <form id="formEmpleado">
            <div class="form-row">
              <div class="form-group">
                <label>Código</label>
                <input id="empCodigo" type="text" placeholder="Ej. EMP-005" value="${item && item.codigo ? esc(item.codigo) : ''}">
              </div>
              <div class="form-group">
                <label>Cédula / Documento</label>
                <input id="empCedula" type="text" value="${item && item.cedula ? esc(item.cedula) : ''}">
              </div>
            </div>
            <div class="form-row full">
              <div class="form-group">
                <label>Nombre completo *</label>
                <input id="empNombre" type="text" required value="${item ? esc(item.nombre) : ''}">
              </div>
            </div>
            <div class="form-row">
              <div class="form-group">
                <label>Cargo</label>
                <input id="empCargo" type="text" placeholder="Conductor, administrador..." value="${item && item.cargo ? esc(item.cargo) : ''}">
              </div>
              <div class="form-group">
                <label>Salario base *</label>
                <input id="empSalario" type="number" step="0.01" min="0" required value="${item ? item.salario_base : ''}">
              </div>
            </div>
            <div class="form-row">
              <div class="form-group">
                <label>Fecha de ingreso</label>
                <input id="empFechaIngreso" type="date" value="${item && item.fecha_ingreso ? esc(item.fecha_ingreso) : fechaHoy()}">
              </div>
              <div class="form-group">
                <label>Estado</label>
                <select id="empActivo">
                  <option value="1" ${item && item.activo === 0 ? '' : 'selected'}>Activo</option>
                  <option value="0" ${item && item.activo === 0 ? 'selected' : ''}>Inactivo</option>
                </select>
              </div>
            </div>
            <div class="form-row full">
              <div class="form-group">
                <label>Conductor asociado para comisiones y viáticos</label>
                <select id="empConductor">
                  <option value="">Sin conductor asociado</option>
                  ${opcionesConductores}
                </select>
                <small class="planilla-ayuda">Vincule la persona que recibe las comisiones y viáticos de este empleado.</small>
              </div>
            </div>
            <div class="modal-actions">
              <button type="button" class="btn" id="btnCancelarEmp">Cancelar</button>
              <button type="submit" class="btn primary">Guardar Empleado</button>
            </div>
          </form>
        </div>
      </div>`;

    document.getElementById('btnCerrarModalEmp').onclick = () => modal.innerHTML = '';
    document.getElementById('btnCancelarEmp').onclick = () => modal.innerHTML = '';
    document.getElementById('formEmpleado').onsubmit = async (e) => {
      e.preventDefault();
      const payload = {
        id: item ? item.id : null,
        codigo: document.getElementById('empCodigo').value.trim(),
        cedula: document.getElementById('empCedula').value.trim(),
        nombre: document.getElementById('empNombre').value.trim(),
        cargo: document.getElementById('empCargo').value.trim(),
        salario_base: parseFloat(document.getElementById('empSalario').value) || 0,
        conductor_id: document.getElementById('empConductor').value || null,
        fecha_ingreso: document.getElementById('empFechaIngreso').value,
        activo: parseInt(document.getElementById('empActivo').value, 10)
      };
      if (!payload.nombre) {
        avisarAdvertencia('Falta el nombre', 'El nombre del empleado es obligatorio.');
        return;
      }
      try {
        await window.api.empleados.guardar(payload);
        modal.innerHTML = '';
        await cargarEmpleados();
      } catch (err) {
        avisarError('No se pudo completar la acción', err.message);
      }
    };
  }


  document.getElementById('btnGenerarPlanilla').onclick = () => modalGenerarPlanilla();
  document.getElementById('btnNuevoEmpleado').onclick = () => modalEmpleado();
  document.getElementById('btnAgregarFilaEmpleado').onclick = async () => {
    if (filaEmpleadoActiva) { document.querySelector('#tablaEmpleados [data-campo="codigo"]')?.focus(); return; }
    filaEmpleadoActiva = true; await cargarEmpleados();
    document.querySelector('#tablaEmpleados [data-campo="codigo"]')?.focus();
  };
  document.getElementById('btnFiltrarPla').onclick = () => cargarPlanillas();
  document.getElementById('btnLimpiarPla').onclick = () => {
    document.getElementById('plaDesde').value = fechaHaceDias(120);
    document.getElementById('plaHasta').value = ultimoDiaDelMesActual();
    document.getElementById('plaFiltroEstado').value = '';
    document.getElementById('plaBuscar').value = '';
    cargarPlanillas();
  };
  document.getElementById('btnBuscarEmpleado').onclick = () => cargarEmpleados();
  document.getElementById('btnLimpiarEmpleado').onclick = () => {
    document.getElementById('buscarEmpleado').value = '';
    cargarEmpleados();
  };

  await Promise.all([cargarPlanillas(), cargarEmpleados(), cargarListaViaticos(), cargarResumenViaticos(), cargarListaComisiones(), cargarResumenComisiones()]);
}


// ---------------------------------------------------------------- base de datos

function tamanoLegible(bytes) {
  if (!bytes) return '0 KB';
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

// Monta el panel de administración de la base de datos dentro de Configuración.
async function montarPanelBaseDatos() {
  const cont = document.getElementById('panelBaseDatos');
  if (!cont) return;

  const info = await window.api.sistema.info();
  const totalFilas = info.totales.reduce((s, t) => s + t.filas, 0);
  const auditoria = await window.api.sistema.auditoria({ limite: 8 });

  cont.innerHTML = `
    <div class="metrics-grid" style="margin-bottom:16px;">
      <div class="card"><div class="card-label">Archivo</div><div class="card-value" style="font-size:14px; word-break:break-all;">${esc(info.archivo)}</div></div>
      <div class="card"><div class="card-label">Tamaño</div><div class="card-value">${tamanoLegible(info.tamanio)}</div></div>
      <div class="card"><div class="card-label">Registros almacenados</div><div class="card-value">${indicadorCantidad(totalFilas)}</div></div>
      <div class="card"><div class="card-label">SQLite / Esquema</div><div class="card-value" style="font-size:16px;">v${esc(info.sqlite)} · esquema ${esc(info.version)}</div></div>
    </div>

    <p style="font-size:13px; color:var(--muted);">
      La información se guarda automáticamente en <strong>${esc(info.carpeta)}</strong>.
      Los respaldos se escriben en <strong>${esc(info.carpetaRespaldos)}</strong>.
    </p>

    <div class="toolbar">
      <button id="btnRespaldar" class="btn primary">Crear respaldo</button>
      <button id="btnAbrirCarpeta" class="btn secondary">Abrir carpeta</button>
      <button id="btnCargarEjemplo" class="btn btn-secondary">Cargar datos de ejemplo</button>
      <button id="btnLimpiarOperativo" class="btn btn-warning">Borrar movimientos</button>
      <button id="btnLimpiarTotal" class="btn btn-danger">Borrar TODOS los datos</button>
    </div>

    <div class="table-wrap" style="max-height:260px; overflow:auto;">
      <table>
        <thead><tr><th>Tabla</th><th style="text-align:right">Registros</th></tr></thead>
        <tbody>
          ${info.totales.map(t => `<tr><td>${esc(t.tabla)}</td><td style="text-align:right">${indicadorCantidad(t.filas)}</td></tr>`).join('')}
        </tbody>
      </table>
    </div>

    <h3 style="margin-top:22px;">Últimos movimientos registrados</h3>
    <div class="table-wrap">
      ${auditoria.length ? `
        <table>
          <thead><tr><th>Fecha</th><th>Módulo</th><th>Acción</th><th>Detalle</th></tr></thead>
          <tbody>
            ${auditoria.map(a => `<tr><td>${esc(formatearFechaHora(a.fecha))}</td><td>${esc(a.modulo)}</td><td>${esc(a.accion)}</td><td>${esc(a.descripcion || '-')}</td></tr>`).join('')}
          </tbody>
        </table>` : vacio('Todavía no hay movimientos de auditoría registrados.')}
    </div>
  `;

  document.getElementById('btnRespaldar').onclick = async () => {
    try {
      const res = await window.api.sistema.respaldo();
      avisar({ estado: 'exito', titulo: 'Respaldo creado', mensaje: 'La copia de seguridad se guardó correctamente.', detalles: [['Archivo', textoSeguro(res.archivo)], ['Tamaño', textoSeguro(tamanoLegible(res.tamanio))]] });
    } catch (err) {
      avisarError('No se pudo crear el respaldo', err.message);
    }
  };

  document.getElementById('btnAbrirCarpeta').onclick = () => window.api.sistema.abrirCarpeta();

  document.getElementById('btnCargarEjemplo').onclick = async () => {
    if (!await confirmarAccion({ titulo: '¿Cargar datos de ejemplo?', mensaje: 'Se cargarán datos de ejemplo solo en las tablas que estén vacías.', botonOk: 'Cargar datos' })) return;
    try {
      const res = await window.api.sistema.datosEjemplo();
      const filas = Object.entries(res.insertados).map(([t, n]) => [textoSeguro(t), n]);
      if (filas.length) avisar({ estado: 'exito', titulo: 'Datos de ejemplo cargados', detalles: filas });
      else avisar({ estado: 'info', titulo: 'No se insertó nada', mensaje: 'Todas las tablas ya contienen información.' });
      await montarPanelBaseDatos();
    } catch (err) {
      avisarError('No se pudieron cargar los datos de ejemplo', err.message);
    }
  };

  document.getElementById('btnLimpiarOperativo').onclick = async () => {
    if (!await confirmarAccion({ estado: 'advertencia', titulo: '¿Borrar los movimientos?', mensaje: 'Se borrarán ingresos, egresos, viáticos, planillas, combustible y bitácora. Los catálogos (clientes, vehículos, conductores y empleados) se conservan.', botonOk: 'Borrar movimientos', okPeligroso: true })) return;
    try {
      await window.api.sistema.limpiar('operativo');
      avisarExito('Movimientos borrados', 'Los catálogos se conservaron.');
      await montarPanelBaseDatos();
    } catch (err) {
      avisarError('No se pudieron borrar los movimientos', err.message);
    }
  };

  document.getElementById('btnLimpiarTotal').onclick = async () => {
    if (!await confirmarEscribiendo({ titulo: '¿Borrar TODA la información?', mensaje: 'Esta acción borra todo, incluyendo clientes, vehículos, conductores y empleados. No se puede deshacer.', palabra: 'BORRAR', botonOk: 'Borrar todo' })) return;
    try {
      await window.api.sistema.limpiar('total');
      avisarExito('Base de datos vacía', 'Quedó lista para usarse con información real.');
      await montarPanelBaseDatos();
    } catch (err) {
      avisarError('No se pudieron borrar los datos', err.message);
    }
  };
}
