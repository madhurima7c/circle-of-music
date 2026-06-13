'use client';

import { useEffect, useRef, useState } from 'react';
import { useStore } from '@/lib/store';
import { COUNTRIES, GENRES } from '@/lib/data';
import { illustrationGradientPair } from '@/lib/illustration';

export function Title() {
  return (
    <div className="title pointer-events-none absolute left-1/2 top-[38px] z-30 -translate-x-1/2 text-[38px] text-[var(--accent)] select-none">
      Circle of Music
    </div>
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
 * Tags + connector lines in the selected state.
 * Uses pixel-positioned absolutely-placed elements anchored to the center.
 */
export function ConnectorTags() {
  const { countryIdx, genreIdx, status } = useStore();
  const visible = status === 'ready';
  const country = COUNTRIES[countryIdx];
  const genre   = GENRES[genreIdx];

  return (
    <>
      <div
        className="absolute top-1/2 z-[8] tabular -translate-y-1/2 px-3.5 py-1.5 text-[12px] tracking-[0.16em] text-white transition-opacity duration-300"
        style={{ left: '20%', background: '#111', opacity: visible ? 1 : 0 }}
      >
        {country.toUpperCase()}
      </div>
      <div
        className="absolute top-1/2 z-[8] tabular -translate-y-1/2 px-3.5 py-1.5 text-[12px] tracking-[0.16em] text-white transition-opacity duration-300"
        style={{ right: '20%', background: '#111', opacity: visible ? 1 : 0 }}
      >
        {genre.toUpperCase()}
      </div>
      {/* horizontal connectors from each side toward center */}
      <div
        className="absolute top-1/2 z-[4] h-px bg-black transition-opacity duration-500"
        style={{ left: '24%', right: '50%', opacity: visible ? 1 : 0, transitionDelay: '300ms' }}
      />
      <div
        className="absolute top-1/2 z-[4] h-px bg-black transition-opacity duration-500"
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
    togglePlay, setIsPlaying, nextTrack, prevTrack, shuffleTracks,
  } = useStore();
  const country = COUNTRIES[countryIdx] ?? '';
  const genre   = GENRES[genreIdx]      ?? '';
  const track   = tracks[trackIdx];

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [autoplayBlocked, setAutoplayBlocked] = useState(false);

  // Stable HSL pair consumed by the pending-view gradient.
  const gradient = illustrationGradientPair(country, genre);

  const pending  = status === 'populating' || status === 'error';
  const hasTrack = status === 'ready' && !!track;

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
    // Maddy's loadCurrent always autoplays; a rejected play() means the
    // browser wants a user gesture first — surface it on the play button.
    audio.play().catch(() => setAutoplayBlocked(true));
  }, [track?.id, track?.preview]);  // eslint-disable-line react-hooks/exhaustive-deps

  /* ---------- sync isPlaying with the audio element ---------- */
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (isPlaying) audio.play().catch(() => setIsPlaying(false));
    else           audio.pause();
  }, [isPlaying, setIsPlaying]);

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

              <audio
                ref={audioRef}
                preload="auto"
                playsInline
                onPlay={() => { setIsPlaying(true); setAutoplayBlocked(false); }}
                onPause={() => setIsPlaying(false)}
                onEnded={onEnded}
              />
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
  modelComplexity: 1,
  minDetectionConfidence: 0.7,
  minTrackingConfidence:  0.5,

  /* EMA on every landmark.  smoothed = α·current + (1−α)·previous  */
  smoothAlpha: 0.35,

  /* Palm-velocity dead zone (screen pixels per frame). Below this we
   * treat the hand as stationary — no scroll, and pinch is allowed. */
  deadZoneVelocityPx: 6,

  /* Zone boundaries as fractions of screen width (post X-mirror). */
  leftZoneMax:  0.35,
  rightZoneMin: 0.65,
  /* Sticky zone — must observe the new zone for this long before
   * the assignment switches, to defeat cross-talk on fast moves. */
  zoneHysteresisMs: 300,

  /* Scroll throttle */
  scrollDistancePerStep: 50,   // px palm travel between scroll triggers
  scrollCooldownMs:      60,   // floor between scroll triggers
  flickVelocityPx:       35,   // peak palm-Y speed (px/frame) that counts as flick
  flickMaxSteps:          3,   // a single flick can fire at most this many steps

  /* Pinch / select */
  pinchDistanceNorm:   0.045,  // thumb-tip ↔ index-tip distance, normalized
  pinchDwellMs:        350,
  selectCooldownMs:    500,

  /* Hand identity */
  handMatchMaxNormDistance: 0.25,  // wrist-to-wrist threshold for matching across frames
  handStaleMs:              250,   // tracked hand expires if not seen for this long
} as const;

type Zone = 'left' | 'right' | 'center';

type Landmark = { x: number; y: number; z: number };

type TrackedHand = {
  /** EMA-smoothed landmarks (normalized coords from MediaPipe).      */
  smoothed: Landmark[] | null;
  /** Last frame's palm-center position in screen px, for velocity.   */
  prevPalmScreen: { x: number; y: number } | null;

  /** Currently-assigned zone (with hysteresis applied).              */
  zone: Zone;
  /** Zone the hand is trying to move into, but not yet committed.    */
  zoneCandidate: Zone | null;
  zoneCandidateSince: number;

  /** Screen Y where the last scroll step fired (distance throttle).  */
  scrollAnchorY: number | null;
  lastScrollAt:  number;

  /** Pinch dwell — null when not currently dwelling.                 */
  pinchDwellStart:     number | null;
  selectCooldownUntil: number;
  /** True for one render after a successful select so a glow shows.  */
  selectFlashUntil:    number;

  /** Used by the matcher to expire stale tracks.                     */
  lastSeenAt: number;
};

const PALM_LM = [0, 5, 9, 13, 17] as const;

function newTrackedHand(): TrackedHand {
  return {
    smoothed: null,
    prevPalmScreen: null,
    zone: 'center',
    zoneCandidate: null,
    zoneCandidateSince: 0,
    scrollAnchorY: null,
    lastScrollAt: 0,
    pinchDwellStart: null,
    selectCooldownUntil: 0,
    selectFlashUntil: 0,
    lastSeenAt: 0,
  };
}

function zoneFromWristX(mirroredX: number): Zone {
  if (mirroredX <= CFG.leftZoneMax)  return 'left';
  if (mirroredX >= CFG.rightZoneMin) return 'right';
  return 'center';
}

function distNorm(a: Landmark, b: Landmark): number {
  const dx = a.x - b.x, dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

export function HandTracking() {
  const [cameraStatus, setCameraStatus] = useState<CameraStatus>('connecting');
  /* React state purely for UI: how many hands MediaPipe is currently seeing,
   * and whether either side is mid-dwell (drives a glow on the preview).
   * Gesture logic itself runs off refs, not React state, to avoid re-renders. */
  const [handCount,    setHandCount]    = useState(0);
  const [dwellState,   setDwellState]   = useState<{ left: number; right: number }>(
    { left: 0, right: 0 },
  );

  const { spinLeft, spinRight, commit, flashToast } = useStore();
  // Mirror live store dispatchers into refs so the requestAnimationFrame
  // loop doesn't have to be torn down and rebuilt every time React renders.
  const spinLeftRef  = useRef(spinLeft);  spinLeftRef.current  = spinLeft;
  const spinRightRef = useRef(spinRight); spinRightRef.current = spinRight;
  const commitRef    = useRef(commit);    commitRef.current    = commit;
  const toastRef     = useRef(flashToast); toastRef.current    = flashToast;

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
      let lastDwellLeft  = -1;
      let lastDwellRight = -1;

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
           *  2. Process each assigned hand: smooth → zone → scroll
           *     → pinch dwell. Wheels are spun via store actions —
           *     the wheels themselves are not touched.
           * -------------------------------------------------------- */
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

            /* 2b. Palm center (smoothed) in screen px. */
            let px = 0, py = 0;
            for (const k of PALM_LM) { px += sm[k].x; py += sm[k].y; }
            px /= PALM_LM.length; py /= PALM_LM.length;
            // Mirror X so the on-screen feel matches the mirrored video.
            const palmScreen = {
              x: (1 - px) * window.innerWidth,
              y:      py  * window.innerHeight,
            };
            const palmVelocity = th.prevPalmScreen
              ? {
                  x: palmScreen.x - th.prevPalmScreen.x,
                  y: palmScreen.y - th.prevPalmScreen.y,
                }
              : { x: 0, y: 0 };
            const palmSpeed = Math.hypot(palmVelocity.x, palmVelocity.y);
            th.prevPalmScreen = palmScreen;

            /* 2c. Zone from mirrored wrist X, with hysteresis. */
            const wristMirrorX = 1 - sm[0].x;
            const observedZone = zoneFromWristX(wristMirrorX);
            if (observedZone !== th.zone) {
              if (th.zoneCandidate !== observedZone) {
                th.zoneCandidate      = observedZone;
                th.zoneCandidateSince = now;
              } else if (now - th.zoneCandidateSince >= CFG.zoneHysteresisMs) {
                th.zone          = observedZone;
                th.zoneCandidate = null;
                // Zone change resets the scroll anchor so the new wheel doesn't
                // inherit the previous wheel's distance-throttle state.
                th.scrollAnchorY = null;
              }
            } else {
              th.zoneCandidate = null;
            }

            /* 2d. Draw skeleton on the preview canvas, colored by zone. */
            const stroke =
              th.zone === 'left'  ? 'rgba(60,220,130,0.95)' :
              th.zone === 'right' ? 'rgba(255,100,200,0.95)' :
                                    'rgba(180,180,180,0.55)';
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

            /* If this hand isn't in a wheel zone, skip dispatching anything. */
            if (th.zone === 'center') {
              // Still in dead zone — cancel any in-progress dwell so it can't
              // resume mid-air.
              th.pinchDwellStart = null;
              continue;
            }

            const moving      = palmSpeed > CFG.deadZoneVelocityPx;
            const isInCooldown = now < th.selectCooldownUntil;
            const spinFn = th.zone === 'left' ? spinLeftRef.current : spinRightRef.current;

            /* 2e. Scrolling — distance-throttled with optional flick boost.
             * The anchor is the screen Y where we last fired a scroll step;
             * we won't fire another until the palm has moved at least 50 px
             * since then. Combined with the dead zone this means a single
             * sweep can only fire as many steps as the sweep length / 50. */
            if (moving) {
              if (th.scrollAnchorY === null) th.scrollAnchorY = palmScreen.y;
              const delta = palmScreen.y - th.scrollAnchorY;
              const absDelta = Math.abs(delta);
              if (absDelta >= CFG.scrollDistancePerStep &&
                  now - th.lastScrollAt >= CFG.scrollCooldownMs) {
                const dir = delta > 0 ? 1 : -1;
                // Flick boost: high peak Y-speed → fire extra steps proportional
                // to how fast the palm was moving, capped at flickMaxSteps.
                let steps = 1;
                if (Math.abs(palmVelocity.y) >= CFG.flickVelocityPx) {
                  const ratio = Math.abs(palmVelocity.y) / CFG.flickVelocityPx;
                  steps = Math.min(CFG.flickMaxSteps, Math.max(1, Math.round(ratio)));
                }
                for (let k = 0; k < steps; k++) spinFn(dir);
                th.scrollAnchorY = palmScreen.y;
                th.lastScrollAt  = now;
              }
            } else {
              // Stationary — reset the anchor so the next motion starts fresh.
              th.scrollAnchorY = null;
            }

            /* 2f. Pinch dwell — only when stationary, not scrolling, not in
             * cooldown. Fingers naturally come together during a scroll sweep,
             * so this stationary-only guard is what prevents constant false
             * commits. */
            const pinchDist = distNorm(sm[4], sm[8]);
            const isPinching = pinchDist < CFG.pinchDistanceNorm;
            const canStartDwell = !moving && !isInCooldown && isPinching;

            if (canStartDwell) {
              if (th.pinchDwellStart === null) th.pinchDwellStart = now;
              const elapsed = now - th.pinchDwellStart;
              if (elapsed >= CFG.pinchDwellMs) {
                commitRef.current();
                toastRef.current({
                  kind: th.zone === 'left' ? 'select-left' : 'select-right',
                });
                th.pinchDwellStart     = null;
                th.selectCooldownUntil = now + CFG.selectCooldownMs;
                th.selectFlashUntil    = now + 400;
              }
            } else {
              // Releasing or moving cancels the dwell.
              th.pinchDwellStart = null;
            }
          }

          /* --------------------------------------------------------
           *  3. Decay state for tracked slots that weren't matched.
           * -------------------------------------------------------- */
          for (let t = 0; t < tracked.length; t++) {
            if (claimed[t]) continue;
            const th = tracked[t];
            if (th.smoothed && (now - th.lastSeenAt) > CFG.handStaleMs) {
              // Stale — wipe state so this slot is reusable.
              th.smoothed          = null;
              th.prevPalmScreen    = null;
              th.zone              = 'center';
              th.zoneCandidate     = null;
              th.scrollAnchorY     = null;
              th.pinchDwellStart   = null;
            }
          }

          /* --------------------------------------------------------
           *  4. Publish UI-visible state.
           * -------------------------------------------------------- */
          const visibleCount = detected.length;
          if (visibleCount !== lastHandCount) {
            lastHandCount = visibleCount;
            setHandCount(visibleCount);
          }

          // Highest dwell progress on each side, for the on-preview rings.
          let dl = 0, dr = 0;
          for (const th of tracked) {
            if (!th.smoothed) continue;
            if (th.selectFlashUntil > now) {
              if (th.zone === 'left')  dl = Math.max(dl, 1);
              if (th.zone === 'right') dr = Math.max(dr, 1);
              continue;
            }
            if (th.pinchDwellStart !== null) {
              const p = Math.min(1, (now - th.pinchDwellStart) / CFG.pinchDwellMs);
              if (th.zone === 'left')  dl = Math.max(dl, p);
              if (th.zone === 'right') dr = Math.max(dr, p);
            }
          }
          // Throttle React updates to whenever the value visibly changes.
          const dlQ = Math.round(dl * 12);
          const drQ = Math.round(dr * 12);
          if (dlQ !== lastDwellLeft || drQ !== lastDwellRight) {
            lastDwellLeft  = dlQ;
            lastDwellRight = drQ;
            setDwellState({ left: dl, right: dr });
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
    };
  }, []);  // eslint-disable-line react-hooks/exhaustive-deps  — store dispatch is read via refs

  if (cameraStatus !== 'ok' && cameraStatus !== 'connecting') {
    return <CameraUnavailable status={cameraStatus} />;
  }

  /* Webcam preview: 150 × 100, bottom-right, rounded. Hand-count badge in the
   * top-left. Two small dwell rings (one per side) overlay the corners as
   * users dwell-pinch. */
  return (
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

      {/* Per-side dwell rings */}
      <DwellRing progress={dwellState.left}  position="bottomLeft"  color="rgba(60,220,130,0.95)" />
      <DwellRing progress={dwellState.right} position="bottomRight" color="rgba(255,100,200,0.95)" />
    </div>
  );
}

/** Quarter-ring progress indicator pinned to a corner of the preview. */
function DwellRing({
  progress,
  position,
  color,
}: {
  progress: number;
  position: 'bottomLeft' | 'bottomRight';
  color: string;
}) {
  const isLeft = position === 'bottomLeft';
  // 18px ring, animated by SVG dash. progress in [0..1].
  const R = 8;
  const C = 2 * Math.PI * R;
  const dash = `${progress * C} ${C}`;
  return (
    <svg
      width="20"
      height="20"
      viewBox="-10 -10 20 20"
      style={{
        position: 'absolute',
        [isLeft ? 'left' : 'right']: 6,
        bottom: 6,
        opacity: progress > 0 ? 1 : 0.35,
        transition: 'opacity 120ms ease-out',
        pointerEvents: 'none',
      }}
    >
      <circle r={R} fill="none" stroke="rgba(255,255,255,0.18)" strokeWidth="2" />
      <circle
        r={R}
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeDasharray={dash}
        transform="rotate(-90)"
        style={{ transition: 'stroke-dasharray 60ms linear' }}
      />
    </svg>
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

/** Bottom-center icon dock — info + recommend (no more Spotify popover). */
export function Dock() {
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
  return (
    <div
      className="absolute z-[25] text-[10.5px] tracking-[0.04em] text-black/55"
      style={{ left: 28, bottom: 12 }}
    >
      ↕ scroll a wheel · ✋ left hand → left wheel, right hand → right wheel · ↕ move hand to scroll · 🤏 hold steady + pinch to select
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

