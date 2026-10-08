// ==========================================================================
// Menú de la aplicación (barra de menús nativa de Windows)
// Traduce el menú por defecto de Electron y añade las acciones propias:
// cierre de sesión y créditos de la aplicación.
// ==========================================================================
import { Menu, app, dialog } from "electron";
/**
 * Construye el menú de la aplicación.
 * @param obtenerVentana devuelve la ventana principal para centrar los diálogos.
 */
export function configurarMenuAplicacion(obtenerVentana) {
    const plantilla = [
        {
            label: "&Archivo",
            submenu: [
                {
                    label: "Cerrar sesión",
                    click: () => {
                        const ventana = obtenerVentana();
                        // El cierre de sesión lo resuelve la interfaz para poder pedir
                        // confirmación y luego mostrar la pantalla de acceso.
                        if (ventana)
                            ventana.webContents.send("menu:cerrar-sesion");
                    }
                },
                { type: "separator" },
                { label: "Cerrar", accelerator: "CmdOrCtrl+W", role: "close" }
            ]
        },
        {
            label: "&Editar",
            submenu: [
                { label: "Deshacer", role: "undo" },
                { label: "Rehacer", role: "redo" },
                { type: "separator" },
                { label: "Cortar", role: "cut" },
                { label: "Copiar", role: "copy" },
                { label: "Pegar", role: "paste" },
                { type: "separator" },
                { label: "Seleccionar todo", role: "selectAll" }
            ]
        },
        {
            label: "&Ver",
            submenu: [
                { label: "Recargar", role: "reload" },
                { type: "separator" },
                { label: "Herramientas de desarrollo", role: "toggleDevTools" },
                { type: "separator" },
                { label: "Acercar", role: "zoomIn" },
                { label: "Alejar", role: "zoomOut" },
                { label: "Zoom normal", role: "resetZoom" },
                { type: "separator" },
                { label: "Pantalla completa", role: "togglefullscreen" }
            ]
        },
        {
            label: "&Ventana",
            submenu: [
                { label: "Minimizar", role: "minimize" },
                // En Windows el papel de "maximizar/restaurar" lo cumple el rol "zoom".
                { label: "Maximizar", role: "zoom" },
                { type: "separator" },
                { label: "Cerrar", role: "close" }
            ]
        },
        {
            label: "A&yuda",
            submenu: [
                {
                    label: "Acerca de SmartPosPro",
                    click: () => {
                        const ventana = obtenerVentana();
                        const opciones = {
                            type: "info",
                            title: "Acerca de SmartPosPro",
                            message: `SmartPosPro ${app.getVersion()}`,
                            detail: "Sistema de punto de venta y gestión de inventario.\n" +
                                "Copyright © 2026 Luis G. Fierro.\n" +
                                "Licencia ISC.",
                            buttons: ["Cerrar"]
                        };
                        if (ventana)
                            dialog.showMessageBox(ventana, opciones);
                        else
                            dialog.showMessageBox(opciones);
                    }
                }
            ]
        }
    ];
    Menu.setApplicationMenu(Menu.buildFromTemplate(plantilla));
}
//# sourceMappingURL=menu.js.map