/**
 * World songs — popular songs for EVERY globe nation, per wheel genre.
 * Powers the World's song dots: pick genres, see their songs everywhere.
 *
 *   npm run world-songs                          # everything (hours; resumable)
 *   npm run world-songs -- --genres "Jazz,Rock"  # limit to genres
 *   npm run world-songs -- --countries "France"  # limit to countries
 *   npm run world-songs -- --limit 20            # first N countries per genre
 *
 * Per (country × genre):
 *   1. Artist candidates, popularity-first:
 *      MusicBrainz artist search `country:ISO AND (tag:…)` (score-ordered,
 *      1 req/1.1s — their hard rate limit), unioned with our curated seeds
 *      (wheel countries) and world-seeds buckets.
 *   2. Deezer resolution: artist → top tracks (popularity-ordered, preview
 *      required). Up to SONGS_PER_PAIR songs per pairing, a couple per
 *      artist so one act can't own a country.
 *   3. Coordinates: the origins pipeline where it knows the artist,
 *      otherwise the country's label point with deterministic jitter.
 *
 * Output public/world-songs/<genre-slug>.json (fetched lazily by the app):
 *   { "<GeoJSON NAME>": [ { i: deezerTrackId, t: title, a: artist,
 *                           la: lat, ln: lng } ], "__done": [names] }
 *
 * Resumable: countries listed in __done are skipped on re-runs.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.join(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'public', 'world-songs');
const UA = 'MusicExploration/0.1 ( https://github.com/madhurima7c/circle-of-music )';
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const SONGS_PER_PAIR = 8;     // 175 countries × 8 ≈ 1,400+ per genre
const PER_ARTIST_CAP = 2;     // variety beats depth inside one pairing
const MB_ARTISTS = 12;
const MB_MIN_SCORE = 60;

/* ---------- inputs ---------- */
const geoIso = JSON.parse(readFileSync(path.join(ROOT, 'lib', 'geo-iso.json'), 'utf8')) as Record<string, string>;
const seeds = JSON.parse(readFileSync(path.join(ROOT, 'lib', 'seeds.json'), 'utf8')) as {
  genres: string[];
  artists: Record<string, Record<string, string[]>>;
};
const worldSeeds = JSON.parse(readFileSync(path.join(ROOT, 'lib', 'world-seeds.json'), 'utf8')) as Record<
  string,
  { top: string[]; genres: Record<string, string[]> }
>;
const origins = JSON.parse(readFileSync(path.join(ROOT, 'lib', 'origins.json'), 'utf8')) as Record<
  string,
  { lat: number; lng: number } | null
>;
const geo = JSON.parse(
  readFileSync(path.join(ROOT, 'public', 'geo', 'countries-110m.geojson'), 'utf8'),
) as { features: Array<{ properties: { NAME: string; LABEL_X: number; LABEL_Y: number } }> };

// Import would drag in TS path aliases; keep the tag map inline-read instead.
const mbTagsSrc = readFileSync(path.join(ROOT, 'lib', 'musicbrainz-tags.ts'), 'utf8');
function extractRecord(varName: string): Record<string, unknown> {
  const m = mbTagsSrc.match(new RegExp(`${varName}[^=]*=\\s*({[\\s\\S]*?})\\s*;`));
  if (!m) throw new Error(`could not parse ${varName} from musicbrainz-tags.ts`);
  // eslint-disable-next-line no-eval
  return eval(`(${m[1]})`) as Record<string, unknown>;
}
const GENRE_TO_MB_TAGS = extractRecord('GENRE_TO_MB_TAGS') as Record<string, string[]>;

const LABEL_POINT = new Map<string, { lat: number; lng: number }>();
for (const f of geo.features) {
  LABEL_POINT.set(f.properties.NAME, { lat: f.properties.LABEL_Y, lng: f.properties.LABEL_X });
}

// Our-country-name → GeoJSON NAME (only the US differs among the wheel 20).
const SEED_TO_GEO: Record<string, string> = { 'United States': 'United States of America' };

/* ---------- normalization (keep in sync with lib/stories.ts) ---------- */
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
function normTitle(s: string): string {
  return normName(
    String(s || '')
      .replace(/\s*[([][^)\]]*[)\]]/g, '')
      .replace(/\s*-\s*(remaster(ed)?( \d{4})?|radio edit|single version|album version|live|edit)\b.*$/i, ''),
  );
}
function hashCode(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/* ---------- MusicBrainz (hard 1 req/s limit — serialized) ---------- */
let lastMb = 0;
async function mbArtists(iso: string, genre: string): Promise<string[]> {
  const tags = GENRE_TO_MB_TAGS[genre] ?? [genre.toLowerCase()];
  const q = `country:${iso} AND (${tags.map((t) => `tag:"${t}"`).join(' OR ')})`;
  const url = `https://musicbrainz.org/ws/2/artist?query=${encodeURIComponent(q)}&fmt=json&limit=${MB_ARTISTS}`;
  const wait = 1100 - (Date.now() - lastMb);
  if (wait > 0) await sleep(wait);
  lastMb = Date.now();
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' } });
    if (res.status === 503) { await sleep(5000); return []; }
    if (!res.ok) return [];
    const data = (await res.json()) as { artists?: Array<{ name?: string; score?: number }> };
    return (data.artists ?? [])
      .filter((a) => (a.score ?? 0) >= MB_MIN_SCORE)
      .map((a) => a.name)
      .filter((n): n is string => !!n && n.trim().length > 0);
  } catch {
    return [];
  }
}

/* ---------- Deezer (anonymous quota ~50 req/5 s — pace + back off) ---------- */
let deezerBudget = Promise.resolve();
async function deezer<T>(pathAndQuery: string): Promise<T | null> {
  const run = async (): Promise<T | null> => {
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        const res = await fetch(`https://api.deezer.com${pathAndQuery}`, {
          headers: { 'User-Agent': UA },
        });
        const data = (await res.json()) as T & { error?: { code?: number } };
        if ((data as { error?: { code?: number } }).error?.code === 4) {
          await sleep(5500);           // quota exceeded — wait a window
          continue;
        }
        return data;
      } catch {
        await sleep(1500 * (attempt + 1));
      }
    }
    return null;
  };
  // ~7 req/s ceiling, serialized through a rolling promise.
  const prev = deezerBudget;
  let done: () => void;
  deezerBudget = new Promise<void>((r) => { done = r; });
  await prev;
  const result = await run();
  setTimeout(() => done!(), 140);
  return result;
}

type DzArtist = { id: number; name: string };
type DzTrack = {
  id: number; title: string; preview?: string;
  artist?: { id?: number; name?: string };
};

async function resolveArtist(name: string): Promise<DzArtist | null> {
  const data = await deezer<{ data?: DzArtist[] }>(
    `/search/artist?q=${encodeURIComponent(name)}&limit=5`,
  );
  const hits = data?.data ?? [];
  const target = normName(name);
  return hits.find((a) => normName(a.name) === target) ?? hits[0] ?? null;
}

async function topTracks(artistId: number): Promise<DzTrack[]> {
  const data = await deezer<{ data?: DzTrack[] }>(`/artist/${artistId}/top?limit=7`);
  return (data?.data ?? []).filter((t) => t.preview);
}

/* ---------- per-pairing worker ---------- */
type Song = { i: number; t: string; a: string; la: number; ln: number };

function coordsFor(artist: string, geoNameKey: string, songIdx: number): { la: number; ln: number } | null {
  const o = origins[normName(artist)];
  const base = o ?? LABEL_POINT.get(geoNameKey) ?? null;
  if (!base) return null;
  const h = hashCode(`${artist}|${songIdx}`);
  const spread = o ? 0.5 : 3.0;   // curated coords barely jitter; label points fan out
  return {
    la: Math.round((base.lat + ((h % 100) / 100 - 0.5) * spread) * 100) / 100,
    ln: Math.round((base.lng + (((h >> 7) % 100) / 100 - 0.5) * spread) * 100) / 100,
  };
}

async function songsFor(geoNameKey: string, genre: string): Promise<Song[]> {
  const iso = geoIso[geoNameKey];
  const seedName = Object.entries(SEED_TO_GEO).find(([, g]) => g === geoNameKey)?.[0] ?? geoNameKey;

  // Popularity-first artist list: MB score order, then curated, then world-seeds.
  const names: string[] = [];
  const seenArtists = new Set<string>();
  const add = (n: string) => {
    const k = normName(n);
    if (k && !seenArtists.has(k)) { seenArtists.add(k); names.push(n); }
  };
  (iso ? await mbArtists(iso, genre) : []).forEach(add);
  (seeds.artists[seedName]?.[genre] ?? []).forEach(add);
  (worldSeeds[geoNameKey]?.genres?.[genre] ?? []).forEach(add);

  const songs: Song[] = [];
  const seenTitles = new Set<string>();
  for (const name of names) {
    if (songs.length >= SONGS_PER_PAIR) break;
    const artist = await resolveArtist(name);
    if (!artist) continue;
    const tracks = await topTracks(artist.id);
    let taken = 0;
    for (const t of tracks) {
      if (taken >= PER_ARTIST_CAP || songs.length >= SONGS_PER_PAIR) break;
      if (t.artist?.id !== artist.id) continue;      // no collab pollution
      const titleKey = `${normName(artist.name)}|${normTitle(t.title)}`;
      if (seenTitles.has(titleKey)) continue;
      const c = coordsFor(artist.name, geoNameKey, songs.length);
      if (!c) continue;
      seenTitles.add(titleKey);
      songs.push({ i: t.id, t: t.title, a: artist.name, ...c });
      taken++;
    }
  }
  return songs;
}

/* ---------- main ---------- */
type GenreFile = Record<string, Song[] | string[]> & { __done?: string[] };

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-');

async function main() {
  const args = process.argv.join(' ');
  const pick = (flag: string) => new RegExp(`--${flag}[= ]"?([^"]+?)"?(?: --|$)`).exec(args)?.[1];
  const onlyGenres = pick('genres')?.split(',').map((s) => s.trim());
  const onlyCountries = pick('countries')?.split(',').map((s) => s.trim());
  const limit = Number(pick('limit') ?? 0) || Infinity;

  mkdirSync(OUT_DIR, { recursive: true });
  const genres = seeds.genres.filter((g) => !onlyGenres || onlyGenres.includes(g));
  const allCountries = Object.keys(geoIso).filter((c) => !onlyCountries || onlyCountries.includes(c));

  for (const genre of genres) {
    const file = path.join(OUT_DIR, `${slug(genre)}.json`);
    const data: GenreFile = existsSync(file)
      ? (JSON.parse(readFileSync(file, 'utf8')) as GenreFile)
      : {};
    const done = new Set((data.__done as string[] | undefined) ?? []);
    const todo = allCountries.filter((c) => !done.has(c)).slice(0, limit);
    let total = Object.entries(data)
      .filter(([k]) => k !== '__done')
      .reduce((n, [, v]) => n + (v as Song[]).length, 0);
    console.log(`\n=== ${genre}: ${done.size} countries done, ${todo.length} to go, ${total} songs so far ===`);

    for (const country of todo) {
      const songs = await songsFor(country, genre);
      if (songs.length) data[country] = songs;
      done.add(country);
      data.__done = [...done];
      total += songs.length;
      writeFileSync(file, JSON.stringify(data));
      console.log(`  ${genre} · ${country}: +${songs.length} (genre total ${total})`);
    }
  }
  console.log('\ndone.');
}

main().catch((e) => { console.error(e); process.exit(1); });
