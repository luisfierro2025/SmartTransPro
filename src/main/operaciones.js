// Operaciones de negocio conectadas a la base de datos.
// Cada entrada de "operaciones" es un manejador IPC: (evento, datos) => resultado.
// Se registran en src/main/ipc.js y también se pueden invocar directamente
// desde las pruebas automatizadas (ver tools/prueba-base-datos.js).
const path = require('path');
const os = require('os');
const fsp = require('fs/promises');
const { dialog, BrowserWindow, shell } = require('electron');
const {
  obtenerDB,
  obtenerRutaBaseDatos,
  estadisticas,
  registrarAuditoria,
  cargarDatosEjemplo,
  limpiarDatos,
  respaldarBaseDatos
} = require('./database');
const {
  ROLES,
  MODULOS_POR_ROL,
  HORAS_SESION,
  crearHashClave,
  verificarClave,
  problemaClave,
  problemasUsuario,
  generarToken,
  generarClaveDispositivo,
  hashToken,
  normalizarRol,
  esAdmin,
  usuarioPublico,
  baseTieneUsuarios,
  crearPrimerUsuario
} = require('./seguridad');

// ---------------------------------------------------------------- utilidades

function texto(valor) {
  if (valor === undefined || valor === null) return null;
  const t = String(valor).trim();
  return t === '' ? null : t;
}

function numero(valor) {
  const n = parseFloat(valor);
  return Number.isFinite(n) ? n : 0;
}

function entero(valor) {
  if (valor === undefined || valor === null || valor === '') return null;
  const n = parseInt(valor, 10);
  return Number.isFinite(n) ? n : null;
}

function booleano(valor) {
  return (valor === true || valor === 1 || valor === '1' || valor === 'true') ? 1 : 0;
}

// Filtros de fecha reutilizables sobre una columna de fecha.
function filtroFechas(condiciones, parametros, filtro, columna) {
  if (filtro.desde) {
    condiciones.push(`date(${columna}) >= date(@desde)`);
    parametros.desde = filtro.desde;
  }
  if (filtro.hasta) {
    condiciones.push(`date(${columna}) <= date(@hasta)`);
    parametros.hasta = filtro.hasta;
  }
}

// ---------------------------------------------------------------- empleados

async function listarEmpleados(_, filtro = {}) {
  const db = obtenerDB();
  const condiciones = ['1=1'];
  const p = {};
  if (filtro.soloActivos) condiciones.push('activo=1');
  if (texto(filtro.busqueda)) {
    condiciones.push('(nombre LIKE @q OR cedula LIKE @q OR codigo LIKE @q OR cargo LIKE @q)');
    p.q = `%${texto(filtro.busqueda)}%`;
  }
  return await db.prepare(`SELECT * FROM empleados WHERE ${condiciones.join(' AND ')} ORDER BY nombre`).all(p);
}

async function resumenEmpleados(_) {
  const db = obtenerDB();
  const activos = (await db.prepare('SELECT COUNT(*) total FROM empleados WHERE activo=1').get()).total;
  const total = (await db.prepare('SELECT COUNT(*) total FROM empleados').get()).total;
  const nomina = (await db.prepare('SELECT COALESCE(SUM(salario_base),0) total FROM empleados WHERE activo=1').get()).total;
  return { total, activos, inactivos: total - activos, nominaMensual: nomina };
}

async function generarCodigoEmpleado(db) {
  const siguiente = (await db.prepare(`
    SELECT COALESCE(MAX(CAST(SUBSTR(codigo, 5) AS INTEGER)), 0) + 1 AS numero
    FROM empleados
    WHERE codigo LIKE 'EMP-%'
  `).get()).numero;
  return `EMP-${String(siguiente).padStart(3, '0')}`;
}

async function guardarEmpleado(_, d) {
  const db = obtenerDB();
  const codigo = texto(d.codigo) || await generarCodigoEmpleado(db);
  const datos = [codigo, texto(d.nombre), texto(d.cedula), texto(d.cargo), numero(d.salario_base), texto(d.fecha_ingreso), booleano(d.activo !== undefined ? d.activo : 1)];
  if (d.id) {
    await db.prepare('UPDATE empleados SET codigo=?, nombre=?, cedula=?, cargo=?, salario_base=?, fecha_ingreso=?, activo=? WHERE id=?').run(...datos, d.id);
    await registrarAuditoria('empleados', 'ACTUALIZAR', d.id, `Empleado actualizado: ${datos[1]}`);
    return { ok: true, id: d.id };
  }
  const res = await db.prepare('INSERT INTO empleados (codigo, nombre, cedula, cargo, salario_base, fecha_ingreso, activo) VALUES (?, ?, ?, ?, ?, ?, ?)').run(...datos);
  await registrarAuditoria('empleados', 'CREAR', res.lastInsertRowid, `Empleado creado: ${datos[1]}`);
  return { ok: true, id: res.lastInsertRowid };
}

async function eliminarEmpleado(_, id) {
  const db = obtenerDB();
  const enPlanilla = await db.prepare('SELECT COUNT(*) total FROM planilla_detalle WHERE empleado_id=?').get(id).total;
  const enViaticos = await db.prepare('SELECT COUNT(*) total FROM viaticos WHERE empleado_id=?').get(id).total;
  if (enPlanilla || enViaticos) {
    throw new Error('El empleado tiene planillas o viáticos asociados. Márquelo como inactivo en lugar de eliminarlo.');
  }
  await db.prepare('DELETE FROM empleados WHERE id=?').run(id);
  await registrarAuditoria('empleados', 'ELIMINAR', id, 'Empleado eliminado');
  return { ok: true };
}

// ---------------------------------------------------------------- ingresos y egresos

async function listarIngresos(_, f = {}) {
  const db = obtenerDB();
  const condiciones = ['1=1'];
  const p = {};
  filtroFechas(condiciones, p, f, 'i.fecha');
  if (texto(f.categoria)) { condiciones.push('i.categoria=@categoria'); p.categoria = texto(f.categoria); }
  if (texto(f.busqueda)) {
    condiciones.push('(i.concepto LIKE @q OR i.referencia LIKE @q OR i.observacion LIKE @q OR c.nombre LIKE @q)');
    p.q = `%${texto(f.busqueda)}%`;
  }
  return await db.prepare(`
    SELECT i.*, c.nombre AS cliente_nombre
    FROM ingresos i
    LEFT JOIN clientes c ON c.id = i.cliente_id
    WHERE ${condiciones.join(' AND ')}
    ORDER BY date(i.fecha) DESC, i.id DESC`).all(p);
}

async function guardarIngreso(_, d) {
  const db = obtenerDB();
  if (d.id) {
    await db.prepare('UPDATE ingresos SET fecha=?, concepto=?, categoria=?, cliente_id=?, monto=?, metodo=?, referencia=?, observacion=? WHERE id=?')
      .run(d.fecha, texto(d.concepto), texto(d.categoria), entero(d.cliente_id), numero(d.monto), texto(d.metodo), texto(d.referencia), texto(d.observacion), d.id);
    await registrarAuditoria('ingresos', 'ACTUALIZAR', d.id, `Ingreso actualizado: ${d.concepto} (${numero(d.monto)})`);
    return { ok: true, id: d.id };
  }
  const res = await db.prepare('INSERT INTO ingresos (fecha, concepto, categoria, cliente_id, monto, metodo, referencia, observacion) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .run(d.fecha, texto(d.concepto), texto(d.categoria), entero(d.cliente_id), numero(d.monto), texto(d.metodo), texto(d.referencia), texto(d.observacion));
  await registrarAuditoria('ingresos', 'CREAR', res.lastInsertRowid, `Ingreso registrado: ${d.concepto} (${numero(d.monto)})`);
  return { ok: true, id: res.lastInsertRowid };
}

async function eliminarIngreso(_, id) {
  const db = obtenerDB();
  const fila = await db.prepare('SELECT concepto, monto FROM ingresos WHERE id=?').get(id);
  await db.prepare('DELETE FROM ingresos WHERE id=?').run(id);
  await registrarAuditoria('ingresos', 'ELIMINAR', id, fila ? `Ingreso eliminado: ${fila.concepto} (${fila.monto})` : 'Ingreso eliminado');
  return { ok: true };
}

async function listarEgresos(_, f = {}) {
  const db = obtenerDB();
  const condiciones = ['1=1'];
  const p = {};
  filtroFechas(condiciones, p, f, 'fecha');
  if (texto(f.categoria)) { condiciones.push('categoria=@categoria'); p.categoria = texto(f.categoria); }
  if (texto(f.busqueda)) {
    condiciones.push('(concepto LIKE @q OR referencia LIKE @q OR beneficiario LIKE @q OR observacion LIKE @q)');
    p.q = `%${texto(f.busqueda)}%`;
  }
  return await db.prepare(`SELECT * FROM egresos WHERE ${condiciones.join(' AND ')} ORDER BY date(fecha) DESC, id DESC`).all(p);
}

async function guardarEgreso(_, d) {
  const db = obtenerDB();
  if (d.id) {
    await db.prepare('UPDATE egresos SET fecha=?, concepto=?, categoria=?, beneficiario=?, monto=?, metodo=?, referencia=?, observacion=? WHERE id=?')
      .run(d.fecha, texto(d.concepto), texto(d.categoria), texto(d.beneficiario), numero(d.monto), texto(d.metodo), texto(d.referencia), texto(d.observacion), d.id);
    await registrarAuditoria('egresos', 'ACTUALIZAR', d.id, `Egreso actualizado: ${d.concepto} (${numero(d.monto)})`);
    return { ok: true, id: d.id };
  }
  const res = await db.prepare('INSERT INTO egresos (fecha, concepto, categoria, beneficiario, monto, metodo, referencia, observacion) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .run(d.fecha, texto(d.concepto), texto(d.categoria), texto(d.beneficiario), numero(d.monto), texto(d.metodo), texto(d.referencia), texto(d.observacion));
  await registrarAuditoria('egresos', 'CREAR', res.lastInsertRowid, `Egreso registrado: ${d.concepto} (${numero(d.monto)})`);
  return { ok: true, id: res.lastInsertRowid };
}

async function eliminarEgreso(_, id) {
  const db = obtenerDB();
  const fila = await db.prepare('SELECT concepto, monto FROM egresos WHERE id=?').get(id);
  await db.prepare('DELETE FROM egresos WHERE id=?').run(id);
  await registrarAuditoria('egresos', 'ELIMINAR', id, fila ? `Egreso eliminado: ${fila.concepto} (${fila.monto})` : 'Egreso eliminado');
  return { ok: true };
}

async function resumenFinanciero(tabla, filtro = {}) {
  const db = obtenerDB();
  const condiciones = ['1=1'];
  const p = {};
  filtroFechas(condiciones, p, filtro, 'fecha');
  const where = condiciones.join(' AND ');
  const cab = await db.prepare(`SELECT COALESCE(SUM(monto),0) total, COUNT(*) cantidad FROM ${tabla} WHERE ${where}`).get(p);
  const porCategoria = await db.prepare(`
    SELECT COALESCE(categoria,'Sin categoría') categoria, COALESCE(SUM(monto),0) total, COUNT(*) cantidad
    FROM ${tabla} WHERE ${where}
    GROUP BY COALESCE(categoria,'Sin categoría')
    ORDER BY total DESC`).all(p);
  return { total: cab.total, cantidad: cab.cantidad, promedio: cab.cantidad ? cab.total / cab.cantidad : 0, porCategoria };
}

async function listarCategorias(_, f = {}) {
  const db = obtenerDB();
  const tabla = f.tipo === 'ingresos' ? 'ingresos' : 'egresos';
  return (await db.prepare(`SELECT DISTINCT categoria FROM ${tabla} WHERE categoria IS NOT NULL AND categoria <> '' ORDER BY categoria`).all()).map(r => r.categoria);
}


// ---------------------------------------------------------------- viáticos

async function listarViaticos(_, f = {}) {
  const db = obtenerDB();
  const condiciones = ['1=1'];
  const p = {};
  filtroFechas(condiciones, p, f, 'v.fecha');
  if (texto(f.estado)) { condiciones.push('v.estado=@estado'); p.estado = texto(f.estado); }
  if (entero(f.conductor_id)) { condiciones.push('v.conductor_id=@conductor_id'); p.conductor_id = entero(f.conductor_id); }
  if (texto(f.busqueda)) {
    condiciones.push('(v.destino LIKE @q OR v.motivo LIKE @q OR v.observacion LIKE @q OR c.nombre LIKE @q)');
    p.q = `%${texto(f.busqueda)}%`;
  }
  // Solo se trae un rótulo breve del viaje (fecha/ruta), no la bitácora completa:
  // el detalle se consulta aparte con bitacora:obtener cuando se pide "Ver ficha".
  return await db.prepare(`
    SELECT v.*, c.nombre AS conductor_nombre,
           bv.fecha AS viaje_fecha, bv.lugar_salida AS viaje_origen, bv.destino AS viaje_destino
    FROM viaticos v
    LEFT JOIN conductores c ON c.id = v.conductor_id
    LEFT JOIN bitacora_viajes bv ON bv.id = v.viaje_id
    WHERE ${condiciones.join(' AND ')}
    ORDER BY date(v.fecha) DESC, v.id DESC`).all(p);
}

// Viajes de Bitácora que todavía se pueden cobrar con un viático.
//
// Regla de negocio: un viaje se cobra UNA sola vez. Si el viaje ya tiene un
// viático (pendiente o liquidado) queda excluido, para que no se pueda
// registrar un segundo cobro del mismo traslado. Al editar un viático se envía
// su id en "viatico_id": ese registro no cuenta como uso, así el viaje sigue
// disponible y se puede modificar el monto o los datos sin perder el vínculo.
//
// La cláusula de exclusión se arma según el caso en vez de enviar un NULL:
// PostgreSQL no puede deducir el tipo de un parámetro que llega nulo y
// responde "could not determine data type of parameter $2" (error 42P18).
async function listarViajesParaViatico(_, f = {}) {
  const db = obtenerDB();
  const viaticoId = entero(f.viatico_id);
  const p = { conductor_id: entero(f.conductor_id) };
  const excluirPropio = viaticoId ? 'AND v.id <> @viatico_id' : '';
  if (viaticoId) p.viatico_id = viaticoId;
  return await db.prepare(`
    SELECT b.*, c.nombre AS conductor_nombre
    FROM bitacora_viajes b
    LEFT JOIN conductores c ON c.id = b.conductor_id
    WHERE b.conductor_id = @conductor_id
      AND b.id NOT IN (
        SELECT v.viaje_id FROM viaticos v
        WHERE v.viaje_id IS NOT NULL ${excluirPropio}
      )
    ORDER BY date(b.fecha) DESC, b.id DESC`).all(p);
}

// Impide cobrar dos veces el mismo viaje. La comprobación va en el servidor y
// no solo en la interfaz: el desplegable puede ocultarlo, pero esta validación
// es la que cierra de verdad el paso (API, web o cualquier otro cliente).
// Editar el mismo viático (d.id) se permite: no es un segundo cobro.
//
// Se cuentan los OTROS viáticos del viaje, sin mirar su estado: pendiente,
// liquidado o duplicado antiguo, todos cuentan como "ya cobrado".
async function verificarViajeSinCobrar(db, viajeId, viaticoId) {
  if (!viajeId) return;
  const p = viaticoId ? { viaje_id: viajeId, viatico_id: viaticoId } : { viaje_id: viajeId };
  const otros = viaticoId ? 'AND v.id <> @viatico_id' : '';
  const usos = await db.prepare(`
    SELECT COUNT(*) total FROM viaticos v
    WHERE v.viaje_id = @viaje_id ${otros}`).get(p);
  if (!usos.total) return;
  throw new Error(
    `El viaje #${viajeId} ya tiene un viático registrado. Un viaje no se puede cobrar dos veces con viáticos.`
  );
}

async function guardarViatico(_, d) {
  const db = obtenerDB();
  const liquidado = booleano(d.liquidado);
  const estado = liquidado ? 'LIQUIDADO' : 'PENDIENTE';
  const viajeId = entero(d.viaje_id);
  const viaticoId = entero(d.id);
  await verificarViajeSinCobrar(db, viajeId, viaticoId);
  const datos = [entero(d.conductor_id), viajeId, d.fecha, texto(d.destino), texto(d.motivo), numero(d.monto), liquidado, estado, texto(d.observacion)];
  if (d.id) {
    await db.prepare('UPDATE viaticos SET conductor_id=?, viaje_id=?, fecha=?, destino=?, motivo=?, monto=?, liquidado=?, estado=?, observacion=? WHERE id=?')
      .run(...datos, d.id);
    await registrarAuditoria('viaticos', 'ACTUALIZAR', d.id, `Viático actualizado: ${d.destino || ''} (${numero(d.monto)})`);
    return { ok: true, id: d.id };
  }
  const res = await db.prepare('INSERT INTO viaticos (conductor_id, viaje_id, fecha, destino, motivo, monto, liquidado, estado, observacion) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .run(...datos);
  await registrarAuditoria('viaticos', 'CREAR', res.lastInsertRowid, `Viático registrado: ${d.destino || ''} (${numero(d.monto)})`);
  return { ok: true, id: res.lastInsertRowid };
}

async function liquidarViatico(_, id) {
  const db = obtenerDB();
  await db.prepare("UPDATE viaticos SET liquidado=1, estado='LIQUIDADO' WHERE id=?").run(id);
  await registrarAuditoria('viaticos', 'LIQUIDAR', id, 'Viático liquidado');
  return { ok: true, id };
}

async function eliminarViatico(_, id) {
  const db = obtenerDB();
  await db.prepare('DELETE FROM viaticos WHERE id=?').run(id);
  await registrarAuditoria('viaticos', 'ELIMINAR', id, 'Viático eliminado');
  return { ok: true };
}

async function resumenViaticos(_, f = {}) {
  const db = obtenerDB();
  const condiciones = ['1=1'];
  const p = {};
  filtroFechas(condiciones, p, f, 'fecha');
  if (entero(f.conductor_id)) { condiciones.push('conductor_id=@conductor_id'); p.conductor_id = entero(f.conductor_id); }
  const where = condiciones.join(' AND ');
  const base = await db.prepare(`
    SELECT COALESCE(SUM(monto),0) total,
           COUNT(*) cantidad,
           COALESCE(SUM(CASE WHEN liquidado=0 THEN monto ELSE 0 END),0) pendiente,
           COALESCE(SUM(CASE WHEN liquidado=1 THEN monto ELSE 0 END),0) liquidado,
           SUM(CASE WHEN liquidado=0 THEN 1 ELSE 0 END) cantidadPendiente
    FROM viaticos WHERE ${where}`).get(p);
  return base;
}


// ---------------------------------------------------------------- comisiones

// Formas de calcular la comisión de un conductor. El significado de
// "valor_calculo" cambia según el tipo:
//   PORCENTAJE -> % del flete          (monto = base_calculo * valor / 100)
//   POR_KM     -> tarifa por kilómetro (monto = base_calculo * valor)
//   FIJO       -> monto fijo           (monto = valor)
const TIPOS_COMISION = ['PORCENTAJE', 'POR_KM', 'FIJO'];

function tipoComision(valor) {
  const t = String(texto(valor) || '').toUpperCase();
  return TIPOS_COMISION.includes(t) ? t : 'PORCENTAJE';
}

function estadoComision(valor) {
  return String(texto(valor) || '').toUpperCase() === 'PAGADA' ? 'PAGADA' : 'PENDIENTE';
}

// Período de pago en formato AAAA-MM (si no viene, el mes en curso).
function periodoComision(valor) {
  const t = texto(valor);
  if (t && /^\d{4}-\d{2}$/.test(t)) return t;
  return new Date().toISOString().slice(0, 7);
}

// Primer y último día de un período AAAA-MM. Se calcula con JavaScript y no con
// SQL para que funcione igual en SQLite y en PostgreSQL.
function rangoDePeriodo(periodo) {
  const anio = parseInt(periodo.slice(0, 4), 10);
  const mes = parseInt(periodo.slice(5, 7), 10);
  const ultimoDia = new Date(anio, mes, 0).getDate();
  return { desde: `${periodo}-01`, hasta: `${periodo}-${String(ultimoDia).padStart(2, '0')}` };
}

function montoComision(tipo, base, valor) {
  const b = numero(base);
  const v = numero(valor);
  const calculado = tipo === 'FIJO' ? v : (tipo === 'POR_KM' ? b * v : (b * v) / 100);
  return Math.round(calculado * 100) / 100;
}

async function listarComisiones(_, f = {}) {
  const db = obtenerDB();
  const condiciones = ['1=1'];
  const p = {};
  filtroFechas(condiciones, p, f, 'c.fecha');
  if (texto(f.periodo)) { condiciones.push('c.periodo=@periodo'); p.periodo = texto(f.periodo); }
  if (texto(f.estado)) { condiciones.push('c.estado=@estado'); p.estado = estadoComision(f.estado); }
  if (texto(f.tipo)) { condiciones.push('c.tipo=@tipo'); p.tipo = tipoComision(f.tipo); }
  if (entero(f.conductor_id)) { condiciones.push('c.conductor_id=@conductor_id'); p.conductor_id = entero(f.conductor_id); }
  if (texto(f.busqueda)) {
    condiciones.push('(c.concepto LIKE @q OR c.referencia LIKE @q OR c.observacion LIKE @q OR co.nombre LIKE @q OR bv.destino LIKE @q)');
    p.q = `%${texto(f.busqueda)}%`;
  }
  // Solo un rótulo breve del viaje: el detalle se consulta con bitacora:obtener.
  return await db.prepare(`
    SELECT c.*, co.nombre AS conductor_nombre, co.documento AS conductor_documento,
           bv.fecha AS viaje_fecha, bv.lugar_salida AS viaje_origen, bv.destino AS viaje_destino
    FROM comisiones c
    LEFT JOIN conductores co ON co.id = c.conductor_id
    LEFT JOIN bitacora_viajes bv ON bv.id = c.viaje_id
    WHERE ${condiciones.join(' AND ')}
    ORDER BY date(c.fecha) DESC, c.id DESC`).all(p);
}

// Totales del período filtrado. No aplica el filtro de estado a propósito: los
// indicadores muestran cuánto está pendiente y cuánto se pagó.
async function resumenComisiones(_, f = {}) {
  const db = obtenerDB();
  const condiciones = ['1=1'];
  const p = {};
  filtroFechas(condiciones, p, f, 'fecha');
  if (texto(f.periodo)) { condiciones.push('periodo=@periodo'); p.periodo = texto(f.periodo); }
  if (texto(f.tipo)) { condiciones.push('tipo=@tipo'); p.tipo = tipoComision(f.tipo); }
  if (entero(f.conductor_id)) { condiciones.push('conductor_id=@conductor_id'); p.conductor_id = entero(f.conductor_id); }
  return await db.prepare(`
    SELECT COALESCE(SUM(monto),0) total,
           COUNT(*) cantidad,
           COALESCE(SUM(CASE WHEN estado='PAGADA' THEN 0 ELSE monto END),0) pendiente,
           COALESCE(SUM(CASE WHEN estado='PAGADA' THEN monto ELSE 0 END),0) pagado,
           SUM(CASE WHEN estado='PAGADA' THEN 0 ELSE 1 END) cantidadPendiente
    FROM comisiones WHERE ${condiciones.join(' AND ')}`).get(p);
}

async function guardarComision(_, d) {
  const db = obtenerDB();
  const fecha = texto(d.fecha);
  if (!fecha) throw new Error('La comisión necesita una fecha.');
  const tipo = tipoComision(d.tipo);
  const base = numero(d.base_calculo);
  const valor = numero(d.valor_calculo);
  const monto = numero(d.monto) || montoComision(tipo, base, valor);
  const estado = estadoComision(d.estado);
  const periodo = periodoComision(d.periodo || String(fecha).slice(0, 7));
  const fechaPago = estado === 'PAGADA'
    ? (texto(d.fecha_pago) || new Date().toISOString().slice(0, 10))
    : texto(d.fecha_pago);
  const datos = [
    entero(d.conductor_id), entero(d.viaje_id), fecha, periodo, texto(d.concepto),
    tipo, base, valor, monto, estado, fechaPago, texto(d.metodo), texto(d.referencia), texto(d.observacion)
  ];
  if (d.id) {
    await db.prepare('UPDATE comisiones SET conductor_id=?, viaje_id=?, fecha=?, periodo=?, concepto=?, tipo=?, base_calculo=?, valor_calculo=?, monto=?, estado=?, fecha_pago=?, metodo=?, referencia=?, observacion=? WHERE id=?')
      .run(...datos, d.id);
    await registrarAuditoria('comisiones', 'ACTUALIZAR', d.id, `Comisión actualizada: ${numero(monto)} (${tipo})`);
    return { ok: true, id: d.id };
  }
  const res = await db.prepare('INSERT INTO comisiones (conductor_id, viaje_id, fecha, periodo, concepto, tipo, base_calculo, valor_calculo, monto, estado, fecha_pago, metodo, referencia, observacion) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .run(...datos);
  await registrarAuditoria('comisiones', 'CREAR', res.lastInsertRowid, `Comisión registrada: ${numero(monto)} (${tipo})`);
  return { ok: true, id: res.lastInsertRowid };
}


// Marca una comisión como pagada. Acepta el identificador suelto o un objeto
// { id, metodo }: la versión web envía el id como cuerpo de la petición.
async function pagarComision(_, d) {
  const db = obtenerDB();
  const esObjeto = d !== null && typeof d === 'object';
  const id = entero(esObjeto ? d.id : d);
  if (!id) throw new Error('Falta la comisión que se va a pagar.');
  const metodo = esObjeto ? texto(d.metodo) : null;
  const fila = await db.prepare('SELECT monto FROM comisiones WHERE id=?').get(id);
  await db.prepare("UPDATE comisiones SET estado='PAGADA', fecha_pago=COALESCE(fecha_pago, date('now')) WHERE id=?").run(id);
  if (metodo) await db.prepare('UPDATE comisiones SET metodo=? WHERE id=?').run(metodo, id);
  await registrarAuditoria('comisiones', 'PAGAR', id, fila ? `Comisión pagada: ${numero(fila.monto)}` : 'Comisión pagada');
  return { ok: true, id };
}

// Liquida de una sola vez las comisiones pendientes de un conductor, con el
// mismo rango de fechas y período con el que se está filtrando en pantalla.
async function pagarComisionesDelConductor(_, d = {}) {
  const db = obtenerDB();
  const conductorId = entero(d.conductor_id);
  if (!conductorId) throw new Error('Falta el conductor cuyas comisiones se van a pagar.');
  const condiciones = ['conductor_id=@conductor_id', "estado<>'PAGADA'"];
  const p = { conductor_id: conductorId };
  filtroFechas(condiciones, p, d, 'fecha');
  if (texto(d.periodo)) { condiciones.push('periodo=@periodo'); p.periodo = texto(d.periodo); }
  const where = condiciones.join(' AND ');
  const pendientes = await db.prepare(`SELECT COALESCE(SUM(monto),0) total, COUNT(*) cantidad FROM comisiones WHERE ${where}`).get(p);
  const metodo = texto(d.metodo);
  const res = await db.prepare(
    `UPDATE comisiones SET estado='PAGADA', fecha_pago=COALESCE(fecha_pago, date('now'))${metodo ? ', metodo=@metodo' : ''} WHERE ${where}`
  ).run(metodo ? { ...p, metodo } : p);
  await registrarAuditoria('comisiones', 'PAGAR', conductorId, `Comisiones liquidadas al conductor #${conductorId}: ${numero(pendientes.total)}`);
  return { ok: true, conductor_id: conductorId, pagadas: res.changes || 0, cantidad: pendientes.cantidad, total: pendientes.total };
}

async function eliminarComision(_, id) {
  const db = obtenerDB();
  await db.prepare('DELETE FROM comisiones WHERE id=?').run(id);
  await registrarAuditoria('comisiones', 'ELIMINAR', id, 'Comisión eliminada');
  return { ok: true };
}


// Genera una comisión por conductor con los viajes de Bitácora del período:
// cubre el pago por kilómetro (base = km recorridos) y el monto fijo del mes.
// El porcentaje sobre el flete se registra a mano, porque Bitácora no guarda el
// monto de cada flete.
async function generarComisiones(_, d = {}) {
  const db = obtenerDB();
  const tipo = tipoComision(d.tipo);
  if (tipo === 'PORCENTAJE') {
    throw new Error('La comisión por porcentaje necesita la base del flete: regístrela con "+ Registrar Comisión".');
  }
  const valorCalculo = numero(d.valor_calculo !== undefined ? d.valor_calculo : d.valor);
  if (valorCalculo <= 0) {
    throw new Error('Indique la tarifa por kilómetro o el monto fijo de la comisión.');
  }
  const periodo = periodoComision(d.periodo);
  const rango = rangoDePeriodo(periodo);
  const desde = texto(d.desde) || rango.desde;
  const hasta = texto(d.hasta) || rango.hasta;

  const condiciones = [
    'conductor_id IS NOT NULL',
    "estado <> 'CANCELADO'",
    'date(fecha) >= date(@desde)',
    'date(fecha) <= date(@hasta)'
  ];
  const p = { desde, hasta };
  if (entero(d.conductor_id)) { condiciones.push('conductor_id=@conductor_id'); p.conductor_id = entero(d.conductor_id); }

  // Los totales se agrupan en memoria: GROUP BY con alias de tabla no funciona
  // en el PostgreSQL en memoria que usan las pruebas.
  const viajes = await db.prepare(`
    SELECT id, conductor_id, fecha, km_recorridos
    FROM bitacora_viajes
    WHERE ${condiciones.join(' AND ')}
    ORDER BY date(fecha)`).all(p);

  // Un conductor puede tener una sola comisión automática por período: las que
  // ya existen se omiten, así el botón se puede pulsar dos veces sin duplicar.
  const yaTienen = new Set(
    (await db.prepare('SELECT conductor_id FROM comisiones WHERE periodo=@periodo AND conductor_id IS NOT NULL').all({ periodo }))
      .map(f => String(f.conductor_id))
  );

  const porConductor = new Map();
  for (const v of viajes) {
    const clave = String(v.conductor_id);
    if (yaTienen.has(clave)) continue;
    const acumulado = porConductor.get(clave) || { conductor_id: v.conductor_id, viajes: 0, km: 0, primera: v.fecha, ultima: v.fecha };
    acumulado.viajes += 1;
    acumulado.km += numero(v.km_recorridos);
    if (String(v.fecha) < String(acumulado.primera)) acumulado.primera = v.fecha;
    if (String(v.fecha) > String(acumulado.ultima)) acumulado.ultima = v.fecha;
    porConductor.set(clave, acumulado);
  }

  let creadas = 0;
  for (const acumulado of porConductor.values()) {
    const km = Math.round(acumulado.km * 10) / 10;
    const base = tipo === 'POR_KM' ? km : 0;
    const monto = montoComision(tipo, base, valorCalculo);
    if (monto <= 0) continue;
    await guardarComision(null, {
      conductor_id: acumulado.conductor_id,
      fecha: acumulado.ultima,
      periodo,
      concepto: tipo === 'POR_KM'
        ? `Comisión por ${km} km en ${acumulado.viajes} viaje(s)`
        : `Comisión fija por ${acumulado.viajes} viaje(s)`,
      tipo,
      base_calculo: base,
      valor_calculo: valorCalculo,
      monto,
      estado: 'PENDIENTE',
      observacion: `Generada desde Bitácora (${desde} a ${hasta})`
    });
    creadas += 1;
  }

  const conductoresConViajes = new Set(viajes.map(v => String(v.conductor_id)));
  return {
    ok: true,
    periodo,
    desde,
    hasta,
    tipo,
    valor_calculo: valorCalculo,
    viajes: viajes.length,
    creadas,
    omitidas: [...conductoresConViajes].filter(c => yaTienen.has(c)).length
  };
}


// ---------------------------------------------------------------- dashboard

// Serie mensual para el gráfico del dashboard: ingresos y egresos agrupados por
// mes. El mes se arma con substr(cast(fecha as text),1,7) porque funciona igual
// en SQLite (texto) y en PostgreSQL (date), donde un cast directo no serviría.
async function serieMensual(db, tabla, desde, hasta) {
  const mes = 'substr(cast(fecha as text),1,7)';
  return await db.prepare(`
    SELECT ${mes} AS mes, COALESCE(SUM(monto),0) AS total, COUNT(*) AS cantidad
    FROM ${tabla}
    WHERE date(fecha) >= date(@desde) AND date(fecha) <= date(@hasta)
    GROUP BY ${mes}
    ORDER BY ${mes}`).all({ desde, hasta });
}

// Rango de los N meses que cierran en el mes actual: desde el día 1 del mes
// (N-1 meses atrás) hasta el último día de este mes. Alimenta el filtro por
// período y el rango del gráfico.
function rangoDeMeses(aniosAtras) {
  const hoy = new Date();
  const fin = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0);
  const inicio = new Date(hoy.getFullYear(), hoy.getMonth() - aniosAtras + 1, 1);
  return {
    desde: inicio.toISOString().slice(0, 10),
    hasta: fin.toISOString().slice(0, 10)
  };
}

// Tableau de mando del período elegido. Trae en una sola respuesta todo lo que
// la pantalla necesita: totales del período y del anterior (para la variación),
// serie mensual (para el gráfico), desglose por categoría, indicadores
// operativos y los pendientes que exigen atención.
async function resumenDashboard(_, f = {}) {
  const db = obtenerDB();
  // Por defecto, el mes en curso.
  let desde = texto(f.desde);
  let hasta = texto(f.hasta);
  if (!desde || !hasta) {
    const r = rangoDeMeses(1);
    desde = r.desde;
    hasta = r.hasta;
  }

  // Período anterior de la misma duración: la base de la comparación.
  const dias = Math.max(1, Math.round((new Date(hasta) - new Date(desde)) / 86400000) + 1);
  const finAnterior = new Date(new Date(desde).getTime() - 86400000);
  const inicioAnterior = new Date(finAnterior.getTime() - (dias - 1) * 86400000);
  const previo = {
    desde: inicioAnterior.toISOString().slice(0, 10),
    hasta: finAnterior.toISOString().slice(0, 10)
  };

  // Meses para el gráfico: seis hacia atrás desde el mes de "hasta".
  const finMes = new Date(hasta);
  const serie = {
    desde: new Date(finMes.getFullYear(), finMes.getMonth() - 5, 1).toISOString().slice(0, 10),
    hasta: new Date(finMes.getFullYear(), finMes.getMonth() + 1, 0).toISOString().slice(0, 10)
  };

  const [ingresosP, egresosP, ingresosAnt, egresosAnt, serieIng, serieEgr] = await Promise.all([
    resumenFinanciero('ingresos', { desde, hasta }),
    resumenFinanciero('egresos', { desde, hasta }),
    resumenFinanciero('ingresos', previo),
    resumenFinanciero('egresos', previo),
    serieMensual(db, 'ingresos', serie.desde, serie.hasta),
    serieMensual(db, 'egresos', serie.desde, serie.hasta)
  ]);

  // En PostgreSQL un COALESCE(SUM(...),0) sobre una tabla vacía puede llegar
  // como null y COUNT(*) como texto, así que todo se pasa por numero(): si no,
  // la utilidad del dashboard salía como NaN.
  const total = async (sql, p) => numero((await db.prepare(sql).get(p)).total);

  // Costos del período que no pasan por la tabla de egresos: planilla,
  // combustible y viáticos. Son costo real aunque estén en otras tablas.
  const [planilla, combustible, viaticos, viaticosPendientes] = await Promise.all([
    total(
      `SELECT COALESCE(SUM(total_neto),0) total FROM planillas
       WHERE date(COALESCE(fecha_pago, created_at)) >= date(@desde)
         AND date(COALESCE(fecha_pago, created_at)) <= date(@hasta)`, { desde, hasta }),
    total(
      `SELECT COALESCE(SUM(total),0) total FROM combustible
       WHERE date(fecha) >= date(@desde) AND date(fecha) <= date(@hasta)`, { desde, hasta }),
    total(
      `SELECT COALESCE(SUM(monto),0) total FROM viaticos
       WHERE date(fecha) >= date(@desde) AND date(fecha) <= date(@hasta)`, { desde, hasta }),
    // Los viáticos sin liquidar son deuda con el conductor: se acumulan entre
    // períodos, así que se cuentan todos, no solo los del mes.
    total('SELECT COALESCE(SUM(monto),0) total FROM viaticos WHERE liquidado = 0', {})
  ]);

  // Operación del período y de la flota actual.
  const [viajes, km, unidades, conductores, enCurso] = await Promise.all([
    total(`SELECT COUNT(*) total FROM bitacora_viajes
           WHERE date(fecha) >= date(@desde) AND date(fecha) <= date(@hasta)`, { desde, hasta }),
    total(`SELECT COALESCE(SUM(km_recorridos),0) total FROM bitacora_viajes
           WHERE date(fecha) >= date(@desde) AND date(fecha) <= date(@hasta)`, { desde, hasta }),
    total('SELECT COUNT(*) total FROM vehiculos WHERE activo = 1', {}),
    total('SELECT COUNT(*) total FROM conductores WHERE activo = 1', {}),
    total("SELECT COUNT(*) total FROM bitacora_viajes WHERE estado = 'EN CURSO'", {})
  ]);

  // La serie se arma en memoria porque el gráfico quiere una barra por mes
  // aunque ese mes no tenga movimientos (barra en cero, no un mes que falta).
  const porMes = new Map();
  for (const f2 of serieIng) porMes.set(f2.mes, { mes: f2.mes, ingresos: Number(f2.total) || 0, egresos: 0 });
  for (const f2 of serieEgr) {
    const fila = porMes.get(f2.mes) || { mes: f2.mes, ingresos: 0, egresos: 0 };
    fila.egresos = Number(f2.total) || 0;
    porMes.set(f2.mes, fila);
  }

  const totalIngresos = numero(ingresosP.total);
  const totalEgresos = numero(egresosP.total);
  const costosOperativos = planilla + combustible + viaticos;
  const utilidad = totalIngresos - totalEgresos - costosOperativos;

  return {
    rango: { desde, hasta, previo },
    financiero: {
      ingresos: totalIngresos,
      egresos: totalEgresos,
      planilla,
      combustible,
      viaticos,
      costosOperativos,
      utilidad,
      margen: totalIngresos > 0 ? utilidad / totalIngresos : 0,
      anterior: { ingresos: numero(ingresosAnt.total), egresos: numero(egresosAnt.total) },
      porCategoriaIngresos: (ingresosP.porCategoria || []).map(c => ({ categoria: c.categoria, total: numero(c.total), cantidad: numero(c.cantidad) })),
      porCategoriaEgresos: (egresosP.porCategoria || []).map(c => ({ categoria: c.categoria, total: numero(c.total), cantidad: numero(c.cantidad) })),
      movimientos: numero(ingresosP.cantidad) + numero(egresosP.cantidad)
    },
    serie: [...porMes.values()].sort((a, b) => (a.mes < b.mes ? -1 : 1)),
    operativo: { viajes, viajesEnCurso: enCurso, km, unidades, conductores },
    pendientes: { viaticos: viaticosPendientes }
  };
}
async function listarPlanillas(_, f = {}) {
  const db = obtenerDB();
  const condiciones = ['1=1'];
  const p = {};
  filtroFechas(condiciones, p, f, 'COALESCE(p.fecha_pago, p.created_at)');
  if (texto(f.estado)) { condiciones.push('p.estado=@estado'); p.estado = texto(f.estado); }
  if (texto(f.busqueda)) {
    condiciones.push('(p.periodo LIKE @q OR p.observacion LIKE @q)');
    p.q = `%${texto(f.busqueda)}%`;
  }
  // LEFT JOIN + GROUP BY en lugar de una subconsulta correlacionada: es
  // equivalente en PostgreSQL y ademas funciona en el motor en memoria de las
  // pruebas, que no resuelve el alias de la subconsulta externa.
  return await db.prepare(`
    SELECT p.*, COUNT(d.id) AS empleados
    FROM planillas p
    LEFT JOIN planilla_detalle d ON d.planilla_id = p.id
    WHERE ${condiciones.join(' AND ')}
    GROUP BY p.id
    ORDER BY date(COALESCE(p.fecha_pago, p.created_at)) DESC, p.id DESC`).all(p);
}

async function obtenerPlanilla(_, id) {
  const db = obtenerDB();
  const cabecera = await db.prepare('SELECT * FROM planillas WHERE id=?').get(id);
  if (!cabecera) throw new Error('La planilla solicitada no existe.');
  const detalle = await db.prepare(`
    SELECT d.*, e.nombre AS empleado_nombre, e.cargo AS empleado_cargo, e.codigo AS empleado_codigo
    FROM planilla_detalle d
    LEFT JOIN empleados e ON e.id = d.empleado_id
    WHERE d.planilla_id = ?
    ORDER BY e.nombre`).all(id);
  return { ...cabecera, detalle };
}

function calcularFila(fila) {
  const salario = numero(fila.salario);
  const horasExtra = numero(fila.horas_extra);
  const bonificaciones = numero(fila.bonificaciones);
  const deducciones = numero(fila.deducciones);
  return {
    empleado_id: entero(fila.empleado_id),
    salario,
    horas_extra: horasExtra,
    bonificaciones,
    deducciones,
    bruto: salario + horasExtra + bonificaciones,
    neto: salario + horasExtra + bonificaciones - deducciones
  };
}

// Guarda (crea o actualiza) una planilla con su detalle completo.
async function guardarPlanilla(_, d) {
  const db = obtenerDB();
  let idPlanilla = entero(d.id);
  await db.transaction(async () => {
    if (idPlanilla) {
      await db.prepare('UPDATE planillas SET periodo=?, fecha_pago=?, observacion=?, estado=? WHERE id=?')
        .run(texto(d.periodo), texto(d.fecha_pago), texto(d.observacion), texto(d.estado) || 'BORRADOR', idPlanilla);
    } else {
      const res = await db.prepare('INSERT INTO planillas (periodo, fecha_pago, observacion, estado) VALUES (?, ?, ?, ?)')
        .run(texto(d.periodo), texto(d.fecha_pago), texto(d.observacion), texto(d.estado) || 'BORRADOR');
      idPlanilla = res.lastInsertRowid;
    }

    await db.prepare('DELETE FROM planilla_detalle WHERE planilla_id=?').run(idPlanilla);
    const insertar = await db.prepare('INSERT INTO planilla_detalle (planilla_id, empleado_id, salario, horas_extra, bonificaciones, deducciones, neto) VALUES (?, ?, ?, ?, ?, ?, ?)');
    let bruto = 0, deducciones = 0, neto = 0;
    (d.detalle || []).forEach(fila => {
      const c = calcularFila(fila);
      if (!c.empleado_id) return;
      insertar.run(idPlanilla, c.empleado_id, c.salario, c.horas_extra, c.bonificaciones, c.deducciones, c.neto);
      bruto += c.bruto;
      deducciones += c.deducciones;
      neto += c.neto;
    });

    await db.prepare('UPDATE planillas SET total_bruto=?, total_deducciones=?, total_neto=? WHERE id=?')
      .run(bruto, deducciones, neto, idPlanilla);
  })();
  await registrarAuditoria('planilla', d.id ? 'ACTUALIZAR' : 'CREAR', idPlanilla, `Planilla ${d.periodo || ''} guardada`);
  return { ok: true, id: idPlanilla };
}

// Genera una planilla tomando el salario base de los empleados activos.
async function generarPlanilla(_, d) {
  const db = obtenerDB();
  const condicion = booleano(d.incluirInactivos) ? '' : 'WHERE activo=1';
  const empleados = await db.prepare(`SELECT * FROM empleados ${condicion} ORDER BY nombre`).all();
  if (!empleados.length) {
    throw new Error('No hay empleados registrados para generar la planilla.');
  }
  const detalle = empleados.map(e => ({
    empleado_id: e.id,
    salario: e.salario_base,
    horas_extra: 0,
    bonificaciones: 0,
    deducciones: 0
  }));
  const result = await guardarPlanilla(null, {
    periodo: d.periodo,
    fecha_pago: d.fecha_pago,
    observacion: d.observacion,
    estado: 'BORRADOR',
    detalle
  });
  return { ...result, empleados: detalle.length };
}

async function pagarPlanilla(_, id) {
  const db = obtenerDB();
  await db.prepare("UPDATE planillas SET estado='PAGADA', fecha_pago=COALESCE(fecha_pago, date('now')) WHERE id=?").run(id);
  await registrarAuditoria('planilla', 'PAGAR', id, 'Planilla marcada como pagada');
  return { ok: true, id };
}

async function eliminarPlanilla(_, id) {
  const db = obtenerDB();
  await db.transaction(async () => {
    await db.prepare('DELETE FROM planilla_detalle WHERE planilla_id=?').run(id);
    await db.prepare('DELETE FROM planillas WHERE id=?').run(id);
  })();
  await registrarAuditoria('planilla', 'ELIMINAR', id, 'Planilla eliminada');
  return { ok: true };
}

// Sugiere el período del mes en curso (formato AAAA-MM) para prellenar el formulario.
function sugerenciaPeriodo() {
  const hoy = new Date();
  const anio = hoy.getFullYear();
  const mes = String(hoy.getMonth() + 1).padStart(2, '0');
  const ultimoDia = new Date(anio, hoy.getMonth() + 1, 0).getDate();
  return {
    periodo: `${anio}-${mes}`,
    desde: `${anio}-${mes}-01`,
    hasta: `${anio}-${mes}-${String(ultimoDia).padStart(2, '0')}`
  };
}


// ---------------------------------------------------------------- sistema / base de datos

async function informacionBaseDatos() {
  const info = await estadisticas();
  const db = obtenerDB();
  info.empresa = await db.prepare('SELECT nombre_empresa, moneda, simbolo FROM configuracion WHERE id=1').get();
  return info;
}

async function cargarDatosDeEjemplo() {
  const resultado = await cargarDatosEjemplo();
  await registrarAuditoria('sistema', 'DATOS_EJEMPLO', null, JSON.stringify(resultado.insertados));
  return resultado;
}

async function limpiarBaseDatos(_, alcance) {
  const resultado = await limpiarDatos(alcance === 'total' ? 'total' : 'operativo');
  await registrarAuditoria('sistema', 'LIMPIAR', null, `Datos borrados (alcance ${resultado.alcance})`);
  return resultado;
}

async function respaldar() {
  const resultado = await respaldarBaseDatos();
  await registrarAuditoria('sistema', 'RESPALDO', null, path.basename(resultado.archivo));
  return resultado;
}

async function abrirCarpetaDatos() {
  const { shell } = require('electron');
  const carpeta = path.dirname(obtenerRutaBaseDatos());
  shell.openPath(carpeta);
  return { ok: true, carpeta };
}

async function listarAuditoria(_, f = {}) {
  const db = obtenerDB();
  const limite = entero(f.limite) || 100;
  let sql = 'SELECT * FROM movimientos_auditoria WHERE 1=1';
  const p = {};
  if (texto(f.modulo)) { sql += ' AND modulo=@modulo'; p.modulo = texto(f.modulo); }
  return await db.prepare(sql + ' ORDER BY id DESC LIMIT @limite').all({ ...p, limite });
}

// ---------------------------------------------------------------- reportes en PDF e imágenes
// Genera un documento PDF real (no el "imprimir" básico del navegador) a partir
// de un HTML ya armado en el renderer: se carga en una ventana oculta, se
// convierte a PDF con el motor de Chromium y se deja elegir dónde guardarlo.
async function generarPdfDesdeHtml(_, { html, nombreSugerido } = {}) {
  if (!texto(html)) throw new Error('No hay contenido para generar el PDF.');
  const rutaTemporal = path.join(os.tmpdir(), `reporte-smarttranspro-${Date.now()}.html`);
  await fsp.writeFile(rutaTemporal, html, 'utf8');
  const ventana = new BrowserWindow({ show: false, webPreferences: { offscreen: true } });
  try {
    await ventana.loadFile(rutaTemporal);
    const buffer = await ventana.webContents.printToPDF({
      printBackground: true,
      preferCSSPageSize: true,
      margins: { top: 0, bottom: 0, left: 0, right: 0 },
      displayHeaderFooter: true,
      headerTemplate: '<span></span>',
      footerTemplate: '<div style="width:100%;font-size:8px;color:#98a2b3;text-align:center;font-family:Arial,Helvetica,sans-serif;">Página <span class="pageNumber"></span> de <span class="totalPages"></span></div>'
    });
    const { canceled, filePath } = await dialog.showSaveDialog({
      title: 'Guardar reporte en PDF',
      defaultPath: `${nombreSugerido || 'reporte'}.pdf`,
      filters: [{ name: 'Documento PDF', extensions: ['pdf'] }]
    });
    if (canceled || !filePath) return { ok: false, cancelado: true };
    await fsp.writeFile(filePath, buffer);
    shell.openPath(filePath);
    return { ok: true, archivo: filePath };
  } finally {
    ventana.destroy();
    fsp.unlink(rutaTemporal).catch(() => {});
  }
}

// Convierte un "data:image/xxx;base64,..." a { extension, buffer }; null si no es válido.
function decodificarImagenDataUrl(dataUrl) {
  const m = /^data:image\/([a-zA-Z0-9.+-]+);base64,(.+)$/.exec(String(dataUrl || ''));
  if (!m) return null;
  return { extension: m[1].toLowerCase() === 'jpeg' ? 'jpg' : m[1].toLowerCase(), buffer: Buffer.from(m[2], 'base64') };
}

// Descarga un único documento del conductor (elige archivo destino exacto).
async function guardarImagenDataUrl(_, { dataUrl, nombreSugerido } = {}) {
  const imagen = decodificarImagenDataUrl(dataUrl);
  if (!imagen) throw new Error('Ese documento no tiene una imagen válida para descargar.');
  const { canceled, filePath } = await dialog.showSaveDialog({
    title: 'Guardar documento',
    defaultPath: `${nombreSugerido || 'documento'}.${imagen.extension}`,
    filters: [{ name: 'Imagen', extensions: [imagen.extension] }]
  });
  if (canceled || !filePath) return { ok: false, cancelado: true };
  await fsp.writeFile(filePath, imagen.buffer);
  shell.showItemInFolder(filePath);
  return { ok: true, archivo: filePath };
}

// Descarga varios documentos a la vez (ej. los 3 de la ficha del conductor)
// en una carpeta que el usuario elige.
async function guardarImagenesEnCarpeta(_, { archivos = [], tituloCarpeta } = {}) {
  const validos = (archivos || [])
    .map(a => ({ nombre: a && a.nombre, imagen: a && decodificarImagenDataUrl(a.dataUrl) }))
    .filter(a => a.imagen);
  if (!validos.length) throw new Error('No hay documentos disponibles para descargar.');
  const { canceled, filePaths } = await dialog.showOpenDialog({
    title: tituloCarpeta || 'Elegir carpeta destino',
    properties: ['openDirectory', 'createDirectory']
  });
  if (canceled || !filePaths || !filePaths.length) return { ok: false, cancelado: true };
  const carpeta = filePaths[0];
  const guardados = [];
  for (const { nombre, imagen } of validos) {
    const base = String(nombre || 'documento').trim().replace(/[\\/:*?"<>|]/g, '-') || 'documento';
    const archivo = path.join(carpeta, `${base}.${imagen.extension}`);
    await fsp.writeFile(archivo, imagen.buffer);
    guardados.push(path.basename(archivo));
  }
  shell.openPath(carpeta);
  return { ok: true, carpeta, guardados };
}

// ---------------------------------------------------------------- usuarios y acceso

// Verifica el token recibido y devuelve la fila completa del usuario.
// Lanza un error si el token no existe, ya venció, o si el usuario fue
// desactivado después de iniciar sesión (p. ej. desde el módulo Usuarios).
async function usuarioDesdeToken(token) {
  if (!token) throw new Error('Debe iniciar sesión para usar esta función.');
  const db = obtenerDB();
  const fila = await db.prepare(
    `SELECT u.*, s.expira_en_ms FROM sesiones s
     JOIN usuarios u ON u.id = s.usuario_id
     WHERE s.token_hash = @token`
  ).get({ token: hashToken(token) });
  if (!fila) throw new Error('La sesión no es válida.');
  if (Number(fila.expira_en_ms) < Date.now()) {
    await borrarSesion(token);
    throw new Error('La sesión expiró. Inicie sesión nuevamente.');
  }
  if (Number(fila.activo) !== 1) {
    await db.prepare('DELETE FROM sesiones WHERE usuario_id = ?').run(fila.id);
    throw new Error('El usuario está inactivo. Comuníquese con el administrador.');
  }
  return fila;
}

// Exige rol ADMIN: protege el módulo Usuarios y las acciones sensibles.
async function exigirAdmin(token) {
  const usuario = await usuarioDesdeToken(token);
  if (!esAdmin(usuario.rol)) {
    throw new Error('Solo un administrador puede realizar esta acción.');
  }
  return usuario;
}

// Elimina la fila de la sesión. Se separa para que cerrarSesionUsuario y la
// verificación del token compartan exactamente el mismo borrado.
async function borrarSesion(token) {
  if (!token) return { ok: true };
  const db = obtenerDB();
  await db.prepare('DELETE FROM sesiones WHERE token_hash = ?').run(hashToken(token));
  return { ok: true };
}

async function listarUsuarios(_, f = {}) {
  await exigirAdmin(f.token);
  const db = obtenerDB();
  const condiciones = ['1=1'];
  const p = {};
  if (texto(f.busqueda)) {
    condiciones.push('(nombre LIKE @q OR usuario LIKE @q OR email LIKE @q)');
    p.q = `%${texto(f.busqueda)}%`;
  }
  if (texto(f.rol)) { condiciones.push('rol = @rol'); p.rol = normalizarRol(f.rol); }
  if (f.soloActivos) condiciones.push('activo = 1');
  const filas = await db.prepare(
    `SELECT * FROM usuarios WHERE ${condiciones.join(' AND ')} ORDER BY activo DESC, nombre`
  ).all(p);
  return filas.map(usuarioPublico);
}

// Totales del módulo: tarjetas de resumen de la pantalla de Usuarios.
async function resumenUsuarios(_, f = {}) {
  await exigirAdmin(f.token);
  const db = obtenerDB();
  const total = (await db.prepare('SELECT COUNT(*) total FROM usuarios').get()).total;
  const activos = (await db.prepare('SELECT COUNT(*) total FROM usuarios WHERE activo = 1').get()).total;
  const porRol = await db.prepare('SELECT rol, COUNT(*) total FROM usuarios WHERE activo = 1 GROUP BY rol ORDER BY rol').all();
  const pendientesCambio = (await db.prepare('SELECT COUNT(*) total FROM usuarios WHERE debe_cambiar_clave = 1').get()).total;
  return { total, activos, inactivos: total - activos, porRol, pendientesCambio };
}

// Cuenta cuántas cuentas ADMIN activas hay, opcionalmente excluyendo una.
// Con esto se impide dejar el sistema sin nadie que pueda volver a entrar.
async function adminsActivos(exceptoId) {
  const db = obtenerDB();
  return (await db.prepare(
    'SELECT COUNT(*) total FROM usuarios WHERE rol = \'ADMIN\' AND activo = 1 AND id <> ?'
  ).get(exceptoId || 0)).total;
}

// Alta y edición de un usuario. Si no llega "clave" en una edición, se conserva
// la actual: así se cambia el rol o se desactiva sin volver a escribirla.
async function guardarUsuario(_, d = {}) {
  await exigirAdmin(d.token);
  const db = obtenerDB();
  const nombreUsuario = texto(d.usuario);
  const nombre = texto(d.nombre);
  const rol = normalizarRol(d.rol);
  const email = texto(d.email);
  const activo = booleano(d.activo !== undefined ? d.activo : 1);
  const debeCambiar = booleano(d.debe_cambiar_clave);

  if (!nombreUsuario) throw new Error('El nombre de usuario es obligatorio.');
  const problemas = problemasUsuario({ usuario: nombreUsuario, nombre, email });
  if (problemas.length) throw new Error(problemas[0]);

  // El nombre de usuario debe ser único: se avisa con un mensaje claro en vez
  // de dejar que la base devuelva un error de restricción.
  const repetido = await db.prepare('SELECT id FROM usuarios WHERE usuario = @usuario AND id <> @id')
    .get({ usuario: nombreUsuario, id: d.id || 0 });
  if (repetido) throw new Error(`El usuario "${nombreUsuario}" ya está registrado.`);

  if (d.id) {
    const antes = await db.prepare('SELECT * FROM usuarios WHERE id = ?').get(d.id);
    if (!antes) throw new Error('El usuario que intenta modificar ya no existe.');
    // Quitarle el rol ADMIN o desactivar a un administrador deja al sistema
    // sin administrador si era el único.
    if (antes.rol === 'ADMIN' && Number(antes.activo) === 1 && (rol !== 'ADMIN' || activo === 0)) {
      if (!(await adminsActivos(d.id))) {
        throw new Error('No se puede modificar al único administrador activo del sistema.');
      }
    }
    const clave = texto(d.clave);
    if (clave) {
      const problema = problemaClave(clave);
      if (problema) throw new Error(problema);
      const { salt, hash } = crearHashClave(clave);
      await db.prepare(
        `UPDATE usuarios SET usuario=@usuario, nombre=@nombre, email=@email, rol=@rol,
         activo=@activo, debe_cambiar_clave=@debe_cambiar, clave_hash=@hash, clave_salt=@salt
         WHERE id=@id`
      ).run({ usuario: nombreUsuario, nombre, email, rol, activo, debe_cambiar: debeCambiar, hash, salt, id: d.id });
    } else {
      await db.prepare(
        `UPDATE usuarios SET usuario=@usuario, nombre=@nombre, email=@email, rol=@rol,
         activo=@activo, debe_cambiar_clave=@debe_cambiar WHERE id=@id`
      ).run({ usuario: nombreUsuario, nombre, email, rol, activo, debe_cambiar: debeCambiar, id: d.id });
    }
    // Si se desactivó o se estableció otra contraseña, sus sesiones abiertas dejan de servir.
    if (activo === 0 || texto(d.clave)) await db.prepare('DELETE FROM sesiones WHERE usuario_id = ?').run(d.id);
    await registrarAuditoria('usuarios', 'ACTUALIZAR', d.id, `Usuario actualizado: ${nombreUsuario}`);
    const guardado = await db.prepare('SELECT * FROM usuarios WHERE id = ?').get(d.id);
    return { ok: true, id: d.id, usuario: usuarioPublico(guardado) };
  }

  const problema = problemaClave(d.clave);
  if (problema) throw new Error(problema);
  const { salt, hash } = crearHashClave(d.clave);
  const res = await db.prepare(
    `INSERT INTO usuarios (usuario, nombre, email, rol, clave_hash, clave_salt, debe_cambiar_clave, activo)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(nombreUsuario, nombre, email, rol, hash, salt, debeCambiar, activo);
  await registrarAuditoria('usuarios', 'CREAR', res.lastInsertRowid, `Usuario creado: ${nombreUsuario} (${rol})`);
  const creado = await db.prepare('SELECT * FROM usuarios WHERE id = ?').get(res.lastInsertRowid);
  return { ok: true, id: res.lastInsertRowid, usuario: usuarioPublico(creado) };
}

async function eliminarUsuario(_, d = {}) {
  await exigirAdmin(d.token);
  const id = d && d.id !== undefined ? d.id : d;
  const db = obtenerDB();
  const usuario = await db.prepare('SELECT * FROM usuarios WHERE id = ?').get(id);
  if (!usuario) throw new Error('El usuario que intenta eliminar ya no existe.');
  if (usuario.rol === 'ADMIN' && Number(usuario.activo) === 1 && !(await adminsActivos(id))) {
    throw new Error('No se puede eliminar al único administrador activo del sistema.');
  }
  await db.prepare('DELETE FROM sesiones WHERE usuario_id = ?').run(id);
  await db.prepare('DELETE FROM usuarios WHERE id = ?').run(id);
  await registrarAuditoria('usuarios', 'ELIMINAR', id, `Usuario eliminado: ${usuario.usuario}`);
  return { ok: true };
}

// ---------------------------------------------------------------- instalación

// ¿El sistema ya tiene alguna cuenta? La interfaz lo consulta al abrir para
// decidir entre mostrar el formulario de instalación o el de acceso.
async function estadoInstalacion() {
  const db = obtenerDB();
  return { ok: true, instalado: await baseTieneUsuarios(db) };
}

// Crea la primera cuenta del sistema y abre sesión con ella.
//
// Solo funciona si la tabla "usuarios" está vacía: por eso NO exige token (no
// hay todavía ninguna sesión posible). En cuanto existe una cuenta, el canal
// se cierra, así que no sirve para crear cuentas extra sin autenticarse.
async function instalarSistema(_, d = {}) {
  const db = obtenerDB();

  // Empresa: se guarda la que se escriba en el formulario de instalación.
  const nombreEmpresa = texto(d.nombre_empresa);
  if (nombreEmpresa) {
    await db.prepare('UPDATE configuracion SET nombre_empresa = ?, updated_at = CURRENT_TIMESTAMP WHERE id = 1')
      .run(nombreEmpresa);
  }

  const creado = await crearPrimerUsuario(db, d);
  if (!creado) {
    throw new Error('El sistema ya está configurado. Inicie sesión con su usuario.');
  }

  // Se abre sesión de una vez: el usuario acaba de escribir su contraseña y no
  // tiene sentido pedirla otra vez.
  const token = generarToken();
  const expiraEn = Date.now() + HORAS_SESION * 3600 * 1000;
  await db.prepare('INSERT INTO sesiones (token_hash, usuario_id, expira_en_ms) VALUES (?, ?, ?)')
    .run(hashToken(token), creado.id, expiraEn);
  await db.prepare('UPDATE usuarios SET ultimo_acceso = CURRENT_TIMESTAMP WHERE id = ?').run(creado.id);
  await registrarAuditoria('usuarios', 'INSTALAR', creado.id, `Cuenta creada durante la instalación: ${creado.usuario}`);

  return { ok: true, token, expira_en_ms: expiraEn, usuario: creado };
}

// ---------------------------------------------------------------- autenticación

async function autenticarUsuario(_, d = {}) {
  const db = obtenerDB();
  const nombreUsuario = texto(d.usuario);
  const clave = texto(d.clave);
  // Un mismo mensaje para usuario inexistente y contraseña incorrecta: no se
  // revela qué cuentas existen.
  const credenciales = 'Usuario o contraseña incorrectos.';
  if (!nombreUsuario || !clave) throw new Error(credenciales);

  const usuario = await db.prepare('SELECT * FROM usuarios WHERE usuario = @usuario').get({ usuario: nombreUsuario });
  if (!usuario) throw new Error(credenciales);
  if (!verificarClave(clave, usuario.clave_salt, usuario.clave_hash)) throw new Error(credenciales);
  if (Number(usuario.activo) !== 1) {
    throw new Error('El usuario está inactivo. Comuníquese con el administrador.');
  }

  const token = generarToken();
  const expiraEn = Date.now() + HORAS_SESION * 3600 * 1000;
  await db.prepare('INSERT INTO sesiones (token_hash, usuario_id, expira_en_ms) VALUES (?, ?, ?)')
    .run(hashToken(token), usuario.id, expiraEn);
  await db.prepare('UPDATE usuarios SET ultimo_acceso = CURRENT_TIMESTAMP WHERE id = ?').run(usuario.id);
  await registrarAuditoria('usuarios', 'INGRESO', usuario.id, `Inicio de sesión: ${usuario.usuario}`);

  return { ok: true, token, expira_en_ms: expiraEn, usuario: usuarioPublico(usuario) };
}

// Revalida el token guardado en la interfaz al abrir la aplicación.
async function sesionActual(_, d = {}) {
  const usuario = await usuarioDesdeToken(texto(d.token));
  return { ok: true, usuario: usuarioPublico(usuario) };
}

async function cerrarSesionUsuario(_, d = {}) {
  return await borrarSesion(texto(d.token));
}

// Cambio de contraseña por el propio usuario: exige la actual, para que alguien
// con acceso al equipo ya abierto no se apodere de la cuenta.
async function cambiarClave(_, d = {}) {
  const usuario = await usuarioDesdeToken(texto(d.token));
  const db = obtenerDB();
  const actual = texto(d.clave_actual);
  const nueva = texto(d.clave_nueva);
  if (!verificarClave(actual, usuario.clave_salt, usuario.clave_hash)) {
    throw new Error('La contraseña actual no es correcta.');
  }
  const problema = problemaClave(nueva);
  if (problema) throw new Error(problema);
  if (actual === nueva) throw new Error('La nueva contraseña debe ser distinta de la actual.');

  const { salt, hash } = crearHashClave(nueva);
  await db.prepare('UPDATE usuarios SET clave_hash = ?, clave_salt = ?, debe_cambiar_clave = 0 WHERE id = ?')
    .run(hash, salt, usuario.id);
  await registrarAuditoria('usuarios', 'CAMBIAR_CLAVE', usuario.id, `Cambió su contraseña: ${usuario.usuario}`);
  return { ok: true };
}

// Un ADMIN restablece la contraseña de otra cuenta (usuario olvidado o bloqueado).
async function restablecerClave(_, d = {}) {
  await exigirAdmin(d.token);
  const db = obtenerDB();
  const destino = await db.prepare('SELECT * FROM usuarios WHERE id = ?').get(d.id);
  if (!destino) throw new Error('El usuario al que intenta restablecer la contraseña ya no existe.');
  const problema = problemaClave(d.clave);
  if (problema) throw new Error(problema);
  const { salt, hash } = crearHashClave(d.clave);
  await db.prepare('UPDATE usuarios SET clave_hash = ?, clave_salt = ?, debe_cambiar_clave = 1, activo = 1 WHERE id = ?')
    .run(hash, salt, destino.id);
  // Se cierran las sesiones abiertas: si perdió la clave, también podría estar robada.
  await db.prepare('DELETE FROM sesiones WHERE usuario_id = ?').run(destino.id);
  await registrarAuditoria('usuarios', 'RESTABLECER_CLAVE', destino.id, `Contraseña restablecida: ${destino.usuario}`);
  return { ok: true };
}

// ---------------------------------------------------------------- registro de canales

// ---------------------------------------------------------- monitoreo por GPS
// Cada conductor puede tener UN teléfono vinculado. La oficina genera un enlace
// con una clave; el teléfono abre rastreo.html (o una app como Traccar Client) y
// envía su posición. En la base solo se guarda el HASH de la clave, y la clave
// nunca viaja en las consultas de lectura.
const MIN_EN_LINEA = 3;
const MIN_DEMORADO = 15;
const DIAS_HISTORIAL_GPS = 14;

const esVerdadero = (v) => v === true || Number(v) === 1;
const aNumeroONulo = (v) => (v === null || v === undefined || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));
const limitar = (v, min, max) => { const n = aNumeroONulo(v); return n === null ? null : Math.min(max, Math.max(min, n)); };

function estadoDeSenal(ultimoReporte, vinculado) {
  if (!vinculado) return 'SIN_VINCULAR';
  const t = ultimoReporte ? new Date(ultimoReporte).getTime() : NaN;
  if (!Number.isFinite(t)) return 'SIN_SENAL';
  const min = (Date.now() - t) / 60000;
  return min <= MIN_EN_LINEA ? 'EN_LINEA' : min <= MIN_DEMORADO ? 'DEMORADO' : 'SIN_SENAL';
}

// Cualquier usuario con sesión puede consultar; vincular/desvincular exige poder operar.
async function exigirSesionMonitoreo(token, escritura = false) {
  const usuario = await usuarioDesdeToken(token);
  if (escritura && normalizarRol(usuario.rol) === 'CONSULTA') throw new Error('Su rol solo permite consultar. Pida a un operador o administrador que lo haga.');
  return usuario;
}

async function listarMonitoreo(_, d = {}) {
  await exigirSesionMonitoreo(d.token);
  const db = obtenerDB();
  const filas = await db.prepare(
    `SELECT c.id AS conductor_id, c.nombre, g.id AS dispositivo_id, g.activo AS vinculado, g.vehiculo_id, v.placa,
            g.lat, g.lng, g.precision_m, g.velocidad_kmh, g.rumbo, g.bateria, g.ultimo_reporte
     FROM conductores c
     LEFT JOIN dispositivos_gps g ON g.conductor_id = c.id
     LEFT JOIN vehiculos v ON v.id = g.vehiculo_id
     WHERE c.activo = 1 ORDER BY c.nombre`
  ).all();
  // Viaje en curso de cada conductor (el más reciente gana): da contexto al punto del mapa.
  const viajes = await db.prepare("SELECT id, conductor_id, destino FROM bitacora_viajes WHERE estado = 'EN CURSO' AND conductor_id IS NOT NULL ORDER BY id").all();
  const destinoPor = {};
  for (const v of viajes) destinoPor[v.conductor_id] = v.destino;
  const resumen = { vinculados: 0, en_linea: 0, demorados: 0, sin_senal: 0, sin_vincular: 0 };
  const conductores = filas.map((f) => {
    const vinculado = f.dispositivo_id !== null && f.dispositivo_id !== undefined && esVerdadero(f.vinculado);
    const estado = estadoDeSenal(f.ultimo_reporte, vinculado);
    if (vinculado) resumen.vinculados++;
    if (estado === 'EN_LINEA') resumen.en_linea++;
    else if (estado === 'DEMORADO') resumen.demorados++;
    else if (estado === 'SIN_SENAL') resumen.sin_senal++;
    else resumen.sin_vincular++;
    return {
      conductor_id: Number(f.conductor_id), nombre: f.nombre, vinculado, estado,
      vehiculo_id: f.vehiculo_id === null || f.vehiculo_id === undefined ? null : Number(f.vehiculo_id), placa: f.placa || null,
      lat: aNumeroONulo(f.lat), lng: aNumeroONulo(f.lng), precision_m: aNumeroONulo(f.precision_m),
      velocidad_kmh: aNumeroONulo(f.velocidad_kmh), rumbo: aNumeroONulo(f.rumbo), bateria: aNumeroONulo(f.bateria),
      ultimo_reporte: f.ultimo_reporte || null, destino: destinoPor[f.conductor_id] || null
    };
  });
  return { ahora: new Date().toISOString(), resumen, conductores };
}

async function vincularDispositivo(_, d = {}) {
  await exigirSesionMonitoreo(d.token, true);
  const db = obtenerDB();
  const conductorId = entero(d.conductor_id);
  if (!conductorId) throw new Error('Seleccione un conductor.');
  const conductor = await db.prepare('SELECT id, nombre FROM conductores WHERE id = ? AND activo = 1').get(conductorId);
  if (!conductor) throw new Error('El conductor no existe o está inactivo.');
  const vehiculoId = entero(d.vehiculo_id);
  const clave = generarClaveDispositivo();
  const hash = hashToken(clave);
  const existente = await db.prepare('SELECT id FROM dispositivos_gps WHERE conductor_id = ?').get(conductorId);
  // Regenerar el enlace invalida el teléfono anterior y limpia su última posición.
  if (existente) {
    await db.prepare('UPDATE dispositivos_gps SET token_hash = ?, vehiculo_id = ?, activo = 1, lat = NULL, lng = NULL, precision_m = NULL, velocidad_kmh = NULL, rumbo = NULL, bateria = NULL, ultimo_reporte = NULL WHERE id = ?').run(hash, vehiculoId, existente.id);
  } else {
    await db.prepare('INSERT INTO dispositivos_gps (conductor_id, vehiculo_id, token_hash) VALUES (?, ?, ?)').run(conductorId, vehiculoId, hash);
  }
  return { ok: true, conductor_id: conductorId, conductor: conductor.nombre, clave };
}

async function desvincularDispositivo(_, d = {}) {
  await exigirSesionMonitoreo(d.token, true);
  const conductorId = entero(d.conductor_id);
  if (!conductorId) throw new Error('Seleccione un conductor.');
  await obtenerDB().prepare('UPDATE dispositivos_gps SET activo = 0 WHERE conductor_id = ?').run(conductorId);
  return { ok: true };
}

// Lo llama el teléfono (sin sesión de usuario): se autentica con la clave del enlace.
// Acepta una posición suelta o { puntos: [...] } para vaciar la cola acumulada sin señal.
async function reportarPosicion(_, d = {}) {
  const clave = texto(d.clave);
  if (!clave || clave.length < 16 || clave.length > 128) throw new Error('Clave de dispositivo inválida.');
  const db = obtenerDB();
  const disp = await db.prepare('SELECT g.id, c.nombre FROM dispositivos_gps g JOIN conductores c ON c.id = g.conductor_id WHERE g.token_hash = ? AND g.activo = 1 AND c.activo = 1').get(hashToken(clave));
  // 200 con "revocado": el teléfono debe dejar de rastrear en vez de reintentar para siempre.
  if (!disp) return { ok: false, revocado: true, error: 'Este teléfono ya no está autorizado. Pida un enlace nuevo a la oficina.' };
  const ahora = Date.now();
  const brutos = Array.isArray(d.puntos) && d.puntos.length ? d.puntos : [d];
  const puntos = [];
  for (const p of brutos.slice(0, 100)) {
    const lat = Number(p.lat), lng = Number(p.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180 || (lat === 0 && lng === 0)) continue;
    let t = aNumeroONulo(p.ts);
    if (t === null || t > ahora + 300000) t = ahora;
    if (t < ahora - 86400000) continue; // más de 24 h de antigüedad: se descarta
    puntos.push({ lat, lng, t, precision: limitar(p.precision, 0, 100000), velocidad: limitar(p.velocidad, 0, 400), rumbo: limitar(p.rumbo, 0, 360), bateria: limitar(p.bateria, 0, 100) });
  }
  if (!puntos.length) throw new Error('No llegó ninguna posición válida.');
  puntos.sort((a, b) => a.t - b.t);
  for (const p of puntos) {
    await db.prepare('INSERT INTO posiciones_gps (dispositivo_id, lat, lng, precision_m, velocidad_kmh, registrado_en) VALUES (?, ?, ?, ?, ?, ?)')
      .run(disp.id, p.lat, p.lng, p.precision, p.velocidad, new Date(p.t).toISOString());
  }
  const u = puntos[puntos.length - 1];
  const iso = new Date(u.t).toISOString();
  // Solo avanza la "última posición": un lote viejo nunca pisa una lectura más reciente.
  await db.prepare('UPDATE dispositivos_gps SET lat = ?, lng = ?, precision_m = ?, velocidad_kmh = ?, rumbo = ?, bateria = COALESCE(?, bateria), ultimo_reporte = ? WHERE id = ? AND (ultimo_reporte IS NULL OR ultimo_reporte <= ?)')
    .run(u.lat, u.lng, u.precision, u.velocidad, u.rumbo, u.bateria, iso, disp.id, iso);
  // Depuración perezosa: 1 de cada 50 reportes borra el historial vencido.
  if (Math.random() < 0.02) await db.prepare('DELETE FROM posiciones_gps WHERE registrado_en < ?').run(new Date(ahora - DIAS_HISTORIAL_GPS * 86400000).toISOString());
  return { ok: true, recibidos: puntos.length, conductor: disp.nombre };
}

// Protocolo OsmAnd (lo usan apps gratuitas como Traccar Client): id, lat, lon, timestamp, speed (nudos), bearing, accuracy, batt.
async function reportarOsmand(_, d = {}) {
  let ts = aNumeroONulo(d.timestamp);
  if (ts !== null) ts = ts < 1e12 ? ts * 1000 : ts;
  else if (d.timestamp) { const f = Date.parse(d.timestamp); ts = Number.isFinite(f) ? f : null; }
  const nudos = aNumeroONulo(d.speed);
  return reportarPosicion(_, { clave: d.id || d.deviceid, lat: d.lat, lng: d.lon !== undefined ? d.lon : d.lng, ts, precision: d.accuracy, velocidad: nudos === null ? null : nudos * 1.852, rumbo: d.bearing !== undefined ? d.bearing : d.heading, bateria: d.batt });
}

async function historialPosiciones(_, d = {}) {
  await exigirSesionMonitoreo(d.token);
  const conductorId = entero(d.conductor_id);
  if (!conductorId) throw new Error('Seleccione un conductor.');
  const horas = Math.min(72, Math.max(1, aNumeroONulo(d.horas) || 12));
  const desde = new Date(Date.now() - horas * 3600000).toISOString();
  const filas = await obtenerDB().prepare(
    'SELECT p.lat, p.lng, p.velocidad_kmh, p.registrado_en FROM posiciones_gps p JOIN dispositivos_gps g ON g.id = p.dispositivo_id WHERE g.conductor_id = ? AND p.registrado_en >= ? ORDER BY p.registrado_en LIMIT 2000'
  ).all(conductorId, desde);
  return { horas, puntos: filas.map((f) => ({ lat: Number(f.lat), lng: Number(f.lng), velocidad_kmh: aNumeroONulo(f.velocidad_kmh), t: f.registrado_en })) };
}

const operaciones = {
  // Empleados
  'empleados:listar': listarEmpleados,
  'empleados:resumen': resumenEmpleados,
  'empleados:guardar': guardarEmpleado,
  'empleados:eliminar': eliminarEmpleado,
  // Ingresos
  'ingresos:listar': listarIngresos,
  'ingresos:guardar': guardarIngreso,
  'ingresos:eliminar': eliminarIngreso,
  'ingresos:resumen': (_, f) => resumenFinanciero('ingresos', f),
  // Egresos
  'egresos:listar': listarEgresos,
  'egresos:guardar': guardarEgreso,
  'egresos:eliminar': eliminarEgreso,
  'egresos:resumen': (_, f) => resumenFinanciero('egresos', f),
  'finanzas:categorias': listarCategorias,
  // Dashboard
  'dashboard:tablero': resumenDashboard,
  // Viáticos
  'viaticos:listar': listarViaticos,
  'viaticos:viajes_disponibles': listarViajesParaViatico,
  'viaticos:guardar': guardarViatico,
  'viaticos:liquidar': liquidarViatico,
  'viaticos:eliminar': eliminarViatico,
  'viaticos:resumen': resumenViaticos,
  // Comisiones
  'comisiones:listar': listarComisiones,
  'comisiones:resumen': resumenComisiones,
  'comisiones:guardar': guardarComision,
  'comisiones:pagar': pagarComision,
  'comisiones:pagar_conductor': pagarComisionesDelConductor,
  'comisiones:eliminar': eliminarComision,
  'comisiones:generar': generarComisiones,
  // Planilla
  'planilla:listar': listarPlanillas,
  'planilla:obtener': obtenerPlanilla,
  'planilla:guardar': guardarPlanilla,
  'planilla:generar': generarPlanilla,
  'planilla:pagar': pagarPlanilla,
  'planilla:eliminar': eliminarPlanilla,
  'planilla:sugerencia': sugerenciaPeriodo,
  // Usuarios, roles y autenticación
  'usuarios:estado_instalacion': estadoInstalacion,
  'usuarios:instalar': instalarSistema,
  'usuarios:listar': listarUsuarios,
  'usuarios:resumen': resumenUsuarios,
  'usuarios:guardar': guardarUsuario,
  'usuarios:eliminar': eliminarUsuario,
  'usuarios:autenticar': autenticarUsuario,
  'usuarios:sesion_actual': sesionActual,
  'usuarios:cerrar_sesion': cerrarSesionUsuario,
  'usuarios:cambiar_clave': cambiarClave,
  'usuarios:restablecer_clave': restablecerClave,
  // Monitoreo por GPS (los dos últimos los llama el teléfono, sin sesión)
  'monitoreo:listar': listarMonitoreo,
  'monitoreo:vincular': vincularDispositivo,
  'monitoreo:desvincular': desvincularDispositivo,
  'monitoreo:historial': historialPosiciones,
  'monitoreo:reportar': reportarPosicion,
  'monitoreo:osmand': reportarOsmand,
  // Base de datos / sistema
  'sistema:info': informacionBaseDatos,
  'sistema:datos_ejemplo': cargarDatosDeEjemplo,
  'sistema:limpiar': limpiarBaseDatos,
  'sistema:respaldo': respaldar,
  'sistema:abrir_carpeta': abrirCarpetaDatos,
  'sistema:auditoria': listarAuditoria,
  // Reportes en PDF y descarga de documentos/imágenes
  'reportes:pdf': generarPdfDesdeHtml,
  'archivos:guardar_imagen': guardarImagenDataUrl,
  'archivos:guardar_imagenes': guardarImagenesEnCarpeta
};

module.exports = { operaciones };

