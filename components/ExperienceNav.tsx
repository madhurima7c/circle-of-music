'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { STR } from '@/lib/strings';
import { NavGlobe } from '@/components/NavGlobe';

/**
 * Top-center experience switcher — replaces the page titles. Three ways
 * into the music: Circle (the wheels), World (the globe), Shades (the
 * color-first experience, not yet designed — shown but not navigable).
 *
 * The icons sit in a glassmorphic frame — frosted blur over the stage —
 * so the bar stays legible on the World's dark globe. Label color and
 * glow still adapt per route via data-theme. Each icon previews its
 * instrument's motion on hover: the card ring turns (CSS), the 3D globe
 * spins (NavGlobe), the shades gradient drifts (CSS).
 *
 * Glass tuning: open any route with `?tune` (e.g. /world?tune) for a
 * dial kit — blur, frost, radius, border, shadow + Sharp/Pill presets.
 * Values persist in localStorage so a tuned look sticks everywhere.
 */

const GLASS_KEY = 'navGlass.v2'; // v2: pill default (old saved radii ignored)
const GLASS_DEFAULTS = {
  blur: 16,      // px of backdrop blur
  radius: 999,   // pill — CSS clamps to half the bar height
  frost: 0.14,   // white tint opacity
  sat: 170,      // % backdrop saturation
  border: 0.28,  // border opacity
  shadow: 0.22,  // drop-shadow opacity
};
type Glass = typeof GLASS_DEFAULTS;

function applyGlass(el: HTMLElement, g: Glass) {
  el.style.setProperty('--glass-blur', `${g.blur}px`);
  el.style.setProperty('--glass-radius', `${g.radius}px`);
  el.style.setProperty('--glass-frost', `${g.frost}`);
  el.style.setProperty('--glass-sat', `${g.sat}%`);
  el.style.setProperty('--glass-border', `${g.border}`);
  el.style.setProperty('--glass-shadow', `${g.shadow}`);
}
function loadGlass(): Glass {
  try {
    const raw = localStorage.getItem(GLASS_KEY);
    if (raw) return { ...GLASS_DEFAULTS, ...JSON.parse(raw) };
  } catch { /* fresh browser */ }
  return GLASS_DEFAULTS;
}

/** The dial kit — only mounts when the URL carries `?tune`. */
function NavTuner({ target }: { target: React.RefObject<HTMLElement | null> }) {
  const [g, setG] = useState<Glass>(GLASS_DEFAULTS);
  useEffect(() => { setG(loadGlass()); }, []);
  useEffect(() => {
    if (target.current) applyGlass(target.current, g);
    try { localStorage.setItem(GLASS_KEY, JSON.stringify(g)); } catch { /* private mode */ }
  }, [g, target]);

  const dial = (key: keyof Glass, label: string, min: number, max: number, step: number) => (
    <label className="navtune__row">
      <span>{label}</span>
      <input
        type="range" min={min} max={max} step={step} value={g[key]}
        onChange={(e) => setG(prev => ({ ...prev, [key]: Number(e.target.value) }))}
      />
      <em>{g[key]}</em>
    </label>
  );

  return (
    <div className="navtune" role="group" aria-label="Nav glass tuning">
      <div className="navtune__title">nav glass</div>
      {dial('blur', 'blur', 0, 40, 1)}
      {dial('frost', 'frost', 0, 0.5, 0.01)}
      {dial('radius', 'radius', 0, 48, 1)}
      {dial('sat', 'saturate', 100, 220, 5)}
      {dial('border', 'border', 0, 0.6, 0.02)}
      {dial('shadow', 'shadow', 0, 0.6, 0.02)}
      <div className="navtune__presets">
        <button onClick={() => setG(prev => ({ ...prev, radius: 14 }))}>Sharp</button>
        <button onClick={() => setG(prev => ({ ...prev, radius: 999 }))}>Pill</button>
        <button onClick={() => setG(GLASS_DEFAULTS)}>Reset</button>
      </div>
    </div>
  );
}

/* The card-ring mark, inlined so the cards can take the per-theme ink
 * (#767DEC on the dark World stage, the darker accent on Circle's light
 * stage) via currentColor. Source: public/icons/nav-circle.svg. */
function CircleIcon() {
  return (
    <svg
      className="xnav__icon xnav__icon--circle"
      viewBox="0 0 34 34"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <rect x="15" width="4" height="4" fill="currentColor" />
      <rect x="8.56134" y="2.10742" width="4" height="4" transform="rotate(-22.8275 8.56134 2.10742)" fill="currentColor" />
      <rect x="27.6066" y="3.56494" width="4" height="4" transform="rotate(45 27.6066 3.56494)" fill="currentColor" />
      <rect x="21.5636" y="0.502319" width="4" height="4" transform="rotate(22.1725 21.5636 0.502319)" fill="currentColor" />
      <rect y="19" width="4" height="4" transform="rotate(-90 0 19)" fill="currentColor" />
      <rect x="2.10742" y="25.4387" width="4" height="4" transform="rotate(-112.828 2.10742 25.4387)" fill="currentColor" />
      <rect x="3.56494" y="6.39343" width="4" height="4" transform="rotate(-45 3.56494 6.39343)" fill="currentColor" />
      <rect x="0.502258" y="12.4364" width="4" height="4" transform="rotate(-67.8275 0.502258 12.4364)" fill="currentColor" />
      <rect x="15" y="30" width="4" height="4" fill="currentColor" />
      <rect x="20.2001" y="29.7578" width="4" height="4" transform="rotate(-22.8275 20.2001 29.7578)" fill="currentColor" />
      <rect x="6.39337" y="24.7782" width="4" height="4" transform="rotate(45 6.39337 24.7782)" fill="currentColor" />
      <rect x="10.2418" y="28.2838" width="4" height="4" transform="rotate(22.1725 10.2418 28.2838)" fill="currentColor" />
      <rect x="30" y="19" width="4" height="4" transform="rotate(-90 30 19)" fill="currentColor" />
      <rect x="29.7577" y="13.7998" width="4" height="4" transform="rotate(-112.828 29.7577 13.7998)" fill="currentColor" />
      <rect x="24.7782" y="27.6066" width="4" height="4" transform="rotate(-45 24.7782 27.6066)" fill="currentColor" />
      <rect x="28.2839" y="23.7583" width="4" height="4" transform="rotate(-67.8275 28.2839 23.7583)" fill="currentColor" />
    </svg>
  );
}

export function ExperienceNav() {
  const pathname = usePathname();
  const isCircle = pathname === '/' || pathname === '/circle';
  const theme = pathname === '/world' ? 'dark' : 'light';
  const [worldSpin, setWorldSpin] = useState(false);
  const [shadesHover, setShadesHover] = useState(false);
  const shadesRef = useRef<HTMLButtonElement | null>(null);
  const navRef = useRef<HTMLElement | null>(null);
  const [tune, setTune] = useState(false);

  // Re-apply any saved glass tuning; show the dial kit on `?tune`.
  useEffect(() => {
    if (navRef.current) applyGlass(navRef.current, loadGlass());
    setTune(new URLSearchParams(window.location.search).has('tune'));
  }, [pathname]);

  return (
    <>
    {tune && <NavTuner target={navRef} />}
    <nav ref={navRef} className="xnav" data-theme={theme} aria-label="Experiences">
      <Link
        href="/"
        className="xnav__item"
        data-active={isCircle ? 'true' : 'false'}
      >
        <span className="xnav__iconwrap" aria-hidden>
          <CircleIcon />
        </span>
        <span className="xnav__label">
          <span className="xnav__dot" aria-hidden />
          {STR.nav.circle}
        </span>
      </Link>

      <Link
        href="/world"
        className="xnav__item"
        data-active={pathname === '/world' ? 'true' : 'false'}
        onMouseEnter={() => setWorldSpin(true)}
        onMouseLeave={() => setWorldSpin(false)}
      >
        <span className="xnav__iconwrap" aria-hidden>
          <NavGlobe className="xnav__icon xnav__icon--world" spinning={worldSpin} />
        </span>
        <span className="xnav__label">
          <span className="xnav__dot" aria-hidden />
          {STR.nav.world}
        </span>
      </Link>

      <button
        ref={shadesRef}
        type="button"
        className="xnav__item xnav__item--soon"
        aria-disabled="true"
        onMouseEnter={() => setShadesHover(true)}
        onMouseLeave={() => setShadesHover(false)}
      >
        <span className="xnav__iconwrap" aria-hidden>
          <img className="xnav__icon xnav__icon--shades" src="/icons/nav-shades.png" alt="" />
        </span>
        <span className="xnav__label">
          <span className="xnav__dot" aria-hidden />
          {STR.nav.shades}
        </span>
      </button>
    </nav>
    {shadesHover && shadesRef.current && (() => {
      const r = shadesRef.current!.getBoundingClientRect();
      return (
        <div
          className="xnav__soon"
          style={{ top: r.top + r.height / 2, left: r.right + 10 }}
          aria-hidden
        >
          👀 COMING SOON
        </div>
      );
    })()}
    </>
  );
}
