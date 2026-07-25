import seeds from './seeds.json';

/**
 * Country + genre lists come from `seeds.json` — every pairing has at least
 * one curated seed artist mapped to a Deezer search, so the playlist API
 * actually returns music. The old alphabetical list lived here before; now
 * the seed file is the source of truth.
 *
 * Cast to readonly tuples so wheel index math stays type-safe.
 */
export const COUNTRIES: readonly string[] = seeds.countries;
export const GENRES:    readonly string[] = seeds.genres;

/** Re-export the typed seed object so callers (store, deezer) can pass it through. */
export const SEEDS = seeds;

export const PALETTES = [
  ['#e7d8c1', '#cf6655', '#274c77', '#f3a712', '#0e1116'],
  ['#f4f1de', '#e07a5f', '#3d405b', '#81b29a', '#f2cc8f'],
  ['#0a2463', '#fb3640', '#247ba0', '#e9c46a', '#264653'],
  ['#102f26', '#fbf8cc', '#f4978e', '#a4c3b2', '#cce3de'],
  ['#22223b', '#4a4e69', '#9a8c98', '#c9ada7', '#f2e9e4'],
];

/**
 * Normalized track type the rest of the app reads.
 * Maps from Deezer's nested shape — see `deezer.ts` for the raw fields.
 */
export type Track = {
  id: number;
  title: string;
  artist: string;
  artistId: number;
  album: string;
  releaseDate: string | null;
  duration: number | null;   // full-track length in seconds (Deezer)
  image: string;             // album cover (xl → big → small fallback)
  preview: string | null;    // ~30s MP3
  rank?: number;             // Deezer popularity — the only free familiarity
                             // signal we get, used to choose a playlist opener
};

/** Seconds → "m:ss" for queue rows and the progress readout. */
export function formatDuration(s: number | null | undefined): string {
  if (s == null || !isFinite(s) || s <= 0) return '–:––';
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${String(sec).padStart(2, '0')}`;
}
