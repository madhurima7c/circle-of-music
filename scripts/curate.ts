#!/usr/bin/env tsx
/**
 * Build-time curation: fills `lib/seeds.json` with LLM-suggested artists for
 * every (country × genre) pairing that doesn't already have curated artists.
 *
 * Run with:
 *   npm run curate           — fill missing pairings only
 *   npm run curate -- --all  — regenerate every pairing (overwrites existing)
 *   npm run curate -- --test — process only the first 5 missing pairings,
 *                              then write a `seeds.preview.json` next to seeds
 *                              for review (does not touch seeds.json)
 *
 * Reads ANTHROPIC_API_KEY from the environment. Stick it in `.env.local` —
 * `.env*` is git-ignored by Next.js so the key never goes into version control.
 */

import 'dotenv/config';                            // load .env.local
import Anthropic from '@anthropic-ai/sdk';
import fs from 'node:fs/promises';
import path from 'node:path';

/* ---------- config ---------- */
const MODEL          = 'claude-haiku-4-5';
const ARTISTS_PER_PAIRING_MIN = 4;
const ARTISTS_PER_PAIRING_MAX = 8;
const MAX_TOKENS     = 400;
const SEEDS_PATH     = path.resolve(process.cwd(), 'lib/seeds.json');
const PREVIEW_PATH   = path.resolve(process.cwd(), 'lib/seeds.preview.json');
const RATE_LIMIT_MS  = 250;   // gentle pacing between requests
const RETRY_MAX      = 3;

/* ---------- types matching lib/seeds.json shape ---------- */
type Seeds = {
  countries: string[];
  genres:    string[];
  artists:   Record<string, Record<string, string[]>>;
};

/* ---------- prompt ----------
 * The system prompt is intentionally meaty (~1300 tokens) for two reasons:
 *   1. Prompt caching has a minimum prefix size — a short prompt won't cache
 *      and we'd pay full input rates per request.
 *   2. The detailed instructions + few-shot examples are what guard against
 *      the LLM's strongest failure mode for this task: confidently inventing
 *      plausible-sounding artists who don't actually exist on streaming
 *      services. The examples model both shapes — a real list, and "NONE".
 */
const SYSTEM_PROMPT = `You are a music-research assistant curating a country × genre playlist app.

Your job is to name real, currently-recorded artists from a specific country whose work fits a specific genre, so the app can look them up on Deezer (a streaming service) and play their music.

# Output format

Reply with ONLY a JSON array of artist names (no commentary, no markdown), like:
["Artist Name One", "Artist Name Two", "Artist Name Three"]

If you cannot confidently name at least ${ARTISTS_PER_PAIRING_MIN} artists who fit the pairing, reply with EXACTLY the word:
NONE

No other format is acceptable. No prose, no explanations, no preamble.

# What "fits the pairing" means

An artist fits "{country} × {genre}" if:
- The artist is from {country}, OR is closely associated with {country}'s music scene (e.g. a diaspora artist whose work is centered on {country}'s musical traditions).
- The artist's body of work is primarily in {genre}, OR they have substantial output in {genre} (one-off genre experiments don't count).

Both conditions must hold. Don't substitute a country for a region (Nigeria ≠ Ghana) or a genre for a parent category (Trap is not the same as Hip Hop, but a trap artist might be acceptable in a Hip Hop pairing if they're well-known broadly as a hip hop artist).

# Quality rules (very important)

1. **Real artists only.** Every name must be a real, recorded musician you are confident about. If you're unsure whether an artist exists, omit them. It's better to return fewer names — or "NONE" — than to invent.

2. **Modern names where possible.** Prefer artists active in the streaming era (2000s onward) since Deezer's catalog skews modern. Including a few historical/foundational artists is fine if they shaped the country's relationship with the genre (e.g. Fela Kuti for Nigeria × Afrobeat).

3. **Diverse selections.** Don't return five artists who all sound identical. Mix established with emerging where possible.

4. **No fictional or AI artists.** No "discovered through obscure forum" deep cuts unless they're genuinely on streaming services. When in doubt, lean on artists with international press coverage.

5. **Diaspora is okay.** A Ghanaian artist living in the UK who makes Ghanaian music counts as Ghana × Afrobeats. But a British artist who occasionally references African instruments does NOT count as Ghana × anything.

6. **Cross-pollination boundaries.** If "{country} × {genre}" is genuinely a marginal or non-existent musical category — e.g. Norway × Cumbia, or Iceland × Soca — reply NONE. Better to surface this honestly than to manufacture results.

7. **Aim for ${ARTISTS_PER_PAIRING_MIN}–${ARTISTS_PER_PAIRING_MAX} names.** Fewer is fine. Don't pad.

# Examples

User:
Country: Ghana
Genre: Afrobeats

You:
["Sarkodie", "Stonebwoy", "Amaarae", "Kwesi Arthur", "King Promise", "Black Sherif"]

User:
Country: Brazil
Genre: Bossa Nova

You:
["Joao Gilberto", "Antonio Carlos Jobim", "Astrud Gilberto", "Caetano Veloso", "Marcos Valle"]

User:
Country: Norway
Genre: Cumbia

You:
NONE

User:
Country: India
Genre: Classical

You:
["Ravi Shankar", "Zakir Hussain", "Ali Akbar Khan", "Hariprasad Chaurasia", "T M Krishna", "Bombay Jayashri"]
`;

const userMessage = (country: string, genre: string) =>
  `Country: ${country}\nGenre: ${genre}`;

/* ---------- LLM call (one pairing) ---------- */

async function curatePairing(
  client: Anthropic,
  country: string,
  genre: string,
  attempt = 0,
): Promise<string[] | null> {
  try {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system: [
        {
          type: 'text',
          text: SYSTEM_PROMPT,
          // Cache the system prefix so each subsequent call only pays the
          // cache-read rate (≈10% of normal input) for these tokens.
          cache_control: { type: 'ephemeral' },
        },
      ],
      messages: [
        { role: 'user', content: userMessage(country, genre) },
      ],
    });

    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('')
      .trim();

    // Sentinel — model says no plausible match
    if (text === 'NONE' || text.startsWith('NONE')) return null;

    // Parse a JSON array. Some models occasionally wrap in markdown fences;
    // strip those defensively before parsing.
    const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
    const parsed = JSON.parse(cleaned);
    if (!Array.isArray(parsed)) throw new Error('not an array');
    const names = parsed
      .filter((x): x is string => typeof x === 'string' && x.trim().length > 0)
      .map((s) => s.trim());
    return names.length >= ARTISTS_PER_PAIRING_MIN ? names : null;
  } catch (err) {
    if (attempt < RETRY_MAX) {
      // Exponential backoff for rate limits / transient failures.
      const wait = 500 * 2 ** attempt;
      await sleep(wait);
      return curatePairing(client, country, genre, attempt + 1);
    }
    console.error(`  [error] ${country} × ${genre}:`, (err as Error).message);
    return null;
  }
}

/* ---------- main loop ---------- */

async function main() {
  const args   = new Set(process.argv.slice(2));
  const isAll  = args.has('--all');
  const isTest = args.has('--test');

  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('Missing ANTHROPIC_API_KEY. Add it to .env.local and try again.');
    process.exit(1);
  }

  const client = new Anthropic();
  const seedsRaw = await fs.readFile(SEEDS_PATH, 'utf8');
  const seeds: Seeds = JSON.parse(seedsRaw);

  /* Build the work list — every pairing not yet covered, or all of them
   * if --all was passed. Skip 'World' as a genre against itself etc. */
  const work: Array<{ country: string; genre: string }> = [];
  for (const country of seeds.countries) {
    const bucket = seeds.artists[country] ?? {};
    for (const genre of seeds.genres) {
      const existing = bucket[genre];
      const has = Array.isArray(existing) && existing.length >= ARTISTS_PER_PAIRING_MIN;
      if (isAll || !has) work.push({ country, genre });
    }
  }

  const targets = isTest ? work.slice(0, 5) : work;
  const totalPairings = seeds.countries.length * seeds.genres.length;
  console.log(
    `Plan: ${targets.length} pairings to curate ` +
    `(${isTest ? 'test mode — 5' : isAll ? 'all' : 'missing only'}, ` +
    `${totalPairings} total).\n`,
  );

  let filled  = 0;
  let blanks  = 0;
  let failed  = 0;
  const updated: Seeds = JSON.parse(JSON.stringify(seeds));    // deep clone

  for (let i = 0; i < targets.length; i++) {
    const { country, genre } = targets[i];
    process.stdout.write(`[${i + 1}/${targets.length}] ${country} × ${genre} … `);

    const names = await curatePairing(client, country, genre);

    if (names && names.length) {
      // Cap names to MAX so we don't over-fill.
      const capped = names.slice(0, ARTISTS_PER_PAIRING_MAX);
      if (!updated.artists[country]) updated.artists[country] = {};
      updated.artists[country][genre] = capped;
      filled++;
      console.log(`${capped.length} artist${capped.length === 1 ? '' : 's'}: ${capped.join(', ')}`);
    } else if (names === null) {
      blanks++;
      console.log('NONE');
    } else {
      failed++;
      console.log('(error)');
    }

    /* Incremental save every 10 pairings so a crash doesn't lose work. */
    if (!isTest && (i + 1) % 10 === 0) {
      await fs.writeFile(SEEDS_PATH, JSON.stringify(updated, null, 2) + '\n');
    }

    // Polite pacing.
    await sleep(RATE_LIMIT_MS);
  }

  /* Final write. In test mode, write to seeds.preview.json so the user can
   * eyeball it before committing the real seeds.json. */
  const outPath = isTest ? PREVIEW_PATH : SEEDS_PATH;
  await fs.writeFile(outPath, JSON.stringify(updated, null, 2) + '\n');

  console.log(`\nDone.`);
  console.log(`  Filled : ${filled}`);
  console.log(`  NONE   : ${blanks}  (no plausible pairing — model declined)`);
  console.log(`  Failed : ${failed}  (parse / API errors)`);
  console.log(`  Wrote  : ${path.relative(process.cwd(), outPath)}`);

  if (isTest) {
    console.log(`\nTest mode — original seeds.json was NOT modified.`);
    console.log(`Inspect lib/seeds.preview.json, then run \`npm run curate\` for the full job.`);
  }
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

main().catch((e) => {
  console.error('Fatal:', e);
  process.exit(1);
});
