import { coverUrl, type CoverKind } from './covers';

/**
 * Loading-state gradient color helpers.
 *
 * We prefer colors sampled from the selected country / genre card covers. If
 * an artwork file is missing or canvas sampling fails, we fall back to stable
 * name-derived HSL tones so every pairing still has a palette.
 */

/** Hue (0–359) derived from a name — same hashing as the wheel placeholders. */
export function illustrationHue(name: string): number {
  const s = String(name ?? '');
  let hash = 0;
  for (let i = 0; i < s.length; i++) {
    hash = (hash * 31 + s.charCodeAt(i)) >>> 0;
  }
  return hash % 360;
}

/**
 * Base illustration tones for the center-card pending state. The two colors
 * become CSS custom properties (`--ill-country`, `--ill-genre`) consumed by
 * the loading-gradient styles in `globals.css`.
 */
export function illustrationGradientPair(
  country: string,
  genre: string,
): { country: string; genre: string } {
  const hc = illustrationHue(country);
  const hg = illustrationHue(genre);
  return {
    country: `hsl(${hc}, 48%, 40%)`,
    genre: `hsl(${hg}, 44%, 37%)`,
  };
}

function imageColor(
  kind: CoverKind,
  name: string,
  fallback: string,
): Promise<string> {
  return new Promise((resolve) => {
    if (typeof window === 'undefined') {
      resolve(fallback);
      return;
    }

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const size = 32;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) {
          resolve(fallback);
          return;
        }
        ctx.drawImage(img, 0, 0, size, size);
        const { data } = ctx.getImageData(0, 0, size, size);

        let r = 0, g = 0, b = 0, w = 0;
        for (let i = 0; i < data.length; i += 4) {
          const pr = data[i];
          const pg = data[i + 1];
          const pb = data[i + 2];
          const max = Math.max(pr, pg, pb);
          const min = Math.min(pr, pg, pb);
          const sat = max === 0 ? 0 : (max - min) / max;
          const lum = (0.2126 * pr + 0.7152 * pg + 0.0722 * pb) / 255;
          // Prefer saturated midtones from the card; ignore white/black border noise.
          const weight = Math.max(0.08, sat) * (1 - Math.abs(lum - 0.52));
          r += pr * weight; g += pg * weight; b += pb * weight; w += weight;
        }
        if (!w) {
          resolve(fallback);
          return;
        }
        resolve(`rgb(${Math.round(r / w)}, ${Math.round(g / w)}, ${Math.round(b / w)})`);
      } catch {
        resolve(fallback);
      }
    };
    img.onerror = () => resolve(fallback);
    img.src = coverUrl(kind, name);
  });
}

export async function resolveIllustrationGradientPair(
  country: string,
  genre: string,
): Promise<{ country: string; genre: string }> {
  const fallback = illustrationGradientPair(country, genre);
  const [countryColor, genreColor] = await Promise.all([
    imageColor('countries', country, fallback.country),
    imageColor('genres', genre, fallback.genre),
  ]);
  return { country: countryColor, genre: genreColor };
}
