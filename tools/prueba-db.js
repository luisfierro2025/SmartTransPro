// Prueba de humo de la base de datos: crea una base temporal, ejecuta las
// operaciones reales (empleados, planilla, ingresos, egresos, viáticos,
// respaldo, limpieza y datos de ejemplo) y verifica los resultados.
// Se ejecuta con: npm run test:db
const path = require('path');
const fs = require('fs');
const os = require('os');

const raiz = path.join(__dirname, '..');
const archivo = path.join(os.tmpdir(), `control-empresa-prueba-${Date.now()}.db`);
process.env.CONTROL_EMPRESA_DB = archivo;

const baseDatos = require(path.join(raiz, 'src', 'main', 'database'));
const { operaciones } = require(path.join(raiz, 'src', 'main', 'operaciones'));
const Database = require('better-sqlite3');

let correctas = 0;
let fallidas = 0;

function verificar(descripcion, condicion, detalle) {
  if (condicion) {
    correctas++;
    console.log(`  [OK]    ${descripcion}`);
  } else {
    fallidas++;
    console.log(`  [FALLO] ${descripcion}${detalle !== undefined ? ' -> ' + JSON.stringify(detalle) : ''}`);
  }
}

function filas(tabla) {
  return baseDatos.obtenerDB().prepare(`SELECT COUNT(*) total FROM ${tabla}`).get().total;
}

async function ejecutar() {
  console.log('\n=== Prueba de la base de datos ===');
  console.log(`Archivo temporal: ${archivo}\n`);

  console.log('1) Creación del esquema');
  baseDatos.inicializarBaseDatos();
  const info = await operaciones['sistema:info'](null, {});
  verificar('La base de datos se crea en la ruta configurada', info.archivo === path.resolve(archivo), info.archivo);
  verificar('Se crean todas las tablas del sistema', info.totales.length >= 13, info.totales.map(t => t.tabla));
  verificar('No se insertan datos de prueba automáticamente',
    ['vehiculos', 'conductores', 'clientes', 'empleados', 'ingresos', 'egresos', 'viaticos', 'combustible', 'bitacora_viajes', 'planillas', 'comisiones']
      .every(t => filas(t) === 0));
  verificar('La configuración base existe', !!info.empresa, info.empresa);

  console.log('\n2) Empleados');
  const emp1 = await operaciones['empleados:guardar'](null, { nombre: 'Ana Prueba', cedula: '001-000000-0001A', cargo: 'Conductora', salario_base: 15000 });
  await operaciones['empleados:guardar'](null, { nombre: 'Luis Prueba', cargo: 'Bodeguero', salario_base: 12000, activo: 0 });
  verificar('Se guarda un empleado y devuelve su identificador', !!emp1.id, emp1);
  verificar('Se listan los empleados guardados', (await operaciones['empleados:listar'](null, {})).length === 2);
  const resumenEmp = await operaciones['empleados:resumen'](null, {});
  verificar('El resumen cuenta activos e inactivos', resumenEmp.activos === 1 && resumenEmp.inactivos === 1, resumenEmp);
  verificar('La nómina base sólo considera empleados activos', resumenEmp.nominaMensual === 15000, resumenEmp);

  console.log('\n3) Planilla');
  const generada = await operaciones['planilla:generar'](null, { periodo: '2026-09', fecha_pago: '2026-09-30' });
  verificar('Se genera la planilla con los empleados activos', generada.empleados === 1, generada);
  const planilla = await operaciones['planilla:obtener'](null, generada.id);
  verificar('La planilla tiene detalle', planilla.detalle.length === 1, planilla.detalle);
  verificar('El neto se calcula desde el salario base', planilla.total_neto === 15000, planilla.total_neto);
  const guardada = await operaciones['planilla:guardar'](null, {
    id: generada.id, periodo: '2026-09', fecha_pago: '2026-09-30', observacion: 'Ajuste de prueba', estado: 'PAGADA',
    detalle: [{ empleado_id: emp1.id, salario: 15000, horas_extra: 500, bonificaciones: 1000, deducciones: 800 }]
  });
  const planillaAjustada = await operaciones['planilla:obtener'](null, guardada.id);
  verificar('Se recalculan los totales al ajustar el detalle',
    planillaAjustada.total_bruto === 16500 && planillaAjustada.total_deducciones === 800 && planillaAjustada.total_neto === 15700,
    planillaAjustada);
  verificar('Se marca la planilla como pagada', planillaAjustada.estado === 'PAGADA', planillaAjustada.estado);

  console.log('\n4) Ingresos y egresos');
  await operaciones['ingresos:guardar'](null, { fecha: '2026-09-10', concepto: 'Flete de prueba', categoria: 'Fletes', monto: 5000, metodo: 'Efectivo', referencia: 'F-1' });
  await operaciones['ingresos:guardar'](null, { fecha: '2026-09-20', concepto: 'Servicio de prueba', categoria: 'Servicios', monto: 2500, metodo: 'Transferencia' });
  const resIngresos = await operaciones['ingresos:resumen'](null, { desde: '2026-09-01', hasta: '2026-09-30' });
  verificar('El resumen de ingresos suma los montos', resIngresos.total === 7500 && resIngresos.cantidad === 2, resIngresos);
  verificar('El resumen agrupa por categoría', resIngresos.porCategoria.length === 2, resIngresos.porCategoria);
  verificar('Las categorías registradas se pueden consultar',
    (await operaciones['finanzas:categorias'](null, { tipo: 'ingresos' })).includes('Fletes'));

  const egr = await operaciones['egresos:guardar'](null, { fecha: '2026-09-15', concepto: 'Compra de prueba', categoria: 'Repuestos', beneficiario: 'Proveedor X', monto: 1800, metodo: 'Efectivo' });
  const resEgresos = await operaciones['egresos:resumen'](null, {});
  verificar('El resumen de egresos funciona', resEgresos.total === 1800 && resEgresos.cantidad === 1, resEgresos);
  await operaciones['egresos:eliminar'](null, egr.id);
  verificar('Se eliminan egresos', filas('egresos') === 0);

  console.log('\n5) Viáticos');
  await operaciones['viaticos:guardar'](null, { empleado_id: emp1.id, fecha: '2026-09-12', destino: 'León', motivo: 'Entrega', monto: 1000, liquidado: 0 });
  const via2 = await operaciones['viaticos:guardar'](null, { empleado_id: emp1.id, fecha: '2026-09-18', destino: 'Masaya', motivo: 'Cobro', monto: 500, liquidado: 0 });
  verificar('Los viáticos se guardan como pendientes', (await operaciones['viaticos:resumen'](null, {})).pendiente === 1500);
  await operaciones['viaticos:liquidar'](null, via2.id);
  const resViaticos = await operaciones['viaticos:resumen'](null, {});
  verificar('La liquidación mueve el monto a liquidado', resViaticos.liquidado === 500 && resViaticos.pendiente === 1000, resViaticos);
  verificar('Los viáticos se pueden consultar por destino', (await operaciones['viaticos:listar'](null, { busqueda: 'León' })).length === 1);

  console.log('\n6) Comisiones');
  // Las comisiones se pagan a un conductor por sus viajes: se crean el conductor
  // y el viaje que la comisión referencia (catálogos que maneja Bitácora/Flota).
  const dbCom = baseDatos.obtenerDB();
  const conductorPrueba = dbCom.prepare("INSERT INTO conductores (nombre, documento) VALUES ('Conductor Prueba', '001-000000-0002B')").run().lastInsertRowid;
  const vehiculoPrueba = dbCom.prepare("INSERT INTO vehiculos (codigo, placa) VALUES ('V-99', 'M 999-999')").run().lastInsertRowid;
  const viajePrueba = dbCom.prepare('INSERT INTO bitacora_viajes (fecha, vehiculo_id, conductor_id, origen, destino, km_salida, km_llegada, estado) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .run('2026-09-10', vehiculoPrueba, conductorPrueba, 'Managua', 'León', 100, 250, 'COMPLETADO').lastInsertRowid;

  const generadas = await operaciones['comisiones:generar'](null, { periodo: '2026-09', tipo: 'POR_KM', valor_calculo: 4 });
  verificar('Se genera la comisión por kilómetro desde los viajes de Bitácora',
    generadas.creadas === 1 && generadas.viajes === 1, generadas);
  const comisionKm = (await operaciones['comisiones:listar'](null, { periodo: '2026-09' }))[0];
  verificar('La comisión por kilómetro usa los kilómetros recorridos',
    comisionKm.base_calculo === 150 && comisionKm.monto === 600, comisionKm);
  const repetida = await operaciones['comisiones:generar'](null, { periodo: '2026-09', tipo: 'POR_KM', valor_calculo: 4 });
  verificar('El generador no duplica la comisión del mismo período',
    repetida.creadas === 0 && repetida.omitidas === 1, repetida);

  const comisionPorcentaje = await operaciones['comisiones:guardar'](null, {
    conductor_id: conductorPrueba, viaje_id: viajePrueba, fecha: '2026-09-12', periodo: '2026-09',
    concepto: 'Comisión 5% del flete', tipo: 'PORCENTAJE', base_calculo: 18000, valor_calculo: 5
  });
  const listadoCom = await operaciones['comisiones:listar'](null, { busqueda: 'León' });
  verificar('El monto de la comisión por porcentaje se calcula desde la base',
    listadoCom.length === 1 && listadoCom[0].monto === 900, listadoCom);
  verificar('La comisión trae el conductor y el viaje de Bitácora vinculados',
    listadoCom[0].conductor_nombre === 'Conductor Prueba' && listadoCom[0].viaje_destino === 'León', listadoCom[0]);
  const resumenCom = await operaciones['comisiones:resumen'](null, {});
  verificar('El resumen de comisiones separa pendiente y pagado',
    resumenCom.total === 1500 && resumenCom.pendiente === 1500 && resumenCom.pagado === 0 && resumenCom.cantidadPendiente === 2, resumenCom);

  await operaciones['comisiones:pagar'](null, comisionPorcentaje.id);
  const resumenCom2 = await operaciones['comisiones:resumen'](null, {});
  verificar('El pago mueve el monto a pagado', resumenCom2.pagado === 900 && resumenCom2.pendiente === 600, resumenCom2);
  const liquidadas = await operaciones['comisiones:pagar_conductor'](null, { conductor_id: conductorPrueba, periodo: '2026-09' });
  verificar('La liquidación por conductor paga sus comisiones pendientes',
    liquidadas.pagadas === 1 && liquidadas.total === 600, liquidadas);

  const editada = await operaciones['comisiones:guardar'](null, {
    id: comisionPorcentaje.id, conductor_id: conductorPrueba, fecha: '2026-09-12', periodo: '2026-09',
    concepto: 'Bono fijo de prueba', tipo: 'FIJO', valor_calculo: 750, estado: 'PAGADA'
  });
  const comisionFija = (await operaciones['comisiones:listar'](null, { busqueda: 'Bono fijo' }))[0];
  verificar('Al editar se recalcula el monto según el tipo de comisión',
    editada.id === comisionPorcentaje.id && comisionFija.monto === 750, comisionFija);
  await operaciones['comisiones:eliminar'](null, comisionPorcentaje.id);
  verificar('Se eliminan comisiones', (await operaciones['comisiones:listar'](null, {})).length === 1);

  console.log('\n7) Usuarios, autenticación y sesiones');
  const dbUsuarios = baseDatos.obtenerDB();
  const leerEmpresa = () => dbUsuarios.prepare('SELECT nombre_empresa FROM configuracion WHERE id = 1').get().nombre_empresa;
  // La base nace VACÍA a propósito: el sistema no trae credenciales de fábrica.
  verificar('La base de datos nueva no trae ninguna cuenta', filas('usuarios') === 0, filas('usuarios'));
  const estadoInicial = await operaciones['usuarios:estado_instalacion'](null, {});
  verificar('El sistema informa que falta la instalación', estadoInicial.instalado === false, estadoInicial);

  const instalacion = await operaciones['usuarios:instalar'](null, {
    nombre_empresa: 'Transportes Prueba', nombre: 'Ana Prueba', usuario: 'ana', clave: 'miclave123'
  });
  verificar('La instalación crea la cuenta con la clave elegida',
    !!instalacion.token && instalacion.usuario.rol === 'ADMIN', instalacion.usuario);
  verificar('La instalación no marca cambiar una contraseña de fábrica',
    instalacion.usuario.debe_cambiar_clave === false, instalacion.usuario.debe_cambiar_clave);
  verificar('La instalación guarda la empresa y abre sesión',
    leerEmpresa() === 'Transportes Prueba', leerEmpresa());
  verificar('La respuesta de instalación no filtra el hash',
    !('clave_hash' in instalacion.usuario) && !('clave_salt' in instalacion.usuario), Object.keys(instalacion.usuario));
  const adminGuardado = dbUsuarios.prepare('SELECT * FROM usuarios').get();
  verificar('La contraseña nunca se guarda en claro',
    !!adminGuardado.clave_hash && adminGuardado.clave_hash !== 'miclave123' && !!adminGuardado.clave_salt,
    { hash: adminGuardado.clave_hash, sal: adminGuardado.clave_salt });
  verificar('La base guarda el SHA-256 del token, no el token',
    dbUsuarios.prepare('SELECT token_hash FROM sesiones WHERE usuario_id = ?').get(adminGuardado.id).token_hash !== instalacion.token);

  // La instalación solo sirve una vez: con una cuenta creada ya no se puede usar
  // para meter más usuarios sin autenticarse.
  let instalarRepetido = null;
  try { await operaciones['usuarios:instalar'](null, { usuario: 'otro', nombre: 'Otro', clave: 'clave123' }); } catch (e) { instalarRepetido = e.message; }
  verificar('Instalar de nuevo se rechaza con un mensaje claro', !!instalarRepetido, instalarRepetido);

  const token = instalacion.token;
  const ingreso = await operaciones['usuarios:autenticar'](null, { usuario: 'ana', clave: 'miclave123' });
  verificar('La cuenta creada inicia sesión', !!ingreso.token && ingreso.usuario.usuario === 'ana', ingreso.usuario);
  verificar('El sistema ya queda instalado',
    (await operaciones['usuarios:estado_instalacion'](null, {})).instalado === true);

  let falloClave = null;
  try { await operaciones['usuarios:autenticar'](null, { usuario: 'ana', clave: 'mala' }); } catch (e) { falloClave = e.message; }
  verificar('Una contraseña incorrecta es rechazada', !!falloClave, falloClave);
  let falloUsuario = null;
  try { await operaciones['usuarios:autenticar'](null, { usuario: 'fantasma', clave: 'miclave123' }); } catch (e) { falloUsuario = e.message; }
  verificar('Un usuario inexistente da el mismo mensaje que una clave mala',
    falloUsuario === falloClave, { falloUsuario, falloClave });

  const revalidado = await operaciones['usuarios:sesion_actual'](null, { token });
  verificar('El token guardado revalida la sesión', revalidado.usuario.usuario === 'ana', revalidado.usuario);
  let falloToken = null;
  try { await operaciones['usuarios:sesion_actual'](null, { token: 'falso' }); } catch (e) { falloToken = e.message; }
  verificar('Un token inventado no abre sesión', !!falloToken, falloToken);

  const creado = await operaciones['usuarios:guardar'](null, {
    token, usuario: 'jperez', nombre: 'Juan Pérez', email: 'jperez@empresa.com',
    rol: 'OPERADOR', clave: 'secreta123', activo: 1
  });
  verificar('El administrador crea una cuenta de operador', !!creado.id && creado.usuario.rol === 'OPERADOR', creado.usuario);
  const ingresoOperador = await operaciones['usuarios:autenticar'](null, { usuario: 'jperez', clave: 'secreta123' });
  verificar('El operador inicia sesión con su contraseña', !!ingresoOperador.token, ingresoOperador.usuario);

  let sinPermiso = null;
  try { await operaciones['usuarios:listar'](null, { token: ingresoOperador.token }); } catch (e) { sinPermiso = e.message; }
  verificar('Un operador no puede administrar usuarios', !!sinPermiso, sinPermiso);
  const lista = await operaciones['usuarios:listar'](null, { token });
  verificar('El listado de usuarios no expone hashes',
    lista.length === 2 && lista.every(u => !('clave_hash' in u)), lista.map(u => u.usuario));
  const filtrado = await operaciones['usuarios:listar'](null, { token, busqueda: 'jperez' });
  verificar('El buscador de usuarios filtra por nombre de usuario',
    filtrado.length === 1 && filtrado[0].usuario === 'jperez', filtrado);
  const resumenUsuarios = await operaciones['usuarios:resumen'](null, { token });
  verificar('El resumen cuenta activos y por rol',
    resumenUsuarios.total === 2 && resumenUsuarios.activos === 2 &&
    resumenUsuarios.porRol.find(r => r.rol === 'ADMIN').total === 1, resumenUsuarios);

  await operaciones['usuarios:cambiar_clave'](null, {
    token: ingresoOperador.token, clave_actual: 'secreta123', clave_nueva: 'nueva456'
  });
  verificar('El usuario cambia su propia contraseña', true);
  let conClaveVieja = null;
  try { await operaciones['usuarios:autenticar'](null, { usuario: 'jperez', clave: 'secreta123' }); } catch (e) { conClaveVieja = e.message; }
  verificar('La contraseña anterior deja de servir', !!conClaveVieja, conClaveVieja);
  const conClaveNueva = await operaciones['usuarios:autenticar'](null, { usuario: 'jperez', clave: 'nueva456' });
  verificar('La contraseña nueva sí sirve', !!conClaveNueva.token, conClaveNueva.usuario);

  await operaciones['usuarios:guardar'](null, {
    token, id: creado.id, usuario: 'jperez', nombre: 'Juan Pérez', rol: 'OPERADOR',
    activo: 0, debe_cambiar_clave: 1
  });
  let inactivo = null;
  try { await operaciones['usuarios:autenticar'](null, { usuario: 'jperez', clave: 'nueva456' }); } catch (e) { inactivo = e.message; }
  verificar('Un usuario desactivado no puede iniciar sesión', !!inactivo, inactivo);
  verificar('Desactivar cierra las sesiones abiertas del usuario',
    (await dbUsuarios.prepare('SELECT COUNT(*) total FROM sesiones WHERE usuario_id = ?').get(creado.id)).total === 0);

  await operaciones['usuarios:restablecer_clave'](null, { token, id: creado.id, clave: 'restaurada789' });
  const restaurado = await operaciones['usuarios:autenticar'](null, { usuario: 'jperez', clave: 'restaurada789' });
  verificar('El restablecimiento reactiva la cuenta y fija la nueva clave',
    !!restaurado.token && Number(restaurado.usuario.activo) === 1, restaurado.usuario);

  let sinAdmin = null;
  try {
    await operaciones['usuarios:guardar'](null, {
      token, id: adminGuardado.id, usuario: 'ana', nombre: 'Ana Prueba', rol: 'CONSULTA', activo: 1
    });
  } catch (e) { sinAdmin = e.message; }
  verificar('No se degrada al único administrador a un rol sin permisos', !!sinAdmin, sinAdmin);

  await operaciones['usuarios:guardar'](null, {
    token, id: adminGuardado.id, usuario: 'ana', nombre: 'Ana Prueba', rol: 'ADMIN', activo: 1
  });
  await operaciones['usuarios:eliminar'](null, { token, id: creado.id });
  // Al eliminar la cuenta del operador, sus sesiones se van con ella. Quedan las
  // dos de "ana": la que abrió la instalación y la que se abrió al autenticar de
  // nuevo para comprobar el cierre de sesión más adelante.
  verificar('Se elimina una cuenta junto con sus sesiones',
    filas('usuarios') === 1 && (await dbUsuarios.prepare('SELECT COUNT(*) total FROM sesiones').get()).total === 2,
    { usuarios: filas('usuarios'), sesiones: (await dbUsuarios.prepare('SELECT COUNT(*) total FROM sesiones').get()).total });

  await operaciones['usuarios:cerrar_sesion'](null, { token });
  let trasCerrar = null;
  try { await operaciones['usuarios:sesion_actual'](null, { token }); } catch (e) { trasCerrar = e.message; }
  verificar('Tras cerrar sesión, el token deja de servir', !!trasCerrar, trasCerrar);

  console.log('\n8) Respaldo y mantenimiento');
  const respaldo = await operaciones['sistema:respaldo'](null, {});
  verificar('Se crea el archivo de respaldo', fs.existsSync(respaldo.archivo) && respaldo.tamanio > 0, respaldo);
  verificar('La auditoría registra los movimientos', filas('movimientos_auditoria') > 0);

  const ejemplos = await operaciones['sistema:datos_ejemplo'](null, {});
  verificar('Los datos de ejemplo se pueden cargar a solicitud', Object.keys(ejemplos.insertados).length > 0, ejemplos.insertados);

  const limpieza = await operaciones['sistema:limpiar'](null, 'total');
  verificar('La limpieza total deja la base vacía',
    ['empleados', 'clientes', 'vehiculos', 'conductores', 'ingresos', 'egresos', 'viaticos', 'planillas', 'planilla_detalle', 'combustible', 'bitacora_viajes', 'comisiones']
      .every(t => filas(t) === 0), limpieza.borrados);
  verificar('La configuración vuelve a sus valores iniciales',
    (await operaciones['sistema:info'](null, {})).empresa.nombre_empresa === 'Transporte Fierro');

  console.log('\n9) Cierre de la base de datos');
  baseDatos.cerrarBaseDatos();
  verificar('El archivo de base de datos permanece en disco', fs.existsSync(archivo));

  console.log('\n10) Migración de una base anterior');
  const rutaAnterior = path.join(os.tmpdir(), `control-empresa-migracion-${Date.now()}.db`);
  const baseAnterior = new Database(rutaAnterior);
  baseAnterior.exec(`
    CREATE TABLE ingresos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      fecha TEXT NOT NULL,
      concepto TEXT NOT NULL,
      categoria TEXT,
      monto REAL NOT NULL DEFAULT 0,
      metodo TEXT,
      referencia TEXT,
      observacion TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE bitacora_viajes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      fecha TEXT NOT NULL,
      vehiculo_id INTEGER,
      conductor_id INTEGER,
      origen TEXT NOT NULL,
      destino TEXT NOT NULL,
      km_salida REAL NOT NULL DEFAULT 0,
      km_llegada REAL NOT NULL DEFAULT 0,
      hora_salida TEXT,
      hora_llegada TEXT,
      carga_descripcion TEXT,
      cliente TEXT,
      estado TEXT NOT NULL DEFAULT 'EN CURSO',
      observaciones TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    INSERT INTO bitacora_viajes
      (fecha, origen, destino, km_salida, km_llegada, estado)
    VALUES ('2026-09-01', 'Managua', 'León', 100, 175, 'COMPLETADO');
  `);
  baseAnterior.close();
  process.env.CONTROL_EMPRESA_DB = rutaAnterior;
  baseDatos.inicializarBaseDatos();
  const dbMigrada = baseDatos.obtenerDB();
  const columnasMigradas = dbMigrada.prepare('PRAGMA table_xinfo(bitacora_viajes)').all().map(c => c.name);
  const viajeMigrado = dbMigrada.prepare('SELECT km_recorridos FROM bitacora_viajes').get();
  verificar('La migración agrega las columnas faltantes antes de crear índices',
    columnasMigradas.includes('cliente_id') && columnasMigradas.includes('km_recorridos'), columnasMigradas);
  verificar('La migración conserva los datos y calcula kilómetros',
    viajeMigrado && viajeMigrado.km_recorridos === 75, viajeMigrado);
  verificar('La base migrada queda en la versión vigente',
    dbMigrada.pragma('user_version', { simple: true }) === 6,
    dbMigrada.pragma('user_version', { simple: true }));
  verificar('La migración crea la tabla de comisiones en bases anteriores',
    dbMigrada.prepare("SELECT COUNT(*) total FROM sqlite_master WHERE type='table' AND name='comisiones'").get().total === 1);
  baseDatos.cerrarBaseDatos();
  for (const sufijo of ['', '-wal', '-shm']) {
    const f = rutaAnterior + sufijo;
    if (fs.existsSync(f)) fs.unlinkSync(f);
  }

}

(async () => {

try {
  await ejecutar();
} catch (e) {
  fallidas++;
  console.error('\nError inesperado durante la prueba:', e);
}

try {
  baseDatos.cerrarBaseDatos();
  for (const sufijo of ['', '-wal', '-shm']) {
    const f = archivo + sufijo;
    if (fs.existsSync(f)) fs.unlinkSync(f);
  }
  const carpetaRespaldos = path.join(path.dirname(archivo), 'respaldos');
  if (fs.existsSync(carpetaRespaldos)) {
    for (const f of fs.readdirSync(carpetaRespaldos)) {
      if (f.startsWith('control-empresa-')) fs.unlinkSync(path.join(carpetaRespaldos, f));
    }
    fs.rmdirSync(carpetaRespaldos);
  }
  console.log('\nArchivos temporales eliminados.');
} catch (e) {
  console.warn('No se pudieron eliminar todos los archivos temporales:', e.message);
}



console.log(`\nResultado: ${correctas} comprobaciones correctas, ${fallidas} fallidas.`);
process.exit(fallidas === 0 ? 0 : 1);
})();
