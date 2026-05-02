/**
 * Procedural square album art — a vinyl-style cover with circular grooves
 * and abstract shapes. Returns a data: URL suitable for an HTMLImageElement
 * or Three.js TextureLoader.
 */
import { PALETTES } from './data';

function mulberry32(seed: number) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function makeArt(seed: number, palette: string[], size = 256): string {
  const rand = mulberry32(seed);
  const bg = palette[Math.floor(rand() * palette.length)];
  const c1 = palette[Math.floor(rand() * palette.length)];
  const c2 = palette[Math.floor(rand() * palette.length)];

  const shapes: string[] = [];
  const shapeCount = 3 + Math.floor(rand() * 4);
  for (let i = 0; i < shapeCount; i++) {
    const cx = rand() * size;
    const cy = rand() * size;
    const r = size * (0.08 + rand() * 0.22);
    const fill = rand() > 0.5 ? c1 : c2;
    const op = (0.55 + rand() * 0.4).toFixed(2);
    if (rand() > 0.4) {
      shapes.push(`<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${r.toFixed(1)}" fill="${fill}" opacity="${op}"/>`);
    } else {
      const w = r * 2;
      const h = r * (0.6 + rand() * 1.4);
      const rot = (rand() * 60 - 30).toFixed(1);
      shapes.push(`<rect x="${(cx - w / 2).toFixed(1)}" y="${(cy - h / 2).toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" fill="${fill}" opacity="${op}" transform="rotate(${rot} ${cx.toFixed(1)} ${cy.toFixed(1)})"/>`);
    }
  }

  // vinyl grooves — concentric circles + label
  const cx = size / 2;
  const grooves: string[] = [];
  for (let r = size * 0.18; r < size * 0.48; r += 4) {
    grooves.push(`<circle cx="${cx}" cy="${cx}" r="${r.toFixed(1)}" fill="none" stroke="rgba(0,0,0,0.06)" stroke-width="0.5"/>`);
  }
  // label
  grooves.push(`<circle cx="${cx}" cy="${cx}" r="${(size * 0.16).toFixed(1)}" fill="${c1}" opacity="0.85"/>`);
  // spindle hole
  grooves.push(`<circle cx="${cx}" cy="${cx}" r="${(size * 0.012).toFixed(1)}" fill="rgba(0,0,0,0.85)"/>`);

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}">
    <rect width="${size}" height="${size}" fill="${bg}"/>
    ${shapes.join('')}
    ${grooves.join('')}
  </svg>`;

  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

export function paletteFor(i: number) {
  return PALETTES[i % PALETTES.length];
}
