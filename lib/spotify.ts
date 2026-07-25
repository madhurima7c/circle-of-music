/**
 * Spotify connection — full-song playback for Premium users.
 *
 * Entirely opt-in and env-gated: without NEXT_PUBLIC_SPOTIFY_CLIENT_ID the
 * app never mentions Spotify login and keeps playing 30s Deezer previews.
 *
 * Setup (one-time, free):
 *   1. https://developer.spotify.com/dashboard → Create app
 *   2. Add redirect URIs (Spotify no longer accepts http://localhost for
 *      new apps — use the 127.0.0.1 loopback locally). NOTE: the live
 *      "Connect" flow below no longer uses an OAuth redirect at all — it
 *      opens a plain Spotify login popup — so these only matter if the
 *      legacy PKCE path is ever re-enabled:
 *        http://127.0.0.1:3000/spotify-callback
 *        https://discovermusic.xyz/spotify-callback
 *   3. .env.local → NEXT_PUBLIC_SPOTIFY_CLIENT_ID=<client id>
 *
 * Flow: Authorization Code + PKCE (no server, no secret). "Connect" opens
 * Spotify's login in a POPUP (full-page redirect fallback if blocked);
 * the popup lands on /spotify-callback which exchanges the code and
 * closes itself — the main app keeps playing throughout. Tokens live in
 * localStorage → Web Playback SDK ("Music Exploration" device) → search
 * the current artist+title → play the full track. GlobalPlayer owns the
 * wiring; this module owns auth, search, and the SDK device.
 */

const CLIENT_ID = process.env.NEXT_PUBLIC_SPOTIFY_CLIENT_ID;

/* The EMBED path (lib/spotify-embed.ts) needs no client id in the browser,
 * so the Connect entry is always available. */
export const spotifyEnabled = true;

/* NOTE: the OAuth/PKCE + Web Playback SDK kit below (scopes, verifier,
 * /spotify-callback exchange, ensurePlayer…) is LEGACY — superseded by the
 * embed path, kept because it's tested and useful if a Premium-quality SDK
 * mode ever returns. Nothing initiates OAuth anymore. */
const SCOPES = 'streaming user-read-email user-read-private user-modify-playback-state user-read-playback-state';
const LS = {
  verifier: 'spotify_pkce_verifier',
  access: 'spotify_access_token',
  refresh: 'spotify_refresh_token',
  expires: 'spotify_token_expires', // epoch ms
  embedMode: 'spotify_embed_mode',  // '1' = route playback through the embed
};

/* ---------- tiny connected-state store (for React via useSyncExternalStore) ---------- */
const listeners = new Set<() => void>();
function emit() { listeners.forEach((l) => l()); }
export function subscribeSpotify(l: () => void): () => void {
  listeners.add(l);
  // Another tab can flip the mode — the storage event is how we find out.
  const onStorage = (e: StorageEvent) => {
    if (e.key === LS.embedMode || e.key === LS.refresh) l();
  };
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(l);
    window.removeEventListener('storage', onStorage);
  };
}
export function isSpotifyConnected(): boolean {
  if (typeof window === 'undefined') return false;
  return !!window.localStorage.getItem(LS.embedMode);
}

/* ---------- PKCE ---------- */
function randomString(len: number): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const bytes = crypto.getRandomValues(new Uint8Array(len));
  return Array.from(bytes, (b) => chars[b % chars.length]).join('');
}

async function challenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** One fixed callback path — the only redirect URI Spotify needs to know. */
function redirectUri(): string {
  return window.location.origin + '/spotify-callback';
}

/**
 * Connect = turn on EMBED full-song mode + make sure the user is logged
 * in to Spotify IN THIS BROWSER. The embed piggybacks on the browser's
 * open.spotify.com session — ANY Spotify account, no OAuth consent, no
 * Development-Mode allowlist — so "connecting" is just a plain Spotify
 * login in a popup. Playback routing lives in GlobalPlayer, which drives
 * the hidden embed (lib/spotify-embed.ts) from the app's own controls.
 */
export async function connectSpotify(): Promise<void> {
  window.localStorage.setItem(LS.embedMode, '1');
  emit();
  const url =
    'https://accounts.spotify.com/login?continue=' +
    encodeURIComponent('https://open.spotify.com/');
  const w = 500, h = 780;
  const left = Math.max(0, (window.screen.width - w) / 2);
  const top = Math.max(0, (window.screen.height - h) / 2);
  // If the popup is blocked, the mode is still on — the embed simply plays
  // Spotify previews until the user logs in to Spotify some other time.
  window.open(url, 'spotify-login', `width=${w},height=${h},left=${left},top=${top},popup=yes`);
  // Tell GlobalPlayer to rebuild the embed iframe: only a FRESH iframe
  // document picks up the login/cookie access the popup just granted —
  // an already-created one stays logged-out (and capped at 30s clips).
  window.dispatchEvent(new Event('spotify:connect-click'));
}

export function disconnectSpotify(): void {
  Object.values(LS).forEach((k) => window.localStorage.removeItem(k));
  player?.disconnect();
  player = null;
  deviceId = null;
  emit();
}

/**
 * artist+title → spotify track uri for the embed. Server route first
 * (client-credentials — works for every visitor once SPOTIFY_CLIENT_SECRET
 * is configured); falls back to a legacy user token if one exists.
 */
/* Spotify rate-limits SEARCH per app (429 + Retry-After, sometimes HOURS).
 * Remember the window in localStorage so reloads don't retry into it —
 * every call made during the window can extend the penalty for everyone. */
const RL_KEY = 'spotify_rl_until';

export function isSpotifyRateLimited(): boolean {
  try { return Date.now() < Number(window.localStorage.getItem(RL_KEY) ?? 0); }
  catch { return false; }
}

function noteRateLimited(retryAfterSeconds: number): void {
  const capped = Math.min(Math.max(retryAfterSeconds, 60), 86400);
  try { window.localStorage.setItem(RL_KEY, String(Date.now() + capped * 1000)); }
  catch { /* private mode */ }
}

// Resolve results land in the shared uriCache (see "search" below): one
// lookup per song per session, and the prefetch below makes the NEXT
// track's resolve instant at track change.
export async function resolveSpotifyUri(artist: string, title: string): Promise<string | null> {
  if (process.env.NODE_ENV !== 'production') {
    // Dev hook: force a known uri to exercise the embed without the secret.
    const forced = (window as unknown as { __spotifyUriOverride?: string }).__spotifyUriOverride;
    if (forced) return forced;
  }
  const key = `${artist}|${title}`.toLowerCase();
  const hit = uriCache.get(key);
  if (hit !== undefined) return hit;
  if (isSpotifyRateLimited()) return null;   // don't dig the hole deeper
  try {
    const res = await fetch(
      `/api/spotify-search?artist=${encodeURIComponent(artist)}&title=${encodeURIComponent(title)}`,
    );
    if (res.ok) {
      const uri = ((await res.json()) as { uri?: string }).uri ?? null;
      uriCache.set(key, uri);
      return uri;
    }
    if (res.status === 404) { uriCache.set(key, null); return null; } // definite no-match
    if (res.status === 429) {
      noteRateLimited(Number(res.headers.get('Retry-After') ?? 300) || 300);
      return null;
    }
    if (res.status === 503) return await findTrackUri(artist, title);
  } catch { /* offline etc. — don't cache transient failures */ }
  return null;
}

/** Warm the cache for an upcoming track (fire-and-forget). */
export function prefetchSpotifyUri(artist: string, title: string): void {
  resolveSpotifyUri(artist, title).catch(() => {});
}

function storeTokens(data: { access_token?: string; refresh_token?: string; expires_in?: number }): void {
  if (data.access_token) window.localStorage.setItem(LS.access, data.access_token);
  if (data.refresh_token) window.localStorage.setItem(LS.refresh, data.refresh_token);
  if (data.expires_in) {
    window.localStorage.setItem(LS.expires, String(Date.now() + (data.expires_in - 60) * 1000));
  }
  emit();
}

/**
 * Exchange an auth code for tokens (PKCE — the verifier is in localStorage,
 * which the popup shares with the main window, same origin). Used by the
 * /spotify-callback page. Returns true when tokens were stored.
 */
export async function exchangeSpotifyCode(code: string): Promise<boolean> {
  if (!CLIENT_ID || typeof window === 'undefined') return false;
  const verifier = window.localStorage.getItem(LS.verifier);
  if (!verifier) return false;
  window.localStorage.removeItem(LS.verifier);
  try {
    const res = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri(),
        client_id: CLIENT_ID,
        code_verifier: verifier,
      }),
    });
    if (!res.ok) return false;
    storeTokens(await res.json());
    return true;
  } catch {
    return false; /* stay disconnected */
  }
}

/** Handle ?code=… after an auth redirect. Call once on mount; no-op otherwise. */
export async function handleSpotifyCallback(): Promise<void> {
  if (!CLIENT_ID || typeof window === 'undefined') return;
  const code = new URLSearchParams(window.location.search).get('code');
  if (!code || !window.localStorage.getItem(LS.verifier)) return;
  // Strip the code from the URL before any await so a re-render can't reuse it.
  const clean = window.location.pathname + window.location.hash;
  window.history.replaceState(null, '', clean);
  await exchangeSpotifyCode(code);
}

async function accessToken(): Promise<string | null> {
  if (!CLIENT_ID || typeof window === 'undefined') return null;
  const refresh = window.localStorage.getItem(LS.refresh);
  if (!refresh) return null;
  const expires = Number(window.localStorage.getItem(LS.expires) || 0);
  const current = window.localStorage.getItem(LS.access);
  if (current && Date.now() < expires) return current;
  try {
    const res = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refresh,
        client_id: CLIENT_ID,
      }),
    });
    if (!res.ok) { disconnectSpotify(); return null; }
    const data = await res.json();
    storeTokens(data);
    return data.access_token ?? null;
  } catch {
    return null;
  }
}

async function api(path: string, init?: RequestInit): Promise<Response | null> {
  const token = await accessToken();
  if (!token) return null;
  return fetch(`https://api.spotify.com/v1${path}`, {
    ...init,
    headers: { ...(init?.headers ?? {}), Authorization: `Bearer ${token}` },
  });
}

/* ---------- search ---------- */
const uriCache = new Map<string, string | null>();

export async function findTrackUri(artist: string, title: string): Promise<string | null> {
  const key = `${artist}|${title}`.toLowerCase();
  if (uriCache.has(key)) return uriCache.get(key)!;
  const q = encodeURIComponent(`track:${title} artist:${artist}`);
  const res = await api(`/search?q=${q}&type=track&limit=1`);
  const uri: string | null = res?.ok
    ? ((await res.json())?.tracks?.items?.[0]?.uri ?? null)
    : null;
  uriCache.set(key, uri);
  return uri;
}

/* ---------- Web Playback SDK ---------- */
type SdkPlayer = {
  connect: () => Promise<boolean>;
  disconnect: () => void;
  addListener: (event: string, cb: (data: never) => void) => void;
  pause: () => Promise<void>;
  resume: () => Promise<void>;
  setVolume: (v: number) => Promise<void>;
};

declare global {
  interface Window {
    onSpotifyWebPlaybackSDKReady?: () => void;
    Spotify?: {
      Player: new (opts: {
        name: string;
        getOAuthToken: (cb: (token: string) => void) => void;
        volume?: number;
      }) => SdkPlayer;
    };
  }
}

let player: SdkPlayer | null = null;
let deviceId: string | null = null;
let sdkLoading: Promise<void> | null = null;

function loadSdk(): Promise<void> {
  if (window.Spotify) return Promise.resolve();
  if (sdkLoading) return sdkLoading;
  sdkLoading = new Promise<void>((resolve) => {
    window.onSpotifyWebPlaybackSDKReady = () => resolve();
    const s = document.createElement('script');
    s.src = 'https://sdk.scdn.co/spotify-player.js';
    s.async = true;
    document.body.appendChild(s);
  });
  return sdkLoading;
}

export type PlayerState = { paused: boolean; position: number; duration: number };

/** Boot the SDK device. Resolves with the device id (null on failure). */
export async function ensurePlayer(
  onState: (s: PlayerState | null) => void,
): Promise<string | null> {
  if (!isSpotifyConnected()) return null;
  if (deviceId) return deviceId;
  await loadSdk();
  if (!window.Spotify) return null;
  return new Promise((resolve) => {
    player = new window.Spotify!.Player({
      name: 'Music Exploration',
      getOAuthToken: (cb) => { accessToken().then((t) => t && cb(t)); },
      volume: 0.7,
    });
    player.addListener('ready', (d: never) => {
      deviceId = (d as { device_id?: string }).device_id ?? null;
      resolve(deviceId);
    });
    player.addListener('initialization_error', () => resolve(null));
    player.addListener('authentication_error', () => resolve(null));
    // account_error fires for non-Premium accounts — SDK playback unavailable.
    player.addListener('account_error', () => resolve(null));
    player.addListener('player_state_changed', (s: never) => {
      const st = s as { paused?: boolean; position?: number; duration?: number } | null;
      onState(st ? {
        paused: !!st.paused,
        position: st.position ?? 0,
        duration: st.duration ?? 0,
      } : null);
    });
    player.connect();
  });
}

export async function playUri(uri: string): Promise<boolean> {
  if (!deviceId) return false;
  const res = await api(`/me/player/play?device_id=${deviceId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ uris: [uri] }),
  });
  return !!res?.ok;
}

export function sdkPause(): void { player?.pause().catch(() => {}); }
export function sdkResume(): void { player?.resume().catch(() => {}); }
export function sdkSetVolume(v: number): void { player?.setVolume(v).catch(() => {}); }
