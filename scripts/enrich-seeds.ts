/**
 * Seed enrichment pipeline — proposes verified artists for weak pairings.
 * NEVER edits seeds.json itself: it writes seed-proposals.json + a readable
 * report for human review, mirroring the "review before seeds change" rule.
 *
 *   npm run enrich                       # all current FALLBACK + THIN pairings
 *   npm run enrich -- --pair "Iran|Reggae" --pair "Spain|Disco"
 *
 * Per pairing:
 *   1. Wikidata SPARQL — artists with citizenship/origin = country AND
 *      genre (or any subgenre, P279*) = the wheel genre, ranked by
 *      sitelink count (notability proxy).
 *   2. MusicBrainz — artists tagged country ISO + genre tag (same query the
 *      runtime proxy uses).
 *   3. Deezer verification — a candidate survives only if its name resolves
 *      to a Deezer artist (exact normalized match), and we record whether
 *      that artist has albums tagged with the wheel genre (strong signal
 *      the pairing will actually sound right).
 */

import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.join(__dirname, '..');
const seeds = JSON.parse(readFileSync(path.join(ROOT, 'lib', 'seeds.json'), 'utf8')) as {
  countries: string[];
  genres: string[];
  artists: Record<string, Record<string, string[]>>;
};

const UA = 'MusicExploration/0.1 ( https://github.com/madhurima7c/circle-of-music )';
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/* Keep in sync with lib/musicbrainz-tags.ts + lib/deezer.ts (script runs in
 * node — the lib modules are written for the browser). */
import { COUNTRY_TO_ISO, GENRE_TO_MB_TAGS } from '../lib/musicbrainz-tags';

const WHEEL_TO_DEEZER_GENRE_IDS: Record<string, number[]> = {
  'Afrobeats':  [12, 165],
  'Ambient':    [106],
  'Bossa Nova': [129, 81],
  'Classical':  [98],
  'Cumbia':     [197],
  'Disco':      [113, 132],
  'Electronic': [106, 113],
  'Folk':       [466, 169],
  'Funk':       [165],
  'Hip Hop':    [116],
  'House':      [113],
  'Indie':      [152, 132],
  'Jazz':       [129],
  'Pop':        [132],
  'Punk':       [152],
  'Reggae':     [144],
  'Rock':       [152],
  'Soul':       [165],
  'Techno':     [113],
  'World':      [2, 12, 16, 197],
};

function normName(s: string): string {
  return String(s || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/* ---------- which pairings need help (mirrors audit-pairings.ts) ---------- */
const RELATED_GENRES: Record<string, string[]> = {
  'Bossa Nova': ['Jazz'],
  Classical: ['Ambient'],
  Cumbia: ['World', 'Folk'],
  Disco: ['Funk', 'Soul'],
  Punk: ['Rock', 'Indie'],
  Electronic: ['House', 'Techno', 'Ambient'],
  'Hip Hop': ['Soul', 'Funk'],
  Rock: ['Indie', 'Punk'],
  Indie: ['Rock', 'Pop'],
  Jazz: ['Soul', 'Funk', 'World'],
  Soul: ['Funk', 'Hip Hop'],
  Funk: ['Soul', 'Hip Hop'],
  Pop: ['Indie', 'Soul'],
  Folk: ['World', 'Indie'],
  World: ['Folk', 'Jazz'],
  Afrobeats: ['Pop', 'Hip Hop'],
  House: ['Electronic', 'Techno'],
  Techno: ['Electronic', 'House'],
  Ambient: ['Electronic', 'Classical'],
};

function weakPairings(): Array<[string, string]> {
  const out: Array<[string, string]> = [];
  for (const c of seeds.countries) {
    for (const g of seeds.genres) {
      const direct = seeds.artists[c]?.[g]?.length ?? 0;
      if (direct >= 2) continue;
      const related = (RELATED_GENRES[g] || []).some(
        (r) => (seeds.artists[c]?.[r]?.length ?? 0) >= 2,
      );
      if (direct === 0 && !related) out.push([c, g]);  // FALLBACK
      else if (direct === 1) out.push([c, g]);         // THIN
    }
  }
  return out;
}

/* ---------- Wikidata ---------- */
const genreQidCache = new Map<string, string | null>();

async function wikidataApi(params: Record<string, string>): Promise<Record<string, unknown>> {
  const qs = new URLSearchParams({ ...params, format: 'json' });
  const res = await fetch(`https://www.wikidata.org/w/api.php?${qs}`, {
    headers: { 'User-Agent': UA },
  });
  return res.ok ? ((await res.json()) as Record<string, unknown>) : {};
}

/** Wheel genre name → Wikidata genre item (resolved by search, cached). */
async function genreQid(genre: string): Promise<string | null> {
  if (genreQidCache.has(genre)) return genreQidCache.get(genre)!;
  const search = `${genre.toLowerCase()}${/music|nova|hop/i.test(genre) ? '' : ' music'}`;
  const data = (await wikidataApi({
    action: 'wbsearchentities',
    search,
    language: 'en',
    type: 'item',
    limit: '1',
  })) as { search?: Array<{ id: string }> };
  const id = data.search?.[0]?.id ?? null;
  genreQidCache.set(genre, id);
  return id;
}

async function countryQid(country: string): Promise<string | null> {
  const data = (await wikidataApi({
    action: 'wbsearchentities',
    search: country,
    language: 'en',
    type: 'item',
    limit: '1',
  })) as { search?: Array<{ id: string }> };
  return data.search?.[0]?.id ?? null;
}

async function wikidataArtists(country: string, genre: string): Promise<string[]> {
  const [cQ, gQ] = [await countryQid(country), await genreQid(genre)];
  if (!cQ || !gQ) return [];
  const sparql = `
    SELECT DISTINCT ?artistLabel ?links WHERE {
      ?artist wdt:P136/wdt:P279* wd:${gQ} .
      { ?artist wdt:P27 wd:${cQ} } UNION { ?artist wdt:P495 wd:${cQ} }
      ?artist wikibase:sitelinks ?links .
      SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
    } ORDER BY DESC(?links) LIMIT 25`;
  try {
    const res = await fetch(
      `https://query.wikidata.org/sparql?query=${encodeURIComponent(sparql)}`,
      { headers: { 'User-Agent': UA, Accept: 'application/sparql-results+json' } },
    );
    if (!res.ok) return [];
    const data = (await res.json()) as {
      results?: { bindings?: Array<{ artistLabel?: { value?: string } }> };
    };
    return (data.results?.bindings ?? [])
      .map((b) => b.artistLabel?.value ?? '')
      .filter((n) => n && !/^Q\d+$/.test(n));
  } catch {
    return [];
  }
}

/* ---------- MusicBrainz ---------- */
let lastMb = 0;
async function musicbrainzArtists(country: string, genre: string): Promise<string[]> {
  const iso = COUNTRY_TO_ISO[country];
  if (!iso) return [];
  const tags = GENRE_TO_MB_TAGS[genre] ?? [genre.toLowerCase()];
  const q = `country:${iso} AND (${tags.map((t) => `tag:"${t}"`).join(' OR ')})`;
  const wait = 1100 - (Date.now() - lastMb);
  if (wait > 0) await sleep(wait);
  lastMb = Date.now();
  try {
    const res = await fetch(
      `https://musicbrainz.org/ws/2/artist?query=${encodeURIComponent(q)}&fmt=json&limit=14`,
      { headers: { 'User-Agent': UA, Accept: 'application/json' } },
    );
    if (!res.ok) return [];
    const data = (await res.json()) as {
      artists?: Array<{ name?: string; score?: number }>;
    };
    return (data.artists ?? [])
      .filter((a) => (a.score ?? 0) >= 75)
      .map((a) => a.name!)
      .filter(Boolean);
  } catch {
    return [];
  }
}

/* ---------- Deezer verification ---------- */
type Verified = { name: string; deezerName: string; fans: number; genreTagged: boolean };

async function deezer(pathname: string): Promise<Record<string, unknown>> {
  try {
    const res = await fetch(`https://api.deezer.com${pathname}`, {
      headers: { 'User-Agent': UA },
    });
    return res.ok ? ((await res.json()) as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

async function verifyOnDeezer(name: string, genre: string): Promise<Verified | null> {
  const data = (await deezer(
    `/search/artist?q=${encodeURIComponent(name)}&limit=5`,
  )) as { data?: Array<{ id: number; name: string; nb_fan?: number }> };
  const hit = (data.data ?? []).find((a) => normName(a.name) === normName(name));
  if (!hit) return null;
  const albums = (await deezer(`/artist/${hit.id}/albums?limit=50`)) as {
    data?: Array<{ genre_id?: number }>;
  };
  const ids = WHEEL_TO_DEEZER_GENRE_IDS[genre] ?? [];
  const genreTagged = (albums.data ?? []).some(
    (a) => typeof a.genre_id === 'number' && ids.includes(a.genre_id),
  );
  return { name, deezerName: hit.name, fans: hit.nb_fan ?? 0, genreTagged };
}

/* ---------- main ---------- */
async function main() {
  const pairArgs = process.argv
    .map((a, i) => (a === '--pair' ? process.argv[i + 1] : null))
    .filter((x): x is string => !!x)
    .map((s) => s.split('|') as [string, string]);
  const pairs = pairArgs.length ? pairArgs : weakPairings();

  console.log(`Enriching ${pairs.length} pairings…\n`);
  const proposals: Record<string, Verified[]> = {};

  for (const [country, genre] of pairs) {
    const existing = new Set(
      (seeds.artists[country]?.[genre] ?? []).map(normName),
    );
    const [wd, mb] = [
      await wikidataArtists(country, genre),
      await musicbrainzArtists(country, genre),
    ];
    // Dedup, drop already-seeded, keep source order (wikidata first — it's
    // notability-ranked).
    const candidates = [...new Set([...wd, ...mb].map((n) => n.trim()))]
      .filter((n) => n && !existing.has(normName(n)))
      .slice(0, 12);

    const verified: Verified[] = [];
    for (const c of candidates) {
      const v = await verifyOnDeezer(c, genre);
      if (v) verified.push(v);
      await sleep(150);
      if (verified.length >= 6) break;
    }
    // Prefer genre-tagged artists, then popularity.
    verified.sort(
      (a, b) =>
        Number(b.genreTagged) - Number(a.genreTagged) || b.fans - a.fans,
    );
    proposals[`${country}|${genre}`] = verified;
    console.log(
      `${country} × ${genre}: ${verified.length} verified ` +
        `(${verified.filter((v) => v.genreTagged).length} genre-tagged) — ` +
        verified.map((v) => v.deezerName).join(', '),
    );
    await sleep(200);
  }

  const out = path.join(ROOT, 'seed-proposals.json');
  writeFileSync(out, JSON.stringify(proposals, null, 2));
  console.log(`\nWrote ${out} — review, then hand-merge approved rows into lib/seeds.json.`);
}

main();
