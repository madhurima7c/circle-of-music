/**
 * Fill origin gaps from the Kaggle `artists.csv` MusicBrainz country column.
 *
 *   npm run origins:csv            # write into lib/origins.json
 *   npm run origins:csv -- --dry   # report only
 *
 * `lib/origins.json` is built by Wikidata (`npm run origins`) and MusicBrainz
 * (`npm run origins:mb`), both of which query one artist at a time. The Kaggle
 * "Music Artists Popularity" set carries a MusicBrainz country for 662k of its
 * 1.47M artists in a single local file, which covers a chunk of the long tail
 * those crawls never reached.
 *
 * ONLY GAPS ARE FILLED. An artist already placed — at a city especially — is
 * never overwritten, because this source is country-level and coarser than
 * what is already there. Manual corrections in the JSON survive, as they do
 * for every other origins script.
 *
 * WHAT THIS DOES AND DOESN'T CHANGE. It does not move many globe dots:
 * `recoord` deliberately plots a song at its FILING country regardless of
 * where the artist is from, precisely so a Ghanaian artist's song filed under
 * Chile does not draw a dot on Chile. What a country-level origin does improve
 * is everything that reads the artist's own origin — the now-playing card's
 * "from" line (`originFor(artist).country`), which is what a listener actually
 * sees — and it saves a runtime Wikidata lookup per unknown artist
 * (`lib/origins-live.ts`).
 *
 * `country_lastfm` is deliberately NOT used. The dataset's own documentation
 * warns it is derived from user tags that conflate language with origin, so
 * "many Latin American, Austrian, and Swiss artists have an incorrect country
 * assigned to them". Only `country_mb` is read.
 */

import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { eachRow } from './csv-stream';
import { normName } from '../lib/genre-rules';
import { normKey } from '../lib/stories';   // the key lib/origins.ts reads by

const ROOT = path.join(__dirname, '..');
const CSV = path.join(ROOT, 'kaggle_datasets', 'artists.csv');
const ORIGINS = path.join(ROOT, 'lib', 'origins.json');
const GEO = path.join(ROOT, 'public', 'geo', 'countries-110m.geojson');
const SONGS = path.join(ROOT, 'public', 'world-songs');
const DRY = process.argv.includes('--dry');

type Origin = { name: string; lat: number; lng: number; place: string; country: string; precision: string } | null;
type Ring = [number, number][];


/* ---------- geometry (mirrors recoord-world-songs.ts) ---------- */
function ringsOf(f: { geometry: { type: string; coordinates: unknown } }): Ring[] {
  const c = f.geometry.coordinates;
  return ((f.geometry.type === 'Polygon' ? [c] : c) as Ring[][]).map((p) => p[0]);
}
function inRing(ring: Ring, lng: number, lat: number): boolean {
  let hit = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > lat) !== (yj > lat) && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}
const inCountry = (rings: Ring[], lng: number, lat: number) => rings.some((r) => inRing(r, lng, lat));

function interiorPoint(rings: Ring[]): { lat: number; lng: number } {
  const big = rings.reduce((a, b) => (b.length > a.length ? b : a));
  let x0 = 180, y0 = 90, x1 = -180, y1 = -90;
  for (const [x, y] of big) {
    if (x < x0) x0 = x; if (x > x1) x1 = x;
    if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  if (inCountry(rings, cx, cy)) return { lat: cy, lng: cx };
  let best: { lat: number; lng: number } | null = null, bestD = Infinity;
  for (let i = 1; i < 24; i++) {
    for (let j = 1; j < 24; j++) {
      const x = x0 + ((x1 - x0) * i) / 24, y = y0 + ((y1 - y0) * j) / 24;
      if (!inCountry(rings, x, y)) continue;
      const d = (x - cx) ** 2 + (y - cy) ** 2;
      if (d < bestD) { bestD = d; best = { lat: y, lng: x }; }
    }
  }
  return best ?? { lat: cy, lng: cx };
}
const round = (n: number) => Math.round(n * 1000) / 1000;

/** artists.csv country names → our GeoJSON NAME. */
const COUNTRY_ALIASES: Record<string, string> = {
  'united states': 'United States of America',
  'russia': 'Russia', 'czech republic': 'Czechia', 'south korea': 'South Korea',
  'north korea': 'North Korea', 'bosnia and herzegovina': 'Bosnia and Herz.',
  'dominican republic': 'Dominican Rep.', 'central african republic': 'Central African Rep.',
  'democratic republic of the congo': 'Dem. Rep. Congo', 'republic of the congo': 'Congo',
  'ivory coast': "Côte d'Ivoire", "cote d'ivoire": "Côte d'Ivoire",
  'north macedonia': 'Macedonia', 'macedonia': 'Macedonia',
  'equatorial guinea': 'Eq. Guinea', 'south sudan': 'S. Sudan',
  'solomon islands': 'Solomon Is.', 'falkland islands': 'Falkland Is.',
  'east timor': 'Timor-Leste', 'swaziland': 'eSwatini', 'eswatini': 'eSwatini',
  'western sahara': 'W. Sahara', 'united kingdom': 'United Kingdom',
};

async function main() {
  if (!existsSync(CSV)) {
    console.error(`missing ${path.relative(ROOT, CSV)} — download the Kaggle "Music artists popularity" set first`);
    process.exit(1);
  }

  /* geo lookup */
  const geo = JSON.parse(readFileSync(GEO, 'utf8')) as {
    features: Array<{ properties: { NAME: string }; geometry: { type: string; coordinates: unknown } }>;
  };
  const ringsByCountry = new Map<string, Ring[]>();
  const interiorByCountry = new Map<string, { lat: number; lng: number }>();
  const byNorm = new Map<string, string>();
  for (const f of geo.features) {
    const name = f.properties.NAME;
    const rings = ringsOf(f);
    ringsByCountry.set(name, rings);
    interiorByCountry.set(name, interiorPoint(rings));
    byNorm.set(normName(name), name);
  }
  const geoNameFor = (csvCountry: string): string | null => {
    const alias = COUNTRY_ALIASES[csvCountry.toLowerCase().trim()];
    if (alias && ringsByCountry.has(alias)) return alias;
    return byNorm.get(normName(csvCountry)) ?? null;
  };

  /* who is plotted on the globe */
  const globe = new Map<string, string>();          // normKey -> display name
  for (const f of readdirSync(SONGS)) {
    if (!f.endsWith('.json')) continue;
    const j = JSON.parse(readFileSync(path.join(SONGS, f), 'utf8')) as Record<string, unknown>;
    for (const v of Object.values(j)) {
      if (!Array.isArray(v)) continue;
      for (const s of v as Array<{ a?: string }>) if (s.a) globe.set(normKey(s.a), s.a);
    }
  }

  const origins = JSON.parse(readFileSync(ORIGINS, 'utf8')) as Record<string, Origin>;
  const placed = new Set(Object.keys(origins).filter((k) => origins[k]));
  const needing = new Set([...globe.keys()].filter((k) => !placed.has(k)));
  console.log(`globe artists ${globe.size.toLocaleString()} · already placed ${placed.size.toLocaleString()} · needing an origin ${needing.size.toLocaleString()}`);

  /* scan the CSV, keeping the most-listened row per name */
  const best = new Map<string, { country: string; listeners: number }>();
  let rows = 0;
  await eachRow(CSV, (r) => {
    rows++;
    const country = r.country_mb;
    if (!country) return;                       // country_lastfm deliberately unused
    const listeners = Number(r.listeners_lastfm) || 0;
    for (const nameCol of [r.artist_mb, r.artist_lastfm]) {
      if (!nameCol) continue;
      const k = normKey(nameCol);
      if (!needing.has(k)) continue;
      const prev = best.get(k);
      if (!prev || listeners > prev.listeners) best.set(k, { country, listeners });
    }
  });
  console.log(`scanned ${rows.toLocaleString()} rows → ${best.size.toLocaleString()} of the gaps have a MusicBrainz country`);

  /* write */
  let written = 0, unmapped = 0;
  const unmappedNames = new Map<string, number>();
  for (const [k, hit] of best) {
    const geoName = geoNameFor(hit.country);
    if (!geoName) { unmapped++; unmappedNames.set(hit.country, (unmappedNames.get(hit.country) || 0) + 1); continue; }
    const base = interiorByCountry.get(geoName)!;
    origins[k] = {
      name: globe.get(k) ?? k,
      lat: round(base.lat), lng: round(base.lng),
      place: '',                                // country-level: no city known
      country: geoName,
      precision: 'country',
    };
    written++;
  }

  console.log(`\n${DRY ? 'would write' : 'wrote'} ${written.toLocaleString()} country-level origins`);
  if (unmapped) {
    const top = [...unmappedNames.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
    console.log(`skipped ${unmapped} whose country isn't a globe nation: ${top.map(([n, c]) => `${n}×${c}`).join(', ')}`);
  }
  if (!DRY) {
    writeFileSync(ORIGINS, JSON.stringify(origins, null, 2));
    console.log(`lib/origins.json now holds ${Object.keys(origins).length.toLocaleString()} entries, ${Object.values(origins).filter(Boolean).length.toLocaleString()} placed`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
