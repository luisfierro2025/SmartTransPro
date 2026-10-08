import 'dotenv/config';
import { app, BrowserWindow, dialog, ipcMain, shell } from "electron";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { parse as parseCsv } from "csv-parse/sync";
import readXlsxFile from "read-excel-file/node";
// Recrear __filename y __dirname para ES Modules (declarados una sola vez)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// Cargar el archivo .env apuntando a la raíz del proyecto
dotenv.config({ path: path.join(__dirname, "../.env") });
// Verificación en consola de credenciales
console.log("TOKEN WA DETECTADO:", process.env.WHATSAPP_TOKEN ? "SÍ" : "NO");
console.log("PHONE ID DETECTADO:", process.env.WHATSAPP_PHONE_NUMBER_ID ? "SÍ" : "NO");
import { crearCliente, obtenerClientes, buscar, actualizarCliente, borrarCliente, contarClientes, abonarCliente } from "./clientes/clientes.js";
import { crearProducto, obtenerProductos, buscar as buscarProductos, actualizarProducto, borrarProducto, contarProductos, productoPorCodigoBarras, importarProductos } from "./productos/productos.js";
import { db, registrarVenta, obtenerVentas, obtenerHistorial, contarVentasDelDia, montoVentasDelDia, topProductosVendidos, ventasPorUltimosDias, pagosDeHoy, topDeudores, productosAgotados, ultimasVentas, obtenerFacturasPendientes, aplicarAbonoInteligente, obtenerAbonos, abonosPorCliente, registrarFactura, actualizarSaldoFactura, exportarRespaldo, crearRespaldoAutomatico, obtenerEstadoRespaldo, restaurarRespaldo, prepararRespaldoParaRestaurar } from "./db/database.js";
// --- Módulos nuevos: Caja, Compras/Inventario, Reportes y Configuración ---
import { abrirCaja, cerrarCaja, cajaAbierta, registrarMovimiento, resumenTurno, obtenerTurnos, movimientosTurno, ultimosMovimientos } from "./caja/caja.js";
import { listarProveedores, crearProveedor, actualizarProveedor, borrarProveedor, registrarCompra, obtenerCompras, detallesCompra, ajustarInventario, obtenerMovimientosInventario, stockCritico, inventarioValorizado } from "./compras/compras.js";
import { generarReporteImprimibleHTML } from "./reportes/reportes-impresion.js";
import { exportarReporteModuloPDF, generarHTMLImpresionModulo, imprimirReporteModulo } from "./reportes/impresion-modulos.js";
import { listarDocumentos, vistaPreviaDocumento, imprimirDocumento, exportarDocumentoPDF } from "./impresion/documento-servicio.js";
import { reporteCompleto, indicadoresGenerales, resumenVentas, ventasPorDia, productosMasVendidos, carteraPorCobrar } from "./reportes/reportes.js";
import { obtenerConfiguracion, guardarConfiguracion, restablecerConfiguracion, formatearMoneda } from "./configuracion/configuracion.js";
// --- Módulo de impresión del comprobante (térmica 80/58 mm, hoja A4 y PDF) ---
import { guardarComprobantePDF, imprimirTicket, imprimirDocumentoA4, listarImpresoras } from "./impresion/impresion.js";
import { obtenerEstadoLicencia, activarLicencia, obtenerEquipoLicencia, validarLicenciaAlIniciar, licenciaVigente } from "./licencia/licencia.js";
// --- Escáner por teléfono (el móvil hace de lector sobre la red local) ---
import { iniciarEscanerTelefono, detenerEscanerTelefono } from "./barcode/telefono.js";
// --- Módulo de WhatsApp ---
import { enviarTicketWhatsApp, enviarRecordatorioCreditoWhatsApp, enviarCatalogoWhatsApp, enviarMensajeLibreWhatsApp, obtenerHistorialWhatsApp, obtenerHistorialPorClienteWhatsApp, obtenerEstadisticasWhatsApp, obtenerConfigActual as leerWhatsAppConfig, guardarConfig as guardarWhatsAppConfig, testConexionReal as probarConexionWhatsApp, guardarTokenValidado } from "./whatsapp/whatsapp.js";
// --- Módulo de Usuarios, roles y acceso ---
import { asegurarAdministradorInicial, autenticarse, cerrarSesion, sesionDeVentana, asociarSesion, exigirPermiso, moduloDeCanal, listarUsuarios, crearUsuario, actualizarUsuario, eliminarUsuario, cambiarContrasena, restablecerContrasena, desbloquearUsuario, obtenerBitacora, resumenUsuarios, contarUsuarios, ROLES, ETIQUETAS_ROL, MODULOS_SISTEMA, USUARIO_INICIAL, CONTRASENA_INICIAL } from "./usuarios/usuarios.js";
// --- Menú de la aplicación en español (barra de menús nativa de Windows) ---
import { configurarMenuAplicacion } from "./menu/menu.js";
// Fuerza el idioma de los menús y diálogos nativos de Electron. Debe ejecutarse
// antes de que la aplicación esté lista.
app.commandLine.appendSwitch("lang", "es");
let ventanaPrincipal = null;
function crearVentana() {
    const win = new BrowserWindow({
        width: 1200,
        height: 760,
        title: "SmartPosPro - Punto de Venta",
        webPreferences: {
            preload: path.join(__dirname, "preload.js"),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true
        }
    });
    ventanaPrincipal = win;
    // La versión se inyecta desde el proceso principal para que la barra de
    // estado coincida con la del instalador (package.json), sin duplicar el dato.
    win.webContents.on("did-finish-load", () => {
        win.webContents
            .executeJavaScript(`(() => {
           const el = document.getElementById("appVersion");
           if (el) el.textContent = "v" + ${JSON.stringify(app.getVersion())};
         })()`)
            .catch(() => {
            // Si la ventana ya se cerró no vale la pena insistir.
        });
    });
    win.loadFile(path.join(__dirname, "renderer", "index.html"));
}
// --- Control de acceso centralizado ---
// Todos los canales IPC pasan por `canal(...)`, que exige una sesión válida y
// comprueba que el rol tenga permiso sobre el módulo del canal. Así la
// seguridad no depende de la interfaz: aunque se manipule el renderer, las
// operaciones sin sesión o sin permiso quedan bloqueadas en el proceso principal.
const CANALES_PUBLICOS = new Set([
    "auth:entrar",
    "auth:sesion",
    "auth:salir",
    "licencia:estado",
    "licencia:activar",
    "licencia:equipo",
    "licencia:validar-inicio"
]);
function exigirSesion(ventanaId) {
    const sesion = sesionDeVentana(ventanaId);
    if (!sesion)
        throw new Error("Debe iniciar sesión para continuar.");
    return sesion;
}
function canal(nombre, manejador, opciones = {}) {
    // Los canales públicos (login, estado de sesión) no requieren credenciales.
    if (opciones.publico === true || CANALES_PUBLICOS.has(nombre)) {
        ipcMain.handle(nombre, manejador);
        return;
    }
    const modulo = moduloDeCanal(nombre);
    ipcMain.handle(nombre, async (evento, ...args) => {
        // Sin licencia activa no se opera nada, aunque se manipule el renderer.
        if (!licenciaVigente())
            throw new Error("SmartPosPro no está activado. Activa tu licencia para continuar.");
        try {
            if (modulo)
                exigirPermiso(evento.sender.id, modulo);
            else
                exigirSesion(evento.sender.id);
        }
        catch (error) {
            // Se avisa al renderer para que vuelva a la pantalla de acceso.
            try {
                evento.sender.send("sesion:requerida", error instanceof Error ? error.message : "Sesión no válida.");
            }
            catch {
                // La ventana pudo cerrarse mientras se respondía: no hay nada que hacer.
            }
            throw error;
        }
        return manejador(evento, ...args);
    });
}
// --- Canales IPC para el módulo de clientes ---
canal("clientes:listar", () => obtenerClientes());
canal("clientes:buscar", (_evento, nombre) => buscar(nombre));
canal("clientes:crear", (_evento, datos) => {
    const res = crearCliente(datos.nombre, datos.telefono, datos.direccion, datos.correo, datos.limiteCredito);
    const creado = db
        .prepare("SELECT codigo FROM clientes WHERE id = ?")
        .get(res.lastInsertRowid);
    return { lastInsertRowid: res.lastInsertRowid, codigo: creado ? creado.codigo : "" };
});
canal("clientes:editar", (_evento, id, datos) => actualizarCliente(id, datos.nombre, datos.telefono, datos.direccion, datos.correo, datos.limiteCredito));
canal("clientes:eliminar", (_evento, id) => borrarCliente(id));
canal("clientes:abonar", (_evento, id, monto) => abonarCliente(id, monto));
// --- Central de Abonos con pagos inteligentes (distribución automática a facturas) ---
canal("abonos:facturas-pendientes", (_evento, clienteId) => obtenerFacturasPendientes(clienteId));
canal("abonos:aplicar-inteligente", (_evento, clienteId, monto, nota) => aplicarAbonoInteligente(clienteId, monto, nota));
canal("abonos:historial", (_evento, clienteId) => obtenerAbonos(clienteId ?? undefined));
canal("abonos:por-cliente", (_evento, clienteId) => abonosPorCliente(clienteId));
canal("abonos:listar-clientes-con-saldo", () => {
    const stmt = db.prepare(`
    SELECT c.id, c.codigo, c.nombre, c.telefono,
           COALESCE(c.limite_credito, 0) AS limiteCredito,
           COALESCE(c.saldo_pendiente, 0) AS saldoPendiente,
           COALESCE(f.totalPendiente, 0) AS saldoFacturas,
           COALESCE(q.fechaUltima, '') AS fechaUltimaVenta
    FROM clientes c
    LEFT JOIN (
      SELECT cliente_id, SUM(saldo_pendiente) AS totalPendiente
      FROM facturas
      GROUP BY cliente_id
    ) f ON f.cliente_id = c.id
    LEFT JOIN (
      SELECT v.cliente_id, MAX(v.fecha) AS fechaUltima
      FROM ventas v
      WHERE v.tipo_pago = 'credito'
      GROUP BY v.cliente_id
    ) q ON q.cliente_id = c.id
    ORDER BY COALESCE(c.saldo_pendiente, 0) DESC, c.nombre
  `);
    return stmt.all();
});
// --- Registrar factura asociada a una venta al crédito ---
canal("facturas:registrar-desde-venta", (_evento, ventaId, clienteId, monto, fecha) => registrarFactura(ventaId, clienteId, monto, fecha));
canal("facturas:actualizar-saldo", (_evento, facturaId, nuevoSaldo) => actualizarSaldoFactura(facturaId, nuevoSaldo));
// --- Canales IPC para el módulo de productos ---
canal("productos:listar", () => obtenerProductos());
canal("productos:buscar", (_evento, nombre) => buscarProductos(nombre));
// Resuelve un código de barras al producto. Es la vía que usa el escáner del
// punto de venta, por eso devuelve null (y no []) cuando no hay coincidencia.
canal("productos:por-codigo-barras", (_evento, codigo) => productoPorCodigoBarras(codigo));
canal("productos:hoja-seleccionar", async () => {
    const resultado = await dialog.showOpenDialog(ventanaPrincipal, {
        title: "Seleccionar hoja de cálculo de productos",
        properties: ["openFile"],
        filters: [{ name: "Hojas de cálculo", extensions: ["xlsx", "csv"] }]
    });
    const ruta = resultado.filePaths[0];
    if (resultado.canceled || !ruta)
        return { cancelado: true };
    const extension = path.extname(ruta).toLowerCase();
    if (extension !== ".xlsx" && extension !== ".csv") {
        throw new Error("Formato no compatible. Selecciona un archivo .xlsx o .csv.");
    }
    const tamano = fs.statSync(ruta).size;
    if (tamano <= 0 || tamano > 20 * 1024 * 1024) {
        throw new Error("El archivo está vacío o supera el límite de 20 MB.");
    }
    let nombreHoja;
    let datos;
    if (extension === ".csv") {
        const texto = fs.readFileSync(ruta, "utf8");
        const primeraLinea = texto.split(/\r?\n/, 1)[0] ?? "";
        const delimitadores = [",", ";", "\t"];
        const conteos = delimitadores.map((delimitador) => {
            let entreComillas = false;
            let conteo = 0;
            for (let indice = 0; indice < primeraLinea.length; indice++) {
                if (primeraLinea[indice] === '"') {
                    if (entreComillas && primeraLinea[indice + 1] === '"')
                        indice++;
                    else
                        entreComillas = !entreComillas;
                }
                else if (!entreComillas && primeraLinea[indice] === delimitador) {
                    conteo++;
                }
            }
            return conteo;
        });
        const maximoDelimitador = Math.max(...conteos);
        const delimitador = maximoDelimitador > 0 ? delimitadores[conteos.indexOf(maximoDelimitador)] : ",";
        datos = parseCsv(texto, {
            bom: true,
            delimiter: delimitador,
            relax_column_count: true,
            skip_empty_lines: false,
            max_record_size: 256 * 1024
        });
        nombreHoja = "CSV";
    }
    else {
        const hojas = await readXlsxFile(ruta);
        const hoja = hojas.find((candidata) => candidata.data.length > 0);
        if (!hoja)
            throw new Error("El archivo no contiene hojas con datos.");
        nombreHoja = hoja.sheet;
        datos = hoja.data;
    }
    if (!datos.length)
        throw new Error("El archivo no contiene filas con datos.");
    if (datos.length > 10001) {
        throw new Error("La hoja supera el límite permitido de 10,000 filas o 200 columnas.");
    }
    const convertirCelda = (valor) => {
        if (valor == null)
            return "";
        if (valor instanceof Date)
            return valor.toISOString();
        if (typeof valor === "string" || typeof valor === "number" || typeof valor === "boolean")
            return valor;
        return "";
    };
    const encabezado = datos[0] ?? [];
    const columnas = Math.max(encabezado.length, ...datos.slice(1).map((fila) => fila.length));
    if (columnas > 200) {
        throw new Error("La hoja supera el límite permitido de 10,000 filas o 200 columnas.");
    }
    const encabezados = Array.from({ length: columnas }, (_, indice) => String(convertirCelda(encabezado[indice])).trim());
    const filas = datos.slice(1).map((fila, indice) => {
        const numero = indice + 2;
        return {
            numero,
            valores: Array.from({ length: columnas }, (_, columna) => convertirCelda(fila[columna]))
        };
    });
    return { cancelado: false, hoja: nombreHoja, encabezados, filas };
});
canal("productos:importar", (_evento, items) => importarProductos(items));
canal("productos:crear", (_evento, datos) => crearProducto(datos.nombre, datos.precio, datos.stock, datos.categoria, datos.codigoBarras));
canal("productos:editar", (_evento, id, datos) => actualizarProducto(id, datos.nombre, datos.precio, datos.stock, datos.categoria, datos.codigoBarras));
canal("productos:eliminar", (_evento, id) => borrarProducto(id));
// --- Impresión de directorios de Clientes e Inventario de Productos ---
canal("modulos:impresion-previa", (_evento, modulo, opciones) => generarHTMLImpresionModulo(modulo, opciones, "pantalla"));
canal("modulos:impresion-imprimir", (_evento, modulo, opciones) => imprimirReporteModulo(ventanaPrincipal, modulo, opciones));
canal("modulos:impresion-pdf", (_evento, modulo, opciones) => exportarReporteModuloPDF(ventanaPrincipal, modulo, opciones));
// --- Escáner por teléfono ---
// El proceso principal levanta un servidor en la red local; cada código que
// llega por la cámara del teléfono se reenvía al renderer, que lo procesa con
// la misma lógica que el lector USB.
canal("escaner:telefono-iniciar", (evento) => iniciarEscanerTelefono((codigo) => {
    const destino = BrowserWindow.fromWebContents(evento.sender) ?? ventanaPrincipal;
    if (destino && !destino.isDestroyed())
        destino.webContents.send("escaner:codigo", codigo);
}));
canal("escaner:telefono-detener", () => {
    detenerEscanerTelefono();
    return true;
});
// --- Canales IPC para el módulo de ventas ---
canal("ventas:listar", () => obtenerVentas());
canal("ventas:historial", () => obtenerHistorial());
canal("ventas:crear", (_evento, datos) => registrarVenta(datos.clienteId, datos.tipoPago, datos.items, { descuentoTipo: datos.descuentoTipo, descuentoValor: datos.descuentoValor }));
// Resumen general para el dashboard de inicio
// Un solo IPC agrupa KPIs + zona de reportes: el tablero se repinta de una vez
// sin disparar varias consultas desde el renderer.
canal("stats:resumen", () => ({
    totalClientes: contarClientes(),
    totalProductos: contarProductos(),
    totalVentas: contarVentasDelDia(),
    montoVentasDia: montoVentasDelDia(),
    topProductos: topProductosVendidos(6),
    // --- Zona de reportes ---
    ventasSemana: ventasPorUltimosDias(7),
    pagosHoy: pagosDeHoy(),
    topDeudores: topDeudores(4),
    agotados: productosAgotados(4),
    ultimasVentas: ultimasVentas(5)
}));
// ===== Respaldo y recuperación profesional de la base de datos =====
canal("respaldo:exportar", async () => {
    const ahora = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    const nombre = `smartpospro-respaldo-${ahora.getFullYear()}-${pad(ahora.getMonth() + 1)}-${pad(ahora.getDate())}_${pad(ahora.getHours())}-${pad(ahora.getMinutes())}-${pad(ahora.getSeconds())}.db`;
    const resultado = await dialog.showSaveDialog(ventanaPrincipal, {
        title: "Guardar respaldo seguro de SmartPosPro",
        defaultPath: nombre,
        filters: [{ name: "Respaldo SmartPosPro", extensions: ["db"] }]
    });
    if (resultado.canceled || !resultado.filePath)
        return { ok: false, cancelado: true };
    const respaldo = exportarRespaldo(resultado.filePath);
    return { ok: true, ruta: respaldo.ruta, tamanoBytes: respaldo.tamanoBytes, tablas: respaldo.tablas };
});
canal("respaldo:estado", () => obtenerEstadoRespaldo());
canal("respaldo:seleccionar", async () => {
    const resultado = await dialog.showOpenDialog(ventanaPrincipal, {
        title: "Seleccionar respaldo de SmartPosPro",
        properties: ["openFile"],
        filters: [{ name: "Respaldo SmartPosPro", extensions: ["db"] }, { name: "Todos los archivos", extensions: ["*"] }]
    });
    if (resultado.canceled || !resultado.filePaths[0])
        return { ok: false, cancelado: true };
    // La selección solo inspecciona y valida; la restauración ocurre después de
    // que el usuario confirme en la interfaz y se vuelve a validar en el proceso principal.
    const seleccionado = resultado.filePaths[0];
    const info = prepararRespaldoParaRestaurar(seleccionado);
    return { ok: true, ruta: info.ruta, tablas: info.tablas, tamanoBytes: info.tamanoBytes, legacy: info.legacy };
});
canal("respaldo:restaurar", async (_evento, ruta) => {
    if (cajaAbierta()) {
        throw new Error("No se puede restaurar mientras existe un turno de caja abierto. Cierra la caja y vuelve a intentarlo.");
    }
    const resultado = restaurarRespaldo(ruta);
    // La conexión SQLite actual se cerró durante la restauración. Reiniciamos
    // Electron para que todos los módulos vuelvan a abrir la base restaurada.
    app.relaunch();
    app.exit(0);
    return resultado;
});
canal("respaldo:abrir-carpeta", async () => {
    const estado = obtenerEstadoRespaldo();
    const error = await shell.openPath(estado.carpeta);
    if (error)
        throw new Error(error);
    return { ok: true, carpeta: estado.carpeta };
});
// --- Canales IPC del módulo de Caja (turnos, movimientos y arqueo) ---
canal("caja:turno-abierto", () => cajaAbierta());
canal("caja:abrir", (_evento, usuario, montoInicial) => abrirCaja(usuario, montoInicial));
canal("caja:movimiento", (_evento, turnoId, tipo, concepto, monto) => registrarMovimiento(turnoId, tipo, concepto, monto));
canal("caja:cerrar", (_evento, turnoId, montoContado, notas) => cerrarCaja(turnoId, montoContado, notas));
canal("caja:resumen", (_evento, turnoId) => resumenTurno(turnoId));
canal("caja:turnos", (_evento, limite) => obtenerTurnos(limite ?? 15));
canal("caja:movimientos", (_evento, turnoId) => turnoId ? movimientosTurno(turnoId) : ultimosMovimientos(30));
// --- Canales IPC del módulo de Compras e Inventario ---
canal("proveedores:listar", () => listarProveedores());
canal("proveedores:crear", (_evento, datos) => crearProveedor(datos));
canal("proveedores:editar", (_evento, id, datos) => actualizarProveedor(id, datos));
canal("proveedores:eliminar", (_evento, id) => borrarProveedor(id));
canal("compras:registrar", (_evento, datos) => registrarCompra(datos));
canal("compras:listar", (_evento, limite) => obtenerCompras(limite ?? 30));
canal("compras:detalles", (_evento, compraId) => detallesCompra(compraId));
canal("inventario:ajustar", (_evento, productoId, cantidad, motivo, tipo) => ajustarInventario(productoId, cantidad, motivo, tipo));
canal("inventario:movimientos", (_evento, productoId, limite) => obtenerMovimientosInventario(productoId, limite ?? 60));
canal("inventario:critico", (_evento, umbral) => stockCritico(umbral));
canal("inventario:valorizado", () => inventarioValorizado());
// --- Canales IPC del módulo de Reportes ---
canal("reportes:completo", (_evento, desde, hasta) => reporteCompleto(desde, hasta));
canal("reportes:indicadores", () => indicadoresGenerales());
canal("reportes:resumen", (_evento, desde, hasta) => resumenVentas(desde, hasta));
canal("reportes:por-dia", (_evento, desde, hasta) => ventasPorDia(desde, hasta));
canal("reportes:top-productos", (_evento, desde, hasta) => productosMasVendidos(desde, hasta, 10));
canal("reportes:cartera", () => carteraPorCobrar());
canal("reportes:imprimir", (_evento, desde, hasta) => imprimirDocumentoA4(ventanaPrincipal, generarReporteImprimibleHTML(desde, hasta), "Reporte de gestión"));
// --- Impresión por documento: catálogo de documentos individuales -------------
// El usuario elige QUÉ imprimir (cuentas por cobrar, solo ventas, inventario...)
// en lugar de desmarcar secciones a mano. El catálogo vive en impresion/documentos.ts.
canal("documentos:listar", () => listarDocumentos());
canal("documentos:previa", (_evento, documentoId, desde, hasta, opciones) => vistaPreviaDocumento(documentoId, desde, hasta, opciones));
canal("documentos:imprimir", (_evento, documentoId, desde, hasta, opciones) => imprimirDocumento(ventanaPrincipal, documentoId, desde, hasta, opciones));
canal("documentos:pdf", (_evento, documentoId, desde, hasta, opciones) => exportarDocumentoPDF(ventanaPrincipal, documentoId, desde, hasta, opciones));
// --- Canales IPC del módulo de Configuración ---
canal("configuracion:obtener", () => obtenerConfiguracion());
canal("configuracion:guardar", (_evento, datos) => guardarConfiguracion(datos));
canal("configuracion:restablecer", () => restablecerConfiguracion());
canal("configuracion:formatear-moneda", (_evento, monto) => formatearMoneda(monto));
// --- Canales IPC del módulo de WhatsApp ---
canal("whatsapp:enviar-ticket", async (_evento, ventaId, numero) => {
    return enviarTicketWhatsApp(ventaId, numero);
});
canal("whatsapp:enviar-recordatorio", async (_evento, clienteId, numero) => {
    return enviarRecordatorioCreditoWhatsApp(clienteId, numero);
});
canal("whatsapp:enviar-catalogo", async (_evento, numero) => {
    return enviarCatalogoWhatsApp(numero);
});
canal("whatsapp:mensaje-libre", async (_evento, numero, mensaje) => {
    return enviarMensajeLibreWhatsApp(numero, mensaje);
});
canal("whatsapp:historial", (_evento, limit) => {
    return obtenerHistorialWhatsApp(limit ?? 50);
});
canal("whatsapp:historial-cliente", (_evento, clienteId) => {
    return obtenerHistorialPorClienteWhatsApp(clienteId);
});
canal("whatsapp:estadisticas", () => {
    return obtenerEstadisticasWhatsApp();
});
canal("whatsapp:config", () => {
    return leerWhatsAppConfig();
});
canal("whatsapp:guardar-config", async (_evento, datos) => {
    let advertenciaToken;
    // El token se valida y se guarda aparte para poder informar al usuario si es inválido.
    // Si el campo viene vacío, no se toca el token guardado (solo se actualiza el resto de la configuración).
    if (datos && Object.prototype.hasOwnProperty.call(datos, "token")) {
        const tokenTexto = String(datos.token ?? "").trim();
        const { token: _omitido, ...resto } = datos;
        datos = resto;
        if (tokenTexto) {
            const resultado = await guardarTokenValidado(tokenTexto);
            if (!resultado.ok)
                return resultado;
            advertenciaToken = resultado.advertencia;
        }
    }
    for (const [clave, valor] of Object.entries(datos)) {
        guardarWhatsAppConfig(clave, String(valor));
    }
    // Mapear variantes de nombres para mantener compatibilidad total
    const phoneVal = datos.phoneNumberId || datos.phoneId || datos.numero;
    if (phoneVal) {
        guardarWhatsAppConfig("numero", String(phoneVal));
        guardarWhatsAppConfig("phoneId", String(phoneVal));
        guardarWhatsAppConfig("phoneNumberId", String(phoneVal));
    }
    if (datos.habilitado !== undefined) {
        guardarWhatsAppConfig("habilitado", String(datos.habilitado));
    }
    if (advertenciaToken)
        return { ok: true, advertencia: advertenciaToken };
    return { ok: true };
});
canal("whatsapp:test-conexion", () => probarConexionWhatsApp());
// --- Canales IPC de impresión del comprobante de venta ---
// El renderer envía el HTML del comprobante y las opciones de papel; el proceso
// principal se encarga del envío a la impresora (térmica 80/58 mm u hoja) y de
// la exportación a PDF con el tamaño exacto.
canal("impresion:listar-impresoras", () => listarImpresoras(ventanaPrincipal));
canal("impresion:imprimir-ticket", (_evento, opciones) => imprimirTicket(ventanaPrincipal, opciones));
canal("impresion:guardar-pdf", (_evento, opciones) => guardarComprobantePDF(ventanaPrincipal, opciones));
// --- Canales IPC del módulo de Usuarios y acceso ---
// En la primera ejecución se crea la cuenta de administrador inicial para
// que siempre exista una forma de entrar al sistema.
const adminInicial = asegurarAdministradorInicial();
if (adminInicial) {
    console.log(`USUARIOS: cuenta inicial creada -> usuario "${USUARIO_INICIAL}" / contraseña "${CONTRASENA_INICIAL}" (cámbiala al entrar)`);
}
// Catálogos de apoyo para la interfaz (roles y módulos permitidos).
canal("usuarios:roles", () => ROLES.map((rol) => ({ rol, etiqueta: ETIQUETAS_ROL[rol] })));
canal("usuarios:modulos", () => [...MODULOS_SISTEMA]);
// --- Licenciamiento de SmartPosPro ---
canal("licencia:estado", () => obtenerEstadoLicencia());
canal("licencia:activar", async (_evento, codigo) => {
    return await activarLicencia(codigo);
});
canal("licencia:equipo", () => obtenerEquipoLicencia());
// Validación remota de la licencia al iniciar SmartPosPro.
// Este canal NO activa ni libera la licencia. Únicamente consulta al servidor
// si el equipo actual continúa autorizado para utilizar la licencia.
canal("licencia:validar-inicio", async () => {
    return await validarLicenciaAlIniciar();
});
// --- Autenticación ---
canal("auth:entrar", (evento, usuario, contrasena) => {
    if (!licenciaVigente())
        throw new Error("Activa SmartPosPro antes de iniciar sesión.");
    const sesion = autenticarse(usuario, contrasena, String(evento.sender.getUserAgent() ?? ""));
    // La sesión queda asociada a esta ventana: es la credencial de acceso.
    console.log("DIAG AUTH ENTRAR - ventana:", evento.sender.id, "usuario:", sesion.usuario);
    asociarSesion(evento.sender.id, sesion);
    console.log("DIAG AUTH ENTRAR - sesión asociada:", evento.sender.id);
    // El token nunca sale al renderer: se devuelve solo la información pública.
    const { token: _token, ...publico } = sesion;
    return publico;
});
canal("auth:salir", (evento) => {
    const cerrada = cerrarSesion(evento.sender.id);
    return { ok: cerrada };
});
canal("auth:sesion", (evento) => {
    console.log("DIAG AUTH SESION - ventana:", evento.sender.id);
    const sesion = sesionDeVentana(evento.sender.id);
    console.log("DIAG AUTH SESION - resultado:", sesion ? "ACTIVA" : "NULL");
    if (!sesion)
        return null;
    const { token: _token, ...publico } = sesion;
    return publico;
});
canal("auth:cambiar-contrasena", (evento, contrasenaActual, contrasenaNueva) => {
    const sesion = sesionDeVentana(evento.sender.id);
    if (!sesion)
        throw new Error("Debe iniciar sesión para continuar.");
    const actualizado = cambiarContrasena(sesion.id, contrasenaActual, contrasenaNueva);
    // La sesión sigue vigente: solo cambia la credencial.
    return actualizado;
});
// --- Gestión de usuarios (solo administradores) ---
canal("usuarios:listar", () => listarUsuarios());
canal("usuarios:resumen", () => resumenUsuarios());
canal("usuarios:crear", (_evento, datos) => crearUsuario(datos));
canal("usuarios:actualizar", (_evento, id, datos) => actualizarUsuario(id, datos));
canal("usuarios:eliminar", (_evento, id) => {
    eliminarUsuario(id);
    return true;
});
canal("usuarios:restablecer-contrasena", (_evento, id, contrasena) => restablecerContrasena(id, contrasena));
canal("usuarios:desbloquear", (_evento, id) => desbloquearUsuario(id));
canal("usuarios:bitacora", (_evento, limite) => obtenerBitacora(limite ?? 40));
canal("usuarios:total", () => contarUsuarios());
console.log("SmartPosPro iniciado");
app.whenReady().then(() => {
    // Menú de la aplicación ya traducido (Archivo, Editar, Ver, Ventana, Ayuda).
    configurarMenuAplicacion(() => ventanaPrincipal);
    crearVentana();
    // Respaldo automático diario: no sustituye el respaldo manual del usuario,
    // pero ofrece una red de seguridad adicional. Se conservan los 7 últimos.
    setTimeout(() => {
        try {
            const creado = crearRespaldoAutomatico();
            if (creado)
                console.log("RESPALDO AUTOMÁTICO CREADO:", creado.ruta);
        }
        catch (error) {
            console.error("RESPALDO AUTOMÁTICO: no se pudo crear", error);
        }
    }, 1800);
    app.on("activate", () => {
        if (BrowserWindow.getAllWindows().length === 0)
            crearVentana();
    });
});
app.on("window-all-closed", () => {
    if (process.platform !== "darwin")
        app.quit();
});
//# sourceMappingURL=app.js.map