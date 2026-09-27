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
  'dashboard', 'bitacora', 'flota', 'clientes', 'planilla',
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
    empresa: document.getElementById('empresaDestacada').textContent.trim()
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
  await esperar(400);

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
    // El módulo Bitácora debe poder abrir el modal "+ Registrar Viaje".
    // Se comprueba antes de contar los errores de consola para que una excepción
    // al construir el formulario también se reporte como fallo del módulo.
    if (modulo === 'bitacora') {
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
    }

    // Planilla incluye la pestaña de Viáticos: se comprueba que el listado cargue,
    // que el modal "+ Registrar Viático" abra y que "Liquidar" muestre la ficha de
    // pago (ya no el confirm()/alert del navegador).
    if (modulo === 'planilla') {
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

    const nuevosErrores = errores.length - antes;
    const ok = estado.contenido.length > 20 && !estado.cargando && !estado.error && nuevosErrores === 0;
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