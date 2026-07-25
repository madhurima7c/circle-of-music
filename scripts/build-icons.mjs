/**
 * Rasterise the 8-square Circle of Music mark to TRANSPARENT PNGs.
 *
 *   node scripts/build-icons.mjs
 *
 * Why PNGs when app/icon.svg already exists: link unfurlers (WhatsApp,
 * iMessage, Slack) largely ignore SVG favicons. Given only an SVG they fall
 * back to the apple-touch-icon, and if that has a background plate the icon
 * shows as a white box beside the link. A transparent PNG is what those
 * clients actually render — the reference site does exactly this.
 *
 * Geometry mirrors app/icon.svg: four axis-aligned squares on the cardinal
 * points and four 45°-rotated squares on the diagonals, in a 938 unit box.
 * The rotated ones pivot about their own top-left corner, as in the SVG.
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const BOX = 938;          // source viewBox
const S = 180;            // square edge
const PAD = 70;           // breathing room so nothing touches a rounded crop
const COLOR = [0x73, 0x7c, 0xf4];

const SQUARES = [
  [379, 0], [379, 758], [758, 379], [0, 379],
];
const DIAMOND_PIVOTS = [
  [726.994, 77.8695], [191.006, 613.856],
  [726.994, 613.856], [191.006, 77.8694],
];

const H = S / Math.SQRT2;               // half-diagonal
const diamond = ([px, py]) => [
  [px, py], [px + H, py + H], [px, py + 2 * H], [px - H, py + H],
];

const pointInPoly = (x, y, poly) => {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
};

/** Coverage of one pixel, sampled SS×SS — cheap analytic antialiasing. */
const SS = 4;
function coverage(px, py, scale, polys, rects) {
  let hits = 0;
  for (let sy = 0; sy < SS; sy++) {
    for (let sx = 0; sx < SS; sx++) {
      const u = (px + (sx + 0.5) / SS) / scale - PAD;
      const v = (py + (sy + 0.5) / SS) / scale - PAD;
      let hit = false;
      for (const [rx, ry] of rects) {
        if (u >= rx && u < rx + S && v >= ry && v < ry + S) { hit = true; break; }
      }
      if (!hit) for (const poly of polys) if (pointInPoly(u, v, poly)) { hit = true; break; }
      if (hit) hits++;
    }
  }
  return hits / (SS * SS);
}

function renderRGBA(size) {
  const scale = size / (BOX + PAD * 2);
  const polys = DIAMOND_PIVOTS.map(diamond);
  const buf = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const a = coverage(x, y, scale, polys, SQUARES);
      const o = (y * size + x) * 4;
      buf[o] = COLOR[0]; buf[o + 1] = COLOR[1]; buf[o + 2] = COLOR[2];
      buf[o + 3] = Math.round(a * 255);          // transparent everywhere else
    }
  }
  return buf;
}

/* ---- minimal PNG writer (RGBA, no deps) ---- */
const crcTable = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();
const crc32 = (b) => {
  let c = -1;
  for (const byte of b) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
};
function encodePNG(rgba, size) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;                              // filter: none
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;  // 8-bit RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const targets = [
  ['app/icon.png', 512],        // what unfurlers actually read
  ['app/apple-icon.png', 180],  // iOS home screen / some previews
];
for (const [rel, size] of targets) {
  const out = path.resolve(process.cwd(), rel);
  await fs.writeFile(out, encodePNG(renderRGBA(size), size));
  const { size: bytes } = await fs.stat(out);
  console.log(`  ${rel.padEnd(22)} ${size}x${size}  ${(bytes / 1024).toFixed(1)} KB  (transparent)`);
}
