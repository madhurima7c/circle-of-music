'use client';

import { useCallback, useSyncExternalStore } from 'react';
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
  // Keep multiple tabs in sync.
  const onStorage = (e: StorageEvent) => { if (e.key === KEY) { cache = null; cb(); } };
  window.addEventListener('storage', onStorage);
  return () => { listeners.delete(cb); window.removeEventListener('storage', onStorage); };
}

/* ---------- mutators ---------- */

export function isFind(id: number): boolean {
  return read().some(f => f.id === id);
}

/** Save if absent, remove if present. Returns the new saved-state. */
export function toggleFind(find: Find): boolean {
  const list = read();
  if (list.some(f => f.id === find.id)) {
    write(list.filter(f => f.id !== find.id));
    return false;
  }
  write([{ ...find, savedAt: Date.now() }, ...list]);
  return true;
}

export function removeFind(id: number) {
  write(read().filter(f => f.id !== id));
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
    album: f.album, releaseDate: f.releaseDate ?? null, image: f.image, preview: f.preview,
  };
}

/* ---------- React hooks ---------- */

// Stable snapshot fns (identity + result) so React's dev check never flags
// them as "uncached" during SSR/hydration.
const serverFinds = (): Find[] => EMPTY;
const serverFalse = () => false;

export function useFinds(): Find[] {
  return useSyncExternalStore(subscribe, read, serverFinds);
}

export function useIsFind(id: number | undefined): boolean {
  const getSnapshot = useCallback(
    () => (id != null ? isFind(id) : false),
    [id],
  );
  return useSyncExternalStore(subscribe, getSnapshot, serverFalse);
}
