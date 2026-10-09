// Escaneo de mojibake (doble codificacion UTF-8 -> Latin1) en el proyecto.
// Salida en ASCII seguro (\uXXXX) para evitar que la consola la corrompa.
const fs = require("fs");
const p = require("path");

const RAIZ = "d:/SmartPosPro";
const EXT = new Set([".ts", ".js", ".html", ".css", ".json", ".txt", ".md", ".sql"]);

// Secuencias tipicas de texto UTF-8 mal decodificado como Latin-1/Windows-1252
const RE_MOJI =
  /(?:\u00C3[\u0080-\u00BF\u00A0-\u00FF\u2018\u2019\u201C\u201D\u20AC\u2122\u00B0\u2020-\u2026])|(?:\u00C2[\u0080-\u00BF\u00A0-\u00FF\u2018\u2019\u201C\u201D\u20AC\u2122\u00B0\u2020-\u2026])|(?:\u00E2[\u0080-\u00BF\u00A0-\u00FF]{2,3})|(?:\u00EF\u00BF\u00BD)/g;

function walk(dir, acc = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (["node_modules", ".git", "installer", "build", "respaldos"].includes(e.name)) continue;
    const f = p.join(dir, e.name);
    e.isDirectory() ? walk(f, acc) : acc.push(f);
  }
  return acc;
}

function esc(s) {
  return Array.from(s)
    .map((c) => (c.codePointAt(0) < 128 ? c : "\\u" + c.codePointAt(0).toString(16).toUpperCase().padStart(4, "0")))
    .join("");
}

const todos = walk(RAIZ).filter((f) => EXT.has(p.extname(f).toLowerCase()));
const filas = [];
for (const f of todos) {
  const buf = fs.readFileSync(f);
  const texto = buf.toString("utf8");
  // BOM?
  const bom = buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf;
  const m = texto.match(RE_MOJI);
  if (m && m.length) filas.push({ f, n: m.length, uniq: [...new Set(m)], bom });
}

filas.sort((a, b) => b.n - a.n);
for (const r of filas) {
  console.log(String(r.n).padStart(5), r.bom ? "[BOM]" : "     ", r.f.replace(/\\/g, "/"));
  console.log("       ->", esc(r.uniq.join(" ")));
}
console.log("\nArchivos afectados:", filas.length, "| ocurrencias:", filas.reduce((a, b) => a + b.n, 0));