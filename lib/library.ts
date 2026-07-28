'use client';

import { useCallback, useMemo, useSyncExternalStore } from 'react';
import type { Track } from './data';

/**
 * "Finds" — a local, account-free library of saved tracks (the Shazam-style
 * keep-what-you-discover idea). Stored in localStorage; every find carries
 * the country×genre it was discovered in, so the library doubles as a map of
 * where you've wandered.
 *
 * Deliberately behind a tiny store interface (subscribe + snapshot + mutators)
 * so a real backend can replace the localStorage layer later without touching
 * the UI. React reads it via useFinds() / useIsFind() (useSyncExternalStore).
 */

export type Find = {
  id: number;
  title: string;
  artist: string;
  album: string;
  image: string;
  preview: string | null;
  country: string;
  genre: string;
  savedAt: number;      // epoch ms
  releaseDate?: string | null; // optional — older saved finds predate it
  duration?: number | null;    // optional — full-track seconds
  /**
   * Whether this is in "All liked". Absent means TRUE — every find saved
   * before this field existed was, by definition, liked.
   *
   * A record can outlive the like: unliking a song that sits in a playlist
   * keeps it here with `liked: false` so the playlist row still resolves.
   * Playlists reference finds by id, so deleting outright would silently
   * empty a curated playlist.
   */
  liked?: boolean;
};

/** Absent `liked` means an older record, which was liked by definition. */
export const isLiked = (f: Find) => f.liked !== false;

/** A named, ordered collection of saved finds (Spotify-style playlist). */
export type Playlist = {
  id: string;
  name: string;
  trackIds: number[];   // references into the finds list
  createdAt: number;
};

const KEY = 'finds';

// Stable references so useSyncExternalStore's server/first snapshots don't
// return a new value each call (which triggers an infinite render loop).
const EMPTY: Find[] = [];

let cache: Find[] | null = null;
const listeners = new Set<() => void>();

function read(): Find[] {
  if (cache) return cache;
  if (typeof window === 'undefined') return EMPTY;
  try {
    const raw = window.localStorage.getItem(KEY);
    cache = raw ? (JSON.parse(raw) as Find[]) : [];
  } catch {
    cache = [];
  }
  return cache!;
}

function write(next: Find[]) {
  cache = next;
  try { window.localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* quota */ }
  listeners.forEach(l => l());
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  // Keep multiple tabs in sync (finds + playlists share the listener set).
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY) { cache = null; cb(); }
    if (e.key === PL_KEY) { plCache = null; cb(); }
  };
  window.addEventListener('storage', onStorage);
  return () => { listeners.delete(cb); window.removeEventListener('storage', onStorage); };
}

/* ---------- mutators ---------- */

/** Is this song in "All liked"? Drives the ♥ state. */
export function isFind(id: number): boolean {
  return read().some(f => f.id === id && isLiked(f));
}

/** Like if not liked, unlike if liked. Returns the new liked-state. */
export function toggleFind(find: Find): boolean {
  const list = read();
  const existing = list.find(f => f.id === find.id);
  if (existing && isLiked(existing)) { removeFind(find.id); return false; }
  if (existing) {
    // Was kept for a playlist — re-like it WITHOUT touching country/genre, so
    // the library still records where you first found it.
    write(list.map(f => (f.id === find.id ? { ...f, liked: true } : f)));
    return true;
  }
  write([{ ...find, savedAt: Date.now(), liked: true }, ...list]);
  return true;
}

/** In any playlist? Then the record has to survive an unlike. */
function inAnyPlaylist(id: number): boolean {
  return readPlaylists().some(p => p.trackIds.includes(id));
}

/**
 * Unlike. Drops out of "All liked" but STAYS in any playlist it was filed
 * into — playlists are independent collections, so unliking must not quietly
 * gut someone's curation. A song in no playlist is deleted outright.
 */
export function removeFind(id: number) {
  const list = read();
  write(inAnyPlaylist(id)
    ? list.map(f => (f.id === id ? { ...f, liked: false } : f))
    : list.filter(f => f.id !== id));
}

export function removeFinds(ids: number[]) {
  const set = new Set(ids);
  write(read().flatMap(f => {
    if (!set.has(f.id)) return [f];
    return inAnyPlaylist(f.id) ? [{ ...f, liked: false }] : [];
  }));
}

export function exportFinds(): string {
  return JSON.stringify(read(), null, 2);
}

/** Merge imported finds in (dedupe by id). Returns how many were added. */
export function importFinds(json: string): number {
  let incoming: Find[];
  try { incoming = JSON.parse(json) as Find[]; } catch { return 0; }
  if (!Array.isArray(incoming)) return 0;
  const list = read();
  const have = new Set(list.map(f => f.id));
  const fresh = incoming.filter(f => f && typeof f.id === 'number' && !have.has(f.id));
  if (fresh.length) write([...fresh, ...list]);
  return fresh.length;
}

/** A find, as a playable Track (the library plays as a queue). */
export function findToTrack(f: Find): Track {
  return {
    id: f.id, title: f.title, artist: f.artist, artistId: 0,
    album: f.album, releaseDate: f.releaseDate ?? null,
    duration: f.duration ?? null, image: f.image, preview: f.preview,
  };
}

/* ---------- playlists (same localStorage store pattern) ---------- */

const PL_KEY = 'playlists';
const EMPTY_PL: Playlist[] = [];
let plCache: Playlist[] | null = null;

function readPlaylists(): Playlist[] {
  if (plCache) return plCache;
  if (typeof window === 'undefined') return EMPTY_PL;
  try {
    const raw = window.localStorage.getItem(PL_KEY);
    plCache = raw ? (JSON.parse(raw) as Playlist[]) : [];
  } catch {
    plCache = [];
  }
  return plCache!;
}

function writePlaylists(next: Playlist[]) {
  plCache = next;
  try { window.localStorage.setItem(PL_KEY, JSON.stringify(next)); } catch { /* quota */ }
  listeners.forEach(l => l());
}

export function createPlaylist(name: string): Playlist {
  const pl: Playlist = {
    id: `pl_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
    name: name.trim() || 'New playlist',
    trackIds: [],
    createdAt: Date.now(),
  };
  writePlaylists([...readPlaylists(), pl]);
  return pl;
}

export function deletePlaylist(id: string) {
  writePlaylists(readPlaylists().filter(p => p.id !== id));
}

export function renamePlaylist(id: string, name: string) {
  writePlaylists(readPlaylists().map(p => (p.id === id ? { ...p, name: name.trim() || p.name } : p)));
}

/** Add a saved find to a playlist (dedupes; drag-and-drop calls this). */
export function addToPlaylist(playlistId: string, trackId: number) {
  writePlaylists(readPlaylists().map(p =>
    p.id === playlistId && !p.trackIds.includes(trackId)
      ? { ...p, trackIds: [...p.trackIds, trackId] }
      : p,
  ));
}

export function removeFromPlaylist(playlistId: string, trackId: number) {
  writePlaylists(readPlaylists().map(p =>
    p.id === playlistId ? { ...p, trackIds: p.trackIds.filter(t => t !== trackId) } : p,
  ));
}

export function addBulkToPlaylist(playlistId: string, trackIds: number[]) {
  writePlaylists(readPlaylists().map(p => {
    if (p.id !== playlistId) return p;
    const have = new Set(p.trackIds);
    const fresh = trackIds.filter(id => !have.has(id));
    return fresh.length ? { ...p, trackIds: [...p.trackIds, ...fresh] } : p;
  }));
}

export function removeBulkFromPlaylist(playlistId: string, trackIds: number[]) {
  const set = new Set(trackIds);
  writePlaylists(readPlaylists().map(p =>
    p.id === playlistId ? { ...p, trackIds: p.trackIds.filter(t => !set.has(t)) } : p,
  ));
}

/* ---------- React hooks ---------- */

// Stable snapshot fns (identity + result) so React's dev check never flags
// them as "uncached" during SSR/hydration.
const serverFinds = (): Find[] => EMPTY;
const serverFalse = () => false;

/** Everything we hold, liked or merely filed — resolves playlist rows. */
export function useAllFinds(): Find[] {
  return useSyncExternalStore(subscribe, read, serverFinds);
}

/** "All liked" — the ♥ library. Excludes records kept only for a playlist. */
export function useFinds(): Find[] {
  const all = useSyncExternalStore(subscribe, read, serverFinds);
  return useMemo(() => (all.some(f => !isLiked(f)) ? all.filter(isLiked) : all), [all]);
}

const serverPlaylists = (): Playlist[] => EMPTY_PL;

export function usePlaylists(): Playlist[] {
  return useSyncExternalStore(subscribe, readPlaylists, serverPlaylists);
}

export function useIsFind(id: number | undefined): boolean {
  const getSnapshot = useCallback(
    () => (id != null ? isFind(id) : false),
    [id],
  );
  return useSyncExternalStore(subscribe, getSnapshot, serverFalse);
}
