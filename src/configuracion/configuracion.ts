import { db } from "../db/database.js";

// ===== Módulo de Configuración: parámetros del negocio y del sistema =====
db.exec(`
  CREATE TABLE IF NOT EXISTS configuracion (
    clave TEXT PRIMARY KEY,
    valor TEXT NOT NULL,
    actualizado TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
  )
`);

export interface ConfigNegocio {
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

export class ConfiguracionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfiguracionError";
  }
}

export const VALORES_POR_DEFECTO: ConfigNegocio = {
  nombre: "SmartPosPro",
  ruc: "",
  direccion: "",
  telefono: "",
  moneda: "C$",
  impuesto: 0,
  stockMinimo: 5,
  pieTicket: "¡Gracias por su compra!",
  tema: "corporativo"
};

function leerCruda(): Record<string, string> {
  const filas = db.prepare("SELECT clave, valor FROM configuracion").all() as Array<{ clave: string; valor: string }>;
  const mapa: Record<string, string> = {};
  filas.forEach((fila) => { mapa[fila.clave] = fila.valor; });
  return mapa;
}

function texto(crudo: Record<string, string>, clave: string, porDefecto: string): string {
  const valor = crudo[clave];
  return typeof valor === "string" && valor.trim().length > 0 ? valor : porDefecto;
}

function numero(crudo: Record<string, string>, clave: string, porDefecto: number): number {
  const valor = crudo[clave];
  if (valor === undefined) return porDefecto;
  const n = parseFloat(valor);
  return Number.isFinite(n) ? n : porDefecto;
}

export function obtenerConfiguracion(): ConfigNegocio {
  const crudo = leerCruda();
  return {
    nombre: texto(crudo, "nombre", VALORES_POR_DEFECTO.nombre),
    ruc: texto(crudo, "ruc", VALORES_POR_DEFECTO.ruc),
    direccion: texto(crudo, "direccion", VALORES_POR_DEFECTO.direccion),
    telefono: texto(crudo, "telefono", VALORES_POR_DEFECTO.telefono),
    moneda: texto(crudo, "moneda", VALORES_POR_DEFECTO.moneda),
    impuesto: numero(crudo, "impuesto", VALORES_POR_DEFECTO.impuesto),
    stockMinimo: numero(crudo, "stockMinimo", VALORES_POR_DEFECTO.stockMinimo),
    pieTicket: texto(crudo, "pieTicket", VALORES_POR_DEFECTO.pieTicket),
    tema: crudo.tema === "codigo" ? "codigo" : crudo.tema === "ejecutivo" ? "ejecutivo" : "corporativo"
  };
}

function validarConfiguracion(datos: ConfigNegocio) {
  if (!datos.nombre || datos.nombre.trim().length < 2) {
    throw new ConfiguracionError("El nombre del negocio debe tener al menos 2 caracteres.");
  }
  if (!datos.moneda || datos.moneda.trim().length === 0) {
    throw new ConfiguracionError("El símbolo de la moneda es obligatorio.");
  }
  if (!Number.isFinite(datos.impuesto) || datos.impuesto < 0 || datos.impuesto > 100) {
    throw new ConfiguracionError("El impuesto debe estar entre 0 y 100.");
  }
  if (!Number.isFinite(datos.stockMinimo) || datos.stockMinimo < 0) {
    throw new ConfiguracionError("El stock mínimo no puede ser negativo.");
  }
  if (datos.tema !== "corporativo" && datos.tema !== "ejecutivo" && datos.tema !== "codigo") {
    throw new ConfiguracionError("El tema seleccionado no es válido.");
  }
}

export function guardarConfiguracion(cambios: Partial<ConfigNegocio>): ConfigNegocio {
  const actual = obtenerConfiguracion();
  const fusionada: ConfigNegocio = { ...actual, ...cambios };
  validarConfiguracion(fusionada);

  // Fecha/hora local (no UTC) para que coincida con el resto de la base de datos
  const f = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  const fecha =
    `${f.getFullYear()}-${p(f.getMonth() + 1)}-${p(f.getDate())} ` +
    `${p(f.getHours())}:${p(f.getMinutes())}:${p(f.getSeconds())}`;
  const sentencia = db.prepare(`
    INSERT INTO configuracion (clave, valor, actualizado) VALUES (?, ?, ?)
    ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor, actualizado = excluded.actualizado
  `);

  const aplicar = db.transaction(() => {
    sentencia.run("nombre", fusionada.nombre.trim(), fecha);
    sentencia.run("ruc", fusionada.ruc.trim(), fecha);
    sentencia.run("direccion", fusionada.direccion.trim(), fecha);
    sentencia.run("telefono", fusionada.telefono.trim(), fecha);
    sentencia.run("moneda", fusionada.moneda.trim(), fecha);
    sentencia.run("impuesto", String(fusionada.impuesto), fecha);
    sentencia.run("stockMinimo", String(Math.round(fusionada.stockMinimo)), fecha);
    sentencia.run("pieTicket", fusionada.pieTicket.trim(), fecha);
    sentencia.run("tema", fusionada.tema, fecha);
  });
  aplicar();

  return obtenerConfiguracion();
}

export function restablecerConfiguracion(): ConfigNegocio {
  db.prepare("DELETE FROM configuracion").run();
  return obtenerConfiguracion();
}

export function formatearMoneda(monto: number): string {
  const config = obtenerConfiguracion();
  return config.moneda + (Number(monto) || 0).toFixed(2);
}