const content=document.getElementById('content'),pageTitle=document.getElementById('page-title');
const money=new Intl.NumberFormat('es-NI',{minimumFractionDigits:2,maximumFractionDigits:2});

// Estado visual global: la interfaz usa un único contenedor con scroll.
// Los controles del formulario no se deshabilitan por navegación ni por refresco de módulos.
function actualizarBarraEstado(modulo){
  const el=document.getElementById('status-module');
  if(el) el.textContent=modulo||'Dashboard';
}

function aplicarTema(){
  const tema=localStorage.getItem('control-empresa-tema')||'light';
  document.body.classList.toggle('dark-theme',tema==='dark');
  const btn=document.getElementById('themeToggle');
  if(btn){
    btn.textContent=tema==='dark'?'☀':'◐';
    btn.title=tema==='dark'?'Cambiar a tema claro':'Cambiar a tema oscuro';
    btn.setAttribute('aria-label',btn.title);
  }
}

function iniciarRelojEstado(){
  const reloj=document.getElementById('status-clock');
  const pintar=()=>{ if(reloj) reloj.textContent=new Intl.DateTimeFormat('es-NI',{hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false}).format(new Date()); };
  pintar();
  setInterval(pintar,1000);
}

function aplicarSidebarColapsado(){
  const shell=document.querySelector('.app-shell');
  const colapsado=localStorage.getItem('control-empresa-sidebar')==='colapsado';
  if(shell) shell.classList.toggle('sidebar-colapsado',colapsado);
}

function inicializarInterfaz(){
  aplicarTema();
  document.getElementById('themeToggle')?.addEventListener('click',()=>{
    const siguiente=document.body.classList.contains('dark-theme')?'light':'dark';
    localStorage.setItem('control-empresa-tema',siguiente);
    aplicarTema();
  });
  aplicarSidebarColapsado();
  document.getElementById('sidebarToggle')?.addEventListener('click',()=>{
    const shell=document.querySelector('.app-shell');
    const colapsadoAhora=!shell.classList.contains('sidebar-colapsado');
    shell.classList.toggle('sidebar-colapsado',colapsadoAhora);
    localStorage.setItem('control-empresa-sidebar',colapsadoAhora?'colapsado':'expandido');
  });
  // Para que, al plegar, cada botón siga identificándose con un tooltip.
  document.querySelectorAll('.menu-item').forEach(b=>{
    if(!b.title) b.title=b.querySelector('span')?.textContent.trim()||'';
  });
  iniciarRelojEstado();
}

// Datos de la empresa y moneda: se leen de la tabla "configuracion" de la base de datos.
let simboloMoneda='C$';
function monedaTexto(){return simboloMoneda}
function formatoMonto(valor){return `${simboloMoneda} ${money.format(Number(valor)||0)}`}
function formatoEntero(valor){return new Intl.NumberFormat('es-NI').format(Number(valor)||0)}

// Logotipo de la empresa en la barra superior.
//
// Prioridad:
//   1. Si hay un logo configurado (ruta de archivo o imagen en base64), se
//      muestra esa imagen. Así, cuando la empresa tenga su logo real, solo hay
//      que guardar ese dato y se refleja en toda la aplicación.
//   2. Si no hay logo, se dibujan las iniciales del nombre sobre un color
//      derivado del propio nombre. Nunca queda un recuadro vacío, y dos
//      empresas distintas no se ven igual.
function pintarLogoEmpresa(contenedor, nombre, logo) {
  if (!contenedor) return;
  contenedor.innerHTML = '';

  if (logo) {
    const img = new Image();
    img.src = logo;
    img.alt = `Logotipo de ${nombre}`;
    // Si la imagen no carga (ruta mala o archivo borrado), se vuelve a las
    // iniciales en lugar de dejar un recuadro roto.
    img.onerror = () => pintarInicialesEmpresa(contenedor, nombre);
    contenedor.appendChild(img);
    contenedor.setAttribute('aria-label', `Logotipo de ${nombre}`);
    return;
  }
  pintarInicialesEmpresa(contenedor, nombre);
}

function pintarInicialesEmpresa(contenedor, nombre) {
  // Se toman las iniciales de las palabras con contenido, saltando los
  // conectores ("de", "del", "y"): "Transportes de Hermanos" -> "TH".
  const PALABRAS_VACIAS = new Set(['de', 'del', 'la', 'el', 'los', 'las', 'y']);
  const iniciales = String(nombre || '')
    .split(/\s+/)
    .filter((p) => p && !PALABRAS_VACIAS.has(p.toLowerCase()))
    .slice(0, 2)
    .map((p) => p[0].toUpperCase())
    .join('') || '?';

  // El color sale de sumar los caracteres del nombre: la misma empresa siempre
  // muestra el mismo color y empresas distintas, colores distintos.
  let suma = 0;
  for (const caracter of String(nombre || '')) suma += caracter.charCodeAt(0);
  const tono = suma % 360;

  contenedor.textContent = iniciales;
  contenedor.style.background = `hsl(${tono} 42% 42%)`;
  contenedor.setAttribute('aria-label', nombre);
  contenedor.setAttribute('title', nombre);
}

// Lee una imagen elegida por el usuario y la devuelve como cadena "data:",
// lista para guardarse en la base de datos y pintarse en un <img>.
function leerArchivoComoDatos(archivo) {
  return new Promise((resolve, reject) => {
    const lector = new FileReader();
    lector.onload = () => resolve(String(lector.result || ''));
    lector.onerror = () => reject(lector.error);
    lector.readAsDataURL(archivo);
  });
}

async function aplicarConfiguracionEmpresa(){
  try{
    const cfg=await window.api.configuracion.obtener();
    simboloMoneda=cfg.simbolo||'C$';
    const nombre=cfg.nombre_empresa||'Transporte Fierro';
    const empresaEl=document.getElementById('empresaDestacada');
    if(empresaEl){ empresaEl.textContent=nombre; empresaEl.title=nombre; }
    pintarLogoEmpresa(document.getElementById('empresaLogo'), nombre, cfg.logo_empresa);
    document.title=`${nombre} - SmartTransPro`;
    const dbStatus=document.getElementById('db-status');
    if(dbStatus) dbStatus.textContent='Base de datos conectada';
    const topStatus=document.getElementById('top-status-text');
    if(topStatus) topStatus.textContent='Sistema operativo';
  }catch(e){
    console.error('No se pudo leer la configuración de la base de datos:',e);
    const dbStatus=document.getElementById('db-status');
    if(dbStatus) dbStatus.textContent='Base de datos: sin conexión';
    const topStatus=document.getElementById('top-status-text');
    if(topStatus) topStatus.textContent='Revisar conexión';
  }
}

const modulos={
  dashboard:['Dashboard',renderDashboard],
  bitacora:['Bitácora de Viajes y Rutas',renderBitacora],
  flota:['Control de Flota y Conductores',renderFlota],
  clientes:['Cartera de Clientes',renderClientes],
  planilla:['Planilla, Viáticos y Comisiones',renderPlanilla],
  ingresos:['Ingresos',renderIngresos],
  egresos:['Egresos / Gastos',renderEgresos],
  reportes:['Reportes',renderReportes],
  usuarios:['Usuarios del Sistema',renderUsuarios],
  configuracion:['Configuración',renderConfiguracion]
};

document.querySelectorAll('.menu-item').forEach(b=>b.addEventListener('click',()=>{
  document.querySelectorAll('.menu-item').forEach(x=>x.classList.remove('active'));
  b.classList.add('active');
  abrir(b.dataset.module);
}));

async function abrir(n){
  // El rol decide qué módulos existen: un rol de consulta no llega ni a ver el
  // botón de Usuarios, y si se invoca por otra vía se detiene aquí también.
  if(!puedeVerModulo(n)){
    const permitido=Object.keys(modulos).find(k=>puedeVerModulo(k))||'dashboard';
    console.warn(`El usuario actual no tiene acceso al módulo "${n}".`);
    return abrir(permitido);
  }
  const m=modulos[n]||modulos.dashboard;
  pageTitle.textContent=m[0];
  actualizarBarraEstado(m[0]);
  // Cada cambio de módulo inicia en la parte superior del área de trabajo.
  // El encabezado, sidebar y barra de estado permanecen fijos.
  if(content) content.scrollTop=0;
  await m[1]();
  // Activa búsqueda inteligente (filtra mientras se escribe) e impresión
  // de lo filtrado en todas las barras de herramientas del módulo recién dibujado.
  activarBusquedaInteligenteYImpresion(content);
}

// Etiqueta corta de un mes "AAAA-MM" para las barras del gráfico.
const MESES_CORTOS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
function etiquetaMes(mes) {
  const partes = String(mes || '').split('-');
  if (partes.length !== 2) return String(mes || '');
  const indice = parseInt(partes[1], 10) - 1;
  return `${MESES_CORTOS[indice] || partes[1]} ${partes[0].slice(2)}`;
}

// Variación porcentual contra el período anterior. Cuando el valor previo es
// cero no se puede calcular (habría que dividir entre cero) y se marca como
// "nuevo" en vez de inventar un porcentaje enorme.
function variacion(actual, anterior) {
  const a = Number(actual) || 0;
  const p = Number(anterior) || 0;
  if (p === 0) return a === 0 ? { texto: '0%', clase: 'estable' } : { texto: 'Nuevo', clase: 'sube' };
  const pct = ((a - p) / Math.abs(p)) * 100;
  const redondeado = Math.abs(pct) < 0.05 ? 0 : pct;
  return {
    texto: `${redondeado > 0 ? '+' : ''}${redondeado.toFixed(1).replace('.', ',')}%`,
    clase: redondeado > 0 ? 'sube' : redondeado < 0 ? 'baja' : 'estable'
  };
}

// Pinta el tablero con los datos que devuelve dashboard:tablero. Va aparte de
// renderDashboard porque es larga y así el esqueleto se lee de un vistazo.
function pintarTablero(d) {
  const f = d.financiero;
  const op = d.operativo;

  // Utilidad del período. La variación se compara contra el período anterior
  // de igual duración, que es el que trae el backend en "anterior".
  const utilidad = f.utilidad;
  const utilidadPrev = f.anterior.ingresos - f.anterior.egresos;
  const kUtilidad = document.getElementById('kUtilidad');
  kUtilidad.textContent = formatoMonto(utilidad);
  kUtilidad.className = 'kpi-principal-valor ' + (utilidad >= 0 ? 'positivo' : 'negativo');
  document.getElementById('kMargen').textContent = f.ingresos > 0
    ? `Margen de ${(f.margen * 100).toFixed(1).replace('.', ',')}% sobre los ingresos`
    : 'Sin ingresos registrados en el período';

  const vUtilidad = variacion(utilidad, utilidadPrev);
  const cajaComp = document.getElementById('kComparativa');
  cajaComp.className = 'kpi-comparativa ' + vUtilidad.clase;
  cajaComp.textContent = `${vUtilidad.clase === 'sube' ? '▲' : vUtilidad.clase === 'baja' ? '▼' : '■'} ${vUtilidad.texto} frente al período anterior`;

  const pintarKpi = (idValor, idPie, valor, anterior, claseValor) => {
    document.getElementById(idValor).textContent = formatoMonto(valor);
    if (claseValor) document.getElementById(idValor).className = 'kpi-valor ' + claseValor;
    const v = variacion(valor, anterior);
    const pie = document.getElementById(idPie);
    pie.className = 'kpi-pie ' + v.clase;
    pie.textContent = `${v.texto} frente al período anterior`;
  };
  pintarKpi('kIngresos', 'kIngresosVar', f.ingresos, f.anterior.ingresos, 'positivo');
  pintarKpi('kEgresos', 'kEgresosVar', f.egresos, f.anterior.egresos, 'negativo');
  document.getElementById('kCostos').textContent = formatoMonto(f.costosOperativos);

  // Gráfico de barras. Todas las barras usan la MISMA escala (el mes más alto
  // llega al tope): si cada mes midiera sobre su propio máximo, un mes con
  // todo el gasto se vería igual de lleno que uno con el doble, y la
  // comparación mentiría.
  const serie = d.serie || [];
  const maximo = Math.max(1, ...serie.map(m => Math.max(m.ingresos, m.egresos)));
  const contGrafica = document.getElementById('grafica');
  contGrafica.innerHTML = serie.length
    ? serie.map(m => `
        <div class="grafica-col" title="${esc(`${etiquetaMes(m.mes)} · Ingresos ${formatoMonto(m.ingresos)} · Egresos ${formatoMonto(m.egresos)}`)}">
          <div class="grafica-barras-int">
            <div class="grafica-barra ingresos" style="height:${(m.ingresos / maximo * 100).toFixed(1)}%"></div>
            <div class="grafica-barra egresos" style="height:${(m.egresos / maximo * 100).toFixed(1)}%"></div>
          </div>
          <div class="grafica-mes">${esc(etiquetaMes(m.mes))}</div>
        </div>`).join('')
    : '<div class="empty">Todavía no hay movimientos registrados.</div>';

  // Barras de proporción por categoría: dicen en un vistazo qué se lleva la
  // mayor parte del dinero, que es lo que se busca al abrir este tablero.
  const proporciones = (lista, total, clase) => {
    if (!lista.length) return '<div class="empty">Sin movimientos en el período.</div>';
    return lista.slice(0, 6).map(c => {
      const pct = total > 0 ? c.total / total * 100 : 0;
      return `<div class="proporcion">
          <div class="proporcion-cabecera">
            <span>${esc(c.categoria || 'Sin categoría')}</span>
            <span class="proporcion-valor">${formatoMonto(c.total)}</span>
          </div>
          <div class="proporcion-pista"><div class="proporcion-relleno ${clase}" style="width:${pct.toFixed(1)}%"></div></div>
          <div class="proporcion-pie">${pct.toFixed(1).replace('.', ',')}% · ${formatoEntero(c.cantidad)} registro(s)</div>
        </div>`;
    }).join('');
  };
  document.getElementById('catIngresos').innerHTML = proporciones(f.porCategoriaIngresos, f.ingresos, 'ingresos');
  document.getElementById('catEgresos').innerHTML = proporciones(f.porCategoriaEgresos, f.egresos, 'egresos');

  document.getElementById('opViajes').textContent = formatoEntero(op.viajes);
  document.getElementById('opEnCurso').textContent = formatoEntero(op.viajesEnCurso);
  document.getElementById('opKm').textContent = `${formatoEntero(op.km)} km`;
  document.getElementById('opUnidades').textContent = formatoEntero(op.unidades);
  document.getElementById('opConductores').textContent = formatoEntero(op.conductores);

  // Los viáticos sin liquidar son plata que ya salió de la caja pero que se le
  // debe al conductor: se avisa arriba porque es lo único accionable del tablero.
  const aviso = document.getElementById('avisoPendientes');
  aviso.innerHTML = d.pendientes.viaticos > 0
    ? `<div class="aviso">
        <span class="aviso-icono">!</span>
        <span><strong>${formatoMonto(d.pendientes.viaticos)}</strong> en viáticos registrados y todavía pendientes de liquidar.</span>
        <button class="btn btn-sm" data-ir="planilla">Revisar viáticos</button>
      </div>`
    : '';
  const botonAviso = aviso.querySelector('[data-ir]');
  if (botonAviso) botonAviso.onclick = () => abrir('planilla');
}

async function renderDashboard(){
  content.innerHTML=`
    <div class="page-intro">
      <h2>Resumen general</h2>
      <p>Movimiento administrativo, financiero y operativo registrado en la base de datos.</p>
    </div>
    <div class="tabla-c">
      <div class="kpi-principal">
        <div class="kpi-principal-etiqueta">Utilidad del período</div>
        <div id="kUtilidad" class="kpi-principal-valor">-</div>
        <div id="kMargen" class="kpi-principal-nota">-</div>
        <div id="kComparativa" class="kpi-comparativa">-</div>
      </div>
      <div class="kpi-lateral">
        <div class="kpi-item">
          <div class="kpi-etiqueta">Ingresos</div>
          <div id="kIngresos" class="kpi-valor positivo">-</div>
          <div id="kIngresosVar" class="kpi-pie">-</div>
        </div>
        <div class="kpi-item">
          <div class="kpi-etiqueta">Egresos</div>
          <div id="kEgresos" class="kpi-valor negativo">-</div>
          <div id="kEgresosVar" class="kpi-pie">-</div>
        </div>
        <div class="kpi-item">
          <div class="kpi-etiqueta">Costos operativos</div>
          <div id="kCostos" class="kpi-valor">-</div>
          <div class="kpi-pie">Planilla + combustible + viáticos</div>
        </div>
      </div>
    </div>
    <div class="panel" style="margin-top:18px;">
      <div class="panel-cabecera">
        <div>
          <h3>Ingresos y egresos por mes</h3>
          <p>Comparativa de los últimos seis meses.</p>
        </div>
        <div class="grafica-leyenda">
          <span><i class="leyenda-ingresos"></i>Ingresos</span>
          <span><i class="leyenda-egresos"></i>Egresos</span>
        </div>
      </div>
      <div id="grafica" class="grafica-barras"></div>
    </div>
    <div class="tablero-dos">
      <div class="panel">
        <div class="panel-cabecera">
          <div><h3>Ingresos por categoría</h3><p>De dónde viene el dinero del período.</p></div>
        </div>
        <div id="catIngresos" class="proporciones"></div>
      </div>
      <div class="panel">
        <div class="panel-cabecera">
          <div><h3>Egresos por categoría</h3><p>A dónde se va el dinero del período.</p></div>
        </div>
        <div id="catEgresos" class="proporciones"></div>
      </div>
    </div>
    <div class="panel" style="margin-top:18px;">
      <h3>Operación</h3>
      <p>Viajes, kilometraje y flota del período seleccionado.</p>
      <div class="operativo">
        <div class="op-item"><div class="op-valor" id="opViajes">-</div><div class="op-etiqueta">Viajes del período</div></div>
        <div class="op-item"><div class="op-valor" id="opEnCurso">-</div><div class="op-etiqueta">Viajes en curso</div></div>
        <div class="op-item"><div class="op-valor" id="opKm">-</div><div class="op-etiqueta">Kilómetros recorridos</div></div>
        <div class="op-item"><div class="op-valor" id="opUnidades">-</div><div class="op-etiqueta">Unidades activas</div></div>
        <div class="op-item"><div class="op-valor" id="opConductores">-</div><div class="op-etiqueta">Conductores activos</div></div>
      </div>
    </div>
    <div id="avisoPendientes"></div>
    <div class="panel">
      <h3>Accesos rápidos</h3>
      <p style="color:var(--muted); font-size:13px;">Registro directo en los módulos que alimentan este tablero.</p>
      <div class="action-buttons">
        <button class="btn primary" data-ir="ingresos">Registrar ingreso</button>
        <button class="btn" data-ir="egresos">Registrar gasto</button>
        <button class="btn" data-ir="planilla">Registrar viático</button>
        <button class="btn" data-ir="bitacora">Registrar viaje</button>
      </div>
    </div>
  `;
  content.querySelectorAll('[data-ir]').forEach(b=>{
    b.onclick=()=>{
      document.querySelectorAll('.menu-item').forEach(x=>x.classList.remove('active'));
      const item=document.querySelector(`.menu-item[data-module="${b.dataset.ir}"]`);
      if(item) item.classList.add('active');
      abrir(b.dataset.ir);
    };
  });
  try{
    pintarTablero(await window.api.dashboard.tablero({}));
  }catch(e){
    console.error(e);
    document.getElementById('grafica').innerHTML='<div class="empty">No se pudo cargar el resumen: '+esc(e.message)+'</div>';
  }
}

async function renderBitacora(){
  const estadoInicial = {
    busqueda: '',
    desde: '',
    hasta: '',
    estado: '',
    vehiculo_id: '',
    conductor_id: ''
  };

  content.innerHTML=`
    <div class="page-intro page-head">
      <div>
        <h2>Bitácora de Viajes y Rutas</h2>
        <p>Control de recorridos, kilometrajes, unidades de transporte y conductores.</p>
      </div>
      <div class="page-actions">
        <button id="btnNuevoViaje" class="btn primary" type="button">+ Registrar Viaje</button>
      </div>
    </div>

    <div class="cards" style="grid-template-columns:repeat(4,minmax(0,1fr)); margin-bottom:18px;">
      <div class="card"><div class="card-label">Total Viajes</div><div id="kpiTotalViajes" class="card-value">0</div></div>
      <div class="card"><div class="card-label">En Curso / En Ruta</div><div id="kpiEnCurso" class="card-value" style="color:#d97706;">0</div></div>
      <div class="card"><div class="card-label">Completados</div><div id="kpiCompletados" class="card-value positive">0</div></div>
      <div class="card"><div class="card-label">Kilómetros Totales</div><div id="kpiTotalKm" class="card-value">0 km</div></div>
    </div>

    <div class="panel">
      <div class="toolbar" style="align-items:flex-end; flex-wrap:wrap;">
        <div class="field">
          <label>Buscar</label>
          <input id="filtroBuscar" type="search" placeholder="Ruta, cliente, conductor, placa...">
        </div>
        <div class="field">
          <label>Desde</label>
          <input id="filtroDesde" type="date">
        </div>
        <div class="field">
          <label>Hasta</label>
          <input id="filtroHasta" type="date">
        </div>
        <div class="field">
          <label>Estado</label>
          <select id="filtroEstado">
            <option value="">Todos los estados</option>
            <option value="EN CURSO">En curso</option>
            <option value="COMPLETADO">Completado</option>
            <option value="CANCELADO">Cancelado</option>
          </select>
        </div>
        <div class="field">
          <label>Vehículo</label>
          <select id="filtroVehiculo"><option value="">Todos los vehículos</option></select>
        </div>
        <div class="field">
          <label>Conductor</label>
          <select id="filtroConductor"><option value="">Todos los conductores</option></select>
        </div>
        <div class="action-buttons">
          <button id="btnFiltrar" class="btn primary" type="button">Buscar</button>
          <button id="btnLimpiarFiltros" class="btn" type="button">Limpiar</button>
        </div>
      </div>

      <div id="mensajeBitacora" class="empty" style="display:none;"></div>
      <div id="contenedorTablaBitacora" class="table-wrap">
        <div class="empty">Cargando registros...</div>
      </div>
    </div>

    <div id="modalViajeContainer"></div>
  `;

  const modalContainer = document.getElementById('modalViajeContainer');
  const mensaje = document.getElementById('mensajeBitacora');
  let vehiculos = [];
  let conductores = [];
  let clientes = [];

  const mostrarError = (texto) => {
    if (!mensaje) return;
    mensaje.textContent = texto;
    mensaje.style.display = 'block';
  };

  const ocultarError = () => {
    if (!mensaje) return;
    mensaje.textContent = '';
    mensaje.style.display = 'none';
  };

  function poblarSelect(id, lista, textoFn, incluirTodos){
    const select = document.getElementById(id);
    if (!select) return;
    const actual = select.value;
    select.innerHTML = `<option value="">${incluirTodos}</option>`;
    lista.forEach(item => {
      const opt = document.createElement('option');
      opt.value = item.id;
      opt.textContent = textoFn(item);
      select.appendChild(opt);
    });
    if ([...select.options].some(o => o.value === String(actual))) select.value = actual;
  }

  async function cargarCatalogos(){
    const resultados = await Promise.allSettled([
      window.api.vehiculos.listar(),
      window.api.conductores.listar(),
      window.api.clientes.listar({ soloActivos: true })
    ]);

    if (resultados[0].status === 'fulfilled') vehiculos = Array.isArray(resultados[0].value) ? resultados[0].value : [];
    if (resultados[1].status === 'fulfilled') conductores = Array.isArray(resultados[1].value) ? resultados[1].value : [];
    if (resultados[2].status === 'fulfilled') clientes = Array.isArray(resultados[2].value) ? resultados[2].value : [];

    poblarSelect('filtroVehiculo', vehiculos, v => `${v.codigo || ''} - ${v.placa || ''}${v.marca ? ` (${v.marca})` : ''}`, 'Todos los vehículos');
    poblarSelect('filtroConductor', conductores, c => `${c.nombre}${c.documento ? ` (${c.documento})` : ''}`, 'Todos los conductores');

    const fallos = resultados.filter(r => r.status === 'rejected');
    if (fallos.length) {
      console.error('No se pudieron cargar todos los catálogos de Bitácora:', fallos.map(r => r.reason));
      mostrarError('Algunos catálogos no pudieron cargarse. El registro de viajes sigue disponible; revise la conexión/base de datos si faltan opciones.');
    }
  }

  async function actualizarKPIs(){
    try {
      const res = await window.api.bitacora.resumen();
      document.getElementById('kpiTotalViajes').textContent = formatoEntero(res.totalViajes);
      document.getElementById('kpiEnCurso').textContent = formatoEntero(res.enCurso);
      document.getElementById('kpiCompletados').textContent = formatoEntero(res.completados);
      document.getElementById('kpiTotalKm').textContent = `${new Intl.NumberFormat('es-NI').format(Number(res.totalKm)||0)} km`;
    } catch(err) {
      console.error('Error al cargar resumen de Bitácora:', err);
    }
  }

  function obtenerFiltros(){
    return {
      busqueda: document.getElementById('filtroBuscar').value.trim(),
      desde: document.getElementById('filtroDesde').value,
      hasta: document.getElementById('filtroHasta').value,
      estado: document.getElementById('filtroEstado').value,
      vehiculo_id: document.getElementById('filtroVehiculo').value,
      conductor_id: document.getElementById('filtroConductor').value
    };
  }

  async function cargarLista(){
    ocultarError();
    const tabla = document.getElementById('contenedorTablaBitacora');
    tabla.innerHTML = '<div class="empty">Buscando registros...</div>';

    const filtros = obtenerFiltros();
    if (filtros.desde && filtros.hasta && filtros.desde > filtros.hasta) {
      mostrarError('La fecha "Desde" no puede ser posterior a la fecha "Hasta".');
      tabla.innerHTML = '<div class="empty">Corrija el rango de fechas para continuar.</div>';
      return;
    }

    try {
      const viajes = await window.api.bitacora.listar(filtros);

      if(!viajes.length){
        tabla.innerHTML = '<div class="empty">No hay registros de viajes con los filtros seleccionados.</div>';
        return;
      }

      tabla.innerHTML = `
        <table style="min-width:1300px; font-size:12px;">
          <thead>
            <tr>
              <th style="width:45px">ID</th>
              <th>FECHA</th>
              <th>UNIDAD</th>
              <th>CONDUCTOR</th>
              <th>CLIENTE</th>
              <th>MODULO</th>
              <th>H. SALIDA</th>
              <th>LUGAR SALIDA</th>
              <th>H. LLEGADA</th>
              <th>DESTINO</th>
              <th>H. SALIDA (DEST)</th>
              <th>H. RETORNO</th>
              <th>KM SALIDA / LLEGADA</th>
              <th style="text-align:right">VIATICO</th>
              <th style="text-align:right">ESTADIA</th>
              <th style="text-align:right">ESTELI</th>
              <th>ESTADO / NOTA</th>
              <th style="text-align:right">ACCIONES</th>
            </tr>
          </thead>
          <tbody>
            ${viajes.map(v => {
              let badgeClass = 'badge-warning';
              if (v.estado === 'COMPLETADO') badgeClass = 'badge-success';
              if (v.estado === 'CANCELADO') badgeClass = 'badge-danger';
              const kmRec = Number(v.km_recorridos) || (Number(v.km_llegada) > Number(v.km_salida) ? Number(v.km_llegada) - Number(v.km_salida) : 0);
              const unidadTxt = v.vehiculo_placa ? String(v.vehiculo_placa) : 'Sin unidad';
              const condTxt = v.conductor_nombre ? esc(v.conductor_nombre) : '<span style="color:var(--muted)">-</span>';
              const cliTxt = v.cliente_nombre_rel ? esc(v.cliente_nombre_rel) : (v.cliente ? esc(v.cliente) : '<span style="color:var(--muted)">-</span>');
              const lugarSalidaTxt = esc(v.lugar_salida || v.origen || '-');
              const notaTxt = v.observaciones || v.carga_descripcion || '';
              const notaEsc = esc(notaTxt);

              return `
                <tr>
                  <td><strong>#${esc(v.id)}</strong></td>
                  <td><strong>${esc(v.fecha || '')}</strong></td>
                  <td><strong>${esc(unidadTxt)}</strong>${v.vehiculo_marca ? `<br><small style="color:var(--muted)">${esc(v.vehiculo_marca)}</small>` : ''}</td>
                  <td>${condTxt}</td>
                  <td><strong>${cliTxt}</strong></td>
                  <td>${v.modulo ? `<span class="badge badge-neutral">${esc(v.modulo)}</span>` : '-'}</td>
                  <td>${esc(v.hora_salida || '-')}</td>
                  <td>${lugarSalidaTxt}</td>
                  <td>${esc(v.hora_llegada || '-')}</td>
                  <td><strong>${esc(v.destino || '-')}</strong></td>
                  <td>${esc(v.hora_salida_destino || '-')}</td>
                  <td>${esc(v.hora_retorno || '-')}</td>
                  <td>
                    <small>${Number(v.km_salida||0).toLocaleString()} &rarr; ${Number(v.km_llegada||0) > 0 ? Number(v.km_llegada).toLocaleString() : 'Pend.'}</small>
                    ${kmRec > 0 ? `<br><strong style="color:var(--primary); font-size:11px;">${kmRec.toLocaleString()} km</strong>` : ''}
                  </td>
                  <td style="text-align:right">${formatoMonto(v.viatico || 0)}</td>
                  <td style="text-align:right">${formatoMonto(v.estadia || 0)}</td>
                  <td style="text-align:right">${formatoMonto(v.esteli || 0)}</td>
                  <td>
                    <span class="badge ${badgeClass}">${esc(v.estado || '')}</span>
                    ${notaTxt ? `<br><small style="color:var(--muted); max-width:140px; display:inline-block; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="${notaEsc}">${notaEsc}</small>` : ''}
                  </td>
                  <td style="text-align:right">
                    <div class="action-buttons" style="justify-content:flex-end; gap:4px;">
                      <button class="btn btn-sm btn-secondary btnEditar" data-id="${esc(v.id)}" type="button">Editar</button>
                      ${v.estado === 'EN CURSO' ? `<button class="btn btn-sm primary btnFinalizar" data-id="${esc(v.id)}" type="button">Fin</button>` : ''}
                      <button class="btn btn-sm btn-danger btnEliminar" data-id="${esc(v.id)}" type="button">✕</button>
                    </div>
                  </td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      `;

      document.querySelectorAll('.btnEditar').forEach(btn => {
        btn.onclick = () => {
          const item = viajes.find(x => String(x.id) === String(btn.dataset.id));
          if (item) abrirModalForm(item);
        };
      });

      document.querySelectorAll('.btnFinalizar').forEach(btn => {
        btn.onclick = () => {
          const item = viajes.find(x => String(x.id) === String(btn.dataset.id));
          if (item) abrirModalFinalizar(item);
        };
      });

      document.querySelectorAll('.btnEliminar').forEach(btn => {
        btn.onclick = async () => {
          if (!await confirmarAccion({ estado: 'error', titulo: '¿Eliminar este registro?', mensaje: 'Se eliminará el viaje de la bitácora. Esta acción no se puede deshacer.', botonOk: 'Eliminar', okPeligroso: true })) return;
          btn.disabled = true;
          try {
            await window.api.bitacora.eliminar(Number(btn.dataset.id));
            await Promise.all([cargarLista(), actualizarKPIs()]);
          } catch (err) {
            console.error(err);
            avisarError('No se pudo eliminar el registro', err.message || 'No fue posible eliminar el registro.');
            btn.disabled = false;
          }
        };
      });
    } catch (err) {
      console.error('Error al listar Bitácora:', err);
      tabla.innerHTML = '<div class="empty">No fue posible cargar la bitácora. Revise la conexión con la base de datos.</div>';
      mostrarError(err.message || 'Error al cargar la Bitácora.');
    }
  }

  function cerrarModal(){
    modalContainer.innerHTML = '';
  }

  function abrirModalForm(item = null){
    const hoy = fechaHoy();
    const ahora = new Date().toTimeString().slice(0,5);
    const opcionesCliente = (item && item.cliente_id && !clientes.some(c => c.id == item.cliente_id))
      ? [{ id: item.cliente_id, nombre: item.cliente || `Cliente #${item.cliente_id}`, identificacion: '' }, ...clientes]
      : clientes;

    modalContainer.innerHTML = `
      <div class="modal-overlay">
        <div class="modal-box" style="max-width:760px;">
          <div class="modal-header">
            <h3>${item ? `Editar Registro de Bitácora #${esc(item.id)}` : 'Registrar en Bitácora'}</h3>
            <button class="modal-close" id="btnCerrarModal" type="button">&times;</button>
          </div>
          <form id="formViaje">
            <input type="hidden" id="viajeId" value="${item ? esc(item.id) : ''}">

            <div class="form-row">
              <div class="form-group">
                <label>1. ID</label>
                <input type="text" disabled value="${item ? esc(item.id) : '(Autogenerado)'}">
              </div>
              <div class="form-group">
                <label>2. FECHA *</label>
                <input id="vFecha" type="date" required value="${item ? esc(item.fecha) : hoy}">
              </div>
            </div>

            <div class="form-row">
              <div class="form-group">
                <label>3. UNIDAD (VEHÍCULO)</label>
                <select id="vVehiculo">
                  <option value="">-- Seleccionar Unidad --</option>
                  ${vehiculos.map(v => `<option value="${esc(v.id)}" ${item && item.vehiculo_id == v.id ? 'selected' : ''}>${esc(v.codigo || '')} - ${esc(v.placa || '')} (${esc(`${v.marca || ''} ${v.modelo || ''}`.trim())})</option>`).join('')}
                </select>
              </div>
              <div class="form-group">
                <label>4. CONDUCTOR</label>
                <select id="vConductor">
                  <option value="">-- Seleccionar Conductor --</option>
                  ${conductores.map(c => `<option value="${esc(c.id)}" ${item && item.conductor_id == c.id ? 'selected' : ''}>${esc(c.nombre || '')} ${c.documento ? `(${esc(c.documento)})` : ''}</option>`).join('')}
                </select>
              </div>
            </div>

            <div class="form-row">
              <div class="form-group">
                <label>5. CLIENTE</label>
                <select id="vClienteSelect">
                  <option value="">-- Seleccionar Cliente --</option>
                  ${opcionesCliente.map(c => `<option value="${esc(c.id)}" data-nombre="${esc(c.nombre || '')}" ${item && (item.cliente_id == c.id || item.cliente == c.nombre) ? 'selected' : ''}>${esc(c.nombre || '')} ${c.identificacion ? `(${esc(c.identificacion)})` : ''}</option>`).join('')}
                  <option value="OTRO" ${item && item.cliente && !item.cliente_id ? 'selected' : ''}>[ Otro / Manual ]</option>
                </select>
                <input id="vClienteManual" type="text" placeholder="Escriba cliente no registrado..." style="margin-top:6px; display:${item && item.cliente && !item.cliente_id ? 'block' : 'none'};" value="${item && item.cliente && !item.cliente_id ? esc(item.cliente) : ''}">
              </div>
              <div class="form-group">
                <label>6. MODULO</label>
                <input id="vModulo" type="text" placeholder="Ej. Flete, Distribución, Traslado..." value="${item && item.modulo ? esc(item.modulo) : ''}">
              </div>
            </div>

            <div class="form-row">
              <div class="form-group">
                <label>7. H. SALIDA</label>
                <input id="vHoraSalida" type="time" value="${item ? esc(item.hora_salida || '') : ahora}">
              </div>
              <div class="form-group">
                <label>8. LUGAR DE SALIDA *</label>
                <input id="vLugarSalida" type="text" placeholder="Plantel / Ciudad de partida" required value="${esc(item ? (item.lugar_salida || item.origen || 'Managua') : 'Managua')}">
              </div>
            </div>

            <div class="form-row">
              <div class="form-group">
                <label>9. H. LLEGADA</label>
                <input id="vHoraLlegada" type="time" value="${item ? esc(item.hora_llegada || '') : ''}">
              </div>
              <div class="form-group">
                <label>10. DESTINO *</label>
                <input id="vDestino" type="text" placeholder="Ciudad o punto de entrega" required value="${item ? esc(item.destino || '') : ''}">
              </div>
            </div>

            <div class="form-row">
              <div class="form-group">
                <label>11. H. SALIDA (DESTINO)</label>
                <input id="vHoraSalidaDestino" type="time" value="${item ? esc(item.hora_salida_destino || '') : ''}">
              </div>
              <div class="form-group">
                <label>12. H. RETORNO</label>
                <input id="vHoraRetorno" type="time" value="${item ? esc(item.hora_retorno || '') : ''}">
              </div>
            </div>

            <div class="form-row">
              <div class="form-group">
                <label>KM DE SALIDA</label>
                <input id="vKmSalida" type="number" min="0" step="0.1" value="${item ? esc(item.km_salida ?? 0) : '0'}">
              </div>
              <div class="form-group">
                <label>KM DE LLEGADA</label>
                <input id="vKmLlegada" type="number" min="0" step="0.1" value="${item ? esc(item.km_llegada ?? 0) : '0'}">
              </div>
            </div>

            <div class="form-row" style="grid-template-columns:1fr 1fr 1fr;">
              <div class="form-group">
                <label>13. VIATICO (${esc(monedaTexto())})</label>
                <input id="vViatico" type="number" step="0.01" min="0" value="${item ? esc(item.viatico ?? 0) : '0'}">
              </div>
              <div class="form-group">
                <label>14. ESTADIA (${esc(monedaTexto())})</label>
                <input id="vEstadia" type="number" step="0.01" min="0" value="${item ? esc(item.estadia ?? 0) : '0'}">
              </div>
              <div class="form-group">
                <label>15. ESTELI (${esc(monedaTexto())})</label>
                <input id="vEsteli" type="number" step="0.01" min="0" value="${item ? esc(item.esteli ?? 0) : '0'}">
              </div>
            </div>

            <div class="form-row">
              <div class="form-group">
                <label>Estado del Viaje</label>
                <select id="vEstado">
                  <option value="EN CURSO" ${!item || item.estado === 'EN CURSO' ? 'selected' : ''}>En curso</option>
                  <option value="COMPLETADO" ${item && item.estado === 'COMPLETADO' ? 'selected' : ''}>Completado</option>
                  <option value="CANCELADO" ${item && item.estado === 'CANCELADO' ? 'selected' : ''}>Cancelado</option>
                </select>
              </div>
              <div class="form-group">
                <label>Descripción Carga (Opcional)</label>
                <input id="vCarga" type="text" placeholder="Ej. Abarrotes, seco..." value="${item && item.carga_descripcion ? esc(item.carga_descripcion) : ''}">
              </div>
            </div>

            <div class="form-row full">
              <div class="form-group">
                <label>16. NOTA / OBSERVACIONES</label>
                <textarea id="vObservaciones" rows="3" placeholder="Novedades, retrasos, retén, detalles de ruta...">${item && item.observaciones ? esc(item.observaciones) : ''}</textarea>
              </div>
            </div>

            <div class="modal-actions">
              <button type="button" class="btn" id="btnCancelarModal">Cancelar</button>
              <button type="submit" class="btn primary" id="btnGuardarViaje">Guardar Registro</button>
            </div>
          </form>
        </div>
      </div>
    `;

    document.getElementById('btnCerrarModal').onclick = cerrarModal;
    document.getElementById('btnCancelarModal').onclick = cerrarModal;

    const cliSel = document.getElementById('vClienteSelect');
    const cliMan = document.getElementById('vClienteManual');
    cliSel.onchange = () => {
      const manual = cliSel.value === 'OTRO';
      cliMan.style.display = manual ? 'block' : 'none';
      if (manual) cliMan.focus();
    };

    document.getElementById('formViaje').onsubmit = async (e) => {
      e.preventDefault();

      const btnGuardar = document.getElementById('btnGuardarViaje');
      if (!btnGuardar || btnGuardar.disabled) return;

      const fecha = document.getElementById('vFecha').value;
      const lugarSalidaVal = document.getElementById('vLugarSalida').value.trim();
      const destinoVal = document.getElementById('vDestino').value.trim();
      const kmSalida = parseFloat(document.getElementById('vKmSalida').value) || 0;
      const kmLlegada = parseFloat(document.getElementById('vKmLlegada').value) || 0;

      if (!fecha || !lugarSalidaVal || !destinoVal) {
        avisarAdvertencia('Faltan datos', 'Complete la fecha, el lugar de salida y el destino.');
        return;
      }
      if (kmLlegada > 0 && kmLlegada < kmSalida) {
        avisarAdvertencia('Kilometraje incorrecto', 'El Km de llegada no puede ser menor al Km de salida.');
        return;
      }

      const selCliente = document.getElementById('vClienteSelect');
      const cliente = selCliente.value === 'OTRO'
        ? document.getElementById('vClienteManual').value.trim()
        : (selCliente.options[selCliente.selectedIndex]?.dataset?.nombre || null);

      const payload = {
        id: document.getElementById('viajeId').value ? Number(document.getElementById('viajeId').value) : null,
        fecha,
        vehiculo_id: document.getElementById('vVehiculo').value ? Number(document.getElementById('vVehiculo').value) : null,
        conductor_id: document.getElementById('vConductor').value ? Number(document.getElementById('vConductor').value) : null,
        cliente_id: selCliente.value && selCliente.value !== 'OTRO' ? Number(selCliente.value) : null,
        cliente: cliente || null,
        modulo: document.getElementById('vModulo').value.trim() || null,
        hora_salida: document.getElementById('vHoraSalida').value || null,
        lugar_salida: lugarSalidaVal,
        origen: lugarSalidaVal,
        hora_llegada: document.getElementById('vHoraLlegada').value || null,
        destino: destinoVal,
        hora_salida_destino: document.getElementById('vHoraSalidaDestino').value || null,
        hora_retorno: document.getElementById('vHoraRetorno').value || null,
        km_salida: kmSalida,
        km_llegada: kmLlegada,
        viatico: Math.max(0, parseFloat(document.getElementById('vViatico').value) || 0),
        estadia: Math.max(0, parseFloat(document.getElementById('vEstadia').value) || 0),
        esteli: Math.max(0, parseFloat(document.getElementById('vEsteli').value) || 0),
        carga_descripcion: document.getElementById('vCarga').value.trim() || null,
        estado: document.getElementById('vEstado').value,
        observaciones: document.getElementById('vObservaciones').value.trim() || null
      };

      btnGuardar.disabled = true;
      btnGuardar.textContent = 'Guardando...';
      try {
        const resultado = await window.api.bitacora.guardar(payload);
        if (!resultado || resultado.ok === false) throw new Error('La base de datos no confirmó el registro.');
        cerrarModal();
        await Promise.all([cargarLista(), actualizarKPIs()]);
      } catch (err) {
        console.error('Error al guardar Bitácora:', err);
        avisarError('No se pudo guardar el viaje', err.message || 'No fue posible guardar el viaje.');
        btnGuardar.disabled = false;
        btnGuardar.textContent = 'Guardar Registro';
      }
    };
  }

  function abrirModalFinalizar(item){
    const ahora = new Date().toTimeString().slice(0,5);
    const rutaOrigen = item.lugar_salida || item.origen || 'Origen';

    modalContainer.innerHTML = `
      <div class="modal-overlay">
        <div class="modal-box" style="max-width:450px;">
          <div class="modal-header">
            <h3>Finalizar Viaje #${esc(item.id)}</h3>
            <button class="modal-close" id="btnCerrarFin" type="button">&times;</button>
          </div>
          <form id="formFinViaje">
            <p style="font-size:13px; color:var(--muted); margin-top:0;">
              Ruta: <strong>${esc(rutaOrigen)} &rarr; ${esc(item.destino || '')}</strong><br>
              Km salida: <strong>${Number(item.km_salida || 0).toLocaleString()} km</strong>
            </p>
            <div class="form-group" style="margin-bottom:12px;">
              <label>Hora de Retorno / Llegada *</label>
              <input id="finHoraLlegada" type="time" required value="${esc(ahora)}">
            </div>
            <div class="form-group" style="margin-bottom:12px;">
              <label>Km Llegada *</label>
              <input id="finKmLlegada" type="number" step="0.1" min="${Number(item.km_salida || 0)}" required placeholder="Mayor o igual a ${Number(item.km_salida || 0)}" value="${Number(item.km_llegada) > Number(item.km_salida) ? esc(item.km_llegada) : ''}">
            </div>
            <div class="form-group" style="margin-bottom:12px;">
              <label>Observaciones de Cierre (Nota)</label>
              <textarea id="finObservaciones" placeholder="Llegada sin novedad, entrega realizada..."></textarea>
            </div>
            <div class="modal-actions">
              <button type="button" class="btn" id="btnCancelarFin">Cancelar</button>
              <button type="submit" class="btn primary" id="btnGuardarFin">Marcar como Completado</button>
            </div>
          </form>
        </div>
      </div>
    `;

    document.getElementById('btnCerrarFin').onclick = cerrarModal;
    document.getElementById('btnCancelarFin').onclick = cerrarModal;

    document.getElementById('formFinViaje').onsubmit = async (e) => {
      e.preventDefault();
      const btn = document.getElementById('btnGuardarFin');
      if (btn.disabled) return;

      const kmLlegada = parseFloat(document.getElementById('finKmLlegada').value);
      if (!Number.isFinite(kmLlegada) || kmLlegada < Number(item.km_salida || 0)) {
        avisarAdvertencia('Kilometraje incorrecto', 'El Km de llegada debe ser mayor o igual al Km de salida.');
        return;
      }

      const obsFin = document.getElementById('finObservaciones').value.trim();
      const horaRetornoFin = document.getElementById('finHoraLlegada').value;
      const payload = {
        ...item,
        km_llegada: kmLlegada,
        hora_retorno: horaRetornoFin,
        hora_llegada: item.hora_llegada || horaRetornoFin,
        estado: 'COMPLETADO',
        observaciones: obsFin
          ? (item.observaciones ? `${item.observaciones} | Cierre: ${obsFin}` : `Cierre: ${obsFin}`)
          : (item.observaciones || null)
      };

      btn.disabled = true;
      btn.textContent = 'Guardando...';
      try {
        await window.api.bitacora.guardar(payload);
        cerrarModal();
        await Promise.all([cargarLista(), actualizarKPIs()]);
      } catch (err) {
        console.error('Error al finalizar Bitácora:', err);
        avisarError('No se pudo finalizar el viaje', err.message || 'No fue posible finalizar el viaje.');
        btn.disabled = false;
        btn.textContent = 'Marcar como Completado';
      }
    };
  }

  // Estos eventos se enlazan antes de cargar catálogos para que el módulo
  // siga siendo utilizable aunque falle una consulta secundaria.
  document.getElementById('btnNuevoViaje').onclick = () => abrirModalForm();

  document.getElementById('btnFiltrar').onclick = () => cargarLista();

  document.getElementById('btnLimpiarFiltros').onclick = () => {
    Object.entries(estadoInicial).forEach(([key, value]) => {
      const id = ({
        busqueda: 'filtroBuscar',
        desde: 'filtroDesde',
        hasta: 'filtroHasta',
        estado: 'filtroEstado',
        vehiculo_id: 'filtroVehiculo',
        conductor_id: 'filtroConductor'
      })[key];
      const el = document.getElementById(id);
      if (el) el.value = value;
    });
    cargarLista();
  };

  ['filtroBuscar','filtroDesde','filtroHasta','filtroEstado','filtroVehiculo','filtroConductor'].forEach(id => {
    document.getElementById(id)?.addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        e.preventDefault();
        cargarLista();
      }
    });
  });

  await Promise.allSettled([cargarCatalogos(), cargarLista(), actualizarKPIs()]);
}

async function renderReportes(){
  content.innerHTML=`
    <div class="page-intro">
      <h2>Reportes</h2>
      <p>Centro de consulta administrativa, financiera y operativa sobre la base de datos.</p>
    </div>
    <div class="module-grid">
      <div class="module-card"><h3>Uso de combustible</h3><p>Consumo, costo, kilometraje, vehículo y conductor.</p></div>
      <div class="module-card"><h3>Egresos</h3><p>Gastos por fecha, categoría, beneficiario y método.</p></div>
      <div class="module-card"><h3>Ingresos</h3><p>Cobros por fecha, categoría, cliente y método.</p></div>
      <div class="module-card"><h3>Planilla</h3><p>Costos de nómina, deducciones y pagos.</p></div>
      <div class="module-card"><h3>Viáticos</h3><p>Asignados, liquidados y pendientes.</p></div>
      <div class="module-card"><h3>Resumen general</h3><p>Información consolidada de la empresa.</p></div>
    </div>
    <div class="panel">
      <h3>Consulta de movimientos</h3>
      <div class="toolbar">
        <div class="field">
          <label>Tipo de reporte</label>
          <select id="tipoReporte">
            <option value="egresos">Egresos / Gastos</option>
            <option value="ingresos">Ingresos</option>
            <option value="combustible">Consumo de combustible</option>
            <option value="comparativo">Ingresos vs. egresos</option>
          </select>
        </div>
        <div class="field"><label>Desde</label><input id="desde" type="date"></div>
        <div class="field"><label>Hasta</label><input id="hasta" type="date"></div>
        <button id="consultar" class="btn primary">Consultar</button>
        <button id="btnImprimirReporte" class="btn" type="button">🖨️ Imprimir</button>
      </div>
      <div id="resumenReporte" class="metrics-grid" style="margin-bottom:14px;"></div>
      <div id="tabla" class="table-wrap"><div class="empty">Seleccione un tipo de reporte, el período y consulte.</div></div>
    </div>
  `;

  document.getElementById('desde').value=fechaHaceDias(30);
  document.getElementById('hasta').value=fechaHoy();
  const filtros=()=>({desde:document.getElementById('desde').value,hasta:document.getElementById('hasta').value});
  function tarjeta(etiqueta,valor,color){
    return `<div class="card"><div class="card-label">${etiqueta}</div><div class="card-value" style="font-size:20px;${color?'color:'+color+';':''}">${valor}</div></div>`;
  }

  document.getElementById('btnImprimirReporte').onclick=()=>{
    const tipoSel=document.getElementById('tipoReporte');
    const tituloTipo=tipoSel.options[tipoSel.selectedIndex]?.textContent.trim()||'Reporte';
    imprimirContenido({
      titulo:`Reportes · ${tituloTipo}`,
      filtrosTexto:`<strong>Desde:</strong> ${document.getElementById('desde').value||'-'} &nbsp;·&nbsp; <strong>Hasta:</strong> ${document.getElementById('hasta').value||'-'}`,
      resumenHtml:document.getElementById('resumenReporte').innerHTML,
      cuerpoHtml:document.getElementById('tabla').innerHTML
    });
  };
  document.getElementById('consultar').onclick=async()=>{
    const tipo=document.getElementById('tipoReporte').value;
    const f=filtros();
    const resumen=document.getElementById('resumenReporte');
    const cont=document.getElementById('tabla');

    if(tipo==='comparativo'){
      const [ing,egr]=await Promise.all([window.api.ingresos.resumen(f),window.api.egresos.resumen(f)]);
      resumen.innerHTML=tarjeta('Ingresos',formatoMonto(ing.total))+
        tarjeta('Egresos',formatoMonto(egr.total),'var(--danger)')+
        tarjeta('Diferencia',formatoMonto(ing.total-egr.total),(ing.total-egr.total)>=0?'var(--success)':'var(--danger)');
      if(!ing.cantidad&&!egr.cantidad){
        cont.innerHTML='<div class="empty">No hay movimientos para el período.</div>';
        return;
      }
      cont.innerHTML=`
        <table>
          <thead><tr><th>Categoría</th><th>Tipo</th><th style="text-align:right">Registros</th><th style="text-align:right">Total</th></tr></thead>
          <tbody>
            ${ing.porCategoria.map(c=>`<tr><td>${c.categoria}</td><td>Ingreso</td><td style="text-align:right">${c.cantidad}</td><td style="text-align:right">${formatoMonto(c.total)}</td></tr>`).join('')}
            ${egr.porCategoria.map(c=>`<tr><td>${c.categoria}</td><td>Egreso</td><td style="text-align:right">${c.cantidad}</td><td style="text-align:right">${formatoMonto(c.total)}</td></tr>`).join('')}
          </tbody>
        </table>`;
      return;
    }

    if(tipo==='combustible'){
      const datos=await window.api.reportes.combustible(f);
      const totalGasto=datos.reduce((s,x)=>s+(x.total||0),0);
      const totalLitros=datos.reduce((s,x)=>s+(x.cantidad||0),0);
      resumen.innerHTML=tarjeta('Cargas',formatoEntero(datos.length))+
        tarjeta('Volumen',`${totalLitros.toFixed(2)} L`)+
        tarjeta('Gasto total',formatoMonto(totalGasto),'var(--danger)');
      cont.innerHTML=datos.length?`
        <table>
          <thead><tr><th>Fecha</th><th>Vehículo</th><th>Conductor</th><th>Odómetro</th><th style="text-align:right">Cantidad</th><th style="text-align:right">Precio</th><th style="text-align:right">Total</th></tr></thead>
          <tbody>
            ${datos.map(x=>`<tr><td>${x.fecha}</td><td>${x.placa||''} ${x.modelo||''}</td><td>${x.conductor||'N/D'}</td><td>${x.kilometraje||0}</td><td style="text-align:right">${(x.cantidad||0).toFixed(2)}</td><td style="text-align:right">${formatoMonto(x.precio_unitario)}</td><td style="text-align:right"><strong>${formatoMonto(x.total)}</strong></td></tr>`).join('')}
          </tbody>
        </table>`:'<div class="empty">No hay cargas de combustible en el período.</div>';
      return;
    }

    const api=tipo==='ingresos'?window.api.ingresos:window.api.egresos;
    const [datos,res]=await Promise.all([api.listar(f),api.resumen(f)]);
    resumen.innerHTML=tarjeta('Total',formatoMonto(res.total),tipo==='ingresos'?'var(--success)':'var(--danger)')+
      tarjeta('Registros',formatoEntero(res.cantidad))+tarjeta('Promedio',formatoMonto(res.promedio));
    cont.innerHTML=datos.length?`
      <table>
        <thead><tr><th>Fecha</th><th>Concepto</th><th>Categoría</th><th>${tipo==='ingresos'?'Cliente':'Beneficiario'}</th><th>Método</th><th style="text-align:right">Monto</th></tr></thead>
        <tbody>
          ${datos.map(x=>`<tr><td>${x.fecha}</td><td>${x.concepto}</td><td>${x.categoria||''}</td><td>${tipo==='ingresos'?(x.cliente_nombre||''):(x.beneficiario||'')}</td><td>${x.metodo||''}</td><td style="text-align:right"><strong>${formatoMonto(x.monto)}</strong></td></tr>`).join('')}
        </tbody>
      </table>`:'<div class="empty">No hay registros para el período seleccionado.</div>';
  };
}

async function renderConfiguracion(){
  content.innerHTML=`
    <div class="page-intro">
      <h2>Configuración</h2>
      <p>Centro de configuración del sistema: empresa, apariencia, base de datos e información del sistema.</p>
    </div>

    <div class="nav-tabs">
      <button class="tab-btn active" data-tab="tabCfgEmpresa">Empresa</button>
      <button class="tab-btn" data-tab="tabCfgApariencia">Apariencia</button>
      <button class="tab-btn" data-tab="tabCfgBaseDatos">Base de Datos</button>
      <button class="tab-btn" data-tab="tabCfgAcerca">Acerca de</button>
    </div>

    <div id="tabCfgEmpresa" class="tab-content active">
      <div class="panel" style="margin-top:0;">
        <h3>Datos de la empresa</h3>
        <p style="margin-top:-4px; color:var(--muted); font-size:13px;">
          Este nombre aparece junto a su logotipo en la parte superior del sistema y en los reportes impresos.
          El nombre del sistema, <strong>SmartTransPro</strong>, no se puede modificar.
        </p>
        <div class="logo-config">
          <div class="empresa-logo logo-config-preview" id="logoPreview" role="img" aria-label="Vista previa del logotipo"></div>
          <div class="logo-config-acciones">
            <div class="field" style="margin:0;">
              <label>Logotipo de la empresa</label>
              <input id="logoArchivo" type="file" accept="image/png,image/jpeg,image/svg+xml,image/webp">
            </div>
            <button id="quitarLogo" class="btn btn-secondary" type="button">Quitar logotipo</button>
            <p style="margin:0; color:var(--muted); font-size:12px;">
              Si no carga ninguna imagen, se muestran las iniciales del nombre sobre un color propio de la empresa.
            </p>
          </div>
        </div>
        <div class="form-grid">
          <div class="field"><label>Nombre de la empresa</label><input id="empresa" placeholder="Ej. Transporte Fierro"></div>
          <div class="field"><label>Moneda</label><select id="moneda"><option value="NIO">NIO - Córdoba</option><option value="USD">USD - Dólar</option></select></div>
          <div class="field"><label>Símbolo</label><input id="simbolo" placeholder="Ej. C$"></div>
        </div>
        <div class="form-actions"><button id="guardar" class="btn primary">Guardar configuración</button></div>
      </div>
    </div>

    <div id="tabCfgApariencia" class="tab-content">
      <div class="panel" style="margin-top:0;">
        <h3>Apariencia</h3>
        <p style="margin-top:-4px; color:var(--muted); font-size:13px;">Esta preferencia se guarda en este equipo (no afecta a otros usuarios del sistema).</p>
        <div class="form-grid">
          <div class="field">
            <label>Tema de la interfaz</label>
            <select id="temaInterfaz">
              <option value="light">Claro</option>
              <option value="dark">Oscuro tipo código</option>
            </select>
          </div>
        </div>
      </div>
    </div>

    <div id="tabCfgBaseDatos" class="tab-content">
      <div class="panel" style="margin-top:0;">
        <h3>Base de datos</h3>
        <div id="panelBaseDatos"><div class="empty">Cargando información de la base de datos...</div></div>
      </div>
    </div>

    <div id="tabCfgAcerca" class="tab-content">
      <div class="panel" style="margin-top:0;">
        <h3>Acerca del sistema</h3>
        <div class="form-grid">
          <div class="field"><label>Sistema</label><input disabled value="SmartTransPro"></div>
          <div class="field"><label>Versión</label><input disabled value="0.1.0"></div>
          <div class="field"><label>Empresa configurada</label><input disabled id="acercaEmpresa" value="-"></div>
          <div class="field"><label>Motor de base de datos</label><input disabled id="acercaMotor" value="-"></div>
        </div>
      </div>
    </div>
  `;

  const tabBtnsCfg=content.querySelectorAll('.tab-btn');
  const tabContentsCfg=content.querySelectorAll('.tab-content');
  tabBtnsCfg.forEach(btn=>btn.addEventListener('click',()=>{
    tabBtnsCfg.forEach(b=>b.classList.remove('active'));
    tabContentsCfg.forEach(c=>c.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(btn.dataset.tab).classList.add('active');
  }));

  const d=await window.api.configuracion.obtener();
  document.getElementById('temaInterfaz').value=localStorage.getItem('control-empresa-tema')||'light';
  document.getElementById('temaInterfaz').onchange=()=>{
    localStorage.setItem('control-empresa-tema',document.getElementById('temaInterfaz').value);
    aplicarTema();
  };
  document.getElementById('empresa').value=d.nombre_empresa||'';
  document.getElementById('moneda').value=d.moneda||'NIO';
  document.getElementById('simbolo').value=d.simbolo||'C$';
  document.getElementById('acercaEmpresa').value=d.nombre_empresa||'Transporte Fierro';

  // Logotipo: se trabaja con una copia en memoria y solo se guarda al pulsar
  // "Guardar configuración", igual que el nombre.
  let logoElegida=d.logo_empresa||'';
  const refrescarPreview=()=>{
    pintarLogoEmpresa(document.getElementById('logoPreview'), document.getElementById('empresa').value.trim()||'Transporte Fierro', logoElegida);
  };
  refrescarPreview();
  document.getElementById('empresa').addEventListener('input',refrescarPreview);
  document.getElementById('logoArchivo').onchange=async()=>{
    const archivo=document.getElementById('logoArchivo').files[0];
    if(!archivo) return;
    // Tope de 400 KB: la tabla "configuracion" es de una sola fila y se copia
    // entera en cada lectura, así que guardar imágenes enormes la haría lenta.
    if(archivo.size>400*1024){
      await avisar({estado:'advertencia',titulo:'Imagen muy grande',mensaje:'El logotipo debe pesar menos de 400 KB. Elija una imagen más pequeña.'});
      document.getElementById('logoArchivo').value='';
      return;
    }
    logoElegida=await leerArchivoComoDatos(archivo);
    refrescarPreview();
  };
  document.getElementById('quitarLogo').onclick=()=>{
    logoElegida='';
    document.getElementById('logoArchivo').value='';
    refrescarPreview();
  };

  document.getElementById('guardar').onclick=async()=>{
    const nombreNuevo=document.getElementById('empresa').value.trim();
    if(!nombreNuevo){
      await avisar({estado:'advertencia',titulo:'Falta el nombre',mensaje:'El nombre de la empresa no puede quedar vacío.'});
      return;
    }
    await window.api.configuracion.guardar({
      nombre_empresa:nombreNuevo,
      moneda:document.getElementById('moneda').value,
      simbolo:document.getElementById('simbolo').value.trim()||'C$',
      logo_empresa:logoElegida
    });
    await aplicarConfiguracionEmpresa();
    document.getElementById('acercaEmpresa').value=nombreNuevo;
    await avisarExito('Configuración guardada','Los datos de la empresa quedaron actualizados.');
  };
  await montarPanelBaseDatos();
  const info=await window.api.sistema.info().catch(()=>null);
  if(info) document.getElementById('acercaMotor').value=`SQLite v${info.sqlite} · esquema ${info.version}`;
}

(async()=>{
  inicializarInterfaz();
  iniciarControlSesion();
  // La pantalla de acceso (o, la primera vez, la de instalación) tapa la
  // aplicación: hasta que haya una sesión válida no se lee ni un dato de la
  // base de datos. iniciarAcceso() decide cuál de las dos se muestra.
  await iniciarAcceso();
})();
