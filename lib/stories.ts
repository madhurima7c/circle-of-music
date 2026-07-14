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

/** Letters that don't NFKD-decompose to ASCII — folded by hand so
 *  "Fazıl Say" and "Fazil Say" collapse to the same key. */
const FOLD: Record<string, string> = {
  'ı': 'i', 'ø': 'o', 'ł': 'l', 'đ': 'd', 'ß': 'ss',
  'æ': 'ae', 'œ': 'oe', 'ð': 'd', 'þ': 'th',
};

/** Same normalization as lib/deezer.ts normName — keep in sync.
 *  Unicode-aware: CJK/Arabic/Cyrillic names keep their letters (a Korean
 *  artist must not normalize to the empty string). */
export function normKey(s: string): string {
  return String(s || '')
    .toLowerCase()
    .replace(/[ıøłđßæœðþ]/g, (c) => FOLD[c] ?? c)
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
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
