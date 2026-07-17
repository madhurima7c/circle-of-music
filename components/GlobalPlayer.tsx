'use client';

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useStore } from '@/lib/store';
import { STR } from '@/lib/strings';
import { audioBus } from '@/lib/audio-bus';
import {
  subscribeSpotify, isSpotifyConnected, handleSpotifyCallback,
  resolveSpotifyUri, prefetchSpotifyUri,
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

export function GlobalPlayer() {
  const {
    tracks, trackIdx, isPlaying, status,
    togglePlay, setIsPlaying, nextTrack, prevTrack, shuffleTracks,
    setAutoplayBlocked,
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

  useEffect(() => { handleSpotifyCallback(); }, []);

  useEffect(() => { isPlayingRef.current = isPlaying; }, [isPlaying]);

  /* The visible Spotify strip is the embed's home while connected. Attach
     BEFORE the track effect below so a new controller lands inside it. */
  const hasTrack = !!track;
  useEffect(() => {
    attachEmbedHost(spotifyOn && hasTrack ? stripRef.current : null);
  }, [spotifyOn, hasTrack]);

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
      audioBus.ext = null;
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
      audioBus.ext = {
        pos: s.position / 1000,
        dur: s.duration / 1000,
        seek: (sec) => embedSeek(sec),
      };
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
    audioBus.ext = null;

    const playPreview = () => {
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

    if (!(spotifyOn && track)) {
      playPreview();
      return;
    }

    // Silence the <audio> NOW, before the async Spotify resolve — leaving the
    // OLD track's preview sounding while the embed spins up is the
    // double-audio echo. The fallback path re-arms it with the new track.
    audio.pause();
    audio.removeAttribute('src');
    audio.load();

    let cancelled = false;
    let stallTimer: ReturnType<typeof setTimeout> | undefined;
    embedStarted.current = false;
    resolveSpotifyUri(track.artist, track.title)
      .then((uri) => (uri && !cancelled ? embedPlay(uri) : false))
      .then((ok) => {
        if (cancelled) return;
        if (ok) {
          viaSpotify.current = true;
          lastCmd.current = Date.now();
          setIsPlaying(true);
          audioBus.ext = { pos: 0, dur: 0, seek: (sec) => embedSeek(sec) };
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
            audioBus.ext = null;
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
    return () => { cancelled = true; if (stallTimer) clearTimeout(stallTimer); };
    // freshNonce: bumped after "Connect Spotify" so a FRESH iframe (which can
    // see the new login) replaces the stale logged-out one for this track.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [track?.id, track?.preview, spotifyOn, freshNonce]);

  /* ---------- prefetch Spotify uris for the WHOLE queue ----------
     Staggered sweep (batches of 4, 400ms apart), nearest tracks first, so
     ANY row the user jumps to — not just the next one — resolves from the
     client cache instantly. Restarts when the queue changes; the cache
     makes overlapping sweeps free. */
  useEffect(() => {
    if (!spotifyOn || tracks.length === 0) return;
    let stop = false;
    const start = Math.max(0, Math.min(trackIdx, tracks.length - 1));
    const order = [...tracks.slice(start + 1), ...tracks.slice(0, start + 1)];
    (async () => {
      for (let i = 0; i < order.length && !stop; i += 4) {
        await Promise.all(
          order.slice(i, i + 4).map(t => resolveSpotifyUri(t.artist, t.title).catch(() => null)),
        );
        if (!stop) await new Promise(r => setTimeout(r, 400));
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
    if (trackIdx >= tracks.length - 1) shuffleTracks();  // replay the same pool from the top
    else nextTrack();
    setIsPlaying(true);
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

      {/* Spotify strip — the embed lives HERE, visible, while connected.
          It must be real, clickable UI: the browser only lets the iframe see
          the user's Spotify login (full songs vs 30s clips) after the user
          has interacted with Spotify's own widget. One tap on its ▶ blesses
          the whole session; our card controls keep driving it afterwards. */}
      {spotifyOn && hasTrack && (
        <div className="spotify-strip" ref={stripRef} aria-label="Spotify player" />
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
