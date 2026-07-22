// Erzeugt build/icon.png (512×512) ohne externe Abhängigkeiten (nur node:zlib).
// electron-builder leitet daraus automatisch die Windows-.ico ab.
import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const S = 512;
const buf = Buffer.alloc(S * S * 4);
const set = (x, y, r, g, b, a = 255) => {
  const i = (y * S + x) * 4;
  buf[i] = r; buf[i + 1] = g; buf[i + 2] = b; buf[i + 3] = a;
};
const lerp = (a, b, t) => Math.round(a + (b - a) * t);
const inRoundRect = (x, y, x0, y0, x1, y1, rad) => {
  if (x < x0 || x > x1 || y < y0 || y > y1) return false;
  const cx = Math.min(Math.max(x, x0 + rad), x1 - rad);
  const cy = Math.min(Math.max(y, y0 + rad), y1 - rad);
  return (x - cx) ** 2 + (y - cy) ** 2 <= rad * rad;
};

const BG = [14, 17, 23];          // #0e1117
const G0 = [45, 212, 191];        // #2dd4bf
const G1 = [14, 165, 233];        // #0ea5e9

for (let y = 0; y < S; y++) {
  for (let x = 0; x < S; x++) {
    let [r, g, b] = BG;
    if (inRoundRect(x, y, 64, 64, 448, 448, 72)) {
      const t = (x + y) / (2 * S);          // diagonaler Verlauf
      r = lerp(G0[0], G1[0], t);
      g = lerp(G0[1], G1[1], t);
      b = lerp(G0[2], G1[2], t);
    }
    // "L" in Hintergrundfarbe hineinschneiden
    const vBar = x >= 180 && x <= 232 && y >= 150 && y <= 360;
    const hBar = x >= 180 && x <= 344 && y >= 308 && y <= 360;
    if (vBar || hBar) [r, g, b] = BG;
    set(x, y, r, g, b);
  }
}

// PNG-Kodierung
const crcTable = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
const crc32 = (b) => {
  let c = 0xffffffff;
  for (let i = 0; i < b.length; i++) c = crcTable[(c ^ b[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const t = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([t, data])));
  return Buffer.concat([len, t, data, crc]);
};

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(S, 0); ihdr.writeUInt32BE(S, 4);
ihdr[8] = 8; ihdr[9] = 6; // 8-bit, RGBA

// Scanlines mit Filter-Byte 0
const raw = Buffer.alloc((S * 4 + 1) * S);
for (let y = 0; y < S; y++) {
  raw[y * (S * 4 + 1)] = 0;
  buf.copy(raw, y * (S * 4 + 1) + 1, y * S * 4, (y + 1) * S * 4);
}
const png = Buffer.concat([
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  chunk('IHDR', ihdr),
  chunk('IDAT', deflateSync(raw, { level: 9 })),
  chunk('IEND', Buffer.alloc(0)),
]);

const out = resolve(dirname(fileURLToPath(import.meta.url)), 'icon.png');
writeFileSync(out, png);
console.log(`icon.png geschrieben (${png.length} Bytes)`);
