'use client';

/**
 * embed-bus — module-level open/closed state for the Spotify EMBED panel
 * (components/SpotifyEmbed.tsx, mounted once in the root layout so it
 * survives navigation, same pattern as audio-bus). Any page's "play full
 * song here" entry toggles it; React reads it via useSyncExternalStore.
 */

let open = false;
const listeners = new Set<() => void>();

export function isEmbedOpen(): boolean {
  return open;
}

export function setEmbedOpen(next: boolean): void {
  if (open === next) return;
  open = next;
  listeners.forEach((l) => l());
}

export function subscribeEmbed(l: () => void): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}
