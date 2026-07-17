import { NextRequest, NextResponse } from 'next/server';

/**
 * Resolve artist + title → a Spotify track id for the EMBED player.
 *
 * Uses the app's client-credentials token (server-side only — needs
 * SPOTIFY_CLIENT_SECRET alongside the public client id). App-only tokens
 * can search PUBLIC catalog data for ANY visitor: the Development-Mode
 * user allowlist only gates USER authorization, not catalog search — so
 * the embed works for everyone even while the Web Playback SDK is capped.
 *
 * GET /api/spotify-search?artist=…&title=…  →  { id, uri } | 404 | 503
 */

const CLIENT_ID =
  process.env.SPOTIFY_CLIENT_ID ?? process.env.NEXT_PUBLIC_SPOTIFY_CLIENT_ID;
const CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET;

let cachedToken: { value: string; expires: number } | null = null;

async function appToken(): Promise<string | null> {
  if (!CLIENT_ID || !CLIENT_SECRET) return null;
  if (cachedToken && Date.now() < cachedToken.expires) return cachedToken.value;
  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64')}`,
    },
    body: 'grant_type=client_credentials',
    cache: 'no-store',
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { access_token?: string; expires_in?: number };
  if (!data.access_token) return null;
  cachedToken = {
    value: data.access_token,
    expires: Date.now() + ((data.expires_in ?? 3600) - 60) * 1000,
  };
  return cachedToken.value;
}

// artist|title → id ("" = searched, no match) — saves repeat lookups.
const matchCache = new Map<string, string>();

// While Spotify has us in a 429 window, do NOT call it again (more calls
// can extend the penalty). Answer 429 + Retry-After from memory instead.
let limitedUntil = 0;

export async function GET(req: NextRequest) {
  const artist = req.nextUrl.searchParams.get('artist')?.trim() ?? '';
  const title = req.nextUrl.searchParams.get('title')?.trim() ?? '';
  if (!artist || !title) {
    return NextResponse.json({ error: 'artist and title required' }, { status: 400 });
  }

  const key = `${artist}|${title}`.toLowerCase();
  const hit = matchCache.get(key);
  if (hit !== undefined) {
    return hit
      ? NextResponse.json({ id: hit, uri: `spotify:track:${hit}` })
      : NextResponse.json({ error: 'no match' }, { status: 404 });
  }

  if (Date.now() < limitedUntil) {
    const retry = Math.ceil((limitedUntil - Date.now()) / 1000);
    return NextResponse.json(
      { error: 'rate limited' },
      { status: 429, headers: { 'Retry-After': String(retry) } },
    );
  }

  const token = await appToken();
  if (!token) {
    // Not configured (no client secret) — the client falls back gracefully.
    return NextResponse.json({ error: 'spotify search not configured' }, { status: 503 });
  }

  const q = encodeURIComponent(`track:${title} artist:${artist}`);
  const res = await fetch(
    `https://api.spotify.com/v1/search?q=${q}&type=track&limit=1`,
    { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' },
  );
  if (res.status === 429) {
    // Cap the remembered window at 24h so a weird header can't wedge us.
    const retry = Math.min(Number(res.headers.get('Retry-After') ?? 300) || 300, 86400);
    limitedUntil = Date.now() + retry * 1000;
    return NextResponse.json(
      { error: 'rate limited' },
      { status: 429, headers: { 'Retry-After': String(retry) } },
    );
  }
  if (!res.ok) {
    return NextResponse.json({ error: 'spotify search failed' }, { status: 502 });
  }
  const data = (await res.json()) as { tracks?: { items?: Array<{ id: string }> } };
  const id = data.tracks?.items?.[0]?.id ?? '';
  matchCache.set(key, id);
  return id
    ? NextResponse.json({ id, uri: `spotify:track:${id}` })
    : NextResponse.json({ error: 'no match' }, { status: 404 });
}
