'use client';

import { useEffect, useRef } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useStore } from '@/lib/store';

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
 */
export function GlobalPlayer() {
  const {
    tracks, trackIdx, isPlaying, status,
    togglePlay, setIsPlaying, nextTrack, prevTrack, shuffleTracks,
    setAutoplayBlocked,
  } = useStore();
  const track = tracks[trackIdx];
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const pathname = usePathname();

  /* ---------- sync audio src + autoplay when track changes ---------- */
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    setAutoplayBlocked(false);
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
  }, [track?.id, track?.preview]);  // eslint-disable-line react-hooks/exhaustive-deps

  /* ---------- sync isPlaying with the audio element ---------- */
  useEffect(() => {
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

  /* ---------- end of preview: advance, or reshuffle the pool ---------- */
  const onEnded = () => {
    if (tracks.length === 0) return;
    if (tracks.length === 1) {
      const audio = audioRef.current;
      if (audio) {
        audio.currentTime = 0;
        audio.play().catch(() => setAutoplayBlocked(true));
      }
      return;
    }
    if (trackIdx >= tracks.length - 1) shuffleTracks();  // replay the same pool from the top
    else nextTrack();
    setIsPlaying(true);
  };

  // The mini pill shows wherever the Circle's center card isn't the player UI.
  const showMini = pathname !== '/circle' && status === 'ready' && !!track;

  return (
    <>
      <audio
        ref={audioRef}
        preload="auto"
        playsInline
        onPlay={() => { setIsPlaying(true); setAutoplayBlocked(false); }}
        onPause={() => setIsPlaying(false)}
        onEnded={onEnded}
      />

      {showMini && (
        <div className="mini-player" role="region" aria-label="Now playing">
          {track.image
            ? <img className="mini-player__cover" src={track.image} alt="" />
            : <div className="mini-player__cover" />}
          <div className="mini-player__meta">
            <div className="mini-player__title">{track.title}</div>
            <div className="mini-player__artist">{track.artist}</div>
          </div>
          <button className="mini-player__btn" onClick={togglePlay} aria-label="Play / pause">
            {isPlaying
              ? <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14"><path d="M8 7h3v10H8zm5 0h3v10h-3z" /></svg>
              : <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14"><path d="M9.5 7.5v9L16 12 9.5 7.5z" /></svg>}
          </button>
          <button className="mini-player__btn" onClick={nextTrack} aria-label="Next">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" width="14" height="14">
              <path d="M5 6l10 6-10 6V6z" /><path d="M19 6v12" />
            </svg>
          </button>
          <Link className="mini-player__go" href="/circle" title="Open in Circle of Music">◐</Link>
        </div>
      )}
    </>
  );
}
