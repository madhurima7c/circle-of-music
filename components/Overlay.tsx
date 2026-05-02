'use client';

import { useEffect, useState } from 'react';
import { useStore } from '@/lib/store';
import { COUNTRIES, GENRES } from '@/lib/data';

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
        opacity: status === 'populating' ? 1 : 0,
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

/**
 * Center-stack of album covers. Stacked front-to-back along Z, dissolving in
 * with a per-card stagger when the status flips to 'ready'.
 */
export function CenterStack() {
  const { tracks, trackIdx, status, setTrackIdx } = useStore();
  if (status !== 'ready' || tracks.length === 0) return null;

  return (
    <div
      className="absolute left-1/2 top-1/2 z-[5] -translate-x-1/2 -translate-y-1/2"
      style={{ width: 320, height: 220, perspective: 1400, transformStyle: 'preserve-3d' }}
    >
      {tracks.slice(0, 6).map((track, i) => {
        const offset = i - trackIdx;
        const dist = Math.abs(offset);
        const z = -dist * 70;
        return (
          <button
            key={i}
            onClick={() => setTrackIdx(i)}
            className="img-outline absolute inset-0 cursor-pointer overflow-hidden rounded-[10px] bg-neutral-300 transition-[transform,opacity,filter] duration-500 ease-[cubic-bezier(.2,.8,.2,1)]"
            style={{
              transform: `translateZ(${z}px) translateY(${offset * 4}px) scale(${1 - dist * 0.04})`,
              zIndex: 100 - dist,
              opacity: 1,
              filter: offset !== 0 ? `blur(${Math.min(2.4, dist * 0.7).toFixed(2)}px)` : 'none',
              boxShadow:
                '0 24px 60px rgba(0,0,0,0.22), 0 8px 18px rgba(0,0,0,0.10), 0 0 0 1px rgba(0,0,0,0.08)',
              animationName: 'dissolve-in',
              animationDuration: '600ms',
              animationFillMode: 'backwards',
              animationDelay: `${i * 90}ms`,
              animationTimingFunction: 'cubic-bezier(.2,.8,.2,1)',
            }}
          >
            <div
              className="absolute inset-0 bg-neutral-800 bg-cover bg-center"
              style={{ backgroundImage: `url('${track.image}')` }}
            />
            <div className="absolute right-3.5 top-3.5 flex size-7 items-center justify-center rounded-full bg-white/90 text-[11px] text-black">
              ▶
            </div>
            <div
              className="absolute bottom-4 left-4 text-white"
              style={{
                fontFamily: 'var(--font-sans)',
                textShadow: '0 2px 8px rgba(0,0,0,0.4)',
              }}
            >
              <div className="text-[16px] font-medium">{track.title}</div>
              <div className="mt-0.5 text-[12px] font-light tracking-wider opacity-90">
                {track.artist}
              </div>
            </div>
          </button>
        );
      })}
      <style jsx>{`
        @keyframes dissolve-in {
          0%   { opacity: 0; filter: blur(14px); }
          100% { opacity: 1; }
        }
      `}</style>
    </div>
  );
}

/**
 * Alphabetical dial — vertical tick column with a moving readout box.
 */
export function Dial({ side, item }: { side: 'left' | 'right'; item: string }) {
  const ch = (item ?? '')[0]?.toUpperCase() ?? 'A';
  const code = ch.charCodeAt(0) - 65;
  const ratio = Math.max(0, Math.min(1, code / 25));

  const ticks = Array.from({ length: 26 });

  return (
    <div
      className="pointer-events-none absolute top-1/2 z-[12] w-[18px] -translate-y-1/2 select-none"
      style={{ [side]: 18 } as React.CSSProperties}
    >
      <div className="relative h-[360px] w-full">
        {ticks.map((_, i) => (
          <div
            key={i}
            className="absolute left-0 h-px bg-neutral-600"
            style={{
              top: `${(i / 25) * 100}%`,
              width: i % 2 === 0 ? '100%' : '50%',
              opacity: 0.45,
            }}
          />
        ))}
      </div>
      <div
        className="tabular absolute flex size-[26px] -translate-y-1/2 items-center justify-center bg-[var(--bg-stage)] text-[12px] text-black ease-[cubic-bezier(0.2,0,0,1)]"
        style={{
          [side === 'left' ? 'left' : 'right']: -26,
          top: `${ratio * 100}%`,
          border: '1px solid #2a2a2a',
          transitionProperty: 'top',
          transitionDuration: '220ms',
        }}
      >
        {ch}
      </div>
    </div>
  );
}

/**
 * Hand-tracking camera. Lazy-loads MediaPipe so the bundle only pays the
 * cost when the feature actually runs.
 */
export function HandTracking() {
  const [hidden, setHidden] = useState(false);
  const { spinLeft, spinRight, commit } = useStore();

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

    const run = async () => {
      const video  = document.getElementById('webcam')      as HTMLVideoElement | null;
      const canvas = document.getElementById('hand-canvas') as HTMLCanvasElement | null;
      if (!video || !canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { width: 320, height: 240, facingMode: 'user' },
          audio: false,
        });
        if (stopped) return;
        video.srcObject = stream;
        await new Promise<void>(r => (video.onloadedmetadata = () => r()));
        await video.play();
        video.style.display = 'block';
        canvas.width = video.videoWidth || 320;
        canvas.height = video.videoHeight || 240;
      } catch {
        setHidden(true);
        return;
      }

      let HandLandmarker, FilesetResolver;
      try {
        ({ HandLandmarker, FilesetResolver } = await import('@mediapipe/tasks-vision'));
      } catch {
        return;
      }

      let landmarker;
      try {
        const vision = await FilesetResolver.forVisionTasks(
          'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.9/wasm'
        );
        landmarker = await HandLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath:
              'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
            delegate: 'GPU',
          },
          runningMode: 'VIDEO',
          numHands: 2,
        });
      } catch {
        return;
      }

      let lastVideoTime = -1;
      let lastSpin: Record<'left' | 'right', number> = { left: 0, right: 0 };
      let lastPinch = 0;

      const tick = () => {
        if (stopped) return;
        if (video.readyState >= 2 && video.currentTime !== lastVideoTime) {
          lastVideoTime = video.currentTime;
          const result = landmarker.detectForVideo(video, performance.now());
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          if (result.landmarks?.length) {
            const now = performance.now();
            for (const lm of result.landmarks) {
              const userLeft = lm[0].x > 0.5; // mirrored
              const stroke = userLeft ? 'rgba(60,220,130,0.95)' : 'rgba(255,100,200,0.95)';
              ctx.lineWidth = 2.2;
              ctx.strokeStyle = stroke;
              for (const [a, b] of HAND_CONNECTIONS) {
                ctx.beginPath();
                ctx.moveTo(lm[a].x * canvas.width, lm[a].y * canvas.height);
                ctx.lineTo(lm[b].x * canvas.width, lm[b].y * canvas.height);
                ctx.stroke();
              }
              ctx.fillStyle = stroke;
              for (const p of lm) {
                ctx.beginPath();
                ctx.arc(p.x * canvas.width, p.y * canvas.height, 2.6, 0, Math.PI * 2);
                ctx.fill();
              }

              // pinch
              const pinch = Math.hypot(lm[4].x - lm[8].x, lm[4].y - lm[8].y);
              const handSize = Math.hypot(lm[0].x - lm[9].x, lm[0].y - lm[9].y);
              if (pinch / Math.max(0.001, handSize) < 0.36) {
                if (now - lastPinch > 700) {
                  lastPinch = now;
                  commit();
                }
                continue;
              }
              // vertical drive
              const dy = lm[9].y - 0.5;
              const mag = Math.abs(dy);
              if (mag < 0.10) continue;
              const cooldown = Math.max(80, 240 - mag * 600);
              const side: 'left' | 'right' = userLeft ? 'left' : 'right';
              if (now - lastSpin[side] < cooldown) continue;
              lastSpin[side] = now;
              const dir = dy > 0 ? 1 : -1;
              if (side === 'left') spinLeft(dir);
              else spinRight(dir);
            }
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
  }, [spinLeft, spinRight, commit]);

  if (hidden) return null;

  return (
    <div
      className="absolute z-20 overflow-hidden rounded-lg bg-neutral-100"
      style={{
        right: 28,
        bottom: 28,
        width: 220,
        height: 150,
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
      {/* corner brackets */}
      <span className="absolute left-2 top-2 size-3.5 border-l-2 border-t-2 border-[#4cd07d]" />
      <span className="absolute bottom-2 right-2 size-3.5 border-b-2 border-r-2 border-[#4cd07d]" />
    </div>
  );
}

/** Bottom-center icon dock with info + message, plus the Spotify popover. */
export function Dock() {
  const [open, setOpen] = useState(false);
  const { spotifyToken, setSpotifyToken, commit } = useStore();
  const [draft, setDraft] = useState('');

  useEffect(() => setDraft(spotifyToken), [spotifyToken]);

  return (
    <>
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
          onClick={() => setOpen(o => !o)}
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

      {/* Spotify popover */}
      <div
        className="absolute z-[22] w-80 rounded-2xl bg-white p-[18px] transition-[opacity,transform] duration-200 ease-[cubic-bezier(0.2,0,0,1)]"
        style={{
          left: '50%',
          bottom: 86,
          transform: `translateX(-50%) translateY(${open ? 0 : 8}px)`,
          opacity: open ? 1 : 0,
          pointerEvents: open ? 'auto' : 'none',
          fontFamily: 'var(--font-sans)',
          boxShadow:
            '0 1px 2px rgba(0,0,0,0.06), 0 18px 60px rgba(0,0,0,0.18), 0 4px 14px rgba(0,0,0,0.08)',
        }}
      >
        <h3 className="mb-1.5 text-[13px] font-medium tracking-wider">Spotify connection</h3>
        <p className="mb-2.5 text-[11px] leading-[1.5] text-neutral-500" style={{ textWrap: 'pretty' as 'pretty' }}>
          Paste a Web API access token to play real previews. Get one from
          developer.spotify.com → Console → Get token.
        </p>
        <input
          value={draft}
          onChange={e => setDraft(e.target.value)}
          type="password"
          placeholder="BQ…"
          autoComplete="off"
          className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-[11px] transition-[border-color,box-shadow] duration-150 focus:border-neutral-900 focus:outline-none focus:ring-[3px] focus:ring-black/5"
          style={{ fontFamily: 'var(--font-mono)' }}
        />
        <div className="mt-2.5 flex gap-2">
          <button
            onClick={() => { setSpotifyToken(draft); setOpen(false); commit(); }}
            className="rounded-lg border border-black bg-black px-3.5 py-2 text-[11px] text-white transition-[background-color,transform] duration-150 hover:bg-neutral-800 active:scale-[0.96]"
          >
            Save & connect
          </button>
          <button
            onClick={() => { setSpotifyToken(''); setDraft(''); }}
            className="rounded-lg border border-neutral-300 px-3.5 py-2 text-[11px] text-neutral-600 transition-[background-color,transform] duration-150 hover:bg-neutral-100 active:scale-[0.96]"
          >
            Clear
          </button>
        </div>
        <p className="mt-2 text-[11px]" style={{ color: spotifyToken ? '#1a8a4a' : '#999' }}>
          {spotifyToken
            ? 'Connected — playing real previews when available.'
            : 'Not connected — running on mock data.'}
        </p>
      </div>
    </>
  );
}

export function Hint() {
  return (
    <div
      className="absolute z-[25] text-[10.5px] tracking-[0.04em] text-black/55"
      style={{ left: 28, bottom: 12 }}
    >
      ↕ scroll a wheel · ✋ raise a hand to track (each side controls one wheel) · 🤏 pinch to commit · ⓘ Spotify
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
