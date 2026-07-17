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
    if (controller) {
      controller.loadUri(uri);
      controller.play();
      return true;
    }
    const api = await loadApi();
    if (controller) { // a parallel call won the race while we awaited
      (controller as EmbedController).loadUri(uri);
      (controller as EmbedController).play();
      return true;
    }
    host = document.createElement('div');
    // Off-screen, NOT display:none — hidden iframes may refuse playback.
    host.style.cssText = 'position:fixed;left:-10000px;bottom:0;width:320px;height:80px;pointer-events:none;';
    document.body.appendChild(host);
    const mount = document.createElement('div');
    host.appendChild(mount);
    await new Promise<void>((resolve) => {
      api.createController(mount, { uri, width: 300, height: 80 }, (c) => {
        controller = c;
        c.addListener('playback_update', (e: never) => {
          const d = (e as { data?: { isPaused?: boolean; position?: number; duration?: number } }).data;
          if (d && stateCb) {
            stateCb({
              paused: !!d.isPaused,
              position: d.position ?? 0,
              duration: d.duration ?? 0,
            });
          }
        });
        resolve();
      });
    });
    controller!.play();
    return true;
  } catch {
    return false;
  }
}

export function embedPause(): void { controller?.pause(); }
export function embedResume(): void { controller?.resume(); }
/** Start the loaded URI from scratch — resume() is a no-op on a track that
 *  never began (e.g. the iframe blocked autoplay until a user gesture). */
export function embedStart(): void { controller?.play(); }
export function embedSeek(seconds: number): void { controller?.seek(seconds); }

export function destroyEmbed(): void {
  controller?.destroy();
  controller = null;
  host?.remove();
  host = null;
}
