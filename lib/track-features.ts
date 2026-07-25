/**
 * Client-side audio-feature cache feeding the playlist sequencer.
 *
 * The sequencer runs synchronously while ordering a playlist, so it cannot
 * await a fetch mid-walk. Instead the store primes this cache once per
 * pairing — `primeFeatures(tracks)` — and the sequencer then reads it through
 * `lookupFeatures`, which is a plain synchronous map hit.
 *
 * Everything here fails soft. If the request errors, times out, or the app is
 * offline, `lookupFeatures` simply returns undefined for every track and the
 * sequencer falls back to its data-free spine (familiar opener, artist
 * spread, era interleave). Sequencing must never block or break playback —
 * a slightly less elegant running order is not worth a stall.
 */

import type { Track } from './data';
import type { AudioFeatures } from './sequence';

type Tuple = [number, number, number, number, number]; // tempo, energy, valence, key, mode

/** Artists we have already asked about — including ones that came back empty,
 *  so a pairing of unknown artists doesn't re-ask on every spin. */
const asked = new Set<string>();
const byArtist = new Map<string, Record<string, Tuple>>();

const FOLD: Record<string, string> = {
  'ı': 'i', 'ø': 'o', 'ł': 'l', 'đ': 'd', 'ß': 'ss',
  'æ': 'ae', 'œ': 'oe', 'ð': 'd', 'þ': 'th',
};
function normName(s: string): string {
  return String(s || '')
    .toLowerCase()
    .replace(/[ıøłđßæœðþ]/g, (c) => FOLD[c] ?? c)
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

/** Mirror of normTitle in lib/deezer.ts — the single and the album cut of one
 *  song must resolve to the same features. */
function normTitle(s: string): string {
  return normName(
    String(s || '')
      .replace(/\s*[([][^)\]]*[)\]]/g, '')
      .replace(/\s*-\s*(remaster(ed)?( \d{4})?|radio edit|single version|album version|live|edit)\b.*$/i, ''),
  );
}

const FETCH_TIMEOUT_MS = 4000;

/**
 * Fetch features for every artist in `tracks` that we have not asked about.
 * Safe to await before curating; resolves quietly on any failure.
 */
export async function primeFeatures(tracks: Array<{ artist: string }>): Promise<void> {
  if (typeof window === 'undefined') return;
  const need = [...new Set(tracks.map((t) => normName(t.artist)))]
    .filter((a) => a && !asked.has(a));
  if (!need.length) return;
  for (const a of need) asked.add(a);

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    const res = await fetch('/api/track-features', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ artists: need }),
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) return;
    const { features } = (await res.json()) as { features?: Record<string, Record<string, Tuple>> };
    for (const [artist, titles] of Object.entries(features || {})) byArtist.set(artist, titles);
  } catch {
    // Offline, aborted, or the route is missing — the sequencer copes.
  }
}

/** Synchronous lookup for the sequencer. Undefined means "we don't know". */
export function lookupFeatures(track: Track): AudioFeatures | undefined {
  const titles = byArtist.get(normName(track.artist));
  if (!titles) return undefined;
  const tuple = titles[normTitle(track.title)];
  if (!tuple) return undefined;
  const [tempo, energy, valence, key, mode] = tuple;
  return {
    tempo: tempo > 0 ? tempo : undefined,
    energy: energy >= 0 ? energy : undefined,
    valence: valence >= 0 ? valence : undefined,
    key: key >= 0 ? key : undefined,
    mode: mode >= 0 ? mode : undefined,
  };
}

/** How much of a playlist we actually have data for — used by the audit. */
export function featureCoverage(tracks: Track[]): { known: number; total: number } {
  let known = 0;
  for (const t of tracks) if (lookupFeatures(t)) known++;
  return { known, total: tracks.length };
}
