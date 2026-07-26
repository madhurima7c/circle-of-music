/**
 * Second-pass origins from MusicBrainz, for the artists Wikidata couldn't place.
 *
 *   npm run origins:mb            # fill gaps in lib/origins.json
 *   npm run origins:mb -- --limit 500
 *
 * Why a second source: over the World dataset Wikidata resolved 46% of artists
 * to a city, but the misses are heavily non-Western — 82% of India's artists
 * have no Wikidata entity at all — and its hits on short names are often the
 * WRONG entity (Prithvi → Faisalabad, Vilen → Rotterdam). MusicBrainz covers a
 * different long tail and, crucially, returns each artist's country code, so a
 * candidate can be rejected when it doesn't belong to the country we are
 * placing it in. That country check is the precision Wikidata lacked.
 *
 * Per artist:
 *   1. /ws/2/artist search → candidates (1 req/sec, MB's published limit)
 *   2. keep the best-scoring candidate whose `country` matches the country the
 *      song is filed under
 *   3. take begin-area (where the act formed / was born), else area
 *   4. geocode that place name via Wikidata, cached — cities repeat constantly,
 *      so a few thousand artists need only a few hundred lookups
 *   5. accept only if the point lands inside that country's polygon
 *
 * Only fills gaps: entries Wikidata already placed at a city INSIDE the right
 * country are never touched.
 */

import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { normKey } from '../lib/stories';   // one copy — see recoord for why

const ROOT = path.join(__dirname, '..');
const ORIGINS = path.join(ROOT, 'lib', 'origins.json');
const GEO = path.join(ROOT, 'public', 'geo', 'countries-110m.geojson');
const ISO = path.join(ROOT, 'lib', 'geo-iso.json');
const SONGS = path.join(ROOT, 'public', 'world-songs');
const CITY_CACHE = path.join(ROOT, 'lib', '.city-coords.json');

const MB = 'https://musicbrainz.org/ws/2/artist';
const WD = 'https://www.wikidata.org/w/api.php';
const UA = 'MusicExploration/0.1 ( https://github.com/madhurima7c/circle-of-music )';
const MB_GAP_MS = 1100;                       // MusicBrainz asks for 1 req/sec
const LIMIT = (() => {
  const i = process.argv.indexOf('--limit');
  return i > -1 ? Number(process.argv[i + 1]) : Infinity;
})();

type Origin = { name: string; lat: number; lng: number; place: string; country: string; precision: string } | null;
type Ring = [number, number][];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/* ---------- geometry guard ---------- */
function ringsOf(f: { geometry: { type: string; coordinates: unknown } }): Ring[] {
  const c = f.geometry.coordinates;
  return ((f.geometry.type === 'Polygon' ? [c] : c) as Ring[][]).map((p) => p[0]);
}
function inside(rings: Ring[], lng: number, lat: number): boolean {
  for (const ring of rings) {
    let hit = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i], [xj, yj] = ring[j];
      if ((yi > lat) !== (yj > lat) && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) hit = !hit;
    }
    if (hit) return true;
  }
  return false;
}

/* ---------- network ---------- */
let lastMb = 0;
async function mbSearch(name: string): Promise<Array<{
  name: string; score?: number; country?: string;
  area?: { name?: string }; 'begin-area'?: { name?: string };
}>> {
  const wait = MB_GAP_MS - (Date.now() - lastMb);
  if (wait > 0) await sleep(wait);
  lastMb = Date.now();
  const url = `${MB}?query=${encodeURIComponent(`artist:"${name}"`)}&fmt=json&limit=5`;
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' } });
    if (res.status === 503) { await sleep(3000); return []; }
    if (!res.ok) return [];
    return (await res.json() as { artists?: [] }).artists ?? [];
  } catch { return []; }
}

const cityCache: Record<string, { lat: number; lng: number } | null> =
  existsSync(CITY_CACHE) ? JSON.parse(readFileSync(CITY_CACHE, 'utf8')) : {};

async function geocode(place: string, country: string): Promise<{ lat: number; lng: number } | null> {
  const key = `${place}|${country}`.toLowerCase();
  if (key in cityCache) return cityCache[key];
  let out: { lat: number; lng: number } | null = null;
  try {
    const s = await fetch(
      `${WD}?action=wbsearchentities&search=${encodeURIComponent(place)}&language=en&format=json&limit=5&origin=*`,
      { headers: { 'User-Agent': UA } },
    ).then((r) => r.json() as Promise<{ search?: Array<{ id: string }> }>);
    const ids = (s.search ?? []).map((x) => x.id).slice(0, 5);
    if (ids.length) {
      const ent = await fetch(
        `${WD}?action=wbgetentities&ids=${ids.join('|')}&props=claims&format=json&origin=*`,
        { headers: { 'User-Agent': UA } },
      ).then((r) => r.json() as Promise<{ entities?: Record<string, { claims?: Record<string, Array<{ mainsnak?: { datavalue?: { value?: { latitude?: number; longitude?: number } } } }>> }> }>);
      for (const id of ids) {
        const coord = ent.entities?.[id]?.claims?.P625?.[0]?.mainsnak?.datavalue?.value;
        if (coord?.latitude != null && coord?.longitude != null) {
          out = { lat: coord.latitude, lng: coord.longitude };
          break;
        }
      }
    }
  } catch { /* leave null */ }
  cityCache[key] = out;
  await sleep(60);
  return out;
}

/* ---------- main ---------- */
async function main() {
  const origins = JSON.parse(readFileSync(ORIGINS, 'utf8')) as Record<string, Origin>;
  const geo = JSON.parse(readFileSync(GEO, 'utf8')) as { features: Array<{ properties: { NAME: string }; geometry: { type: string; coordinates: unknown } }> };
  const iso = JSON.parse(readFileSync(ISO, 'utf8')) as Record<string, string>;
  const rings = new Map<string, Ring[]>();
  for (const f of geo.features) rings.set(f.properties.NAME, ringsOf(f));

  // artist → the country it's filed under most often
  const tally = new Map<string, Map<string, number>>();
  const display = new Map<string, string>();
  for (const file of readdirSync(SONGS).filter((f) => f.endsWith('.json'))) {
    const data = JSON.parse(readFileSync(path.join(SONGS, file), 'utf8')) as Record<string, Array<{ a?: string }> | string[]>;
    for (const [country, songs] of Object.entries(data)) {
      if (country === '__done' || !Array.isArray(songs)) continue;
      for (const s of songs) {
        const a = (s as { a?: string })?.a;
        if (!a) continue;
        const k = normKey(a);
        if (!k) continue;
        display.set(k, a);
        const m = tally.get(k) ?? new Map<string, number>();
        m.set(country, (m.get(country) ?? 0) + 1);
        tally.set(k, m);
      }
    }
  }

  // Target: anything not already sitting at a city INSIDE its own country.
  const todo: Array<{ key: string; name: string; country: string }> = [];
  for (const [k, counts] of tally) {
    const country = [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
    const r = rings.get(country);
    if (!r) continue;
    const o = origins[k];
    const placed = o && o.precision === 'city' && inside(r, o.lng, o.lat);
    if (!placed) todo.push({ key: k, name: display.get(k)!, country });
  }

  const queue = todo.slice(0, LIMIT === Infinity ? todo.length : LIMIT);
  console.log(`${tally.size} artists on the globe, ${todo.length} still unplaced — attempting ${queue.length}`);

  let fixed = 0, noMatch = 0, noArea = 0, badGeo = 0, done = 0;
  for (const { key, name, country } of queue) {
    const want = iso[country];
    const cands = await mbSearch(name);
    const hit = cands.find((c) => want && c.country === want) ?? null;
    if (!hit) { noMatch++; }
    else {
      const place = hit['begin-area']?.name ?? hit.area?.name ?? '';
      if (!place || place === country) { noArea++; }
      else {
        const pt = await geocode(place, country);
        const r = rings.get(country)!;
        if (pt && inside(r, pt.lng, pt.lat)) {
          origins[key] = {
            name, lat: Math.round(pt.lat * 1000) / 1000, lng: Math.round(pt.lng * 1000) / 1000,
            place, country, precision: 'city',
          };
          fixed++;
        } else badGeo++;
      }
    }
    if (++done % 25 === 0) {
      console.log(`  ${done}/${queue.length}  fixed=${fixed} noMatch=${noMatch} noArea=${noArea} badGeo=${badGeo}`);
      writeFileSync(ORIGINS, JSON.stringify(origins, null, 1));
      writeFileSync(CITY_CACHE, JSON.stringify(cityCache));
    }
  }
  writeFileSync(ORIGINS, JSON.stringify(origins, null, 1));
  writeFileSync(CITY_CACHE, JSON.stringify(cityCache));
  console.log(`\ndone: +${fixed} city origins (no country match ${noMatch}, no area ${noArea}, ungeocodable ${badGeo})`);
}

main();
