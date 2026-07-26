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
 *   2. Artist origin known but in a DIFFERENT country     → the filing
 *      country's interior point. The song is filed under country X because
 *      that is where the tag search found it; plotting it at the artist's
 *      foreign origin is what put Ghanaian dots on Chile and Swedish dots on
 *      Spain. Keep the dot in the country it belongs to.
 *   3. No origin → the filing country's interior point (±jitter, re-tested).
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

type Origin = { lat: number; lng: number; precision?: string } | null;
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
    const la = base.lat + ((h % 100) / 100 - 0.5) * s;
    const ln = base.lng + (((h >> 7) % 100) / 100 - 0.5) * s;
    if (inCountry(rings, ln, la)) return { la: round(la), ln: round(ln) };
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

  let total = 0, atCity = 0, foreign = 0, noOrigin = 0, unknownCountry = 0;

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

        if (o && inCountry(r, o.lng, o.lat)) {
          next = scatter(r, o, `${song.a}|${song.i}`, 0.5);   // rule 1: real city
          atCity++;
        } else {
          if (o) foreign++; else noOrigin++;                  // rules 2 & 3
          next = scatter(r, home, `${song.a}|${song.i}`, 3.0);
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
  if (unknownCountry) console.log(`  skipped (country not in GeoJSON) ${unknownCountry}`);
}

if (!existsSync(DIR)) {
  console.error('public/world-songs missing — run `npm run world-songs` first');
  process.exit(1);
}
main();
