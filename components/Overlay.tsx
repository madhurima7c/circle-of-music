'use client';

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import { useStore } from '@/lib/store';
import { COUNTRIES, GENRES, formatDuration } from '@/lib/data';
import { illustrationGradientPair } from '@/lib/illustration';
import { trackLinks } from '@/lib/links';
import { STR } from '@/lib/strings';
import { toggleFind, useIsFind, useFinds } from '@/lib/library';
import { storyFor, releaseYear } from '@/lib/stories';
import { audioBus } from '@/lib/audio-bus';
import { LikedSongs } from '@/components/Library';
import {
  spotifyEnabled, subscribeSpotify, isSpotifyConnected,
  connectSpotify, disconnectSpotify,
} from '@/lib/spotify';
import { backColor } from '@/lib/covers';

gsap.registerPlugin(useGSAP);

/**
 * GSAP `.from()` tweens set their start state immediately, then animate back
 * via requestAnimationFrame. If rAF never runs — a background/hidden tab, or
 * the user honoring reduced-motion — the tween is stranded and the element
 * stays invisible. So only animate when the page is actually visible and
 * motion is welcome; otherwise elements render at their natural (visible)
 * CSS state with no entrance.
 */
const canAnimate = () =>
  typeof document !== 'undefined' &&
  !document.hidden &&
  !window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export function Title() {
  return (
    <Link
      href="/"
      className="title absolute left-1/2 top-[38px] z-30 -translate-x-1/2 text-[38px] text-[var(--accent)] select-none no-underline"
      title={STR.circle.backToHub}
    >
      {STR.circle.title}
    </Link>
  );
}

export function Heart() {
  const { status } = useStore();
  return (
    <div
      className="absolute left-1/2 top-1/2 z-[6] -translate-x-1/2 -translate-y-1/2 text-[13px] transition-opacity duration-300"
      style={{ opacity: status === 'empty' ? 1 : 0 }}
    >
      &lt;3
    </div>
  );
}

export function PopulatingText() {
  // The new CenterStack shows its own pending pane with a gradient; this
  // tiny inline label is only used in the brief `empty` → `populating`
  // transition before the center pane is rendered.
  const { status } = useStore();
  return (
    <div
      className="absolute left-1/2 top-1/2 z-[7] flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-2 transition-opacity duration-500"
      style={{
        fontFamily: 'var(--font-sans)',
        fontWeight: 300,
        fontSize: 16,
        color: 'rgba(0,0,0,0.45)',
        letterSpacing: '0.01em',
        opacity: status === 'populating' ? 0 : 0,        // hidden — CenterStack handles loading UI
        pointerEvents: 'none',
      }}
    >
      <div
        className="size-4 animate-spin rounded-full border-[1.5px] border-black/20"
        style={{ borderTopColor: 'rgba(0,0,0,0.5)' }}
      />
      <span>Populating music</span>
    </div>
  );
}

/**
 * Connector lines from each wheel toward the center card — a live element,
 * not a static rule:
 *   · populating → the line GROWS from the wheel-card edge toward the
 *     center card (a loading indicator, restated each cycle);
 *   · playing    → the line becomes a plucked string: a few superposed
 *     sine harmonics with pinned ends, danced by a rAF loop;
 *   · paused     → the string settles flat; empty/error → hidden.
 * Drawn at z-index −1 so the wheel canvas and center card paint over the
 * inner ends. The wave is synthesized (not an audio analyser — the Deezer
 * CDN previews would taint a WebAudio graph and kill playback).
 */
const WAVE_W = 400;  // synth domain units; canvas maps them to the real span
/* The string splits into strands while music plays: every strand traces the
 * SAME waveform scaled by k (−1…1), so they fan apart in the middle and
 * rejoin at the pinned ends — the "split string" look. Rendered as a point
 * cloud (thousands of jittered dots, not strokes). Color: ONE gradient runs
 * across the whole stage — the country card's spine color on the far left
 * blending into the genre card's on the far right (the center card hides
 * the seam) — and each strand carries a lighter/darker shade of that local
 * gradient color, so all the shades of both posters appear in the fan. */
const STRAND_KS = [
  -1.0, -0.78, -0.56, -0.34, -0.15,
  0.15, 0.34, 0.56, 0.78, 1.0,
  0,  // center — always visible, drawn on top
];
const WAVE_H = 56;

type Rgb = [number, number, number];
function hexToRgb(hex: string): Rgb {
  const h = hex.replace('#', '');
  return [
    parseInt(h.slice(0, 2), 16) || 0,
    parseInt(h.slice(2, 4), 16) || 0,
    parseInt(h.slice(4, 6), 16) || 0,
  ];
}
function mixRgb(a: Rgb, b: Rgb, t: number): Rgb {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}
/** t > 0 lightens toward white, t < 0 deepens toward black. */
function shadeRgb(c: Rgb, t: number): Rgb {
  return t >= 0 ? mixRgb(c, [255, 255, 255], t) : mixRgb(c, [0, 0, 0], -t);
}

export function ConnectorTags() {
  const { status, isPlaying, countryIdx, genreIdx } = useStore();
  const leftCv  = useRef<HTMLCanvasElement | null>(null);
  const rightCv = useRef<HTMLCanvasElement | null>(null);
  const live = useRef({ playing: false });
  const ampRef = useRef(0); // persists across color changes — no wave reset
  live.current.playing = status === 'ready' && isPlaying;

  const leftColor  = backColor('countries', COUNTRIES[countryIdx]);
  const rightColor = backColor('genres', GENRES[genreIdx]);

  useEffect(() => {
    const from = hexToRgb(leftColor);
    const to   = hexToRgb(rightColor);
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const STEPS = 140;

    // Left canvas spans gradient t 0→0.5, right t 0.5→1 — one continuous
    // blend across the stage; the center card covers the join.
    const sides = [
      { cv: leftCv.current,  phase: 0,   t0: 0,   t1: 0.5 },
      { cv: rightCv.current, phase: 2.1, t0: 0.5, t1: 1 },
    ];

    const fit = () => sides.forEach((s) => {
      if (!s.cv) return;
      const r = s.cv.getBoundingClientRect();
      s.cv.width  = Math.max(1, Math.round(r.width * dpr));
      s.cv.height = Math.max(1, Math.round(r.height * dpr));
    });
    fit();
    const ro = new ResizeObserver(fit);
    sides.forEach((s) => s.cv && ro.observe(s.cv));

    // Palette precomputed per (strand, x-step): local gradient color shaded
    // lighter/darker by the strand's k — the poster's tints and deeps.
    const palettes = sides.map((s) =>
      STRAND_KS.map((k) =>
        Array.from({ length: STEPS + 1 }, (_, j) => {
          const gt = s.t0 + (s.t1 - s.t0) * (j / STEPS);
          const c = shadeRgb(mixRgb(from, to, gt), k * 0.45);
          return `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})`;
        }),
      ),
    );

    // Rest state — the single center strand as a quiet dotted line.
    const drawFlat = () => {
      sides.forEach((s, si) => {
        const ctx = s.cv?.getContext('2d');
        if (!s.cv || !ctx) return;
        const W = s.cv.width, H = s.cv.height, mid = H / 2;
        ctx.clearRect(0, 0, W, H);
        const pal = palettes[si][STRAND_KS.indexOf(0)];
        ctx.globalAlpha = 0.9;
        for (let j = 0; j <= STEPS; j++) {
          ctx.fillStyle = pal[j];
          ctx.fillRect((j / STEPS) * W, mid, dpr, dpr);
        }
      });
    };

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      drawFlat();
      return () => ro.disconnect();
    }

    let raf = 0;
    let wasFlat = false;
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      const target = live.current.playing ? 1 : 0;
      ampRef.current += (target - ampRef.current) * 0.05;
      const amp = ampRef.current;
      if (amp < 0.012) {
        ampRef.current = 0;
        if (!wasFlat) { drawFlat(); wasFlat = true; }
        return;
      }
      wasFlat = false;
      const t = now / 1000;
      const fanAlpha = Math.min(1, amp * 1.4) * 0.8;

      sides.forEach((s, si) => {
        const ctx = s.cv?.getContext('2d');
        if (!s.cv || !ctx) return;
        const W = s.cv.width, H = s.cv.height, mid = H / 2;
        ctx.clearRect(0, 0, W, H);
        const unit = H / WAVE_H; // keep the old 56-unit proportions
        for (let i = 0; i < STRAND_KS.length; i++) {
          const k = STRAND_KS[i];
          const isCenter = k === 0;
          const baseAlpha = isCenter ? 0.95 : fanAlpha;
          const pal = palettes[si][i];
          for (let j = 0; j <= STEPS; j++) {
            const u = j / STEPS;
            const wx = u * WAVE_W;              // synth domain
            // Soft envelope, not hard-pinned: the card edges hide the line
            // ends (z −1), and only the outer slice of each connector is
            // visible — it should already be fanned there, like the
            // reference's homogeneous point field.
            const env = 0.35 + 0.65 * Math.sin(u * Math.PI);
            const wave = env * amp * (
              Math.sin(wx * 0.028 + t * 2.7 + s.phase) * 8.4 +
              Math.sin(wx * 0.013 - t * 1.8 + s.phase) * 6.3 +
              Math.sin(wx * 0.061 + t * 4.2 + s.phase) * 3.3
            );
            const x = u * W;
            const y = mid + k * wave * unit;
            const scatter = (2 + 4 * env) * amp * dpr;
            ctx.fillStyle = pal[j];
            for (let d = 0; d < 3; d++) {
              ctx.globalAlpha = baseAlpha * (0.25 + Math.random() * 0.75);
              const sz = (0.5 + Math.random() * 0.9) * dpr;
              ctx.fillRect(
                x + (Math.random() - 0.5) * 4 * dpr,
                y + (Math.random() - 0.5) * scatter * (isCenter ? 0.6 : 1.6),
                sz, sz,
              );
            }
          }
        }
        ctx.globalAlpha = 1;
      });
    };
    raf = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); };
  }, [leftColor, rightColor]);

  const state =
    status === 'populating' ? 'loading' :
    status === 'ready'      ? 'ready'   : 'hidden';

  return (
    <>
      <canvas
        ref={leftCv}
        className="connector connector--left"
        data-state={state}
        aria-hidden
      />
      <canvas
        ref={rightCv}
        className="connector connector--right"
        data-state={state}
        aria-hidden
      />
    </>
  );
}

/* ================================================================
 *  CenterStack — Maddy's center playlist card (src/center.js +
 *  index.html on the Maddy branch), ported to React 1:1.
 *
 *  One portrait card (300×400) that switches views via
 *  data-center-view:
 *   - pending  → populating/error: gradient pane with country—genre
 *     rail and status copy.
 *   - playback → chips header, transport controls, now-playing row
 *     (70px cover + meta), and a scrollable full "Up next:" queue.
 *
 *  Behavior mirrors CenterPlayer: tracks autoplay when loaded (a
 *  blocked autoplay pulses the play button), the shuffle button
 *  re-orders the queue around the current track, and when the last
 *  preview ends the pool reshuffles and replays from the top.
 * ================================================================ */
/** Progress readout — polls the shared <audio> directly (see audio-bus). */
export function ProgressBar({ trackDuration }: { trackDuration: number | null }) {
  const [pos, setPos] = useState(0);
  const [dur, setDur] = useState(0);
  useEffect(() => {
    const tick = () => {
      // The hidden Spotify embed's clock wins while it is the one sounding.
      const ext = audioBus.ext;
      if (ext && ext.dur > 0) {
        setPos(ext.pos);
        setDur(ext.dur);
        return;
      }
      const el = audioBus.el;
      if (el && isFinite(el.duration) && el.duration > 0) {
        setPos(el.currentTime);
        setDur(el.duration);
      } else {
        setPos(0);
        setDur(0);
      }
    };
    tick();
    const t = setInterval(tick, 500);
    return () => clearInterval(t);
  }, []);

  const total = dur || trackDuration || 0;
  const pct = total > 0 ? Math.min(100, (pos / total) * 100) : 0;

  return (
    <div className="center__progress">
      <span className="center__time tabular">{formatDuration(pos)}</span>
      <div
        className="center__bar"
        onClick={(e) => {
          if (!dur) return;
          const r = e.currentTarget.getBoundingClientRect();
          const t = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * dur;
          const ext = audioBus.ext;
          if (ext && ext.dur > 0) { ext.seek(t); return; }
          const el = audioBus.el;
          if (el) el.currentTime = t;
        }}
        role="slider"
        aria-label="Seek"
        aria-valuemin={0}
        aria-valuemax={Math.round(total)}
        aria-valuenow={Math.round(pos)}
      >
        <div className="center__bar-fill" style={{ width: `${pct}%` }} />
      </div>
      <span className="center__time tabular">{formatDuration(total)}</span>
    </div>
  );
}

/* Compact brand marks for the "listen in" menu. */
export function BrandIcon({ kind }: { kind: 'spotify' | 'apple' | 'youtube' | 'deezer' }) {
  if (kind === 'spotify') {
    return (
      <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden>
        <circle cx="12" cy="12" r="11" fill="#1DB954" />
        <path d="M6.5 9.6c3.6-1.1 7.6-.7 10.6 1" stroke="#fff" strokeWidth="1.7" fill="none" strokeLinecap="round" />
        <path d="M7.2 12.6c3-.9 6.2-.5 8.7.9" stroke="#fff" strokeWidth="1.5" fill="none" strokeLinecap="round" />
        <path d="M7.9 15.4c2.3-.7 4.8-.4 6.8.7" stroke="#fff" strokeWidth="1.3" fill="none" strokeLinecap="round" />
      </svg>
    );
  }
  if (kind === 'apple') {
    return (
      <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden>
        <rect x="1" y="1" width="22" height="22" rx="5.5" fill="#FA2D48" />
        <path d="M16.6 5.8 9.8 7.2v7.1a2.3 2.3 0 1 0 1.4 2.1V9.6l4-.85v4.15a2.3 2.3 0 1 0 1.4 2.1z" fill="#fff" />
      </svg>
    );
  }
  if (kind === 'youtube') {
    return (
      <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden>
        <rect x="1" y="4.5" width="22" height="15" rx="4" fill="#FF0000" />
        <path d="M10 9v6l5.4-3z" fill="#fff" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden>
      <g fill="#A238FF">
        <rect x="2" y="15" width="4.4" height="3" rx="0.6" />
        <rect x="7.4" y="11.5" width="4.4" height="6.5" rx="0.6" />
        <rect x="12.8" y="8" width="4.4" height="10" rx="0.6" />
        <rect x="18.2" y="4.5" width="4.4" height="13.5" rx="0.6" />
      </g>
    </svg>
  );
}

export function CenterStack() {
  const {
    tracks, trackIdx, status, isPlaying, countryName, genreIdx,
    togglePlay, nextTrack, prevTrack, shuffleTracks, autoplayBlocked,
    setTrackIdx, setIsPlaying,
  } = useStore();
  const spotifyOn = useSyncExternalStore(subscribeSpotify, isSpotifyConnected, () => false);
  const country = countryName || '';
  const genre   = GENRES[genreIdx]      ?? '';
  const track   = tracks[trackIdx];

  // Share popover state (the player card no longer flips).
  const [shareOpen, setShareOpen] = useState(false);
  // The share menu renders in a body-level portal (fixed overlay) so the
  // card's overflow:hidden can never clip it — anchored to the button.
  const shareBtnRef = useRef<HTMLButtonElement | null>(null);
  const [shareAt, setShareAt] = useState<{ x: number; y: number } | null>(null);
  const toggleShare = () => {
    if (!shareOpen && shareBtnRef.current) {
      const r = shareBtnRef.current.getBoundingClientRect();
      setShareAt({ x: r.left + r.width / 2, y: r.top - 8 });
    }
    setShareOpen(o => !o);
  };

  // Audio itself lives in <GlobalPlayer> (root layout) so playback survives
  // navigation — this card is pure UI over the same store.

  // Deep links out for the current track — pure local URLs, no API.
  const links = track ? trackLinks(track.artist, track.title, track.id) : null;
  const saved = useIsFind(track?.id);

  // Stable HSL pair consumed by the pending-view gradient.
  const gradient = illustrationGradientPair(country, genre);

  const pending  = status === 'populating' || status === 'error';
  const hasTrack = status === 'ready' && !!track;

  /* ---------- GSAP polish (scoped to the card) ---------- */
  const stackRef  = useRef<HTMLDivElement | null>(null);
  const pairingKey = `${country}|${genre}`;
  const lastPairing = useRef(pairingKey);

  // Fresh pairing / track → close the share menu.
  useEffect(() => { setShareOpen(false); }, [pairingKey]);
  useEffect(() => { setShareOpen(false); }, [track?.id]);

  // Playlist entrance: when a fresh pairing becomes ready, the now-playing
  // row, transport, and queue rise and stagger in together.
  useGSAP(() => {
    if (!hasTrack || !canAnimate()) return;
    gsap.timeline({ defaults: { ease: 'power2.out' } })
      .from('.center__now',      { autoAlpha: 0, y: 8, duration: 0.40 })
      .from('.center__controls', { autoAlpha: 0, y: 6, duration: 0.35 }, '-=0.22')
      // Only the visible head of the (now much longer) queue staggers in;
      // clearProps so an interrupted tween can never strand rows dimmed.
      .from('.center__queue-item:nth-child(-n+12)', {
        autoAlpha: 0, y: 6, stagger: 0.045, duration: 0.30, clearProps: 'opacity,visibility,transform',
      }, '-=0.18');
  }, { scope: stackRef, dependencies: [pairingKey, hasTrack] });

  // Track swap WITHIN a playlist (next/prev/auto-advance): the cover pops
  // and the meta slides, so the change reads without a full re-entrance.
  useGSAP(() => {
    const samePlaylist = lastPairing.current === pairingKey;
    lastPairing.current = pairingKey;
    if (!hasTrack || !samePlaylist || !canAnimate()) return;  // fresh playlist → entrance owns it
    gsap.fromTo('.center__cover',
      { autoAlpha: 0.35, scale: 0.93 },
      { autoAlpha: 1, scale: 1, duration: 0.42, ease: 'power2.out' });
    gsap.from('.center__meta', { autoAlpha: 0, x: 10, duration: 0.42, ease: 'power2.out' });
  }, { scope: stackRef, dependencies: [track?.id] });

  return (
    <div className="absolute left-1/2 top-1/2 z-[5] -translate-x-1/2 -translate-y-1/2">
      {status !== 'empty' && (
        <div className="center__stack" ref={stackRef}>
          <div
            className="center__card center__card--main"
            data-main-card=""
            data-center-view={pending ? 'pending' : 'playback'}
            data-playing={isPlaying ? 'true' : 'false'}
            data-autoplay-blocked={autoplayBlocked ? 'true' : 'false'}
            style={{
              ['--ill-country' as string]: gradient.country,
              ['--ill-genre'   as string]: gradient.genre,
            } as React.CSSProperties}
          >
            {/* Populating / no-results: only this block */}
            <div
              className="center__card-pane"
              hidden={!pending}
              data-error={status === 'error' ? 'true' : 'false'}
            >
              <div className="center__card-rail">
                <span className="center__card-rail__label">{country.toUpperCase()}</span>
                <span className="center__card-rail__line" />
                <span className="center__card-rail__label">{genre.toUpperCase()}</span>
              </div>
              <p className="center__card-pane__msg">
                {status === 'error' ? STR.card.noResults : STR.card.populating}
              </p>
            </div>

            {/* Player — now row, progress, transport. Content-sized. */}
            <div className="center__player" hidden={!hasTrack}>
                <div className="center__track">
                  <div className="center__now">
                    <div className="center__cover-wrap">
                      {track?.image
                        ? <img className="center__cover" src={track.image} alt="" />
                        : <div className="center__cover" />}
                    </div>
                    <div className="center__meta">
                      <h2 className="center__title">{track?.title}</h2>
                      <p className="center__album">
                        {track ? `${track.album} — ${track.artist}` : ''}
                      </p>
                      {/* Origin line: curated story when we have one, otherwise a
                          grounded facts fallback (genre · country · year). */}
                      {track && (
                        <p className="center__about">
                          {storyFor(track.artist, country, genre)
                            ?? STR.card.aboutFallback(genre, country, releaseYear(track.releaseDate))}
                        </p>
                      )}
                    </div>
                    {track && (
                      <button
                        className="center__heart"
                        data-saved={saved ? 'true' : 'false'}
                        onClick={() => toggleFind({
                          id: track.id, title: track.title, artist: track.artist,
                          album: track.album, image: track.image, preview: track.preview,
                          country, genre, savedAt: Date.now(),
                          releaseDate: track.releaseDate ?? null,
                          duration: track.duration ?? null,
                        })}
                        title={saved ? STR.card.unsave : STR.card.save}
                        aria-label={saved ? STR.card.unsave : STR.card.save}
                        aria-pressed={saved}
                      >
                        <svg viewBox="0 0 24 24" width="17" height="17"
                          fill={saved ? 'currentColor' : 'none'}
                          stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8z" />
                        </svg>
                      </button>
                    )}
                  </div>

                  <ProgressBar trackDuration={track?.duration ?? null} />

                  <div className="center__controls">
                    <button className="ctrl ctrl--shuffle" onClick={() => shuffleTracks(true)} title={STR.card.shuffle} aria-label={STR.card.shuffle}>
                      {/* Lucide "shuffle" (MIT) */}
                      <svg className="ctrl__icon-shuffle" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                        <polyline points="16 3 21 3 21 8" />
                        <line x1="4" y1="20" x2="21" y2="3" />
                        <polyline points="21 16 21 21 16 21" />
                        <line x1="15" y1="15" x2="21" y2="21" />
                        <line x1="4" y1="4" x2="9" y2="9" />
                      </svg>
                    </button>
                    <button className="ctrl" onClick={prevTrack} title={STR.card.prev} aria-label={STR.card.prev}>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M5 6v12" />
                        <path d="M19 6L9 12l10 6V6z" />
                      </svg>
                    </button>
                    <button className="ctrl ctrl--lg" onClick={togglePlay} title={STR.card.playPause} aria-label={STR.card.playPause}>
                      <svg className="ctrl__play" viewBox="0 0 24 24" fill="currentColor"><path d="M9.5 7.5v9L16 12 9.5 7.5z" /></svg>
                      <svg className="ctrl__pause" viewBox="0 0 24 24" fill="currentColor"><path d="M8 7h3v10H8zm5 0h3v10h-3z" /></svg>
                    </button>
                    <button className="ctrl" onClick={nextTrack} title={STR.card.next} aria-label={STR.card.next}>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M5 6l10 6-10 6V6z" />
                        <path d="M19 6v12" />
                      </svg>
                    </button>
                    <button
                      ref={shareBtnRef}
                      className="ctrl"
                      onClick={toggleShare}
                      title={STR.card.share}
                      aria-label={STR.card.share}
                      aria-expanded={shareOpen}
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12 15V4" />
                        <path d="M8 8l4-4 4 4" />
                        <path d="M5 13v6h14v-6" />
                      </svg>
                    </button>
                  </div>
                </div>
              </div>

            {/* Up Next — same card, hairline partition.
                Scrolls; shows 9+ rows on tall screens. */}
            <div className="center__up-next" hidden={!hasTrack}>
              <h3 className="center__up-next-title">{STR.card.upNext}</h3>
              <ul className="center__queue" aria-label="Queued tracks">
                {tracks.length <= 1 ? (
                  <li className="center__queue-empty">
                    {tracks.length === 0 ? STR.card.noTracks : STR.card.noOtherTracks}
                  </li>
                ) : (
                  Array.from({ length: tracks.length - 1 }, (_, step) => {
                    const j = (trackIdx + 1 + step) % tracks.length;
                    const t = tracks[j];
                    // Key includes the queue position: if the pool ever holds
                    // two entries of one track, keys stay unique — duplicate
                    // keys made React recycle rows with stale click handlers
                    // (click played a different song) and stranded opacity.
                    return (
                      <li
                        key={`${j}-${t.id}`}
                        className="center__queue-item"
                        role="button"
                        tabIndex={0}
                        onClick={() => { setTrackIdx(j); setIsPlaying(true); }}
                        onKeyDown={(e) => { if (e.key === 'Enter') { setTrackIdx(j); setIsPlaying(true); } }}
                      >
                        {t.image
                          ? <img className="qrow__img" src={t.image} alt="" loading="lazy" />
                          : <span className="qrow__img" />}
                        <span className="qrow__main">
                          <span className="qrow__title">{t.title}</span>
                          <span className="qrow__artist">{t.artist}</span>
                        </span>
                        <span className="qrow__album">{t.album}</span>
                        <span className="qrow__dur tabular">{formatDuration(t.duration)}</span>
                      </li>
                    );
                  })
                )}
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* Share ("listen to full song in") — body-level overlay so the card
          edge can never clip it. The scrim closes it on any outside click. */}
      {shareOpen && links && shareAt && typeof document !== 'undefined' && createPortal(
        <>
          <div className="listen-scrim" onClick={() => setShareOpen(false)} />
          <div
            className="listen-menu listen-menu--overlay"
            role="menu"
            aria-label={STR.card.listenIn}
            style={{ left: shareAt.x, top: shareAt.y }}
          >
            <div className="listen-menu__head">{STR.card.listenIn.toUpperCase()}</div>
            <a role="menuitem" href={links.spotify} target="_blank" rel="noreferrer"><BrandIcon kind="spotify" />Spotify</a>
            <a role="menuitem" href={links.appleMusic} target="_blank" rel="noreferrer"><BrandIcon kind="apple" />Apple Music</a>
            <a role="menuitem" href={links.youtube} target="_blank" rel="noreferrer"><BrandIcon kind="youtube" />Youtube</a>
            <a role="menuitem" href={links.deezer} target="_blank" rel="noreferrer"><BrandIcon kind="deezer" />Deezer</a>
            {spotifyEnabled && (
              <button
                className="listen-menu__connect"
                data-connected={spotifyOn ? 'true' : 'false'}
                onClick={() => (spotifyOn ? disconnectSpotify() : connectSpotify())}
              >
                {spotifyOn ? STR.spotify.connected : STR.spotify.connect}
              </button>
            )}
          </div>
        </>,
        document.body,
      )}
    </div>
  );
}

/** Must match `.letter-ladder { --ladder-row }` in globals.css */
const LADDER_ROW = 11;

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

/**
 * Letter ladder — the alphabet rail beside each wheel. All 26 letters, one
 * bar per letter (first bar = A, second = B, …) so the rail reads as a fixed
 * A–Z index of the wheel. Letters with no matching item are dimmed. Clicking
 * a letter snaps the wheel to its first item; clicking it again cycles
 * through the other items sharing that initial. The active letter's bar
 * hides under a square letter chip.
 */
export function Dial({ side }: { side: 'left' | 'right' }) {
  const { countryIdx, genreIdx, setCountry, setGenre } = useStore();
  const items  = side === 'left' ? COUNTRIES : GENRES;
  const idx    = side === 'left' ? countryIdx : genreIdx;
  const snapTo = side === 'left' ? setCountry : setGenre;
  const activeLetter = (items[idx] || '?')[0]?.toUpperCase() || '?';
  const activeRow = Math.max(0, ALPHABET.indexOf(activeLetter));

  const jumpTo = (letter: string) => {
    const matches = items
      .map((label, i) => ({ label, i }))
      .filter(({ label }) => label[0]?.toUpperCase() === letter);
    if (!matches.length) return;
    // Already on this letter → cycle to the next item sharing the initial.
    const pos = matches.findIndex(({ i }) => i === idx);
    snapTo(matches[(pos + 1) % matches.length].i);
  };

  return (
    <div className={`letter-ladder letter-ladder--${side}`}>
      {ALPHABET.map((letter) => {
        const first = items.find((label) => label[0]?.toUpperCase() === letter);
        return (
          <div key={letter} className="letter-ladder__row">
            <button
              type="button"
              className="letter-ladder__tick"
              title={first ? `${letter} — ${first}` : letter}
              aria-label={first ? `${letter} — ${first}` : letter}
              data-active={letter === activeLetter ? 'true' : 'false'}
              data-empty={first ? 'false' : 'true'}
              disabled={!first}
              onClick={() => jumpTo(letter)}
            />
          </div>
        );
      })}
      <span
        className="letter-ladder__chip"
        style={{ top: activeRow * LADDER_ROW + LADDER_ROW / 2 }}
      >
        {activeLetter}
      </span>
    </div>
  );
}

/**
 * Lock toggle — a padlock above each letter ladder. A locked wheel ignores
 * all spin input (drag, scroll, gestures, ladder clicks) via the guards in
 * the store, so the user can hold one wheel still and spin only the other.
 */
export function WheelLock({ side }: { side: 'left' | 'right' }) {
  const { lockedLeft, lockedRight, toggleLockLeft, toggleLockRight } = useStore();
  const locked = side === 'left' ? lockedLeft : lockedRight;
  const toggle = side === 'left' ? toggleLockLeft : toggleLockRight;
  const label = side === 'left'
    ? (locked ? STR.locks.unlockCountry : STR.locks.lockCountry)
    : (locked ? STR.locks.unlockGenre   : STR.locks.lockGenre);

  return (
    <button
      type="button"
      className={`wheel-lock wheel-lock--${side}`}
      data-locked={locked ? 'true' : 'false'}
      onClick={toggle}
      title={label}
      aria-label={label}
      aria-pressed={locked}
    >
      {locked ? (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <rect x="5" y="11" width="14" height="10" rx="1.5" />
          <path d="M8 11V7a4 4 0 0 1 8 0v4" />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <rect x="5" y="11" width="14" height="10" rx="1.5" />
          <path d="M8 11V7a4 4 0 0 1 7.5-2" />
        </svg>
      )}
    </button>
  );
}

/* ============================================================
 *  HandTracking — gesture input layer over the existing wheels.
 *
 *  This component does NOT modify the wheels. It is a pure input
 *  bridge that translates webcam hand gestures into the same
 *  `spinLeft` / `spinRight` / `commit` calls that mouse + scroll
 *  use. All wheels' existing behavior is preserved.
 *
 *  Pipeline per frame:
 *    1. Detect hands with MediaPipe HandLandmarker.
 *    2. Match each detected hand to a persistent tracked hand by
 *       nearest-neighbor wrist position. Stale tracked hands age out.
 *    3. EMA-smooth every landmark (never use raw values for logic).
 *    4. Compute palm center (avg of landmarks 0,5,9,13,17) and its
 *       per-frame screen-pixel velocity.
 *    5. Decide which wheel this hand controls from wrist X zone
 *       (left 35% / right 35% / middle 30%), with 300ms hysteresis
 *       before re-assigning to a new zone.
 *    6. Scroll: if palm Y velocity exceeds the dead zone, throttle
 *       by distance (50px per step) and emit spinLeft/spinRight.
 *       A flick (high peak velocity then drop) fires up to 3 steps.
 *    7. Select: thumb/index pinch distance < 0.045 (normalized) AND
 *       not scrolling AND palm velocity within dead zone starts a
 *       350ms dwell. On full dwell, fire `commit` and toast. Release
 *       early cancels. 500ms cooldown after a successful select.
 *
 *  All thresholds live in CFG so they can be tuned in one place.
 * ============================================================ */

type CameraStatus = 'connecting' | 'ok' | 'in-use' | 'denied' | 'no-device' | 'error';

/** All gesture-input thresholds, isolated for easy tuning. */
const CFG = {
  /* MediaPipe model */
  numHands: 2,
  minDetectionConfidence: 0.6,
  minTrackingConfidence:  0.5,

  /* EMA on every landmark.  smoothed = α·current + (1−α)·previous  */
  smoothAlpha: 0.4,

  /* Cursor mapping — a VR-style pointer driven by the index fingertip.
   * Hand position in the camera frame maps to a screen cursor; gain
   * amplifies movement around center so the screen edges are reachable
   * without moving the hand to the edge of the camera's view. */
  cursorGain:   1.7,   // movement amplification around frame center (0.5)
  cursorSmooth: 0.45,  // extra EMA on the cursor pixel position (0..1, higher = snappier)

  /* Pinch = click / grab. Hysteresis: engage below ON, release above OFF,
   * so a held pinch doesn't flicker. Normalized thumb-tip↔index-tip dist. */
  pinchOnNorm:  0.055,
  pinchOffNorm: 0.085,

  /* Wheel drag — while pinched over a wheel, this much cursor-Y travel
   * spins it one step (like grabbing and turning a physical wheel). */
  dragPxPerStep: 42,

  /* A button fires only after the pinch is HELD on it this long — a
   * deliberate "pinch and hold ~1s" so a stray quick pinch can't misfire.
   * Drifting off the button, or releasing early, cancels it. */
  clickDwellMs: 1000,

  /* Hand identity */
  handMatchMaxNormDistance: 0.25,  // wrist-to-wrist threshold for matching across frames
  handStaleMs:              250,   // tracked hand expires if not seen for this long
} as const;

type Landmark = { x: number; y: number; z: number };

type TrackedHand = {
  /** EMA-smoothed landmarks (normalized coords from MediaPipe).      */
  smoothed: Landmark[] | null;

  /** VR-style cursor position in viewport px (extra-smoothed). null
   *  until the hand is first seen.                                   */
  cursor: { x: number; y: number } | null;

  /** Pinch state with hysteresis — true while thumb+index held shut. */
  pinching: boolean;

  /** When pinching over a wheel: which side, and the cursor-Y anchor
   *  the next spin step is measured from. dragSide null = not grabbing.*/
  dragSide:    'left' | 'right' | null;
  dragAnchorY: number;

  /** Pinch-and-hold on a button: the target, and when the hold began.
   *  Fires the button once the hold reaches CFG.clickDwellMs.         */
  dwellTarget: HTMLElement | null;
  dwellStart:  number | null;

  /** Used by the matcher to expire stale tracks.                     */
  lastSeenAt: number;
};

function newTrackedHand(): TrackedHand {
  return {
    smoothed: null,
    cursor: null,
    pinching: false,
    dragSide: null,
    dragAnchorY: 0,
    dwellTarget: null,
    dwellStart: null,
    lastSeenAt: 0,
  };
}

function distNorm(a: Landmark, b: Landmark): number {
  const dx = a.x - b.x, dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

export function HandTracking() {
  const [cameraStatus, setCameraStatus] = useState<CameraStatus>('connecting');
  /* React state purely for the preview's hand-count badge. All gesture logic
   * runs off refs / direct DOM, never React state, to avoid per-frame renders. */
  const [handCount, setHandCount] = useState(0);

  // Spinning a wheel is the one action with no DOM button to click, so we keep
  // these as refs for the rAF loop. Everything else (play/pause, next, prev,
  // shuffle, lock, ladder snap) is a real <button> the cursor clicks directly.
  const { spinLeft, spinRight } = useStore();
  const spinLeftRef  = useRef(spinLeft);  spinLeftRef.current  = spinLeft;
  const spinRightRef = useRef(spinRight); spinRightRef.current = spinRight;

  useEffect(() => {
    let raf = 0;
    let stopped = false;
    let stream: MediaStream | null = null;

    const HAND_CONNECTIONS: [number, number][] = [
      [0, 1], [1, 2], [2, 3], [3, 4],
      [0, 5], [5, 6], [6, 7], [7, 8],
      [5, 9], [9, 10], [10, 11], [11, 12],
      [9, 13], [13, 14], [14, 15], [15, 16],
      [13, 17], [0, 17], [17, 18], [18, 19], [19, 20],
    ];

    /* Persistent tracked hands (up to CFG.numHands). Indexed slots — when a
     * detected hand matches an existing slot we update it; otherwise we fill
     * an empty slot or replace the stalest one. */
    const tracked: TrackedHand[] = Array.from(
      { length: CFG.numHands },
      () => newTrackedHand(),
    );

    const run = async () => {
      const video  = document.getElementById('webcam')      as HTMLVideoElement | null;
      const canvas = document.getElementById('hand-canvas') as HTMLCanvasElement | null;
      if (!video || !canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { width: 640, height: 480, facingMode: 'user' },
          audio: false,
        });
        if (stopped) return;
        video.srcObject = stream;
        await new Promise<void>(r => (video.onloadedmetadata = () => r()));
        await video.play();
        video.style.display = 'block';
        canvas.width  = video.videoWidth  || 640;
        canvas.height = video.videoHeight || 480;
      } catch (err: unknown) {
        const name = (err as { name?: string } | null)?.name;
        if      (name === 'NotReadableError') setCameraStatus('in-use');
        else if (name === 'NotAllowedError')  setCameraStatus('denied');
        else if (name === 'NotFoundError')    setCameraStatus('no-device');
        else                                  setCameraStatus('error');
        return;
      }

      let HandLandmarker, FilesetResolver;
      try {
        ({ HandLandmarker, FilesetResolver } = await import('@mediapipe/tasks-vision'));
      } catch {
        setCameraStatus('error');
        return;
      }

      // The VR-cursor model is purely landmark-driven (cursor from the index
      // fingertip, pinch from thumb↔index distance) — no canned-pose
      // classification — so the lighter HandLandmarker is all we need.
      let landmarker;
      try {
        const vision = await FilesetResolver.forVisionTasks(
          'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm',
        );
        landmarker = await HandLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath:
              'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
            delegate: 'GPU',
          },
          numHands:                CFG.numHands,
          runningMode:             'VIDEO',
          minHandDetectionConfidence: CFG.minDetectionConfidence,
          minHandPresenceConfidence:  CFG.minDetectionConfidence,
          minTrackingConfidence:      CFG.minTrackingConfidence,
        });
      } catch {
        setCameraStatus('error');
        return;
      }

      setCameraStatus('ok');

      let lastVideoTime = -1;
      let lastHandCount  = -1;
      // Elements the cursor is currently hovering, so we can clear the highlight
      // when it moves off. Lives across frames.
      let hoveredEls = new Set<Element>();

      const tick = () => {
        if (stopped) return;
        if (video.readyState >= 2 && video.currentTime !== lastVideoTime) {
          lastVideoTime = video.currentTime;
          const result = landmarker.detectForVideo(video, performance.now());
          ctx.clearRect(0, 0, canvas.width, canvas.height);

          const now    = performance.now();
          const detected = result.landmarks ?? [];

          /* --------------------------------------------------------
           *  1. Match each detected hand to a tracked slot (nearest
           *     wrist position). Empty / stale slots can be claimed.
           * -------------------------------------------------------- */
          const claimed = new Array<boolean>(tracked.length).fill(false);
          const assignments: Array<{ detIdx: number; trackIdx: number }> = [];
          for (let d = 0; d < detected.length; d++) {
            const wrist = detected[d][0];
            // Find best free slot — either prior position is null (free), or
            // wrist-distance from prior smoothed wrist is below the match
            // threshold, or the slot is stale.
            let bestIdx = -1;
            let bestDist = Infinity;
            for (let t = 0; t < tracked.length; t++) {
              if (claimed[t]) continue;
              const th = tracked[t];
              const isStale = !th.smoothed || (now - th.lastSeenAt) > CFG.handStaleMs;
              if (isStale) {
                // Stale slots are claimed only if nothing closer exists.
                if (bestIdx === -1) bestIdx = t;
                continue;
              }
              const prevWrist = th.smoothed![0];
              const dN = distNorm(wrist, prevWrist);
              if (dN < CFG.handMatchMaxNormDistance && dN < bestDist) {
                bestDist = dN;
                bestIdx  = t;
              }
            }
            if (bestIdx === -1) {
              // No usable slot — pick the slot that was seen longest ago.
              let oldest = 0;
              for (let t = 1; t < tracked.length; t++) {
                if (claimed[t]) continue;
                if (tracked[t].lastSeenAt < tracked[oldest].lastSeenAt) oldest = t;
              }
              bestIdx = oldest;
              // Reset its smoothing so EMA starts fresh from this hand.
              tracked[bestIdx] = newTrackedHand();
            }
            claimed[bestIdx] = true;
            assignments.push({ detIdx: d, trackIdx: bestIdx });
          }

          /* --------------------------------------------------------
           *  2. Process each assigned hand as a VR-style cursor:
           *     smooth → cursor position → pinch (click / grab).
           * -------------------------------------------------------- */
          const nextHovered = new Set<Element>();
          const activeSlots = new Set<number>();

          for (const { detIdx, trackIdx } of assignments) {
            const lmRaw = detected[detIdx];
            const th    = tracked[trackIdx];

            /* 2a. EMA on every landmark. Init from raw on first sight. */
            if (!th.smoothed) {
              th.smoothed = lmRaw.map((p): Landmark => ({ x: p.x, y: p.y, z: p.z ?? 0 }));
            } else {
              const a = CFG.smoothAlpha;
              for (let i = 0; i < lmRaw.length; i++) {
                const cur  = lmRaw[i];
                const prev = th.smoothed[i];
                prev.x = a * cur.x       + (1 - a) * prev.x;
                prev.y = a * cur.y       + (1 - a) * prev.y;
                prev.z = a * (cur.z ?? 0) + (1 - a) * prev.z;
              }
            }
            const sm = th.smoothed;
            th.lastSeenAt = now;
            activeSlots.add(trackIdx);

            /* 2b. Draw the 21-point skeleton on the preview, colored per hand. */
            const stroke = trackIdx === 0
              ? 'rgba(60,220,130,0.95)'   // hand 0 — green
              : 'rgba(80,160,255,0.95)';  // hand 1 — blue
            ctx.lineWidth = 2.2;
            ctx.strokeStyle = stroke;
            for (const [a, b] of HAND_CONNECTIONS) {
              ctx.beginPath();
              ctx.moveTo(sm[a].x * canvas.width, sm[a].y * canvas.height);
              ctx.lineTo(sm[b].x * canvas.width, sm[b].y * canvas.height);
              ctx.stroke();
            }
            ctx.fillStyle = stroke;
            for (const p of sm) {
              ctx.beginPath();
              ctx.arc(p.x * canvas.width, p.y * canvas.height, 2.4, 0, Math.PI * 2);
              ctx.fill();
            }

            /* 2c. Cursor position — index fingertip (landmark 8), mirrored,
             * amplified around frame center so the screen edges are reachable,
             * then extra-smoothed for a steady pointer. */
            const tipX = 1 - sm[8].x;  // mirror X to match the mirrored video
            const tipY = sm[8].y;
            const gx = clamp01(0.5 + (tipX - 0.5) * CFG.cursorGain);
            const gy = clamp01(0.5 + (tipY - 0.5) * CFG.cursorGain);
            const targetX = gx * window.innerWidth;
            const targetY = gy * window.innerHeight;
            if (!th.cursor) {
              th.cursor = { x: targetX, y: targetY };
            } else {
              th.cursor.x += (targetX - th.cursor.x) * CFG.cursorSmooth;
              th.cursor.y += (targetY - th.cursor.y) * CFG.cursorSmooth;
            }
            const cx = th.cursor.x, cy = th.cursor.y;

            /* 2d. Pinch with hysteresis (engage below ON, release above OFF). */
            const wasPinching = th.pinching;
            const pinchDist   = distNorm(sm[4], sm[8]);
            const nowPinching = wasPinching
              ? pinchDist <= CFG.pinchOffNorm
              : pinchDist <  CFG.pinchOnNorm;
            th.pinching = nowPinching;
            const justPinched  = nowPinching && !wasPinching;
            const justReleased = !nowPinching && wasPinching;

            /* 2e. What's under the cursor? `elementFromPoint` ignores our
             * pointer-events:none cursor + glass overlays and returns the real
             * button or the wheel <canvas> beneath. */
            const el  = document.elementFromPoint(cx, cy);
            const btn = el instanceof Element
              ? (el.closest('button') as HTMLElement | null)
              : null;
            // Highlight a hoverable button (but not while grabbing a wheel).
            if (btn && !th.dragSide) nextHovered.add(btn);

            // Releasing the pinch cancels everything — nothing fires unless the
            // pinch is actively held (and, for buttons, held long enough).
            if (justReleased) {
              th.dragSide    = null;
              th.dwellTarget = null;
              th.dwellStart  = null;
            }

            if (nowPinching && th.dragSide) {
              // Grabbing a wheel: vertical cursor travel turns it, like
              // grabbing and spinning a physical wheel. Continues only while
              // pinched. Locked wheels ignore this via the store guard.
              const dy = cy - th.dragAnchorY;
              if (Math.abs(dy) >= CFG.dragPxPerStep) {
                const dir = dy > 0 ? 1 : -1;
                (th.dragSide === 'left' ? spinLeftRef : spinRightRef).current(dir);
                th.dragAnchorY = cy;
              }
            } else if (justPinched) {
              // Decide what this pinch is, from what's under the cursor when it
              // closes: a button → start a pinch-and-hold dwell; the wheel
              // canvas → grab it for dragging; anything else → nothing.
              if (btn) {
                th.dwellTarget = btn;
                th.dwellStart  = now;
              } else if (el && el.tagName === 'CANVAS' && el.id !== 'hand-canvas') {
                th.dragSide    = cx < window.innerWidth / 2 ? 'left' : 'right';
                th.dragAnchorY = cy;
              }
            } else if (nowPinching && th.dwellTarget) {
              // Pinch held on a button: it must stay on that same button for
              // the full dwell, then fires once (its real .click() handler).
              if (btn === th.dwellTarget) {
                if (th.dwellStart !== null && now - th.dwellStart >= CFG.clickDwellMs) {
                  th.dwellTarget.click();
                  th.dwellTarget = null;
                  th.dwellStart  = null;
                }
              } else {
                // Drifted off the button — cancel the hold.
                th.dwellTarget = null;
                th.dwellStart  = null;
              }
            }

            /* 2f. Move this hand's on-screen cursor + dwell-fill progress. */
            const dwellProg = (th.dwellTarget && th.dwellStart !== null)
              ? clamp01((now - th.dwellStart) / CFG.clickDwellMs)
              : 0;
            const cursorEl = document.getElementById('gesture-cursor-' + trackIdx);
            if (cursorEl) {
              cursorEl.style.transform = `translate(${cx}px, ${cy}px) translate(-50%, -50%)`;
              cursorEl.style.opacity = '1';
              cursorEl.style.setProperty('--dwell', String(dwellProg));
              cursorEl.dataset.pinch = nowPinching ? 'true' : 'false';
              cursorEl.dataset.grab  = th.dragSide ? 'true' : 'false';
            }
          }

          /* --------------------------------------------------------
           *  3. Hover highlight reconcile + hide idle cursors + decay.
           * -------------------------------------------------------- */
          for (const elPrev of hoveredEls) {
            if (!nextHovered.has(elPrev)) elPrev.classList.remove('gesture-hover');
          }
          for (const elNew of nextHovered) {
            if (!hoveredEls.has(elNew)) elNew.classList.add('gesture-hover');
          }
          hoveredEls = nextHovered;

          for (let t = 0; t < tracked.length; t++) {
            if (activeSlots.has(t)) continue;
            const cursorEl = document.getElementById('gesture-cursor-' + t);
            if (cursorEl) cursorEl.style.opacity = '0';
            if (claimed[t]) continue;
            const th = tracked[t];
            if (th.smoothed && (now - th.lastSeenAt) > CFG.handStaleMs) {
              // Stale — wipe state so this slot is reusable.
              th.smoothed    = null;
              th.cursor      = null;
              th.pinching    = false;
              th.dragSide    = null;
              th.dwellTarget = null;
              th.dwellStart  = null;
            }
          }

          /* --------------------------------------------------------
           *  4. Publish UI-visible state (hand-count badge).
           * -------------------------------------------------------- */
          const visibleCount = detected.length;
          if (visibleCount !== lastHandCount) {
            lastHandCount = visibleCount;
            setHandCount(visibleCount);
          }
        }
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    };

    run();
    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
      stream?.getTracks().forEach(t => t.stop());
      // Clear any lingering hover highlight on buttons outside this component.
      document.querySelectorAll('.gesture-hover')
        .forEach(el => el.classList.remove('gesture-hover'));
    };
  }, []);  // eslint-disable-line react-hooks/exhaustive-deps  — store dispatch is read via refs

  return (
    <>
      {/* Two VR-style cursors (one per hand), floating over the whole screen.
       * pointer-events:none so they don't block elementFromPoint hit-testing. */}
      <div id="gesture-cursor-0" className="gesture-cursor" data-hand="0" style={{ opacity: 0 }} />
      <div id="gesture-cursor-1" className="gesture-cursor" data-hand="1" style={{ opacity: 0 }} />

      {cameraStatus !== 'ok' && cameraStatus !== 'connecting' ? (
        <CameraUnavailable status={cameraStatus} />
      ) : (
        /* Webcam preview: 150 × 100, bottom-right, rounded, with the 21-point
         * hand skeleton drawn on it and a hand-count badge. */
        <div
          className="absolute z-20 overflow-hidden rounded-xl bg-neutral-100"
          style={{
            right: 24,
            bottom: 24,
            width: 150,
            height: 100,
            boxShadow:
              '0 1px 2px rgba(0,0,0,0.06), 0 12px 36px rgba(0,0,0,0.18), 0 0 0 1px rgba(0,0,0,0.18)',
          }}
        >
          <video
            id="webcam"
            autoPlay
            playsInline
            muted
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', transform: 'scaleX(-1)', display: 'none' }}
          />
          <canvas
            id="hand-canvas"
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', transform: 'scaleX(-1)' }}
          />

          {/* Hand-count indicator */}
          <div
            className="tabular absolute left-1.5 top-1.5 flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[9px] font-medium"
            style={{
              background:
                handCount === 0 ? 'rgba(0,0,0,0.55)' :
                handCount === 1 ? 'rgba(60,220,130,0.90)' :
                                  'rgba(60,160,255,0.90)',
              color: 'white',
            }}
          >
            <span
              className="inline-block size-1.5 rounded-full"
              style={{
                background: 'white',
                opacity: handCount > 0 ? 1 : 0.5,
              }}
            />
            {STR.camera.hands(handCount)}
          </div>
        </div>
      )}
    </>
  );
}

/** Placeholder shown in the camera-frame slot when the webcam can't be used. */
function CameraUnavailable({ status }: { status: CameraStatus }) {
  const headline =
    status === 'in-use'    ? STR.camera.inUseHeadline    :
    status === 'denied'    ? STR.camera.deniedHeadline   :
    status === 'no-device' ? STR.camera.noDeviceHeadline :
                             STR.camera.errorHeadline;
  const detail =
    status === 'in-use'    ? STR.camera.inUseDetail    :
    status === 'denied'    ? STR.camera.deniedDetail   :
    status === 'no-device' ? STR.camera.noDeviceDetail :
                             STR.camera.errorDetail;
  return (
    <div
      className="absolute z-20 flex flex-col items-center justify-center overflow-hidden rounded-lg bg-neutral-100 px-3 text-center"
      style={{
        right: 28,
        bottom: 28,
        width: 220,
        height: 150,
        boxShadow:
          '0 1px 2px rgba(0,0,0,0.06), 0 12px 36px rgba(0,0,0,0.18), 0 0 0 1px rgba(0,0,0,0.18)',
        fontFamily: 'var(--font-sans)',
      }}
    >
      <svg
        width="32" height="32" viewBox="0 0 24 24" fill="none"
        stroke="rgba(0,0,0,0.42)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"
      >
        <path d="M2 6h13a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H2z" />
        <path d="M22 8l-5 4 5 4z" />
        <line x1="3" y1="3" x2="21" y2="21" stroke="rgba(180,30,30,0.85)" strokeWidth="1.8" />
      </svg>
      <div className="mt-2 text-[12px] font-medium text-neutral-800">{headline}</div>
      <div className="mt-0.5 text-[10px] leading-[1.35] text-neutral-500" style={{ textWrap: 'pretty' as 'pretty' }}>
        {detail}
      </div>
    </div>
  );
}

/** Tiny floating toast that confirms a recognized player gesture. */
export function GestureToast() {
  const { toast } = useStore();
  if (!toast) return null;
  const text = STR.toasts[toast.kind] ?? toast.kind;
  return (
    <div
      className="pointer-events-none absolute left-1/2 top-[15%] z-40 -translate-x-1/2 rounded-full bg-black/80 px-4 py-2 text-[13px] text-white"
      style={{ fontFamily: 'var(--font-mono)' }}
    >
      {text}
    </div>
  );
}

/**
 * Bottom-center dock — the three verbs of the app:
 *   shuffle (surprise) · liked songs (popup with playlists) · more (menu).
 * The more menu holds Language, Hand tracking (On/Off), Contact us, About us.
 */
export function Dock({ onSurprise }: { onSurprise?: () => void } = {}) {
  const { handMode, toggleHandMode, surprise, lockedLeft, lockedRight } = useStore();
  const finds = useFinds();

  const [likedOpen, setLikedOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [submenu, setSubmenu] = useState<null | 'lang' | 'hand'>(null);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [lang, setLang] = useState('en');

  // Hand tracking makes no sense on touch-primary devices — hide the row.
  const [coarse, setCoarse] = useState(false);
  useEffect(() => {
    setCoarse(window.matchMedia('(pointer: coarse)').matches);
    const l = window.localStorage.getItem('lang');
    if (l) setLang(l);
  }, []);

  const closeMenu = () => { setMenuOpen(false); setSubmenu(null); };

  const pickLang = (code: string) => {
    setLang(code);
    window.localStorage.setItem('lang', code);
  };

  return (
    <>
      {/* Outside-click catcher — lives OUTSIDE .dock because the dock's
          translateX(-50%) transform would trap a position:fixed child. */}
      {menuOpen && <div className="dock-scrim" onClick={closeMenu} />}

      <div className="dock">
        {/* Shuffle — the primary discovery verb. Single-press action. */}
        <button
          onClick={onSurprise ?? surprise}
          className="dock__btn"
          title={
            lockedLeft && lockedRight ? STR.dock.surpriseBothLocked
            : lockedLeft  ? STR.dock.surpriseGenreOnly
            : lockedRight ? STR.dock.surpriseCountryOnly
            : STR.dock.surprise
          }
          aria-label={STR.dock.surprise}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
            <path d="M16 3h5v5" />
            <path d="M4 20 21 3" />
            <path d="M21 16v5h-5" />
            <path d="m15 15 6 6" />
            <path d="M4 4l5 5" />
          </svg>
        </button>

        {/* Liked songs — opens the playlist popup. */}
        <button
          onClick={() => { setLikedOpen(o => !o); closeMenu(); }}
          className="dock__btn"
          title={STR.playlists.title}
          aria-label={STR.playlists.title}
          aria-expanded={likedOpen}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill={finds.length ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8z" />
          </svg>
          {finds.length > 0 && <span className="dock__count tabular">{finds.length}</span>}
        </button>

        {/* More — language, hand tracking, contact, about. */}
        <button
          onClick={() => { setMenuOpen(o => !o); setSubmenu(null); setLikedOpen(false); }}
          className="dock__btn"
          title={STR.menu.more}
          aria-label={STR.menu.more}
          aria-expanded={menuOpen}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
            <circle cx="12" cy="5" r="1.7" /><circle cx="12" cy="12" r="1.7" /><circle cx="12" cy="19" r="1.7" />
          </svg>
        </button>

        {menuOpen && (
          <>
            <div className="dock-menu" role="menu">
              {/* Language */}
              <button
                role="menuitem"
                className="dock-menu__row"
                aria-expanded={submenu === 'lang'}
                onClick={() => setSubmenu(s => (s === 'lang' ? null : 'lang'))}
              >
                {/* translate glyph — 文/A */}
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 5h8" /><path d="M8 3v2" /><path d="M6 5c0 4 2.5 7 6 8.5" />
                  <path d="M10 5c0 4-2.5 7-6 8.5" />
                  <path d="m13 21 4.5-10L22 21" /><path d="M14.6 17.5h5.8" />
                </svg>
                {STR.menu.language}
                <span className="dock-menu__chev">▸</span>
              </button>

              {/* Hand tracking */}
              {!coarse && (
                <button
                  role="menuitem"
                  className="dock-menu__row"
                  aria-expanded={submenu === 'hand'}
                  onClick={() => setSubmenu(s => (s === 'hand' ? null : 'hand'))}
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M18 11V6a2 2 0 0 0-4 0v5" />
                    <path d="M14 10V4a2 2 0 0 0-4 0v6" />
                    <path d="M10 10.5V6a2 2 0 0 0-4 0v8" />
                    <path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15" />
                  </svg>
                  {STR.menu.handTracking}
                  <span className="dock-menu__chev">▸</span>
                </button>
              )}

              {/* Contact us */}
              <button
                role="menuitem"
                className="dock-menu__row"
                onClick={() => {
                  window.location.href = `mailto:?subject=${encodeURIComponent(STR.menu.mailSubject)}`;
                  closeMenu();
                }}
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 5h18v12H7l-4 4z" />
                </svg>
                {STR.menu.contact}
              </button>

              {/* About us */}
              <button
                role="menuitem"
                className="dock-menu__row"
                onClick={() => { setAboutOpen(true); closeMenu(); }}
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
                  <circle cx="12" cy="12" r="9" />
                  <path d="M12 8h.01" />
                  <path d="M11 12h1v5h1" />
                </svg>
                {STR.menu.about}
              </button>

              {/* Submenus */}
              {submenu === 'lang' && (
                <div className="dock-submenu dock-submenu--lang" role="menu" aria-label={STR.menu.language}>
                  {STR.languages.map(l => (
                    <button
                      key={l.code}
                      role="menuitemradio"
                      aria-checked={lang === l.code}
                      data-ready={l.ready ? 'true' : 'false'}
                      className="dock-menu__row dock-menu__row--sub"
                      onClick={() => { if (l.ready) { pickLang(l.code); closeMenu(); } }}
                      title={l.ready ? l.label : `${l.label} — ${STR.menu.translationsSoon}`}
                    >
                      <span className="dock-menu__check">{lang === l.code ? '✓' : ''}</span>
                      {l.label}
                      {!l.ready && <span className="dock-menu__soon">{STR.menu.translationsSoon}</span>}
                    </button>
                  ))}
                </div>
              )}
              {submenu === 'hand' && (
                <div className="dock-submenu" role="menu" aria-label={STR.menu.handTracking}>
                  <button
                    role="menuitemradio"
                    aria-checked={handMode}
                    className="dock-menu__row dock-menu__row--sub"
                    onClick={() => { if (!handMode) toggleHandMode(); closeMenu(); }}
                  >
                    <span className="dock-menu__check">{handMode ? '✓' : ''}</span>{STR.menu.on}
                  </button>
                  <button
                    role="menuitemradio"
                    aria-checked={!handMode}
                    className="dock-menu__row dock-menu__row--sub"
                    onClick={() => { if (handMode) toggleHandMode(); closeMenu(); }}
                  >
                    <span className="dock-menu__check">{!handMode ? '✓' : ''}</span>{STR.menu.off}
                  </button>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      <LikedSongs open={likedOpen} onClose={() => setLikedOpen(false)} />

      {aboutOpen && (
        <>
          <div className="dock-scrim dock-scrim--dim" onClick={() => setAboutOpen(false)} />
          <div className="about-card" role="dialog" aria-label={STR.menu.about}>
            <h2>{STR.menu.aboutTitle}</h2>
            <p>{STR.menu.aboutBody}</p>
            <button onClick={() => setAboutOpen(false)}>{STR.library.close}</button>
          </div>
        </>
      )}
    </>
  );
}

