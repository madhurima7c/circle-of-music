/**
 * MusicBrainz artist-discovery proxy.
 *
 * Why server-side:
 *   - Browsers can't set a custom `User-Agent` header, but MusicBrainz
 *     requires one. From a Route Handler we control the headers fully.
 *   - MusicBrainz enforces a 1 req/sec rate limit per IP. We serialize calls
 *     here so we never exceed it even with concurrent users.
 *   - We cache results in process memory so each pairing only hits MB once
 *     per server lifetime (which for `next dev` is until restart).
 *
 * GET /api/musicbrainz?country=India&genre=Jazz
 *   → { artists: string[], source: 'cache' | 'musicbrainz' | 'mb-error' | ... }
 *
 * Pairings are whitelisted against seeds.json — this endpoint can't be
 * coerced into firing arbitrary MusicBrainz queries.
 */

import { NextResponse, type NextRequest } from 'next/server';
import seeds from '@/lib/seeds.json';
import geoIso from '@/lib/geo-iso.json';
import { COUNTRY_TO_ISO, GENRE_TO_MB_TAGS } from '@/lib/musicbrainz-tags';

/* ------------------------------------------------------------------
 *  Module-level state — persists for the life of the Node process.
 *  In dev, that's until the next `next dev` reload of this route file.
 * ------------------------------------------------------------------ */
const cache = new Map<string, string[]>();
let lastFetchAt = 0;
const MB_MIN_INTERVAL_MS = 1100;  // hair over their 1 req/sec rule
const MIN_SCORE = 75;             // MB relevance score 0–100; 100 = exact match
const MAX_ARTISTS = 14;

/** Single shared rate limiter — all callers funnel through here. */
async function rateLimitedFetch(url: string): Promise<Response> {
  const now = Date.now();
  const since = now - lastFetchAt;
  if (since < MB_MIN_INTERVAL_MS) {
    await new Promise((r) => setTimeout(r, MB_MIN_INTERVAL_MS - since));
  }
  lastFetchAt = Date.now();
  return fetch(url, {
    headers: {
      'User-Agent':
        'CircleOfMusic/1.0 ( https://github.com/madhurima7c/circle-of-music )',
      Accept: 'application/json',
    },
  });
}

type MBArtist = {
  name?: string;
  score?: number;
  country?: string;
  tags?: Array<{ name?: string; count?: number }>;
};

export async function GET(request: NextRequest) {
  const country = request.nextUrl.searchParams.get('country');
  const genre = request.nextUrl.searchParams.get('genre');

  if (!country || !genre) {
    return NextResponse.json({ error: 'country + genre required' }, { status: 400 });
  }

  // Whitelist: genres from the wheel; countries from the wheel OR any real
  // globe nation (geo-iso.json is generated from the Natural Earth data the
  // World globe renders) — still can't be coerced into arbitrary queries.
  const knownCountry =
    seeds.countries.includes(country) ||
    country in (geoIso as Record<string, string>);
  if (!knownCountry || !seeds.genres.includes(genre)) {
    return NextResponse.json({ error: 'unknown pairing' }, { status: 400 });
  }

  const key = `${country}|${genre}`;
  if (cache.has(key)) {
    return NextResponse.json({ artists: cache.get(key), source: 'cache' });
  }

  const iso = COUNTRY_TO_ISO[country] ?? (geoIso as Record<string, string>)[country];
  if (!iso) {
    cache.set(key, []);
    return NextResponse.json({ artists: [], source: 'no-iso' });
  }

  const tags = GENRE_TO_MB_TAGS[genre] ?? [genre.toLowerCase()];
  const tagClauses = tags.map((t) => `tag:"${t}"`).join(' OR ');
  const luceneQuery = `country:${iso} AND (${tagClauses})`;
  const url =
    `https://musicbrainz.org/ws/2/artist` +
    `?query=${encodeURIComponent(luceneQuery)}` +
    `&fmt=json&limit=${MAX_ARTISTS}`;

  try {
    const res = await rateLimitedFetch(url);
    if (!res.ok) {
      cache.set(key, []);
      return NextResponse.json(
        { artists: [], source: 'mb-error', status: res.status },
        { status: 200 },          // soft-fail to the caller
      );
    }
    const data = (await res.json()) as { artists?: MBArtist[] };
    const filtered = (data.artists ?? [])
      .filter((a) => (a.score ?? 0) >= MIN_SCORE)
      .map((a) => a.name)
      .filter((n): n is string => typeof n === 'string' && n.trim().length > 0)
      .slice(0, 12);

    cache.set(key, filtered);
    return NextResponse.json({ artists: filtered, source: 'musicbrainz' });
  } catch (e) {
    console.warn('musicbrainz fetch failed:', e);
    cache.set(key, []);                // negative-cache so a flaky network
                                       // doesn't hammer MB on every spin
    return NextResponse.json({ artists: [], source: 'fetch-failed' });
  }
}
