/**
 * Resolve every artist we can place to a geographic origin point.
 *
 *   npm run origins              # only artists not yet in lib/origins.json
 *   npm run origins -- --retry   # also re-attempt previous misses
 *   npm run origins -- --seeds   # seeds.json only (the original behaviour)
 *
 * SCOPE: seeds.json (the Circle's curated artists) AND every artist in
 * public/world-songs/*.json (the World's dot dataset). The World set was
 * previously excluded, which is why 99% of globe dots fell back to a country
 * centroid instead of a city — the audit that caught it is in todo.md.
 *
 * Source: Wikidata public API (no key).
 *   1. wbsearchentities on the artist name → candidate items
 *   2. wbgetentities (claims) → pick the candidate that looks like a music
 *      act (has genre P136 / occupation P106) and has an origin claim
 *   3. origin = P19 place of birth (people) or P740 location of formation
 *      (groups); fallback = P27 citizenship / P495 country of origin
 *   4. the origin item's P625 coordinates → lat/lng
 *
 * Output lib/origins.json:
 *   { "<normalized artist>": { name, lat, lng, place, country, precision } }
 * Misses are stored as null so re-runs don't re-hit the API (use --retry).
 * precision: "city" (P19/P740 hit) vs "country" (country centroid only).
 */

import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import path from 'node:path';

const SEEDS_PATH = path.join(__dirname, '..', 'lib', 'seeds.json');
const WORLD_SONGS_DIR = path.join(__dirname, '..', 'public', 'world-songs');
const OUT_PATH = path.join(__dirname, '..', 'lib', 'origins.json');
const API = 'https://www.wikidata.org/w/api.php';
const UA = 'MusicExploration/0.1 ( https://github.com/madhurima7c/circle-of-music )';
const RETRY_MISSES = process.argv.includes('--retry');
const SEEDS_ONLY = process.argv.includes('--seeds');

/** Same normalization as lib/stories.ts normKey / lib/deezer.ts normName. */
const FOLD: Record<string, string> = {
  'ı': 'i', 'ø': 'o', 'ł': 'l', 'đ': 'd', 'ß': 'ss',
  'æ': 'ae', 'œ': 'oe', 'ð': 'd', 'þ': 'th',
};
function normKey(s: string): string {
  return String(s || '')
    .toLowerCase()
    .replace(/[ıøłđßæœðþ]/g, (c) => FOLD[c] ?? c)
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

type Origin = {
  name: string;
  lat: number;
  lng: number;
  place: string;    // city/town label ('' when country-level)
  country: string;  // country label
  precision: 'city' | 'country';
};

type Claims = Record<string, Array<{ mainsnak?: { datavalue?: { value?: unknown } } }>>;
type Entity = { id: string; claims?: Claims; labels?: Record<string, { value?: string }> };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function wd(params: Record<string, string>): Promise<Record<string, unknown>> {
  const qs = new URLSearchParams({ ...params, format: 'json', origin: '*' });
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(`${API}?${qs}`, { headers: { 'User-Agent': UA } });
      if (res.ok) return (await res.json()) as Record<string, unknown>;
    } catch { /* retry */ }
    await sleep(800 * (attempt + 1));
  }
  return {};
}

function firstItemId(claims: Claims | undefined, prop: string): string | null {
  const v = claims?.[prop]?.[0]?.mainsnak?.datavalue?.value as { id?: string } | undefined;
  return v?.id ?? null;
}

function coords(claims: Claims | undefined): { lat: number; lng: number } | null {
  const v = claims?.P625?.[0]?.mainsnak?.datavalue?.value as
    | { latitude?: number; longitude?: number }
    | undefined;
  return typeof v?.latitude === 'number' && typeof v?.longitude === 'number'
    ? { lat: v.latitude, lng: v.longitude }
    : null;
}

async function getEntities(ids: string[]): Promise<Record<string, Entity>> {
  const out: Record<string, Entity> = {};
  for (let i = 0; i < ids.length; i += 50) {
    const batch = ids.slice(i, i + 50);
    const data = (await wd({
      action: 'wbgetentities',
      ids: batch.join('|'),
      props: 'claims|labels',
      languages: 'en',
    })) as { entities?: Record<string, Entity> };
    Object.assign(out, data.entities ?? {});
    await sleep(120);
  }
  return out;
}

/** Music-act signal: any genre, or a music-ish occupation/instance claim. */
function looksMusical(claims: Claims | undefined): boolean {
  if (!claims) return false;
  if (claims.P136?.length) return true;                    // genre
  if (claims.P106?.length) return true;                    // occupation (loose — filtered by origin need)
  if (claims.P264?.length) return true;                    // record label
  return false;
}

async function resolveArtist(name: string): Promise<Origin | null> {
  const search = (await wd({
    action: 'wbsearchentities',
    search: name,
    language: 'en',
    type: 'item',
    limit: '5',
  })) as { search?: Array<{ id: string }> };
  const candidates = (search.search ?? []).map((s) => s.id);
  if (!candidates.length) return null;

  const entities = await getEntities(candidates);

  // Best candidate: musical + has a specific origin; then musical + country;
  // then anything with an origin claim.
  let pick: Entity | null = null;
  let originProp: string | null = null;
  const tiers: Array<(c: Claims | undefined) => string | null> = [
    (c) => (looksMusical(c) ? firstItemId(c, 'P740') ?? firstItemId(c, 'P19') : null),
    (c) => (looksMusical(c) ? firstItemId(c, 'P495') ?? firstItemId(c, 'P27') : null),
    (c) => firstItemId(c, 'P740') ?? firstItemId(c, 'P19'),
  ];
  for (const tier of tiers) {
    for (const id of candidates) {
      const e = entities[id];
      const hit = tier(e?.claims);
      if (hit) { pick = e; originProp = hit; break; }
    }
    if (pick) break;
  }
  if (!pick || !originProp) return null;

  const isCityLevel =
    originProp === (firstItemId(pick.claims, 'P740') ?? firstItemId(pick.claims, 'P19'));
  const countryQ = firstItemId(pick.claims, 'P495') ?? firstItemId(pick.claims, 'P27');

  const need = [originProp, ...(countryQ && countryQ !== originProp ? [countryQ] : [])];
  const places = await getEntities(need);
  const originEnt = places[originProp];
  const countryEnt = countryQ ? places[countryQ] : undefined;

  let pt = coords(originEnt?.claims);
  let precision: Origin['precision'] = isCityLevel ? 'city' : 'country';
  if (!pt && countryEnt) {           // city had no coords → country centroid
    pt = coords(countryEnt.claims);
    precision = 'country';
  }
  if (!pt) return null;

  return {
    name,
    lat: Math.round(pt.lat * 1000) / 1000,
    lng: Math.round(pt.lng * 1000) / 1000,
    place: precision === 'city' ? originEnt?.labels?.en?.value ?? '' : '',
    country: countryEnt?.labels?.en?.value ?? originEnt?.labels?.en?.value ?? '',
    precision,
  };
}

async function main() {
  const seeds = JSON.parse(readFileSync(SEEDS_PATH, 'utf8')) as {
    artists: Record<string, Record<string, string[]>>;
  };
  const names = new Map<string, string>(); // normKey → display name
  for (const genres of Object.values(seeds.artists)) {
    for (const list of Object.values(genres)) {
      for (const n of list) names.set(normKey(n), n);
    }
  }
  const seedCount = names.size;

  // Every artist the globe actually plots. Seeds are queued first (they drive
  // the Circle), then the long tail from the World dataset.
  if (!SEEDS_ONLY && existsSync(WORLD_SONGS_DIR)) {
    for (const file of readdirSync(WORLD_SONGS_DIR).filter((f) => f.endsWith('.json'))) {
      const data = JSON.parse(
        readFileSync(path.join(WORLD_SONGS_DIR, file), 'utf8'),
      ) as Record<string, Array<{ a?: string }> | string[]>;
      for (const [country, songs] of Object.entries(data)) {
        if (country === '__done' || !Array.isArray(songs)) continue;
        for (const song of songs) {
          const a = (song as { a?: string })?.a;
          if (a) names.set(normKey(a), a);
        }
      }
    }
  }

  const existing: Record<string, Origin | null> = existsSync(OUT_PATH)
    ? JSON.parse(readFileSync(OUT_PATH, 'utf8'))
    : {};

  const todo = [...names.entries()].filter(([key]) =>
    RETRY_MISSES ? !(key in existing) || existing[key] === null : !(key in existing),
  );
  console.log(
    `${names.size} unique artists (${seedCount} seed, ${names.size - seedCount} world), ` +
    `${todo.length} to resolve`,
  );

  let done = 0;
  for (const [key, display] of todo) {
    try {
      existing[key] = await resolveArtist(display);
    } catch {
      existing[key] = null;
    }
    done++;
    if (done % 25 === 0) {
      console.log(`  ${done}/${todo.length}…`);
      writeFileSync(OUT_PATH, JSON.stringify(existing, null, 1));
    }
    await sleep(90);
  }

  writeFileSync(OUT_PATH, JSON.stringify(existing, null, 1));
  const hits = Object.values(existing).filter(Boolean).length;
  const city = Object.values(existing).filter((o) => o?.precision === 'city').length;
  console.log(
    `origins.json: ${hits}/${Object.keys(existing).length} resolved (${city} city-level)`,
  );
}

main();
