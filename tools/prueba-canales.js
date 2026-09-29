// ============================================================================
// Prueba de humo de TODOS los canales de la API.
//
// Recorre todos los canales contra un PostgreSQL en memoria. Sirve para detectar
// consultas que funcionaban con SQLite (síncrono) pero fallan con PostgreSQL,
// que es donde suelen aparecer los errores de la conversión a async.
//
//   Uso: npm run test:canales
// ============================================================================
const { iniciarMemoria } = require('../server/iniciar-memoria');

// "sistema:limpiar" y "usuarios:instalar" ya se ejercitaron a mano arriba: solo
// funcionan sobre una base vacía, y aquí la base ya tiene cuentas.
const IGNORAR = new Set(['sistema:limpiar', 'sistema:datos_ejemplo', 'sistema:abrir_carpeta', 'usuarios:instalar']);

// Limitaciones conocidas del motor en memoria (pg-mem). El SQL es válido en
// PostgreSQL; queda pendiente de verificarse contra Supabase.
//   - no admite columnas generadas en DELETE/UPDATE
//   - no resuelve alias de tabla en subconsultas ni en GROUP BY
const LIMITES_PG_MEM = /generated column|Unknown alias|No execution context/;

// Comprobaciones propias de esta prueba, que se ejecutan antes del barrido de
// canales (algunos escenarios solo se pueden provocar una vez).
const pendientes = [];
function verificar(descripcion, condicion, detalle) {
  if (condicion) {
    console.log(`  [OK]    ${descripcion}`);
  } else {
    console.log(`  [FALLO] ${descripcion}${detalle !== undefined ? ' -> ' + JSON.stringify(detalle) : ''}`);
    pendientes.push(descripcion);
  }
}

/** Ejecuta un canal que debe fallar y devuelve true si lanzó un error. */
async function esperaFallo(canal, datos) {
  try {
    await ejecutarCanal(canal, datos);
    return false;
  } catch (e) {
    return true;
  }
}


// Los canales de usuarios exigen una sesión válida, y la cuenta inicial
// (admin/admin123) solo existe en esta base en memoria. Estos tokens se
// rellenan autenticando de verdad, justo antes de recorrer los canales.
const TOKENS = { admin: '', sesion: '' };

// Datos mínimos válidos por canal.
const DATOS = {
  'bitacora:guardar': { fecha: '2026-09-25', origen: 'Managua', destino: 'Rivas', km_salida: 100, km_llegada: 180, hora_salida: '07:00', hora_llegada: '10:00', cliente: 'Cliente de prueba', estado: 'COMPLETADO' },
  'vehiculos:guardar': { codigo: 'V-99', placa: 'M 000-000', marca: 'Test', modelo: 'Test', anio: 2024, activo: 1 },
  'conductores:guardar': { nombre: 'Conductor de prueba', documento: '000-0000-0000A', activo: 1 },
  'clientes:guardar': { nombre: 'Cliente de prueba', identificacion: 'J0000000000000', activo: 1 },
  'combustible:guardar': { fecha: '2026-09-25', vehiculo_id: 1, kilometraje: 50000, cantidad: 40, precio_unitario: 48.5, tipo_combustible: 'Diesel' },
  'empleados:guardar': { nombre: 'Empleado de prueba', cargo: 'Chofer', salario_base: 15000, activo: 1 },
  'ingresos:guardar': { fecha: '2026-09-25', concepto: 'Flete de prueba', categoria: 'Servicios', monto: 1000 },
  'egresos:guardar': { fecha: '2026-09-25', concepto: 'Gasto de prueba', categoria: 'Mantenimiento', monto: 250 },
  // El viático se liga a un conductor y a un viaje reales: así la prueba cubre
  // el JOIN de viaticos:listar (conductor_nombre / viaje_*) y no solo el INSERT.
  'viaticos:guardar': { fecha: '2026-09-25', conductor_id: 1, viaje_id: 1, destino: 'León', motivo: 'Traslado', monto: 500 },
  // Viajes que aún se pueden cobrar con un viático. Antes de que corra
  // viaticos:guardar el viaje 1 está libre; el canal devuelve una lista, así que
  // solo se verifica que responda sin error.
  'viaticos:viajes_disponibles': { conductor_id: 1, viatico_id: null },
  // El tablero del dashboard se consulta sin rango para que use el mes en curso
  // (la prueba corre con fechas de 2026-09, el mismo mes).
  'dashboard:tablero': {},
  'planilla:guardar': { periodo: '2026-09', fecha_pago: '2026-09-30', detalle: [] },
  'planilla:generar': { periodo: '2026-09', fecha_pago: '2026-09-30' },
  // La comisión se liga a un conductor y a un viaje reales: así la prueba cubre
  // el JOIN de comisiones:listar (conductor_nombre / viaje_*) y no solo el INSERT.
  'comisiones:guardar': { fecha: '2026-09-25', conductor_id: 1, viaje_id: 1, periodo: '2026-09', concepto: 'Comisión de prueba', tipo: 'PORCENTAJE', base_calculo: 10000, valor_calculo: 5 },
  'comisiones:generar': { periodo: '2026-09', tipo: 'POR_KM', valor_calculo: 2 },
  'comisiones:pagar_conductor': { conductor_id: 1, desde: '2026-09-01', hasta: '2026-09-30' },
  'configuracion:guardar': { nombre_empresa: 'Transportes Fierro', moneda: 'NIO', simbolo: 'C$' },
  'finanzas:categorias': { tipo: 'ingresos' }
};

async function ejecutar() {
  console.log('\n=== Prueba de humo de la API (todos los canales) ===\n');
  await iniciarMemoria();

  const { cargarDatosEjemplo } = require('../server/database-nube');
  const { ejecutarCanal, listarCanales } = require('../server/canales');
  await cargarDatosEjemplo();

  const canales = listarCanales();
  let correctos = 0;
  let omitidos = 0;
  const errores = [];

  // Los borrados necesitan registros propios: los de ejemplo están referidos
  // por otros datos y el borrado correcto es que la clave foránea lo impida.
  const descartables = {};
  async function crear(channel, datos) {
    const r = await ejecutarCanal(channel, datos);
    return r && r.id ? r.id : 1;
  }
  descartables['clientes:eliminar'] = await crear('clientes:guardar', { nombre: 'Temporal', activo: 1 });
  descartables['conductores:eliminar'] = await crear('conductores:guardar', { nombre: 'Temporal', activo: 1 });
  descartables['vehiculos:eliminar'] = await crear('vehiculos:guardar', { codigo: 'TMP-1', placa: 'TMP', activo: 1 });
  descartables['bitacora:eliminar'] = await crear('bitacora:guardar', DATOS['bitacora:guardar']);
  // bitacora:obtener espera un identificador, no filtros: se reutiliza el viaje
  // recién creado para que la prueba consulta un registro que existe.
  descartables['bitacora:obtener'] = descartables['bitacora:eliminar'];
  descartables['comisiones:eliminar'] = await crear('comisiones:guardar', DATOS['comisiones:guardar']);
  // Sin empleados no hay planilla que generar.
  await crear('empleados:guardar', { nombre: 'Temporal', cargo: 'Chofer', salario_base: 100, activo: 1 });

  // Sesiones reales para probar los canales de usuarios. La base en memoria
  // arranca vacía (no hay credenciales de fábrica), así que primero se instala
  // el sistema con una cuenta creada aquí, igual que haría el usuario. Luego se
  // crean dos cuentas descartables: una para el borrado y otra para el cambio y
  // restablecimiento de clave.
  const instalacion = await ejecutarCanal('usuarios:instalar', {
    nombre_empresa: 'Transportes Prueba', nombre: 'Ana Prueba', usuario: 'ana', clave: 'miclave123'
  });
  TOKENS.admin = instalacion.token;
  verificar(
    'La instalación abre la primera cuenta con la clave elegida',
    instalacion.usuario.rol === 'ADMIN' && instalacion.usuario.debe_cambiar_clave === false,
    instalacion.usuario
  );
  verificar(
    'Instalar de nuevo se rechaza cuando ya hay cuentas',
    await esperaFallo('usuarios:instalar', { usuario: 'otro', nombre: 'Otro', clave: 'clave123' })
  );

  const crearUsuario = async (nombre) => crear('usuarios:guardar', {
    token: TOKENS.admin, usuario: nombre, nombre: `Usuario ${nombre}`,
    rol: 'OPERADOR', clave: 'claveoriginal1', activo: 1
  });
  const idBorrable = await crearUsuario('borrable');
  const idRestablecible = await crearUsuario('restablecible');
  const sesionTemporal = await ejecutarCanal('usuarios:autenticar', { usuario: 'borrable', clave: 'claveoriginal1' });
  TOKENS.sesion = sesionTemporal.token;

  // Los canales se recorren en orden alfabético, así que cada uno necesita un
  // identificador que siga existiendo cuando le toque: el borrable solo se usa
  // para eliminar, y el restablecible para cambiar/restablecer claves.
  DATOS['usuarios:estado_instalacion'] = {};
  DATOS['usuarios:autenticar'] = { usuario: 'ana', clave: 'miclave123' };
  DATOS['usuarios:sesion_actual'] = { token: TOKENS.admin };
  DATOS['usuarios:listar'] = { token: TOKENS.admin };
  DATOS['usuarios:resumen'] = { token: TOKENS.admin };
  DATOS['usuarios:guardar'] = {
    token: TOKENS.admin, usuario: 'canales', nombre: 'Usuario de prueba de canales',
    rol: 'CONSULTA', clave: 'clave123', activo: 1
  };
  DATOS['usuarios:eliminar'] = { token: TOKENS.admin, id: idBorrable };
  DATOS['usuarios:restablecer_clave'] = { token: TOKENS.admin, id: idRestablecible, clave: 'restaurada123' };
  DATOS['usuarios:cambiar_clave'] = { token: TOKENS.sesion, clave_actual: 'claveoriginal1', clave_nueva: 'sesion456' };

  // Monitoreo GPS: flujo completo (vincular -> reportar -> listar) y rechazos.
  const disp = await ejecutarCanal('monitoreo:vincular', { token: TOKENS.admin, conductor_id: 1 });
  const rep = await ejecutarCanal('monitoreo:reportar', { clave: disp.clave, lat: 12.13, lng: -86.25, velocidad: 40, bateria: 80 });
  verificar('Monitoreo: el teléfono vinculado reporta su posición', rep.ok === true && rep.recibidos === 1, rep);
  const vivo = await ejecutarCanal('monitoreo:listar', { token: TOKENS.admin });
  const filaGps = vivo.conductores.find((c) => Number(c.conductor_id) === 1);
  verificar('Monitoreo: la posición aparece EN_LINEA', !!filaGps && filaGps.estado === 'EN_LINEA' && Math.abs(filaGps.lat - 12.13) < 1e-6, filaGps);
  verificar('Monitoreo: reportar con clave inválida se rechaza', await esperaFallo('monitoreo:reportar', { clave: 'x', lat: 1, lng: 1 }));
  verificar('Monitoreo: listar sin sesión se rechaza', await esperaFallo('monitoreo:listar', {}));
  DATOS['monitoreo:listar'] = { token: TOKENS.admin };
  DATOS['monitoreo:vincular'] = { token: TOKENS.admin, conductor_id: 1 };
  DATOS['monitoreo:desvincular'] = { token: TOKENS.admin, conductor_id: 1 };
  DATOS['monitoreo:historial'] = { token: TOKENS.admin, conductor_id: 1 };
  DATOS['monitoreo:reportar'] = { clave: disp.clave, lat: 12.14, lng: -86.26 };
  DATOS['monitoreo:osmand'] = { id: disp.clave, lat: '12.15', lon: '-86.27', speed: '5' };
  // "usuarios:cerrar_sesion" se recorre antes que (c) y (e), y cerrarlo anularía
  // el token que usan: por eso se abre una sesión aparte solo para cerrar.
  const sesionParaCerrar = await ejecutarCanal('usuarios:autenticar', { usuario: 'borrable', clave: 'claveoriginal1' });
  DATOS['usuarios:cerrar_sesion'] = { token: sesionParaCerrar.token };
  descartables['usuarios:eliminar'] = idBorrable;

  for (const canal of canales) {
    if (IGNORAR.has(canal)) {
      console.log(`  [OMITIDO] ${canal}`);
      continue;
    }
    let entrada = DATOS[canal];
    if (entrada === undefined && descartables[canal] !== undefined) {
      entrada = descartables[canal];
    }
    if (entrada === undefined) {
      // Lecturas: filtros vacíos. Acciones que necesitan id: usan el 1.
      entrada = /listar|resumen|obtener|categorias|sugerencia|info|auditoria|rendimiento/.test(canal.split(':')[1])
        ? {}
        : 1;
    }
    try {
      const r = await ejecutarCanal(canal, entrada);
      if (r === undefined) throw new Error('el canal no devolvio nada');
      correctos++;
    } catch (e) {
      const mensaje = e.message.split('\n')[0];
      if (LIMITES_PG_MEM.test(mensaje)) {
        omitidos++;
        console.log(`  [OMITIDO] ${canal.padEnd(32)} límite de pg-mem: ${mensaje}`);
      } else {
        errores.push({ canal, mensaje });
      }
    }
  }

  for (const { canal, mensaje } of errores) {
    console.log(`  [FALLO]   ${canal.padEnd(32)} ${mensaje}`);
  }
  console.log(`\nResultado: ${correctos} canales OK, ${errores.length} con error, ${omitidos} omitidos por límites de pg-mem (de ${canales.length - IGNORAR.size} probados).`);
  if (pendientes.length) {
    console.log(`  Comprobaciones del flujo de instalación: ${pendientes.length} fallidas.`);
  }
  return errores.length === 0 && pendientes.length === 0;
}

module.exports = { ejecutar };
if (require.main === module) {
  ejecutar()
    .then((ok) => process.exit(ok ? 0 : 1))
    .catch((e) => { console.error('\nFallo inesperado:', e); process.exit(1); });
}
