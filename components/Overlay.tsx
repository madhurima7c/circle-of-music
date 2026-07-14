'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useStore } from '@/lib/store';
import { COUNTRIES, GENRES } from '@/lib/data';
import { illustrationGradientPair } from '@/lib/illustration';
import { trackLinks } from '@/lib/links';

export function Title() {
  return (
    <Link
      href="/"
      className="title absolute left-1/2 top-[38px] z-30 -translate-x-1/2 text-[38px] text-[var(--accent)] select-none no-underline"
      title="Back to the hub"
    >
      Circle of Music
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
 * Connector lines from each wheel toward the center card in the selected
 * state. Drawn at z-index −1 inside the frame's stacking context so the
 * wheel canvas and the center card paint over them — each line visually
 * ends exactly at the edge of the cover art at any viewport size.
 * (The black country/genre tags that used to sit on these lines were
 * removed — they overlapped the cover art and duplicated the card's
 * own chips header.)
 */
export function ConnectorTags() {
  const { status } = useStore();
  const visible = status === 'ready';

  return (
    <>
      <div
        className="absolute top-1/2 z-[-1] h-px bg-black transition-opacity duration-500"
        style={{ left: '24%', right: '50%', opacity: visible ? 1 : 0, transitionDelay: '300ms' }}
      />
      <div
        className="absolute top-1/2 z-[-1] h-px bg-black transition-opacity duration-500"
        style={{ left: '50%', right: '24%', opacity: visible ? 1 : 0, transitionDelay: '300ms' }}
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
export function CenterStack() {
  const {
    tracks, trackIdx, status, isPlaying, countryIdx, genreIdx,
    togglePlay, nextTrack, prevTrack, shuffleTracks, autoplayBlocked,
  } = useStore();
  const country = COUNTRIES[countryIdx] ?? '';
  const genre   = GENRES[genreIdx]      ?? '';
  const track   = tracks[trackIdx];

  // Audio itself lives in <GlobalPlayer> (root layout) so playback survives
  // navigation — this card is pure UI over the same store.

  // Deep links out for the current track — pure local URLs, no API.
  const links = track ? trackLinks(track.artist, track.title, track.id) : null;

  // Stable HSL pair consumed by the pending-view gradient.
  const gradient = illustrationGradientPair(country, genre);

  const pending  = status === 'populating' || status === 'error';
  const hasTrack = status === 'ready' && !!track;

  return (
    <div className="absolute left-1/2 top-1/2 z-[5] -translate-x-1/2 -translate-y-1/2">
      {status !== 'empty' && (
        <div className="center__stack">
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
            <header className="center__chips" hidden={pending}>
              <span className="chip--country-mini">{country.toUpperCase()}</span>
              <span className="chip--genre-mini">{genre.toUpperCase()}</span>
            </header>

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
                {status === 'error'
                  ? 'Could not find music\nfrom these pairing,\ntry something different.'
                  : 'Populating music...'}
              </p>
            </div>

            <div className="center__track" hidden={!hasTrack}>
              <div className="center__controls">
                <button className="ctrl" onClick={prevTrack} title="Previous" aria-label="Previous">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M5 6v12" />
                    <path d="M19 6L9 12l10 6V6z" />
                  </svg>
                </button>
                <button className="ctrl ctrl--lg" onClick={togglePlay} title="Play / pause" aria-label="Play / pause">
                  <svg className="ctrl__play" viewBox="0 0 24 24" fill="currentColor"><path d="M9.5 7.5v9L16 12 9.5 7.5z" /></svg>
                  <svg className="ctrl__pause" viewBox="0 0 24 24" fill="currentColor"><path d="M8 7h3v10H8zm5 0h3v10h-3z" /></svg>
                </button>
                <button className="ctrl" onClick={nextTrack} title="Next" aria-label="Next">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M5 6l10 6-10 6V6z" />
                    <path d="M19 6v12" />
                  </svg>
                </button>
                <button className="ctrl" onClick={() => shuffleTracks(true)} title="Shuffle" aria-label="Shuffle">
                  {/* Lucide "shuffle" (MIT), optimized for 16×16 glyph in 32px button */}
                  <svg className="ctrl__icon-shuffle" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <polyline points="16 3 21 3 21 8" />
                    <line x1="4" y1="20" x2="21" y2="3" />
                    <polyline points="21 16 21 21 16 21" />
                    <line x1="15" y1="15" x2="21" y2="21" />
                    <line x1="4" y1="4" x2="9" y2="9" />
                  </svg>
                </button>
              </div>

              {/* Continue this find in the listener's own app. */}
              {links && (
                <div className="center__links">
                  <span className="center__links-label">open in</span>
                  <a href={links.spotify}    target="_blank" rel="noreferrer">Spotify</a>
                  <a href={links.appleMusic} target="_blank" rel="noreferrer">Apple</a>
                  <a href={links.youtube}    target="_blank" rel="noreferrer">YouTube</a>
                  <a href={links.deezer}     target="_blank" rel="noreferrer">Deezer</a>
                </div>
              )}

              <div className="center__now">
                <div className="center__cover-wrap">
                  {track?.image
                    ? <img className="center__cover" src={track.image} alt="" />
                    : <div className="center__cover" />}
                </div>
                <div className="center__meta">
                  <h2 className="center__title">{track?.title}</h2>
                  <p className="center__album">
                    {track ? `${track.album} — ${track.artist}${track.releaseDate ? ` · ${track.releaseDate}` : ''}` : ''}
                  </p>
                </div>
              </div>

              <div className="center__up-next">
                <h3 className="center__up-next-title">Up next:</h3>
                <ul className="center__queue" aria-label="Queued tracks">
                  {tracks.length <= 1 ? (
                    <li className="center__queue-empty">
                      {tracks.length === 0 ? 'No tracks.' : 'No other tracks in this queue.'}
                    </li>
                  ) : (
                    Array.from({ length: tracks.length - 1 }, (_, step) => {
                      const j = (trackIdx + 1 + step) % tracks.length;
                      const t = tracks[j];
                      return (
                        <li key={t.id} className="center__queue-item">
                          {t.artist ? `${t.title} — ${t.artist}` : t.title}
                        </li>
                      );
                    })
                  )}
                </ul>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** Must match `.letter-ladder { --ladder-row }` in globals.css */
const LADDER_ROW = 11;

/**
 * Letter ladder — Maddy's alphabet rail (src/wheel.js buildLadder/updateLadder),
 * ported to React. One 11px row per wheel item: each row holds a clickable
 * 1px tick that snaps the wheel to that item. The active row's tick hides and
 * a square letter chip (first letter of the selection) sits centered on it.
 */
export function Dial({ side }: { side: 'left' | 'right' }) {
  const { countryIdx, genreIdx, setCountry, setGenre } = useStore();
  const items  = side === 'left' ? COUNTRIES : GENRES;
  const idx    = side === 'left' ? countryIdx : genreIdx;
  const snapTo = side === 'left' ? setCountry : setGenre;
  const letter = (items[idx] || '?')[0]?.toUpperCase() || '?';

  return (
    <div className={`letter-ladder letter-ladder--${side}`}>
      {items.map((label, i) => (
        <div key={label} className="letter-ladder__row">
          <button
            type="button"
            className="letter-ladder__tick"
            title={label}
            data-active={i === idx ? 'true' : 'false'}
            onClick={() => snapTo(i)}
          />
        </div>
      ))}
      <span
        className="letter-ladder__chip"
        style={{ top: idx * LADDER_ROW + LADDER_ROW / 2 }}
      >
        {letter}
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
  const label  = side === 'left' ? 'country wheel' : 'genre wheel';

  return (
    <button
      type="button"
      className={`wheel-lock wheel-lock--${side}`}
      data-locked={locked ? 'true' : 'false'}
      onClick={toggle}
      title={`${locked ? 'Unlock' : 'Lock'} the ${label}`}
      aria-label={`${locked ? 'Unlock' : 'Lock'} the ${label}`}
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
            {handCount} hand{handCount === 1 ? '' : 's'}
          </div>
        </div>
      )}
    </>
  );
}

/** Placeholder shown in the camera-frame slot when the webcam can't be used. */
function CameraUnavailable({ status }: { status: CameraStatus }) {
  const headline =
    status === 'in-use'    ? 'Camera in use'    :
    status === 'denied'    ? 'Camera blocked'   :
    status === 'no-device' ? 'No camera found'  :
                             'Camera unavailable';
  const detail =
    status === 'in-use'    ? 'Another app (Zoom, Meet, FaceTime…) is using it. Use the mouse to scroll the wheels.' :
    status === 'denied'    ? 'Grant camera permission in your browser, then refresh.' :
    status === 'no-device' ? 'Plug in a webcam, then refresh. The wheels still respond to mouse scroll & drag.' :
                             'Use the mouse to scroll the wheels.';
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
  const text =
    toast.kind === 'play'         ? '▶ Play'  :
    toast.kind === 'pause'        ? '⏸ Pause' :
    toast.kind === 'next'         ? '⏭ Next'  :
    toast.kind === 'prev'         ? '⏮ Prev'  :
    toast.kind === 'shuffle'      ? '🔀 Shuffle' :
    toast.kind === 'lock-left'    ? '🔒 Country locked' :
    toast.kind === 'unlock-left'  ? '🔓 Country unlocked' :
    toast.kind === 'lock-right'   ? '🔒 Genre locked' :
    toast.kind === 'unlock-right' ? '🔓 Genre unlocked' :
    toast.kind === 'select-left'  ? '✓ Country' :
    /* select-right */              '✓ Genre';
  return (
    <div
      className="pointer-events-none absolute left-1/2 top-[15%] z-40 -translate-x-1/2 rounded-full bg-black/80 px-4 py-2 text-[13px] text-white"
      style={{ fontFamily: 'var(--font-mono)' }}
    >
      {text}
    </div>
  );
}

/** Bottom-center icon dock — hand-mode toggle + info + recommend. */
export function Dock() {
  const { handMode, toggleHandMode } = useStore();
  // Hand tracking makes no sense on touch-primary devices — hide the toggle.
  const [coarse, setCoarse] = useState(false);
  useEffect(() => {
    setCoarse(window.matchMedia('(pointer: coarse)').matches);
  }, []);
  return (
    <div
      className="absolute z-20 flex items-center gap-1.5 rounded-full bg-white px-2.5 py-1.5"
      style={{
        left: '50%',
        bottom: 36,
        transform: 'translateX(-50%)',
        boxShadow:
          '0 1px 2px rgba(0,0,0,0.06), 0 8px 24px rgba(0,0,0,0.10), 0 0 0 1px rgba(0,0,0,0.04)',
      }}
    >
      {!coarse && (
        <button
          onClick={toggleHandMode}
          className="flex size-10 items-center justify-center rounded-full transition-[background-color,transform] duration-150 ease-[cubic-bezier(0.2,0,0,1)] active:scale-[0.96]"
          style={{
            background: handMode ? 'var(--accent)' : 'transparent',
            color:      handMode ? '#fff' : '#262626',
          }}
          title={handMode ? 'Turn off hand control' : 'Control with your hands (webcam)'}
          aria-label={handMode ? 'Turn off hand control' : 'Turn on hand control'}
          aria-pressed={handMode}
        >
          {/* hand outline */}
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 11V6a2 2 0 0 0-4 0v5" />
            <path d="M14 10V4a2 2 0 0 0-4 0v6" />
            <path d="M10 10.5V6a2 2 0 0 0-4 0v8" />
            <path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15" />
          </svg>
        </button>
      )}
      <button
        className="flex size-10 items-center justify-center rounded-full text-neutral-800 transition-[background-color,transform] duration-150 ease-[cubic-bezier(0.2,0,0,1)] hover:bg-neutral-100 active:scale-[0.96]"
        aria-label="info"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
          <circle cx="12" cy="12" r="9" />
          <path d="M12 8h.01" />
          <path d="M11 12h1v5h1" />
        </svg>
      </button>
      <button
        onClick={() => {
          const subject = encodeURIComponent('Circle of Music recommendation');
          window.location.href = `mailto:?subject=${subject}&body=Add an artist or album you'd recommend: `;
        }}
        className="flex size-10 items-center justify-center rounded-full text-neutral-800 transition-[background-color,transform] duration-150 hover:bg-neutral-100 active:scale-[0.96]"
        aria-label="recommend"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 5h18v12H7l-4 4z" />
        </svg>
      </button>
    </div>
  );
}

export function Hint() {
  const { handMode } = useStore();
  return (
    <div
      className="absolute z-[25] text-[10.5px] tracking-[0.04em] text-black/55"
      style={{ left: 28, bottom: 12 }}
    >
      {handMode
        ? <>👆 move your hand to aim the cursor · 🤏 pinch &amp; hold ~1s on a button to press it · pinch over a wheel and move up/down to spin it</>
        : <>↕ drag or scroll a wheel to spin it · click a letter to jump · ✋ hand control available in the dock below</>}
    </div>
  );
}

export function MenuMark() {
  return (
    <div className="absolute right-7 top-7 z-30 flex w-[22px] cursor-pointer flex-col gap-1">
      <span className="block h-0.5 self-end bg-neutral-800" style={{ width: '60%' }} />
      <span className="block h-0.5 bg-neutral-800" />
      <span className="block h-0.5 self-end bg-neutral-800" style={{ width: '80%' }} />
    </div>
  );
}

