/**
 * Re-examine the artists `mine:charts` quarantined, on the theory that many
 * are not conflicts at all.
 *
 *   npm run mine:ambiguous              # investigate + write ambiguous-resolved.json
 *   npm run mine:ambiguous -- --limit 60
 *
 * THE MISTAKE THIS FIXES
 * `mine-chart-artists.ts` asked MusicBrainz for an artist by name and kept the
 * first exact-name match that carried a country:
 *
 *     const best = exact.find((a) => a.country) ?? exact[0];
 *
 * That silently assumes one name means one artist. It does not. Low G is a
 * Vietnamese rapper AND a Belgian one; Jeff Redd is an American R&B singer AND
 * a Turkish rapper; Luis Vega is Bolivian while Louie Vega is American. When
 * the chart nominated the Vietnamese Low G and MusicBrainz handed back the
 * Belgian one, the miner recorded a country conflict and quarantined a
 * perfectly good artist.
 *
 * So this pass asks for EVERY exact-name match and reads their countries as a
 * set. If MusicBrainz also lists someone of that name in the country the chart
 * nominated, then the two sources were describing different people and there
 * was never a disagreement — the chart's country is right, because the chart is
 * what tells us WHICH of the same-named artists we mean.
 *
 * `artists.csv` corroborates independently: its `ambiguous_artist` column marks
 * names that share a Last.fm page for exactly this reason.
 *
 * Nothing is merged here either — output is reviewable JSON.
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { normName, bucketsScored } from '../lib/genre-rules';

const ROOT = path.join(__dirname, '..');
const PROPOSALS = path.join(ROOT, 'chart-proposals.json');
const OUT = path.join(ROOT, 'ambiguous-resolved.json');
const CACHE = path.join(ROOT, 'lib', '.ambiguous-cache.json');

const UA = 'MusicExploration/0.1 ( https://github.com/madhurima7c/circle-of-music )';
const MB_GAP_MS = 1100;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const arg = (f: string) => { const i = process.argv.indexOf(f); return i > -1 ? process.argv[i + 1] : undefined; };
const LIMIT = Number(arg('--limit') ?? Infinity);

let mbChain: Promise<void> = Promise.resolve();
function mbGate<T>(fn: () => Promise<T>): Promise<T> {
  const run = mbChain.then(() => sleep(MB_GAP_MS));
  mbChain = run.then(() => undefined, () => undefined);
  return run.then(fn);
}

/**
 * Countries the user corrected by hand after reviewing the list.
 *
 * These override every automated source. Several are here precisely because
 * one stage name covers two unrelated artists, and the note records which one
 * this project means — so a later re-run cannot quietly undo the decision.
 */
const MANUAL_COUNTRY: Record<string, { iso: string; note: string }> = {
  'ap dhillon':               { iso: 'CA', note: 'Indian-Canadian; based in Canada' },
  'friendly thug 52 ngg':     { iso: 'RU', note: 'Russian rapper' },
  'face':                     { iso: 'RU', note: 'Russian rapper (not the US act of the same name)' },
  'lalo y los descalzos':     { iso: 'MX', note: 'Mexican' },
  'toxi':                     { iso: 'RU', note: 'Toxi$ — Russian rapper' },
  'luis vega':                { iso: 'BO', note: 'Bolivian. Distinct from Little Louie Vega (US)' },
  'little louis vega':        { iso: 'US', note: 'American; distinct from Luis Vega (Bolivia)' },
  'little louie vega':        { iso: 'US', note: 'American; distinct from Luis Vega (Bolivia)' },
  'jeff redd':                { iso: 'US', note: 'American R&B singer. A Turkish rapper shares the name.' },
  'low g':                    { iso: 'VN', note: 'Vietnamese rapper. A Belgian rapper shares the name.' },
};

type Candidate = { id: string; country: string | null; score: number; area: string | null; disambiguation: string | null };

async function allExactMatches(name: string): Promise<Candidate[]> {
  try {
    const res = await mbGate(() => fetch(
      `https://musicbrainz.org/ws/2/artist?query=${encodeURIComponent(`artist:"${name}"`)}&fmt=json&limit=25`,
      { headers: { 'User-Agent': UA } },
    ));
    if (!res.ok) return [];
    const json = (await res.json()) as {
      artists?: Array<{ id: string; name: string; country?: string; score?: number;
                        area?: { name?: string }; disambiguation?: string }>;
    };
    const want = normName(name);
    return (json.artists || [])
      .filter((a) => normName(a.name) === want)
      .map((a) => ({
        id: a.id,
        country: a.country ?? null,
        score: a.score ?? 0,
        area: a.area?.name ?? null,
        disambiguation: a.disambiguation || null,
      }));
  } catch { return []; }
}

async function main() {
  const p = JSON.parse(readFileSync(PROPOSALS, 'utf8')) as {
    needsReview: Array<{
      name: string; chartSays: string; musicbrainzSays: string;
      chartCountries: string[]; appearances: number; genres: string[];
      mbGenres?: string[]; mbTags?: string[]; dzGenres?: string[]; deezerId?: number;
    }>;
  };
  const held = p.needsReview.slice(0, Number.isFinite(LIMIT) ? LIMIT : p.needsReview.length);

  const cache: Record<string, Candidate[]> = existsSync(CACHE)
    ? JSON.parse(readFileSync(CACHE, 'utf8')) : {};

  let done = 0;
  for (const a of held) {
    const key = normName(a.name);
    if (cache[key]) continue;
    cache[key] = await allExactMatches(a.name);
    if (++done % 25 === 0) {
      writeFileSync(CACHE, JSON.stringify(cache));
      console.log(`  looked up ${done}/${held.length}…`);
    }
  }
  writeFileSync(CACHE, JSON.stringify(cache));

  /* classify */
  type Resolved = {
    name: string; country: string; basis: string; note: string;
    mbCountries: string[]; mbid?: string; genres?: string[]; genresFrom?: string;
    mbGenres?: string[]; mbTags?: string[]; sharedBy?: string[];
    chartSays?: string; musicbrainzSays?: string; appearances?: number;
  };
  const resolved: Resolved[] = [];
  const stillHeld: Array<Record<string, unknown>> = [];
  const stats = { manual: 0, multiEntity: 0, singleEntity: 0, noCandidates: 0, oneCountryOnly: 0 };

  for (const a of held) {
    const key = normName(a.name);
    const cands = cache[key] || [];
    const countries = [...new Set(cands.map((c) => c.country).filter(Boolean))] as string[];

    const manual = MANUAL_COUNTRY[key];
    if (manual) {
      stats.manual++;
      resolved.push({ ...a, country: manual.iso, basis: 'manual', note: manual.note,
                      mbCountries: countries });
      continue;
    }

    if (!cands.length) { stats.noCandidates++; stillHeld.push({ ...a, mbCountries: countries, why: 'no exact MusicBrainz match' }); continue; }

    // The decisive test: does MusicBrainz list someone of this name in the
    // country the chart nominated? If so, the chart was pointing at a
    // different person than the one the miner happened to pick.
    if (countries.includes(a.chartSays)) {
      stats.multiEntity++;
      /* The genres carried over from mine:charts belong to whichever entity
       * that run happened to pick — the WRONG person. Tulus came back as Rock
       * from the Norwegian black metal band while the artist we actually mean
       * is an Indonesian singer-songwriter. Re-read them from the entity in
       * the chart's country below; until then, drop them. */
      const match = cands.find((c) => c.country === a.chartSays)!;
      resolved.push({
        ...a, country: a.chartSays, basis: 'distinct-artists-same-name',
        note: `MusicBrainz lists ${countries.length} countries for this name (${countries.join('/')}); the chart names ${a.chartSays}`,
        mbCountries: countries,
        mbid: match.id,
        genres: [],
        genresFrom: 'pending',
        sharedBy: cands.filter((c) => c.disambiguation).map((c) => `${c.country ?? '??'}: ${c.disambiguation}`),
      });
      continue;
    }

    if (countries.length > 1) stats.oneCountryOnly++;
    else stats.singleEntity++;
    stillHeld.push({ ...a, mbCountries: countries, why: countries.length
      ? `MusicBrainz has no ${a.chartSays} artist by this name (has ${countries.join('/')})`
      : 'MusicBrainz match carries no country' });
  }

  /* Re-read genres from the RIGHT entity. Everything above only established
   * which of the same-named artists we mean; their genres still have to come
   * from that artist's own MusicBrainz page. */
  const pending = resolved.filter((r) => r.genresFrom === 'pending' && r.mbid);
  let regen = 0;
  for (const r of pending) {
    try {
      const res = await mbGate(() => fetch(
        `https://musicbrainz.org/ws/2/artist/${r.mbid}?fmt=json&inc=genres+tags`,
        { headers: { 'User-Agent': UA } },
      ));
      if (!res.ok) { r.genresFrom = 'lookup-failed'; continue; }
      const e = (await res.json()) as {
        genres?: Array<{ name: string; count?: number }>;
        tags?: Array<{ name: string; count?: number }>;
      };
      const mbGenres = (e.genres || []).filter((g) => (g.count ?? 1) > 0).map((g) => g.name);
      const mbTags = (e.tags || []).filter((t) => (t.count ?? 0) > 0).map((t) => t.name);
      const scored = bucketsScored(
        [...mbGenres.map((label) => ({ label, weight: 2 })), ...mbTags.map((label) => ({ label, weight: 1 }))],
        { minScore: 2, max: 3 },
      );
      r.genres = scored.map((g) => g.genre);
      r.mbGenres = mbGenres;
      r.mbTags = mbTags;
      r.genresFrom = 'correct-entity';
    } catch { r.genresFrom = 'lookup-failed'; }
    if (++regen % 25 === 0) console.log(`  re-read genres ${regen}/${pending.length}…`);
  }
  console.log(`re-read genres for ${regen} artists from the correct MusicBrainz entity`);

  writeFileSync(OUT, JSON.stringify({
    generatedAt: new Date().toISOString(),
    note: 'Re-examination of mine:charts quarantine. Resolved = one stage name, several real artists; the chart identifies which one we mean. Genres for those were re-read from the entity in the chart country, not the one the first pass picked.',
    caveat: 'Deezer ids on these rows came from a NAME search in the first pass, so for a shared name they may point at the other artist. Spot-check playback before relying on them.',
    stats: { examined: held.length, resolved: resolved.length, stillHeld: stillHeld.length, ...stats },
    resolved, stillHeld,
  }, null, 2));

  console.log(`\n=== ${path.relative(ROOT, OUT)} ===`);
  console.log(`examined ${held.length}`);
  console.log(`  RESOLVED ${resolved.length}`);
  console.log(`    same name, several real artists : ${stats.multiEntity}`);
  console.log(`    corrected by hand               : ${stats.manual}`);
  console.log(`  still held ${stillHeld.length}`);
  console.log(`    MusicBrainz has no artist of that name in the chart's country: ${stats.singleEntity + stats.oneCountryOnly}`);
  console.log(`    no exact MusicBrainz match at all: ${stats.noCandidates}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
