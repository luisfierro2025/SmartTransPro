// Prueba la cadena de corrupcion: UTF-8 -> CP1252 -> plegado a ASCII con perdida.
// '?' sustituye el plegado LOSSY; '?' se usa como comodin en la comparacion.
const fs = require("fs");

// plegado CP1252 -> ASCII observado en los archivos danados
const PLIEGA = {
  "\u00E2": "\uFFFD", "\u00A4": "\uFFFD", "\u00A2": "\uFFFD",
  "\u2030": "?", "\u2020": "?", "\u201A": "?", "\u201E": "?",
  "\u0160": "S", "\u0178": "Y", "\u017D": "Z", "\u0161": "s",
  "\u2014": "-", "\u2013": "-", "\u00A1": "!"
};

function pipeline(unicode) {
  const bytesLatin1 = Buffer.from(unicode, "utf8").toString("latin1"); // UTF-8 leido como CP1252
  let salida = "";
  for (const ch of bytesLatin1) salida += ch in PLIEGA ? PLIEGA[ch] : ch;
  return salida;
}

// Casos: [original esperado, forma danada observada]
const CASOS = [
  ["\u2264", "\uFFFD?\uFFFD", "Stock minimo (<= 5 uds)"],
  ["\u2192", "\uFFFD?'", "ventas-nav-flecha"],
  ["\u229F", "\uFFFDSY", "iconos productos"],
  ["\u2026", "\uFFFD?\uFFFD", "puntos suspensivos"],
  ["\u2212", "\uFFFD^'", "signo menos"],
  ["\u2715", "\uFFFDo.", "cerrar ficha"],
  ["\u00DA", "\uFFFDs", "Ultimos / Ultimo"],
  ["\u00C9", "\uFFFD?", "CREDITO"],
  ["\u00D3", '\uFFFD"', "N con tilde (OPERACION)"],
  ["\u00F3", "\uFFFD", "codigo / Activacion"],
  ["\u00D1", "\uFFFD'", "CONTRASENA"],
  ["\u00E1", "\uFFFD", "Catalogos / Bitacora"]
];

let ok = 0;
for (const [orig, esperado, nota] of CASOS) {
  const simulado = pipeline(orig);
  const coincide = simulado === esperado;
  if (coincide) ok++;
  const s = (x) => Array.from(x).map((c) => (c.codePointAt(0) < 128 ? c : "<" + c.codePointAt(0).toString(16).toUpperCase() + ">")).join("");
  console.log(
    (coincide ? "OK   " : "DIF  ") + s(orig).padEnd(9) +
    " simulado=" + s(simulado).padEnd(12) +
    " esperado=" + s(esperado).padEnd(12) + "  " + nota
  );
}
console.log("\n" + ok + "/" + CASOS.length + " casos reproducen exactamente los bytes danados.");