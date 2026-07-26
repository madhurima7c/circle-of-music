/**
 * Mine new artists out of the Kaggle per-country Spotify charts.
 *
 *   npm run mine:charts                    # propose (writes chart-proposals.json)
 *   npm run mine:charts -- --limit 300     # short run for a spot check
 *   npm run mine:charts -- --apply         # merge approved proposals into world-seeds.json
 *
 * WHY THIS WORKS
 * `universal_top_spotify_songs.csv` is 2.1M daily chart rows across 73
 * countries. The `country` column is where a song CHARTED, not where the
 * artist is from — so on its own it cannot place anyone on the globe. But an
 * artist who charts heavily in exactly one non-US market is almost always
 * from that market: the Nigerian column returns Olamide, BNXN, Seyi Vibez,
 * Zlatan, Shallipopi. That is a strong PRIOR, not an answer.
 *
 * So the chart is only allowed to nominate. Origin is confirmed against
 * MusicBrainz, which returns an artist's actual country code — the same gate
 * `enrich-origins-mb.ts` uses.
 *
 * AN ARTIST IS ACCEPTED WHEN THE TWO AGREE — about 81% of the time, and those
 * are reliably right. The disagreements are where nearly all the errors live,
 * because an exact-name MusicBrainz match is often a DIFFERENT act with the
 * same name (the homonym trap this codebase already hit with Prithvi →
 * Faisalabad). Trusting MusicBrainz over the chart moved Seyi Vibez to Ghana,
 * Stormy to Japan and Mirella to the Netherlands — all three wrong, all three
 * right in the chart. Trusting the chart over MusicBrainz is wrong just as
 * often.
 *
 * There is ONE disagreement worth resolving, and it has a tell. When
 * MusicBrainz names a country the artist ALSO charts in, the mismatch is not a
 * name collision — it is a shared market, and taking the biggest chart column
 * as "home" simply picked the wrong one. Indian Punjabi artists (Diljit
 * Dosanjh, Sidhu Moose Wala, Karan Aujla) chart harder in Pakistan than in
 * India; Brazilian funk peaks in Portugal; Uruguayan rock in Argentina; Van
 * Morrison and Creedence in New Zealand. In every such case MusicBrainz is
 * right, and the artist's own presence in that country is the corroboration.
 * All 90 were checked by hand; none was wrong. They are accepted and marked
 * `resolution: 'chart-presence'` so a reviewer can still see them separately.
 *
 * Everything else stays unresolved: `needsReview`, no dot. A dot in the wrong
 * country is worse than no dot.
 *
 * GENRE COMES FROM MUSICBRAINZ ONLY — and that is a deliberate reversal.
 * The plan was to use the Kaggle sets' `playlist_genre` column as a second
 * opinion, but that column is the genre of the PLAYLIST a track was found on,
 * not of the track. Editorial cross-genre playlists poison it wholesale: in
 * `spotify_songs.csv`, Seyi Vibez and Young Jonn — both Nigerian Afrobeats —
 * carry a dozen `arabic` labels each, purely because their songs sit on a
 * playlist called "Arab X". No dominance or majority rule can recover from
 * that, because the wrong label is the majority. So playlist labels are
 * recorded in the proposal for a human to look at and are given zero weight
 * in the decision.
 *
 * MusicBrainz `genres` are community-voted and much cleaner; its free `tags`
 * are weaker, so they score lower (see `bucketsScored`). An artist with no
 * genre evidence is still proposed but is NOT bucketed — the wheel would
 * otherwise be asserting a genre nobody verified.
 *
 * Every proposal is also Deezer-verified, because a name we cannot resolve to
 * a playable Deezer artist is dead weight in this app.
 *
 * Nothing is merged automatically: proposals land in chart-proposals.json for
 * review, exactly like `npm run enrich`.
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { eachRow } from './csv-stream';
import { normName, bucketsScored } from '../lib/genre-rules';

const ROOT = path.join(__dirname, '..');
const KD = path.join(ROOT, 'kaggle_datasets');
const OUT = path.join(ROOT, 'chart-proposals.json');
const CACHE = path.join(ROOT, 'lib', '.chart-verify-cache.json');

const UA = 'MusicExploration/0.1 ( https://github.com/madhurima7c/circle-of-music )';
const MB_GAP_MS = 1100;          // MusicBrainz asks for 1 req/sec
const DZ_GAP_MS = 260;           // anonymous Deezer quota is ~50 req / 5s

const arg = (flag: string) => {
  const i = process.argv.indexOf(flag);
  return i > -1 ? process.argv[i + 1] : undefined;
};
const has = (flag: string) => process.argv.includes(flag);
const LIMIT = Number(arg('--limit') ?? Infinity);
const APPLY = has('--apply');

/* Chart nomination thresholds. Deliberately loose — MusicBrainz is the gate,
 * so the cost of a loose prior is verification time, not a wrong dot. */
const MIN_APPEARANCES = 5;       // rows in that country's chart
const MIN_HOME_SHARE = 0.5;      // >= half this artist's chart rows are there
const MAX_CHART_COUNTRIES = 12;  // beyond this it's a global act, not a local one

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** How many artists are verified at once. MusicBrainz stays serial behind
 *  `mbGate` regardless; concurrency only overlaps the Deezer calls with it,
 *  which took the run from ~14s to ~2.5s per artist. */
const CONCURRENCY = 6;

/**
 * Global MusicBrainz pacer. MB's 1 req/sec limit is per client, not per
 * connection, so every MB call in the process — from any worker — queues
 * through this single chain.
 */
let mbChain: Promise<void> = Promise.resolve();
function mbGate<T>(fn: () => Promise<T>): Promise<T> {
  const run = mbChain.then(() => sleep(MB_GAP_MS));
  mbChain = run.then(() => undefined, () => undefined);
  return run.then(fn);
}

type Verify = {
  name: string;
  country: string | null;        // MusicBrainz country code, null = unplaceable
  mbid: string | null;
  mbGenres: string[];            // community-VOTED — the trusted signal
  mbTags: string[];              // free folksonomy — weaker
  deezerId: number | null;
  dzGenres: string[];            // Deezer's own labels, from the playing catalogue
};

/* Weights for `bucketsScored`. A voted MusicBrainz genre alone is enough to
 * bucket an artist; two corroborating tags are also enough; one lone tag is
 * not. Kaggle playlist labels are deliberately absent — see the header. */
const W_MB_GENRE = 2;
const W_DZ_GENRE = 2;
const W_MB_TAG = 1;
const MIN_GENRE_SCORE = 2;

/* ---------- pass 1: who charts where ---------- */

type Stat = { display: string; byCc: Map<string, number>; total: number; best: number };

async function chartStats(): Promise<Map<string, Stat>> {
  const stats = new Map<string, Stat>();
  const file = path.join(KD, 'universal_top_spotify_songs.csv');
  const rows = await eachRow(file, (r) => {
    const cc = r.country;
    if (!cc) return;                                  // '' = the global chart
    const display = (r.artists || '').split(',')[0].trim();
    const key = normName(display);
    if (!key) return;
    let s = stats.get(key);
    if (!s) { s = { display, byCc: new Map(), total: 0, best: 999 }; stats.set(key, s); }
    s.byCc.set(cc, (s.byCc.get(cc) || 0) + 1);
    s.total++;
    const rank = Number(r.daily_rank);
    if (Number.isFinite(rank) && rank < s.best) s.best = rank;
  });
  console.log(`charts: ${rows.toLocaleString()} rows → ${stats.size.toLocaleString()} artists`);
  return stats;
}

/* ---------- pass 2: genre labels from the labeled Kaggle sets ---------- */

async function genreLabels(): Promise<Map<string, Set<string>>> {
  const out = new Map<string, Set<string>>();
  const add = (artist: string, ...labels: string[]) => {
    const key = normName(artist);
    if (!key) return;
    let s = out.get(key);
    if (!s) { s = new Set(); out.set(key, s); }
    for (const l of labels) if (l) s.add(l.toLowerCase().trim());
  };
  for (const rel of [
    'archive (1)/spotify_songs.csv',
    'archive (6)/high_popularity_spotify_data.csv',
    'archive (6)/low_popularity_spotify_data.csv',
  ]) {
    const file = path.join(KD, rel);
    if (!existsSync(file)) { console.log(`  (skipping missing ${rel})`); continue; }
    await eachRow(file, (r) => {
      add((r.track_artist || '').split(',')[0], r.playlist_genre, r.playlist_subgenre);
    });
  }
  console.log(`genre labels: ${out.size.toLocaleString()} artists`);
  return out;
}

/* ---------- verification ---------- */

async function dz<T>(pathname: string): Promise<T | null> {
  try {
    const res = await fetch(`https://api.deezer.com${pathname}`, { headers: { 'User-Agent': UA } });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch { return null; }
}

async function deezerArtist(name: string): Promise<number | null> {
  const json = await dz<{ data?: Array<{ id: number; name: string }> }>(
    `/search/artist?q=${encodeURIComponent(name)}&limit=5`,
  );
  if (!json) return null;
  const want = normName(name);
  // Exact normalized match only — a fuzzy hit here is how a wrong artist's
  // songs end up filed under someone else's country.
  const hit = (json.data || []).find((a) => normName(a.name) === want);
  return hit ? hit.id : null;
}

/**
 * Deezer's own genre labels for an artist, read off the albums their top
 * tracks come from.
 *
 * A third opinion that is worth more than its size suggests: it is real music
 * metadata rather than playlist membership, it is independent of MusicBrainz,
 * and — the part that matters here — it comes from the same catalogue that
 * will actually play. If Deezer files an artist under African Music, that is
 * what a listener pressing play will hear.
 */
async function deezerGenres(artistId: number): Promise<string[]> {
  const top = await dz<{ data?: Array<{ album?: { id?: number } }> }>(`/artist/${artistId}/top?limit=5`);
  const albumIds = [...new Set((top?.data || []).map((t) => t.album?.id).filter(Boolean))].slice(0, 2) as number[];
  const albums = await Promise.all(albumIds.map((id) =>
    dz<{ genres?: { data?: Array<{ name?: string }> } }>(`/album/${id}`)));
  const out = new Set<string>();
  for (const album of albums) for (const g of album?.genres?.data || []) if (g.name) out.add(g.name);
  return [...out];
}

/** ISO alpha-2 for the countries the charts cover, keyed by MusicBrainz area
 *  name — used when an artist entity carries an `area` but no `country`. */
let areaToIso: Map<string, string> | null = null;
function isoForArea(areaName: string | undefined, isoToGeo: Map<string, string>): string | null {
  if (!areaName) return null;
  if (!areaToIso) {
    areaToIso = new Map();
    for (const [iso, geoName] of isoToGeo) areaToIso.set(normName(geoName), iso);
    // MusicBrainz area names that differ from our GeoJSON NAME field.
    for (const [area, iso] of Object.entries({
      'united states': 'US', 'united kingdom': 'GB', 'south korea': 'KR',
      'russia': 'RU', 'czech republic': 'CZ', 'bosnia and herzegovina': 'BA',
      'dominican republic': 'DO', 'democratic republic of the congo': 'CD',
      'republic of the congo': 'CG', "cote d'ivoire": 'CI', 'ivory coast': 'CI',
      'north macedonia': 'MK', 'macedonia': 'MK', 'eswatini': 'SZ',
      'myanmar': 'MM', 'burma': 'MM', 'east timor': 'TL', 'timor leste': 'TL',
      'cape verde': 'CV', 'equatorial guinea': 'GQ', 'central african republic': 'CF',
      'south sudan': 'SS', 'solomon islands': 'SB', 'western sahara': 'EH',
      'falkland islands': 'FK', 'northern cyprus': 'CY', 'somaliland': 'SO',
      'laos': 'LA', 'vietnam': 'VN', 'syria': 'SY', 'iran': 'IR', 'tanzania': 'TZ',
    })) areaToIso.set(area, iso);
  }
  return areaToIso.get(normName(areaName)) ?? null;
}

/** Search MusicBrainz for an exact-name artist, then read the entity for its
 *  country and genre tags. Two requests, because the search response's `tags`
 *  are almost always empty while the entity's `genres` are populated — and
 *  genre correctness is the thing we cannot get wrong. */
async function musicbrainz(
  name: string,
  isoToGeo: Map<string, string>,
): Promise<{ country: string | null; mbid: string | null; genres: string[]; tags: string[] }> {
  const empty = { country: null, mbid: null, genres: [] as string[], tags: [] as string[] };
  let mbid: string | null = null;
  try {
    const res = await mbGate(() => fetch(
      `https://musicbrainz.org/ws/2/artist?query=${encodeURIComponent(`artist:"${name}"`)}&fmt=json&limit=5`,
      { headers: { 'User-Agent': UA } },
    ));
    if (!res.ok) return empty;
    const json = (await res.json()) as {
      artists?: Array<{ id: string; name: string; country?: string; score?: number }>;
    };
    const want = normName(name);
    const exact = (json.artists || []).filter((a) => normName(a.name) === want);
    const best = exact.find((a) => a.country) ?? exact[0];
    if (!best) return empty;
    mbid = best.id;
  } catch { return empty; }

  try {
    const res = await mbGate(() => fetch(
      `https://musicbrainz.org/ws/2/artist/${mbid}?fmt=json&inc=genres+tags`,
      { headers: { 'User-Agent': UA } },
    ));
    if (!res.ok) return { country: null, mbid, genres: [], tags: [] };
    const e = (await res.json()) as {
      country?: string;
      area?: { name?: string };
      'begin-area'?: { name?: string };
      genres?: Array<{ name: string; count?: number }>;
      tags?: Array<{ name: string; count?: number }>;
    };
    const country =
      e.country
      ?? isoForArea(e.area?.name, isoToGeo)
      ?? isoForArea(e['begin-area']?.name, isoToGeo);
    return {
      country: country ?? null,
      mbid,
      genres: (e.genres || []).filter((g) => (g.count ?? 1) > 0).map((g) => g.name),
      tags: (e.tags || []).filter((t) => (t.count ?? 0) > 0).map((t) => t.name),
    };
  } catch { return { country: null, mbid, genres: [], tags: [] }; }
}

/* ---------- main ---------- */

async function main() {
  const geoIso = JSON.parse(readFileSync(path.join(ROOT, 'lib', 'geo-iso.json'), 'utf8')) as Record<string, string>;
  const isoToGeo = new Map(Object.entries(geoIso).map(([geoName, iso]) => [iso, geoName]));
  const wheelGenres = (JSON.parse(readFileSync(path.join(ROOT, 'lib', 'seeds.json'), 'utf8')) as { genres: string[] }).genres;

  // Everyone we already have, so we only spend verification budget on new names.
  const known = new Set<string>();
  const worldSeeds = JSON.parse(readFileSync(path.join(ROOT, 'lib', 'world-seeds.json'), 'utf8')) as
    Record<string, { top?: string[]; featured?: string[]; genres?: Record<string, string[]> }>;
  for (const c of Object.values(worldSeeds)) {
    for (const a of c.top || []) known.add(normName(a));
    for (const list of Object.values(c.genres || {})) for (const a of list) known.add(normName(a));
  }
  const circleSeeds = JSON.parse(readFileSync(path.join(ROOT, 'lib', 'seeds.json'), 'utf8')) as
    { artists: Record<string, Record<string, string[]>> };
  for (const byGenre of Object.values(circleSeeds.artists)) {
    for (const list of Object.values(byGenre)) for (const a of list) known.add(normName(a));
  }
  console.log(`already seeded: ${known.size.toLocaleString()} artists`);

  const stats = await chartStats();
  const labels = await genreLabels();

  /* nominate */
  type Nominee = { key: string; name: string; homeCc: string; share: number; appearances: number; best: number; ccs: string[] };
  const nominees: Nominee[] = [];
  for (const [key, s] of stats) {
    if (known.has(key)) continue;
    if (s.byCc.size > MAX_CHART_COUNTRIES) continue;
    let homeCc = '', homeN = 0;
    for (const [cc, n] of s.byCc) if (n > homeN) { homeN = n; homeCc = cc; }
    if (homeN < MIN_APPEARANCES) continue;
    const share = homeN / s.total;
    if (share < MIN_HOME_SHARE) continue;
    nominees.push({
      key, name: s.display, homeCc, share, appearances: homeN, best: s.best,
      ccs: [...s.byCc.keys()],
    });
  }
  // Strongest local signal first, so a --limit run is a fair sample.
  nominees.sort((a, b) => (b.share - a.share) || (b.appearances - a.appearances));
  console.log(`nominated: ${nominees.length.toLocaleString()} new artists (chart prior)`);

  /* verify */
  const cache: Record<string, Verify> = existsSync(CACHE)
    ? JSON.parse(readFileSync(CACHE, 'utf8')) : {};
  let checked = 0, fromCache = 0;
  const todo = nominees.slice(0, Number.isFinite(LIMIT) ? LIMIT : nominees.length);

  const pending = todo.filter((n) => {
    if (cache[n.key]) { fromCache++; return false; }
    return true;
  });

  let cursor = 0;
  const startedAt = Date.now();
  async function worker() {
    for (;;) {
      const n = pending[cursor++];
      if (!n) return;
      const deezerId = await deezerArtist(n.name);
      await sleep(DZ_GAP_MS);
      let mb = { country: null as string | null, mbid: null as string | null, genres: [] as string[], tags: [] as string[] };
      let dzGenres: string[] = [];
      if (deezerId) {                     // don't spend MB budget on unplayable names
        [mb, dzGenres] = await Promise.all([
          musicbrainz(n.name, isoToGeo),
          deezerGenres(deezerId),
        ]);
      }
      cache[n.key] = {
        name: n.name, country: mb.country, mbid: mb.mbid,
        mbGenres: mb.genres, mbTags: mb.tags, deezerId, dzGenres,
      };
      if (++checked % 25 === 0) {
        writeFileSync(CACHE, JSON.stringify(cache));
        const rate = checked / ((Date.now() - startedAt) / 1000);
        const eta = Math.round((pending.length - checked) / rate / 60);
        console.log(`  verified ${checked}/${pending.length} (${rate.toFixed(1)}/s, ~${eta}m left)`);
      }
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  writeFileSync(CACHE, JSON.stringify(cache));
  console.log(`verified ${checked} (+${fromCache} cached)`);

  /* assemble */
  type Proposal = {
    name: string; country: string; iso: string;
    genres: string[]; genreScores: Array<{ genre: string; score: number }>;
    mbGenres: string[]; mbTags: string[]; dzGenres: string[];
    /** Recorded for human eyes only — NOT used to pick a genre. See header. */
    kagglePlaylistLabels: string[];
    deezerId: number; mbid: string | null;
    chartCountries: string[]; homeChart: string; homeShare: number;
    appearances: number; bestRank: number;
    /** 'agreed' = chart home and MusicBrainz named the same country.
     *  'chart-presence' = they differed, but the artist also charts in the
     *  MusicBrainz country, so MusicBrainz wins. Review these separately. */
    resolution: 'agreed' | 'chart-presence';
  };
  const accepted: Proposal[] = [];
  const needsReview: Array<Proposal & { chartSays: string; musicbrainzSays: string }> = [];
  const rejected = { noDeezer: 0, noMbCountry: 0, notAGlobeNation: 0 };
  let unbucketed = 0;

  for (const n of todo) {
    const v = cache[n.key];
    if (!v) continue;
    if (!v.deezerId) { rejected.noDeezer++; continue; }
    if (!v.country) { rejected.noMbCountry++; continue; }
    const geoName = isoToGeo.get(v.country);
    if (!geoName) { rejected.notAGlobeNation++; continue; }

    const scored = bucketsScored(
      [
        ...(v.mbGenres || []).map((label) => ({ label, weight: W_MB_GENRE })),
        ...(v.dzGenres || []).map((label) => ({ label, weight: W_DZ_GENRE })),
        ...(v.mbTags || []).map((label) => ({ label, weight: W_MB_TAG })),
      ],
      { minScore: MIN_GENRE_SCORE, max: 3 },
    ).filter((g) => wheelGenres.includes(g.genre));

    const proposal: Proposal = {
      name: v.name, country: geoName, iso: v.country,
      genres: scored.map((g) => g.genre), genreScores: scored,
      mbGenres: v.mbGenres || [], mbTags: v.mbTags || [], dzGenres: v.dzGenres || [],
      kagglePlaylistLabels: [...(labels.get(n.key) || [])],
      deezerId: v.deezerId, mbid: v.mbid,
      chartCountries: n.ccs, homeChart: n.homeCc, homeShare: Number(n.share.toFixed(3)),
      appearances: n.appearances, bestRank: n.best,
      resolution: 'agreed',
    };

    if (v.country !== n.homeCc) {
      /* The sources disagree — but there are two very different reasons for
       * that, and only one is a data error.
       *
       * A NAME COLLISION looks like: the artist charts in exactly one market
       * and MusicBrainz places them somewhere unconnected to it (Stormy
       * charts only in Morocco, MB says Japan). Unresolvable, so it is not
       * resolved.
       *
       * A SHARED MARKET looks like: the artist ALSO charts in the country
       * MusicBrainz names. Indian Punjabi artists — Diljit Dosanjh, Sidhu
       * Moose Wala, Karan Aujla — chart harder in Pakistan than at home, so
       * taking the biggest column as "home" picks the wrong country; they
       * chart in India too. Same shape for Brazilian funk peaking in
       * Portugal, Uruguayan rock in Argentina, Van Morrison in New Zealand.
       * Here MusicBrainz is right and the chart's argmax was wrong, and the
       * artist's own presence in the MusicBrainz country is the corroboration
       * that says so. Checked by hand across all 90: no misses.
       */
      if (!n.ccs.includes(v.country)) {
        needsReview.push({ ...proposal, chartSays: n.homeCc, musicbrainzSays: v.country });
        continue;
      }
      proposal.resolution = 'chart-presence';
    }
    if (!proposal.genres.length) unbucketed++;
    accepted.push(proposal);
  }

  accepted.sort((a, b) => a.country.localeCompare(b.country) || b.appearances - a.appearances);
  needsReview.sort((a, b) => b.appearances - a.appearances);

  const byCountry: Record<string, number> = {};
  for (const a of accepted) byCountry[a.country] = (byCountry[a.country] || 0) + 1;
  const bucketed = accepted.length - unbucketed;
  const viaChartPresence = accepted.filter((a) => a.resolution === 'chart-presence').length;

  const payload = {
    generatedAt: new Date().toISOString(),
    source: 'kaggle_datasets/universal_top_spotify_songs.csv (chart prior) + MusicBrainz (origin + genre)',
    note: 'Accepted = chart country and MusicBrainz agree, OR MusicBrainz names a country the artist also charts in (shared-language/diaspora markets). Kaggle playlist_genre is recorded but carries zero weight — it labels the playlist, not the track.',
    thresholds: { MIN_APPEARANCES, MIN_HOME_SHARE, MAX_CHART_COUNTRIES, MIN_GENRE_SCORE },
    stats: {
      nominated: nominees.length,
      verified: todo.length,
      accepted: accepted.length,
      acceptedOnAgreement: accepted.length - viaChartPresence,
      acceptedOnChartPresence: viaChartPresence,
      withGenre: bucketed,
      unbucketed,
      needsReview: needsReview.length,
      rejected,
      byCountry,
    },
    artists: accepted,
    needsReview,
  };
  writeFileSync(OUT, JSON.stringify(payload, null, 2));

  console.log(`\n=== ${path.relative(ROOT, OUT)} ===`);
  console.log(`accepted ${accepted.length} artists across ${Object.keys(byCountry).length} countries`);
  console.log(`  ${accepted.length - viaChartPresence} on chart/MusicBrainz agreement, ${viaChartPresence} on MusicBrainz + chart presence`);
  console.log(`  with a verified genre bucket: ${bucketed} (${unbucketed} unbucketed — top-list only)`);
  console.log(`  held for review (chart/MusicBrainz disagree): ${needsReview.length}`);
  console.log(`  rejected:`, rejected);
  const top = Object.entries(byCountry).sort((a, b) => b[1] - a[1]).slice(0, 12);
  console.log(`  top countries:`, top.map(([c, n]) => `${c} ${n}`).join(', '));

  if (APPLY) applyToWorldSeeds(accepted, worldSeeds);
}

/** Merge reviewed proposals into world-seeds.json. Only artists WITH a genre
 *  bucket are added to a genre list; everyone accepted joins `top`. */
function applyToWorldSeeds(
  accepted: Array<{ name: string; country: string; genres: string[] }>,
  worldSeeds: Record<string, { top?: string[]; featured?: string[]; genres?: Record<string, string[]> }>,
) {
  let addedTop = 0, addedGenre = 0;
  for (const a of accepted) {
    const entry = worldSeeds[a.country] ?? (worldSeeds[a.country] = { top: [], featured: [], genres: {} });
    entry.top ??= []; entry.genres ??= {};
    const seen = new Set(entry.top.map(normName));
    if (!seen.has(normName(a.name))) { entry.top.push(a.name); addedTop++; }
    for (const g of a.genres) {
      const list = entry.genres[g] ??= [];
      if (!list.some((x) => normName(x) === normName(a.name))) { list.push(a.name); addedGenre++; }
    }
  }
  writeFileSync(path.join(ROOT, 'lib', 'world-seeds.json'), JSON.stringify(worldSeeds, null, 2));
  console.log(`\napplied → lib/world-seeds.json: +${addedTop} to top, +${addedGenre} genre placements`);
}

main().catch((e) => { console.error(e); process.exit(1); });
