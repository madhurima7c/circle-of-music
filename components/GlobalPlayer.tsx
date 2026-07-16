'use client';

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useStore } from '@/lib/store';
import { STR } from '@/lib/strings';
import { audioBus } from '@/lib/audio-bus';
import {
  spotifyEnabled, subscribeSpotify, isSpotifyConnected, handleSpotifyCallback,
  ensurePlayer, findTrackUri, playUri, sdkPause, sdkResume,
} from '@/lib/spotify';

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
 * Spotify mode (env-gated, opt-in): when the user has connected Spotify and
 * the Web Playback SDK device is ready, each track is searched on Spotify
 * and played in FULL through the SDK; the <audio> preview stays silent for
 * that track. Any miss (track not on Spotify, non-Premium account, SDK
 * failure) falls back to the 30s Deezer preview — never dead air.
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

  /* ---------- Spotify (full songs) ---------- */
  const spotifyOn = useSyncExternalStore(subscribeSpotify, isSpotifyConnected, serverFalse);
  const [spotifyDevice, setSpotifyDevice] = useState<string | null>(null);
  // True while the CURRENT track is sounding through the SDK, so the
  // isPlaying effect and end-of-track logic route to the right backend.
  const viaSpotify = useRef(false);
  const sdkPrev = useRef<{ position: number; duration: number } | null>(null);
  const onEndedRef = useRef<() => void>(() => {});

  useEffect(() => { handleSpotifyCallback(); }, []);

  useEffect(() => {
    if (!spotifyEnabled || !spotifyOn) { setSpotifyDevice(null); return; }
    let alive = true;
    ensurePlayer((s) => {
      if (!s) return;
      const prev = sdkPrev.current;
      sdkPrev.current = { position: s.position, duration: s.duration };
      // "Track finished" signature: SDK rewinds to a paused position 0
      // after having been near the end.
      if (
        viaSpotify.current && prev && s.paused && s.position === 0 &&
        prev.duration > 0 && prev.position > prev.duration - 5000
      ) {
        onEndedRef.current();
      }
    }).then((id) => { if (alive) setSpotifyDevice(id); });
    return () => { alive = false; };
  }, [spotifyOn]);

  /* ---------- sync audio src + autoplay when track changes ---------- */
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    setAutoplayBlocked(false);
    viaSpotify.current = false;

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
      // browser wants a user gesture first — surfaced on the play button.
      audio.play().catch(() => setAutoplayBlocked(true));
    };

    if (!(spotifyOn && spotifyDevice && track)) {
      playPreview();
      return;
    }

    let cancelled = false;
    findTrackUri(track.artist, track.title)
      .then((uri) => (uri && !cancelled ? playUri(uri) : false))
      .then((ok) => {
        if (cancelled) return;
        if (ok) {
          viaSpotify.current = true;
          setIsPlaying(true);
          audio.pause();
          audio.removeAttribute('src');
          audio.load();
        } else {
          playPreview();
        }
      })
      .catch(() => { if (!cancelled) playPreview(); });
    return () => { cancelled = true; };
  }, [track?.id, track?.preview, spotifyOn, spotifyDevice]);  // eslint-disable-line react-hooks/exhaustive-deps

  /* ---------- sync isPlaying with whichever backend is sounding ---------- */
  useEffect(() => {
    if (viaSpotify.current) {
      if (isPlaying) sdkResume();
      else sdkPause();
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
    pathname !== '/circle' && pathname !== '/world' && status === 'ready' && !!track;

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
