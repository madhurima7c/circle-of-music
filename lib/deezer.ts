/**
 * Deezer JSONP client — no CORS, no API key required.
 *
 * Ported from Maddy's `src/deezer.js`. The Deezer public API supports JSONP,
 * so we can call it from the browser without a backend or auth flow.
 *
 * Flow:
 *   1. `buildPlaylist({country, genre, seeds})` looks up curated seed artists
 *      for the (country × genre) pairing from `seeds.json`.
 *   2. For each seed artist, we resolve their Deezer artist id and pull their
 *      official top tracks (preview-only).
 *   3. Tracks are round-robin merged across artists, then enriched with full
 *      album metadata (cover_xl, release_date, etc.).
 *
 * Important: Deezer's anonymous JSONP endpoints only expose ~30s preview
 * MP3 URLs — not full streams. That's `track.preview`.
 */

import type seedsModule from './seeds.json';
import { jsonp } from './jsonp';
import { fetchOverrideTracks } from './track-overrides';

export type Seeds = typeof seedsModule;

export type DeezerArtist = {
  id: number;
  name: string;
  picture?: string;
  picture_small?: string;
  picture_medium?: string;
  picture_big?: string;
  picture_xl?: string;
  nb_album?: number;
  nb_fan?: number;
};

export type DeezerAlbum = {
  id?: number;
  title?: string;
  cover?: string;
  cover_small?: string;
  cover_medium?: string;
  cover_big?: string;
  cover_xl?: string;
  /** Deezer's album-level genre tag — what powers the genre filter. */
  genre_id?: number;
  release_date?: string;
};

export type DeezerTrack = {
  id: number;
  title: string;
  preview: string;          // ~30s MP3 URL
  release_date?: string;
  duration?: number;        // full-track seconds
  artist: DeezerArtist;
  album: DeezerAlbum;
};

/* JSONP helper lives in `./jsonp` so it can be shared with track-overrides
 * without a circular import. Re-exported here for backwards compatibility. */
export { jsonp };

const API = 'https://api.deezer.com';

/** Wheel genres that share territory with the primary pick — fallback seed lookup. */
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

function withPreview(tracks: DeezerTrack[] | null | undefined): DeezerTrack[] {
  return (tracks || []).filter((t) => t && t.preview);
}

// Keep in sync with lib/stories.ts normKey (Unicode-aware + fold table).
const NORM_FOLD: Record<string, string> = {
  'ı': 'i', 'ø': 'o', 'ł': 'l', 'đ': 'd', 'ß': 'ss',
  'æ': 'ae', 'œ': 'oe', 'ð': 'd', 'þ': 'th',
};
function normName(s: string): string {
  return String(s || '')
    .toLowerCase()
    .replace(/[ıøłđßæœðþ]/g, (c) => NORM_FOLD[c] ?? c)
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

/** Title normalized for duplicate detection: parentheticals and remaster/
 *  edit suffixes stripped, so the single and the album cut of one song —
 *  which have DIFFERENT Deezer track ids — collapse to one key. */
function normTitle(s: string): string {
  return normName(
    String(s || '')
      .replace(/\s*[([][^)\]]*[)\]]/g, '')
      .replace(/\s*-\s*(remaster(ed)?( \d{4})?|radio edit|single version|album version|live|edit)\b.*$/i, ''),
  );
}

/** Artist + normalized title — the identity of a SONG (not a release). */
function trackKey(t: DeezerTrack): string {
  return `${normName(t.artist?.name ?? '')}|${normTitle(t.title)}`;
}

/* ---------- artist resolution ---------- */

export async function searchArtists(name: string, limit = 12): Promise<DeezerArtist[]> {
  const q = encodeURIComponent(name.trim());
  const data = await jsonp<{ data?: DeezerArtist[] }>(`${API}/search/artist?q=${q}&limit=${limit}`);
  return data?.data || [];
}

/** Prefer exact normalized name, then containment, else first hit. */
export function pickBestArtistMatch(seedName: string, candidates: DeezerArtist[]): DeezerArtist | null {
  if (!candidates?.length) return null;
  const t = normName(seedName);
  const exact = candidates.find((a) => normName(a.name) === t);
  if (exact) return exact;
  const starts = candidates.find(
    (a) => normName(a.name).startsWith(t) || t.startsWith(normName(a.name)),
  );
  if (starts) return starts;
  const sub = candidates.find(
    (a) => normName(a.name).includes(t) || t.includes(normName(a.name)),
  );
  return sub || candidates[0];
}

export async function getArtistTopTracks(artistId: number, limit = 40): Promise<DeezerTrack[]> {
  const data = await jsonp<{ data?: DeezerTrack[] }>(`${API}/artist/${artistId}/top?limit=${limit}`);
  return withPreview(data?.data || []);
}

/** Only tracks whose primary `artist.id` matches the resolved seed artist (avoids collab/remix pollution). */
export function filterTracksForArtist(tracks: DeezerTrack[], artistId: number): DeezerTrack[] {
  return tracks.filter((t) => t?.artist?.id === artistId);
}

/**
 * Map our wheel's genre names to Deezer's internal genre IDs (used at the
 * album level on Deezer). Multiple IDs per wheel genre because Deezer's
 * taxonomy is coarse — e.g. "Soul" and "Funk" both live under R&B (165),
 * and "House"/"Techno"/"Disco" all map to Dance (113).
 *
 * If a wheel genre isn't here, the genre filter is skipped and we fall
 * back to the artist's top tracks unchanged.
 *
 * IDs verified from Deezer's `/genre` endpoint.
 */
const WHEEL_TO_DEEZER_GENRE_IDS: Record<string, number[]> = {
  'Afrobeats':  [12, 165],          // African Music + R&B (broad)
  'Ambient':    [106],              // Electro (Deezer has no separate Ambient)
  'Bossa Nova': [129, 81],          // Jazz + Brazilian
  'Classical':  [98],
  'Cumbia':     [197],              // Latin Music
  'Disco':      [113, 132],         // Dance + Pop
  'Electronic': [106, 113],         // Electro + Dance
  'Folk':       [466, 169],         // Singer & Songwriter + Folk
  'Funk':       [165],              // R&B
  'Hip Hop':    [116],              // Rap/Hip Hop
  'House':      [113],              // Dance
  'Indie':      [152, 132],         // Rock + Pop (indie spans both)
  'Jazz':       [129],
  'Pop':        [132],
  'Punk':       [152],              // Rock (Deezer's punk lives under Rock)
  'Reggae':     [144],
  'Rock':       [152],
  'Soul':       [165],              // R&B
  'Techno':     [113],              // Dance
  'World':      [2, 12, 16, 197],   // World + African + Asian + Latin
};

/** Fetch an artist's albums (the `/artist/{id}/albums` endpoint includes a
 *  `genre_id` on each album — that's what lets us pick the genre-matched
 *  subset of an artist's catalog instead of relying on overall popularity). */
async function getArtistAlbums(artistId: number, limit = 50): Promise<DeezerAlbum[]> {
  const data = await jsonp<{ data?: DeezerAlbum[] }>(
    `${API}/artist/${artistId}/albums?limit=${limit}`,
  );
  return data?.data || [];
}

/** Fetch the track list of a single album. */
async function getAlbumTracks(albumId: number): Promise<DeezerTrack[]> {
  const data = await jsonp<{ tracks?: { data?: DeezerTrack[] } }>(
    `${API}/album/${albumId}`,
  );
  return withPreview(data?.tracks?.data || []);
}

/**
 * Resolve curated seed name → Deezer artist → tracks. When a wheel genre is
 * provided, we first try the artist's albums tagged with that genre on
 * Deezer and pull tracks from those. Only if no genre-matching albums exist
 * do we fall back to "top tracks across all genres" (the old behavior).
 *
 * This is what stops Shankar Mahadevan's Bollywood top-tracks from being
 * served as "India × Jazz" — his only jazz-tagged album (with Shakti, etc.)
 * gets selected over his much-bigger Bollywood catalog.
 */
export async function searchArtistTracksStrict(
  seedName: string,
  wheelGenre: string | null = null,
  limit = 12,
): Promise<DeezerTrack[]> {
  const trimmed = seedName.trim();
  if (!trimmed) return [];
  try {
    const hits = await searchArtists(trimmed, 14);
    const artist = pickBestArtistMatch(trimmed, hits);
    if (!artist?.id) return [];

    // 1. Try genre-filtered albums (if the wheel genre maps to known Deezer IDs).
    const genreIds = wheelGenre ? WHEEL_TO_DEEZER_GENRE_IDS[wheelGenre] : null;
    if (genreIds && genreIds.length) {
      const albums = await getArtistAlbums(artist.id, 50);
      const matching = albums.filter(
        (a): a is DeezerAlbum & { id: number; genre_id: number } =>
          typeof a.id === 'number' &&
          typeof a.genre_id === 'number' &&
          genreIds.includes(a.genre_id),
      );

      if (matching.length) {
        // Cap to top 4 matching albums so we don't fire 30+ network calls
        // for prolific artists. Order Deezer returns is newest-first, which
        // is fine — fresh tracks land first.
        const trackBatches = await Promise.all(
          matching.slice(0, 4).map((a) => getAlbumTracks(a.id).catch(() => [] as DeezerTrack[])),
        );
        const allTracks = trackBatches.flat().filter((t) => t.artist?.id === artist.id);
        // Need at least 2 valid tracks for the genre-filter path to "win" —
        // otherwise fall through to top tracks for a better playlist size.
        if (allTracks.length >= 2) {
          // De-dupe by track id (an artist's compilation can re-include earlier songs).
          const seen = new Set<number>();
          const unique: DeezerTrack[] = [];
          for (const t of allTracks) {
            if (!seen.has(t.id)) { seen.add(t.id); unique.push(t); }
            if (unique.length >= limit) break;
          }
          return unique;
        }
      }
    }

    // 2. Fallback: top tracks across the artist's whole catalog.
    const top = await getArtistTopTracks(artist.id, 45);
    return filterTracksForArtist(top, artist.id).slice(0, limit);
  } catch {
    return [];
  }
}

/* ---------- playlist building ---------- */

/** @deprecated Loose text-search returns tracks where the query string just
 *  appears in the title — produces unrelated junk for country×genre pairings.
 *  Kept for emergency manual use but no longer wired into buildPlaylist. */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function searchLoose(query: string, limit = 25): Promise<DeezerTrack[]> {
  const q = encodeURIComponent(query);
  const data = await jsonp<{ data?: DeezerTrack[] }>(`${API}/search?q=${q}&limit=${limit}`);
  return withPreview(data?.data || []);
}

function orderedSeedArtists(country: string, genre: string | null, seeds: Seeds): string[] {
  const bucket = seeds?.artists?.[country as keyof typeof seeds.artists] as
    | Record<string, string[]>
    | undefined;
  if (!bucket || typeof bucket !== 'object') return [];

  // No genre (the World's default state): the country's whole roster,
  // interleaved across genres so no single style dominates the front.
  if (genre === null) {
    const lists = Object.values(bucket).filter(Array.isArray) as string[][];
    const out: string[] = [];
    const seen = new Set<string>();
    const maxLen = Math.max(0, ...lists.map((l) => l.length));
    for (let i = 0; i < maxLen; i++) {
      for (const list of lists) {
        const name = String(list[i] ?? '').trim();
        if (name && !seen.has(name)) { seen.add(name); out.push(name); }
      }
    }
    return out;
  }

  const primary = Array.isArray(bucket[genre]) ? [...bucket[genre]] : [];
  const seen = new Set(primary.map((a) => a.trim()));
  const related = RELATED_GENRES[genre] || [];

  for (const g of related) {
    const list = bucket[g];
    if (!Array.isArray(list)) continue;
    for (const a of list) {
      const name = String(a).trim();
      if (name && !seen.has(name)) {
        seen.add(name);
        primary.push(name);
      }
    }
  }
  return primary;
}

async function enrichTrack(track: DeezerTrack): Promise<DeezerTrack> {
  if (!track?.id) return track;
  try {
    const full = await jsonp<DeezerTrack>(`${API}/track/${track.id}`);
    return {
      ...track,
      ...full,
      artist: full.artist || track.artist,
      album: full.album || track.album,
    };
  } catch {
    return track;
  }
}

async function enrichTracks(tracks: DeezerTrack[], concurrency = 6): Promise<DeezerTrack[]> {
  const out: DeezerTrack[] = new Array(tracks.length);
  let cursor = 0;

  async function worker() {
    for (;;) {
      const i = cursor++;
      if (i >= tracks.length) return;
      out[i] = await enrichTrack(tracks[i]);
    }
  }

  const n = Math.min(concurrency, Math.max(1, tracks.length));
  await Promise.all(Array.from({ length: n }, () => worker()));
  return out;
}

/** Merge unique tracks with round-robin across artist lists. Uniqueness is
 *  both by Deezer id AND by artist+title (`seenKeys`) — the same song often
 *  exists as a single and an album cut with different ids, which was how
 *  the queue filled up with repeats. */
function roundRobinMerge(
  lists: DeezerTrack[][],
  maxTracks: number,
  seen: Set<number>,
  seenKeys: Set<string>,
): DeezerTrack[] {
  const queue: DeezerTrack[] = [];
  const maxLen = Math.max(0, ...lists.map((p) => p.length));
  for (let i = 0; i < maxLen && queue.length < maxTracks; i++) {
    for (const list of lists) {
      const t = list[i];
      if (!t || seen.has(t.id)) continue;
      const key = trackKey(t);
      if (seenKeys.has(key)) { seen.add(t.id); continue; }
      seen.add(t.id);
      seenKeys.add(key);
      queue.push(t);
      if (queue.length >= maxTracks) break;
    }
  }
  return queue;
}

/**
 * Asks our own server (`/api/musicbrainz`) for artists tagged with the given
 * country + genre on MusicBrainz. The server proxies the actual MB call so
 * we can set the required User-Agent header, rate-limit, and cache results.
 * Returns [] on any failure so callers can fall through to other tiers.
 */
async function findArtistsViaMusicBrainz(country: string, genre: string): Promise<string[]> {
  try {
    const params = new URLSearchParams({ country, genre });
    const res = await fetch(`/api/musicbrainz?${params.toString()}`);
    if (!res.ok) return [];
    const data = (await res.json()) as { artists?: string[] };
    return Array.isArray(data.artists) ? data.artists : [];
  } catch {
    return [];
  }
}

/**
 * Asks our own server (`/api/curate`) for an LLM-generated artist list for a
 * pairing. The server proxies to Claude with the API key — the browser never
 * sees it. Returns [] on any failure so the caller can decide what to do.
 */
async function curateRuntime(country: string, genre: string): Promise<string[]> {
  try {
    const res = await fetch('/api/curate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ country, genre }),
    });
    if (!res.ok) return [];
    const data = (await res.json()) as { artists?: string[] | null };
    return Array.isArray(data.artists) ? data.artists : [];
  } catch {
    return [];
  }
}

/** Case-insensitive union — keeps order from the primary list, appends any
 *  names from secondary that aren't already present. */
/* ---------- world seeds (every globe nation) ----------
 * Built by scripts/build-world-seeds.ts from Wikidata + Every Noise +
 * Deezer verification. Loaded lazily — only the World's "any country"
 * path pays for the chunk. */
type WorldEntry = { top: string[]; featured: string[]; genres: Record<string, string[]> };
let worldSeedsCache: Record<string, WorldEntry> | null | undefined;

async function worldEntry(country: string): Promise<WorldEntry | null> {
  if (worldSeedsCache === undefined) {
    try {
      const mod = await import('./world-seeds.json');
      worldSeedsCache = (mod.default ?? mod) as unknown as Record<string, WorldEntry>;
    } catch {
      worldSeedsCache = null;
    }
  }
  return worldSeedsCache?.[country] ?? null;
}

/** Genre-bucketed world artists (+ related-genre borrows), like
 *  orderedSeedArtists but for countries outside the wheel. Genre null =
 *  the country's most notable artists across every genre. */
async function worldSeedArtists(country: string, genre: string | null): Promise<string[]> {
  const entry = await worldEntry(country);
  if (!entry) return [];
  if (genre === null) return [...entry.top];
  const out = [...(entry.genres[genre] ?? [])];
  const seen = new Set(out);
  for (const g of RELATED_GENRES[genre] ?? []) {
    for (const a of entry.genres[g] ?? []) {
      if (!seen.has(a)) { seen.add(a); out.push(a); }
    }
  }
  return out;
}

function unionArtists(primary: string[], secondary: string[]): string[] {
  const out = [...primary];
  const lower = new Set(primary.map((s) => s.toLowerCase()));
  for (const name of secondary) {
    const k = name.toLowerCase();
    if (!lower.has(k)) { out.push(name); lower.add(k); }
  }
  return out;
}

/**
 * Build a playlist for a country × genre pairing using a four-tier pipeline.
 * Tiers run in order; we stop as soon as the queue has enough tracks.
 *
 *   Tier 0  Hand-curated track overrides   — `track-overrides.json`
 *           Manually-verified Deezer track IDs for pairings where artist-
 *           level discovery still misses. Used to seed the front of the queue.
 *
 *   Tier 1+2  MusicBrainz ∪ seeds.json artists
 *             MusicBrainz (community-curated metadata for country + genre tags)
 *             merged with our manual `seeds.json` curation. The union gives us
 *             both fresh discoveries and trusted hand-picks. Each name then
 *             goes through `searchArtistTracksStrict`, which prefers genre-
 *             matched albums from Deezer over arbitrary top tracks.
 *
 *   Tier 3  LLM fallback via `/api/curate` — only fires when 0 tracks so far.
 *           Requires ANTHROPIC_API_KEY on the server (no key → silent no-op).
 *
 * If all four tiers come up empty, returns [] and the CenterStack shows its
 * error pane ("Could not find music from this pairing").
 */
/** Queue sizing: pull a deep pool per pairing (the old cap was 22, which
 *  felt thin and repetitive), but only pay full metadata enrichment for the
 *  head of the queue — later tracks already carry cover art from the list
 *  endpoints, and missing release dates degrade gracefully in the UI. */
const QUEUE_MAX   = 150;
const ARTIST_CAP  = 24;
const PER_ARTIST  = 12;
const ENRICH_HEAD = 30;
const BATCH_SIZE  = 8;    // artists fetched concurrently — Deezer's anonymous
const BATCH_PAUSE = 800;  // quota (~50 req/5s) drops most of a 24-wide burst
const ENOUGH      = 100;  // stop batching once this many candidates are in

/** Resolve artists → track lists in rate-limit-friendly batches, stopping
 *  early once we have plenty. A full-parallel burst tripped Deezer's quota
 *  and silently starved the queue down to a handful of artists. */
async function fetchArtistTrackLists(names: string[], genre: string | null): Promise<DeezerTrack[][]> {
  const lists: DeezerTrack[][] = [];
  for (let i = 0; i < names.length; i += BATCH_SIZE) {
    if (i > 0) await new Promise((r) => setTimeout(r, BATCH_PAUSE));
    const batch = await Promise.all(
      names.slice(i, i + BATCH_SIZE).map((a) =>
        searchArtistTracksStrict(a, genre, PER_ARTIST).catch(() => [] as DeezerTrack[]),
      ),
    );
    lists.push(...batch);
    const total = lists.reduce((n, l) => n + l.length, 0);
    if (total >= ENOUGH) break;
  }
  return lists;
}

export async function buildPlaylist({
  country,
  genre,
  seeds,
}: {
  country: string;
  /** null = no genre selected (the World's default): the country's notable
   *  songs across genres. */
  genre: string | null;
  seeds: Seeds;
}): Promise<DeezerTrack[]> {
  const queue: DeezerTrack[] = [];
  const seen = new Set<number>();
  const seenKeys = new Set<string>();

  /* Tier 0: hand-curated track overrides go first (genre-keyed). */
  const overrides = genre ? await fetchOverrideTracks(country, genre) : [];
  for (const t of overrides) {
    const key = trackKey(t);
    if (!seen.has(t.id) && !seenKeys.has(key)) {
      seen.add(t.id);
      seenKeys.add(key);
      queue.push(t);
    }
  }

  /* Tiers 1+2: MusicBrainz ∪ seeds.json artists. Countries outside the
   * wheel have no seeds.json bucket — world-seeds.json (all nations,
   * Wikidata-sourced + Deezer-verified) takes its place. */
  const [mbArtists, seedArtists] = await Promise.all([
    genre ? findArtistsViaMusicBrainz(country, genre) : Promise.resolve([] as string[]),
    Promise.resolve(orderedSeedArtists(country, genre, seeds)),
  ]);
  const worldArtists = seedArtists.length ? [] : await worldSeedArtists(country, genre);
  // Seeds first (hand-picked quality), then MusicBrainz discoveries in
  // MB relevance-score order — the round-robin below interleaves them.
  const combined = unionArtists(unionArtists(worldArtists, seedArtists), mbArtists)
    .slice(0, ARTIST_CAP);

  if (combined.length && queue.length < QUEUE_MAX) {
    const perArtist = await fetchArtistTrackLists(combined, genre);
    queue.push(...roundRobinMerge(perArtist, QUEUE_MAX - queue.length, seen, seenKeys));
  }

  /* Tier 2.5: still empty on a world country → the country's most notable
   * artists across ANY genre. Hearing the place beats dead air. */
  if (queue.length === 0) {
    const entry = await worldEntry(country);
    if (entry?.top.length) {
      const perArtist = await Promise.all(
        entry.top.slice(0, 10).map((a) =>
          searchArtistTracksStrict(a, genre, PER_ARTIST).catch(() => [] as DeezerTrack[]),
        ),
      );
      queue.push(...roundRobinMerge(perArtist, QUEUE_MAX, seen, seenKeys));
    }
  }

  /* Tier 3: LLM fallback if all the above failed (needs a genre). */
  if (queue.length === 0 && genre) {
    const llmArtists = await curateRuntime(country, genre);
    if (llmArtists.length) {
      const perArtist = await Promise.all(
        llmArtists.map((a) =>
          searchArtistTracksStrict(a, genre, PER_ARTIST).catch(() => [] as DeezerTrack[]),
        ),
      );
      queue.push(...roundRobinMerge(perArtist, QUEUE_MAX, seen, seenKeys));
    }
  }

  /* Enrich the head with full metadata; the tail ships as-is (it has cover
   * art already — enriching 150 tracks would be 150 extra API calls). */
  const capped = queue.slice(0, QUEUE_MAX);
  const head = await enrichTracks(capped.slice(0, ENRICH_HEAD));
  return [...head, ...capped.slice(ENRICH_HEAD)];
}

/** Artist portrait for the "About the artist" card face. */
export async function getArtistPicture(artistId: number): Promise<string | null> {
  if (!artistId) return null;
  try {
    const a = await jsonp<DeezerArtist>(`${API}/artist/${artistId}`);
    return a?.picture_xl || a?.picture_big || a?.picture_medium || null;
  } catch {
    return null;
  }
}

export async function getArtistBlurb(artistId: number, artistName: string): Promise<string> {
  try {
    const a = await jsonp<{ nb_album?: number; nb_fan?: number }>(`${API}/artist/${artistId}`);
    const fans = a?.nb_fan
      ? new Intl.NumberFormat('en', { notation: 'compact' }).format(a.nb_fan)
      : null;
    const albums = a?.nb_album;
    const parts: string[] = [];
    if (albums) parts.push(`${albums} album${albums === 1 ? '' : 's'}`);
    if (fans) parts.push(`${fans} listeners on Deezer`);
    if (parts.length) {
      return `${artistName} — ${parts.join(', ')}.`;
    }
  } catch {
    /* ignore */
  }
  return `${artistName}.`;
}
