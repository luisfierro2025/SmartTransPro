// Detecta problemas de codificacion mas alla del mojibake clasico:
//  1) NFD (acentos descompuestos: "a" + U+0301) -> rompe busquedas y comparaciones
//  2) Espacios duros (NBSP U+00A0) y guionesOdd
//  3) Caracteres de reemplazo U+FFFD
//  4) Doble codificacion parcial
const fs = require("fs");
const p = require("path");

const EXT = new Set([".ts", ".js", ".html", ".css", ".json", ".sql"]);
const esc = (s) =>
  Array.from(String(s))
    .map((c) => (c.codePointAt(0) < 128 ? c : "\\u" + c.codePointAt(0).toString(16).toUpperCase().padStart(4, "0")))
    .join("");

const COMBINING = /[\u0300-\u036F\u1AB0-\u1AFF\u1DC0-\u1DFF\u20D0-\u20F0\uFE20-\uFE2F]/;
const NBSP = /[\u00A0\u2007\u202F]/;

function walk(dir, acc = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (["node_modules", ".git", "installer", "build", "respaldos"].includes(e.name)) continue;
    const f = p.join(dir, e.name);
    e.isDirectory() ? walk(f, acc) : acc.push(f);
  }
  return acc;
}

const raiz = process.argv[2] || "d:/SmartPosPro/src";
const archivos = walk(raiz).filter((f) => EXT.has(p.extname(f).toLowerCase()));

const resumen = [];
for (const f of archivos) {
  const txt = fs.readFileSync(f, "utf8");
  const lineas = txt.split(/\r?\n/);
  const hits = { nfd: [], nbsp: [], fffd: [] };
  lineas.forEach((l, i) => {
    if (COMBINING.test(l)) hits.nfd.push(i + 1);
    if (NBSP.test(l)) hits.nbsp.push(i + 1);
    if (l.includes("\uFFFD")) hits.fffd.push(i + 1);
  });
  if (hits.nfd.length || hits.nbsp.length || hits.fffd.length) {
    resumen.push({ f, hits });
    console.log("\n== " + f.replace(/\\/g, "/"));
    if (hits.nfd.length) console.log("   NFD/acentos descompuestos (" + hits.nfd.length + "):", hits.nfd.slice(0, 20).join(","));
    if (hits.nbsp.length) console.log("   Espacios duros (" + hits.nbsp.length + "):", hits.nbsp.slice(0, 20).join(","));
    if (hits.fffd.length) console.log("   U+FFFD reemplazo (" + hits.fffd.length + "):", hits.fffd.slice(0, 20).join(","));
  }
}
if (!resumen.length) console.log("Sin NFD, espacios duros ni U+FFFD en", raiz);
console.log("\nArchivos con hallazgos:", resumen.length);