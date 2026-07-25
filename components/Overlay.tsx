'use client';

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
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
import { ContactPopup } from '@/components/Contact';
import {
  spotifyEnabled, subscribeSpotify, isSpotifyConnected,
  connectSpotify, disconnectSpotify,
} from '@/lib/spotify';
import { backColor } from '@/lib/covers';
import { nearestSeedIdx } from '@/lib/geo';
import { ParticleToast } from '@/components/ParticleToast';

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

/** True while the Spotify embed is the sounding source (audioBus.ext is fed
 *  by GlobalPlayer). Drives whether a card shows its reserved iframe slot. */
export function useEmbedActive(): boolean {
  const [active, setActive] = useState(false);
  useEffect(() => {
    // Poll briskly: this gates the slot's mount/unmount, and it should track
    // the embed becoming/ceasing to be the sounding source closely so the
    // reserved slot never lingers as an empty gap (or lags the seated strip).
    const iv = setInterval(() => setActive(!!audioBus.ext), 200);
    return () => clearInterval(iv);
  }, []);
  return active;
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

/**
 * Round white play/pause button, styled after the one inside Spotify's embed.
 * Used when Spotify ISN'T the sounding source: playback control lives here, in
 * the now-playing row, so the main control strip can keep ♥ at its center in
 * BOTH states and the two layouts stay visually consistent.
 */
export function RoundPlay({ playing, onClick, blocked }: {
  playing: boolean; onClick: () => void; blocked?: boolean;
}) {
  return (
    <button
      className="round-play"
      data-blocked={blocked ? 'true' : 'false'}
      onClick={onClick}
      title={STR.card.playPause}
      aria-label={STR.card.playPause}
    >
      {/* Glyphs span 11×14 of the 24 viewBox (was 6.5×9) — about double the
          drawn size, with the pause bars matched to the triangle's footprint. */}
      {playing
        ? <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden><path d="M6.5 5h4v14h-4zm7 0h4v14h-4z" /></svg>
        : <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden><path d="M8 5v14l11-7z" /></svg>}
    </button>
  );
}

/** Tiny 3-bar equalizer marking the sounding row in the playlist. Bars
 *  animate while playing and freeze when paused (CSS `.eq[data-playing]`). */
function EqualizerIcon({ playing }: { playing: boolean }) {
  return (
    <span className="eq" data-playing={playing ? 'true' : 'false'} aria-hidden>
      <span /><span /><span />
    </span>
  );
}

export function CenterStack() {
  const {
    tracks, trackIdx, status, isPlaying, countryName, genreIdx,
    togglePlay, nextTrack, prevTrack, shuffle, toggleShuffle, autoplayBlocked,
    setTrackIdx, setIsPlaying, customCountry, divertAfterCurrent,
  } = useStore();
  const spotifyOn = useSyncExternalStore(subscribeSpotify, isSpotifyConnected, () => false);
  const country = countryName || '';
  const genre   = GENRES[genreIdx]      ?? '';
  const track   = tracks[trackIdx];

  // True while the Spotify embed is the sounding source. In that state the
  // embed IS the now-playing header (art, title, scrubber, play, save) and our
  // own row + scrubber step aside, so the card never shows two players at once.
  const embedActive = useEmbedActive();
  const embedMode = spotifyOn && embedActive;

  // Arriving here with an UNREPRESENTED (non-seed) country playing — e.g. a
  // Bhutan dot from the World: approximate to the nearest seed country, let
  // the current song finish, swap Up Next for that country's queue in the
  // same genre, and announce it with the particle toast above the card.
  const [divertMsg, setDivertMsg] = useState<{ text: string; info: string } | null>(null);
  const divertedFor = useRef<string | null>(null);
  useEffect(() => {
    if (!customCountry || status !== 'ready' || !tracks.length) return;
    if (divertedFor.current === customCountry) return;
    divertedFor.current = customCountry;
    const from = customCountry;
    // One-shot fire-and-forget: no cleanup/cancellation — deps like
    // tracks.length change while the geo lookup is in flight (the chain
    // keeps appending), and cancelling here would kill the divert.
    void (async () => {
      const idx = await nearestSeedIdx(from);
      if (idx < 0) return;
      const { to, genre } = divertAfterCurrent(idx);
      setDivertMsg({
        text: STR.circle.divert(from),
        info: STR.circle.divertInfo(from, to, genre),
      });
    })();
  }, [customCountry, status, tracks.length, divertAfterCurrent]);

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
  const queueRef  = useRef<HTMLUListElement | null>(null);
  const pairingKey = `${country}|${genre}`;
  const lastPairing = useRef(pairingKey);

  // Keep the sounding row visible as the highlight moves down the fixed list
  // (Spotify-style). 'nearest' scrolls only when the row is off-screen.
  useEffect(() => {
    const row = queueRef.current?.querySelector('[data-current="true"]') as HTMLElement | null;
    row?.scrollIntoView({ block: 'nearest', behavior: canAnimate() ? 'smooth' : 'auto' });
  }, [trackIdx, hasTrack]);

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
      {divertMsg && (
        <ParticleToast text={divertMsg.text} info={divertMsg.info} onDone={() => setDivertMsg(null)} />
      )}
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
                  {/* Our own now-playing row + scrubber. While the Spotify embed
                      is the sounding source it OWNS this job (cover, title,
                      scrubber, play, save-to-Spotify), so we hide ours rather
                      than stack two players in one card. */}
                  {!embedMode && (
                    <>
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
                        {/* Play sits where the ♥ used to — the ♥ has moved to the
                            center of the control strip (same in both states). */}
                        {track && (
                          <RoundPlay playing={isPlaying} onClick={togglePlay} blocked={autoplayBlocked} />
                        )}
                      </div>

                      <ProgressBar trackDuration={track?.duration ?? null} />
                    </>
                  )}

                  <div className="center__controls">
                    <button
                      className="ctrl ctrl--shuffle"
                      data-active={shuffle ? 'true' : 'false'}
                      aria-pressed={shuffle}
                      onClick={toggleShuffle}
                      title={shuffle ? STR.card.shuffleOn : STR.card.shuffleOff}
                      aria-label={shuffle ? STR.card.shuffleOn : STR.card.shuffleOff}
                    >
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
                    {/* ♥ is the CENTER of the strip in both states — like it
                        here on our platform, or save it to Spotify from the
                        embed above. Playback lives in the round button (or in
                        the embed), never here. */}
                    <button
                      className="ctrl ctrl--heart"
                      data-saved={saved ? 'true' : 'false'}
                      disabled={!track}
                      onClick={() => track && toggleFind({
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
                      <svg viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                        <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8z" />
                      </svg>
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

                  {/* The Spotify widget is the card's HEADER while it sounds —
                      it replaces our now-row (CSS `order`), carrying the art,
                      title, full-length scrubber, play and "Save on Spotify".
                      GlobalPlayer's fixed strip seats itself over this slot;
                      the iframe can't live in the card's DOM or it would
                      reload on every route change. */}
                  {embedMode && (
                    <div className="spotify-slot" data-spotify-slot aria-hidden />
                  )}
                </div>
              </div>

            {/* Playlist — the FULL curated list in a FIXED order (it never
                reorders as songs play); the sounding track is highlighted in
                place and auto-scrolled into view, Spotify-style. */}
            <div className="center__up-next" hidden={!hasTrack}>
              <h3 className="center__up-next-title">{STR.card.playlist}</h3>
              <ul className="center__queue" ref={queueRef} aria-label="Playlist">
                {tracks.length === 0 ? (
                  <li className="center__queue-empty">{STR.card.noTracks}</li>
                ) : (
                  tracks.map((t, j) => {
                    const isCurrent = j === trackIdx;
                    // Key includes the position: if the pool ever holds two
                    // entries of one track, keys stay unique — duplicate keys
                    // made React recycle rows with stale click handlers.
                    return (
                      <li
                        key={`${j}-${t.id}`}
                        className="center__queue-item"
                        data-current={isCurrent ? 'true' : 'false'}
                        role="button"
                        tabIndex={0}
                        aria-current={isCurrent ? 'true' : undefined}
                        onClick={() => { setTrackIdx(j); setIsPlaying(true); }}
                        onKeyDown={(e) => { if (e.key === 'Enter') { setTrackIdx(j); setIsPlaying(true); } }}
                      >
                        {t.image
                          ? <img className="qrow__img" src={t.image} alt="" loading="lazy" />
                          : <span className="qrow__img" />}
                        <span className="qrow__main">
                          <span className="qrow__title">
                            {isCurrent && <EqualizerIcon playing={isPlaying} />}
                            {t.title}
                          </span>
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

      {/* Share — full menu with names (body portal to escape card clip). */}
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


/**
 * Bottom-center dock — the three verbs of the app:
 *   shuffle (surprise) · liked songs (popup with playlists) · more (menu).
 * The more menu holds Language, Contact us, About us.
 */
export function Dock({ onSurprise }: { onSurprise?: () => void } = {}) {
  const { surprise, lockedLeft, lockedRight } = useStore();
  const finds = useFinds();
  const dockTheme = usePathname() === '/world' ? 'dark' : 'light';

  const [likedOpen, setLikedOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [submenu, setSubmenu] = useState<null | 'lang'>(null);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [contactOpen, setContactOpen] = useState(false);
  const [lang, setLang] = useState('en');

  useEffect(() => {
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

      {/* Same per-stage ink as the top nav: dark icons on the Circle's light
          stage, white on the World's globe. */}
      <div className="dock" data-theme={dockTheme}>
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
          {/* Count badge removed by request — the filled heart already says
              "you have likes"; the red bubble read as an error state. */}
          <svg width="16" height="16" viewBox="0 0 24 24" fill={finds.length ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8z" />
          </svg>
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

              {/* Contact us — in-app popup (note + song suggestion). */}
              <button
                role="menuitem"
                className="dock-menu__row"
                onClick={() => { setContactOpen(true); closeMenu(); }}
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
            </div>
          </>
        )}
      </div>

      <LikedSongs open={likedOpen} onClose={() => setLikedOpen(false)} />
      <ContactPopup open={contactOpen} onClose={() => setContactOpen(false)} />

      {/* About — portaled to <body>: the page frames set `isolation: isolate`,
          so anything rendered inside them is trapped in that stacking context
          and can never paint above the Spotify strip (a root-level fixed
          overlay). Portaling puts this at the same level, where its z-index
          actually wins. */}
      {aboutOpen && typeof document !== 'undefined' && createPortal(
        <>
          <div className="dock-scrim dock-scrim--dim" onClick={() => setAboutOpen(false)} />
          <div className="about-card" role="dialog" aria-label={STR.menu.about}>
            <h2>{STR.menu.aboutTitle}</h2>
            <p>
              {STR.menu.aboutIntro}
              <a href={STR.menu.aboutChanUrl} target="_blank" rel="noreferrer">{STR.menu.aboutChan}</a>
              {STR.menu.aboutAnd}
              <a href={STR.menu.aboutMaddyUrl} target="_blank" rel="noreferrer">{STR.menu.aboutMaddy}</a>
              {STR.menu.aboutBody}
            </p>
            <button onClick={() => setAboutOpen(false)}>{STR.library.close}</button>
            <footer className="about-card__foot">
              <p className="about-card__apis">{STR.menu.aboutApis}</p>
              <p className="about-card__made">{STR.menu.aboutMade}</p>
            </footer>
          </div>
        </>,
        document.body,
      )}
    </>
  );
}

