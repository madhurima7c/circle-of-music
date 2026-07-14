/**
 * Curated "about this song" blurbs — the story layer of the track info
 * section. Facts (year, album) come straight from Deezer metadata; this
 * module only serves hand/scripts-curated prose from track-stories.json.
 *
 * Lookup order: exact pairing key `country|genre|artist` → plain artist
 * key. Returns null when nothing curated exists so the UI can fall back
 * to facts only.
 */

import stories from './track-stories.json';

const table = stories as Record<string, string>;

/** Same normalization as lib/deezer.ts normName — keep in sync. */
export function normKey(s: string): string {
  return String(s || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function storyFor(
  artist: string,
  country?: string,
  genre?: string,
): string | null {
  const a = normKey(artist);
  if (!a) return null;
  if (country && genre) {
    const paired = table[`${normKey(country)}|${normKey(genre)}|${a}`];
    if (typeof paired === 'string') return paired;
  }
  const plain = table[a];
  return typeof plain === 'string' ? plain : null;
}

/** "1998-05-22" → "1998"; guards Deezer's "0000-00-00" placeholder. */
export function releaseYear(releaseDate: string | null | undefined): string | null {
  const y = String(releaseDate || '').slice(0, 4);
  return /^[12]\d{3}$/.test(y) ? y : null;
}
