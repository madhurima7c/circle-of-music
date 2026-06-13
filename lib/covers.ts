import * as THREE from 'three';

/**
 * Cover art for wheel cards — real artwork from `public/covers/`.
 *
 * Files are normalized at import time (see covers/ originals → 1024×1024
 * JPEG): `public/covers/<kind>/<slug>.jpg`, where slug is the seed name
 * lowercased with spaces dashed ("South Africa" → `south-africa.jpg`).
 *
 * Cards whose cover is missing fall back to the procedural vinyl art in
 * `lib/art.ts`, so the wheel renders even with an incomplete cover set.
 */
export type CoverKind = 'countries' | 'genres';

export function coverSlug(name: string): string {
  return name.toLowerCase().replace(/\s+/g, '-');
}

export function coverUrl(kind: CoverKind, name: string): string {
  return `/covers/${kind}/${coverSlug(name)}.jpg`;
}

export type CoverTextures = {
  front: THREE.Texture;   // the cover
  back:  THREE.Texture;   // same cover, mirror-corrected for the −z face
  spine: THREE.Texture;   // vertical gradient of the cover's own colors
};

/** Average RGB of a horizontal band of pixel data. */
function bandAverage(
  data: Uint8ClampedArray,
  width: number,
  rowStart: number,
  rowEnd: number,
): string {
  let r = 0, g = 0, b = 0, n = 0;
  for (let y = rowStart; y < rowEnd; y++) {
    for (let x = 0; x < width; x++) {
      const o = (y * width + x) * 4;
      r += data[o]; g += data[o + 1]; b += data[o + 2]; n++;
    }
  }
  return `rgb(${Math.round(r / n)}, ${Math.round(g / n)}, ${Math.round(b / n)})`;
}

/**
 * Spine texture: a vertical gradient through the average colors of the
 * cover's top, middle, and bottom thirds — so every spine is "a gradient
 * of the colors on the cover" with no extra assets.
 */
function makeSpineGradient(image: CanvasImageSource): THREE.CanvasTexture {
  const S = 24; // sample resolution — averages don't need more
  const sample = document.createElement('canvas');
  sample.width = S;
  sample.height = S;
  const sctx = sample.getContext('2d')!;
  sctx.drawImage(image, 0, 0, S, S);
  const { data } = sctx.getImageData(0, 0, S, S);

  const top = bandAverage(data, S, 0, S / 3);
  const mid = bandAverage(data, S, S / 3, (2 * S) / 3);
  const bot = bandAverage(data, S, (2 * S) / 3, S);

  const out = document.createElement('canvas');
  out.width = 8;
  out.height = 128;
  const ctx = out.getContext('2d')!;
  const grad = ctx.createLinearGradient(0, 0, 0, out.height);
  grad.addColorStop(0, top);
  grad.addColorStop(0.5, mid);
  grad.addColorStop(1, bot);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, out.width, out.height);

  const tex = new THREE.CanvasTexture(out);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * Load a card's cover and derive its three textures.
 * Resolves null when the cover image doesn't exist (procedural fallback).
 */
export function loadCoverTextures(
  kind: CoverKind,
  name: string,
): Promise<CoverTextures | null> {
  return new Promise((resolve) => {
    new THREE.TextureLoader().load(
      coverUrl(kind, name),
      (front) => {
        front.colorSpace = THREE.SRGBColorSpace;
        front.anisotropy = 4;

        // Wheel cards tip over the X axis (xTilt), so a card's back is seen
        // top-over-bottom — which reads the −z face rotated 180°. Rotate the
        // back texture by π so backs appear upright from that viewpoint.
        const back = front.clone();
        back.center.set(0.5, 0.5);
        back.rotation = Math.PI;
        back.needsUpdate = true;

        const spine = makeSpineGradient(front.image as CanvasImageSource);
        resolve({ front, back, spine });
      },
      undefined,
      () => resolve(null),
    );
  });
}
