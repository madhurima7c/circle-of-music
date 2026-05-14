/**
 * Loading-state gradient color helpers — ported from Maddy's `src/assets.js`.
 *
 * Each country and each genre maps to a stable HSL hue derived from its name.
 * While a pairing's playlist is being fetched, the center-card background
 * blends two radial gradients tinted with these hues so the loading state
 * feels pairing-specific instead of being a generic spinner.
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
