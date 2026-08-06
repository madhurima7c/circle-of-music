'use client';

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useStore } from '@/lib/store';
import { STR } from '@/lib/strings';
import { audioBus } from '@/lib/audio-bus';
import {
  subscribeSpotify, isSpotifyConnected, handleSpotifyCallback,
  resolveSpotifyUri, prefetchSpotifyUri, isSpotifyRateLimited,
} from '@/lib/spotify';
import {
  embedPlay, embedPause, embedResume, embedStart, embedSeek,
  setEmbedStateListener, destroyEmbed, attachEmbedHost,
} from '@/lib/spotify-embed';

/**
 * GlobalPlayer — the one <audio> element for the whole app.
 *
 * Mounted in the root layout (inside StoreProvider) so playback survives
 * client-side navigation between /circle, /world, and the hub. CenterStack
 * is now pure UI: it renders controls that dispatch store actions; this
 * component turns store state into sound.
 *
 * Also owns the MediaSession integration (lock-screen / hardware-key
 * metadata + transport controls) and a compact mini-player pill shown on
 * routes where the Circle's center card isn't visible.
 *
 * Spotify mode (opt-in via "Connect Spotify"): each track is resolved to a
 * Spotify id and played through the embed (lib/spotify-embed.ts), shown as
 * a compact VISIBLE strip — it must be visible because browsers only grant
 * the iframe access to the user's Spotify login (full songs vs 30s clips)
 * after the user interacts with Spotify's own widget. The card's controls +
 * progress bar still drive it (audioBus.ext), and widget interactions sync
 * back into the store. Any miss (track not on Spotify, lookup unavailable,
 * embed never starts) falls back to the 30s Deezer preview — never dead air.
 */
const serverFalse = () => false;
// A freshly-detected 30s clip stays up as a clickable Spotify widget for this
// long before falling back to the Deezer preview — the window in which a tap on
// the embed's ▶ can grant access and upgrade the track to full length in place.
const CLIP_GRACE_MS = 4000;

export function GlobalPlayer() {
  const {
    tracks, trackIdx, isPlaying, status,
    togglePlay, setIsPlaying, nextTrack, prevTrack,
    setAutoplayBlocked, trackEnded,
  } = useStore();
  const track = tracks[trackIdx];
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const pathname = usePathname();

  /* ---------- Spotify (full songs via the hidden embed) ---------- */
  const spotifyOn = useSyncExternalStore(subscribeSpotify, isSpotifyConnected, serverFalse);
  // True while the CURRENT track is sounding through the embed, so the
  // isPlaying effect and end-of-track logic route to the right backend.
  const viaSpotify = useRef(false);
  const embedPrev = useRef<{ position: number; duration: number } | null>(null);
  // Set the moment the embed reports ACTUAL playback (paused:false). The
  // iframe can silently refuse to autoplay (no user gesture, not logged in) —
  // embedPlay() can't tell, so a watchdog checks this and falls back.
  const embedStarted = useRef(false);
  const onEndedRef = useRef<() => void>(() => {});
  // Stamped on every playback_update — lets the watchdog tell "embed is
  // alive but still loading" (give it longer) from "embed is dead" (bail).
  const lastUpdate = useRef(0);
  // Mirror of isPlaying + timestamp of our last play/pause command, so the
  // listener can sync state FROM the visible widget's own buttons without
  // fighting a command we just issued.
  const isPlayingRef = useRef(isPlaying);
  const lastCmd = useRef(0);
  // Bumped to force the track effect to rebuild the embed with a FRESH
  // iframe (only a new iframe document sees a just-granted Spotify login).
  const [freshNonce, setFreshNonce] = useState(0);
  const stripRef = useRef<HTMLDivElement | null>(null);
  // Connected but NOT logged in at Spotify: the embed serves ~30s clips.
  // Rather than permanently routing the whole session to Deezer (which never
  // let the user reach the widget's own ▶ to GRANT Spotify access), a clip
  // gets a short GRACE window per track: the visible, clickable embed stays up
  // so a tap can upgrade THIS track to full length in place. Only if the window
  // lapses still-clip does clipBail fall back to the Deezer preview — for this
  // track alone, not the session, so the next track attempts the embed again
  // and a login granted at any point is picked up automatically.
  const clipBail = useRef<(() => void) | null>(null);
  const clipGraceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // The Circle card renders a reserved [data-spotify-slot] row while
  // connected; the strip seats itself over it (fixed overlay — the iframe
  // itself can never move into the card's DOM without reloading). When no
  // slot exists (World, hub), the strip tucks behind the now-playing card.
  const [slotRect, setSlotRect] = useState<{ left: number; top: number; width: number } | null>(null);
  // Reactive mirror of "the embed is the sounding source" (audioBus.ext). The
  // slot only exists in the card while this is true, so the strip must stop
  // using the (now-stale) slot position the MOMENT this flips false — else it
  // floats at the last slot coordinates over the card (the shuffle bug). Every
  // audioBus.ext change goes through setExt so this stays in lockstep.
  const [embedLive, setEmbedLive] = useState(false);
  const setExt = useCallback((val: typeof audioBus.ext) => {
    audioBus.ext = val;
    setEmbedLive(!!val);
  }, []);

  useEffect(() => { handleSpotifyCallback(); }, []);

  useEffect(() => {
    // Only seat on the slot while the embed is genuinely the sounding source;
    // the instant it isn't (embedLive false), drop the rect so the strip falls
    // back to its occluded-behind-the-card position instead of floating at the
    // last slot coordinates. Re-runs on embedLive so there's no interval lag.
    if (!(spotifyOn && !!track && embedLive)) { setSlotRect(null); return; }
    const measure = () => {
      const el = document.querySelector('[data-spotify-slot]');
      if (!el) { setSlotRect(r => (r === null ? r : null)); return; }
      const r = el.getBoundingClientRect();
      if (!r.width) return;
      setSlotRect(prev =>
        prev &&
        Math.abs(prev.left - r.left) < 1 &&
        Math.abs(prev.top - r.top) < 1 &&
        Math.abs(prev.width - r.width) < 1
          ? prev
          : { left: r.left, top: r.top, width: r.width });
    };
    measure();
    // The card animates in and layouts shift — keep the seat re-measured.
    const iv = setInterval(measure, 300);
    window.addEventListener('resize', measure);
    return () => { clearInterval(iv); window.removeEventListener('resize', measure); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spotifyOn, !!track, pathname, embedLive]);

  useEffect(() => { isPlayingRef.current = isPlaying; }, [isPlaying]);

  /* The visible Spotify strip is the embed's home while connected. Attach it
     the moment we're connected and keep it attached for the WHOLE connected
     session — independent of whether a track is momentarily loaded. An iframe
     cannot be re-parented without reloading (which drops the Spotify login and
     restarts as 30s clips), so the host must never come and go with track
     transitions; only connect/disconnect may change it. Tying this to hasTrack
     was the "Spotify window keeps detaching" bug: every brief track === null
     (queue swap, genre advance, end-of-queue) tore the iframe down. */
  useEffect(() => {
    attachEmbedHost(spotifyOn ? stripRef.current : null);
  }, [spotifyOn]);

  /* Connect click → rebuild the iframe now (already-logged-in case) and
     again when focus returns from the login popup (fresh-login case). */
  useEffect(() => {
    let pendingFocus = false;
    const rebuild = () => { destroyEmbed(); setFreshNonce(n => n + 1); };
    const onConnect = () => { pendingFocus = true; rebuild(); };
    const onFocus = () => { if (pendingFocus) { pendingFocus = false; rebuild(); } };
    window.addEventListener('spotify:connect-click', onConnect);
    window.addEventListener('focus', onFocus);
    return () => {
      window.removeEventListener('spotify:connect-click', onConnect);
      window.removeEventListener('focus', onFocus);
    };
  }, []);

  useEffect(() => {
    if (!spotifyOn) {
      setEmbedStateListener(null);
      destroyEmbed();
      setExt(null);
      if (clipGraceTimer.current) { clearTimeout(clipGraceTimer.current); clipGraceTimer.current = null; }
      return;
    }
    setEmbedStateListener((s) => {
      lastUpdate.current = Date.now();
      if (!viaSpotify.current) {
        // Zombie guard: the embed sounding while we're NOT routing through it
        // means a late start slipped past a fallback's pause (same swallowed-
        // command race as play). Kill it — exactly one source may sound.
        if (!s.paused) embedPause();
        return;
      }
      if (!s.paused) embedStarted.current = true;
      // Clip-length duration while sounding = the iframe can't see a Spotify
      // login yet. Don't bail straight to Deezer (that races the user before
      // they can tap the widget's ▶ to grant access). Arm a one-shot grace
      // timer and keep the clip sounding + the widget clickable. If a login is
      // granted meanwhile, the embed re-reports a FULL-length duration (which
      // skips this branch), embedPrev catches up, and the timer's re-check is a
      // no-op. Only a still-clip at expiry falls back — for THIS track alone.
      if (!s.paused && s.duration > 0 && s.duration <= 31500) {
        if (!clipGraceTimer.current) {
          clipGraceTimer.current = setTimeout(() => {
            clipGraceTimer.current = null;
            const dur = embedPrev.current?.duration ?? s.duration;
            if (viaSpotify.current && dur > 0 && dur <= 31500) clipBail.current?.();
          }, CLIP_GRACE_MS);
        }
        return;
      }
      // The widget is visible UI now — if the user plays/pauses INSIDE it,
      // mirror that into the store (guarded so an in-flight command of our
      // own doesn't get echoed back and cancelled).
      if (
        embedStarted.current &&
        Date.now() - lastCmd.current > 800 &&
        !s.paused !== isPlayingRef.current
      ) {
        setIsPlaying(!s.paused);
      }
      const prev = embedPrev.current;
      embedPrev.current = { position: s.position, duration: s.duration };
      // Feed the card's progress bar (seconds) without store re-renders.
      setExt({
        pos: s.position / 1000,
        dur: s.duration / 1000,
        seek: (sec) => embedSeek(sec),
      });
      // "Track finished" signatures (the embed is inconsistent here):
      //  a) pause at/near the end (or rewind to 0) after having been near it;
      //  b) position PINS at the duration while isPaused stays false —
      //     observed live: `▶ 29.7/29.7` repeating forever, no pause event.
      const endedByPause =
        prev && s.paused &&
        prev.duration > 0 && prev.position > prev.duration - 5000 &&
        (s.position === 0 || s.position >= s.duration - 800);
      const endedByPin =
        prev && !s.paused &&
        s.duration > 0 && s.position >= s.duration - 300 &&
        prev.position === s.position;
      if (endedByPause || endedByPin) {
        embedPrev.current = null; // fire once per track
        onEndedRef.current();
      }
    });
    return () => setEmbedStateListener(null);
  }, [spotifyOn]);

  /* ---------- sync audio src + autoplay when track changes ---------- */
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    setAutoplayBlocked(false);
    if (viaSpotify.current) embedPause(); // old song must not keep sounding
    viaSpotify.current = false;
    embedPrev.current = null;
    // NB: do NOT clear ext here. Clearing it flips embedMode false for the whole
    // async Spotify resolve, so the card's reserved slot unmounts and the now-row
    // flashes in — the visible "Spotify window keeps detaching" flicker. ext is
    // cleared only when we actually commit to Deezer (playPreview / bail), never
    // on a Spotify→Spotify handoff.

    const playPreview = () => {
      setExt(null);   // committing to Deezer → the strip leaves the slot now
      if (!track?.preview) {
        audio.pause();
        audio.removeAttribute('src');
        audio.load();
        return;
      }
      audio.src = track.preview;
      audio.load();
      // Always autoplay a newly loaded track; a rejected play() means the
      // browser wants a user gesture first — surfaced on the play button
      // (and isPlaying goes false so the card shows PLAY, not a silent pause).
      audio.play().catch(() => { setAutoplayBlocked(true); setIsPlaying(false); });
    };

    // Not connected: Deezer previews are the sound source. (When connected but
    // logged out, we still ATTEMPT the embed every track — the grace window in
    // the state listener handles the clip case per track, so a Spotify login
    // granted at any point is picked up on the very next track.)
    if (!(spotifyOn && track)) {
      playPreview();
      return;
    }

    // Hold the embed slot open with a loading clock BEFORE the async resolve,
    // so embedMode stays true and the reserved slot never unmounts during the
    // handoff. Refreshed with the real clock once playback reports in.
    setExt({ pos: 0, dur: 0, seek: (sec) => embedSeek(sec) });

    // Silence the <audio> NOW, before the async Spotify resolve — leaving the
    // OLD track's preview sounding while the embed spins up is the
    // double-audio echo. The fallback path re-arms it with the new track.
    audio.pause();
    audio.removeAttribute('src');
    audio.load();

    let cancelled = false;
    let stallTimer: ReturnType<typeof setTimeout> | undefined;
    embedStarted.current = false;
    clipBail.current = null;
    // A grace timer armed for the previous track must not bail this one.
    if (clipGraceTimer.current) { clearTimeout(clipGraceTimer.current); clipGraceTimer.current = null; }
    resolveSpotifyUri(track.artist, track.title)
      .then((uri) => (uri && !cancelled ? embedPlay(uri) : false))
      .then((ok) => {
        if (cancelled) return;
        if (ok) {
          viaSpotify.current = true;
          lastCmd.current = Date.now();
          setIsPlaying(true);
          setExt({ pos: 0, dur: 0, seek: (sec) => embedSeek(sec) });
          // Watchdog: embedPlay "succeeding" only means the command was
          // accepted — the iframe may still refuse (no gesture yet) or just
          // be slow (full tracks init DRM and can take >5s). LIVENESS-aware:
          // if the embed is sending updates it's loading, give it 12s total;
          // dead silence bails at 5s. Never bail once sound has started.
          const startedAt = Date.now();
          const bail = () => {
            if (cancelled || embedStarted.current) return;
            embedPause(); // cancel retries — a late start must not double-play
            viaSpotify.current = false;
            embedPrev.current = null;
            setExt(null);
            playPreview();
          };
          // Grace lapsed still-clip: fall back to the Deezer preview for THIS
          // track only. No session flag — the next track attempts the embed
          // again, so a Spotify login granted later is picked up automatically.
          clipBail.current = () => {
            clipBail.current = null;
            if (cancelled) return;
            embedPause();
            viaSpotify.current = false;
            embedPrev.current = null;
            setExt(null);
            playPreview();
          };
          stallTimer = setTimeout(() => {
            if (cancelled || embedStarted.current) return;
            const alive = lastUpdate.current >= startedAt - 250;
            if (alive) stallTimer = setTimeout(bail, 7000);
            else bail();
          }, 5000);
        } else {
          playPreview();
        }
      })
      .catch(() => { if (!cancelled) playPreview(); });
    return () => {
      cancelled = true;
      if (stallTimer) clearTimeout(stallTimer);
      if (clipGraceTimer.current) { clearTimeout(clipGraceTimer.current); clipGraceTimer.current = null; }
    };
    // freshNonce: bumped after "Connect Spotify" so a FRESH iframe (which can
    // see the new login) replaces the stale logged-out one for this track.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [track?.id, track?.preview, spotifyOn, freshNonce]);

  /* ---------- prefetch Spotify uris for the WHOLE queue ----------
     GENTLE sweep — one lookup at a time, 1.5s apart, nearest tracks first —
     so any row the user jumps to resolves from the client cache. The pace
     matters: an aggressive burst rate-limited the whole app at Spotify
     (429 with a multi-HOUR Retry-After — every user lost full songs), so
     the sweep also hard-stops the moment a rate limit is seen. */
  useEffect(() => {
    if (!spotifyOn || tracks.length === 0) return;
    let stop = false;
    const start = Math.max(0, Math.min(trackIdx, tracks.length - 1));
    const order = [...tracks.slice(start + 1), ...tracks.slice(0, start + 1)];
    (async () => {
      for (const t of order) {
        if (stop || isSpotifyRateLimited()) return;
        await resolveSpotifyUri(t.artist, t.title).catch(() => null);
        if (stop) return;
        await new Promise(r => setTimeout(r, 1500));
      }
    })();
    return () => { stop = true; };
    // trackIdx deliberately NOT a dep: the sweep covers the full queue once —
    // re-running it on every song change would just churn cache hits.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spotifyOn, tracks]);

  /* ---------- also nudge the immediate next track on every change ----------
     (cache hit if the sweep already covered it — effectively free) */
  useEffect(() => {
    if (!spotifyOn || tracks.length < 2) return;
    const next = tracks[(trackIdx + 1) % tracks.length];
    if (next) prefetchSpotifyUri(next.artist, next.title);
  }, [spotifyOn, tracks, trackIdx]);

  /* ---------- sync isPlaying with whichever backend is sounding ---------- */
  useEffect(() => {
    if (viaSpotify.current) {
      lastCmd.current = Date.now();
      // resume() only un-pauses a track that has already begun; if the iframe
      // blocked autoplay, this user-gesture-driven play must call play().
      if (isPlaying) (embedStarted.current ? embedResume() : embedStart());
      else embedPause();
      return;
    }
    const audio = audioRef.current;
    if (!audio) return;
    if (isPlaying) audio.play().catch(() => setIsPlaying(false));
    else           audio.pause();
  }, [isPlaying, setIsPlaying]);

  /* ---------- MediaSession: lock-screen metadata + transport ---------- */
  useEffect(() => {
    if (!('mediaSession' in navigator)) return;
    if (!track) {
      navigator.mediaSession.metadata = null;
      return;
    }
    navigator.mediaSession.metadata = new MediaMetadata({
      title:  track.title,
      artist: track.artist,
      album:  track.album,
      artwork: track.image
        ? [{ src: track.image, sizes: '1000x1000', type: 'image/jpeg' }]
        : [],
    });
  }, [track]);

  useEffect(() => {
    if (!('mediaSession' in navigator)) return;
    const ms = navigator.mediaSession;
    ms.setActionHandler('play',          () => setIsPlaying(true));
    ms.setActionHandler('pause',         () => setIsPlaying(false));
    ms.setActionHandler('nexttrack',     () => nextTrack());
    ms.setActionHandler('previoustrack', () => prevTrack());
    return () => {
      ms.setActionHandler('play', null);
      ms.setActionHandler('pause', null);
      ms.setActionHandler('nexttrack', null);
      ms.setActionHandler('previoustrack', null);
    };
  }, [setIsPlaying, nextTrack, prevTrack]);

  useEffect(() => {
    if (!('mediaSession' in navigator)) return;
    navigator.mediaSession.playbackState = isPlaying ? 'playing' : 'paused';
  }, [isPlaying]);

  /* ---------- end of track: advance, or reshuffle the pool ---------- */
  const onEnded = () => {
    if (tracks.length === 0) return;
    if (tracks.length === 1) {
      const audio = audioRef.current;
      if (audio && !viaSpotify.current) {
        audio.currentTime = 0;
        audio.play().catch(() => setAutoplayBlocked(true));
      }
      return;
    }
    // The store decides the next index (shuffle-aware) or hands off to the
    // end-of-queue behavior (next genre for a pairing, loop for the library).
    trackEnded();
  };
  onEndedRef.current = onEnded;

  // The mini pill shows wherever neither the Circle card nor the World's
  // docked playlist panel is the player UI.
  const showMini =
    pathname !== '/' && pathname !== '/circle' && pathname !== '/world' && status === 'ready' && !!track;

  return (
    <>
      <audio
        ref={(el) => { audioRef.current = el; audioBus.el = el; }}
        preload="auto"
        playsInline
        onPlay={() => { setIsPlaying(true); setAutoplayBlocked(false); }}
        onPause={() => setIsPlaying(false)}
        onEnded={onEnded}
      />

      {/* Spotify strip — the embed's home while connected. It stays mounted
          for the WHOLE connected session (not gated on hasTrack) so the iframe
          is never re-parented / reloaded between tracks. Seated over the
          card's reserved slot while the embed is the sounding source (visible,
          clickable — it IS the progress row); otherwise parked OFF-SCREEN at
          full opacity, still playing/logged-in by every check the iframe can
          run. Never "tucked behind the card": `.frame`'s isolation:isolate
          makes the card's z-index unable to occlude a root-level strip, so
          the tuck rendered ON TOP of the playlist (the floating-widget bug). */}
      {spotifyOn && (
        <div
          className={slotRect
            ? 'spotify-strip spotify-strip--slot'
            : 'spotify-strip spotify-strip--parked'}
          style={slotRect ? { left: slotRect.left, top: slotRect.top, width: slotRect.width } : undefined}
          ref={stripRef}
          aria-label="Spotify player"
        />
      )}

      {showMini && (
        <div className="mini-player" role="region" aria-label={STR.player.nowPlaying}>
          {track.image
            ? <img className="mini-player__cover" src={track.image} alt="" />
            : <div className="mini-player__cover" />}
          <div className="mini-player__meta">
            <div className="mini-player__title">{track.title}</div>
            <div className="mini-player__artist">{track.artist}</div>
          </div>
          <button className="mini-player__btn" onClick={togglePlay} aria-label={STR.card.playPause}>
            {isPlaying
              ? <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14"><path d="M8 7h3v10H8zm5 0h3v10h-3z" /></svg>
              : <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14"><path d="M9.5 7.5v9L16 12 9.5 7.5z" /></svg>}
          </button>
          <button className="mini-player__btn" onClick={nextTrack} aria-label={STR.card.next}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" width="14" height="14">
              <path d="M5 6l10 6-10 6V6z" /><path d="M19 6v12" />
            </svg>
          </button>
          <Link className="mini-player__go" href="/circle" title={STR.player.openInCircle}>◐</Link>
        </div>
      )}
    </>
  );
}
