/**
 * Review-sheet generator — turns genre-audit.json (from `npm run
 * audit:genres`) into a CSV for the human categorization pass.
 *
 *   npm run audit:sheet                 # flagged rows only (mismatch+unknown+weak)
 *   npm run audit:sheet -- --all        # include verified rows too
 *
 * One row per flagged seed placement, ordered most-actionable first
 * (mismatch → weak → unknown), then by country. The last three columns
 * are YOURS to fill in:
 *
 *   correct_genre — the wheel genre this artist should be filed under
 *                   (leave blank to keep the current one)
 *   action        — keep | move | remove  (blank = undecided)
 *   notes         — anything (source links, "also add to X", new-artist ideas)
 *
 * The filled-in sheet is the input for the future apply pass, and doubles
 * as the intake list for expanding the song directory: add rows at the
 * bottom with action=add to propose brand-new artists for a pairing.
 *
 * Report-only chain: neither this nor the audit ever edits seeds.json.
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.join(__dirname, '..');
const AUDIT = path.join(ROOT, 'genre-audit.json');

type Row = {
  country: string;
  seedGenre: string;
  artist: string;
  status: 'verified' | 'weak' | 'mismatch' | 'unknown';
  evidence: Array<{ genre: string; score: number }>;
  mbGenres: string[];
  mbTags?: string[];
  wdGenres?: string[];
  spotifyGenres: string[];
  saysInstead: string[];
};

if (!existsSync(AUDIT)) {
  console.error('genre-audit.json not found — run `npm run audit:genres` first.');
  process.exit(1);
}
const rows = JSON.parse(readFileSync(AUDIT, 'utf8')) as Row[];
const includeAll = process.argv.includes('--all');

const ORDER: Record<Row['status'], number> = { mismatch: 0, weak: 1, unknown: 2, verified: 3 };
const picked = rows
  .filter((r) => includeAll || r.status !== 'verified')
  .sort(
    (a, b) =>
      ORDER[a.status] - ORDER[b.status] ||
      a.country.localeCompare(b.country) ||
      a.seedGenre.localeCompare(b.seedGenre) ||
      a.artist.localeCompare(b.artist),
  );

const esc = (s: string) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
const line = (cells: string[]) => cells.map(esc).join(',');

const header = [
  'status', 'country', 'filed_under', 'artist',
  'sources_say', 'mb_genres', 'mb_tags', 'wikidata_genres', 'spotify_genres', 'suggested',
  'correct_genre', 'action', 'notes',
];
const csv = [
  line(header),
  ...picked.map((r) =>
    line([
      r.status,
      r.country,
      r.seedGenre,
      r.artist,
      r.saysInstead.join('; '),
      r.mbGenres.join('; '),
      (r.mbTags ?? []).join('; '),
      (r.wdGenres ?? []).join('; '),
      r.spotifyGenres.join('; '),
      // Pre-filled suggestion: strongest evidenced bucket that isn't the
      // current filing (mismatches only — weak/unknown need human judgment).
      r.status === 'mismatch' ? (r.saysInstead[0] ?? '') : '',
      '', // correct_genre — yours
      '', // action (keep | move | remove | add) — yours
      '', // notes — yours
    ]),
  ),
].join('\n');

const out = path.join(ROOT, 'genre-review.csv');
writeFileSync(out, csv + '\n');

const counts: Record<string, number> = {};
for (const r of picked) counts[r.status] = (counts[r.status] || 0) + 1;
console.log(
  `Wrote ${out}: ${picked.length} rows ` +
    `(${Object.entries(counts).map(([k, v]) => `${v} ${k}`).join(', ')})` +
    (includeAll ? '' : ' — verified rows omitted (add --all to include)'),
);
