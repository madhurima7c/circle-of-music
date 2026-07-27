/**
 * World songs v2 — popular songs for EVERY globe nation, per wheel genre.
 * Powers the World's song dots: pick genres, see their songs everywhere.
 *
 *   npm run world-songs                          # everything (hours; resumable)
 *   npm run world-songs -- --genres "Jazz,Rock"  # limit to genres
 *   npm run world-songs -- --countries "France"  # limit to countries
 *   npm run world-songs -- --limit 20            # first N countries per genre
 *   npm run world-songs -- --fresh               # re-run all countries (ignores __done)
 *
 * Per (country × genre):
 *   1. Artist candidates, popularity-first:
 *      a) MusicBrainz artist search `country:ISO AND (tag:…)` — up to 40 artists
 *         per query, score-ordered (1 req/1.1s — their hard rate limit).
 *      b) Deezer search `"genre country"` — popular tracks in that style.
 *      c) Curated seeds (wheel countries) and world-seeds buckets.
 *   2. Genre verification — cross-check each artist against:
 *      a) MusicBrainz tags (the artist must carry a matching tag).
 *      b) Every Noise at Once micro-genres for the country (the artist's
 *         Deezer genre must map to one of our wheel genres).
 *      c) Deezer's own genre_id on the artist profile.
 *   3. Deezer resolution: artist → top 25 tracks (popularity-ordered, preview
 *      required). Up to SONGS_PER_PAIR songs per pairing, a few per artist so
 *      one act can't own a country.
 *   4. Coordinates: the origins pipeline where it knows the artist, otherwise
 *      the country's label point with deterministic jitter.
 *
 * Output public/world-songs/<genre-slug>.json (fetched lazily by the app):
 *   { "<GeoJSON NAME>": [ { i: deezerTrackId, t: title, a: artist,
 *                           la: lat, ln: lng } ], "__done": [names] }
 *
 * Resumable: countries listed in __done are skipped on re-runs.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { pickBestArtistMatch } from '../lib/deezer';   // one guarded matcher, not a copy
import { eachRow } from './csv-stream';

const ROOT = path.join(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'public', 'world-songs');
const UA = 'MusicExploration/0.1 ( https://github.com/madhurima7c/circle-of-music )';
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const SONGS_PER_PAIR = 50;    // max songs per country × genre
const PER_ARTIST_CAP = 5;     // tracks taken from one artist per pairing
const MB_ARTISTS = 40;        // MusicBrainz artist search limit
const MB_MIN_SCORE = 50;      // lower threshold → more candidates to verify
const DZ_SEARCH_TRACKS = 50;  // Deezer search results per query

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
  { lat: number; lng: number; country?: string; precision?: string } | null
>;
const geo = JSON.parse(
  readFileSync(path.join(ROOT, 'public', 'geo', 'countries-110m.geojson'), 'utf8'),
) as { features: Array<{ properties: { NAME: string; LABEL_X: number; LABEL_Y: number } }> };
const enaoGenres = JSON.parse(
  readFileSync(path.join(ROOT, 'lib', 'enao-genres.json'), 'utf8'),
) as Record<string, string[]>;

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

const SEED_TO_GEO: Record<string, string> = { 'United States': 'United States of America' };

/* ---------- ENAO micro-genre → wheel genre mapping ----------
 * Each of our 20 genres maps to keywords; an ENAO micro-genre matches if
 * any keyword appears as a substring. This lets us verify that a Deezer
 * artist's genre aligns with what ENAO says exists in that country. */
const GENRE_KEYWORDS: Record<string, string[]> = {
  Afrobeats:    ['afrobeat', 'afropop', 'afro'],
  Ambient:      ['ambient', 'drone', 'chillout', 'new age', 'meditation'],
  'Bossa Nova': ['bossa nova', 'bossa', 'mpb', 'tropicalia'],
  Classical:    ['classical', 'baroque', 'chamber', 'opera', 'symphony', 'orchestral', 'carnatic', 'hindustani', 'qawwali', 'gamelan'],
  Cumbia:       ['cumbia'],
  Disco:        ['disco', 'eurodance', 'hi-nrg', 'italo'],
  Electronic:   ['electronic', 'electronica', 'idm', 'synth', 'glitch', 'downtempo', 'trip hop', 'breakbeat', 'drum and bass', 'dnb', 'jungle'],
  Folk:         ['folk', 'singer-songwriter', 'traditional', 'bluegrass', 'country', 'fado', 'chanson', 'flamenco', 'ranchera', 'tango', 'mbalax', 'gnawa'],
  Funk:         ['funk', 'p-funk', 'boogie'],
  'Hip Hop':    ['hip hop', 'hip-hop', 'rap', 'trap', 'drill', 'grime', 'boom bap', 'crunk', 'phonk'],
  House:        ['house', 'garage', 'uk garage', 'speed garage'],
  Indie:        ['indie', 'alternative', 'shoegaze', 'dream pop', 'lo-fi', 'noise pop', 'post-rock', 'emo', 'math rock'],
  Jazz:         ['jazz', 'bebop', 'bop', 'swing', 'big band', 'hard bop', 'cool jazz', 'modal', 'free jazz', 'latin jazz', 'smooth jazz'],
  Pop:          ['pop', 'k-pop', 'j-pop', 'c-pop', 'europop', 'synthpop', 'dancepop', 'teen pop', 'bubblegum'],
  Punk:         ['punk', 'hardcore', 'post-punk', 'anarcho', 'oi', 'ska punk', 'pop punk'],
  Reggae:       ['reggae', 'dub', 'dancehall', 'ska', 'rocksteady', 'roots'],
  Rock:         ['rock', 'metal', 'grunge', 'blues rock', 'hard rock', 'prog rock', 'psychedelic', 'stoner', 'garage rock', 'surf'],
  Soul:         ['soul', 'r&b', 'rnb', 'motown', 'gospel', 'neo soul', 'rhythm and blues', 'neo-soul'],
  Techno:       ['techno', 'minimal', 'acid', 'industrial', 'ebm', 'gabber', 'hardstyle', 'trance'],
  World:        ['world', 'ethnic', 'global', 'fusion', 'devotional', 'sufi', 'griot', 'highlife', 'soukous', 'zouk', 'calypso', 'soca', 'bhangra', 'bollywood', 'filmi', 'enka', 'kayokyoku', 'sertanejo', 'axe', 'rebetiko', 'rai', 'chaabi'],
};

function enaoMatchesGenre(country: string, genre: string): boolean {
  const micros = enaoGenres[country];
  if (!micros || !micros.length) return true; // no ENAO data → don't filter
  const keywords = GENRE_KEYWORDS[genre];
  if (!keywords) return true;
  return micros.some(m => keywords.some(kw => m.includes(kw)));
}

/* ---------- Deezer genre_id → wheel genre mapping ---------- */
const DEEZER_GENRE_MAP: Record<number, string[]> = {
  // Deezer genre IDs: https://api.deezer.com/genre
  0:   [],                                    // All
  2:   ['World', 'Folk'],                     // Pop → too broad, skip
  85:  ['Jazz', 'Soul'],                      // Alternative
  106: ['Electronic', 'Techno', 'House'],      // Electro
  113: ['Rock'],                               // Rock
  116: ['Hip Hop'],                            // Rap/Hip Hop
  129: ['Jazz'],                               // Jazz
  132: ['Classical'],                          // Classical
  144: ['Reggae'],                             // Reggae
  152: ['Pop'],                                // Pop
  153: ['Soul', 'Funk'],                       // R&B
  165: ['Soul'],                               // Soul & Funk
  169: ['Folk'],                               // Folk
  170: ['Metal'],                              // Metal
  173: ['Ambient'],                            // Chillout/Lounge
  186: ['World', 'Folk'],                      // World
  197: ['World', 'Folk', 'Afrobeats'],         // Latin / African
  464: ['Electronic', 'Techno', 'House'],      // Dance
  466: ['Punk', 'Rock'],                       // Punk
  549: ['Indie', 'Rock'],                      // Indie
};

function deezerGenreMatches(genreId: number | undefined, targetGenre: string): boolean {
  if (!genreId) return true; // unknown → don't filter
  const mapped = DEEZER_GENRE_MAP[genreId];
  if (!mapped || !mapped.length) return true;
  return mapped.includes(targetGenre);
}

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
    const data = (await res.json()) as { artists?: Array<{ name?: string; score?: number; tags?: Array<{ name: string }> }> };
    return (data.artists ?? [])
      .filter((a) => (a.score ?? 0) >= MB_MIN_SCORE)
      .map((a) => a.name)
      .filter((n): n is string => !!n && n.trim().length > 0);
  } catch {
    return [];
  }
}

/** Verify an artist has matching tags on MusicBrainz (for artists found via
 *  non-MB sources). Returns true if we find at least one matching tag, or if
 *  MusicBrainz has no tags at all (benefit of the doubt). */
async function mbVerifyArtist(artistName: string, genre: string): Promise<boolean> {
  const tags = GENRE_TO_MB_TAGS[genre] ?? [genre.toLowerCase()];
  const q = `artist:"${artistName.replace(/"/g, '')}"`;
  const url = `https://musicbrainz.org/ws/2/artist?query=${encodeURIComponent(q)}&fmt=json&limit=3`;
  const wait = 1100 - (Date.now() - lastMb);
  if (wait > 0) await sleep(wait);
  lastMb = Date.now();
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' } });
    if (!res.ok) return true; // can't verify → pass
    const data = (await res.json()) as { artists?: Array<{ name?: string; tags?: Array<{ name: string }> }> };
    const target = normName(artistName);
    const match = (data.artists ?? []).find(a => normName(a.name ?? '') === target);
    if (!match) return true; // not on MB → can't verify, pass
    const artistTags = (match.tags ?? []).map(t => t.name.toLowerCase());
    if (!artistTags.length) return true; // no tags → pass
    return tags.some(t => artistTags.includes(t));
  } catch {
    return true;
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
          await sleep(5500);
          continue;
        }
        return data;
      } catch {
        await sleep(1500 * (attempt + 1));
      }
    }
    return null;
  };
  const prev = deezerBudget;
  let done: () => void;
  deezerBudget = new Promise<void>((r) => { done = r; });
  await prev;
  const result = await run();
  setTimeout(() => done!(), 140);
  return result;
}

type DzArtist = { id: number; name: string; nb_fan?: number };
type DzTrack = {
  id: number; title: string; preview?: string; rank?: number;
  artist?: { id?: number; name?: string };
  album?: { genre_id?: number };
};
type DzArtistFull = DzArtist & { genre_id?: number };

/**
 * Resolve a name to a Deezer artist, or to nothing.
 *
 * This used to end in `?? hits[0]`, taking Deezer's first result for a name
 * Deezer had never heard of — the same fault that put Alela Diane, from
 * Nevada City California, into India x Jazz on the Circle side. Here it is
 * worse, because the wrong artist's whole catalogue is then BAKED into
 * public/world-songs and drawn as dots.
 *
 * `pickBestArtistMatch` keeps the useful part of that fallback — spelling and
 * word-order variants — and rejects everything else. See lib/deezer.ts.
 */
async function resolveArtist(name: string): Promise<DzArtistFull | null> {
  const data = await deezer<{ data?: DzArtistFull[] }>(
    `/search/artist?q=${encodeURIComponent(name)}&limit=10`,
  );
  const hits = data?.data ?? [];
  return (pickBestArtistMatch(name, hits) as DzArtistFull | null) ?? null;
}

async function topTracks(artistId: number): Promise<DzTrack[]> {
  const data = await deezer<{ data?: DzTrack[] }>(`/artist/${artistId}/top?limit=25`);
  return (data?.data ?? []).filter((t) => t.preview);
}

/** Search Deezer directly for tracks matching "genre country" — surfaces
 *  popular songs that might not show up via artist-first discovery. */
async function deezerSearchTracks(genre: string, countryName: string): Promise<DzTrack[]> {
  const query = `${genre} ${countryName}`;
  const data = await deezer<{ data?: DzTrack[] }>(
    `/search/track?q=${encodeURIComponent(query)}&limit=${DZ_SEARCH_TRACKS}`,
  );
  return (data?.data ?? []).filter((t) => t.preview);
}

/* ---------- per-pairing worker ---------- */
type Song = { i: number; t: string; a: string; la: number; ln: number };

function coordsFor(artist: string, geoNameKey: string, songIdx: number): { la: number; ln: number } | null {
  const o = origins[normName(artist)];
  const base = o ?? LABEL_POINT.get(geoNameKey) ?? null;
  if (!base) return null;
  const h = hashCode(`${artist}|${songIdx}`);
  const spread = o ? 0.5 : 3.0;
  return {
    la: Math.round((base.lat + ((h % 100) / 100 - 0.5) * spread) * 100) / 100,
    ln: Math.round((base.lng + (((h >> 7) % 100) / 100 - 0.5) * spread) * 100) / 100,
  };
}

// Track genre-verification failures for logging
let verifySkips = 0;
let countrySkips = 0;

async function songsFor(geoNameKey: string, genre: string): Promise<Song[]> {
  const iso = geoIso[geoNameKey];
  const seedName = Object.entries(SEED_TO_GEO).find(([, g]) => g === geoNameKey)?.[0] ?? geoNameKey;
  const hasEnaoGenre = enaoMatchesGenre(geoNameKey, genre);

  // Phase 1: gather artist candidates from all sources.
  const names: string[] = [];
  const seenArtists = new Set<string>();
  const artistSource = new Map<string, string>(); // track source for verification
  const add = (n: string, source: string) => {
    const k = normName(n);
    if (k && !seenArtists.has(k)) {
      seenArtists.add(k);
      names.push(n);
      artistSource.set(k, source);
    }
  };

  // Source A: MusicBrainz (pre-verified by tag — highest trust)
  (iso ? await mbArtists(iso, genre) : []).forEach(n => add(n, 'mb'));

  // Source B: curated seeds (hand-picked — highest trust)
  (seeds.artists[seedName]?.[genre] ?? []).forEach(n => add(n, 'seed'));

  // Source C: world-seeds (Deezer-verified — high trust)
  (worldSeeds[geoNameKey]?.genres?.[genre] ?? []).forEach(n => add(n, 'ws'));

  // Source D: Deezer direct search (needs verification)
  const searchTracks = await deezerSearchTracks(genre, seedName);
  for (const t of searchTracks) {
    if (t.artist?.name) add(t.artist.name, 'dz');
  }

  // Phase 2: resolve each artist on Deezer, verify genre, take best tracks.
  const songs: Song[] = [];
  const seenTitles = new Set<string>();

  for (const name of names) {
    if (songs.length >= SONGS_PER_PAIR) break;
    const artist = await resolveArtist(name);
    if (!artist) continue;

    // Genre verification for non-MB/non-seed sources.
    const source = artistSource.get(normName(name)) ?? 'unknown';
    /* COUNTRY CHECK — applied to source D only, and deliberately so.
     *
     * Source D is a free-text "<genre> <country>" Deezer search: it returns
     * anything containing the genre word, from anywhere. That is what put
     * "Afrobeats Lounge" and "London Afrobeat Collective" under Laos, Chilean
     * Newen Afrobeat under Chad, and sleep-music compilations under Belize.
     * It has to PROVE the artist belongs here; unverifiable means rejected.
     *
     * The other three sources are NOT vetoed on origin, and that is a
     * judgement call worth recording. They are already country-scoped —
     * MusicBrainz tag queries per country, hand-curated seeds, Deezer-verified
     * world seeds — so they carry real evidence of association. Vetoing them
     * on birthplace empties exactly the countries that can least afford it:
     * Albania x Jazz drops to nothing because Elina Duni, the Albanian jazz
     * singer, moved to Switzerland at ten and both origin sources file her
     * there. Diaspora is not an error, and `recoord` draws these dots inside
     * the filing country anyway.
     *
     * If we ever want the strict "birthplace only" globe, this is the line to
     * change — but it is a product decision about what a dot MEANS, not a bug
     * fix, and it costs the small scenes most. */
    const known = knownCountryOf(name);
    const here = canonCountry(seedName);
    if (source === 'dz' && known !== here) { countrySkips++; continue; }

    if (source === 'dz') {
      // Deezer-found artists: verify via Deezer genre_id AND cross-check
      // with ENAO (if the country has ENAO data for this genre).
      if (!deezerGenreMatches(artist.genre_id, genre)) {
        verifySkips++;
        continue;
      }
      // If ENAO says this genre doesn't exist in this country AND the
      // artist came only from a generic Deezer search, be skeptical.
      if (!hasEnaoGenre && source === 'dz') {
        const mbOk = await mbVerifyArtist(name, genre);
        if (!mbOk) { verifySkips++; continue; }
      }
    }

    const tracks = await topTracks(artist.id);
    let taken = 0;
    for (const t of tracks) {
      if (taken >= PER_ARTIST_CAP || songs.length >= SONGS_PER_PAIR) break;
      if (t.artist?.id !== artist.id) continue;
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

/* ---------- local country truth ----------
 *
 * `kaggle_datasets/artists.csv` carries a MusicBrainz country for 662k
 * artists. Loading it once turns every country check into a Map lookup,
 * which matters twice over: MusicBrainz's 1 req/sec would otherwise put a
 * hard floor of many hours on this crawl, and a local index can verify
 * artists the network pass would have had no budget to ask about.
 *
 * The file is optional. Without it the crawl still runs — it just falls back
 * to origins.json alone and rejects more source-D artists, which is the safe
 * direction.
 */
const artistCountry = new Map<string, string>();

async function loadArtistCountries(): Promise<void> {
  const csv = path.join(ROOT, 'kaggle_datasets', 'artists.csv');
  if (!existsSync(csv)) {
    console.log('(no kaggle_datasets/artists.csv — country checks fall back to origins.json)');
    return;
  }
  const started = Date.now();
  await eachRow(csv, (r) => {
    const c = r.country_mb;                 // country_lastfm conflates language with origin
    if (!c) return;
    for (const n of [r.artist_mb, r.artist_lastfm]) {
      const k = normName(n || '');
      if (k && !artistCountry.has(k)) artistCountry.set(k, c);
    }
  });
  console.log(`country index: ${artistCountry.size.toLocaleString()} artists (${((Date.now() - started) / 1000).toFixed(0)}s)`);
}

/** artists.csv / origins.json country names vs our GeoJSON names. */
const COUNTRY_SYNONYM: Record<string, string> = {
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
const canonCountry = (c: string) => {
  const n = normName(c);
  return COUNTRY_SYNONYM[n] ?? n;
};

/**
 * What we believe about where an artist is from — origins.json first (it is
 * curated and hand-corrected), then the bulk index.
 */
function knownCountryOf(artistName: string): string | null {
  const k = normName(artistName);
  const o = origins[k];
  if (o?.country) return canonCountry(o.country);
  const c = artistCountry.get(k);
  return c ? canonCountry(c) : null;
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
  const fresh = args.includes('--fresh');

  await loadArtistCountries();
  mkdirSync(OUT_DIR, { recursive: true });
  const genres = seeds.genres.filter((g) => !onlyGenres || onlyGenres.includes(g));
  const allCountries = Object.keys(geoIso).filter((c) => !onlyCountries || onlyCountries.includes(c));

  for (const genre of genres) {
    const file = path.join(OUT_DIR, `${slug(genre)}.json`);
    const data: GenreFile = existsSync(file)
      ? (JSON.parse(readFileSync(file, 'utf8')) as GenreFile)
      : {};
    const done = fresh ? new Set<string>() : new Set((data.__done as string[] | undefined) ?? []);
    if (fresh) {
      // Wipe old data for this genre when --fresh is used
      for (const k of Object.keys(data)) {
        if (k !== '__done') delete data[k];
      }
    }
    const todo = allCountries.filter((c) => !done.has(c)).slice(0, limit);
    let total = Object.entries(data)
      .filter(([k]) => k !== '__done')
      .reduce((n, [, v]) => n + (v as Song[]).length, 0);
    console.log(`\n=== ${genre}: ${done.size} countries done, ${todo.length} to go, ${total} songs so far ===`);
    verifySkips = 0; countrySkips = 0;

    for (const country of todo) {
      const songs = await songsFor(country, genre);
      if (songs.length) data[country] = songs;
      done.add(country);
      data.__done = [...done];
      total += songs.length;
      writeFileSync(file, JSON.stringify(data));
      console.log(`  ${genre} · ${country}: +${songs.length} (genre total ${total})${verifySkips ? ` [${verifySkips} genre-filtered]` : ''}${countrySkips ? ` [${countrySkips} wrong-country]` : ''}`);
    }
  }
  console.log('\ndone.');
}

main().catch((e) => { console.error(e); process.exit(1); });
