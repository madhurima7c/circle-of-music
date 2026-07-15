import * as THREE from 'three';
import spineColors from './spine-colors.json';

/**
 * Cover art for wheel cards — real artwork from `public/covers/`.
 *
 * Each card is a thin box with three distinct surfaces:
 *   - FRONT: the cover image      `public/covers/<kind>/<slug>.jpg`
 *            (country_… / genre_… designs)
 *   - SPINE: the dedicated spine  `public/covers/<spine-dir>/<slug>.jpg`
 *            (countryspine_… / genrespine_… strips), on all four thin edges
 *   - BACK:  a solid fill of the spine's dominant color (spine-colors.json)
 *
 * Slugs are the seed name lowercased with spaces dashed ("South Africa" →
 * `south-africa`). Cards whose cover is missing fall back to the procedural
 * vinyl art in `lib/art.ts`, so the wheel still renders with an incomplete set.
 */
export type CoverKind = 'countries' | 'genres';

const SPINE_DIR: Record<CoverKind, string> = {
  countries: 'country-spines',
  genres: 'genre-spines',
};

const SPINE_COLORS = spineColors as Record<CoverKind, Record<string, string>>;

export function coverSlug(name: string): string {
  return name.toLowerCase().replace(/\s+/g, '-');
}

export function coverUrl(kind: CoverKind, name: string): string {
  return `/covers/${kind}/${coverSlug(name)}.jpg`;
}

export function spineUrl(kind: CoverKind, name: string): string {
  return `/covers/${SPINE_DIR[kind]}/${coverSlug(name)}.jpg`;
}

/** The card's back color — the spine's dominant color; neutral when unknown. */
export function backColor(kind: CoverKind, name: string): string {
  return SPINE_COLORS[kind]?.[coverSlug(name)] ?? '#1a1a1a';
}

export type CoverTextures = {
  front: THREE.Texture;   // the cover
  spine: THREE.Texture;   // the dedicated spine strip (four thin edges)
  backColor: string;      // solid fill for the −z face (matches the spine)
};

function loadTexture(url: string): Promise<THREE.Texture | null> {
  return new Promise((resolve) => {
    new THREE.TextureLoader().load(
      url,
      (t) => {
        t.colorSpace = THREE.SRGBColorSpace;
        t.anisotropy = 4;
        resolve(t);
      },
      undefined,
      () => resolve(null),
    );
  });
}

/**
 * A flat 8×128 texture of a single color — fallback spine when a card's
 * spine image is absent, so the edges still read as the card's own color.
 */
function solidTexture(color: string): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 8;
  c.height = 128;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, c.width, c.height);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * Load a card's front + spine textures and resolve its back color.
 * Resolves null when the cover image doesn't exist (procedural fallback).
 */
export async function loadCoverTextures(
  kind: CoverKind,
  name: string,
): Promise<CoverTextures | null> {
  const front = await loadTexture(coverUrl(kind, name));
  if (!front) return null;

  const back = backColor(kind, name);
  const spine = (await loadTexture(spineUrl(kind, name))) ?? solidTexture(back);

  return { front, spine, backColor: back };
}
