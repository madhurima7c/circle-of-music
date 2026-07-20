'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { STR } from '@/lib/strings';
import { CircleIcon } from '@/components/ExperienceNav';
import { NavGlobe } from '@/components/NavGlobe';

/**
 * PhoneIntro — what phones get instead of the squeezed desktop tool.
 * Three full-screen panels (Circle light / World dark / Shades gradient),
 * swiped between with a continuous drag: the leaving panel zooms out and
 * dissolves while the next fades in, graphics cross-morphing at the same
 * center (card ring → globe → orb) and backgrounds cross-fading — the
 * smart-animate feel from the user's mock. Progress dots track position.
 *
 * The position `pos` is a float 0..2. Every layer derives opacity /
 * scale / drift from its distance to `pos`, so mid-drag states are real
 * frames, not a binary flip.
 */

const N = 3;
const SNAP_MS = 340;

/** Per-panel presence: 1 = front-and-center, 0 = fully away. */
const presence = (i: number, pos: number) => Math.max(0, 1 - Math.abs(pos - i));

export function PhoneIntro({ initial = 0 }: { initial?: number }) {
  const [pos, setPos] = useState(initial);
  const posRef = useRef(pos);
  posRef.current = pos;
  const [swiped, setSwiped] = useState(false);

  const raf = useRef(0);
  const drag = useRef<{ x0: number; p0: number; lastX: number; lastT: number; vx: number } | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => () => cancelAnimationFrame(raf.current), []);

  const animateTo = useCallback((target: number) => {
    cancelAnimationFrame(raf.current);
    const clamped = Math.max(0, Math.min(N - 1, Math.round(target)));
    // Hidden tab pauses rAF (the canAnimate() lesson) — jump, don't strand.
    if (document.hidden || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setPos(clamped);
      return;
    }
    const from = posRef.current;
    const t0 = performance.now();
    const tick = (now: number) => {
      const k = Math.min(1, (now - t0) / SNAP_MS);
      const ease = 1 - Math.pow(1 - k, 3); // ease-out cubic
      setPos(from + (clamped - from) * ease);
      if (k < 1) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
  }, []);

  const onPointerDown = (e: React.PointerEvent) => {
    // Pointer capture on the root would swallow the dots' click events.
    if ((e.target as HTMLElement).closest('.pintro__dot')) return;
    cancelAnimationFrame(raf.current);
    drag.current = { x0: e.clientX, p0: posRef.current, lastX: e.clientX, lastT: e.timeStamp, vx: 0 };
    rootRef.current?.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const w = rootRef.current?.clientWidth || window.innerWidth;
    const dt = e.timeStamp - d.lastT;
    if (dt > 0) d.vx = (e.clientX - d.lastX) / dt; // px/ms, for flick detection
    d.lastX = e.clientX;
    d.lastT = e.timeStamp;
    let p = d.p0 + (d.x0 - e.clientX) / (w * 0.8);
    // rubber-band past the ends
    if (p < 0) p = p / 3;
    if (p > N - 1) p = N - 1 + (p - (N - 1)) / 3;
    if (Math.abs(p - d.p0) > 0.25) setSwiped(true);
    setPos(p);
  };
  const onPointerUp = () => {
    const d = drag.current;
    if (!d) return;
    drag.current = null;
    const p = posRef.current;
    // a flick advances even from a small drag; otherwise snap to nearest
    let target = Math.round(p);
    if (d.vx < -0.35) target = Math.ceil(p);
    else if (d.vx > 0.35) target = Math.floor(p);
    animateTo(target);
  };

  const active = Math.max(0, Math.min(N - 1, Math.round(pos)));

  /* Derived layer styles — shared shape for all three panels. */
  const panelStyle = (i: number): React.CSSProperties => {
    const t = presence(i, pos);
    return {
      opacity: t,
      pointerEvents: t > 0.5 ? 'auto' : 'none',
      transform: `translateX(${(i - pos) * 46}px) scale(${0.86 + 0.14 * t})`,
    };
  };
  const bgStyle = (i: number): React.CSSProperties => ({ opacity: presence(i, pos) });

  return (
    <div
      ref={rootRef}
      className="pintro"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      {/* cross-fading backgrounds */}
      <div className="pintro__bg pintro__bg--circle" style={bgStyle(0)} aria-hidden />
      <div className="pintro__bg pintro__bg--world" style={bgStyle(1)} aria-hidden />
      <div className="pintro__bg pintro__bg--shades" style={bgStyle(2)} aria-hidden />

      {/* Circle */}
      <section className="pintro__panel pintro__panel--circle" style={panelStyle(0)}>
        <div className="pintro__art" aria-hidden>
          <CircleIcon className="pintro__ring" />
        </div>
        <h1 className="pintro__title">
          {STR.phone.circle}
          <em className="pintro__of">{STR.phone.ofMusic}</em>
        </h1>
        <p className="pintro__blurb">{STR.phone.circleBlurb}</p>
        <p className="pintro__desk">{STR.phone.desktop}</p>
      </section>

      {/* World */}
      <section className="pintro__panel pintro__panel--world" style={panelStyle(1)}>
        <div className="pintro__art" aria-hidden>
          <NavGlobe className="pintro__globe" spinning size={480} />
        </div>
        <h1 className="pintro__title">
          {STR.phone.world}
          <em className="pintro__of">{STR.phone.ofMusic}</em>
        </h1>
        <p className="pintro__blurb">{STR.phone.worldBlurb}</p>
        <p className="pintro__desk">{STR.phone.desktop}</p>
      </section>

      {/* Shades */}
      <section className="pintro__panel pintro__panel--shades" style={panelStyle(2)}>
        <div className="pintro__art" aria-hidden>
          <div className="pintro__orb" />
        </div>
        <h1 className="pintro__title">
          {STR.phone.shades}
          <em className="pintro__of">{STR.phone.ofMusic}</em>
        </h1>
        <p className="pintro__blurb">{STR.phone.shadesBlurb}</p>
        <span className="pintro__soonpill">{STR.phone.soon}</span>
      </section>

      {/* swipe hint — retires after the first real swipe */}
      <div className="pintro__hint" data-gone={swiped ? 'true' : 'false'} data-dark={active === 1 ? 'true' : 'false'} aria-hidden>
        ← {STR.phone.hint} →
      </div>

      {/* progress dots */}
      <nav className="pintro__dots" data-dark={active === 1 ? 'true' : 'false'} aria-label="Panels">
        {Array.from({ length: N }, (_, i) => (
          <button
            key={i}
            type="button"
            className="pintro__dot"
            data-active={i === active ? 'true' : 'false'}
            aria-label={[STR.phone.circle, STR.phone.world, STR.phone.shades][i]}
            onClick={() => animateTo(i)}
          />
        ))}
      </nav>
    </div>
  );
}
