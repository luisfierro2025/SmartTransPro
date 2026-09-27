const {ipcMain}=require('electron');const {obtenerDB}=require('./database');const {operaciones}=require('./operaciones');
function registrarIPC(){
ipcMain.handle('app:info', async ()=>({nombre:'SmartTransPro',version:'1.0.0'}));
ipcMain.handle('dashboard:resumen', async ()=>{const db=obtenerDB();const suma=async (t,c)=>(await db.prepare(`SELECT COALESCE(SUM(${c}),0) total FROM ${t}`).get()).total;const ingresos=await suma('ingresos','monto'),egresos=await suma('egresos','monto'),planilla=await suma('planillas','total_neto'),combustible=await suma('combustible','total'),viaticos=await suma('viaticos','monto');const viaticosPendientes=(await db.prepare('SELECT COALESCE(SUM(monto),0) total FROM viaticos WHERE liquidado=0').get()).total;const unidadesActivas=(await db.prepare('SELECT COUNT(*) total FROM vehiculos WHERE activo=1').get()).total;const conductoresActivos=(await db.prepare('SELECT COUNT(*) total FROM conductores WHERE activo=1').get()).total;const empleadosActivos=(await db.prepare('SELECT COUNT(*) total FROM empleados WHERE activo=1').get()).total;const clientesActivos=(await db.prepare('SELECT COUNT(*) total FROM clientes WHERE activo=1').get()).total;const viajesEnCurso=(await db.prepare("SELECT COUNT(*) total FROM bitacora_viajes WHERE estado='EN CURSO'").get()).total;const viajesCompletados=(await db.prepare("SELECT COUNT(*) total FROM bitacora_viajes WHERE estado='COMPLETADO'").get()).total;const kmRecorridos=(await db.prepare('SELECT COALESCE(SUM(km_recorridos),0) total FROM bitacora_viajes').get()).total;return{ingresos,egresos,planilla,combustible,viaticos,viaticosPendientes,unidadesActivas,conductoresActivos,empleadosActivos,clientesActivos,viajesEnCurso,viajesCompletados,kmRecorridos,saldo:ingresos-egresos-planilla-combustible-viaticos}});
ipcMain.handle('configuracion:obtener', async ()=>await obtenerDB().prepare('SELECT * FROM configuracion WHERE id=1').get());
ipcMain.handle('configuracion:guardar', async (_,d)=>{const db=obtenerDB();await db.prepare('UPDATE configuracion SET nombre_empresa=?,moneda=?,simbolo=?,logo_empresa=?,updated_at=CURRENT_TIMESTAMP WHERE id=1').run(d.nombre_empresa||'Transporte Fierro',d.moneda||'NIO',d.simbolo||'C$',d.logo_empresa||'');return await db.prepare('SELECT * FROM configuracion WHERE id=1').get()});
ipcMain.handle('reportes:egresos', async (_,f={})=>{const db=obtenerDB();let sql='SELECT * FROM egresos WHERE 1=1',p={};if(f.desde){sql+=' AND date(fecha)>=date(@desde)';p.desde=f.desde}if(f.hasta){sql+=' AND date(fecha)<=date(@hasta)';p.hasta=f.hasta}return await db.prepare(sql+' ORDER BY date(fecha) DESC,id DESC').all(p)});
ipcMain.handle('reportes:combustible', async (_,f={})=>{const db=obtenerDB();let sql='SELECT c.*,v.placa,v.marca,v.modelo,d.nombre conductor FROM combustible c JOIN vehiculos v ON v.id=c.vehiculo_id LEFT JOIN conductores d ON d.id=c.conductor_id WHERE 1=1',p={};if(f.desde){sql+=' AND date(c.fecha)>=date(@desde)';p.desde=f.desde}if(f.hasta){sql+=' AND date(c.fecha)<=date(@hasta)';p.hasta=f.hasta}return await db.prepare(sql+' ORDER BY date(c.fecha) DESC,c.id DESC').all(p)});

// Bitácora de viajes
ipcMain.handle('bitacora:listar', async (_,f={})=>{
  const db=obtenerDB();
  let sql=`SELECT b.*, v.placa as vehiculo_placa, v.marca as vehiculo_marca, v.modelo as vehiculo_modelo,
           c.nombre as conductor_nombre,
           cl.nombre as cliente_nombre_rel
           FROM bitacora_viajes b
           LEFT JOIN vehiculos v ON v.id=b.vehiculo_id
           LEFT JOIN conductores c ON c.id=b.conductor_id
           LEFT JOIN clientes cl ON cl.id=b.cliente_id
           WHERE 1=1`;
  const p={};
  if(f.desde){ sql+=' AND date(b.fecha)>=date(@desde)'; p.desde=String(f.desde).slice(0,10); }
  if(f.hasta){ sql+=' AND date(b.fecha)<=date(@hasta)'; p.hasta=String(f.hasta).slice(0,10); }
  if(f.estado){ sql+=' AND b.estado=@estado'; p.estado=String(f.estado).trim().toUpperCase(); }
  if(f.vehiculo_id){ sql+=' AND b.vehiculo_id=@vehiculo_id'; p.vehiculo_id=Number(f.vehiculo_id); }
  if(f.conductor_id){ sql+=' AND b.conductor_id=@conductor_id'; p.conductor_id=Number(f.conductor_id); }
  if(f.busqueda){
    sql+=' AND (b.origen LIKE @q OR b.lugar_salida LIKE @q OR b.destino LIKE @q OR b.cliente LIKE @q OR cl.nombre LIKE @q OR c.nombre LIKE @q OR v.placa LIKE @q OR b.modulo LIKE @q OR b.observaciones LIKE @q)';
    p.q=`%${f.busqueda}%`;
  }
  return await db.prepare(sql+' ORDER BY date(b.fecha) DESC, b.id DESC').all(p);
});

ipcMain.handle('bitacora:guardar', async (_,d={})=>{
  const db=obtenerDB();
  const fecha = String(d.fecha || '').trim();
  const lugarSalida = String(d.lugar_salida || d.origen || '').trim();
  const origen = String(d.origen || d.lugar_salida || '').trim() || null;
  const destino = String(d.destino || '').trim();
  if(!fecha) throw new Error('La fecha del viaje es obligatoria.');
  if(!lugarSalida) throw new Error('El lugar de salida es obligatorio.');
  if(!destino) throw new Error('El destino es obligatorio.');
  const kmSalida = Math.max(0, Number(d.km_salida) || 0);
  const kmLlegada = Math.max(0, Number(d.km_llegada) || 0);
  if(kmLlegada > 0 && kmLlegada < kmSalida) throw new Error('El Km de llegada no puede ser menor al Km de salida.');

  if(d.id){
    await db.prepare(`UPDATE bitacora_viajes SET 
      fecha=?, vehiculo_id=?, conductor_id=?, cliente_id=?, modulo=?, 
      hora_salida=?, lugar_salida=?, hora_llegada=?, destino=?, hora_salida_destino=?, 
      hora_retorno=?, km_salida=?, km_llegada=?, viatico=?, estadia=?, 
      esteli=?, origen=?, carga_descripcion=?, cliente=?, estado=?, 
      observaciones=? 
      WHERE id=?`).run(
        fecha, d.vehiculo_id ? Number(d.vehiculo_id) : null, d.conductor_id ? Number(d.conductor_id) : null, d.cliente_id ? Number(d.cliente_id) : null, d.modulo ? String(d.modulo).trim() : null,
        d.hora_salida||null, lugarSalida, d.hora_llegada||null, destino, d.hora_salida_destino||null,
        d.hora_retorno||null, kmSalida, kmLlegada, Math.max(0, Number(d.viatico)||0), Math.max(0, Number(d.estadia)||0),
        Math.max(0, Number(d.esteli)||0), origen, d.carga_descripcion ? String(d.carga_descripcion).trim() : null, d.cliente ? String(d.cliente).trim() : null, String(d.estado || 'EN CURSO').trim().toUpperCase(),
        d.observaciones||null,
        d.id
      );
    return { ok: true, id: d.id };
  } else {
    const res = await db.prepare(`INSERT INTO bitacora_viajes 
      (fecha, vehiculo_id, conductor_id, cliente_id, modulo, 
       hora_salida, lugar_salida, hora_llegada, destino, hora_salida_destino, 
       hora_retorno, km_salida, km_llegada, viatico, estadia, 
       esteli, origen, carga_descripcion, cliente, estado, 
       observaciones) 
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
        fecha, d.vehiculo_id ? Number(d.vehiculo_id) : null, d.conductor_id ? Number(d.conductor_id) : null, d.cliente_id ? Number(d.cliente_id) : null, d.modulo ? String(d.modulo).trim() : null,
        d.hora_salida||null, lugarSalida, d.hora_llegada||null, destino, d.hora_salida_destino||null,
        d.hora_retorno||null, kmSalida, kmLlegada, Math.max(0, Number(d.viatico)||0), Math.max(0, Number(d.estadia)||0),
        Math.max(0, Number(d.esteli)||0), origen, d.carga_descripcion ? String(d.carga_descripcion).trim() : null, d.cliente ? String(d.cliente).trim() : null, String(d.estado || 'EN CURSO').trim().toUpperCase(),
        d.observaciones||null
      );
    return { ok: true, id: res.lastInsertRowid };
  }
});

ipcMain.handle('bitacora:obtener', async (_,id)=>{
  const db=obtenerDB();
  return await db.prepare(`SELECT b.*, v.placa as vehiculo_placa, v.marca as vehiculo_marca, v.modelo as vehiculo_modelo,
           c.nombre as conductor_nombre,
           cl.nombre as cliente_nombre_rel
           FROM bitacora_viajes b
           LEFT JOIN vehiculos v ON v.id=b.vehiculo_id
           LEFT JOIN conductores c ON c.id=b.conductor_id
           LEFT JOIN clientes cl ON cl.id=b.cliente_id
           WHERE b.id=@id`).get({id:Number(id)});
});

ipcMain.handle('bitacora:eliminar', async (_,id)=>{
  const db=obtenerDB();
  await db.prepare('DELETE FROM bitacora_viajes WHERE id=?').run(id);
  return { ok: true };
});

ipcMain.handle('bitacora:resumen', async ()=>{
  const db=obtenerDB();
  const totalViajes = (await db.prepare('SELECT count(*) as total FROM bitacora_viajes').get()).total;
  const enCurso = (await db.prepare("SELECT count(*) as total FROM bitacora_viajes WHERE estado='EN CURSO'").get()).total;
  const completados = (await db.prepare("SELECT count(*) as total FROM bitacora_viajes WHERE estado='COMPLETADO'").get()).total;
  const totalKm = (await db.prepare("SELECT COALESCE(SUM(km_recorridos),0) as total FROM bitacora_viajes").get()).total;
  return { totalViajes, enCurso, completados, totalKm };
});

// Vehículos (CRUD completo para Flota)
ipcMain.handle('vehiculos:listar', async (_,filtro={})=>{
  const db=obtenerDB();
  let sql='SELECT * FROM vehiculos WHERE 1=1';
  const p={};
  if(filtro.soloActivos){ sql+=' AND activo=1'; }
  if(filtro.busqueda){
    sql+=' AND (codigo LIKE @q OR placa LIKE @q OR marca LIKE @q OR modelo LIKE @q)';
    p.q=`%${filtro.busqueda}%`;
  }
  return await db.prepare(sql+' ORDER BY codigo, placa').all(p);
});

ipcMain.handle('vehiculos:guardar', async (_,d)=>{
  const db=obtenerDB();
  if(d.id){
    await db.prepare(`UPDATE vehiculos SET codigo=?, placa=?, marca=?, modelo=?, anio=?, activo=? WHERE id=?`)
      .run(d.codigo, d.placa, d.marca, d.modelo, d.anio||null, d.activo!==undefined?d.activo:1, d.id);
    return { ok: true, id: d.id };
  } else {
    const res = await db.prepare(`INSERT INTO vehiculos (codigo, placa, marca, modelo, anio, activo) VALUES (?, ?, ?, ?, ?, ?)`)
      .run(d.codigo, d.placa, d.marca, d.modelo, d.anio||null, d.activo!==undefined?d.activo:1);
    return { ok: true, id: res.lastInsertRowid };
  }
});

ipcMain.handle('vehiculos:eliminar', async (_,id)=>{
  const db=obtenerDB();
  await db.prepare('DELETE FROM vehiculos WHERE id=?').run(id);
  return { ok: true };
});

// Conductores (CRUD completo para Flota)
ipcMain.handle('conductores:listar', async (_,filtro={})=>{
  const db=obtenerDB();
  let sql='SELECT * FROM conductores WHERE 1=1';
  const p={};
  if(filtro.soloActivos){ sql+=' AND activo=1'; }
  if(filtro.busqueda){
    sql+=' AND (nombre LIKE @q OR documento LIKE @q)';
    p.q=`%${filtro.busqueda}%`;
  }
  return await db.prepare(sql+' ORDER BY nombre').all(p);
});

ipcMain.handle('conductores:guardar', async (_,d)=>{
  const db=obtenerDB();
  if(d.id){
    await db.prepare(`UPDATE conductores SET nombre=?, documento=?, numero_licencia=?, licencia_frontal=?, licencia_trasera=?, carnet_federacion=?, activo=? WHERE id=?`)
      .run(d.nombre, d.documento, d.numero_licencia||null, d.licencia_frontal||null, d.licencia_trasera||null, d.carnet_federacion||null, d.activo!==undefined?d.activo:1, d.id);
    return { ok: true, id: d.id };
  } else {
    const res = await db.prepare(`INSERT INTO conductores (nombre, documento, numero_licencia, licencia_frontal, licencia_trasera, carnet_federacion, activo) VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .run(d.nombre, d.documento, d.numero_licencia||null, d.licencia_frontal||null, d.licencia_trasera||null, d.carnet_federacion||null, d.activo!==undefined?d.activo:1);
    return { ok: true, id: res.lastInsertRowid };
  }
});

ipcMain.handle('conductores:eliminar', async (_,id)=>{
  const db=obtenerDB();
  await db.prepare('DELETE FROM conductores WHERE id=?').run(id);
  return { ok: true };
});

// Clientes (CRUD completo)
ipcMain.handle('clientes:listar', async (_,filtro={})=>{
  const db=obtenerDB();
  let sql='SELECT * FROM clientes WHERE 1=1';
  const p={};
  if(filtro.soloActivos){ sql+=' AND activo=1'; }
  if(filtro.busqueda){
    sql+=' AND (nombre LIKE @q OR identificacion LIKE @q OR telefono LIKE @q OR contacto LIKE @q)';
    p.q=`%${filtro.busqueda}%`;
  }
  return await db.prepare(sql+' ORDER BY nombre').all(p);
});

ipcMain.handle('clientes:guardar', async (_,d)=>{
  const db=obtenerDB();
  if(d.id){
    await db.prepare(`UPDATE clientes SET nombre=?, identificacion=?, telefono=?, email=?, direccion=?, contacto=?, activo=? WHERE id=?`)
      .run(d.nombre, d.identificacion||null, d.telefono||null, d.email||null, d.direccion||null, d.contacto||null, d.activo!==undefined?d.activo:1, d.id);
    return { ok: true, id: d.id };
  } else {
    const res = await db.prepare(`INSERT INTO clientes (nombre, identificacion, telefono, email, direccion, contacto, activo) VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .run(d.nombre, d.identificacion||null, d.telefono||null, d.email||null, d.direccion||null, d.contacto||null, d.activo!==undefined?d.activo:1);
    return { ok: true, id: res.lastInsertRowid };
  }
});

ipcMain.handle('clientes:eliminar', async (_,id)=>{
  const db=obtenerDB();
  await db.prepare('DELETE FROM clientes WHERE id=?').run(id);
  return { ok: true };
});

// Combustible (CRUD dentro de Flota)
ipcMain.handle('combustible:listar', async (_,f={})=>{
  const db=obtenerDB();
  let sql=`SELECT c.*, v.placa, v.marca, v.modelo, v.codigo as vehiculo_codigo, d.nombre as conductor_nombre 
           FROM combustible c 
           JOIN vehiculos v ON v.id=c.vehiculo_id 
           LEFT JOIN conductores d ON d.id=c.conductor_id 
           WHERE 1=1`;
  const p={};
  if(f.vehiculo_id){ sql+=' AND c.vehiculo_id=@vehiculo_id'; p.vehiculo_id=f.vehiculo_id; }
  if(f.desde){ sql+=' AND date(c.fecha)>=date(@desde)'; p.desde=f.desde; }
  if(f.hasta){ sql+=' AND date(c.fecha)<=date(@hasta)'; p.hasta=f.hasta; }
  if(f.busqueda){
    sql+=' AND (v.placa LIKE @q OR v.codigo LIKE @q OR d.nombre LIKE @q OR c.estacion LIKE @q OR c.factura LIKE @q)';
    p.q=`%${f.busqueda}%`;
  }
  return await db.prepare(sql+' ORDER BY date(c.fecha) DESC, c.id DESC').all(p);
});

ipcMain.handle('combustible:guardar', async (_,d)=>{
  const db=obtenerDB();
  const total = (parseFloat(d.cantidad)||0) * (parseFloat(d.precio_unitario)||0);
  if(d.id){
    await db.prepare(`UPDATE combustible SET fecha=?, vehiculo_id=?, conductor_id=?, kilometraje=?, cantidad=?, precio_unitario=?, total=?, tipo_combustible=?, estacion=?, factura=?, observacion=? WHERE id=?`)
      .run(d.fecha, d.vehiculo_id, d.conductor_id||null, d.kilometraje||0, d.cantidad||0, d.precio_unitario||0, d.total!==undefined?d.total:total, d.tipo_combustible||'Diesel', d.estacion||null, d.factura||null, d.observacion||null, d.id);
    return { ok: true, id: d.id };
  } else {
    const res = await db.prepare(`INSERT INTO combustible (fecha, vehiculo_id, conductor_id, kilometraje, cantidad, precio_unitario, total, tipo_combustible, estacion, factura, observacion) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(d.fecha, d.vehiculo_id, d.conductor_id||null, d.kilometraje||0, d.cantidad||0, d.precio_unitario||0, d.total!==undefined?d.total:total, d.tipo_combustible||'Diesel', d.estacion||null, d.factura||null, d.observacion||null);
    return { ok: true, id: res.lastInsertRowid };
  }
});

ipcMain.handle('combustible:eliminar', async (_,id)=>{
  const db=obtenerDB();
  await db.prepare('DELETE FROM combustible WHERE id=?').run(id);
  return { ok: true };
});

ipcMain.handle('combustible:resumen', async (_,f={})=>{
  const db=obtenerDB();
  let where = 'WHERE 1=1', p = {};
  if(f.vehiculo_id){ where += ' AND vehiculo_id=@vehiculo_id'; p.vehiculo_id = f.vehiculo_id; }
  
  const totalLitros = await db.prepare(`SELECT COALESCE(SUM(cantidad),0) as total FROM combustible ${where}`).get(p).total;
  const totalGasto = await db.prepare(`SELECT COALESCE(SUM(total),0) as total FROM combustible ${where}`).get(p).total;
  const totalCargas = await db.prepare(`SELECT COUNT(*) as total FROM combustible ${where}`).get(p).total;

  // Rendimiento por unidad o general
  // Tomamos el odómetro mínimo y máximo con kilometraje > 0
  const kmStats = await db.prepare(`SELECT MIN(kilometraje) as km_min, MAX(kilometraje) as km_max FROM combustible ${where} AND kilometraje > 0`).get(p);
  let kmRecorridos = 0;
  if(kmStats && kmStats.km_max > kmStats.km_min){
    kmRecorridos = kmStats.km_max - kmStats.km_min;
  }

  // Rendimiento km/L y costo por km
  const rendimientoKmL = (kmRecorridos > 0 && totalLitros > 0) ? (kmRecorridos / totalLitros) : 0;
  const costoKm = (kmRecorridos > 0 && totalGasto > 0) ? (totalGasto / kmRecorridos) : 0;

  return { totalLitros, totalGasto, totalCargas, kmRecorridos, rendimientoKmL, costoKm };
});

ipcMain.handle('combustible:rendimiento_vehiculos', async ()=>{
  const db=obtenerDB();
  // Obtener resumen de rendimiento agrupado por vehículo
  const sql = `
    SELECT 
      v.id, v.codigo, v.placa, v.marca, v.modelo,
      COUNT(c.id) as total_cargas,
      COALESCE(SUM(c.cantidad), 0) as total_combustible,
      COALESCE(SUM(c.total), 0) as total_gasto,
      MIN(CASE WHEN c.kilometraje > 0 THEN c.kilometraje END) as km_min,
      MAX(CASE WHEN c.kilometraje > 0 THEN c.kilometraje END) as km_max
    FROM vehiculos v
    LEFT JOIN combustible c ON c.vehiculo_id = v.id
    GROUP BY v.id
    ORDER BY v.codigo ASC
  `;
  const rows = await db.prepare(sql).all();
  return rows.map(r => {
    const km_recorridos = (r.km_max && r.km_min && r.km_max > r.km_min) ? (r.km_max - r.km_min) : 0;
    const rendimiento_km_l = (km_recorridos > 0 && r.total_combustible > 0) ? (km_recorridos / r.total_combustible) : 0;
    const costo_por_km = (km_recorridos > 0 && r.total_gasto > 0) ? (r.total_gasto / km_recorridos) : 0;
    return {
      id: r.id,
      codigo: r.codigo,
      placa: r.placa,
      marca: r.marca,
      modelo: r.modelo,
      total_cargas: r.total_cargas,
      total_combustible: r.total_combustible,
      total_gasto: r.total_gasto,
      km_inicial: r.km_min || 0,
      km_actual: r.km_max || 0,
      km_recorridos,
      rendimiento_km_l,
      costo_por_km
    };
  });
});

// Empleados, ingresos, egresos, viáticos, planillas y administración de la base de datos.
Object.entries(operaciones).forEach(([canal, manejador]) => ipcMain.handle(canal, manejador));

}
module.exports={registrarIPC};
