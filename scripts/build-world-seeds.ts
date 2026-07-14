/**
 * World seeds — verified artists for EVERY globe nation, genre-bucketed.
 *
 *   npm run world-seeds              # resumable: skips countries already done
 *   npm run world-seeds -- --only "Iceland,Kenya"
 *
 * The Circle keeps its hand-curated 20×20 (lib/seeds.json); this dataset
 * powers the World globe's "tap any country" promise. Per country:
 *
 *   1. One Wikidata SPARQL query: musicians/bands with citizenship or
 *      origin = country, their genres (P136) attached, ranked by sitelink
 *      count (notability proxy). No key, CORS-free from node.
 *   2. Wikidata genre labels → the 20 wheel genres via keyword mapping.
 *   3. Deezer verification: an artist survives only if the name resolves
 *      to a Deezer artist (exact normalized match). Concurrency-limited
 *      with backoff so anonymous JSONP quota isn't tripped.
 *   4. Cross-check: lib/enao-genres.json (Every Noise at Once) marks which
 *      wheel genres are *distinctive* for the country → stored as
 *      `featured` so the UI can spotlight them.
 *
 * Output lib/world-seeds.json:
 *   { "<GeoJSON NAME>": { top: string[], featured: string[],
 *                         genres: { "<wheel genre>": string[] } } }
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'lib', 'world-seeds.json');
const UA = 'MusicExploration/0.1 ( https://github.com/madhurima7c/circle-of-music )';
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const geoIso = JSON.parse(readFileSync(path.join(ROOT, 'lib', 'geo-iso.json'), 'utf8')) as Record<string, string>;
const enao = JSON.parse(readFileSync(path.join(ROOT, 'lib', 'enao-genres.json'), 'utf8')) as Record<string, string[]>;
const seeds = JSON.parse(readFileSync(path.join(ROOT, 'lib', 'seeds.json'), 'utf8')) as { genres: string[] };

// Keep in sync with lib/stories.ts normKey (Unicode-aware + fold table).
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

/* ---------- Wikidata/ENAO genre label → wheel genre ----------
 * Ordered: first match wins; an artist can land in several buckets. */
const GENRE_RULES: Array<[string, string[]]> = [
  ['Bossa Nova', ['bossa']],
  ['Cumbia',     ['cumbia']],
  ['Afrobeats',  ['afrobeats', 'afropop', 'afro-pop', 'afro pop', 'afrofusion', 'afroswing', 'azonto']],
  ['Reggae',     ['reggae', 'dancehall', 'ska', 'ragga', 'dub music', 'rocksteady', 'riddim']],
  ['Punk',       ['punk', 'hardcore', 'emo', 'screamo', 'oi!']],
  ['Techno',     ['techno', 'acid house', 'minimal']],
  ['House',      ['house', 'amapiano', 'gqom', 'uk garage', 'garage house', 'kwaito']],
  ['Disco',      ['disco', 'boogie', 'city pop', 'italo', 'eurodance', 'eurobeat']],
  ['Ambient',    ['ambient', 'new age', 'new-age', 'drone', 'lo-fi beats']],
  ['Hip Hop',    ['hip hop', 'hip-hop', 'rap', 'grime', 'drill', 'trap', 'crunk', 'boom bap']],
  ['Jazz',       ['jazz', 'swing', 'bebop', 'big band']],
  ['Classical',  ['classical', 'opera', 'baroque', 'symphon', 'orchestr', 'concerto', 'chamber music', 'choral', 'requiem', 'lied', 'oratorio']],
  ['Electronic', ['electronic', 'electronica', 'synth', 'idm', 'downtempo', 'trip hop', 'trip-hop', 'edm', 'electro', 'dubstep', 'drum and bass', 'chillwave', 'vaporwave', 'breakbeat', 'glitch', 'future bass']],
  ['Funk',       ['funk', 'afrobeat', 'go-go']],
  ['Soul',       ['soul', 'r&b', 'rhythm and blues', 'rhythm & blues', 'motown', 'gospel', 'blues', 'neo soul', 'doo-wop', 'quiet storm']],
  ['Rock',       ['rock', 'metal', 'grunge', 'psychedel', 'shoegaze', 'krautrock', 'new wave', 'britpop', 'post-rock']],
  ['Indie',      ['indie', 'dream pop', 'jangle', 'twee', 'bedroom pop']],
  ['Folk',       ['folk', 'singer-songwriter', 'americana', 'country music', 'country pop', 'bluegrass', 'acoustic', 'trova', 'nueva cancion', 'bard']],
  ['World',      ['world', 'traditional', 'flamenco', 'fado', 'tango', 'salsa', 'merengue', 'bachata', 'mariachi', 'ranchera', 'norteno', 'klezmer', 'qawwali', 'ghazal', 'rai', 'gnawa', 'chaabi', 'arabesque', 'anatolian', 'rebetiko', 'laiko', 'schlager', 'chanson', 'samba', 'mpb', 'forro', 'sertanejo', 'axe', 'pagode', 'highlife', 'juju music', 'fuji music', 'mbalax', 'soukous', 'rumba', 'zouk', 'makossa', 'bikutsi', 'morna', 'mbaqanga', 'isicathamiya', 'maskandi', 'bhangra', 'filmi', 'bollywood', 'carnatic', 'hindustani', 'gamelan', 'dangdut', 'enka', 'min\'yo', 'trot', 'luk thung', 'morlam', 'cai luong', 'calypso', 'soca', 'reggaeton', 'mento', 'celtic', 'polka', 'turbo-folk', 'turbofolk', 'sevdalinka', 'fanfare', 'manele', 'chalga', 'joik', 'throat singing', 'khoomei']],
  ['Pop',        ['pop', 'idol', 'boy band', 'girl group', 'dance music', 'europop', 'ballad']],
];

function keyMatches(label: string, key: string): boolean {
  // Short keys need word boundaries ("rai" must not match "ukrainian").
  if (key.length <= 4 && /^[a-z&!'-]+$/.test(key)) {
    return new RegExp(`(^|[^a-z])${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[^a-z])`).test(label);
  }
  return label.includes(key);
}

function bucketsFor(genreLabels: string[]): string[] {
  const out = new Set<string>();
  const joined = genreLabels.map((g) => g.toLowerCase());
  for (const [wheel, keys] of GENRE_RULES) {
    if (joined.some((g) => keys.some((k) => keyMatches(g, k)))) out.add(wheel);
  }
  return [...out];
}

/* ---------- Wikidata ---------- */
async function sparql(query: string): Promise<Array<Record<string, { value?: string }>>> {
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const res = await fetch(
        `https://query.wikidata.org/sparql?query=${encodeURIComponent(query)}`,
        { headers: { 'User-Agent': UA, Accept: 'application/sparql-results+json' } },
      );
      if (res.ok) {
        const data = (await res.json()) as { results?: { bindings?: Array<Record<string, { value?: string }>> } };
        return data.results?.bindings ?? [];
      }
      if (res.status === 429) {
        // WDQS sometimes rate-limits to 1 req/min during outages — honor it.
        const retryAfter = Number(res.headers.get('retry-after') || 0);
        const wait = Math.max(retryAfter * 1000, 70_000);
        console.log(`  (WDQS 429 — waiting ${Math.round(wait / 1000)}s)`);
        await sleep(wait);
        continue;
      }
    } catch { /* retry */ }
    await sleep(2000 * (attempt + 1));
  }
  return [];
}

type Candidate = { name: string; genres: string[]; links: number };

async function countryMusicians(iso: string): Promise<Candidate[]> {
  // One query: notable musical acts of the country with their genres.
  const q = `
    SELECT ?artistLabel (MAX(?links) AS ?rank)
           (GROUP_CONCAT(DISTINCT ?genreLabel; separator="|") AS ?genres) WHERE {
      ?country wdt:P297 "${iso}".
      { ?artist wdt:P27 ?country } UNION { ?artist wdt:P495 ?country }
      ?artist wdt:P136 ?genre.
      ?artist wikibase:sitelinks ?links.
      SERVICE wikibase:label {
        bd:serviceParam wikibase:language "en".
        ?artist rdfs:label ?artistLabel.
        ?genre rdfs:label ?genreLabel.
      }
    }
    GROUP BY ?artistLabel
    ORDER BY DESC(?rank)
    LIMIT 60`;
  const rows = await sparql(q);
  return rows
    .map((r) => ({
      name: r.artistLabel?.value ?? '',
      genres: (r.genres?.value ?? '').split('|').filter(Boolean),
      links: Number(r.rank?.value ?? 0),
    }))
    .filter((c) => c.name && !/^Q\d+$/.test(c.name));
}

/* ---------- Deezer verification (concurrency-limited, backoff) ---------- */
let deezerFailures = 0;
async function deezerHas(name: string): Promise<boolean> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(
        `https://api.deezer.com/search/artist?q=${encodeURIComponent(name)}&limit=5`,
        { headers: { 'User-Agent': UA } },
      );
      if (res.status === 403 || res.status === 429) {  // quota — back off hard
        deezerFailures++;
        await sleep(3000);
        continue;
      }
      const data = (await res.json()) as { data?: Array<{ name: string }> };
      return (data.data ?? []).some((a) => normName(a.name) === normName(name));
    } catch {
      await sleep(1000);
    }
  }
  return false;
}

async function verifyBatch(names: string[], concurrency = 3): Promise<Set<string>> {
  const ok = new Set<string>();
  let cursor = 0;
  async function worker() {
    for (;;) {
      const i = cursor++;
      if (i >= names.length) return;
      if (await deezerHas(names[i])) ok.add(names[i]);
      await sleep(120);
    }
  }
  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  return ok;
}

/* ---------- ENAO featured wheel genres per country ---------- */
function featuredFor(country: string): string[] {
  const labels = enao[country] ?? [];
  return bucketsFor(labels).filter((g) => seeds.genres.includes(g));
}

/* ---------- main ---------- */
type CountryEntry = { top: string[]; featured: string[]; genres: Record<string, string[]> };

async function main() {
  const onlyArg = process.argv.indexOf('--only');
  const only = onlyArg > -1
    ? new Set(process.argv[onlyArg + 1].split(',').map((s) => s.trim()))
    : null;

  const existing: Record<string, CountryEntry> = existsSync(OUT)
    ? JSON.parse(readFileSync(OUT, 'utf8'))
    : {};

  const countries = Object.entries(geoIso)
    .filter(([name]) => (only ? only.has(name) : !(name in existing)));
  console.log(`${countries.length} countries to build (of ${Object.keys(geoIso).length})`);

  let done = 0;
  for (const [name, iso] of countries) {
    // Post-filter to acts whose P136 maps to a wheel genre — novelists and
    // films carry P136 too (literary/film genres), but those never map.
    const candidates = (await countryMusicians(iso))
      .filter((c) => bucketsFor(c.genres).length > 0);
    const verified = await verifyBatch(candidates.map((c) => c.name).slice(0, 45));
    const kept = candidates.filter((c) => verified.has(c.name));

    const genres: Record<string, string[]> = {};
    for (const c of kept) {
      for (const bucket of bucketsFor(c.genres)) {
        (genres[bucket] ??= []);
        if (genres[bucket].length < 12 && !genres[bucket].includes(c.name)) {
          genres[bucket].push(c.name);
        }
      }
    }

    existing[name] = {
      top: kept.slice(0, 15).map((c) => c.name),
      featured: featuredFor(name),
      genres,
    };
    done++;
    console.log(
      `${name}: ${kept.length}/${candidates.length} verified, ` +
      `${Object.keys(genres).length} genre buckets, featured=[${existing[name].featured.slice(0, 4)}]`,
    );
    if (done % 5 === 0) writeFileSync(OUT, JSON.stringify(existing));
    await sleep(400);  // be a polite SPARQL citizen
  }

  writeFileSync(OUT, JSON.stringify(existing));
  const covered = Object.values(existing).filter((e) => e.top.length > 0).length;
  console.log(`world-seeds.json: ${Object.keys(existing).length} countries, ${covered} with artists`);
  if (deezerFailures) console.log(`(deezer backoffs: ${deezerFailures})`);
}

main();
