"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
// API segura expuesta al renderer (contextBridge + contextIsolation)
electron_1.contextBridge.exposeInMainWorld("api", {
    listarClientes: () => electron_1.ipcRenderer.invoke("clientes:listar"),
    buscarClientes: (nombre) => electron_1.ipcRenderer.invoke("clientes:buscar", nombre),
    crearCliente: (datos) => electron_1.ipcRenderer.invoke("clientes:crear", datos),
    editarCliente: (id, datos) => electron_1.ipcRenderer.invoke("clientes:editar", id, datos),
    eliminarCliente: (id) => electron_1.ipcRenderer.invoke("clientes:eliminar", id),
    abonarCredito: (id, monto) => electron_1.ipcRenderer.invoke("clientes:abonar", id, monto),
    previaImpresionModulo: (modulo, opciones) => electron_1.ipcRenderer.invoke("modulos:impresion-previa", modulo, opciones),
    imprimirModulo: (modulo, opciones) => electron_1.ipcRenderer.invoke("modulos:impresion-imprimir", modulo, opciones),
    pdfModulo: (modulo, opciones) => electron_1.ipcRenderer.invoke("modulos:impresion-pdf", modulo, opciones),
    // --- Central de Abonos ---
    listarClientesConSaldo: () => electron_1.ipcRenderer.invoke("abonos:listar-clientes-con-saldo"),
    obtenerFacturasPendientes: (clienteId) => electron_1.ipcRenderer.invoke("abonos:facturas-pendientes", clienteId),
    aplicarAbonoInteligente: (clienteId, monto, nota) => electron_1.ipcRenderer.invoke("abonos:aplicar-inteligente", clienteId, monto, nota),
    obtenerHistorialAbonos: (clienteId) => electron_1.ipcRenderer.invoke("abonos:historial", clienteId),
    abonosPorCliente: (clienteId) => electron_1.ipcRenderer.invoke("abonos:por-cliente", clienteId),
    registrarFacturaDesdeVenta: (ventaId, clienteId, monto, fecha) => electron_1.ipcRenderer.invoke("facturas:registrar-desde-venta", ventaId, clienteId, monto, fecha),
    actualizarSaldoFactura: (facturaId, nuevoSaldo) => electron_1.ipcRenderer.invoke("facturas:actualizar-saldo", facturaId, nuevoSaldo),
    // --- Productos y Ventas ---
    listarProductos: () => electron_1.ipcRenderer.invoke("productos:listar"),
    buscarProductos: (nombre) => electron_1.ipcRenderer.invoke("productos:buscar", nombre),
    seleccionarHojaProductos: () => electron_1.ipcRenderer.invoke("productos:hoja-seleccionar"),
    importarProductos: (items) => electron_1.ipcRenderer.invoke("productos:importar", items),
    buscarProductoPorCodigoBarras: (codigo) => electron_1.ipcRenderer.invoke("productos:por-codigo-barras", codigo),
    // --- Escáner por teléfono ---
    iniciarEscanerTelefono: () => electron_1.ipcRenderer.invoke("escaner:telefono-iniciar"),
    detenerEscanerTelefono: () => electron_1.ipcRenderer.invoke("escaner:telefono-detener"),
    // Recibe cada código que lee la cámara del teléfono.
    onCodigoEscaner: (callback) => {
        const listener = (_evento, codigo) => callback(codigo);
        electron_1.ipcRenderer.on("escaner:codigo", listener);
        return () => electron_1.ipcRenderer.removeListener("escaner:codigo", listener);
    },
    crearProducto: (datos) => electron_1.ipcRenderer.invoke("productos:crear", datos),
    editarProducto: (id, datos) => electron_1.ipcRenderer.invoke("productos:editar", id, datos),
    eliminarProducto: (id) => electron_1.ipcRenderer.invoke("productos:eliminar", id),
    listarVentas: () => electron_1.ipcRenderer.invoke("ventas:listar"),
    listarVentasConDetalles: () => electron_1.ipcRenderer.invoke("ventas:historial"),
    crearVenta: (datos) => electron_1.ipcRenderer.invoke("ventas:crear", datos),
    obtenerResumen: () => electron_1.ipcRenderer.invoke("stats:resumen"),
    exportarRespaldo: () => electron_1.ipcRenderer.invoke("respaldo:exportar"),
    estadoRespaldo: () => electron_1.ipcRenderer.invoke("respaldo:estado"),
    seleccionarRespaldo: () => electron_1.ipcRenderer.invoke("respaldo:seleccionar"),
    restaurarRespaldo: (ruta) => electron_1.ipcRenderer.invoke("respaldo:restaurar", ruta),
    abrirCarpetaRespaldos: () => electron_1.ipcRenderer.invoke("respaldo:abrir-carpeta"),
    // --- Caja: turnos, movimientos y arqueo ---
    cajaTurnoAbierto: () => electron_1.ipcRenderer.invoke("caja:turno-abierto"),
    cajaAbrir: (usuario, montoInicial) => electron_1.ipcRenderer.invoke("caja:abrir", usuario, montoInicial),
    cajaMovimiento: (turnoId, tipo, concepto, monto) => electron_1.ipcRenderer.invoke("caja:movimiento", turnoId, tipo, concepto, monto),
    cajaCerrar: (turnoId, montoContado, notas) => electron_1.ipcRenderer.invoke("caja:cerrar", turnoId, montoContado, notas),
    cajaResumen: (turnoId) => electron_1.ipcRenderer.invoke("caja:resumen", turnoId),
    cajaTurnos: (limite) => electron_1.ipcRenderer.invoke("caja:turnos", limite),
    cajaMovimientos: (turnoId) => electron_1.ipcRenderer.invoke("caja:movimientos", turnoId),
    // --- Compras e Inventario ---
    listarProveedores: () => electron_1.ipcRenderer.invoke("proveedores:listar"),
    crearProveedor: (datos) => electron_1.ipcRenderer.invoke("proveedores:crear", datos),
    editarProveedor: (id, datos) => electron_1.ipcRenderer.invoke("proveedores:editar", id, datos),
    eliminarProveedor: (id) => electron_1.ipcRenderer.invoke("proveedores:eliminar", id),
    registrarCompra: (datos) => electron_1.ipcRenderer.invoke("compras:registrar", datos),
    listarCompras: (limite) => electron_1.ipcRenderer.invoke("compras:listar", limite),
    detallesCompra: (compraId) => electron_1.ipcRenderer.invoke("compras:detalles", compraId),
    ajustarInventario: (productoId, cantidad, motivo, tipo) => electron_1.ipcRenderer.invoke("inventario:ajustar", productoId, cantidad, motivo, tipo),
    movimientosInventario: (productoId, limite) => electron_1.ipcRenderer.invoke("inventario:movimientos", productoId, limite),
    inventarioCritico: (umbral) => electron_1.ipcRenderer.invoke("inventario:critico", umbral),
    inventarioValorizado: () => electron_1.ipcRenderer.invoke("inventario:valorizado"),
    // --- Reportes ---
    reporteCompleto: (desde, hasta) => electron_1.ipcRenderer.invoke("reportes:completo", desde, hasta),
    reportesIndicadores: () => electron_1.ipcRenderer.invoke("reportes:indicadores"),
    reportesResumen: (desde, hasta) => electron_1.ipcRenderer.invoke("reportes:resumen", desde, hasta),
    reportesPorDia: (desde, hasta) => electron_1.ipcRenderer.invoke("reportes:por-dia", desde, hasta),
    reportesTopProductos: (desde, hasta) => electron_1.ipcRenderer.invoke("reportes:top-productos", desde, hasta),
    reportesCartera: () => electron_1.ipcRenderer.invoke("reportes:cartera"),
    reportesImprimir: (desde, hasta) => electron_1.ipcRenderer.invoke("reportes:imprimir", desde, hasta),
    // --- Configuración ---
    obtenerConfiguracion: () => electron_1.ipcRenderer.invoke("configuracion:obtener"),
    guardarConfiguracion: (datos) => electron_1.ipcRenderer.invoke("configuracion:guardar", datos),
    restablecerConfiguracion: () => electron_1.ipcRenderer.invoke("configuracion:restablecer"),
    formatearMoneda: (monto) => electron_1.ipcRenderer.invoke("configuracion:formatear-moneda", monto),
    // --- WhatsApp ---
    enviarWhatsappTicket: (ventaId, numero) => electron_1.ipcRenderer.invoke("whatsapp:enviar-ticket", ventaId, numero),
    enviarWhatsappRecordatorio: (clienteId, numero) => electron_1.ipcRenderer.invoke("whatsapp:enviar-recordatorio", clienteId, numero),
    enviarWhatsappCatalogo: (numero) => electron_1.ipcRenderer.invoke("whatsapp:enviar-catalogo", numero),
    enviarWhatsappMensajeLibre: (numero, mensaje) => electron_1.ipcRenderer.invoke("whatsapp:mensaje-libre", numero, mensaje),
    obtenerWhatsappHistorial: (limit) => electron_1.ipcRenderer.invoke("whatsapp:historial", limit),
    obtenerWhatsappHistorialCliente: (clienteId) => electron_1.ipcRenderer.invoke("whatsapp:historial-cliente", clienteId),
    obtenerWhatsappEstadisticas: () => electron_1.ipcRenderer.invoke("whatsapp:estadisticas"),
    obtenerWhatsappConfig: () => electron_1.ipcRenderer.invoke("whatsapp:config"),
    guardarWhatsappConfig: (datos) => electron_1.ipcRenderer.invoke("whatsapp:guardar-config", datos),
    testWhatsappConexion: () => electron_1.ipcRenderer.invoke("whatsapp:test-conexion"),
    // --- Impresión del comprobante de venta ---
    listarImpresoras: () => electron_1.ipcRenderer.invoke("impresion:listar-impresoras"),
    imprimirTicket: (opciones) => electron_1.ipcRenderer.invoke("impresion:imprimir-ticket", opciones),
    guardarTicketPDF: (opciones) => electron_1.ipcRenderer.invoke("impresion:guardar-pdf", opciones),
    // --- Impresión de documentos individuales (catálogo de impresion/documentos.ts) ---
    listarDocumentos: () => electron_1.ipcRenderer.invoke("documentos:listar"),
    previaDocumento: (documentoId, desde, hasta, opciones) => electron_1.ipcRenderer.invoke("documentos:previa", documentoId, desde, hasta, opciones),
    imprimirDocumento: (documentoId, desde, hasta, opciones) => electron_1.ipcRenderer.invoke("documentos:imprimir", documentoId, desde, hasta, opciones),
    pdfDocumento: (documentoId, desde, hasta, opciones) => electron_1.ipcRenderer.invoke("documentos:pdf", documentoId, desde, hasta, opciones),
    // --- Licenciamiento de SmartPosPro ---
    obtenerEstadoLicencia: () => electron_1.ipcRenderer.invoke("licencia:estado"),
    activarLicencia: (codigo) => electron_1.ipcRenderer.invoke("licencia:activar", codigo),
    obtenerEquipoLicencia: () => electron_1.ipcRenderer.invoke("licencia:equipo"),
    validarLicenciaAlIniciar: () => electron_1.ipcRenderer.invoke("licencia:validar-inicio"),
    // --- Autenticación y usuarios ---
    iniciarSesion: (usuario, contrasena) => electron_1.ipcRenderer.invoke("auth:entrar", usuario, contrasena),
    cerrarSesion: () => electron_1.ipcRenderer.invoke("auth:salir"),
    obtenerSesion: () => electron_1.ipcRenderer.invoke("auth:sesion"),
    cambiarMiContrasena: (contrasenaActual, contrasenaNueva) => electron_1.ipcRenderer.invoke("auth:cambiar-contrasena", contrasenaActual, contrasenaNueva),
    listarUsuarios: () => electron_1.ipcRenderer.invoke("usuarios:listar"),
    resumenUsuarios: () => electron_1.ipcRenderer.invoke("usuarios:resumen"),
    crearUsuario: (datos) => electron_1.ipcRenderer.invoke("usuarios:crear", datos),
    editarUsuario: (id, datos) => electron_1.ipcRenderer.invoke("usuarios:actualizar", id, datos),
    eliminarUsuario: (id) => electron_1.ipcRenderer.invoke("usuarios:eliminar", id),
    restablecerContrasenaUsuario: (id, contrasena) => electron_1.ipcRenderer.invoke("usuarios:restablecer-contrasena", id, contrasena),
    desbloquearUsuario: (id) => electron_1.ipcRenderer.invoke("usuarios:desbloquear", id),
    obtenerBitacoraAccesos: (limite) => electron_1.ipcRenderer.invoke("usuarios:bitacora", limite),
    rolesDisponibles: () => electron_1.ipcRenderer.invoke("usuarios:roles"),
    modulosProtegidos: () => electron_1.ipcRenderer.invoke("usuarios:modulos"),
    totalUsuarios: () => electron_1.ipcRenderer.invoke("usuarios:total"),
    // Aviso del proceso principal cuando una operación exige iniciar sesión.
    onSesionRequerida: (callback) => {
        const listener = (_evento, mensaje) => callback(mensaje);
        electron_1.ipcRenderer.on("sesion:requerida", listener);
        return () => electron_1.ipcRenderer.removeListener("sesion:requerida", listener);
    },
    // Menú de la aplicación: "Archivo > Cerrar sesión".
    onCerrarSesionMenu: (callback) => {
        const listener = () => callback();
        electron_1.ipcRenderer.on("menu:cerrar-sesion", listener);
        return () => electron_1.ipcRenderer.removeListener("menu:cerrar-sesion", listener);
    }
});
