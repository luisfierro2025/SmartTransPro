/**
 * Genera los iconos de SmartPosPro (build/icon.png y build/icon.ico)
 * sin dependencias externas: dibuja el lienzo en memoria y lo serializa
 * a PNG (zlib de Node) y a ICO multirresolución (PNG embebido, Windows Vista+).
 *
 * Uso:  node tools/generar-icono.cjs
 */
const fs = require("node:fs");
const path = require("node:path");
const zlib = require("node:zlib");

const RAIZ = path.resolve(__dirname, "..");
const SALIDA = path.join(RAIZ, "build");

// ---------------------------------------------------------------- PNG ------

const TABLA_CRC = (() => {
  const tabla = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    tabla[n] = c;
  }
  return tabla;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = TABLA_CRC[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function trozoPng(tipo, datos) {
  const largo = Buffer.alloc(4);
  largo.writeUInt32BE(datos.length, 0);
  const cuerpo = Buffer.concat([Buffer.from(tipo, "ascii"), datos]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(cuerpo), 0);
  return Buffer.concat([largo, cuerpo, crc]);
}

/** Serializa un lienzo RGBA (sin alfa premultiplicado) a bytes PNG. */
function aPng(ancho, alto, rgba) {
  const salto = ancho * 4;
  const crudo = Buffer.alloc((salto + 1) * alto);
  for (let y = 0; y < alto; y++) {
    crudo[y * (salto + 1)] = 0; // filtro "None"
    rgba.copy(crudo, y * (salto + 1) + 1, y * salto, (y + 1) * salto);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(ancho, 0);
  ihdr.writeUInt32BE(alto, 4);
  ihdr[8] = 8; // profundidad de bits
  ihdr[9] = 6; // color RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    trozoPng("IHDR", ihdr),
    trozoPng("IDAT", zlib.deflateSync(crudo, { level: 9 })),
    trozoPng("IEND", Buffer.alloc(0))
  ]);
}

/** Empaqueta varios PNG en un único archivo ICO multirresolución. */
function aIco(imagenes) {
  const cabecera = Buffer.alloc(6 + 16 * imagenes.length);
  cabecera.writeUInt16LE(0, 0); // reservado
  cabecera.writeUInt16LE(1, 2); // tipo: icono
  cabecera.writeUInt16LE(imagenes.length, 4);

  const cuerpos = [];
  let desplazamiento = cabecera.length;
  imagenes.forEach((img, i) => {
    const base = 6 + 16 * i;
    cabecera.writeUInt8(img.lado >= 256 ? 0 : img.lado, base); // 0 significa 256
    cabecera.writeUInt8(img.lado >= 256 ? 0 : img.lado, base + 1);
    cabecera.writeUInt8(0, base + 2); // paleta
    cabecera.writeUInt8(0, base + 3); // reservado
    cabecera.writeUInt16LE(1, base + 4); // planos
    cabecera.writeUInt16LE(32, base + 6); // bits por píxel
    cabecera.writeUInt32LE(img.png.length, base + 8);
    cabecera.writeUInt32LE(desplazamiento, base + 12);
    desplazamiento += img.png.length;
    cuerpos.push(img.png);
  });

  return Buffer.concat([cabecera, ...cuerpos]);
}

// -------------------------------------------------------------- Dibujo -----
// Todo se define sobre un lienzo lógico de 512x512 y se escala al tamaño pedido.

const LADO = 512;
const MUESTRAS = 2; // 2x2 muestras por píxel -> bordes suavizados

function dentroRedondeado(x, y, x0, y0, ancho, alto, radio) {
  if (x < x0 || y < y0 || x > x0 + ancho || y > y0 + alto) return false;
  const cx = Math.min(Math.max(x, x0 + radio), x0 + ancho - radio);
  const cy = Math.min(Math.max(y, y0 + radio), y0 + alto - radio);
  const dx = x - cx;
  const dy = y - cy;
  return dx * dx + dy * dy <= radio * radio;
}

const AZUL_TEAL = [15, 118, 110]; // --acento de la interfaz
const VERDE_TEAL = [20, 184, 166]; // --acento-claro
const BLANCO = [255, 255, 255];
const GRIS = [203, 213, 225];
const GRIS_TENUE = [148, 163, 184];

/** Devuelve [r, g, b, alfa] para un punto del lienzo lógico (alfa 0..1). */
function pintar(x, y) {
  if (!dentroRedondeado(x, y, 20, 20, LADO - 40, LADO - 40, 118)) return null;

  const t = Math.min(1, Math.max(0, (x + y) / (2 * LADO)));
  const fondo = [0, 1, 2].map((i) => Math.round(AZUL_TEAL[i] + (VERDE_TEAL[i] - AZUL_TEAL[i]) * t));

  // Muescas del borde inferior del comprobante: se recortan con el fondo.
  let recortado = true;
  for (const mx of [176, 256, 336]) {
    const dx = x - mx;
    const dy = y - 392;
    if (dx * dx + dy * dy <= 22 * 22) recortado = false;
  }

  // Comprobante de venta con sus líneas.
  if (recortado && dentroRedondeado(x, y, 132, 108, 248, 284, 34)) {
    if (dentroRedondeado(x, y, 172, 156, 168, 26, 13)) return [...GRIS, 1];
    if (dentroRedondeado(x, y, 172, 204, 168, 26, 13)) return [...GRIS, 1];
    if (dentroRedondeado(x, y, 172, 252, 104, 26, 13)) return [...GRIS_TENUE, 1];
    return [...BLANCO, 1];
  }
  return [...fondo, 1];
}

function renderizar(lado) {
  const escala = LADO / lado;
  const total = MUESTRAS * MUESTRAS;
  const rgba = Buffer.alloc(lado * lado * 4);
  for (let py = 0; py < lado; py++) {
    for (let px = 0; px < lado; px++) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (let sy = 0; sy < MUESTRAS; sy++) {
        for (let sx = 0; sx < MUESTRAS; sx++) {
          const x = (px + (sx + 0.5) / MUESTRAS) * escala;
          const y = (py + (sy + 0.5) / MUESTRAS) * escala;
          const c = pintar(x, y);
          if (c) {
            r += c[0] * c[3];
            g += c[1] * c[3];
            b += c[2] * c[3];
            a += c[3];
          }
        }
      }
      const i = (py * lado + px) * 4;
      rgba[i] = a > 0 ? Math.round(r / a) : 0;
      rgba[i + 1] = a > 0 ? Math.round(g / a) : 0;
      rgba[i + 2] = a > 0 ? Math.round(b / a) : 0;
      rgba[i + 3] = Math.round((a / total) * 255);
    }
  }
  return rgba;
}

function principal() {
  fs.mkdirSync(SALIDA, { recursive: true });

  const rutaPng = path.join(SALIDA, "icon.png");
  fs.writeFileSync(rutaPng, aPng(512, 512, renderizar(512)));
  console.log("icon.png ->", rutaPng, fs.statSync(rutaPng).size, "bytes");

  const multi = [16, 24, 32, 48, 64, 128, 256].map((lado) => ({
    lado,
    png: aPng(lado, lado, renderizar(lado))
  }));
  const rutaIco = path.join(SALIDA, "icon.ico");
  fs.writeFileSync(rutaIco, aIco(multi));
  console.log("icon.ico ->", rutaIco, fs.statSync(rutaIco).size, "bytes");
}

principal();
