/**
 * Audit the globe's dot dataset.
 *
 *   npm run audit:dots
 *   npm run audit:dots -- --baseline /tmp/world-songs-backup
 *
 * Four questions, because "the dots look wrong" turned out to mean four
 * different things over the course of fixing them:
 *
 *   1. PLACEMENT  — does every dot sit inside the country it is filed under?
 *   2. ATTRIBUTION — is the ARTIST actually from that country? A dot can be
 *      geometrically perfect and still be a lie: Chilean Newen Afrobeat drawn
 *      neatly inside Chad. This is the check that caught 49% of dots being
 *      filed under a country that was not the artist's.
 *   3. COVERAGE   — how many countries actually light up per genre, and what
 *      did a change cost? Removing junk is progress; removing scenes is not.
 *   4. INTEGRITY  — duplicates, missing coordinates, malformed rows.
 *
 * Attribution uses `kaggle_datasets/artists.csv` (MusicBrainz country for
 * 662k artists) plus `lib/origins.json`, so it needs no network. Artists
 * neither source knows are reported separately rather than assumed correct —
 * an unknown is not a pass.
 */

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { eachRow } from './csv-stream';
import { normName } from '../lib/genre-rules';

const ROOT = path.join(__dirname, '..');
const DIR = path.join(ROOT, 'public', 'world-songs');
const GEO = path.join(ROOT, 'public', 'geo', 'countries-110m.geojson');
const CSV = path.join(ROOT, 'kaggle_datasets', 'artists.csv');

const arg = (f: string) => {
  const i = process.argv.indexOf(f);
  return i > -1 ? process.argv[i + 1] : undefined;
};
const BASELINE = arg('--baseline');

type Song = { i: number; t: string; a: string; la: number; ln: number };
type Ring = [number, number][];

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

const SYNONYM: Record<string, string> = {
  'united states': 'united states of america',
  'czech republic': 'czechia',
  'bosnia and herzegovina': 'bosnia and herz',
  'dominican republic': 'dominican rep',
  'central african republic': 'central african rep',
  'democratic republic of the congo': 'dem rep congo',
  'republic of the congo': 'congo',
  'ivory coast': 'cote d ivoire',
  'north macedonia': 'macedonia',
  'equatorial guinea': 'eq guinea',
  'south sudan': 's sudan',
  'solomon islands': 'solomon is',
  'east timor': 'timor leste',
  'swaziland': 'eswatini',
  'western sahara': 'w sahara',
};
const canon = (c: string) => { const n = normName(c); return SYNONYM[n] ?? n; };

function load(dir: string) {
  const out = new Map<string, Map<string, Song[]>>();   // genre -> country -> songs
  for (const f of readdirSync(dir)) {
    if (!f.endsWith('.json')) continue;
    const j = JSON.parse(readFileSync(path.join(dir, f), 'utf8')) as Record<string, unknown>;
    const byCountry = new Map<string, Song[]>();
    for (const [country, v] of Object.entries(j)) {
      if (country === '__done' || !Array.isArray(v)) continue;
      byCountry.set(country, v as Song[]);
    }
    out.set(f.replace('.json', ''), byCountry);
  }
  return out;
}

const count = (m: Map<string, Map<string, Song[]>>) => {
  let songs = 0, lit = 0;
  for (const byC of m.values()) for (const list of byC.values()) { songs += list.length; if (list.length) lit++; }
  return { songs, lit };
};

async function main() {
  const now = load(DIR);
  const geo = JSON.parse(readFileSync(GEO, 'utf8')) as {
    features: Array<{ properties: { NAME: string }; geometry: { type: string; coordinates: unknown } }>;
  };
  const rings = new Map<string, Ring[]>();
  for (const f of geo.features) rings.set(f.properties.NAME, ringsOf(f));

  /* ---------- 1. placement ---------- */
  let dots = 0, outside = 0, noPoly = 0, badCoord = 0;
  const offenders: string[] = [];
  const artistsSeen = new Map<string, Set<string>>();     // artist -> filing countries
  let dupes = 0;
  for (const [, byC] of now) {
    for (const [country, list] of byC) {
      const r = rings.get(country);
      const seen = new Set<string>();
      for (const s of list) {
        dots++;
        if (!Number.isFinite(s.la) || !Number.isFinite(s.ln)) { badCoord++; continue; }
        const key = `${normName(s.a)}|${normName(s.t)}`;
        if (seen.has(key)) dupes++; else seen.add(key);
        (artistsSeen.get(normName(s.a)) ?? artistsSeen.set(normName(s.a), new Set()).get(normName(s.a))!).add(country);
        if (!r) { noPoly++; continue; }
        if (!r.some((ring) => inRing(ring, s.ln, s.la))) {
          outside++;
          if (offenders.length < 6) offenders.push(`${country}: ${s.a} @${s.la},${s.ln}`);
        }
      }
    }
  }

  /* ---------- 2. attribution ---------- */
  const truth = new Map<string, string>();
  const origins = JSON.parse(readFileSync(path.join(ROOT, 'lib', 'origins.json'), 'utf8')) as
    Record<string, { country?: string } | null>;
  for (const [k, v] of Object.entries(origins)) if (v?.country) truth.set(k, canon(v.country));
  if (existsSync(CSV)) {
    await eachRow(CSV, (r) => {
      if (!r.country_mb) return;
      for (const n of [r.artist_mb, r.artist_lastfm]) {
        const k = normName(n || '');
        if (k && artistsSeen.has(k) && !truth.has(k)) truth.set(k, canon(r.country_mb));
      }
    });
  }
  let checkable = 0, misattributed = 0, unknown = 0;
  const worst = new Map<string, number>();
  for (const [artist, countries] of artistsSeen) {
    const real = truth.get(artist);
    if (!real) { unknown++; continue; }
    checkable++;
    for (const c of countries) {
      if (canon(c) !== real) {
        misattributed++;
        worst.set(c, (worst.get(c) || 0) + 1);
      }
    }
  }

  /* ---------- report ---------- */
  const { songs, lit } = count(now);
  console.log(`\n=== PLACEMENT ===`);
  console.log(`  dots: ${dots.toLocaleString()}`);
  console.log(`  outside their filing country: ${outside} (${(100 * outside / dots).toFixed(2)}%)`);
  console.log(`  missing/invalid coordinates : ${badCoord}`);
  console.log(`  country has no polygon      : ${noPoly}`);
  if (offenders.length) console.log(`  e.g. ${offenders.join(' | ')}`);

  console.log(`\n=== ATTRIBUTION (is the artist actually from there?) ===`);
  console.log(`  distinct artists: ${artistsSeen.size.toLocaleString()}`);
  console.log(`  country known   : ${checkable.toLocaleString()}  ·  unknown (not asserted either way): ${unknown.toLocaleString()}`);
  console.log(`  artist-country placements that contradict a known origin: ${misattributed.toLocaleString()}` +
    (checkable ? ` (${(100 * misattributed / checkable).toFixed(1)}% of checkable artists)` : ''));
  const top = [...worst.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
  if (top.length) console.log(`  most affected: ${top.map(([c, n]) => `${c} ${n}`).join(', ')}`);

  console.log(`\n=== COVERAGE ===`);
  console.log(`  songs: ${songs.toLocaleString()}  ·  country-genre cells with at least one dot: ${lit.toLocaleString()}`);

  console.log(`\n=== INTEGRITY ===`);
  console.log(`  duplicate artist+title within one cell: ${dupes}`);

  if (BASELINE && existsSync(BASELINE)) {
    const before = load(BASELINE);
    const b = count(before);
    const pct = (a: number, c: number) => (c ? `${a > c ? '+' : ''}${(100 * (a - c) / c).toFixed(0)}%` : 'n/a');
    console.log(`\n=== VS BASELINE (${BASELINE}) ===`);
    console.log(`  songs        ${b.songs.toLocaleString()} → ${songs.toLocaleString()}  (${pct(songs, b.songs)})`);
    console.log(`  lit cells    ${b.lit.toLocaleString()} → ${lit.toLocaleString()}  (${pct(lit, b.lit)})`);
    // which cells went dark, and were they junk?
    let wentDark = 0;
    for (const [genre, byC] of before) {
      for (const [country, list] of byC) {
        if (!list.length) continue;
        if (!(now.get(genre)?.get(country)?.length)) wentDark++;
      }
    }
    console.log(`  cells that went dark: ${wentDark.toLocaleString()}`);
  }
  console.log();
}

main().catch((e) => { console.error(e); process.exit(1); });
