// ============================================================================
// Cliente web de la API.
//
// En el escritorio, window.api lo define el preload de Electron (src/preload).
// En la nube no hay preload: este archivo define EXACTAMENTE la misma
// superficie (mismos grupos y métodos) pero hablando por HTTP contra la API.
//
// Se carga antes de app.js. Si Electron ya definió window.api, no hace nada.
// ============================================================================
(function () {
  if (window.api) return; // Ya estamos dentro de Electron.

  // Cada acción declara su canal real (el nombre de la base de datos).
  const GRUPOS = {
    app: { info: 'app:info' },
    dashboard: { resumen: 'dashboard:resumen' },
    configuracion: { obtener: 'configuracion:obtener', guardar: 'configuracion:guardar' },
    reportes: { egresos: 'reportes:egresos', combustible: 'reportes:combustible' },
    bitacora: {
      listar: 'bitacora:listar',
      obtener: 'bitacora:obtener',
      guardar: 'bitacora:guardar',
      eliminar: 'bitacora:eliminar',
      resumen: 'bitacora:resumen'
    },
    vehiculos: { listar: 'vehiculos:listar', guardar: 'vehiculos:guardar', eliminar: 'vehiculos:eliminar' },
    conductores: { listar: 'conductores:listar', guardar: 'conductores:guardar', eliminar: 'conductores:eliminar' },
    clientes: { listar: 'clientes:listar', guardar: 'clientes:guardar', eliminar: 'clientes:eliminar' },
    combustible: {
      listar: 'combustible:listar',
      guardar: 'combustible:guardar',
      eliminar: 'combustible:eliminar',
      resumen: 'combustible:resumen',
      rendimientoVehiculos: 'combustible:rendimiento_vehiculos'
    },
    empleados: { listar: 'empleados:listar', resumen: 'empleados:resumen', guardar: 'empleados:guardar', eliminar: 'empleados:eliminar' },
    ingresos: { listar: 'ingresos:listar', guardar: 'ingresos:guardar', eliminar: 'ingresos:eliminar', resumen: 'ingresos:resumen' },
    egresos: { listar: 'egresos:listar', guardar: 'egresos:guardar', eliminar: 'egresos:eliminar', resumen: 'egresos:resumen' },
    finanzas: { categorias: 'finanzas:categorias' },
    viaticos: {
      listar: 'viaticos:listar',
      guardar: 'viaticos:guardar',
      liquidar: 'viaticos:liquidar',
      eliminar: 'viaticos:eliminar',
      resumen: 'viaticos:resumen'
    },
    planilla: {
      listar: 'planilla:listar',
      obtener: 'planilla:obtener',
      guardar: 'planilla:guardar',
      generar: 'planilla:generar',
      pagar: 'planilla:pagar',
      eliminar: 'planilla:eliminar',
      sugerencia: 'planilla:sugerencia'
    },
    comisiones: {
      listar: 'comisiones:listar',
      resumen: 'comisiones:resumen',
      guardar: 'comisiones:guardar',
      pagar: 'comisiones:pagar',
      pagarConductor: 'comisiones:pagar_conductor',
      eliminar: 'comisiones:eliminar',
      generar: 'comisiones:generar'
    },
    usuarios: {
      estadoInstalacion: 'usuarios:estado_instalacion',
      instalar: 'usuarios:instalar',
      listar: 'usuarios:listar',
      resumen: 'usuarios:resumen',
      guardar: 'usuarios:guardar',
      eliminar: 'usuarios:eliminar',
      autenticar: 'usuarios:autenticar',
      sesionActual: 'usuarios:sesion_actual',
      cerrarSesion: 'usuarios:cerrar_sesion',
      cambiarClave: 'usuarios:cambiar_clave',
      restablecerClave: 'usuarios:restablecer_clave'
    },
    sistema: {
      info: 'sistema:info',
      datosEjemplo: 'sistema:datos_ejemplo',
      limpiar: 'sistema:limpiar',
      respaldo: 'sistema:respaldo',
      abrirCarpeta: 'sistema:abrir_carpeta',
      auditoria: 'sistema:auditoria'
    }
  };

  const BASE = window.CONTROL_EMPRESA_API || '/api';

  async function invocar(canal, cuerpo) {
    const respuesta = await fetch(`${BASE}/${canal.replace(':', '/')}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cuerpo === undefined ? {} : cuerpo)
    });
    const texto = await respuesta.text();
    let datos = null;
    try { datos = texto ? JSON.parse(texto) : null; } catch (e) { datos = { error: texto }; }
    if (!respuesta.ok) {
      throw new Error((datos && datos.error) || `Error ${respuesta.status} al llamar ${canal}`);
    }
    return datos;
  }

  const api = {};
  for (const [grupo, acciones] of Object.entries(GRUPOS)) {
    api[grupo] = {};
    for (const [accion, canal] of Object.entries(acciones)) {
      // Los "eliminar" reciben el identificador suelto, no un objeto.
      api[grupo][accion] = accion === 'eliminar'
        ? (id) => invocar(canal, id)
        : (datos) => invocar(canal, datos);
    }
  }

  window.api = api;
  window.modoNube = true;
})();
