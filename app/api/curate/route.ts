/**
 * Runtime curation fallback.
 *
 * Hit by the client when Deezer returns an empty playlist for a pairing that
 * *did* have seeded artists — meaning the seeded names didn't resolve on
 * Deezer (obscure names, or names the model hallucinated past build-time
 * filtering). This route asks Claude for fresh artist names which the client
 * then runs through the normal Deezer pipeline.
 *
 * SECURITY: This is a Route Handler, so it runs on the server. The API key
 * is read from `process.env.ANTHROPIC_API_KEY` and is NEVER exposed to the
 * browser. The browser only sees the resulting JSON list of artist names.
 *
 * COST CONTROLS:
 *   - Whitelist: only the known (country × genre) pairings are valid.
 *   - In-memory cache: same pairing within the same server process won't
 *     re-call the LLM. (Caching across restarts is the build-time script.)
 *   - Reasonable max_tokens cap.
 */

import Anthropic from '@anthropic-ai/sdk';
import { NextResponse, type NextRequest } from 'next/server';
import seeds from '@/lib/seeds.json';

/* Soft in-memory cache keyed by "country|genre". Persists for the life of
 * the server process — wiped on every `next dev` restart and on every
 * production deploy. Stays small (max 532 entries × ~8 names each). */
const cache = new Map<string, string[] | null>();

const SYSTEM_PROMPT = `You are a music-research assistant for a country × genre playlist app.

Given a country and genre, name 4 to 8 real recorded artists from that country whose work fits that genre.

# Rules
- Real artists only. If unsure an artist exists on streaming services, omit them.
- Modern artists preferred (active 2000s+) but include foundational names where appropriate.
- Diaspora artists count if their work centers on the named country's music.
- If the pairing has fewer than 4 plausible artists, return exactly: NONE

# Output
Reply with ONLY a JSON array of artist names, or the literal word NONE. No commentary, no markdown fences.

Examples:
User: Country: Ghana \\nGenre: Afrobeats
You: ["Sarkodie", "Stonebwoy", "Amaarae", "Kwesi Arthur"]

User: Country: Norway \\nGenre: Cumbia
You: NONE`;

type Body = { country?: string; genre?: string };

export async function POST(request: NextRequest) {
  // 1. Parse + validate.
  let body: Body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid body' }, { status: 400 });
  }
  const country = (body.country ?? '').trim();
  const genre   = (body.genre   ?? '').trim();
  if (!country || !genre) {
    return NextResponse.json({ error: 'country + genre required' }, { status: 400 });
  }
  // Whitelist to known wheel values — prevents anyone from poking arbitrary
  // strings through to the LLM via this endpoint.
  if (!seeds.countries.includes(country) || !seeds.genres.includes(genre)) {
    return NextResponse.json({ error: 'unknown pairing' }, { status: 400 });
  }

  // 2. Cache check.
  const key = `${country}|${genre}`;
  if (cache.has(key)) {
    return NextResponse.json({ artists: cache.get(key), source: 'cache' });
  }

  // 3. API key must be present server-side.
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: 'ANTHROPIC_API_KEY not configured on server' },
      { status: 503 },
    );
  }

  // 4. Call Claude.
  try {
    const client = new Anthropic();
    const response = await client.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 300,
      system: [
        {
          type: 'text',
          text: SYSTEM_PROMPT,
          cache_control: { type: 'ephemeral' },
        },
      ],
      messages: [
        {
          role: 'user',
          content: `Country: ${country}\nGenre: ${genre}`,
        },
      ],
    });

    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('')
      .trim();

    if (text === 'NONE' || text.startsWith('NONE')) {
      cache.set(key, null);
      return NextResponse.json({ artists: null, source: 'llm' });
    }

    // Strip optional markdown fences and parse JSON array.
    const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
    const parsed: unknown = JSON.parse(cleaned);
    if (!Array.isArray(parsed)) throw new Error('not an array');
    const artists = parsed
      .filter((x): x is string => typeof x === 'string' && x.trim().length > 0)
      .map((s: string) => s.trim());

    cache.set(key, artists);
    return NextResponse.json({ artists, source: 'llm' });
  } catch (err) {
    console.error('curate route failed:', err);
    return NextResponse.json(
      { error: 'curation failed', detail: (err as Error).message },
      { status: 500 },
    );
  }
}
