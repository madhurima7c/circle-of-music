/**
 * Genre-verification pass — checks every seed artist against external
 * sources of truth and flags placements that disagree. REPORT-ONLY: it
 * never edits seeds.json (same rule as `npm run enrich`).
 *
 *   npm run audit:genres                       # all seed placements, MusicBrainz only
 *   npm run audit:genres -- --spotify          # also corroborate with Spotify artist genres
 *   npm run audit:genres -- --pair "Argentina|Jazz" --pair "Nigeria|Rock"
 *   npm run audit:genres -- --country Brazil   # limit to one country
 *   npm run audit:genres -- --status mismatch  # print only the flagged rows
 *
 * Sources of truth, weighted then scored through the SAME bucketing the app
 * uses (lib/genre-rules.bucketsScored), so the audit and the runtime can
 * never disagree about what a label means:
 *   1. MusicBrainz *genres* — the curated, community-VOTED genre vocabulary
 *      (inc=genres), NOT the free-text folksonomy `tag:` the runtime proxy
 *      leans on. This is the primary source of truth; a genre's vote count
 *      raises its weight.
 *   2. MusicBrainz tags — folksonomy, included at low weight as a tie-breaker.
 *   3. Wikidata P136 (genre) — structured, community-edited, keyless; the
 *      default second source (on unless `--no-wikidata`). Candidate items are
 *      screened with the same looks-musical test as build-origins.
 *   4. Spotify artist genres (opt-in `--spotify`) — NOTE: Spotify stopped
 *      returning `genres` to new client-credentials apps (observed empty on
 *      this app, 2026-08); the leg is kept in case the field returns.
 *
 * A placement is judged by whether its wheel genre survives the weighted
 * scoring of that artist's evidence:
 *   verified  — the seed genre is among the strongly-evidenced buckets.
 *   weak      — the seed genre maps from the evidence but not strongly.
 *   mismatch  — the evidence points at OTHER buckets, not the seed genre.
 *   unknown   — no external evidence found (can't verify either way).
 *
 * Everything is cached to .genre-audit-cache.json and the run is resumable,
 * so re-runs only fetch artists not seen before. Output: genre-audit.json
 * (full data) + genre-audit.md (readable report) + a console summary.
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { config as dotenvConfig } from 'dotenv';

import { COUNTRY_TO_ISO } from '../lib/musicbrainz-tags';
import { bucketsScored, bucketsFor, type WeightedLabel } from '../lib/genre-rules';

const ROOT = path.join(__dirname, '..');
dotenvConfig({ path: path.join(ROOT, '.env.local') });

const seeds = JSON.parse(readFileSync(path.join(ROOT, 'lib', 'seeds.json'), 'utf8')) as {
  countries: string[];
  genres: string[];
  artists: Record<string, Record<string, string[]>>;
};

const UA = 'MusicExploration/0.1 ( https://github.com/madhurima7c/circle-of-music )';
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

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

/* ---------- CLI ---------- */
const argv = process.argv.slice(2);
const flag = (name: string) => argv.includes(name);
const opt = (name: string): string | null => {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : null;
};
const multi = (name: string): string[] =>
  argv.map((a, i) => (a === name ? argv[i + 1] : null)).filter((x): x is string => !!x);

const USE_SPOTIFY = flag('--spotify');
const USE_WIKIDATA = !flag('--no-wikidata');
const ONLY_COUNTRY = opt('--country');
const ONLY_STATUS = opt('--status');            // verified|weak|mismatch|unknown
const PAIR_FILTER = multi('--pair').map((s) => s.split('|') as [string, string]);

/* ---------- evidence cache (resumable) ---------- */
type Evidence = {
  mbGenres: Array<{ name: string; count: number }>;
  mbTags: Array<{ name: string; count: number }>;
  spotifyGenres: string[];
  spotifyChecked: boolean;
  wdGenres?: string[];
  wdChecked?: boolean;
};
const CACHE_PATH = path.join(ROOT, '.genre-audit-cache.json');
const cache: Record<string, Evidence> = existsSync(CACHE_PATH)
  ? JSON.parse(readFileSync(CACHE_PATH, 'utf8'))
  : {};
let cacheDirty = 0;
function saveCache(force = false) {
  if (!cacheDirty && !force) return;
  writeFileSync(CACHE_PATH, JSON.stringify(cache, null, 2));
  cacheDirty = 0;
}

/* ---------- MusicBrainz (1 req/sec, shared limiter) ---------- */
let lastMb = 0;
async function mb(url: string): Promise<Record<string, unknown> | null> {
  const wait = 1100 - (Date.now() - lastMb);
  if (wait > 0) await sleep(wait);
  lastMb = Date.now();
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' } });
    return res.ok ? ((await res.json()) as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** Best-matching MBID for an artist name, disambiguated by country when known. */
async function mbFindArtist(name: string, iso: string | undefined): Promise<string | null> {
  const q = `artist:"${name.replace(/"/g, '')}"` + (iso ? ` AND country:${iso}` : '');
  const data = (await mb(
    `https://musicbrainz.org/ws/2/artist?query=${encodeURIComponent(q)}&fmt=json&limit=5`,
  )) as { artists?: Array<{ id: string; name: string; score?: number }> } | null;
  const list = data?.artists ?? [];
  const exact = list.find((a) => normName(a.name) === normName(name));
  if (exact) return exact.id;
  const top = list[0];
  return top && (top.score ?? 0) >= 90 ? top.id : null;
}

/** Curated genres (voted) + folksonomy tags for one MBID. */
async function mbGenresFor(mbid: string): Promise<Pick<Evidence, 'mbGenres' | 'mbTags'>> {
  const data = (await mb(
    `https://musicbrainz.org/ws/2/artist/${mbid}?inc=genres+tags&fmt=json`,
  )) as {
    genres?: Array<{ name?: string; count?: number }>;
    tags?: Array<{ name?: string; count?: number }>;
  } | null;
  return {
    mbGenres: (data?.genres ?? [])
      .filter((g) => g.name)
      .map((g) => ({ name: g.name!, count: g.count ?? 0 })),
    mbTags: (data?.tags ?? [])
      .filter((t) => t.name)
      .map((t) => ({ name: t.name!, count: t.count ?? 0 })),
  };
}

/* ---------- Wikidata P136 (default second source; keyless) ---------- */
type WdClaims = Record<string, Array<{ mainsnak?: { datavalue?: { value?: { id?: string } } } }>>;

async function wdApi(params: Record<string, string>): Promise<Record<string, unknown>> {
  const qs = new URLSearchParams({ ...params, format: 'json' });
  try {
    const res = await fetch(`https://www.wikidata.org/w/api.php?${qs}`, {
      headers: { 'User-Agent': UA },
    });
    return res.ok ? ((await res.json()) as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/** Same screen as build-origins: genre, musical occupation, or record label. */
function wdLooksMusical(claims: WdClaims | undefined): boolean {
  if (!claims) return false;
  return !!(claims.P136?.length || claims.P106?.length || claims.P264?.length);
}

const wdGenreLabelCache = new Map<string, string>();  // genre QID → English label

async function wdGenresFor(name: string): Promise<string[]> {
  const search = (await wdApi({
    action: 'wbsearchentities', search: name, language: 'en', type: 'item', limit: '5',
  })) as { search?: Array<{ id: string }> };
  const ids = (search.search ?? []).map((c) => c.id);
  if (!ids.length) return [];
  await sleep(350);
  const ents = (await wdApi({
    action: 'wbgetentities', ids: ids.join('|'), props: 'claims',
  })) as { entities?: Record<string, { claims?: WdClaims }> };
  // First candidate that looks like a musician AND has genres wins.
  let genreQids: string[] = [];
  for (const id of ids) {
    const claims = ents.entities?.[id]?.claims;
    if (!wdLooksMusical(claims)) continue;
    genreQids = (claims?.P136 ?? [])
      .map((c) => c.mainsnak?.datavalue?.value?.id)
      .filter((q): q is string => !!q);
    if (genreQids.length) break;
  }
  if (!genreQids.length) return [];
  const unknown = genreQids.filter((q) => !wdGenreLabelCache.has(q));
  if (unknown.length) {
    await sleep(350);
    const labels = (await wdApi({
      action: 'wbgetentities', ids: unknown.join('|'), props: 'labels', languages: 'en',
    })) as { entities?: Record<string, { labels?: { en?: { value?: string } } }> };
    for (const q of unknown) {
      const l = labels.entities?.[q]?.labels?.en?.value;
      if (l) wdGenreLabelCache.set(q, l);
    }
  }
  return genreQids.map((q) => wdGenreLabelCache.get(q)).filter((l): l is string => !!l);
}

/* ---------- Spotify (opt-in; client-credentials, gentle) ---------- */
const SP_ID = process.env.SPOTIFY_CLIENT_ID || process.env.NEXT_PUBLIC_SPOTIFY_CLIENT_ID || '';
const SP_SECRET = process.env.SPOTIFY_CLIENT_SECRET || '';
let spToken: string | null = null;
let spRateLimitedUntil = 0;

async function spotifyToken(): Promise<string | null> {
  if (spToken) return spToken;
  if (!SP_ID || !SP_SECRET) return null;
  try {
    const res = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${Buffer.from(`${SP_ID}:${SP_SECRET}`).toString('base64')}`,
      },
      body: 'grant_type=client_credentials',
    });
    if (!res.ok) return null;
    spToken = ((await res.json()) as { access_token?: string }).access_token ?? null;
    return spToken;
  } catch {
    return null;
  }
}

async function spotifyGenresFor(name: string): Promise<string[]> {
  if (Date.now() < spRateLimitedUntil) return [];
  const token = await spotifyToken();
  if (!token) return [];
  const q = encodeURIComponent(name);
  try {
    const res = await fetch(
      `https://api.spotify.com/v1/search?q=${q}&type=artist&limit=3`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (res.status === 429) {
      const retry = Math.min(Number(res.headers.get('Retry-After') ?? 30) || 30, 3600);
      spRateLimitedUntil = Date.now() + retry * 1000;
      console.warn(`  ⚠ Spotify rate-limited; pausing lookups ${retry}s`);
      return [];
    }
    if (res.status === 401) { spToken = null; return []; }
    if (!res.ok) return [];
    const data = (await res.json()) as {
      artists?: { items?: Array<{ name: string; genres?: string[]; popularity?: number }> };
    };
    const items = data.artists?.items ?? [];
    const exact = items.find((a) => normName(a.name) === normName(name));
    return (exact ?? items[0])?.genres ?? [];
  } catch {
    return [];
  }
}

/* ---------- gather evidence for one artist (cached) ---------- */
async function evidenceFor(name: string, iso: string | undefined): Promise<Evidence> {
  const key = normName(name);
  let ev = cache[key];
  if (!ev) {
    const mbid = await mbFindArtist(name, iso);
    const mbData = mbid ? await mbGenresFor(mbid) : { mbGenres: [], mbTags: [] };
    ev = { ...mbData, spotifyGenres: [], spotifyChecked: false };
    cache[key] = ev;
    cacheDirty++;
  }
  // Wikidata is the default second leg; fill it in even for MB-cached artists.
  if (USE_WIKIDATA && !ev.wdChecked) {
    ev.wdGenres = await wdGenresFor(name);
    ev.wdChecked = true;
    cacheDirty++;
    await sleep(400);
  }
  // Spotify is a separate opt-in leg; fill it in even for MB-cached artists.
  if (USE_SPOTIFY && !ev.spotifyChecked) {
    ev.spotifyGenres = await spotifyGenresFor(name);
    // Only mark checked when the lookup actually RAN: a missing/expired token
    // or a rate-limit window must not permanently stamp "no Spotify genres"
    // into the cache (that poisoned 48 artists before this guard existed).
    if (Date.now() >= spRateLimitedUntil && (await spotifyToken())) ev.spotifyChecked = true;
    cacheDirty++;
    // GENTLE: same app credentials as the live site's full-song search — a
    // 429 ban here would cost real users full songs (see CLAUDE.md). One
    // request every 2s stays far under Spotify's rolling-window limits.
    await sleep(2000);
  }
  if (cacheDirty >= 15) saveCache();
  return ev;
}

/* ---------- score evidence → wheel buckets ---------- */
function scoreEvidence(ev: Evidence): {
  strong: Array<{ genre: string; score: number }>;
  any: string[];
} {
  const labels: WeightedLabel[] = [
    // Curated, VOTED genres — the primary source of truth. Baseline 4 so a
    // single curated genre already counts as real evidence; votes add more.
    ...ev.mbGenres.map((g) => ({ label: g.name, weight: 4 + Math.min(g.count, 5) })),
    // Folksonomy tags — noisy, low weight, tie-breaker only.
    ...ev.mbTags.map((t) => ({ label: t.name, weight: Math.min(t.count, 2) })),
    // Wikidata P136 — structured community data, independent of MB.
    ...(ev.wdGenres ?? []).map((g) => ({ label: g, weight: 4 })),
    // Spotify artist genres — strong independent second opinion.
    ...ev.spotifyGenres.map((g) => ({ label: g, weight: 4 })),
  ];
  return {
    strong: bucketsScored(labels, { minScore: 4, max: 4 }),
    any: bucketsFor([
      ...ev.mbGenres.map((g) => g.name),
      ...ev.mbTags.map((t) => t.name),
      ...(ev.wdGenres ?? []),
      ...ev.spotifyGenres,
    ]),
  };
}

type Status = 'verified' | 'weak' | 'mismatch' | 'unknown';
type Row = {
  country: string;
  seedGenre: string;
  artist: string;
  status: Status;
  evidence: Array<{ genre: string; score: number }>;
  mbGenres: string[];
  mbTags: string[];            // folksonomy — context for rows where curated genres are empty
  wdGenres: string[];          // Wikidata P136 labels
  spotifyGenres: string[];
  saysInstead: string[];       // strongly-evidenced buckets that are NOT the seed genre
};

function judge(country: string, seedGenre: string, artist: string, ev: Evidence): Row {
  const { strong, any } = scoreEvidence(ev);
  const strongGenres = strong.map((s) => s.genre);
  const hasAny =
    ev.mbGenres.length + ev.mbTags.length + (ev.wdGenres?.length ?? 0) + ev.spotifyGenres.length > 0;
  let status: Status;
  if (!hasAny || (strong.length === 0 && any.length === 0)) status = 'unknown';
  else if (strongGenres.includes(seedGenre)) status = 'verified';
  else if (any.includes(seedGenre)) status = 'weak';
  else status = 'mismatch';
  return {
    country, seedGenre, artist, status,
    evidence: strong,
    mbGenres: ev.mbGenres.map((g) => g.name),
    mbTags: ev.mbTags.map((t) => t.name),
    wdGenres: ev.wdGenres ?? [],
    spotifyGenres: ev.spotifyGenres,
    saysInstead: strongGenres.filter((g) => g !== seedGenre),
  };
}

/* ---------- build the work list ---------- */
function placements(): Array<[string, string, string]> {
  const out: Array<[string, string, string]> = [];
  const inScope = (c: string, g: string) => {
    if (ONLY_COUNTRY && c !== ONLY_COUNTRY) return false;
    if (PAIR_FILTER.length && !PAIR_FILTER.some(([pc, pg]) => pc === c && pg === g)) return false;
    return true;
  };
  for (const c of seeds.countries) {
    for (const g of seeds.genres) {
      if (!inScope(c, g)) continue;
      for (const artist of seeds.artists[c]?.[g] ?? []) out.push([c, g, artist]);
    }
  }
  return out;
}

/* ---------- main ---------- */
async function main() {
  const work = placements();
  console.log(
    `Auditing ${work.length} seed placements` +
      `${USE_SPOTIFY ? ' (MusicBrainz + Spotify)' : ' (MusicBrainz only — add --spotify for a 2nd source)'}…\n`,
  );
  if (USE_SPOTIFY && (!SP_ID || !SP_SECRET)) {
    console.warn('  ⚠ --spotify set but SPOTIFY creds missing in .env.local — Spotify leg will be skipped.\n');
  }

  const rows: Row[] = [];
  let done = 0;
  for (const [country, genre, artist] of work) {
    const ev = await evidenceFor(artist, COUNTRY_TO_ISO[country]);
    const row = judge(country, genre, artist, ev);
    rows.push(row);
    done++;
    if (row.status === 'mismatch') {
      console.log(
        `  ✗ ${country} · ${genre} · "${artist}" → says ${row.saysInstead.join(', ') || '—'}` +
          `   [MB: ${row.mbGenres.slice(0, 4).join(', ') || '·'}` +
          `${USE_SPOTIFY ? ` | SP: ${row.spotifyGenres.slice(0, 3).join(', ') || '·'}` : ''}]`,
      );
    }
    if (done % 25 === 0) { console.log(`  … ${done}/${work.length}`); saveCache(); }
  }
  saveCache(true);

  /* ---------- summarize ---------- */
  const by: Record<Status, Row[]> = { verified: [], weak: [], mismatch: [], unknown: [] };
  for (const r of rows) by[r.status].push(r);
  const pct = (n: number) => `${((100 * n) / rows.length).toFixed(1)}%`;

  console.log(
    `\n──────── genre audit ────────\n` +
      `  verified : ${by.verified.length} (${pct(by.verified.length)})\n` +
      `  weak     : ${by.weak.length} (${pct(by.weak.length)})\n` +
      `  mismatch : ${by.mismatch.length} (${pct(by.mismatch.length)})  ← review these\n` +
      `  unknown  : ${by.unknown.length} (${pct(by.unknown.length)})  (no external evidence)\n`,
  );

  writeFileSync(path.join(ROOT, 'genre-audit.json'), JSON.stringify(rows, null, 2));

  const md: string[] = [
    `# Genre audit`,
    ``,
    `${rows.length} seed placements checked against ` +
      `MusicBrainz genres${USE_SPOTIFY ? ' + Spotify artist genres' : ''}. Report-only — seeds.json unchanged.`,
    ``,
    `| status | count | share |`,
    `|---|---|---|`,
    `| verified | ${by.verified.length} | ${pct(by.verified.length)} |`,
    `| weak | ${by.weak.length} | ${pct(by.weak.length)} |`,
    `| **mismatch** | **${by.mismatch.length}** | **${pct(by.mismatch.length)}** |`,
    `| unknown | ${by.unknown.length} | ${pct(by.unknown.length)} |`,
    ``,
    `## Mismatches — filed under one genre, evidence says another`,
    ``,
  ];
  const shown = ONLY_STATUS ? by[ONLY_STATUS as Status] ?? by.mismatch : by.mismatch;
  if (!shown.length) md.push(`_none_`, ``);
  for (const r of shown.sort((a, b) => a.country.localeCompare(b.country))) {
    md.push(
      `- **${r.country} · ${r.seedGenre} · ${r.artist}** → says **${r.saysInstead.join(', ') || '—'}**  ` +
        `\n  MB: ${r.mbGenres.join(', ') || '·'}${USE_SPOTIFY ? `  ·  Spotify: ${r.spotifyGenres.join(', ') || '·'}` : ''}` +
        `  ·  scored: ${r.evidence.map((e) => `${e.genre}(${e.score})`).join(', ') || '·'}`,
    );
  }
  md.push(
    ``,
    `## Unknown — no external evidence (can't verify; likely niche or name-mismatch)`,
    ``,
    ...(by.unknown.length
      ? by.unknown.map((r) => `- ${r.country} · ${r.seedGenre} · ${r.artist}`)
      : [`_none_`]),
    ``,
  );
  writeFileSync(path.join(ROOT, 'genre-audit.md'), md.join('\n'));

  console.log(
    `Wrote genre-audit.json + genre-audit.md — review the mismatches, then hand-fix lib/seeds.json.\n` +
      (USE_SPOTIFY ? '' : 'Tip: re-run with --spotify to corroborate with a second source.\n'),
  );
}

main();
