// =====================================================================================
// Catálogo de documentos imprimibles.
//
// El motor de `reportes-impresion.ts` sabe construir cualquier combinación de
// secciones, pero el usuario no elige "secciones": elige un DOCUMENTO. Aquí se
// declara cada documento una sola vez (título, secciones y filtros por defecto)
// y todo lo demás —IPC, vista previa, impresión y PDF— se apoya en esta tabla.
// Añadir un documento nuevo es agregar una entrada; no se toca ni el menú ni el
// motor de impresión.
// =====================================================================================

import type { SeccionReporte } from "../reportes/reportes-impresion.js";

export interface DefinicionDocumento {
  id: string;
  etiqueta: string;
  descripcion: string;
  grupo: "Resumen" | "Ventas" | "Cartera" | "Inventario";
  secciones: SeccionReporte[];
  titulo: string;
  /** Ajustes que el documento impone; el usuario puede variarlos. */
  sugerido: {
    tipoPago?: "todos" | "contado" | "credito";
    detalleArticulos?: boolean;
    firmas?: boolean;
  };
  /** El documento ignora el rango de fechas (son saldos del día). */
  ignoraPeriodo?: boolean;
  /** Nombre sugerido al exportar a PDF (sin extensión). */
  archivo: string;
}

export const DOCUMENTOS: readonly DefinicionDocumento[] = [
  {
    id: "general",
    etiqueta: "Reporte de gestión",
    descripcion: "El reporte completo: resumen, ventas, productos, clientes, cartera e inventario.",
    grupo: "Resumen",
    secciones: ["resumen", "ventas", "porDia", "topProductos", "categorias", "topClientes", "cartera", "cobrar", "criticos", "inventario"],
    titulo: "Reporte de gestión",
    sugerido: { tipoPago: "todos", detalleArticulos: false, firmas: true },
    archivo: "reporte-de-gestion"
  },
  {
    id: "resumen",
    etiqueta: "Resumen ejecutivo",
    descripcion: "Indicadores del período y mezcla entre contado y crédito en una hoja.",
    grupo: "Resumen",
    secciones: ["resumen"],
    titulo: "Resumen ejecutivo",
    sugerido: { tipoPago: "todos" },
    archivo: "resumen-ejecutivo"
  },
  {
    id: "ventas",
    etiqueta: "Listado de ventas",
    descripcion: "Todas las ventas del período con cliente, forma de pago y totales.",
    grupo: "Ventas",
    secciones: ["ventas"],
    titulo: "Listado de ventas",
    sugerido: { tipoPago: "todos", detalleArticulos: true },
    archivo: "listado-de-ventas"
  },
  {
    id: "ventas-dia",
    etiqueta: "Ventas por día",
    descripcion: "Movimiento diario del período con la participación de cada día.",
    grupo: "Ventas",
    secciones: ["porDia"],
    titulo: "Ventas por día",
    sugerido: {},
    archivo: "ventas-por-dia"
  },
  {
    id: "categorias",
    etiqueta: "Ventas por categoría",
    descripcion: "Qué categorías mueven el negocio y qué porcentaje del total representan.",
    grupo: "Ventas",
    secciones: ["categorias"],
    titulo: "Ventas por categoría",
    sugerido: {},
    archivo: "ventas-por-categoria"
  },
  {
    id: "productos",
    etiqueta: "Productos más vendidos",
    descripcion: "Ranking por unidades, con importe y utilidad estimada de cada producto.",
    grupo: "Ventas",
    secciones: ["topProductos"],
    titulo: "Productos más vendidos",
    sugerido: {},
    archivo: "productos-mas-vendidos"
  },
  {
    id: "top-clientes",
    etiqueta: "Mejores clientes",
    descripcion: "Quiénes más compran y cuánta parte de su compra fue a crédito.",
    grupo: "Ventas",
    secciones: ["topClientes"],
    titulo: "Mejores clientes",
    sugerido: {},
    archivo: "mejores-clientes"
  },
  {
    id: "cuentas-por-cobrar",
    etiqueta: "Cuentas por cobrar",
    descripcion: "Factura por factura con saldo pendiente, días de atraso y vencido. Para llevar a cobro.",
    grupo: "Cartera",
    secciones: ["cobrar"],
    titulo: "Cuentas por cobrar",
    sugerido: { firmas: true },
    ignoraPeriodo: true,
    archivo: "cuentas-por-cobrar"
  },
  {
    id: "cartera",
    etiqueta: "Cartera por cliente",
    descripcion: "Resumen del saldo pendiente agrupado por cliente, con su límite de crédito.",
    grupo: "Cartera",
    secciones: ["cartera"],
    titulo: "Cartera por cobrar",
    sugerido: {},
    ignoraPeriodo: true,
    archivo: "cartera-por-cliente"
  },
  {
    id: "stock-critico",
    etiqueta: "Stock crítico",
    descripcion: "Productos en o por debajo del mínimo, para reorder. Valorizado a costo.",
    grupo: "Inventario",
    secciones: ["criticos"],
    titulo: "Stock crítico",
    sugerido: {},
    ignoraPeriodo: true,
    archivo: "stock-critico"
  },
  {
    id: "inventario",
    etiqueta: "Inventario valorizado",
    descripcion: "Valor del inventario a costo y a precio de venta, con utilidad potencial.",
    grupo: "Inventario",
    secciones: ["inventario"],
    titulo: "Inventario valorizado",
    sugerido: {},
    ignoraPeriodo: true,
    archivo: "inventario-valorizado"
  }
];

export const GRUPOS_DOCUMENTOS = ["Resumen", "Ventas", "Cartera", "Inventario"] as const;

const POR_ID = new Map(DOCUMENTOS.map((d) => [d.id, d]));

/** Documento completo, con todas sus secciones (así es como se imprimía antes). */
export const DOCUMENTO_GENERAL = DOCUMENTOS[0]!;

/** Busca un documento por id; si no existe devuelve el reporte completo. */
export function obtenerDocumento(id: string | null | undefined): DefinicionDocumento {
  return POR_ID.get(String(id ?? "")) ?? DOCUMENTO_GENERAL;
}

/**
 * Fusiona la definición del documento con lo que el usuario eligió en pantalla.
 * El documento pone la base (secciones y título) y la pantalla añade filtros,
 * observaciones o firmas; las secciones nunca se agregan por accidente.
 */
export function resolverOpciones(
  documentoId: string | null | undefined,
  opciones?: {
    titulo?: string;
    observaciones?: string;
    tipoPago?: string;
    busqueda?: string;
    detalleArticulos?: boolean;
    firmas?: boolean;
    acento?: string;
  }
) {
  const doc = obtenerDocumento(documentoId);
  const pedido = opciones?.tipoPago;
  return {
    secciones: [...doc.secciones],
    titulo: String(opciones?.titulo ?? "").trim() || doc.titulo,
    observaciones: String(opciones?.observaciones ?? ""),
    tipoPago:
      pedido === "contado" || pedido === "credito" ? pedido : doc.sugerido.tipoPago ?? "todos",
    busqueda: String(opciones?.busqueda ?? ""),
    detalleArticulos:
      opciones?.detalleArticulos !== undefined
        ? opciones.detalleArticulos === true
        : doc.sugerido.detalleArticulos === true,
    firmas:
      opciones?.firmas !== undefined ? opciones.firmas === true : doc.sugerido.firmas === true,
    acento:
      typeof opciones?.acento === "string" && /^#[0-9a-f]{6}$/i.test(opciones.acento)
        ? opciones.acento
        : "#1d4ed8"
  };
}