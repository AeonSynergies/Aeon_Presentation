// Generates the two icons Teams requires in an app package — color.png (192x192, full
// color) and outline.png (32x32, transparent background, white silhouette only) — as
// plain, valid PNGs written by hand via Node's built-in zlib. No image-editing tool
// (ImageMagick, PIL, sharp) was available in the environment this was built in; this
// script is kept alongside the generated files so the icons can be regenerated or tweaked
// without needing one either. Re-run with `node generate-icons.mjs` from this directory.
import { writeFileSync } from "node:fs";
import { deflateSync } from "node:zlib";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dir = path.dirname(fileURLToPath(import.meta.url));

function crc32(buf) {
  let c;
  const table = crc32.table ?? (crc32.table = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c >>> 0;
    }
    return t;
  })());
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) crc = table[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type, "ascii");
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

/** pixelFn(x, y) -> [r, g, b, a], each 0-255. */
function buildPng(width, height, pixelFn) {
  const raw = Buffer.alloc(height * (1 + width * 4));
  let offset = 0;
  for (let y = 0; y < height; y++) {
    raw[offset++] = 0; // filter type: none
    for (let x = 0; x < width; x++) {
      const [r, g, b, a] = pixelFn(x, y);
      raw[offset++] = r;
      raw[offset++] = g;
      raw[offset++] = b;
      raw[offset++] = a;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type: RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  const idat = deflateSync(raw);
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  return Buffer.concat([signature, chunk("IHDR", ihdr), chunk("IDAT", idat), chunk("IEND", Buffer.alloc(0))]);
}

function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

// color.png — 192x192, the app's brand teal background with a lighter amber circle,
// echoing the wordmark's own "dot" mark (apps/web/src/components/layout/Header.tsx).
const TEAL = hexToRgb("#0C7B82");
const AMBER = hexToRgb("#16A6CE");
const COLOR_SIZE = 192;
const colorPng = buildPng(COLOR_SIZE, COLOR_SIZE, (x, y) => {
  const cx = COLOR_SIZE / 2;
  const cy = COLOR_SIZE / 2;
  const r = COLOR_SIZE * 0.32;
  const inCircle = (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
  const [cr, cg, cb] = inCircle ? AMBER : TEAL;
  return [cr, cg, cb, 255];
});
writeFileSync(path.join(dir, "color.png"), colorPng);

// outline.png — 32x32, transparent background, a single white filled circle — Teams'
// required monochrome silhouette style for the left-rail icon.
const OUTLINE_SIZE = 32;
const outlinePng = buildPng(OUTLINE_SIZE, OUTLINE_SIZE, (x, y) => {
  const cx = OUTLINE_SIZE / 2;
  const cy = OUTLINE_SIZE / 2;
  const r = OUTLINE_SIZE * 0.34;
  const inCircle = (x - cx + 0.5) ** 2 + (y - cy + 0.5) ** 2 <= r * r;
  return inCircle ? [255, 255, 255, 255] : [255, 255, 255, 0];
});
writeFileSync(path.join(dir, "outline.png"), outlinePng);

console.log("Wrote color.png (192x192) and outline.png (32x32) to", dir);
