/**
 * Pairing audit — a QA tool that flags genre-mismatch RISK across all
 * country × genre pairings, WITHOUT changing any seed data. Run it, read the
 * report, then decide what seeds to add by hand.
 *
 *   npx tsx scripts/audit-pairings.ts            # static report → stdout
 *   npx tsx scripts/audit-pairings.ts --md       # write audit-report.md
 *
 * How it classifies each pairing (best → worst for genre accuracy):
 *   OVERRIDE  hand-picked Deezer track ids in track-overrides.json (exact)
 *   DIRECT    >=2 curated seed artists for this exact country×genre (trusted)
 *   THIN      exactly 1 seed artist (works, but shallow)
 *   RELATED   0 seeds → falls back to a RELATED genre's seeds for this country
 *             (music plays, but it's the neighbour genre — mismatch risk)
 *   FALLBACK  0 seeds and no related-genre seeds either → runtime leans on
 *             MusicBrainz-by-tag or the LLM; highest chance of off-genre music
 *
 * The RELATED map + thresholds mirror lib/deezer.ts so the report reflects
 * what actually happens at runtime.
 */

import seeds from '../lib/seeds.json';
import overrides from '../lib/track-overrides.json';

const RELATED_GENRES: Record<string, string[]> = {
  'Bossa Nova': ['Jazz'],
  Classical: ['Ambient'],
  Cumbia: ['World', 'Folk'],
  Disco: ['Funk', 'Soul'],
  Punk: ['Rock', 'Indie'],
  Electronic: ['House', 'Techno', 'Ambient'],
  'Hip Hop': ['Soul', 'Funk'],
  Rock: ['Indie', 'Punk'],
  Indie: ['Rock', 'Pop'],
  Jazz: ['Soul', 'Funk', 'World'],
  Soul: ['Funk', 'Hip Hop'],
  Funk: ['Soul', 'Hip Hop'],
  Pop: ['Indie', 'Soul'],
  Folk: ['World', 'Indie'],
  World: ['Folk', 'Jazz'],
  Afrobeats: ['Pop', 'Hip Hop'],
  House: ['Electronic', 'Techno'],
  Techno: ['Electronic', 'House'],
  Ambient: ['Electronic', 'Classical'],
};

type Tier = 'OVERRIDE' | 'DIRECT' | 'THIN' | 'RELATED' | 'FALLBACK';

const artists = seeds.artists as Record<string, Record<string, string[]>>;
const overrideKeys = new Set(Object.keys(overrides).filter(k => k !== '_doc'));

function seedCount(country: string, genre: string): number {
  const a = artists[country]?.[genre];
  return Array.isArray(a) ? a.length : 0;
}

function classify(country: string, genre: string): Tier {
  if (overrideKeys.has(`${country}|${genre}`)) return 'OVERRIDE';
  const n = seedCount(country, genre);
  if (n >= 2) return 'DIRECT';
  if (n === 1) return 'THIN';
  const hasRelated = (RELATED_GENRES[genre] || []).some(r => seedCount(country, r) >= 2);
  return hasRelated ? 'RELATED' : 'FALLBACK';
}

const rows: { country: string; genre: string; tier: Tier }[] = [];
for (const country of seeds.countries) {
  for (const genre of seeds.genres) {
    rows.push({ country, genre, tier: classify(country, genre) });
  }
}

const counts = rows.reduce<Record<Tier, number>>((m, r) => {
  m[r.tier] = (m[r.tier] || 0) + 1; return m;
}, {} as Record<Tier, number>);

const order: Tier[] = ['OVERRIDE', 'DIRECT', 'THIN', 'RELATED', 'FALLBACK'];
const total = rows.length;

// Country-level risk: how many genres each country must fall back on.
const byCountry = seeds.countries.map(c => {
  const rs = rows.filter(r => r.country === c);
  const risky = rs.filter(r => r.tier === 'RELATED' || r.tier === 'FALLBACK').length;
  return { country: c, risky };
}).sort((a, b) => b.risky - a.risky);

function render(): string {
  const L: string[] = [];
  L.push('# Pairing audit — genre-mismatch risk\n');
  L.push(`${seeds.countries.length} countries × ${seeds.genres.length} genres = ${total} pairings\n`);
  L.push('## Distribution\n');
  for (const t of order) L.push(`- **${t}**: ${counts[t] || 0} (${Math.round(((counts[t] || 0) / total) * 100)}%)`);
  L.push('\n## Riskiest countries (most fallback pairings)\n');
  byCountry.slice(0, 8).forEach(c => L.push(`- ${c.country}: ${c.risky} of ${seeds.genres.length} genres fall back`));
  L.push('\n## FALLBACK pairings (0 direct + 0 related seeds — fix these first)\n');
  const fb = rows.filter(r => r.tier === 'FALLBACK');
  L.push(fb.length ? fb.map(r => `- ${r.country} × ${r.genre}`).join('\n') : '- none 🎉');
  L.push('\n> No seeds were changed. Add curated artists to lib/seeds.json for the pairings above, then re-run.');
  return L.join('\n');
}

const report = render();
if (process.argv.includes('--md')) {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const fs = require('node:fs') as typeof import('node:fs');
  fs.writeFileSync('audit-report.md', report + '\n');
  console.log('Wrote audit-report.md');
} else {
  console.log(report);
}
