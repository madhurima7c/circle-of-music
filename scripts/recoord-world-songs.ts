/**
 * Re-place every dot in public/world-songs/*.json from lib/origins.json.
 *
 *   npm run recoord            # rewrite coordinates in place
 *   npm run recoord -- --dry   # report only, touch nothing
 *
 * The song lists (ids, titles, artists) are expensive to rebuild — they cost a
 * ~10h MusicBrainz + Deezer crawl. Only the coordinates are cheap and wrong, so
 * this recomputes la/ln locally with no network.
 *
 * Three rules, in order:
 *   1. Artist origin known AND inside the filing country  → that city (±0.25°).
 *   2. Artist origin known but in a DIFFERENT country     → a MUSIC CITY of
 *      the filing country. The song is filed under country X because that is
 *      where the tag search found it; plotting it at the artist's foreign
 *      origin is what put Ghanaian dots on Chile and Swedish dots on Spain.
 *      Keep the dot in the country it belongs to.
 *   3. No origin → the same music-city anchor (±jitter, re-tested).
 *
 * WHY MUSIC CITIES AND NOT THE CENTROID. Rules 2 and 3 used to fall back to a
 * geometric interior point, which for Australia is the dead centre of the
 * outback — 42% of its dots piled into empty desert while every Australian
 * lives on the coast. The anchors are now derived from origins.json itself:
 * the cities where this country's OWN artists are already placed, weighted by
 * how many are there (Australia → Melbourne 36, Sydney 31, Adelaide 14,
 * Perth 11, Brisbane 7). A dot with no known city lands somewhere the music
 * actually comes from. Countries with no city-level origin at all still use
 * the interior point.
 *
 * Every result is verified to land on that country's landmass, so nothing
 * floats in the sea or on the wrong continent.
 */

import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import path from 'node:path';
/* Imported, not copied. The local copy that used to live here stripped
 * separators ("abdelrahmanelbacha") while lib/origins.ts keys on the
 * space-separated form ("abdel rahman el bacha"), so rule 1 below could only
 * ever fire for single-word artist names — origins were found for 33% of dots
 * instead of 64%, and city-level placement for 30% instead of 55%. */
import { normKey } from '../lib/stories';

const ROOT = path.join(__dirname, '..');
const ORIGINS = path.join(ROOT, 'lib', 'origins.json');
const GEO = path.join(ROOT, 'public', 'geo', 'countries-110m.geojson');
const DIR = path.join(ROOT, 'public', 'world-songs');
const DRY = process.argv.includes('--dry');

type Origin = { lat: number; lng: number; place?: string; country?: string; precision?: string } | null;
type Song = { i: number; t: string; a: string; la: number; ln: number };
type Ring = [number, number][];


/* ---------- geometry ---------- */
function ringsOf(feature: { geometry: { type: string; coordinates: unknown } }): Ring[] {
  const c = feature.geometry.coordinates;
  const polys = (feature.geometry.type === 'Polygon' ? [c] : c) as Ring[][];
  return polys.map((p) => p[0]);           // outer rings only — holes are noise at 110m
}

function inRing(ring: Ring, lng: number, lat: number): boolean {
  let hit = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > lat) !== (yj > lat) && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}
const inCountry = (rings: Ring[], lng: number, lat: number) =>
  rings.some((r) => inRing(r, lng, lat));

/** A point guaranteed to sit on the country's land, near its middle. */
function interiorPoint(rings: Ring[]): { lat: number; lng: number } {
  const big = rings.reduce((a, b) => (b.length > a.length ? b : a));
  let x0 = 180, y0 = 90, x1 = -180, y1 = -90;
  for (const [x, y] of big) {
    if (x < x0) x0 = x; if (x > x1) x1 = x;
    if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  if (inCountry(rings, cx, cy)) return { lat: cy, lng: cx };
  // centroid fell in water (crescent-shaped nations) — grid-search for land
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

/**
 * A country's music cities, from the artists origins.json already places
 * there — weighted by how many, so the common cities dominate.
 */
function cityAnchors(
  origins: Record<string, Origin>,
  rings: Map<string, Ring[]>,
): Map<string, Array<{ lat: number; lng: number }>> {
  const byCountry = new Map<string, Map<string, { lat: number; lng: number; n: number }>>();
  for (const o of Object.values(origins)) {
    if (!o || o.precision !== 'city' || !o.country) continue;
    // Some entries are marked city-level but name the COUNTRY as the place —
    // those coordinates are a centroid wearing a city's label, and letting
    // one into the pool re-creates the very cluster this is fixing.
    if (!o.place || normKey(o.place) === normKey(o.country)) continue;
    const r = rings.get(o.country);
    if (!r || !inCountry(r, o.lng, o.lat)) continue;   // stale//wrong-country entries excluded
    const m = byCountry.get(o.country) ?? new Map();
    const key = `${o.lat}|${o.lng}`;
    const cur = m.get(key);
    if (cur) cur.n++; else m.set(key, { lat: o.lat, lng: o.lng, n: 1 });
    byCountry.set(o.country, m);
  }
  // Expand to a weighted pool, capped so one huge city cannot crowd out the
  // rest entirely — a country should still read as several scenes.
  const out = new Map<string, Array<{ lat: number; lng: number }>>();
  for (const [country, m] of byCountry) {
    const pool: Array<{ lat: number; lng: number }> = [];
    for (const c of m.values()) {
      const weight = Math.min(c.n, 12);
      for (let i = 0; i < weight; i++) pool.push({ lat: c.lat, lng: c.lng });
    }
    if (pool.length) out.set(country, pool);
  }
  return out;
}

/** Deterministic hash — identical output run to run. */
function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/** Jitter a base point but never off the country's land. */
function scatter(rings: Ring[], base: { lat: number; lng: number }, key: string, spread: number) {
  const h = hash(key);
  for (let attempt = 0; attempt < 6; attempt++) {
    const s = spread / (attempt + 1);            // shrink until it lands
    // Round BEFORE the land test. Testing the full-precision point and then
    // returning a rounded one lets the rounding itself nudge a coastal dot
    // into the sea — invisible while everything sat on inland centroids,
    // obvious once dots anchor on Sydney and Lisbon.
    const la = round(base.lat + ((h % 100) / 100 - 0.5) * s);
    const ln = round(base.lng + (((h >> 7) % 100) / 100 - 0.5) * s);
    if (inCountry(rings, ln, la)) return { la, ln };
  }
  return { la: round(base.lat), ln: round(base.lng) };
}
const round = (n: number) => Math.round(n * 100) / 100;

/* ---------- main ---------- */
function main() {
  const origins = JSON.parse(readFileSync(ORIGINS, 'utf8')) as Record<string, Origin>;
  const geo = JSON.parse(readFileSync(GEO, 'utf8')) as {
    features: Array<{ properties: { NAME: string }; geometry: { type: string; coordinates: unknown } }>;
  };

  const rings = new Map<string, Ring[]>();
  const interior = new Map<string, { lat: number; lng: number }>();
  for (const f of geo.features) {
    const r = ringsOf(f);
    rings.set(f.properties.NAME, r);
    interior.set(f.properties.NAME, interiorPoint(r));
  }

  const anchors = cityAnchors(origins, rings);
  let total = 0, atCity = 0, foreign = 0, noOrigin = 0, unknownCountry = 0, viaAnchor = 0;

  for (const file of readdirSync(DIR).filter((f) => f.endsWith('.json'))) {
    const p = path.join(DIR, file);
    const data = JSON.parse(readFileSync(p, 'utf8')) as Record<string, Song[] | string[]>;
    let touched = false;

    for (const [country, songs] of Object.entries(data)) {
      if (country === '__done' || !Array.isArray(songs)) continue;
      const r = rings.get(country);
      const home = interior.get(country);
      if (!r || !home) { unknownCountry += (songs as Song[]).length; continue; }

      for (const song of songs as Song[]) {
        if (!song || typeof song !== 'object' || !song.a) continue;
        total++;
        const o = origins[normKey(song.a)];
        let next: { la: number; ln: number };

        // Rule 1 requires a CITY. A country-level origin's coordinates ARE
        // the centroid, so treating one as a city planted The Saints,
        // Natalie Imbruglia and 5 Seconds Of Summer in the middle of the
        // Australian outback at -24.85,133.45. Country-level origins fall
        // through to the music-city anchor below, same as no origin at all.
        if (o && o.precision === 'city' && inCountry(r, o.lng, o.lat)) {
          next = scatter(r, o, `${song.a}|${song.i}`, 0.5);   // rule 1: real city
          atCity++;
        } else {
          if (o) foreign++; else noOrigin++;                  // rules 2 & 3
          // Anchor on one of the country's real music cities, chosen
          // deterministically per artist so a re-run is identical and one
          // artist's songs stay together.
          const pool = anchors.get(country);
          if (pool && pool.length) {
            const pick = pool[hash(song.a) % pool.length];
            next = scatter(r, pick, `${song.a}|${song.i}`, 0.8);
            viaAnchor++;
          } else {
            next = scatter(r, home, `${song.a}|${song.i}`, 3.0);
          }
        }
        if (next.la !== song.la || next.ln !== song.ln) touched = true;
        song.la = next.la;
        song.ln = next.ln;
      }
    }
    if (touched && !DRY) writeFileSync(p, JSON.stringify(data));
  }

  const pct = (n: number) => `${((n / total) * 100).toFixed(1)}%`;
  console.log(`${DRY ? '[dry run] ' : ''}re-placed ${total} dots`);
  console.log(`  at the artist's real city        ${atCity} (${pct(atCity)})`);
  console.log(`  origin abroad → kept in-country  ${foreign} (${pct(foreign)})`);
  console.log(`  no origin → in-country point     ${noOrigin} (${pct(noOrigin)})`);
  console.log(`    …of those two, anchored on a real music city: ${viaAnchor} (${pct(viaAnchor)})`);
  if (unknownCountry) console.log(`  skipped (country not in GeoJSON) ${unknownCountry}`);
}

if (!existsSync(DIR)) {
  console.error('public/world-songs missing — run `npm run world-songs` first');
  process.exit(1);
}
main();
