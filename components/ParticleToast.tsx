'use client';

import { useEffect, useRef } from 'react';

/**
 * ParticleToast — a short-lived message that condenses out of particles,
 * holds as text, then dissolves back into particles (nearby dissipation,
 * like the connector waves — not a far scatter). Typography is sampled
 * live from `.center__album` so it always matches the album line in the
 * now-playing section, even with next/font's hashed family names.
 *
 * Lifecycle ≈ 4.1s (0.7s in · 2.6s hold · 0.8s out), then onDone fires.
 * prefers-reduced-motion: a plain fade with the same timing.
 */
export function ParticleToast({ text, onDone }: { text: string; onDone: () => void }) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  const doneRef = useRef(onDone);
  doneRef.current = onDone;

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
    const IN = 700, HOLD = 2600, OUT = 800;
    const t0 = performance.now();
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
      const t = now - t0;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      if (t >= IN + HOLD + OUT) { doneRef.current(); return; }
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
  }, [text]);

  return <canvas ref={ref} className="divert-toast" role="status" aria-label={text} />;
}
