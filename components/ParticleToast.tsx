'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * ParticleToast — a short-lived message that condenses out of particles,
 * holds as text, then dissolves back into particles (nearby dissipation,
 * like the connector waves — not a far scatter). Typography is sampled
 * live from `.center__album` so it always matches the album line in the
 * now-playing section, even with next/font's hashed family names.
 *
 * Lifecycle ≈ 5s (0.7s in · 3.5s hold · 0.8s out), then onDone fires.
 * An optional ⓘ opens a longer explanation; while it's open the toast
 * pins (won't dissolve) so the user can read.
 * prefers-reduced-motion: a plain fade with the same timing.
 */
export function ParticleToast({
  text,
  info,
  onDone,
  inline = false,
  hold = false,
}: {
  text: string;
  info?: string;
  onDone?: () => void;
  /** Render in normal flow (e.g. inside a card) instead of floating. */
  inline?: boolean;
  /** Converge and STAY as text — no dissolve, no onDone (confirmations). */
  hold?: boolean;
}) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  const doneRef = useRef(onDone);
  doneRef.current = onDone;
  const [showInfo, setShowInfo] = useState(false);
  const pinnedRef = useRef(false);
  pinnedRef.current = showInfo;

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;

    // Match the album line's font (family may be hashed by next/font, so
    // read it off a probe element carrying the real class).
    const probe = document.createElement('span');
    probe.className = 'center__album';
    probe.style.position = 'absolute';
    probe.style.visibility = 'hidden';
    document.body.appendChild(probe);
    const cs = getComputedStyle(probe);
    const font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
    probe.remove();

    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const measure = document.createElement('canvas').getContext('2d')!;
    measure.font = font;
    const w = Math.ceil(measure.measureText(text).width) + 28;
    const h = 30;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    const ctx = canvas.getContext('2d')!;

    // Sample the text into particle targets (the toast sits on the light
    // stage, so ink-dark — the album line's grey is unreadable there).
    const off = document.createElement('canvas');
    off.width = w;
    off.height = h;
    const octx = off.getContext('2d')!;
    octx.font = font;
    octx.textAlign = 'center';
    octx.textBaseline = 'middle';
    octx.fillStyle = '#000';
    octx.fillText(text, w / 2, h / 2 + 1);
    const img = octx.getImageData(0, 0, w, h).data;
    const pts: Array<{ x: number; y: number; ox: number; oy: number; dx: number; dy: number }> = [];
    for (let y = 0; y < h; y += 2) {
      for (let x = 0; x < w; x += 2) {
        if (img[(y * w + x) * 4 + 3] > 128) {
          const a1 = Math.random() * Math.PI * 2;
          const a2 = Math.random() * Math.PI * 2;
          // Nearby offsets — the text forms/dissipates around itself.
          const r1 = 5 + Math.random() * 16;
          const r2 = 5 + Math.random() * 16;
          pts.push({
            x, y,
            ox: Math.cos(a1) * r1, oy: Math.sin(a1) * r1,
            dx: Math.cos(a2) * r2, dy: Math.sin(a2) * r2,
          });
        }
      }
    }

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const INK = 'rgba(24, 24, 28,';
    const IN = 700, HOLD = 3500, OUT = 800;   // ≈5s total
    let t0 = performance.now();
    const ease = (t: number) => 1 - Math.pow(1 - t, 3);
    let raf = 0;

    const drawText = (alpha: number) => {
      ctx.font = font;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = `${INK} ${0.78 * alpha})`;
      ctx.fillText(text, w / 2, h / 2 + 1);
    };
    const drawParticles = (spread: number, alpha: number, out: boolean) => {
      ctx.fillStyle = `${INK} ${0.78 * alpha})`;
      for (const p of pts) {
        const px = p.x + (out ? p.dx : p.ox) * spread;
        const py = p.y + (out ? p.dy : p.oy) * spread;
        ctx.fillRect(px, py, 1.4, 1.4);
      }
    };

    const draw = (now: number) => {
      // Pinned (info open): freeze the clock at the end of the hold phase
      // so the message stays readable for as long as the popover is up.
      if (pinnedRef.current && now - t0 > IN + HOLD) {
        t0 = now - (IN + HOLD);
      }
      const t = now - t0;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      // hold mode: once converged, paint the text and stop — it stays.
      if (hold && t >= IN) { drawText(1); return; }
      if (t >= IN + HOLD + OUT) { doneRef.current?.(); return; }
      if (reduced) {
        const alpha = t < IN ? t / IN : t < IN + HOLD ? 1 : 1 - (t - IN - HOLD) / OUT;
        drawText(alpha);
      } else if (t < IN) {
        const k = ease(t / IN);
        drawParticles(1 - k, k, false);      // converge from nearby
      } else if (t < IN + HOLD) {
        drawText(1);
      } else {
        const k = ease((t - IN - HOLD) / OUT);
        drawParticles(k, 1 - k, true);        // dissipate nearby
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [text, hold]);

  return (
    <div className={`divert-toast${inline ? ' divert-toast--inline' : ''}`} role="status" aria-label={text}>
      <canvas ref={ref} />
      {info && (
        <button
          className="divert-toast__info"
          onClick={() => setShowInfo(s => !s)}
          aria-expanded={showInfo}
          aria-label={info}
          title={info}
        >
          <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
            <circle cx="12" cy="12" r="9.2" />
            <path d="M12 11v5" />
            <path d="M12 7.6v.4" />
          </svg>
        </button>
      )}
      {info && showInfo && (
        <div className="divert-toast__popover" role="note">{info}</div>
      )}
    </div>
  );
}
