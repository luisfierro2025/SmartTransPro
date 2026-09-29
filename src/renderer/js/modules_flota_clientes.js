// Módulo Flota: Vehículos, Conductores y Combustible
async function renderFlota(){
  content.innerHTML = `
    <div class="page-intro page-head">
      <div>
        <h2>Control de Flota, Conductores y Combustible</h2>
        <p>Gestión de unidades de transporte, asignación de choferes, consumo de combustible y monitoreo en vivo.</p>
      </div>
      <div class="page-actions">
        <button id="btnNuevoVehiculo" class="btn primary">+ Registrar Vehículo</button>
        <button id="btnNuevoConductor" class="btn secondary">+ Registrar Conductor</button>
        <button id="btnNuevoCombustible" class="btn btn-warning">+ Cargar Combustible</button>
      </div>
    </div>

    <div class="nav-tabs">
      <button class="tab-btn active" data-tab="tabVehiculos">Vehículos / Unidades</button>
      <button class="tab-btn" data-tab="tabConductores">Conductores / Choferes</button>
      <button class="tab-btn" data-tab="tabCombustible">Control de Combustible</button>
      <button class="tab-btn" data-tab="tabMonitoreo">📍 Monitoreo</button>
    </div>

    <div id="tabVehiculos" class="tab-content active">
      <div class="panel" style="margin-top:0;">
        <div class="toolbar">
          <div class="field">
            <label>Buscar Vehículo</label>
            <input id="buscarVehiculo" type="text" placeholder="Código, placa, marca...">
          </div>
          <button id="btnBuscarVehiculo" class="btn primary">Buscar</button>
          <button id="btnLimpiarVehiculo" class="btn">Limpiar</button>
        </div>
        <div id="tablaVehiculos" class="table-wrap">
          <div class="empty">Cargando unidades...</div>
        </div>
      </div>
    </div>

    <div id="tabConductores" class="tab-content">
      <div class="panel" style="margin-top:0;">
        <div class="toolbar">
          <div class="field">
            <label>Buscar Conductor</label>
            <input id="buscarConductor" type="text" placeholder="Nombre, cédula/licencia...">
          </div>
          <button id="btnBuscarConductor" class="btn primary">Buscar</button>
          <button id="btnLimpiarConductor" class="btn">Limpiar</button>
        </div>
        <div id="tablaConductores" class="table-wrap">
          <div class="empty">Cargando conductores...</div>
        </div>
      </div>
    </div>

    <div id="tabCombustible" class="tab-content">
      <div class="metrics-grid" style="margin-bottom:16px;">
        <div class="card">
          <div class="card-label">Total Cargas</div>
          <div id="combResumenCargas" class="card-value">0</div>
        </div>
        <div class="card">
          <div class="card-label">Total Litros / Galones</div>
          <div id="combResumenLitros" class="card-value">0.00</div>
        </div>
        <div class="card">
          <div class="card-label">Gasto Total Acumulado</div>
          <div id="combResumenGasto" class="card-value" style="color:var(--danger)">-</div>
        </div>
        <div class="card">
          <div class="card-label">Distancia Recorrida (Odómetro)</div>
          <div id="combResumenKm" class="card-value">0 km</div>
        </div>
        <div class="card">
          <div class="card-label">Rendimiento Promedio</div>
          <div id="combResumenRendimiento" class="card-value positive">0.00 km/L</div>
        </div>
        <div class="card">
          <div class="card-label">Costo por Kilómetro</div>
          <div id="combResumenCostoKm" class="card-value">-</div>
        </div>
      </div>

      <!-- Tabla de Rendimiento y Eficiencia por Vehículo -->
      <div class="panel" style="margin-top:0; margin-bottom:18px;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
          <h3 style="margin:0; font-size:16px;">📊 Eficiencia y Rendimiento por Vehículo</h3>
          <span style="font-size:12px; color:var(--muted);">Calculado entre kilometrajes de cargas registradas</span>
        </div>
        <div id="tablaRendimientoVehiculos" class="table-wrap">
          <div class="empty">Calculando rendimiento de la flota...</div>
        </div>
      </div>

      <div class="panel" style="margin-top:0;">
        <div class="toolbar">
          <div class="field">
            <label>Buscar Carga</label>
            <input id="buscarCombustible" type="text" placeholder="Placa, conductor, estación, factura...">
          </div>
          <div class="field">
            <label>Filtrar por Vehículo</label>
            <select id="filtroCombVehiculo">
              <option value="">Todos los vehículos</option>
            </select>
          </div>
          <button id="btnBuscarCombustible" class="btn primary">Buscar</button>
          <button id="btnLimpiarCombustible" class="btn">Limpiar</button>
        </div>
        <div id="tablaCombustible" class="table-wrap">
          <div class="empty">Cargando registros de combustible...</div>
        </div>
      </div>
    </div>

    <div id="tabMonitoreo" class="tab-content"></div>

    <div id="modalFlotaContainer"></div>
  `;

  // Gestión de Tabs
  const tabBtns = content.querySelectorAll('.tab-btn');
  const tabContents = content.querySelectorAll('.tab-content');
  const monitoreo = iniciarMonitoreo(document.getElementById('tabMonitoreo'));
  tabBtns.forEach(b => {
    b.addEventListener('click', () => {
      tabBtns.forEach(x => x.classList.remove('active'));
      tabContents.forEach(x => x.classList.remove('active'));
      b.classList.add('active');
      document.getElementById(b.dataset.tab).classList.add('active');
      // El mapa necesita su contenedor visible: se activa después de mostrar la pestaña.
      if (b.dataset.tab === 'tabMonitoreo') monitoreo.activar(); else monitoreo.desactivar();
    });
  });

  // Funciones Vehículos
  async function cargarVehiculos(){
    const busqueda = document.getElementById('buscarVehiculo').value.trim();
    const datos = await window.api.vehiculos.listar({ busqueda });
    const cont = document.getElementById('tablaVehiculos');
    if(!datos.length){
      cont.innerHTML = '<div class="empty">No hay vehículos registrados.</div>';
      return;
    }
    cont.innerHTML = `
      <table>
        <thead>
          <tr>
            <th>Código</th>
            <th>Placa</th>
            <th>Marca / Modelo</th>
            <th>Año</th>
            <th>Estado</th>
            <th style="text-align:right">Acciones</th>
          </tr>
        </thead>
        <tbody>
          ${datos.map(v => `
            <tr>
              <td><strong>${esc(v.codigo)}</strong></td>
              <td><span style="font-family:monospace; font-weight:700; background:#eaecf0; padding:3px 7px; border-radius:4px;">${esc(v.placa)}</span></td>
              <td>${esc(v.marca)} ${esc(v.modelo)}</td>
              <td>${v.anio || 'N/D'}</td>
              <td><span class="badge ${v.activo ? 'badge-success' : 'badge-danger'}">${v.activo ? 'Activo' : 'Inactivo'}</span></td>
              <td style="text-align:right">
                <div class="action-buttons" style="justify-content:flex-end;">
                  <button class="btn btn-sm btn-secondary btnEditarVeh" data-id="${v.id}">Editar</button>
                  <button class="btn btn-sm btn-danger btnEliminarVeh" data-id="${v.id}">Eliminar</button>
                </div>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;

    cont.querySelectorAll('.btnEditarVeh').forEach(b => {
      b.onclick = () => {
        const item = datos.find(x => x.id == b.dataset.id);
        modalVehiculo(item);
      };
    });

    cont.querySelectorAll('.btnEliminarVeh').forEach(b => {
      b.onclick = async () => {
        if(await confirmarAccion({estado:'error',titulo:'¿Eliminar esta unidad?',mensaje:'Si tiene viajes o combustible asociados no podrá borrarse.',botonOk:'Eliminar',okPeligroso:true})){
          try {
            await window.api.vehiculos.eliminar(b.dataset.id);
            cargarVehiculos();
          } catch(err) {
            { if(/foreign key|viola|constraint|referenc/i.test(err.message || '')) avisarAdvertencia('No se puede eliminar la unidad', 'El vehículo está vinculado a viajes o combustible.'); else avisarError('No se pudo eliminar', err.message); }
          }
        }
      };
    });
  }

  function modalVehiculo(item = null){
    const modal = document.getElementById('modalFlotaContainer');
    modal.innerHTML = `
      <div class="modal-overlay">
        <div class="modal-box" style="max-width:500px;">
          <div class="modal-header">
            <h3>${item ? 'Editar Vehículo' : 'Registrar Nuevo Vehículo'}</h3>
            <button class="modal-close" id="btnCerrarModalVeh">&times;</button>
          </div>
          <form id="formVehiculo">
            <div class="form-row">
              <div class="form-group">
                <label>Código Interno *</label>
                <input id="vehCodigo" type="text" placeholder="Ej. V-01" required value="${item ? item.codigo : ''}">
              </div>
              <div class="form-group">
                <label>Número de Placa *</label>
                <input id="vehPlaca" type="text" placeholder="Ej. M 234-890" required value="${item ? item.placa : ''}">
              </div>
            </div>
            <div class="form-row">
              <div class="form-group">
                <label>Marca *</label>
                <input id="vehMarca" type="text" placeholder="Ej. Freightliner, Hino..." required value="${item ? item.marca : ''}">
              </div>
              <div class="form-group">
                <label>Modelo *</label>
                <input id="vehModelo" type="text" placeholder="Ej. Cascadia, 500 Series" required value="${item ? item.modelo : ''}">
              </div>
            </div>
            <div class="form-row">
              <div class="form-group">
                <label>Año</label>
                <input id="vehAnio" type="number" min="1980" max="2030" placeholder="Ej. 2022" value="${item && item.anio ? item.anio : ''}">
              </div>
              <div class="form-group">
                <label>Estado</label>
                <select id="vehActivo">
                  <option value="1" ${item && item.activo===1 ? 'selected' : ''}>Activo (Disponible)</option>
                  <option value="0" ${item && item.activo===0 ? 'selected' : ''}>Inactivo (Taller / Fuera)</option>
                </select>
              </div>
            </div>
            <div class="modal-actions">
              <button type="button" class="btn" id="btnCancelVeh">Cancelar</button>
              <button type="submit" class="btn primary">Guardar Unidad</button>
            </div>
          </form>
        </div>
      </div>
    `;
    document.getElementById('btnCerrarModalVeh').onclick = () => modal.innerHTML = '';
    document.getElementById('btnCancelVeh').onclick = () => modal.innerHTML = '';
    document.getElementById('formVehiculo').onsubmit = async (e) => {
      e.preventDefault();
      await window.api.vehiculos.guardar({
        id: item ? item.id : null,
        codigo: document.getElementById('vehCodigo').value.trim(),
        placa: document.getElementById('vehPlaca').value.trim(),
        marca: document.getElementById('vehMarca').value.trim(),
        modelo: document.getElementById('vehModelo').value.trim(),
        anio: parseInt(document.getElementById('vehAnio').value) || null,
        activo: parseInt(document.getElementById('vehActivo').value)
      });
      modal.innerHTML = '';
      cargarVehiculos();
    };
  }

  // Funciones Conductores
  async function cargarConductores(){
    const busqueda = document.getElementById('buscarConductor').value.trim();
    const datos = await window.api.conductores.listar({ busqueda });
    const cont = document.getElementById('tablaConductores');
    if(!datos.length){
      cont.innerHTML = '<div class="empty">No hay conductores registrados.</div>';
      return;
    }
    cont.innerHTML = `
      <table>
        <thead>
          <tr>
            <th>Nombre del Conductor</th>
            <th>Cédula</th>
            <th>N° Licencia</th>
            <th>Estado</th>
            <th style="text-align:right">Acciones</th>
          </tr>
        </thead>
        <tbody>
          ${datos.map(c => `
            <tr>
              <td><strong>${esc(c.nombre)}</strong></td>
              <td>${c.documento || '<span style="color:var(--muted)">Sin cédula</span>'}</td>
              <td>${c.numero_licencia || '<span style="color:var(--muted)">Sin licencia</span>'}</td>
              <td><span class="badge ${c.activo ? 'badge-success' : 'badge-danger'}">${c.activo ? 'Activo' : 'Inactivo'}</span></td>
              <td style="text-align:right">
                <div class="action-buttons" style="justify-content:flex-end;">
                  <button class="btn btn-sm btn-secondary btnDocsCond" data-id="${c.id}">Documentos</button>
                  <button class="btn btn-sm btn-secondary btnEditarCond" data-id="${c.id}">Editar</button>
                  <button class="btn btn-sm btn-danger btnEliminarCond" data-id="${c.id}">Eliminar</button>
                </div>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;

    cont.querySelectorAll('.btnDocsCond').forEach(b => {
      b.onclick = () => {
        const item = datos.find(x => x.id == b.dataset.id);
        modalDocumentosConductor(item);
      };
    });

    cont.querySelectorAll('.btnEditarCond').forEach(b => {
      b.onclick = () => {
        const item = datos.find(x => x.id == b.dataset.id);
        modalConductor(item);
      };
    });

    cont.querySelectorAll('.btnEliminarCond').forEach(b => {
      b.onclick = async () => {
        if(await confirmarAccion({estado:'error',titulo:'¿Eliminar este conductor?',mensaje:'Si tiene viajes asignados no podrá borrarse.',botonOk:'Eliminar',okPeligroso:true})){
          try {
            await window.api.conductores.eliminar(b.dataset.id);
            cargarConductores();
          } catch(err) {
            { if(/foreign key|viola|constraint|referenc/i.test(err.message || '')) avisarAdvertencia('No se puede eliminar el conductor', 'El conductor tiene viajes asignados.'); else avisarError('No se pudo eliminar', err.message); }
          }
        }
      };
    });
  }

  // Ficha de documentos (solo lectura) de un conductor: cada imagen tiene sus
  // propios botones de Imprimir (PDF profesional) y Descargar, y además hay un
  // botón para descargar los 3 documentos de una sola vez a una carpeta.
  function modalDocumentosConductor(item){
    const modal = document.getElementById('modalFlotaContainer');
    const documentos = [
      { id: 'frontal', etiqueta: 'Imagen Frontal de la Licencia', src: item.licencia_frontal },
      { id: 'trasera', etiqueta: 'Imagen Trasera de la Licencia', src: item.licencia_trasera },
      { id: 'carnet', etiqueta: 'Carnet Federación Transporte', src: item.carnet_federacion }
    ];
    const nombreArchivo = d => `${item.nombre}-${d.id}`.trim().replace(/\s+/g, '-');
    const caja = d => `
      <div class="form-group">
        <label>${d.etiqueta}</label>
        <div class="doc-box">${d.src
          ? `<img src="${d.src}" class="doc-thumb" onclick="window.open('${d.src.replace(/'/g, "\\'")}','_blank')">`
          : `<span class="doc-empty">Sin imagen</span>`}</div>
        <div class="doc-box-acciones">
          <button type="button" class="btn btn-sm btn-secondary btnImprimirDoc" data-doc="${d.id}" ${d.src ? '' : 'disabled'}>🖨️ Imprimir</button>
          <button type="button" class="btn btn-sm btn-secondary btnDescargarDoc" data-doc="${d.id}" ${d.src ? '' : 'disabled'}>⬇️ Descargar</button>
        </div>
      </div>`;
    const hayAlguno = documentos.some(d => d.src);
    modal.innerHTML = `
      <div class="modal-overlay">
        <div class="modal-box" style="max-width:700px;">
          <div class="modal-header">
            <h3>Documentos de ${esc(item.nombre)}</h3>
            <button class="modal-close" id="btnCerrarModalDocs">&times;</button>
          </div>
          <div class="form-row" style="grid-template-columns:1fr 1fr 1fr;">
            ${documentos.map(caja).join('')}
          </div>
          <div class="modal-actions" style="justify-content:space-between;">
            <button type="button" class="btn btn-secondary" id="btnDescargarTodosDocs" ${hayAlguno ? '' : 'disabled'}>⬇️ Descargar los 3 documentos</button>
            <button type="button" class="btn primary" id="btnCerrarModalDocs2">Cerrar</button>
          </div>
        </div>
      </div>
    `;
    modal.querySelector('#btnCerrarModalDocs').onclick = () => modal.innerHTML = '';
    modal.querySelector('#btnCerrarModalDocs2').onclick = () => modal.innerHTML = '';

    // Imprimir un documento elegido como PDF profesional (membrete, datos del
    // conductor y la imagen), no una impresión básica del navegador.
    modal.querySelectorAll('.btnImprimirDoc').forEach(b => {
      b.onclick = () => {
        const d = documentos.find(x => x.id === b.dataset.doc);
        if (!d || !d.src) return;
        imprimirComoPdf({
          titulo: `Documento de Conductor: ${d.etiqueta}`,
          subtitulo: `Conductor: ${esc(item.nombre)}${item.documento ? ' · Cédula: ' + esc(item.documento) : ''}${item.numero_licencia ? ' · Licencia: ' + item.numero_licencia : ''}`,
          cuerpoHtml: `<div style="text-align:center;margin-top:12px;"><img src="${d.src}" style="max-width:100%;max-height:220mm;border:1px solid #d0d5dd;border-radius:6px;"></div>`,
          piePersonalizado: '<div></div>',
          nombreArchivo: nombreArchivo(d)
        }, b);
      };
    });

    // Descargar un solo documento elegido por el usuario.
    modal.querySelectorAll('.btnDescargarDoc').forEach(b => {
      b.onclick = async () => {
        const d = documentos.find(x => x.id === b.dataset.doc);
        if (!d || !d.src) return;
        const textoOriginal = b.innerHTML;
        b.disabled = true; b.innerHTML = 'Guardando...';
        const ficha = {
          documentoTitulo: 'Documento',
          campos: [
            ['Conductor', item.nombre],
            ['Documento', d.etiqueta]
          ],
          miniatura: d.src
        };
        try {
          const resultado = await descargarDocumento(d.src, nombreArchivo(d));
          if (resultado && resultado.ok === false && !resultado.cancelado) {
            mostrarFichaImpresion({
              estado: 'error',
              titulo: 'No se pudo descargar el documento',
              subtitulo: resultado.error || 'Ocurrió un problema al guardar el archivo.',
              ...ficha,
              boton: 'Cerrar'
            });
          } else if (resultado && resultado.ok) {
            mostrarFichaImpresion({
              estado: 'exito',
              titulo: 'Documento descargado',
              subtitulo: 'El archivo ya está en tu equipo.',
              ...ficha,
              pasos: [
                'Busca el archivo en tu carpeta de descargas o en la carpeta indicada.',
                'Ábrelo para verificar que la imagen se vea completa.'
              ],
              boton: 'Entendido'
            });
          }
        } catch (err) {
          mostrarFichaImpresion({
            estado: 'error',
            titulo: 'No se pudo descargar el documento',
            subtitulo: err.message,
            ...ficha,
            boton: 'Cerrar'
          });
        } finally {
          b.disabled = false; b.innerHTML = textoOriginal;
        }
      };
    });

    // Descargar los 3 documentos juntos, en una carpeta elegida por el usuario
    // (en la nube, en la carpeta de descargas del navegador).
    const btnTodos = modal.querySelector('#btnDescargarTodosDocs');
    if (btnTodos) btnTodos.onclick = async () => {
      const textoOriginal = btnTodos.innerHTML;
      btnTodos.disabled = true; btnTodos.innerHTML = 'Guardando...';
      const presentes = documentos.filter(d => d.src);
      const ficha = {
        documentoTitulo: 'Documentos del conductor',
        campos: [
          ['Conductor', item.nombre],
          ...(item.documento ? [['Cédula', item.documento]] : []),
          ['Documentos', `${presentes.length} de 3 disponibles`]
        ]
      };
      try {
        const archivos = presentes.map(d => ({ nombre: nombreArchivo(d), dataUrl: d.src }));
        const resultado = await descargarDocumentos(archivos, `Elegir carpeta para los documentos de ${item.nombre}`);
        if (resultado && resultado.ok === false && !resultado.cancelado) {
          mostrarFichaImpresion({
            estado: 'error',
            titulo: 'No se pudieron descargar los documentos',
            subtitulo: resultado.error || 'Ocurrió un problema al guardar los archivos.',
            ...ficha,
            boton: 'Cerrar'
          });
        } else if (resultado && resultado.ok) {
          mostrarFichaImpresion({
            estado: 'exito',
            titulo: 'Documentos descargados',
            subtitulo: `Se guardaron ${(resultado.guardados || []).length} archivo(s) correctamente.`,
            ...ficha,
            pasos: [
              'Revisa tu carpeta de descargas o la carpeta que indicaste.',
              'Verifica que cada imagen se vea completa y legible.'
            ],
            boton: 'Entendido'
          });
        }
      } catch (err) {
        mostrarFichaImpresion({
          estado: 'error',
          titulo: 'No se pudieron descargar los documentos',
          subtitulo: err.message,
          ...ficha,
          boton: 'Cerrar'
        });
      } finally {
        btnTodos.disabled = false; btnTodos.innerHTML = textoOriginal;
      }
    };
  }

  function modalConductor(item = null){
    const modal = document.getElementById('modalFlotaContainer');
    const ICONO_SUBIR = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>`;
    // En Postgres "activo" es booleano y en SQLite 0/1: se normaliza para que
    // editar un conductor inactivo no lo vuelva a activar sin querer.
    const activoActual = item ? (item.activo === false || item.activo === 0 ? 0 : 1) : 1;

    // Contenido del recuadro punteado: la miniatura si ya hay imagen.
    const contenidoDoc = src => src
      ? `<img src="${src}" class="doc-thumb" alt="Documento cargado">`
      : `<span class="doc-vacio">${ICONO_SUBIR}<strong>Subir imagen</strong><span class="doc-pista">Clic o arrastra · JPG / PNG</span></span>`;

    // El <input type="file"> real queda oculto (.doc-input): se dispara desde
    // el recuadro o desde el botón, que siguen el estilo del resto de la ficha.
    const cajaDoc = (id, src, etiqueta) => `
      <div class="form-group">
        <label>${etiqueta}</label>
        <div class="doc-box doc-zona${src ? ' doc-lleno' : ''}" id="${id}Box" role="button" tabindex="0"
             title="Haz clic o arrastra una imagen sobre este recuadro">${contenidoDoc(src)}</div>
        <input type="file" id="${id}Input" accept="image/*" class="doc-input">
        <div class="doc-acciones">
          <label class="doc-btn" for="${id}Input">${ICONO_SUBIR} Seleccionar imagen</label>
          <button type="button" class="btn btn-sm btn-danger" id="${id}Quitar"${src ? '' : ' hidden'}>Quitar</button>
        </div>
      </div>`;
    modal.innerHTML = `
      <div class="modal-overlay">
        <div class="modal-box" style="max-width:650px;">
          <div class="modal-header">
            <h3>${item ? 'Editar Conductor' : 'Registrar Conductor'}</h3>
            <button class="modal-close" id="btnCerrarModalCond">&times;</button>
          </div>
          <form id="formConductor">
            <div class="form-row">
              <div class="form-group">
                <label>Nombre Completo *</label>
                <input id="condNombre" type="text" placeholder="Ej. Carlos Mendoza Rivas" required value="${item ? item.nombre : ''}">
              </div>
              <div class="form-group">
                <label>Cédula</label>
                <input id="condDoc" type="text" placeholder="Ej. 001-120584-0023K" value="${item && item.documento ? item.documento : ''}">
              </div>
            </div>
            <div class="form-row">
              <div class="form-group">
                <label>Número de Licencia</label>
                <input id="condLicencia" type="text" placeholder="Ej. LIC-778899" value="${item && item.numero_licencia ? item.numero_licencia : ''}">
              </div>
              <div class="form-group">
                <label>Estado</label>
                <select id="condActivo">
                  <option value="1" ${activoActual === 1 ? 'selected' : ''}>Activo (Disponible para viajes)</option>
                  <option value="0" ${activoActual === 0 ? 'selected' : ''}>Inactivo (Baja / Permiso)</option>
                </select>
              </div>
            </div>
            <div class="form-row" style="grid-template-columns:1fr 1fr 1fr;">
              ${cajaDoc('condFrontal', item && item.licencia_frontal, 'Imagen Frontal de la Licencia')}
              ${cajaDoc('condTrasera', item && item.licencia_trasera, 'Imagen Trasera de la Licencia')}
              ${cajaDoc('condCarnet', item && item.carnet_federacion, 'Carnet Federación Transporte')}
            </div>
            <div class="aviso-error" id="condAviso" hidden></div>
            <div class="modal-actions">
              <button type="button" class="btn" id="btnCancelCond">Cancelar</button>
              <button type="submit" class="btn primary" id="btnGuardarCond">Guardar Conductor</button>
            </div>
          </form>
        </div>
      </div>
    `;

    // Estado de las tres fotos mientras el formulario está abierto.
    const fotos = {
      condFrontal: (item && item.licencia_frontal) || null,
      condTrasera: (item && item.licencia_trasera) || null,
      condCarnet:  (item && item.carnet_federacion) || null
    };

    // Las fotos se guardan como data URL dentro del JSON de la petición. La foto
    // cruda de un celular pesa 3-6 MB (y en base64 aún más), suficiente para
    // reventar el límite del cuerpo (2 MB en el servidor de desarrollo, 4.5 MB
    // en Vercel) y que el guardado falle sin explicación. Se redimensionan en el
    // navegador antes de enviarlas: 1000 px de lado máximo.
    const LADO_MAXIMO = 1000;
    const CALIDAD_JPEG = 0.72;

    const leerComoBase64 = file => new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(r.result);
      r.onerror = () => rej(new Error('no se pudo leer el archivo'));
      r.readAsDataURL(file);
    });

    // Redimensiona y recomprime en un <canvas>. Si algo falla (o la imagen ya
    // venía pequeña y el JPEG pesa más), devuelve la original sin tocarla.
    function comprimirImagen(dataUrl){
      if(typeof dataUrl !== 'string' || !/^data:image\//i.test(dataUrl)) return Promise.resolve(dataUrl);
      return new Promise((resolve) => {
        const imagen = new Image();
        imagen.onerror = () => resolve(dataUrl);
        imagen.onload = () => {
          try {
            const anchoOriginal = imagen.naturalWidth || imagen.width;
            const altoOriginal = imagen.naturalHeight || imagen.height;
            if(!anchoOriginal || !altoOriginal) return resolve(dataUrl);
            const escala = Math.min(1, LADO_MAXIMO / Math.max(anchoOriginal, altoOriginal));
            const lienzo = document.createElement('canvas');
            lienzo.width = Math.max(1, Math.round(anchoOriginal * escala));
            lienzo.height = Math.max(1, Math.round(altoOriginal * escala));
            const contexto = lienzo.getContext('2d');
            contexto.fillStyle = '#ffffff'; // el JPEG no admite transparencia
            contexto.fillRect(0, 0, lienzo.width, lienzo.height);
            contexto.drawImage(imagen, 0, 0, lienzo.width, lienzo.height);
            const salida = lienzo.toDataURL('image/jpeg', CALIDAD_JPEG);
            resolve(salida.length < dataUrl.length ? salida : dataUrl);
          } catch (e) {
            resolve(dataUrl);
          }
        };
        imagen.src = dataUrl;
      });
    }

    function pintarCaja(id){
      const caja = document.getElementById(`${id}Box`);
      if(!caja) return;
      caja.innerHTML = contenidoDoc(fotos[id]);
      caja.classList.toggle('doc-lleno', Boolean(fotos[id]));
      const quitar = document.getElementById(`${id}Quitar`);
      if(quitar) quitar.hidden = !fotos[id];
    }

    async function asignarFoto(id, archivo){
      if(!archivo) return;
      const aviso = document.getElementById('condAviso');
      if(!/^image\//i.test(archivo.type || '')){
        if(aviso){ aviso.textContent = 'Solo se admiten imágenes (JPG o PNG).'; aviso.hidden = false; }
        return;
      }
      try {
        fotos[id] = await comprimirImagen(await leerComoBase64(archivo));
        pintarCaja(id);
        if(aviso) aviso.hidden = true;
      } catch (e) {
        if(aviso){ aviso.textContent = `No se pudo cargar la imagen: ${e.message}`; aviso.hidden = false; }
      } finally {
        const input = document.getElementById(`${id}Input`);
        if(input) input.value = ''; // permite volver a elegir el mismo archivo
      }
    }

    // Cada recuadro: botón de "Quitar", clic/teclado para abrir el selector y
    // arrastrar-y-soltar sobre el recuadro punteado.
    Object.keys(fotos).forEach(id => {
      const caja = document.getElementById(`${id}Box`);
      const input = document.getElementById(`${id}Input`);
      const botonQuitar = document.getElementById(`${id}Quitar`);

      input.onchange = (e) => asignarFoto(id, e.target.files[0]);
      botonQuitar.onclick = () => { fotos[id] = null; pintarCaja(id); };

      caja.onclick = () => input.click();
      caja.onkeydown = (e) => {
        if(e.key === 'Enter' || e.key === ' '){ e.preventDefault(); input.click(); }
      };
      const marcar = (e, activo) => {
        e.preventDefault(); e.stopPropagation();
        caja.classList.toggle('arrastre', activo);
      };
      caja.addEventListener('dragenter', (e) => marcar(e, true));
      caja.addEventListener('dragover', (e) => marcar(e, true));
      caja.addEventListener('dragleave', (e) => marcar(e, false));
      caja.addEventListener('drop', (e) => {
        marcar(e, false);
        const archivos = (e.dataTransfer && e.dataTransfer.files) ? Array.from(e.dataTransfer.files) : [];
        asignarFoto(id, archivos[0]);
      });
    });

    document.getElementById('btnCerrarModalCond').onclick = () => modal.innerHTML = '';
    document.getElementById('btnCancelCond').onclick = () => modal.innerHTML = '';
    document.getElementById('formConductor').onsubmit = async (e) => {
      e.preventDefault();
      const aviso = document.getElementById('condAviso');
      const boton = document.getElementById('btnGuardarCond');
      if(aviso) aviso.hidden = true;
      if(boton){ boton.disabled = true; boton.textContent = 'Guardando...'; }
      try {
        await window.api.conductores.guardar({
          id: item ? item.id : null,
          nombre: document.getElementById('condNombre').value.trim(),
          documento: document.getElementById('condDoc').value.trim(),
          numero_licencia: document.getElementById('condLicencia').value.trim(),
          licencia_frontal: fotos.condFrontal,
          licencia_trasera: fotos.condTrasera,
          carnet_federacion: fotos.condCarnet,
          activo: parseInt(document.getElementById('condActivo').value)
        });
        modal.innerHTML = '';
        cargarConductores();
      } catch (err) {
        // Antes el motivo solo se veía en la consola de PowerShell y el
        // formulario parecía no hacer nada: ahora el aviso sale en pantalla.
        if(aviso){ aviso.textContent = `No se pudo guardar el conductor: ${err.message}`; aviso.hidden = false; }
      } finally {
        if(boton){ boton.disabled = false; boton.textContent = 'Guardar Conductor'; }
      }
    };
  }
  async function cargarRendimientoVehiculos(){
    const cont = document.getElementById('tablaRendimientoVehiculos');
    if(!cont) return;
    try {
      const lista = await window.api.combustible.rendimientoVehiculos();
      if(!lista || !lista.length){
        cont.innerHTML = '<div class="empty">No hay vehículos registrados para evaluar rendimiento.</div>';
        return;
      }
      cont.innerHTML = `
        <table>
          <thead>
            <tr>
              <th>Unidad</th>
              <th>Cargas</th>
              <th>Volumen Total</th>
              <th>Odómetro Min - Max</th>
              <th>Km Recorridos</th>
              <th>Gasto Total</th>
              <th>Rendimiento (Km/L)</th>
              <th>Costo / Km</th>
            </tr>
          </thead>
          <tbody>
            ${lista.map(v => {
              const tieneDatos = v.km_recorridos > 0 && v.total_combustible > 0;
              const badgeRend = tieneDatos 
                ? `<span class="badge badge-success" style="font-size:12px; font-weight:700;">${v.rendimiento_km_l.toFixed(2)} km/L</span>`
                : `<span class="badge badge-neutral" style="font-size:11px;">Insuficiente</span>`;
              const badgeCosto = tieneDatos
                ? `<strong style="color:var(--primary);">${formatoMonto(v.costo_por_km)}</strong>`
                : `<span style="color:var(--muted);">-</span>`;

              return `
                <tr>
                  <td>
                    <div><strong>${esc(v.codigo)}</strong> <span style="font-family:monospace; font-weight:700; background:#eaecf0; padding:1px 5px; border-radius:4px; font-size:11px;">${esc(v.placa)}</span></div>
                    <div style="font-size:0.8rem; color:var(--muted);">${esc(v.marca)} ${esc(v.modelo)}</div>
                  </td>
                  <td>${v.total_cargas} carga${v.total_cargas === 1 ? '' : 's'}</td>
                  <td><strong>${parseFloat(v.total_combustible).toFixed(2)}</strong> L</td>
                  <td>
                    ${v.km_inicial > 0 ? `${v.km_inicial.toLocaleString()} - ${v.km_actual.toLocaleString()} km` : '<span style="color:var(--muted)">Sin registro de km</span>'}
                  </td>
                  <td><strong>${v.km_recorridos ? v.km_recorridos.toLocaleString() + ' km' : '0 km'}</strong></td>
                  <td>${formatoMonto(v.total_gasto)}</td>
                  <td>${badgeRend}</td>
                  <td>${badgeCosto}</td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      `;
    } catch(err) {
      console.error(err);
      cont.innerHTML = '<div class="empty">Error al cargar datos de rendimiento.</div>';
    }
  }

  // Funciones Combustible
  async function cargarFiltroVehiculosComb(){
    const vehs = await window.api.vehiculos.listar();
    const sel = document.getElementById('filtroCombVehiculo');
    if(sel){
      const valActual = sel.value;
      sel.innerHTML = '<option value="">Todos los vehículos</option>' +
        vehs.map(v => `<option value="${v.id}" ${valActual == v.id ? 'selected' : ''}>${esc(v.codigo)} - ${esc(v.placa)} (${esc(v.marca)})</option>`).join('');
    }
  }

  async function cargarCombustible(){
    const busqueda = document.getElementById('buscarCombustible').value.trim();
    const vehiculo_id = document.getElementById('filtroCombVehiculo').value;
    const [datos, resumen] = await Promise.all([
      window.api.combustible.listar({ busqueda, vehiculo_id: vehiculo_id || undefined }),
      window.api.combustible.resumen({ vehiculo_id: vehiculo_id || undefined })
    ]);

    // Calcular rendimiento individual por carga secuencial por vehículo
    const cargasPorVeh = {};
    const datosOrdenadosAsc = [...datos].sort((a,b) => {
      if (a.kilometraje && b.kilometraje && a.kilometraje !== b.kilometraje) {
        return a.kilometraje - b.kilometraje;
      }
      return new Date(a.fecha) - new Date(b.fecha);
    });

    const infoRendimientoPorCarga = {};
    datosOrdenadosAsc.forEach(c => {
      const vId = c.vehiculo_id;
      if (!cargasPorVeh[vId]) {
        cargasPorVeh[vId] = [];
      }
      const prevCarga = cargasPorVeh[vId].length > 0 ? cargasPorVeh[vId][cargasPorVeh[vId].length - 1] : null;
      if (prevCarga && c.kilometraje > prevCarga.kilometraje && c.cantidad > 0) {
        const deltaKm = c.kilometraje - prevCarga.kilometraje;
        const kmL = deltaKm / c.cantidad;
        const costoKm = c.total / deltaKm;
        infoRendimientoPorCarga[c.id] = { deltaKm, kmL, costoKm };
      } else {
        infoRendimientoPorCarga[c.id] = null;
      }
      cargasPorVeh[vId].push(c);
    });

    const elCargas = document.getElementById('combResumenCargas');
    const elLitros = document.getElementById('combResumenLitros');
    const elGasto = document.getElementById('combResumenGasto');
    const elKm = document.getElementById('combResumenKm');
    const elRend = document.getElementById('combResumenRendimiento');
    const elCostoKm = document.getElementById('combResumenCostoKm');

    if(elCargas) elCargas.textContent = resumen.totalCargas || 0;
    if(elLitros) elLitros.textContent = `${(parseFloat(resumen.totalLitros)||0).toFixed(2)} L`;
    if(elGasto) elGasto.textContent = formatoMonto(resumen.totalGasto);
    if(elKm) elKm.textContent = `${(resumen.kmRecorridos || 0).toLocaleString()} km`;
    if(elRend) elRend.textContent = resumen.rendimientoKmL > 0 ? `${resumen.rendimientoKmL.toFixed(2)} km/L` : 'N/D';
    if(elCostoKm) elCostoKm.textContent = resumen.costoKm > 0 ? `${formatoMonto(resumen.costoKm)} /km` : 'N/D';

    const cont = document.getElementById('tablaCombustible');
    if(!datos.length){
      cont.innerHTML = '<div class="empty">No se encontraron registros de combustible.</div>';
      return;
    }

    cont.innerHTML = `
      <table>
        <thead>
          <tr>
            <th>Fecha</th>
            <th>Vehículo</th>
            <th>Conductor</th>
            <th>Kilometraje</th>
            <th>Cantidad</th>
            <th>Precio Unit.</th>
            <th>Total (${monedaTexto()})</th>
            <th>Rendimiento Tramo</th>
            <th>Estación / Factura</th>
            <th style="text-align:right">Acciones</th>
          </tr>
        </thead>
        <tbody>
          ${datos.map(c => {
            const rend = infoRendimientoPorCarga[c.id];
            let rendHtml = `<span style="color:var(--muted); font-size:12px;">Carga base</span>`;
            if (rend) {
              rendHtml = `
                <div><span class="badge badge-success" style="font-size:11px;">${rend.kmL.toFixed(2)} km/L</span></div>
                <div style="font-size:0.75rem; color:var(--muted); margin-top:2px;">+${rend.deltaKm.toLocaleString()} km (${formatoMonto(rend.costoKm)}/km)</div>
              `;
            }

            return `
            <tr>
              <td><strong>${c.fecha}</strong></td>
              <td>
                <div><span style="font-family:monospace; font-weight:700; background:#eaecf0; padding:2px 6px; border-radius:4px;">${esc(c.placa)}</span></div>
                <div style="font-size:0.8rem; color:var(--muted);">${esc(c.vehiculo_codigo)} ${esc(c.marca)} ${esc(c.modelo)}</div>
              </td>
              <td>${c.conductor_nombre || '<span style="color:var(--muted)">Sin conductor</span>'}</td>
              <td>${c.kilometraje ? c.kilometraje.toLocaleString() + ' km' : '0 km'}</td>
              <td><strong>${parseFloat(c.cantidad).toFixed(2)}</strong></td>
              <td>${formatoMonto(c.precio_unitario)}</td>
              <td><strong style="color:var(--primary); font-size:1.05rem;">${formatoMonto(c.total)}</strong></td>
              <td>${rendHtml}</td>
              <td>
                <div>${c.estacion || '-'}</div>
                ${c.factura ? `<div style="font-size:0.8rem; color:var(--muted); font-family:monospace;">${esc(c.factura)}</div>` : ''}
              </td>
              <td style="text-align:right">
                <div class="action-buttons" style="justify-content:flex-end;">
                  <button class="btn btn-sm btn-secondary btnEditarComb" data-id="${c.id}">Editar</button>
                  <button class="btn btn-sm btn-danger btnEliminarComb" data-id="${c.id}">Eliminar</button>
                </div>
              </td>
            </tr>
          `;
          }).join('')}
        </tbody>
      </table>
    `;

    cont.querySelectorAll('.btnEditarComb').forEach(b => {
      b.onclick = () => {
        const item = datos.find(x => x.id == b.dataset.id);
        modalCombustible(item);
      };
    });

    cont.querySelectorAll('.btnEliminarComb').forEach(b => {
      b.onclick = async () => {
        if(await confirmarAccion({estado:'error',titulo:'¿Eliminar esta carga?',mensaje:'Se eliminará el registro de combustible. Esta acción no se puede deshacer.',botonOk:'Eliminar',okPeligroso:true})){
          await window.api.combustible.eliminar(b.dataset.id);
          cargarCombustible();
          cargarRendimientoVehiculos();
        }
      };
    });
  }
  async function modalCombustible(item = null){
    const [vehs, conds] = await Promise.all([
      window.api.vehiculos.listar(),
      window.api.conductores.listar()
    ]);

    const modal = document.getElementById('modalFlotaContainer');
    const hoy = fechaHoy();
    const fechaDef = item ? item.fecha : hoy;

    modal.innerHTML = `
      <div class="modal-overlay">
        <div class="modal-box" style="max-width:620px;">
          <div class="modal-header">
            <h3>${item ? 'Editar Carga de Combustible' : 'Registrar Carga de Combustible'}</h3>
            <button class="modal-close" id="btnCerrarModalComb">&times;</button>
          </div>
          <form id="formCombustible">
            <div class="form-grid" style="display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-bottom:12px;">
              <div class="form-group">
                <label>Fecha *</label>
                <input id="combFecha" type="date" required value="${fechaDef}">
              </div>
              <div class="form-group">
                <label>Tipo de Combustible</label>
                <select id="combTipo">
                  <option value="Diesel" ${item && item.tipo_combustible==='Diesel' ? 'selected':''}>Diesel</option>
                  <option value="Gasolina Regular" ${item && item.tipo_combustible==='Gasolina Regular' ? 'selected':''}>Gasolina Regular</option>
                  <option value="Gasolina Súper" ${item && item.tipo_combustible==='Gasolina Súper' ? 'selected':''}>Gasolina Súper</option>
                </select>
              </div>
            </div>

            <div class="form-grid" style="display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-bottom:12px;">
              <div class="form-group">
                <label>Vehículo / Unidad *</label>
                <select id="combVehiculo" required>
                  <option value="">-- Seleccione vehículo --</option>
                  ${vehs.map(v => `<option value="${v.id}" ${item && item.vehiculo_id == v.id ? 'selected' : ''}>${esc(v.codigo)} - ${esc(v.placa)} (${esc(v.marca)})</option>`).join('')}
                </select>
              </div>
              <div class="form-group">
                <label>Conductor</label>
                <select id="combConductor">
                  <option value="">-- Ninguno / Chofer ocasional --</option>
                  ${conds.map(c => `<option value="${c.id}" ${item && item.conductor_id == c.id ? 'selected' : ''}>${esc(c.nombre)}</option>`).join('')}
                </select>
              </div>
            </div>

            <div class="form-grid" style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:12px; margin-bottom:12px;">
              <div class="form-group">
                <label>Kilometraje Actual</label>
                <input id="combKm" type="number" step="0.1" placeholder="Ej. 45200" value="${item ? item.kilometraje : ''}">
              </div>
              <div class="form-group">
                <label>Cantidad *</label>
                <input id="combCant" type="number" step="0.01" placeholder="Ej. 50" required value="${item ? item.cantidad : ''}">
              </div>
              <div class="form-group">
                <label>Precio Unit. (${monedaTexto()}) *</label>
                <input id="combPrecio" type="number" step="0.01" placeholder="Ej. 48.50" required value="${item ? item.precio_unitario : ''}">
              </div>
            </div>

            <div class="panel" style="background:#f8fafc; padding:10px 14px; margin-bottom:12px; display:flex; justify-content:space-between; align-items:center;">
              <span style="font-weight:600; font-size:0.9rem;">Cálculo Total:</span>
              <strong id="combCalculoTotal" style="font-size:1.15rem; color:var(--primary);">${formatoMonto(item ? item.total : 0)}</strong>
            </div>

            <div class="form-grid" style="display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-bottom:12px;">
              <div class="form-group">
                <label>Estación de Servicio</label>
                <input id="combEstacion" type="text" placeholder="Ej. Puma Las Colinas" value="${item && item.estacion ? item.estacion : ''}">
              </div>
              <div class="form-group">
                <label>No. de Factura / Ticket</label>
                <input id="combFactura" type="text" placeholder="Ej. FAC-102938" value="${item && item.factura ? item.factura : ''}">
              </div>
            </div>

            <div class="form-group" style="margin-bottom:16px;">
              <label>Observaciones</label>
              <textarea id="combObs" rows="2" placeholder="Notas sobre la carga...">${item && item.observacion ? item.observacion : ''}</textarea>
            </div>

            <div class="modal-actions">
              <button type="button" class="btn" id="btnCancelComb">Cancelar</button>
              <button type="submit" class="btn primary">Guardar Carga</button>
            </div>
          </form>
        </div>
      </div>
    `;

    const cantInput = document.getElementById('combCant');
    const precioInput = document.getElementById('combPrecio');
    const totalLabel = document.getElementById('combCalculoTotal');
    const recalcular = () => {
      const c = parseFloat(cantInput.value) || 0;
      const p = parseFloat(precioInput.value) || 0;
      const tot = c * p;
      totalLabel.textContent = formatoMonto(tot);
    };
    cantInput.addEventListener('input', recalcular);
    precioInput.addEventListener('input', recalcular);

    document.getElementById('btnCerrarModalComb').onclick = () => modal.innerHTML = '';
    document.getElementById('btnCancelComb').onclick = () => modal.innerHTML = '';

    document.getElementById('formCombustible').onsubmit = async (e) => {
      e.preventDefault();
      const cant = parseFloat(cantInput.value) || 0;
      const precio = parseFloat(precioInput.value) || 0;
      const total = cant * precio;

      await window.api.combustible.guardar({
        id: item ? item.id : null,
        fecha: document.getElementById('combFecha').value,
        vehiculo_id: parseInt(document.getElementById('combVehiculo').value),
        conductor_id: document.getElementById('combConductor').value ? parseInt(document.getElementById('combConductor').value) : null,
        tipo_combustible: document.getElementById('combTipo').value,
        kilometraje: parseFloat(document.getElementById('combKm').value) || 0,
        cantidad: cant,
        precio_unitario: precio,
        total: total,
        estacion: document.getElementById('combEstacion').value.trim(),
        factura: document.getElementById('combFactura').value.trim(),
        observacion: document.getElementById('combObs').value.trim()
      });

      modal.innerHTML = '';
      cargarCombustible();
      cargarRendimientoVehiculos();
    };
  }



  document.getElementById('btnNuevoVehiculo').onclick = () => modalVehiculo();
  document.getElementById('btnNuevoConductor').onclick = () => modalConductor();
  document.getElementById('btnBuscarVehiculo').onclick = () => cargarVehiculos();
  document.getElementById('btnLimpiarVehiculo').onclick = () => {
    document.getElementById('buscarVehiculo').value = '';
    cargarVehiculos();
  };
  document.getElementById('btnBuscarConductor').onclick = () => cargarConductores();
  document.getElementById('btnLimpiarConductor').onclick = () => {
    document.getElementById('buscarConductor').value = '';
    cargarConductores();
  };
  document.getElementById('btnNuevoCombustible').onclick = () => modalCombustible();
  document.getElementById('btnBuscarCombustible').onclick = () => cargarCombustible();
  document.getElementById('btnLimpiarCombustible').onclick = () => {
    document.getElementById('buscarCombustible').value = '';
    document.getElementById('filtroCombVehiculo').value = '';
    cargarCombustible();
  };
  document.getElementById('filtroCombVehiculo').onchange = () => cargarCombustible();


  await Promise.all([cargarVehiculos(), cargarConductores(), cargarCombustible(), cargarRendimientoVehiculos(), cargarFiltroVehiculosComb()]);
}

// Módulo Clientes
async function renderClientes(){
  content.innerHTML = `
    <div class="page-intro page-head">
      <div>
        <h2>Cartera de Clientes</h2>
        <p>Registro de empresas, consignatarios, personas de contacto y direcciones de entrega.</p>
      </div>
      <div class="page-actions">
        <button id="btnNuevoCliente" class="btn primary">+ Registrar Cliente</button>
      </div>
    </div>

    <div class="panel">
      <div class="toolbar">
        <div class="field">
          <label>Buscar Cliente</label>
          <input id="buscarCliente" type="text" placeholder="Nombre, RUC, teléfono o contacto...">
        </div>
        <button id="btnBuscarCli" class="btn primary">Buscar</button>
        <button id="btnLimpiarCli" class="btn">Limpiar</button>
      </div>

      <div id="tablaClientes" class="table-wrap">
        <div class="empty">Cargando clientes...</div>
      </div>
    </div>

    <div id="modalClienteContainer"></div>
  `;

  async function cargarClientes(){
    const busqueda = document.getElementById('buscarCliente').value.trim();
    const datos = await window.api.clientes.listar({ busqueda });
    const cont = document.getElementById('tablaClientes');
    if(!datos.length){
      cont.innerHTML = '<div class="empty">No hay clientes registrados en la cartera.</div>';
      return;
    }
    cont.innerHTML = `
      <table>
        <thead>
          <tr>
            <th>Nombre de la Empresa / Cliente</th>
            <th>RUC / Identificación</th>
            <th>Contacto</th>
            <th>Teléfono / Correo</th>
            <th>Dirección</th>
            <th>Estado</th>
            <th style="text-align:right">Acciones</th>
          </tr>
        </thead>
        <tbody>
          ${datos.map(c => `
            <tr>
              <td><strong>${esc(c.nombre)}</strong></td>
              <td>${c.identificacion || '<span class="text-muted">N/D</span>'}</td>
              <td>${c.contacto || '<span class="text-muted">N/D</span>'}</td>
              <td>
                ${c.telefono ? `<div>📞 ${esc(c.telefono)}</div>` : ''}
                ${c.email ? `<small class="text-muted">✉️ ${esc(c.email)}</small>` : ''}
                ${!c.telefono && !c.email ? '<span class="text-muted">Sin datos</span>' : ''}
              </td>
              <td><small>${c.direccion || 'Sin dirección'}</small></td>
              <td><span class="badge ${c.activo ? 'badge-success' : 'badge-danger'}">${c.activo ? 'Activo' : 'Inactivo'}</span></td>
              <td style="text-align:right">
                <div class="action-buttons" style="justify-content:flex-end;">
                  <button class="btn btn-sm btn-secondary btnEditarCli" data-id="${c.id}">Editar</button>
                  <button class="btn btn-sm btn-danger btnEliminarCli" data-id="${c.id}">Eliminar</button>
                </div>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;

    cont.querySelectorAll('.btnEditarCli').forEach(b => {
      b.onclick = () => {
        const item = datos.find(x => x.id == b.dataset.id);
        modalCliente(item);
      };
    });

    cont.querySelectorAll('.btnEliminarCli').forEach(b => {
      b.onclick = async () => {
        if(await confirmarAccion({estado:'error',titulo:'¿Eliminar este cliente?',mensaje:'Si está asociado a viajes de la bitácora no podrá borrarse.',botonOk:'Eliminar',okPeligroso:true})){
          try {
            await window.api.clientes.eliminar(b.dataset.id);
            cargarClientes();
          } catch(err) {
            { if(/foreign key|viola|constraint|referenc/i.test(err.message || '')) avisarAdvertencia('No se puede eliminar el cliente', 'El cliente está asociado a viajes en bitácora.'); else avisarError('No se pudo eliminar', err.message); }
          }
        }
      };
    });
  }

  function modalCliente(item = null){
    const modal = document.getElementById('modalClienteContainer');
    modal.innerHTML = `
      <div class="modal-overlay">
        <div class="modal-box">
          <div class="modal-header">
            <h3>${item ? 'Editar Cliente' : 'Registrar Nuevo Cliente'}</h3>
            <button class="modal-close" id="btnCerrarModalCli">&times;</button>
          </div>
          <form id="formCliente">
            <div class="form-row">
              <div class="form-group">
                <label>Razón Social / Nombre Comercial *</label>
                <input id="cliNombre" type="text" placeholder="Ej. Distribuidora del Norte S.A." required value="${item ? item.nombre : ''}">
              </div>
              <div class="form-group">
                <label>No. RUC / Identificación Fiscal</label>
                <input id="cliRuc" type="text" placeholder="Ej. J0310000123456" value="${item && item.identificacion ? item.identificacion : ''}">
              </div>
            </div>
            <div class="form-row">
              <div class="form-group">
                <label>Persona o Encargado de Contacto</label>
                <input id="cliContacto" type="text" placeholder="Ej. Lic. Roberto Silva (Logística)" value="${item && item.contacto ? item.contacto : ''}">
              </div>
              <div class="form-group">
                <label>Teléfono / Celular</label>
                <input id="cliTelefono" type="text" placeholder="Ej. +505 8888-1234" value="${item && item.telefono ? item.telefono : ''}">
              </div>
            </div>
            <div class="form-row">
              <div class="form-group">
                <label>Correo Electrónico</label>
                <input id="cliEmail" type="email" placeholder="Ej. logistica@empresa.com" value="${item && item.email ? item.email : ''}">
              </div>
              <div class="form-group">
                <label>Estado</label>
                <select id="cliActivo">
                  <option value="1" ${item && item.activo===1 ? 'selected' : ''}>Activo (Habilitado)</option>
                  <option value="0" ${item && item.activo===0 ? 'selected' : ''}>Inactivo</option>
                </select>
              </div>
            </div>
            <div class="form-row full">
              <div class="form-group">
                <label>Dirección Física / Plantel de Entrega</label>
                <textarea id="cliDireccion" placeholder="Dirección completa, referencias de llegada...">${item && item.direccion ? item.direccion : ''}</textarea>
              </div>
            </div>
            <div class="modal-actions">
              <button type="button" class="btn" id="btnCancelCli">Cancelar</button>
              <button type="submit" class="btn primary">Guardar Cliente</button>
            </div>
          </form>
        </div>
      </div>
    `;
    document.getElementById('btnCerrarModalCli').onclick = () => modal.innerHTML = '';
    document.getElementById('btnCancelCli').onclick = () => modal.innerHTML = '';
    document.getElementById('formCliente').onsubmit = async (e) => {
      e.preventDefault();
      await window.api.clientes.guardar({
        id: item ? item.id : null,
        nombre: document.getElementById('cliNombre').value.trim(),
        identificacion: document.getElementById('cliRuc').value.trim(),
        contacto: document.getElementById('cliContacto').value.trim(),
        telefono: document.getElementById('cliTelefono').value.trim(),
        email: document.getElementById('cliEmail').value.trim(),
        direccion: document.getElementById('cliDireccion').value.trim(),
        activo: parseInt(document.getElementById('cliActivo').value)
      });
      modal.innerHTML = '';
      cargarClientes();
    };
  }

  document.getElementById('btnNuevoCliente').onclick = () => modalCliente();
  document.getElementById('btnBuscarCli').onclick = () => cargarClientes();
  document.getElementById('btnLimpiarCli').onclick = () => {
    document.getElementById('buscarCliente').value = '';
    cargarClientes();
  };

  await cargarClientes();
}
