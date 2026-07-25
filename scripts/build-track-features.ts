/**
 * Build the audio-feature index used to sequence playlists.
 *
 *   npm run features
 *
 * Merges every Kaggle set that carries Spotify audio features into one lookup
 * keyed by normalized artist → normalized title → a compact numeric tuple.
 *
 * SCOPED ON PURPOSE. The union of the source files is ~1.14M tracks, which is
 * far too much to hand a browser. Only artists this app can actually play are
 * kept: the Circle's curated seeds, the World's per-nation seeds, every artist
 * plotted on the globe, and anyone the chart miner has proposed. Everything
 * else is dropped at build time.
 *
 * Note on provenance: `tracks_features.csv` and `universal_top_spotify_songs`
 * carry per-TRACK measurements, which is why they are trusted here even though
 * the same drop's `playlist_genre` column was rejected for genre — that column
 * describes a playlist, these columns describe the recording.
 *
 * Output `lib/track-features.json`:
 *   { "<artist>": { "<title>": [tempo, energy, valence, key, mode] } }
 * Unknowns are -1. Tempo is rounded to whole BPM and the 0..1 values to two
 * places — three decimals of energy do not change a running order. Only the
 * fields the sequencer reads are stored; danceability and acousticness were
 * measured, found unused, and dropped, which took the file down by a third.
 */

import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { eachRow } from './csv-stream';
import { normName } from '../lib/genre-rules';

const ROOT = path.join(__dirname, '..');
const KD = path.join(ROOT, 'kaggle_datasets');
const OUT = path.join(ROOT, 'lib', 'track-features.json');

/** Mirror of normTitle in lib/deezer.ts — singles and album cuts collapse. */
function normTitle(s: string): string {
  return normName(
    String(s || '')
      .replace(/\s*[([][^)\]]*[)\]]/g, '')
      .replace(/\s*-\s*(remaster(ed)?( \d{4})?|radio edit|single version|album version|live|edit)\b.*$/i, ''),
  );
}

const num = (v: string | undefined, fallback = -1): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};
const r2 = (n: number) => (n < 0 ? -1 : Math.round(n * 100) / 100);

/** [tempo, energy, valence, key, mode] */
type Tuple = [number, number, number, number, number];

function main() {
  /* ---------- which artists matter ---------- */
  const wanted = new Set<string>();
  const seeds = JSON.parse(readFileSync(path.join(ROOT, 'lib', 'seeds.json'), 'utf8')) as
    { artists: Record<string, Record<string, string[]>> };
  for (const byGenre of Object.values(seeds.artists))
    for (const list of Object.values(byGenre)) for (const a of list) wanted.add(normName(a));

  const world = JSON.parse(readFileSync(path.join(ROOT, 'lib', 'world-seeds.json'), 'utf8')) as
    Record<string, { top?: string[]; genres?: Record<string, string[]> }>;
  for (const c of Object.values(world)) {
    for (const a of c.top || []) wanted.add(normName(a));
    for (const list of Object.values(c.genres || {})) for (const a of list) wanted.add(normName(a));
  }

  const songsDir = path.join(ROOT, 'public', 'world-songs');
  if (existsSync(songsDir)) {
    for (const f of readdirSync(songsDir)) {
      if (!f.endsWith('.json')) continue;
      const j = JSON.parse(readFileSync(path.join(songsDir, f), 'utf8')) as Record<string, unknown>;
      for (const v of Object.values(j)) {
        if (!Array.isArray(v)) continue;
        for (const s of v as Array<{ a?: string }>) if (s.a) wanted.add(normName(s.a));
      }
    }
  }

  const proposals = path.join(ROOT, 'chart-proposals.json');
  if (existsSync(proposals)) {
    const p = JSON.parse(readFileSync(proposals, 'utf8')) as { artists?: Array<{ name: string }> };
    for (const a of p.artists || []) wanted.add(normName(a.name));
  }
  console.log(`artists in scope: ${wanted.size.toLocaleString()}`);

  /* ---------- merge the feature-bearing sources ---------- */
  const index: Record<string, Record<string, Tuple>> = {};
  let kept = 0, seen = 0;
  const put = (artist: string, title: string, t: Tuple) => {
    seen++;
    const a = normName(artist);
    if (!a || !wanted.has(a)) return;
    const ti = normTitle(title);
    if (!ti) return;
    const bucket = index[a] ??= {};
    if (bucket[ti]) return;                       // first source wins
    bucket[ti] = t;
    kept++;
  };

  return (async () => {
    /* 1.2M tracks, richest single source */
    const tf = path.join(KD, 'tracks_features.csv');
    if (existsSync(tf)) {
      await eachRow(tf, (r) => {
        const m = (r.artists || '').match(/'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)"/g) || [];
        if (!m[0]) return;
        put(m[0].slice(1, -1).replace(/\\'/g, "'"), r.name, [
          Math.round(num(r.tempo)), r2(num(r.energy)), r2(num(r.valence)),
          num(r.key), num(r.mode),
        ]);
      });
      console.log(`  tracks_features.csv → ${kept.toLocaleString()} kept`);
    }

    /* per-country charts — same feature columns, different long tail */
    const ut = path.join(KD, 'universal_top_spotify_songs.csv');
    if (existsSync(ut)) {
      await eachRow(ut, (r) => {
        put((r.artists || '').split(',')[0], r.name, [
          Math.round(num(r.tempo)), r2(num(r.energy)), r2(num(r.valence)),
          num(r.key), num(r.mode),
        ]);
      });
      console.log(`  universal_top → ${kept.toLocaleString()} cumulative`);
    }

    for (const rel of [
      'archive (1)/spotify_songs.csv',
      'archive (6)/high_popularity_spotify_data.csv',
      'archive (6)/low_popularity_spotify_data.csv',
    ]) {
      const f = path.join(KD, rel);
      if (!existsSync(f)) continue;
      await eachRow(f, (r) => {
        put((r.track_artist || '').split(',')[0], r.track_name, [
          Math.round(num(r.tempo)), r2(num(r.energy)), r2(num(r.valence)),
          num(r.key), num(r.mode),
        ]);
      });
    }
    console.log(`  labeled sets → ${kept.toLocaleString()} cumulative`);

    writeFileSync(OUT, JSON.stringify(index));
    const bytes = statSync(OUT).size;
    console.log(`\nscanned ${seen.toLocaleString()} source rows`);
    console.log(`wrote ${path.relative(ROOT, OUT)}: ${Object.keys(index).length.toLocaleString()} artists, ${kept.toLocaleString()} tracks, ${(bytes / 1024 / 1024).toFixed(1)} MB`);
  })();
}

main();
