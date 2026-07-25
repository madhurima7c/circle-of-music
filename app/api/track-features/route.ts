/**
 * Audio-feature lookup for playlist sequencing.
 *
 * POST /api/track-features   { artists: string[] }
 *   → { features: { "<normalized artist>": { "<normalized title>": [tempo, energy, valence, key, mode] } } }
 *
 * Why server-side: `lib/track-features.json` is 7.6MB across 5,149 artists —
 * fine to hold once in a function's memory, absurd to hand to a browser. A
 * playlist touches ~10–30 artists, so the client asks for exactly those and
 * gets a few KB back.
 *
 * The index is a static import rather than a runtime file read so Next traces
 * it into the deployed function bundle without extra config. It is only ever
 * imported here, in a server module, so it never reaches the client bundle.
 *
 * There is nothing to rate-limit or protect here: the data is local, and the
 * response is a subset of a file we built ourselves.
 */

import { NextResponse, type NextRequest } from 'next/server';
import features from '@/lib/track-features.json';

type Tuple = [number, number, number, number, number];
const INDEX = features as unknown as Record<string, Record<string, Tuple>>;

/** Mirror of normName in lib/genre-rules.ts. */
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

/** One playlist's worth — a generous ceiling, not a meaningful limit. */
const MAX_ARTISTS = 100;

export async function POST(req: NextRequest) {
  let artists: unknown;
  try {
    ({ artists } = (await req.json()) as { artists?: unknown });
  } catch {
    return NextResponse.json({ error: 'expected JSON body' }, { status: 400 });
  }
  if (!Array.isArray(artists)) {
    return NextResponse.json({ error: 'expected { artists: string[] }' }, { status: 400 });
  }

  const out: Record<string, Record<string, Tuple>> = {};
  for (const raw of artists.slice(0, MAX_ARTISTS)) {
    if (typeof raw !== 'string') continue;
    const key = normName(raw);
    const hit = INDEX[key];
    if (hit) out[key] = hit;
  }

  return NextResponse.json(
    { features: out },
    // Immutable for the session: the index only changes when we rebuild it.
    { headers: { 'Cache-Control': 'public, max-age=3600' } },
  );
}
