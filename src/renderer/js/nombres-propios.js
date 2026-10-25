// ============================================================================
// Nombres de personas siempre en formato "Carlos Fierro", sin importar cómo
// se hayan digitado (CARLOS FIERRO, carlos fierro, cArLoS fIeRrO).
// Envuelve window.api: normaliza al guardar y al mostrar lo que ya existía.
// ============================================================================
(function () {
  if (!window.api) return;

  const PARTICULAS = new Set(['de', 'del', 'la', 'las', 'los', 'y', 'e', 'da', 'di', 'van', 'von']);

  function formatearNombre(texto) {
    if (typeof texto !== 'string' || !texto.trim()) return texto;
    return texto.trim().split(/\s+/).map((palabra, i) => {
      // Siglas, números y abreviaturas (S.A., 2B, @correo) se dejan tal cual.
      if (/[\d.@_/&]/.test(palabra)) return palabra;
      const minus = palabra.toLocaleLowerCase('es');
      if (i > 0 && PARTICULAS.has(minus)) return minus;
      return minus.replace(/(^|['\-])(\p{L})/gu, (_, sep, letra) => sep + letra.toLocaleUpperCase('es'));
    }).join(' ');
  }
  window.formatearNombre = formatearNombre;

  // Campos que siempre son nombre de persona o de cliente en cualquier respuesta.
  const CLAVES = new Set(['conductor_nombre', 'cliente_nombre_rel', 'empleado_nombre', 'cliente_nombre']);
  // En estos grupos, "nombre" también es el de una persona o cliente.
  const GRUPOS_NOMBRE = new Set(['conductores', 'clientes', 'empleados', 'usuarios', 'monitoreo']);
  // Campos que se normalizan al guardar.
  const CLAVES_GUARDAR = new Set(['nombre', 'cliente', 'conductor_nombre', 'cliente_nombre_rel']);

  const LUGARES = new Set(['destino', 'origen', 'lugar_salida']);

  function transformar(valor, grupo) {
    if (Array.isArray(valor)) return valor.map(v => transformar(v, grupo));
    if (!valor || typeof valor !== 'object' || valor instanceof Date) return valor;
    const salida = {};
    for (const [clave, v] of Object.entries(valor)) {
      const esNombre = CLAVES.has(clave) || (clave === 'nombre' && GRUPOS_NOMBRE.has(grupo)) || (clave === 'cliente' && grupo === 'bitacora') || (LUGARES.has(clave) && (grupo === 'bitacora' || grupo === 'viaticos'));
      salida[clave] = esNombre && typeof v === 'string' ? formatearNombre(v) : (v && typeof v === 'object' ? transformar(v, grupo) : v);
    }
    return salida;
  }

  function normalizarEntrada(datos, grupo) {
    if (!datos || typeof datos !== 'object' || Array.isArray(datos)) return datos;
    if (!GRUPOS_NOMBRE.has(grupo) && grupo !== 'bitacora') return datos;
    const copia = { ...datos };
    for (const clave of CLAVES_GUARDAR) {
      if (typeof copia[clave] !== 'string') continue;
      if (clave === 'nombre' && !GRUPOS_NOMBRE.has(grupo)) continue;
      if (clave === 'cliente' && grupo !== 'bitacora') continue;
      copia[clave] = formatearNombre(copia[clave]);
    }
    if (grupo === 'bitacora') {
      for (const clave of LUGARES) if (typeof copia[clave] === 'string') copia[clave] = formatearNombre(copia[clave]);
    }
    return copia;
  }

  const original = window.api;
  const envuelta = {};
  for (const grupo of Object.keys(original)) {
    const acciones = original[grupo];
    if (!acciones || typeof acciones !== 'object') { envuelta[grupo] = acciones; continue; }
    envuelta[grupo] = {};
    for (const accion of Object.keys(acciones)) {
      const fn = acciones[accion];
      if (typeof fn !== 'function' || grupo === 'sistema' || grupo === 'app') { envuelta[grupo][accion] = fn; continue; }
      envuelta[grupo][accion] = async (...args) => {
        if (accion === 'guardar' && args.length) args[0] = normalizarEntrada(args[0], grupo);
        const resultado = await fn(...args);
        return accion === 'eliminar' ? resultado : transformar(resultado, grupo);
      };
    }
  }

  try { window.api = envuelta; } catch (e) { /* ignorado */ }
  if (window.api !== envuelta) {
    try { Object.defineProperty(window, 'api', { value: envuelta, configurable: true }); } catch (e) { /* sin cambios */ }
  }
})();
