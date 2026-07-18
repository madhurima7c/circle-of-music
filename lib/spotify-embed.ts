'use client';

/**
 * Hidden Spotify EMBED player — the engine behind "Connect Spotify".
 *
 * Spotify's IFrame-API embed plays FULL songs for anyone logged in to
 * open.spotify.com in this browser (any account — the Development-Mode
 * allowlist only gates OAuth, which this never uses) and Spotify's own
 * 30s preview otherwise. The iframe is parked off-screen: the app's
 * now-playing card stays the ONE set of controls, and GlobalPlayer
 * drives this module exactly like it drives the <audio> element.
 *
 * Interface mirrors the old Web Playback SDK helpers so GlobalPlayer's
 * routing (viaSpotify / end-detection / fallback-to-preview) carries over.
 */

type EmbedController = {
  loadUri: (uri: string) => void;
  play: () => void;
  pause: () => void;
  resume: () => void;
  seek: (seconds: number) => void;
  destroy: () => void;
  addListener: (event: string, cb: (e: never) => void) => void;
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

export type EmbedState = {
  paused: boolean;
  position: number; // ms
  duration: number; // ms
};

let apiPromise: Promise<IFrameAPI> | null = null;
let controller: EmbedController | null = null;
let host: HTMLDivElement | null = null;
let stateCb: ((s: EmbedState) => void) | null = null;
// Where the embed renders. When a visible container is attached (the card's
// Spotify strip), the widget is REAL UI: clicking play inside it is the
// interaction browsers require before giving the iframe access to the
// user's Spotify login (Storage Access) — i.e. the difference between
// 30s clips and full tracks. With no container it parks off-screen.
let mountTarget: HTMLElement | null = null;

export function attachEmbedHost(el: HTMLElement | null): void {
  if (el === mountTarget) return;
  mountTarget = el;
  // An iframe can't move in the DOM without reloading — recreate on next play.
  destroyEmbed();
}
// True while the embed's own playback_update says it's sounding. Drives the
// play() retry pump below — module-level so it works before GlobalPlayer's
// listener attaches and regardless of who's listening.
let sounding = false;
// Token that cancels stale retry pumps: any pause/new-load bumps it.
let playAttempt = 0;

/* loadUri() swallows a play() issued while the embed is still loading the
 * new track — the #1 cause of "next song fell back to the preview". Fire
 * play now and keep re-firing on a backoff until the embed reports sound. */
function pumpPlay(token: number, delays: number[]): void {
  if (token !== playAttempt || sounding || !controller) return;
  controller.play();
  const next = delays[0];
  if (next !== undefined) setTimeout(() => pumpPlay(token, delays.slice(1)), next);
}

function loadApi(): Promise<IFrameAPI> {
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

/** GlobalPlayer registers ONE listener; playback_update events flow to it. */
export function setEmbedStateListener(cb: ((s: EmbedState) => void) | null): void {
  stateCb = cb;
}

/** Load a track into the (lazily created) hidden embed and start it. */
export async function embedPlay(uri: string): Promise<boolean> {
  try {
    const token = ++playAttempt;
    sounding = false;
    if (!controller) {
      const api = await loadApi();
      if (token !== playAttempt) return false; // superseded while loading the API
      if (!controller) {
        host = document.createElement('div');
        if (mountTarget) {
          host.style.cssText = 'width:100%;height:100%;';
          mountTarget.appendChild(host);
        } else {
          // Off-screen, NOT display:none — hidden iframes may refuse playback.
          host.style.cssText = 'position:fixed;left:-10000px;bottom:0;width:320px;height:152px;pointer-events:none;';
          document.body.appendChild(host);
        }
        const mount = document.createElement('div');
        host.appendChild(mount);
        await new Promise<void>((resolve) => {
          // 152px = Spotify's compact-card layout WITH a usable scrubber and
          // un-clipped play/plus/logo (the 80px mini cut them off).
          api.createController(mount, { uri, width: '100%', height: 152 }, (c) => {
            controller = c;
            c.addListener('playback_update', (e: never) => {
              const d = (e as { data?: { isPaused?: boolean; position?: number; duration?: number } }).data;
              if (!d) return;
              sounding = !d.isPaused;
              stateCb?.({
                paused: !!d.isPaused,
                position: d.position ?? 0,
                duration: d.duration ?? 0,
              });
            });
            resolve();
          });
        });
        if (token !== playAttempt) return false;
        pumpPlay(token, [600, 1500, 3000]);
        return true;
      }
    }
    controller.loadUri(uri);
    pumpPlay(token, [600, 1500, 3000]);
    return true;
  } catch {
    return false;
  }
}

// Bump playAttempt on pause so a pending retry can't restart a track the
// user (or a track change) just stopped.
export function embedPause(): void { playAttempt++; controller?.pause(); }
export function embedResume(): void { controller?.resume(); }
/** Start the loaded URI from scratch — resume() is a no-op on a track that
 *  never began (e.g. the iframe blocked autoplay until a user gesture). */
export function embedStart(): void { pumpPlay(++playAttempt, [600, 1500]); }
export function embedSeek(seconds: number): void { controller?.seek(seconds); }

export function destroyEmbed(): void {
  playAttempt++;
  sounding = false;
  controller?.destroy();
  controller = null;
  host?.remove();
  host = null;
}
