// Prueba de interfaz de Electron. Abre la aplicación real con una base temporal,
// recorre todos los módulos, verifica que la interfaz termine de cargar y toma una captura.
// Uso: npm run test:ui
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const os = require('os');
const path = require('path');

const raiz = path.join(__dirname, '..');
const baseTemporal = path.join(os.tmpdir(), `control-empresa-ui-${Date.now()}.db`);
const captura = path.join(os.tmpdir(), 'control-empresa-dashboard.png');
process.env.CONTROL_EMPRESA_DB = baseTemporal;

const { inicializarBaseDatos, cerrarBaseDatos, cargarDatosEjemplo } = require(path.join(raiz, 'src', 'main', 'database'));
const { registrarIPC } = require(path.join(raiz, 'src', 'main', 'ipc'));

const modulos = [
  'escritorio', 'dashboard', 'bitacora', 'flota', 'clientes', 'planilla',
  'ingresos', 'egresos', 'reportes', 'usuarios', 'configuracion'
];
const errores = [];
let ventana;

function esperar(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Crea la primera cuenta desde el formulario de instalación. La base temporal
// arranca vacía a propósito, así que esta es la primera vez que se abre el
// sistema en esta prueba.
const INSTALAR = `(() => {
  document.getElementById('instEmpresa').value = 'Transportes Prueba';
  document.getElementById('instNombre').value = 'Ana Prueba';
  document.getElementById('instUsuario').value = 'ana';
  document.getElementById('instClave').value = 'miclave123';
  document.getElementById('instClaveRepetir').value = 'miclave123';
  document.getElementById('instBoton').click();
  return true;
})()`;

// Inicia sesión con la cuenta creada en la instalación.
const INICIAR_SESION = `(() => {
  document.getElementById('loginUsuario').value = 'ana';
  document.getElementById('loginClave').value = 'miclave123';
  document.getElementById('loginBoton').click();
  return true;
})()`;

// Espera a que el acceso termine y devuelve el estado de la sesión.
const ESTADO_SESION = `(async () => {
  await new Promise(resolve => setTimeout(resolve, 1100));
  return {
    loginVisible: !document.getElementById('loginPantalla').hidden,
    instalacionVisible: !document.getElementById('instalacionPantalla').hidden,
    usuario: document.getElementById('sidebarUsuarioNombre').textContent.trim(),
    avatar: document.getElementById('sidebarAvatar').textContent.trim(),
    empresa: document.getElementById('empresaDestacada').textContent.trim(),
    modulo: document.querySelector('.menu-item.active')?.dataset.module,
    marcaEscritorio: document.querySelector('.escritorio-marca span')?.textContent.trim(),
    preferenciaEscritorio: localStorage.getItem('control-empresa-texto-escritorio'),
    cuadriculaEscritorio: getComputedStyle(document.getElementById('content')).backgroundImage.includes('linear-gradient'),
    tamanoMarcaEscritorio: parseFloat(getComputedStyle(document.querySelector('.escritorio-marca span')).fontSize),
    soloTextoEscritorio: !document.querySelector('.escritorio-marca svg,.escritorio-marca img'),
    movimientoReducido: matchMedia('(prefers-reduced-motion: reduce)').matches,
    animacionEscritorio: {
      nombre: getComputedStyle(document.querySelector('.escritorio-marca span')).animationName,
      duracion: getComputedStyle(document.querySelector('.escritorio-marca span')).animationDuration,
      espera: getComputedStyle(document.querySelector('.escritorio-marca span')).animationDelay,
      repeticiones: getComputedStyle(document.querySelector('.escritorio-marca span')).animationIterationCount
    }
  };
})()`;

async function ejecutar() {
  console.log('\n=== Prueba de interfaz ===');
  console.log(`Base temporal: ${baseTemporal}\n`);

  inicializarBaseDatos();
  cargarDatosEjemplo();
  registrarIPC();

  ventana = new BrowserWindow({
    width: 1400,
    height: 850,
    show: false,
    backgroundColor: '#f4f6f8',
    webPreferences: {
      preload: path.join(raiz, 'src', 'preload', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  ventana.webContents.on('console-message', evento => {
    if (evento.level === 3) {
      errores.push(`Consola [3] ${evento.message} (${evento.sourceId}:${evento.lineNumber})`);
    }
  });
  ventana.webContents.on('render-process-gone', (_evento, detalles) => {
    errores.push(`Proceso de render terminado: ${detalles.reason}`);
  });
  ventana.webContents.on('did-fail-load', (_evento, codigo, descripcion, url) => {
    errores.push(`No se pudo cargar ${url}: ${codigo} ${descripcion}`);
  });

  await ventana.loadFile(path.join(raiz, 'src', 'renderer', 'index.html'));
  await ventana.show();
  await esperar(1000);

  // 1) La primera vez se muestra la instalación, no el login: la base nace
  //    vacía y el sistema no trae credenciales de fábrica.
  const alAbrir = await ventana.webContents.executeJavaScript(`({
    instalacionVisible: !document.getElementById('instalacionPantalla').hidden,
    loginVisible: !document.getElementById('loginPantalla').hidden,
    contenido: document.getElementById('content').innerText.trim(),
    empresa: document.getElementById('empresaDestacada').textContent.trim()
  })`);
  if (!alAbrir.instalacionVisible) {
    errores.push('La configuración inicial no aparece al abrir por primera vez.');
  }
  if (alAbrir.loginVisible) {
    errores.push('La pantalla de acceso aparece antes de crear la cuenta.');
  }
  if (alAbrir.contenido.trim().length > 0) {
    errores.push('La aplicación carga datos antes de iniciar sesión.');
  }

  // 2) Contraseñas que no coinciden: se avisa y no se crea la cuenta.
  await ventana.webContents.executeJavaScript(`(() => {
    document.getElementById('instEmpresa').value = 'Transportes Prueba';
    document.getElementById('instNombre').value = 'Ana Prueba';
    document.getElementById('instUsuario').value = 'ana';
    document.getElementById('instClave').value = 'miclave123';
    document.getElementById('instClaveRepetir').value = 'otra-distinta';
    document.getElementById('instBoton').click();
    return true;
  })()`);
  const installFallida = await ventana.webContents.executeJavaScript(`(async () => {
    await new Promise(resolve => setTimeout(resolve, 700));
    return {
      instalacionVisible: !document.getElementById('instalacionPantalla').hidden,
      error: document.getElementById('instError').textContent.trim()
    };
  })()`);
  if (!installFallida.instalacionVisible || !installFallida.error) {
    errores.push(`La instalación acepta contraseñas que no coinciden: ${JSON.stringify(installFallida)}`);
  }

  // 3) Instalación correcta: crea la cuenta con la clave elegida y entra.
  await ventana.webContents.executeJavaScript(INSTALAR);
  const sesion = await ventana.webContents.executeJavaScript(ESTADO_SESION);
  if (sesion.movimientoReducido ? sesion.animacionEscritorio.nombre !== 'none' :
      sesion.animacionEscritorio.nombre !== 'escritorio-animaciones' || sesion.animacionEscritorio.duracion !== '10s' ||
      sesion.animacionEscritorio.espera !== '5s' || sesion.animacionEscritorio.repeticiones !== 'infinite') {
    errores.push(`La animación del Escritorio no respeta el intervalo o la preferencia de movimiento: ${JSON.stringify(sesion.animacionEscritorio)}`);
  }
  if (!sesion.movimientoReducido && sesion.animacionEscritorio.nombre === 'escritorio-animaciones') {
    const movimientos = await ventana.webContents.executeJavaScript(`(() => {
      const texto = document.querySelector('.escritorio-marca span');
      const animacion = texto.getAnimations()[0];
      const tiempo = animacion.currentTime;
      animacion.pause();
      const posicion = tiempo => {
        animacion.currentTime = tiempo;
        const matriz = new DOMMatrix(getComputedStyle(texto).transform);
        return { x: matriz.m41, y: matriz.m42 };
      };
      const resultado = { pulso: posicion(5500), derecha: posicion(10500), izquierda: posicion(12500) };
      animacion.currentTime = tiempo;
      animacion.play();
      return resultado;
    })()`);
    if (movimientos.pulso.y >= 0 || movimientos.derecha.x <= 0 || movimientos.izquierda.x >= 0) {
      errores.push(`El Escritorio no alterna el pulso con la marquesina: ${JSON.stringify(movimientos)}`);
    }
  }
  const depurador = ventana.webContents.debugger;
  depurador.attach('1.3');
  try {
    await depurador.sendCommand('Emulation.setEmulatedMedia', {
      features: [{ name: 'prefers-reduced-motion', value: 'reduce' }]
    });
    const animacionReducida = await ventana.webContents.executeJavaScript(
      `getComputedStyle(document.querySelector('.escritorio-marca span')).animationName`
    );
    if (animacionReducida !== 'none') {
      errores.push(`El texto del Escritorio se anima con movimiento reducido: ${animacionReducida}`);
    }
  } finally {
    await depurador.sendCommand('Emulation.setEmulatedMedia', { features: [] });
    depurador.detach();
  }
  if (sesion.loginVisible || sesion.instalacionVisible) {
    errores.push('El sistema no entra tras completar la instalación.');
  }
  if (sesion.usuario !== 'Ana Prueba') {
    errores.push(`El sidebar no muestra el usuario creado en la instalación: "${sesion.usuario}"`);
  }
  if (!sesion.avatar) errores.push('El avatar del sidebar quedó vacío tras instalar.');
  if (sesion.empresa !== 'Transportes Prueba') {
    errores.push(`La empresa escrita en la instalación no se guardó: "${sesion.empresa}"`);
  }
  if (sesion.modulo !== 'escritorio'
    || sesion.marcaEscritorio !== (sesion.preferenciaEscritorio||'Transporte Fierro')
    || !sesion.cuadriculaEscritorio || sesion.tamanoMarcaEscritorio < 48 || !sesion.soloTextoEscritorio) {
    errores.push(`El acceso inicial no abre el Escritorio con la marca de agua: ${JSON.stringify(sesion)}`);
  }

  // 4) Cerrar sesión pide confirmación en un diálogo de la aplicación (ya no
  //    un confirm() del sistema) y, al aceptar, vuelve al acceso.
  const logout = await ventana.webContents.executeJavaScript(`(async () => {
    document.getElementById('btnCerrarSesion').click();
    await new Promise(resolve => setTimeout(resolve, 600));
    const dialogo = document.getElementById('dialogoSistema');
    return {
      aparece: !!dialogo,
      titulo: dialogo ? dialogo.querySelector('.ficha-titulo').textContent.trim() : '',
      botones: dialogo ? [...dialogo.querySelectorAll('.ficha-pie .btn')].map(b => b.textContent.trim()) : []
    };
  })()`);
  if (!logout.aparece) {
    errores.push('Cerrar sesión no muestra el diálogo de confirmación de la aplicación.');
  } else {
    if (logout.titulo !== '¿Cerrar sesión?') {
      errores.push(`El diálogo de cerrar sesión no tiene el título esperado: "${logout.titulo}"`);
    }
    // Cancelar no debe cerrar la sesión.
    await ventana.webContents.executeJavaScript(`(async () => {
      document.querySelector('#dialogoSistema [data-accion="cancelar"]').click();
      await new Promise(resolve => setTimeout(resolve, 500));
      return true;
    })()`);
    const trasCancelar = await ventana.webContents.executeJavaScript(`({
      dialogo: !!document.getElementById('dialogoSistema'),
      loginVisible: !document.getElementById('loginPantalla').hidden
    })`);
    if (trasCancelar.dialogo) errores.push('El diálogo de cerrar sesión no se cierra al cancelar.');
    if (trasCancelar.loginVisible) errores.push('Cancelar el diálogo de cerrar sesión cerró la sesión igual.');

    // Ahora sí, aceptando.
    await ventana.webContents.executeJavaScript(`(async () => {
      document.getElementById('btnCerrarSesion').click();
      await new Promise(resolve => setTimeout(resolve, 500));
      document.querySelector('#dialogoSistema [data-accion="ok"]').click();
      await new Promise(resolve => setTimeout(resolve, 900));
      return true;
    })()`);
  }

  const trasCerrar = await ventana.webContents.executeJavaScript(`({
    loginVisible: !document.getElementById('loginPantalla').hidden,
    instalacionVisible: !document.getElementById('instalacionPantalla').hidden,
    usuario: document.getElementById('sidebarUsuarioNombre').textContent.trim()
  })`);
  if (!trasCerrar.loginVisible) errores.push('El botón "Cerrar sesión" no regresa a la pantalla de acceso.');
  if (trasCerrar.instalacionVisible) errores.push('Tras cerrar sesión vuelve a pedir la instalación.');
  if (trasCerrar.usuario !== 'Sin sesión') {
    errores.push(`El sidebar sigue mostrando un usuario tras cerrar sesión: "${trasCerrar.usuario}"`);
  }

  // 4b) El botón del ojo del campo de acceso muestra la contraseña sin quitar el
  //     enmascarado inicial (y vuelve a ocultarla al segundo clic).
  const verClave = await ventana.webContents.executeJavaScript(`(async () => {
    const campo = document.getElementById('loginClave');
    // Cada campo con su propio botón: se toma el que corresponde a "loginClave".
    const boton = campo.parentElement.querySelector('.campo-ver');
    const antes = campo.type;
    if (!boton) return { antes, hayBoton: false };
    boton.click();
    const durante = campo.type;
    boton.click();
    return { antes, hayBoton: true, durante, despues: campo.type };
  })()`);
  if (!verClave.hayBoton) errores.push('El campo de contraseña no tiene el botón de mostrar.');
  if (verClave.antes !== 'password') errores.push('El campo de contraseña no se escribe encriptado.');
  if (verClave.durante !== 'text') errores.push('El botón del ojo no muestra la contraseña.');
  if (verClave.despues !== 'password') errores.push('El botón del ojo no vuelve a ocultar la contraseña.');

  // 5) Credenciales incorrectas: se avisa y no se entra.
  await ventana.webContents.executeJavaScript(`(() => {
    document.getElementById('loginUsuario').value = 'ana';
    document.getElementById('loginClave').value = 'clave-que-no-es';
    document.getElementById('loginBoton').click();
    return true;
  })()`);
  const loginFallido = await ventana.webContents.executeJavaScript(`(async () => {
    await new Promise(resolve => setTimeout(resolve, 900));
    return {
      loginVisible: !document.getElementById('loginPantalla').hidden,
      error: document.getElementById('loginError').textContent.trim()
    };
  })()`);
  if (!loginFallido.loginVisible || !loginFallido.error) {
    errores.push(`Una contraseña incorrecta no bloquea el acceso: ${JSON.stringify(loginFallido)}`);
  }

  // 6) Se entra con la cuenta creada y se recorren los módulos.
  await ventana.webContents.executeJavaScript(INICIAR_SESION);
  const trasEntrar = await ventana.webContents.executeJavaScript(ESTADO_SESION);
  if (trasEntrar.loginVisible) errores.push('No se pudo entrar con la cuenta creada en la instalación.');
  if (trasEntrar.modulo !== 'escritorio'
    || trasEntrar.marcaEscritorio !== (trasEntrar.preferenciaEscritorio||'Transporte Fierro')
    || !trasEntrar.cuadriculaEscritorio || trasEntrar.tamanoMarcaEscritorio < 48 || !trasEntrar.soloTextoEscritorio) {
    errores.push(`El login no abre el Escritorio con la marca de agua: ${JSON.stringify(trasEntrar)}`);
  }
  await esperar(400);

  const sidebarPlegado = await ventana.webContents.executeJavaScript(`(() => {
    const boton = document.getElementById('sidebarToggle');
    boton.click();
    return {
      plegado: document.querySelector('.app-shell').classList.contains('sidebar-collapsed'),
      expandido: boton.getAttribute('aria-expanded'),
      preferencia: localStorage.getItem('control-empresa-sidebar-colapsado')
    };
  })()`);
  if (!sidebarPlegado.plegado || sidebarPlegado.expandido !== 'false' || sidebarPlegado.preferencia !== 'true') {
    errores.push(`El menú lateral no se pliega o no guarda su preferencia: ${JSON.stringify(sidebarPlegado)}`);
  }
  const sidebarExpandido = await ventana.webContents.executeJavaScript(`(() => {
    const boton = document.getElementById('sidebarToggle');
    boton.click();
    return {
      plegado: document.querySelector('.app-shell').classList.contains('sidebar-collapsed'),
      expandido: boton.getAttribute('aria-expanded'),
      preferencia: localStorage.getItem('control-empresa-sidebar-colapsado')
    };
  })()`);
  if (sidebarExpandido.plegado || sidebarExpandido.expandido !== 'true' || sidebarExpandido.preferencia !== 'false') {
    errores.push(`El menú lateral no vuelve a expandirse correctamente: ${JSON.stringify(sidebarExpandido)}`);
  }

  let estiloTablaBitacora = null;
  const filasEnLinea = {
    flota: [
      ['tabVehiculos', 'btnAgregarFilaVehiculo', 'tablaVehiculos'],
      ['tabConductores', 'btnAgregarFilaConductor', 'tablaConductores'],
      ['tabCombustible', 'btnAgregarFilaCombustible', 'tablaCombustible']
    ],
    clientes: [[null, 'btnAgregarFilaCliente', 'tablaClientes']],
    planilla: [
      ['tabEmpleados', 'btnAgregarFilaEmpleado', 'tablaEmpleados'],
      ['tabViaticos', 'btnAgregarFilaViatico', 'tablaViaticos'],
      ['tabComisiones', 'btnAgregarFilaComision', 'tablaComisiones']
    ],
    ingresos: [[null, 'btnAgregarFilaMov', 'tablaFinanciera']],
    egresos: [[null, 'btnAgregarFilaMov', 'tablaFinanciera']]
  };
  for (const modulo of modulos) {
    const antes = errores.length;
    await ventana.webContents.executeJavaScript(`
      (async () => {
        document.querySelector('.menu-item[data-module="${modulo}"]').click();
        await new Promise(resolve => setTimeout(resolve, 650));
      })()
    `);
    const estado = await ventana.webContents.executeJavaScript(`({
      modulo: ${JSON.stringify(modulo)},
      titulo: document.getElementById('page-title').textContent,
      contenido: document.getElementById('content').innerText.trim(),
      cargando: /Cargando/.test(document.getElementById('content').innerText),
      error: /No se pudo cargar|Error al cargar/.test(document.getElementById('content').innerText)
    })`);
    const resumenModulo = await ventana.webContents.executeJavaScript(`(() => {
      actualizarTicker();
      const activos = [...document.querySelectorAll('#content .card,#content .dash-kpi,#content .op-item,#content .dash-hero-kpi')]
        .filter(el => !el.closest('[hidden],.tab-content:not(.active)'));
      const etiquetas = activos.map(el =>
        el.querySelector('.card-label,.dash-kpi-etiqueta,.op-etiqueta,.dash-hero-etiqueta')?.textContent.trim()
      ).filter(Boolean);
      const barra = document.getElementById('tickerTrack').innerText.toLowerCase();
      const resumenOculto = ['.cards','.metrics-grid','.dash-kpis','.dash-panel--op']
        .every(selector => [...document.querySelectorAll('#content ' + selector)]
          .every(el => getComputedStyle(el).display === 'none'));
      const utilidadVisible = [...document.querySelectorAll('#content .dash-hero-kpi')]
        .some(el => getComputedStyle(el).display !== 'none' && el.innerText.trim().length > 0);
      return {
        faltantes: etiquetas.filter(etiqueta => !barra.includes(etiqueta.toLowerCase())),
        resumenOculto,
        utilidadVisible
      };
    })()`);
    if (resumenModulo.faltantes.length) {
      errores.push(`La barra inferior no contiene indicadores de ${modulo}: ${resumenModulo.faltantes.join(', ')}`);
    }
    if (!resumenModulo.resumenOculto) errores.push(`El módulo ${modulo} todavía muestra tarjetas de indicadores.`);
    if (modulo === 'dashboard' && !resumenModulo.utilidadVisible) {
      errores.push('El dashboard no muestra la utilidad del período y su variación.');
    }
    const estilosTabla = await ventana.webContents.executeJavaScript(`(() => {
      const tablas = [...document.querySelectorAll('#content table:not(.ficha-datos):not(.importar-preview)')]
        .filter(t => t.tHead?.rows[0]?.cells[0] && t.tBodies[0]?.rows[0]?.cells[0]);
      const estilo = el => {
        const s = getComputedStyle(el);
        return { fuente:s.fontFamily, tamano:s.fontSize, altoLinea:s.lineHeight, relleno:s.padding };
      };
      return tablas.map(tabla => ({ cabecera:estilo(tabla.tHead.rows[0].cells[0]), celda:estilo(tabla.tBodies[0].rows[0].cells[0]) }));
    })()`);
    if (modulo === 'bitacora') estiloTablaBitacora = estilosTabla[0] || null;
    else if (estiloTablaBitacora) {
      for (const estiloTabla of estilosTabla) {
        if (JSON.stringify(estiloTabla) !== JSON.stringify(estiloTablaBitacora)) {
          errores.push(`Una tabla de ${modulo} no coincide con Bitácora: ${JSON.stringify(estiloTabla)}`);
        }
      }
      for (const [tab, boton, contenedor] of filasEnLinea[modulo] || []) {
        const resultado = await ventana.webContents.executeJavaScript(`
          (async () => {
            const esperar = () => new Promise(resolve => setTimeout(resolve, 400));
            const [tab, boton, contenedor, modulo] = ${JSON.stringify([tab, boton, contenedor, modulo])};
            if (tab) document.querySelector('.tab-btn[data-tab="' + tab + '"]').click();
            await esperar();
            const tabla = () => document.querySelector('#' + contenedor + ' table');
            const cabeceras = [...tabla().tHead.rows[0].cells].map(th => th.textContent.trim());
            const clave = 'control-empresa-columnas:' + JSON.stringify([modulo, contenedor, cabeceras]);
            const anterior = localStorage.getItem(clave);
            try {
              const control = tabla().tHead.rows[0].cells[1].querySelector('.ajustar-columna');
              for (let i = 0; i < 30; i++) control.dispatchEvent(new KeyboardEvent('keydown', { key:'ArrowLeft', bubbles:true }));
              document.getElementById(boton).click();
              await esperar();
              const fila = tabla().querySelector('.bitacora-inline-row');
              if (!fila) return { error:'No se abrió la fila de captura' };
              const botonDestino = fila.querySelector('[data-accion="elegir-destino"]');
              if (botonDestino) botonDestino.hidden = false;
              const elementos = [...fila.querySelectorAll('input,select,button')].filter(el => el.getClientRects().length);
              const centros = elementos.map(el => {
                const rect = el.getBoundingClientRect();
                return (rect.top + rect.bottom) / 2;
              });
              const cortados = elementos.filter(el => {
                const rect = el.getBoundingClientRect(), celda = el.closest('td').getBoundingClientRect();
                return rect.left < celda.left - 1 || rect.right > celda.right + 1;
              }).map(el => el.getAttribute('aria-label') || el.textContent.trim());
              const resultado = {
                altura:fila.getBoundingClientRect().height,
                alineados:Math.max(...centros) - Math.min(...centros) <= 2,
                cortados
              };
              fila.querySelector('[data-accion="cancelar"]').click();
              return resultado;
            } finally {
              if (anterior === null) localStorage.removeItem(clave);
              else localStorage.setItem(clave, anterior);
            }
          })()`);
        if (resultado.error || resultado.altura > 70 || !resultado.alineados || resultado.cortados.length) {
          errores.push(`La fila de ${contenedor} no es compacta o muestra controles recortados: ${JSON.stringify(resultado)}`);
        }
      }
    }
    // El módulo Bitácora debe poder abrir el modal "+ Registrar Viaje".
    // Se comprueba antes de contar los errores de consola para que una excepción
    // al construir el formulario también se reporte como fallo del módulo.
    if (modulo === 'bitacora') {
      const tablaCompacta = await ventana.webContents.executeJavaScript(`
        (async () => {
          const esperar = () => new Promise(resolve => setTimeout(resolve, 300));
          const tabla = () => document.querySelector('#contenedorTablaBitacora table');
          const cabeceras = [...tabla().tHead.rows[0].cells].map(th => th.textContent.trim());
          const clave = 'control-empresa-columnas:' + JSON.stringify(['bitacora', 'contenedorTablaBitacora', cabeceras]);
          const anterior = localStorage.getItem(clave);
          try {
            localStorage.removeItem(clave);
            document.getElementById('btnFiltrar').click();
            await esperar();
            const id = tabla().tHead.rows[0].cells[0].getBoundingClientRect().width;
            const control = tabla().querySelector('.ajustar-columna');
            const antes = control.parentElement.getBoundingClientRect().width;
            control.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
            const ajustado = control.parentElement.getBoundingClientRect().width;
            document.getElementById('btnFiltrar').click();
            await esperar();
            const restaurado = tabla().tHead.rows[0].cells[0].getBoundingClientRect().width;
            document.getElementById('btnAgregarFilaViaje').click();
            await esperar();
            const fila = tabla().querySelector('.bitacora-inline-row');
            const arriba = campo => fila.querySelector('[data-campo="' + campo + '"]').getBoundingClientRect().top;
            const botones = [...fila.querySelectorAll('.bitacora-inline-actions button')].map(b => b.getBoundingClientRect().top);
            const cortados = [...fila.querySelectorAll('input,select,button')].filter(el => el.getClientRects().length).filter(el => {
              const rect = el.getBoundingClientRect(), celda = el.closest('td').getBoundingClientRect();
              return rect.left < celda.left - 1 || rect.right > celda.right + 1;
            }).map(el => el.getAttribute('aria-label') || el.textContent.trim());
            const resultado = {
              id, antes, ajustado, restaurado, alto: fila.getBoundingClientRect().height,
              km: arriba('kmSalida') === arriba('kmLlegada'),
              notas: arriba('carga') === arriba('observaciones'),
              botones: botones[0] === botones[1], cortados
            };
            fila.querySelector('[data-accion="cancelar-fila"]').click();
            return resultado;
          } finally {
            if (anterior === null) localStorage.removeItem(clave);
            else localStorage.setItem(clave, anterior);
          }
        })()`);
      if (tablaCompacta.id > 80 || Math.abs(tablaCompacta.ajustado - tablaCompacta.antes - 10) > 2 ||
          Math.abs(tablaCompacta.restaurado - tablaCompacta.ajustado) > 2 || tablaCompacta.alto > 70 ||
          !tablaCompacta.km || !tablaCompacta.notas || !tablaCompacta.botones || tablaCompacta.cortados.length) {
        errores.push(`La tabla compacta o el ajuste de columnas de Bitácora fallaron: ${JSON.stringify(tablaCompacta)}`);
      }

      const modal = await ventana.webContents.executeJavaScript(`
        (async () => {
          document.getElementById('btnNuevoViaje').click();
          await new Promise(resolve => setTimeout(resolve, 350));
          const abierto = !!document.getElementById('formViaje');
          document.getElementById('btnCerrarModal')?.click();
          return abierto;
        })()`);
      if (!modal) {
        errores.push('El modal "+ Registrar Viaje" no se abrió correctamente.');
      }

      const documentos = await ventana.webContents.executeJavaScript(`
        (async () => {
          const viaje = await window.api.bitacora.guardar({
            fecha: new Date().toISOString().slice(0, 10),
            lugar_salida: 'Origen prueba documentos',
            destino: 'Destino prueba documentos',
            estado: 'COMPLETADO'
          });
          document.getElementById('btnFiltrar').click();
          await new Promise(resolve => setTimeout(resolve, 500));
          document.querySelector('.btnDocsViaje[data-id="' + viaje.id + '"]')?.click();
          await new Promise(resolve => setTimeout(resolve, 200));
          const modalAbierto = !!document.getElementById('btnGuardarDocsViaje');
          const espacios = document.querySelectorAll('#modalViajeContainer input[type="file"]').length;
          const descargasVaciasDeshabilitadas =
            document.getElementById('descargarTodosDocsViaje')?.disabled === true &&
            [...document.querySelectorAll('[id^="descargarDocumentoViaje"]')].every(boton => boton.disabled);
          if (!modalAbierto || espacios !== 3) return { modalAbierto, espacios, guardado: false, descargasVaciasDeshabilitadas };

          const canvas = document.createElement('canvas');
          canvas.width = 2;
          canvas.height = 2;
          const datos = atob(canvas.toDataURL('image/png').split(',')[1]);
          const bytes = Uint8Array.from(datos, caracter => caracter.charCodeAt(0));
          const archivo = new File([bytes], 'recibido.png', { type: 'image/png' });
          const transferencia = new DataTransfer();
          transferencia.items.add(archivo);
          const input = document.getElementById('archivoDocumentoViaje1');
          Object.defineProperty(input, 'files', { configurable: true, value: transferencia.files });
          input.dispatchEvent(new Event('change', { bubbles: true }));
          await new Promise(resolve => setTimeout(resolve, 500));
          const nombre = document.getElementById('nombreDocumentoViaje1');
          nombre.value = 'Recibido';
          nombre.dispatchEvent(new Event('input', { bubbles: true }));
          const descargaIndividualHabilitada = !document.getElementById('descargarDocumentoViaje1').disabled;
          const descargaMultipleHabilitada = !document.getElementById('descargarTodosDocsViaje').disabled;
          document.getElementById('btnGuardarDocsViaje').click();
          await new Promise(resolve => setTimeout(resolve, 700));
          const guardado = await window.api.bitacora.obtener(viaje.id);
          return {
            modalAbierto, espacios,
            descargasVaciasDeshabilitadas,
            descargaIndividualHabilitada,
            descargaMultipleHabilitada,
            guardado: guardado.documento_viaje_1_nombre === 'Recibido' &&
              /^data:image\\/(?:jpeg|png);base64,/.test(guardado.documento_viaje_1 || '') &&
              !guardado.documento_viaje_2 && !guardado.documento_viaje_3
          };
        })()`);
      if (!documentos.modalAbierto || documentos.espacios !== 3 || !documentos.guardado ||
          !documentos.descargasVaciasDeshabilitadas || !documentos.descargaIndividualHabilitada ||
          !documentos.descargaMultipleHabilitada) {
        errores.push(`La ficha de documentos de Bitácora no guardó hasta tres espacios correctamente: ${JSON.stringify(documentos)}`);
      }
    }

    // Planilla incluye la pestaña de Viáticos: se comprueba que el listado cargue,
    // que el modal "+ Registrar Viático" abra y que "Liquidar" muestre la ficha de
    // pago (ya no el confirm()/alert del navegador).
    if (modulo === 'planilla') {
      const fichaPlanilla = await ventana.webContents.executeJavaScript(`
        (async () => {
          const esperar = ms => new Promise(resolve => setTimeout(resolve, ms));
          const hoy = new Date();
          const fecha = [hoy.getFullYear(), String(hoy.getMonth() + 1).padStart(2, '0'), String(hoy.getDate()).padStart(2, '0')].join('-');
          const periodo = fecha.slice(0, 7);
          const sufijo = Date.now();
          const conductor = await window.api.conductores.guardar({ nombre: 'Conductor UI ' + sufijo });
          const empleado = await window.api.empleados.guardar({
            nombre: 'Empleado UI ' + sufijo, cargo: 'Prueba', salario_base: 1000,
            conductor_id: conductor.id, activo: 1
          });
          const comision = await window.api.comisiones.guardar({
            conductor_id: conductor.id, fecha, periodo, concepto: 'Comisión UI editable',
            tipo: 'PORCENTAJE', base_calculo: 1000, valor_calculo: 10
          });
          const viatico = await window.api.viaticos.guardar({
            conductor_id: conductor.id, fecha, destino: 'Destino UI', motivo: 'Edición',
            monto: 40, liquidado: 0
          });
          const planilla = await window.api.planilla.guardar({
            periodo, fecha_pago: fecha, observacion: 'Planilla UI ' + sufijo, estado: 'BORRADOR',
            detalle: [{ empleado_id: empleado.id, salario: 1000, horas_extra: 0, bonificaciones: 0, deducciones: 0 }]
          });
          document.querySelector('.tab-btn[data-tab="tabPlanillas"]').click();
          document.getElementById('plaBuscar').value = 'Planilla UI ' + sufijo;
          document.getElementById('btnFiltrarPla').click();
          await esperar(500);
          document.querySelector('#tablaPlanillas .btnEditarPla[data-id="' + planilla.id + '"]').click();
          await esperar(700);
          const ficha = document.querySelector('.planilla-ficha-modal');
          const tarjetaEmpleado = ficha && ficha.querySelector('tr[data-empleado="' + empleado.id + '"]');
          const entradaComision = tarjetaEmpleado && tarjetaEmpleado.querySelector('input[data-movimiento="' + comision.id + '"]');
          const botonViaticos = tarjetaEmpleado && tarjetaEmpleado.querySelector('.btnVerViaticosPla');
          if (botonViaticos) { botonViaticos.click(); await esperar(200); }
          const entradaViatico = document.querySelector('.planilla-viatico-monto[data-viatico="' + viatico.id + '"]');
          const ancho = ficha ? ficha.getBoundingClientRect().width : 0;
          if (ficha) {
            ficha.style.maxHeight = '240px';
            ficha.scrollTop = 180;
          }
          await esperar(100);
          const encabezado = ficha && ficha.querySelector('.modal-header');
          const encabezadoFijo = !!(ficha && encabezado && Math.abs(encabezado.getBoundingClientRect().top - ficha.getBoundingClientRect().top) < 5);
          if (entradaComision && entradaViatico) {
            entradaComision.value = '125';
            entradaComision.dispatchEvent(new Event('input', { bubbles: true }));
            entradaViatico.value = '55';
            entradaViatico.dispatchEvent(new Event('input', { bubbles: true }));
            document.getElementById('formPlanilla').requestSubmit();
            await esperar(700);
          }
          const comisionGuardada = (await window.api.comisiones.listar({ periodo })).find(c => c.id === comision.id);
          const viaticoGuardado = (await window.api.viaticos.listar({ desde: fecha, hasta: fecha })).find(v => v.id === viatico.id);
          const detalle = await window.api.planilla.obtener(planilla.id);
          const filaPlanilla = detalle.detalle.find(f => String(f.empleado_id) === String(empleado.id));
          const correcto = !!entradaComision && !!entradaViatico && ancho >= 800 && ancho <= 1000
            && !!tarjetaEmpleado && encabezadoFijo
            && comisionGuardada.monto === 125 && comisionGuardada.valor_calculo === 12.5
            && viaticoGuardado.monto === 55 && !!filaPlanilla && filaPlanilla.comisiones === 125
            && filaPlanilla.viaticos === 55 && filaPlanilla.neto === 1125;
          await window.api.planilla.eliminar(planilla.id);
          await window.api.comisiones.eliminar(comision.id);
          await window.api.viaticos.eliminar(viatico.id);
          await window.api.empleados.eliminar(empleado.id);
          await window.api.conductores.eliminar(conductor.id);
          return {
            correcto, ancho, empleadoVisible: !!tarjetaEmpleado, encabezadoFijo, camposEditables: !!entradaComision && !!entradaViatico,
            montoComision: comisionGuardada && comisionGuardada.monto,
            calculoComision: comisionGuardada && comisionGuardada.valor_calculo,
            montoViatico: viaticoGuardado && viaticoGuardado.monto,
            totalPlanilla: detalle && detalle.total_a_pagar,
            filaPlanilla: filaPlanilla && { empleado_id: filaPlanilla.empleado_id, comisiones: filaPlanilla.comisiones, viaticos: filaPlanilla.viaticos, neto: filaPlanilla.neto },
            valoresFormulario: [entradaComision && entradaComision.value, entradaViatico && entradaViatico.value]
          };
        })()`);
      if (!fichaPlanilla.correcto) {
        errores.push(`La ficha de planilla no permitió editar movimientos originales ni mantuvo su encabezado: ${JSON.stringify(fichaPlanilla)}`);
      }

      const viaticos = await ventana.webContents.executeJavaScript(`
        (async () => {
          document.querySelector('.tab-btn[data-tab="tabViaticos"]').click();
          await new Promise(resolve => setTimeout(resolve, 400));
          const listado = document.getElementById('tablaViaticos').innerText;
          document.getElementById('btnNuevoViatico').click();
          await new Promise(resolve => setTimeout(resolve, 350));
          const formulario = !!document.getElementById('formViatico');
          document.getElementById('btnCerrarModalVia')?.click();
          await new Promise(resolve => setTimeout(resolve, 200));
          document.querySelector('.btnLiquidarVia')?.click();
          await new Promise(resolve => setTimeout(resolve, 600));
          const fichaPago = !!document.getElementById('btnConfirmarPagoVia');
          document.getElementById('btnCerrarPagoVia2')?.click();
          return { cargando: /Cargando/.test(listado), vacio: !listado.trim(), formulario, fichaPago };
        })()`);
      if (viaticos.cargando || viaticos.vacio) errores.push('La pestaña Viáticos de Planilla no cargó su listado.');
      if (!viaticos.formulario) errores.push('El modal "+ Registrar Viático" no se abrió correctamente.');
      if (!viaticos.fichaPago) errores.push('La ficha de pago no se abrió al pulsar "Liquidar" en un viático.');

      // La pestaña Comisiones debe listar, abrir el formulario, el generador del
      // período y la ficha de pago (mismo patrón que los viáticos).
      const comisiones = await ventana.webContents.executeJavaScript(`
        (async () => {
          document.querySelector('.tab-btn[data-tab="tabComisiones"]').click();
          await new Promise(resolve => setTimeout(resolve, 450));
          const listado = document.getElementById('tablaComisiones').innerText;
          const resumenConductor = document.getElementById('resumenComisionesConductor').innerText;
          document.getElementById('btnNuevaComision').click();
          await new Promise(resolve => setTimeout(resolve, 350));
          const formulario = !!document.getElementById('formComision');
          document.getElementById('btnCerrarModalCom')?.click();
          await new Promise(resolve => setTimeout(resolve, 200));
          document.getElementById('btnGenerarComisiones').click();
          await new Promise(resolve => setTimeout(resolve, 350));
          const generador = !!document.getElementById('formGenerarComisiones');
          document.getElementById('btnCerrarGenerarCom')?.click();
          await new Promise(resolve => setTimeout(resolve, 200));
          document.querySelector('.btnPagarCom')?.click();
          await new Promise(resolve => setTimeout(resolve, 600));
          const fichaPago = !!document.getElementById('btnConfirmarPagoCom');
          document.getElementById('btnCerrarPagoCom2')?.click();
          return {
            cargando: /Cargando/.test(listado),
            vacio: !listado.trim(),
            sinResumen: /Cargando/.test(resumenConductor) || !resumenConductor.trim(),
            formulario, generador, fichaPago
          };
        })()`);
      if (comisiones.cargando || comisiones.vacio) errores.push('La pestaña Comisiones de Planilla no cargó su listado.');
      if (comisiones.sinResumen) errores.push('El resumen por conductor de las comisiones no cargó.');
      if (!comisiones.formulario) errores.push('El modal "+ Registrar Comisión" no se abrió correctamente.');
      if (!comisiones.generador) errores.push('El modal "Generar del período" de comisiones no se abrió.');
      if (!comisiones.fichaPago) errores.push('La ficha de pago no se abrió al pulsar "Pagar" en una comisión.');

      // Segunda parte de la prueba de comisiones: las dos rutas de pago deben
      // REFLEJARSE EN LA BASE, no solo abrir la ficha (el bloque de arriba abre
      // la ficha individual y la cancela, por eso aquí sí se confirma):
      //   1) "Pagar" en la tabla            -> canal comisiones:pagar
      //   2) "Pagar pendientes" del resumen -> canal comisiones:pagar_conductor
      // Se crean dos comisiones propias y se filtra por su concepto, para que la
      // prueba no dependa del estado en que quedaron los datos de ejemplo.
      const pagos = await ventana.webContents.executeJavaScript(`
        (async () => {
          const esperar = ms => new Promise(resolve => setTimeout(resolve, ms));
          const hoy = new Date().toISOString().slice(0, 10);
          const concepto = 'Comision de prueba UI';
          const crear = async monto => (await window.api.comisiones.guardar({
            fecha: hoy, periodo: hoy.slice(0, 7), conductor_id: 1, tipo: 'FIJO',
            concepto, base_calculo: 0, valor_calculo: monto
          })).id;
          const idA = await crear(425);
          const idB = await crear(512);
          const pendientesDePrueba = async () => (await window.api.comisiones.listar({ busqueda: concepto }))
            .filter(c => c.estado !== 'PAGADA').map(c => c.id);

          document.getElementById('comBuscar').value = concepto;
          document.getElementById('btnFiltrarCom').click();
          await esperar(700);
          const botonesAntes = document.querySelectorAll('#resumenComisionesConductor .btnPagarConductor').length;
          const pendienteAntes = document.getElementById('comPendiente').textContent;

          const botonTabla = document.querySelector('#tablaComisiones .btnPagarCom');
          const idPagadoIndividual = botonTabla ? Number(botonTabla.dataset.id) : null;
          botonTabla?.click();
          await esperar(700);
          const contenedor = document.getElementById('modalFichaComisionContainer');
          const fichaIndividual = !!document.getElementById('btnConfirmarPagoCom');
          document.getElementById('btnConfirmarPagoCom')?.click();
          await esperar(1000);
          const comprobanteIndividual = contenedor ? contenedor.innerText : '';
          document.getElementById('btnCerrarPagoCom2')?.click();
          await esperar(900);
          const quedanTrasIndividual = await pendientesDePrueba();

          document.querySelector('#resumenComisionesConductor .btnPagarConductor')?.click();
          await esperar(700);
          const fichaConductor = !!document.getElementById('btnConfirmarPagoCom');
          const detalle = contenedor ? contenedor.innerText : '';
          document.getElementById('btnConfirmarPagoCom')?.click();
          await esperar(1200);
          const comprobanteConductor = contenedor ? contenedor.innerText : '';
          document.getElementById('btnCerrarPagoCom2')?.click();
          await esperar(900);
          const quedanAlFinal = await pendientesDePrueba();

          return {
            idA, idB, idPagadoIndividual, botonesAntes, fichaIndividual, fichaConductor, detalle,
            comprobanteIndividual: comprobanteIndividual.includes('pagada'),
            comprobanteConductor: comprobanteConductor.includes('pagadas'),
            quedanTrasIndividual, quedanAlFinal, pendienteAntes,
            pendienteDespues: document.getElementById('comPendiente').textContent,
            botonesAlFinal: document.querySelectorAll('#resumenComisionesConductor .btnPagarConductor').length
          };
        })()`);
      if (pagos.botonesAntes === 0) errores.push('El resumen por conductor no ofreció "Pagar pendientes" habiendo comisiones pendientes.');
      if (!pagos.fichaIndividual) errores.push('La ficha de pago individual no se abrió al pulsar "Pagar" en la tabla.');
      if (!pagos.comprobanteIndividual) errores.push('La ficha individual no quedó como comprobante tras confirmar el pago.');
      if (pagos.idPagadoIndividual === null || pagos.quedanTrasIndividual.includes(pagos.idPagadoIndividual)) {
        errores.push(`El pago individual se mostró como pagado pero la comisión #${pagos.idPagadoIndividual} sigue pendiente en la base (comisiones:pagar).`);
      }
      if (!pagos.fichaConductor) errores.push('La ficha de liquidación no se abrió al pulsar "Pagar pendientes" en el resumen por conductor.');
      if (!pagos.detalle.includes('Comision de prueba UI')) errores.push('La ficha de liquidación no listó las comisiones pendientes del conductor.');
      if (!pagos.comprobanteConductor) errores.push('La ficha de liquidación no quedó como comprobante tras confirmar el pago.');
      if (pagos.quedanAlFinal.length) errores.push(`La liquidación dejó ${pagos.quedanAlFinal.length} comisión(es) pendiente(s) en la base (ids ${pagos.quedanAlFinal.join(', ')}).`);
      if (pagos.botonesAlFinal !== 0) errores.push(`Tras liquidar, el resumen sigue mostrando ${pagos.botonesAlFinal} conductor(es) con pendientes.`);
      if (pagos.pendienteAntes === pagos.pendienteDespues) errores.push('El indicador "Pendiente de pagar" no se actualizó tras los pagos.');
      if (!(pagos.pendienteDespues.includes('0.00') || pagos.pendienteDespues.includes('0,00'))) errores.push(`Quedó saldo pendiente tras pagar todo: ${pagos.pendienteDespues}`);
    }

    if (modulo === 'configuracion') {
      const empresaConfiguracion = await ventana.webContents.executeJavaScript(`(async () => {
        const esperar = () => new Promise(resolve => setTimeout(resolve, 300));
        const original = await window.api.configuracion.obtener();
        try {
          const nombre = document.getElementById('empresa');
          const simbolo = document.getElementById('simbolo');
          const bannerAntes = document.getElementById('cfgEmpresaActiva').textContent;
          nombre.value = 'Empresa UI';
          nombre.dispatchEvent(new Event('input', { bubbles:true }));
          simbolo.value = 'US$';
          simbolo.dispatchEvent(new Event('input', { bubbles:true }));
          const previa = document.getElementById('cfgPrevMonto').textContent;
          const logo = document.getElementById('logoPreview').getBoundingClientRect().width;
          document.getElementById('guardar').click();
          await esperar();
          const guardado = await window.api.configuracion.obtener();
          const bannerGuardado = document.getElementById('cfgEmpresaActiva').textContent;
          document.querySelector('#dialogoSistema [data-accion="ok"]')?.click();
          const navegacion = ['tabCfgApariencia','tabCfgBaseDatos','tabCfgAcerca','tabCfgEmpresa'].every(id => {
            const boton = document.querySelector('.cfg-nav [data-tab="' + id + '"]');
            boton.click();
            return boton.getAttribute('aria-pressed') === 'true' &&
              document.getElementById(id).classList.contains('active') &&
              document.querySelectorAll('.cfg-nav [aria-pressed="true"]').length === 1;
          });
          return { bannerAntes, previa, logo, nombre:guardado.nombre_empresa, simbolo:guardado.simbolo, bannerGuardado, navegacion };
        } finally {
          await window.api.configuracion.guardar(original);
        }
      })()`);
      if (!empresaConfiguracion.bannerAntes || empresaConfiguracion.previa !== 'US$ 12,345.67' ||
          empresaConfiguracion.logo !== 82 || empresaConfiguracion.nombre !== 'Empresa UI' ||
          empresaConfiguracion.simbolo !== 'US$' || empresaConfiguracion.bannerGuardado !== 'Empresa UI' ||
          !empresaConfiguracion.navegacion) {
        errores.push(`La configuración de empresa no funciona correctamente: ${JSON.stringify(empresaConfiguracion)}`);
      }

      const textoEscritorio = await ventana.webContents.executeJavaScript(`(async () => {
        document.querySelector('.cfg-nav .tab-btn[data-tab="tabCfgApariencia"]').click();
        const campo = document.getElementById('cfgTextoEscritorio');
        const valorInicial = campo.value;
        const valorOriginal = localStorage.getItem('control-empresa-texto-escritorio');
        campo.value = 'Patio Norte';
        campo.dispatchEvent(new Event('input', { bubbles: true }));
        document.getElementById('guardarTextoEscritorio').click();
        await new Promise(resolve => setTimeout(resolve, 150));
        const guardado = localStorage.getItem('control-empresa-texto-escritorio');
        const vistaPrevia = document.getElementById('cfgVistaTextoEscritorio').textContent.trim();
        document.querySelector('#dialogoSistema [data-accion="ok"]')?.click();
        await new Promise(resolve => setTimeout(resolve, 100));
        const escritorioPersonalizado = (() => {
          document.querySelector('.menu-item[data-module="escritorio"]').click();
          return new Promise(resolve => setTimeout(() => resolve(
            document.querySelector('#textoMarcaEscritorio')?.textContent.trim()
          ), 150));
        })();
        const textoPersonalizado = await escritorioPersonalizado;
        if (valorOriginal === null) localStorage.removeItem('control-empresa-texto-escritorio');
        else localStorage.setItem('control-empresa-texto-escritorio', valorOriginal);
        document.querySelector('.menu-item[data-module="escritorio"]').click();
        await new Promise(resolve => setTimeout(resolve, 150));
        return {
          valorInicial,
          valorOriginal,
          guardado,
          vistaPrevia,
          textoPersonalizado,
          escritorio: document.querySelector('#textoMarcaEscritorio')?.textContent.trim()
        };
      })()`);
      if (textoEscritorio.valorInicial !== (textoEscritorio.valorOriginal||'Transporte Fierro')
        || textoEscritorio.guardado !== 'Patio Norte'
        || textoEscritorio.vistaPrevia !== 'Patio Norte'
        || textoEscritorio.textoPersonalizado !== 'Patio Norte'
        || textoEscritorio.escritorio !== (textoEscritorio.valorOriginal||'Transporte Fierro')) {
        errores.push(`El texto personalizado del Escritorio no se guardó ni aplicó: ${JSON.stringify(textoEscritorio)}`);
      }
    }

    const nuevosErrores = errores.length - antes;
    const contenidoValido = modulo === 'escritorio'
      ? estado.contenido.length > 0
      : estado.contenido.length > 20;
    const ok = contenidoValido && !estado.cargando && !estado.error && nuevosErrores === 0;
    console.log(`  ${ok ? '[OK]   ' : '[FALLO]'} ${modulo.padEnd(13)} ${estado.titulo}`);
    if (!ok) {
      console.log(`         ${JSON.stringify(estado)}`);
      if (nuevosErrores) console.log(`         ${errores.slice(antes).join('\n         ')}`);
    }
  }

  await ventana.webContents.executeJavaScript(`
    (async () => {
      document.querySelector('.menu-item[data-module="dashboard"]').click();
      await new Promise(resolve => setTimeout(resolve, 500));
    })()
  `);
  const estadoCaptura = await ventana.webContents.executeJavaScript(`({
    titulo: document.getElementById('page-title').textContent,
    menuActivo: document.querySelector('.menu-item.active')?.dataset.module
  })`);
  if (estadoCaptura.titulo !== 'Dashboard' || estadoCaptura.menuActivo !== 'dashboard') {
    errores.push(`No se restauró Dashboard antes de la captura: ${JSON.stringify(estadoCaptura)}`);
  }
  const resumenBarra = await ventana.webContents.executeJavaScript(`(() => {
    actualizarTicker();
    return {
      texto: document.getElementById('tickerTrack').innerText,
      tarjetasVisibles: [...document.querySelectorAll('#content .dash-kpis, #content .dash-panel--op')]
        .some(el => getComputedStyle(el).display !== 'none')
    };
  })()`);
  const resumenBarraTexto = resumenBarra.texto.toLowerCase();
  if (!['ingresos', 'egresos', 'costos operativos', 'viajes del período']
    .every(etiqueta => resumenBarraTexto.includes(etiqueta))) {
    errores.push(`La barra inferior no contiene todos los indicadores del Dashboard: ${resumenBarra.texto}`);
  }
  if (resumenBarra.tarjetasVisibles) errores.push('El Dashboard todavía muestra tarjetas de indicadores.');
  await esperar(350);
  const imagen = await ventana.webContents.capturePage();
  fs.writeFileSync(captura, imagen.toPNG());
  console.log(`\nCaptura: ${captura}`);

  if (errores.length) {
    console.error('\nErrores detectados:');
    errores.forEach(error => console.error(`  - ${error}`));
  }
  console.log(`\nResultado: ${errores.length === 0 ? 'interfaz cargada sin errores' : `${errores.length} errores`}.`);
  return errores.length === 0;
}

app.whenReady().then(async () => {
  let ok = false;
  try {
    ok = await ejecutar();
  } catch (error) {
    console.error('Error inesperado durante la prueba de interfaz:', error);
  } finally {
    if (ventana && !ventana.isDestroyed()) ventana.destroy();
    cerrarBaseDatos();
    for (const sufijo of ['', '-wal', '-shm']) {
      const archivo = baseTemporal + sufijo;
      if (fs.existsSync(archivo)) fs.unlinkSync(archivo);
    }
    app.exit(ok ? 0 : 1);
  }
});

app.on('window-all-closed', () => {});