'use client';

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useStore } from '@/lib/store';
import { STR } from '@/lib/strings';
import { isEmbedOpen, setEmbedOpen, subscribeEmbed } from '@/lib/embed-bus';
import { findTrackUri, isSpotifyConnected } from '@/lib/spotify';

/**
 * SpotifyEmbed — the current track in Spotify's own EMBED player.
 *
 * Unlike the Web Playback SDK (Premium + Development-Mode allowlist), the
 * embed needs NO developer credentials in the browser and NO allowlist:
 * ANY visitor already logged in to open.spotify.com in this browser hears
 * the FULL song; logged-out visitors get Spotify's 30s preview. The panel
 * mounts once in the root layout (survives navigation) and follows the
 * store's current track. Opening it pauses the app's own player so the
 * two never talk over each other.
 *
 * Track ids come from /api/spotify-search (app client-credentials, works
 * for everyone); if that route isn't configured, a connected (allowlisted)
 * Spotify user's own token is used as a fallback resolver.
 */

type EmbedController = {
  loadUri: (uri: string) => void;
  play: () => void;
  destroy: () => void;
};
type IFrameAPI = {
  createController: (
    el: HTMLElement,
    options: { uri: string; width?: string | number; height?: string | number },
    cb: (controller: EmbedController) => void,
  ) => void;
};
declare global {
  interface Window {
    onSpotifyIframeApiReady?: (api: IFrameAPI) => void;
  }
}

let apiPromise: Promise<IFrameAPI> | null = null;
function loadIframeApi(): Promise<IFrameAPI> {
  if (apiPromise) return apiPromise;
  apiPromise = new Promise<IFrameAPI>((resolve) => {
    window.onSpotifyIframeApiReady = (api) => resolve(api);
    const s = document.createElement('script');
    s.src = 'https://open.spotify.com/embed/iframe-api/v1';
    s.async = true;
    document.body.appendChild(s);
  });
  return apiPromise;
}

/** artist|title → spotify track uri, or why we couldn't get one. */
async function resolveUri(
  artist: string,
  title: string,
): Promise<{ uri: string | null; reason: 'ok' | 'nomatch' | 'unconfigured' }> {
  try {
    const res = await fetch(
      `/api/spotify-search?artist=${encodeURIComponent(artist)}&title=${encodeURIComponent(title)}`,
    );
    if (res.ok) {
      const uri = ((await res.json()) as { uri?: string }).uri ?? null;
      return { uri, reason: uri ? 'ok' : 'nomatch' };
    }
    if (res.status === 503) {
      // No client secret configured — fall back to the connected user's
      // own token (works for the owner + allowlisted testers).
      if (isSpotifyConnected()) {
        const uri = await findTrackUri(artist, title);
        return { uri, reason: uri ? 'ok' : 'nomatch' };
      }
      return { uri: null, reason: 'unconfigured' };
    }
    return { uri: null, reason: 'nomatch' };
  } catch {
    return { uri: null, reason: 'nomatch' }; /* offline etc. */
  }
}

export function SpotifyEmbed() {
  const open = useSyncExternalStore(subscribeEmbed, isEmbedOpen, () => false);
  const { tracks, trackIdx, isPlaying, togglePlay } = useStore();
  const track = tracks[trackIdx];

  const hostRef = useRef<HTMLDivElement | null>(null);
  const controllerRef = useRef<EmbedController | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'nomatch' | 'unconfigured'>('loading');

  // Opening the embed pauses the app's own player.
  const pausedOnOpen = useRef(false);
  useEffect(() => {
    if (open && isPlaying && !pausedOnOpen.current) {
      pausedOnOpen.current = true;
      togglePlay();
    }
    if (!open) pausedOnOpen.current = false;
  }, [open, isPlaying, togglePlay]);

  // Resolve the current track and (re)load it into the controller.
  useEffect(() => {
    if (!open || !track) return;
    let alive = true;
    setStatus('loading');
    void resolveUri(track.artist, track.title).then(async ({ uri, reason }) => {
      if (!alive) return;
      if (!uri) { setStatus(reason === 'unconfigured' ? 'unconfigured' : 'nomatch'); return; }
      if (controllerRef.current) {
        controllerRef.current.loadUri(uri);
        setStatus('ready');
        return;
      }
      const api = await loadIframeApi();
      if (!alive || !hostRef.current) return;
      // createController REPLACES the host node with the iframe — hand it
      // a disposable child so React never loses a node it manages.
      const mount = document.createElement('div');
      hostRef.current.appendChild(mount);
      api.createController(mount, { uri, width: '100%', height: 152 }, (c) => {
        controllerRef.current = c;
        if (alive) setStatus('ready');
      });
    });
    return () => { alive = false; };
  }, [open, track?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Full teardown when the panel closes.
  useEffect(() => {
    if (open) return;
    controllerRef.current?.destroy();
    controllerRef.current = null;
    if (hostRef.current) hostRef.current.innerHTML = '';
  }, [open]);

  if (!open || !track) return null;

  return (
    <aside className="spembed" role="complementary" aria-label={STR.spotify.embedTitle}>
      <div className="spembed__head">
        <span className="spembed__title">{STR.spotify.embedTitle}</span>
        <button
          className="spembed__close"
          onClick={() => setEmbedOpen(false)}
          aria-label={STR.spotify.embedClose}
        >
          ×
        </button>
      </div>
      <div ref={hostRef} className="spembed__player" />
      {status === 'loading' && <div className="spembed__note">{STR.spotify.connecting}</div>}
      {status === 'nomatch' && <div className="spembed__note">{STR.spotify.embedNoMatch}</div>}
      {status === 'unconfigured' && <div className="spembed__note">{STR.spotify.embedUnconfigured}</div>}
      <div className="spembed__note spembed__note--hint">{STR.spotify.embedHint}</div>
    </aside>
  );
}
