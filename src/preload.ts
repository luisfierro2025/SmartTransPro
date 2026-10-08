import { contextBridge, ipcRenderer } from "electron";

interface DatosCliente {
  nombre: string;
  telefono: string;
  direccion: string;
  correo: string;
  limiteCredito: number;
}

interface DatosProducto {
  nombre: string;
  precio: number;
  stock: number;
  categoria: string;
  // Opcional: si no se envía se conserva el que ya tenía el producto.
  codigoBarras?: string | null;
}

interface FilaHojaProductos {
  numero: number;
  valores: Array<string | number | boolean>;
}

interface ProductoImportacion {
  nombre: string;
  precio: number;
  stock: number;
  categoria: string;
  codigoBarras?: string | null;
  filaOrigen?: number;
}

interface ItemVenta {
  productoId: number;
  nombre: string;
  precio: number;
  cantidad: number;
}

type TipoPago = "contado" | "credito";

interface DatosProveedor {
  nombre: string;
  contacto: string;
  telefono: string;
  correo: string;
  direccion: string;
  notas: string;
}

interface ItemCompra {
  productoId: number;
  cantidad: number;
  costo: number;
}

interface DatosCompra {
  proveedorId: number | null;
  folio: string;
  notas: string;
  impuestoPct: number;
  items: ItemCompra[];
}

interface ConfigNegocio {
  nombre: string;
  ruc: string;
  direccion: string;
  telefono: string;
  moneda: string;
  impuesto: number;
  stockMinimo: number;
  pieTicket: string;
  tema: "corporativo" | "ejecutivo" | "codigo";
}

// Opciones del comprobante que el renderer envía al proceso principal para
// imprimir el ticket en la térmica o exportarlo a PDF.
interface OpcionesImpresionTicket {
  html: string;
  impresora?: string;
  copias?: number;
  anchoMm?: number;
  altoMm?: number | null;
  silencioso?: boolean;
  nombreArchivo?: string;
}

// --- Usuarios, roles y acceso ---
export type RolUsuario = "administrador" | "supervisor" | "cajero";

interface SesionUsuario {
  id: number;
  usuario: string;
  nombre: string;
  correo: string;
  telefono: string;
  rol: RolUsuario;
  rolEtiqueta: string;
  activo: boolean;
  bloqueado: boolean;
  intentosFallidos: number;
  debeCambiarContrasena: boolean;
  ultimoAcceso: string;
  creadoEn: string;
  permisos: string[];
  expiraEn: string;
}

interface DatosUsuario {
  usuario: string;
  nombre: string;
  correo: string;
  telefono: string;
  rol: string;
  contrasena: string;
  activo: boolean;
  debeCambiarContrasena?: boolean;
}

// API segura expuesta al renderer (contextBridge + contextIsolation)
contextBridge.exposeInMainWorld("api", {
  listarClientes: () => ipcRenderer.invoke("clientes:listar"),
  buscarClientes: (nombre: string) => ipcRenderer.invoke("clientes:buscar", nombre),
  crearCliente: (datos: DatosCliente) => ipcRenderer.invoke("clientes:crear", datos),
  editarCliente: (id: number, datos: DatosCliente) =>
    ipcRenderer.invoke("clientes:editar", id, datos),
  eliminarCliente: (id: number) => ipcRenderer.invoke("clientes:eliminar", id),
  abonarCredito: (id: number, monto: number) =>
    ipcRenderer.invoke("clientes:abonar", id, monto),
  previaImpresionModulo: (modulo: "clientes" | "productos", opciones?: object) =>
    ipcRenderer.invoke("modulos:impresion-previa", modulo, opciones),
  imprimirModulo: (modulo: "clientes" | "productos", opciones?: object) =>
    ipcRenderer.invoke("modulos:impresion-imprimir", modulo, opciones),
  pdfModulo: (modulo: "clientes" | "productos", opciones?: object) =>
    ipcRenderer.invoke("modulos:impresion-pdf", modulo, opciones),
  // --- Central de Abonos ---
  listarClientesConSaldo: () => ipcRenderer.invoke("abonos:listar-clientes-con-saldo"),
  obtenerFacturasPendientes: (clienteId: number) =>
    ipcRenderer.invoke("abonos:facturas-pendientes", clienteId),
  aplicarAbonoInteligente: (clienteId: number, monto: number, nota?: string) =>
    ipcRenderer.invoke("abonos:aplicar-inteligente", clienteId, monto, nota),
  obtenerHistorialAbonos: (clienteId?: number) =>
    ipcRenderer.invoke("abonos:historial", clienteId),
  abonosPorCliente: (clienteId: number) =>
    ipcRenderer.invoke("abonos:por-cliente", clienteId),
  registrarFacturaDesdeVenta: (ventaId: number, clienteId: number, monto: number, fecha: string) =>
    ipcRenderer.invoke("facturas:registrar-desde-venta", ventaId, clienteId, monto, fecha),
  actualizarSaldoFactura: (facturaId: number, nuevoSaldo: number) =>
    ipcRenderer.invoke("facturas:actualizar-saldo", facturaId, nuevoSaldo),
  // --- Productos y Ventas ---
  listarProductos: () => ipcRenderer.invoke("productos:listar"),
  buscarProductos: (nombre: string) => ipcRenderer.invoke("productos:buscar", nombre),
  seleccionarHojaProductos: (): Promise<{
    cancelado: boolean;
    hoja?: string;
    encabezados?: string[];
    filas?: FilaHojaProductos[];
  }> => ipcRenderer.invoke("productos:hoja-seleccionar"),
  importarProductos: (items: ProductoImportacion[]): Promise<{ importados: number }> =>
    ipcRenderer.invoke("productos:importar", items),
  buscarProductoPorCodigoBarras: (codigo: string) =>
    ipcRenderer.invoke("productos:por-codigo-barras", codigo),
  // --- Escáner por teléfono ---
  iniciarEscanerTelefono: () => ipcRenderer.invoke("escaner:telefono-iniciar"),
  detenerEscanerTelefono: () => ipcRenderer.invoke("escaner:telefono-detener"),
  // Recibe cada código que lee la cámara del teléfono.
  onCodigoEscaner: (callback: (codigo: string) => void) => {
    const listener = (_evento: unknown, codigo: string) => callback(codigo);
    ipcRenderer.on("escaner:codigo", listener);
    return () => ipcRenderer.removeListener("escaner:codigo", listener);
  },
  crearProducto: (datos: DatosProducto) => ipcRenderer.invoke("productos:crear", datos),
  editarProducto: (id: number, datos: DatosProducto) =>
    ipcRenderer.invoke("productos:editar", id, datos),
  eliminarProducto: (id: number) => ipcRenderer.invoke("productos:eliminar", id),
  listarVentas: () => ipcRenderer.invoke("ventas:listar"),
  listarVentasConDetalles: () => ipcRenderer.invoke("ventas:historial"),
  crearVenta: (datos: { clienteId: number | null; tipoPago: TipoPago; items: ItemVenta[]; descuentoTipo?: "porcentaje" | "monto"; descuentoValor?: number }) =>
    ipcRenderer.invoke("ventas:crear", datos),
  obtenerResumen: () => ipcRenderer.invoke("stats:resumen"),
  exportarRespaldo: () => ipcRenderer.invoke("respaldo:exportar"),
  estadoRespaldo: () => ipcRenderer.invoke("respaldo:estado"),
  seleccionarRespaldo: () => ipcRenderer.invoke("respaldo:seleccionar"),
  restaurarRespaldo: (ruta: string) => ipcRenderer.invoke("respaldo:restaurar", ruta),
  abrirCarpetaRespaldos: () => ipcRenderer.invoke("respaldo:abrir-carpeta"),
  // --- Caja: turnos, movimientos y arqueo ---
  cajaTurnoAbierto: () => ipcRenderer.invoke("caja:turno-abierto"),
  cajaAbrir: (usuario: string, montoInicial: number) => ipcRenderer.invoke("caja:abrir", usuario, montoInicial),
  cajaMovimiento: (turnoId: number, tipo: string, concepto: string, monto: number) =>
    ipcRenderer.invoke("caja:movimiento", turnoId, tipo, concepto, monto),
  cajaCerrar: (turnoId: number, montoContado: number, notas: string) =>
    ipcRenderer.invoke("caja:cerrar", turnoId, montoContado, notas),
  cajaResumen: (turnoId: number) => ipcRenderer.invoke("caja:resumen", turnoId),
  cajaTurnos: (limite?: number) => ipcRenderer.invoke("caja:turnos", limite),
  cajaMovimientos: (turnoId?: number) => ipcRenderer.invoke("caja:movimientos", turnoId),
  // --- Compras e Inventario ---
  listarProveedores: () => ipcRenderer.invoke("proveedores:listar"),
  crearProveedor: (datos: DatosProveedor) => ipcRenderer.invoke("proveedores:crear", datos),
  editarProveedor: (id: number, datos: DatosProveedor) => ipcRenderer.invoke("proveedores:editar", id, datos),
  eliminarProveedor: (id: number) => ipcRenderer.invoke("proveedores:eliminar", id),
  registrarCompra: (datos: DatosCompra) => ipcRenderer.invoke("compras:registrar", datos),
  listarCompras: (limite?: number) => ipcRenderer.invoke("compras:listar", limite),
  detallesCompra: (compraId: number) => ipcRenderer.invoke("compras:detalles", compraId),
  ajustarInventario: (productoId: number, cantidad: number, motivo: string, tipo: string) =>
    ipcRenderer.invoke("inventario:ajustar", productoId, cantidad, motivo, tipo),
  movimientosInventario: (productoId?: number, limite?: number) =>
    ipcRenderer.invoke("inventario:movimientos", productoId, limite),
  inventarioCritico: (umbral?: number) => ipcRenderer.invoke("inventario:critico", umbral),
  inventarioValorizado: () => ipcRenderer.invoke("inventario:valorizado"),
  // --- Reportes ---
  reporteCompleto: (desde: string, hasta: string) => ipcRenderer.invoke("reportes:completo", desde, hasta),
  reportesIndicadores: () => ipcRenderer.invoke("reportes:indicadores"),
  reportesResumen: (desde: string, hasta: string) => ipcRenderer.invoke("reportes:resumen", desde, hasta),
  reportesPorDia: (desde: string, hasta: string) => ipcRenderer.invoke("reportes:por-dia", desde, hasta),
  reportesTopProductos: (desde: string, hasta: string) => ipcRenderer.invoke("reportes:top-productos", desde, hasta),
  reportesCartera: () => ipcRenderer.invoke("reportes:cartera"),
  reportesImprimir: (desde: string, hasta: string) => ipcRenderer.invoke("reportes:imprimir", desde, hasta),
  // --- Configuración ---
  obtenerConfiguracion: () => ipcRenderer.invoke("configuracion:obtener"),
  guardarConfiguracion: (datos: Partial<ConfigNegocio>) => ipcRenderer.invoke("configuracion:guardar", datos),
  restablecerConfiguracion: () => ipcRenderer.invoke("configuracion:restablecer"),
  formatearMoneda: (monto: number) => ipcRenderer.invoke("configuracion:formatear-moneda", monto),
  // --- WhatsApp ---
  enviarWhatsappTicket: (ventaId: number, numero: string) => ipcRenderer.invoke("whatsapp:enviar-ticket", ventaId, numero),
  enviarWhatsappRecordatorio: (clienteId: number, numero: string) => ipcRenderer.invoke("whatsapp:enviar-recordatorio", clienteId, numero),
  enviarWhatsappCatalogo: (numero: string) => ipcRenderer.invoke("whatsapp:enviar-catalogo", numero),
  enviarWhatsappMensajeLibre: (numero: string, mensaje: string) => ipcRenderer.invoke("whatsapp:mensaje-libre", numero, mensaje),
  obtenerWhatsappHistorial: (limit?: number) => ipcRenderer.invoke("whatsapp:historial", limit),
  obtenerWhatsappHistorialCliente: (clienteId: number) => ipcRenderer.invoke("whatsapp:historial-cliente", clienteId),
  obtenerWhatsappEstadisticas: () => ipcRenderer.invoke("whatsapp:estadisticas"),
  obtenerWhatsappConfig: () => ipcRenderer.invoke("whatsapp:config"),
  guardarWhatsappConfig: (datos: object) => ipcRenderer.invoke("whatsapp:guardar-config", datos),
  testWhatsappConexion: () => ipcRenderer.invoke("whatsapp:test-conexion"),
  // --- Impresión del comprobante de venta ---
  listarImpresoras: () => ipcRenderer.invoke("impresion:listar-impresoras"),
  imprimirTicket: (opciones: OpcionesImpresionTicket) =>
    ipcRenderer.invoke("impresion:imprimir-ticket", opciones),
  guardarTicketPDF: (opciones: OpcionesImpresionTicket) =>
    ipcRenderer.invoke("impresion:guardar-pdf", opciones),
  // --- Impresión de documentos individuales (catálogo de impresion/documentos.ts) ---
  listarDocumentos: () => ipcRenderer.invoke("documentos:listar"),
  previaDocumento: (documentoId: string, desde: string, hasta: string, opciones?: object) =>
    ipcRenderer.invoke("documentos:previa", documentoId, desde, hasta, opciones),
  imprimirDocumento: (documentoId: string, desde: string, hasta: string, opciones?: object) =>
    ipcRenderer.invoke("documentos:imprimir", documentoId, desde, hasta, opciones),
  pdfDocumento: (documentoId: string, desde: string, hasta: string, opciones?: object) =>
    ipcRenderer.invoke("documentos:pdf", documentoId, desde, hasta, opciones),
  // --- Licenciamiento de SmartPosPro ---
  obtenerEstadoLicencia: () =>
    ipcRenderer.invoke("licencia:estado"),

  activarLicencia: (codigo: string) =>
    ipcRenderer.invoke("licencia:activar", codigo),

  obtenerEquipoLicencia: () =>
    ipcRenderer.invoke("licencia:equipo"),

  validarLicenciaAlIniciar: () =>
    ipcRenderer.invoke("licencia:validar-inicio"),

  // --- Autenticación y usuarios ---
  iniciarSesion: (usuario: string, contrasena: string) =>
    ipcRenderer.invoke("auth:entrar", usuario, contrasena),
  cerrarSesion: () => ipcRenderer.invoke("auth:salir"),
  obtenerSesion: () => ipcRenderer.invoke("auth:sesion") as Promise<SesionUsuario | null>,
  cambiarMiContrasena: (contrasenaActual: string, contrasenaNueva: string) =>
    ipcRenderer.invoke("auth:cambiar-contrasena", contrasenaActual, contrasenaNueva),
  listarUsuarios: () => ipcRenderer.invoke("usuarios:listar"),
  resumenUsuarios: () => ipcRenderer.invoke("usuarios:resumen"),
  crearUsuario: (datos: DatosUsuario) => ipcRenderer.invoke("usuarios:crear", datos),
  editarUsuario: (id: number, datos: Partial<DatosUsuario>) =>
    ipcRenderer.invoke("usuarios:actualizar", id, datos),
  eliminarUsuario: (id: number) => ipcRenderer.invoke("usuarios:eliminar", id),
  restablecerContrasenaUsuario: (id: number, contrasena: string) =>
    ipcRenderer.invoke("usuarios:restablecer-contrasena", id, contrasena),
  desbloquearUsuario: (id: number) => ipcRenderer.invoke("usuarios:desbloquear", id),
  obtenerBitacoraAccesos: (limite?: number) => ipcRenderer.invoke("usuarios:bitacora", limite),
  rolesDisponibles: () => ipcRenderer.invoke("usuarios:roles"),
  modulosProtegidos: () => ipcRenderer.invoke("usuarios:modulos"),
  totalUsuarios: () => ipcRenderer.invoke("usuarios:total"),
  // Aviso del proceso principal cuando una operación exige iniciar sesión.
  onSesionRequerida: (callback: (mensaje: string) => void) => {
    const listener = (_evento: unknown, mensaje: string) => callback(mensaje);
    ipcRenderer.on("sesion:requerida", listener);
    return () => ipcRenderer.removeListener("sesion:requerida", listener);
  },
  // Menú de la aplicación: "Archivo > Cerrar sesión".
  onCerrarSesionMenu: (callback: () => void) => {
    const listener = () => callback();
    ipcRenderer.on("menu:cerrar-sesion", listener);
    return () => ipcRenderer.removeListener("menu:cerrar-sesion", listener);
  }
});


