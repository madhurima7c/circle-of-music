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
 * The frame's glass look (blur, frost, radius, border, shadow) is fixed in
 * GLASS_DEFAULTS and applied on mount.
 */

const GLASS_DEFAULTS = {
  blur: 16,      // px of backdrop blur
  radius: 999,   // pill — CSS clamps to half the bar height
  frost: 0.14,   // white tint opacity
  sat: 170,      // % backdrop saturation
  border: 0.28,  // border opacity
  shadow: 0.08,  // drop-shadow opacity
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
/* The card-ring mark — the 8-square version (matches app/icon.svg and the
 * favicon, so the nav and the browser tab now show the same logo).
 * Every rect is `currentColor`, which is what lets CSS drive it: the nav sets
 * `--circle-ink` per theme (#1d2bdf on Circle's light stage, #767dec on the
 * dark World stage) and the hover spin comes from `.xnav__icon--circle`.
 * Exported for reuse at panel scale in the PhoneIntro. */
export function CircleIcon({ className = 'xnav__icon xnav__icon--circle' }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 938 938"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      {/* four on the cardinals */}
      <rect x="379" width="180" height="180" fill="currentColor" />
      <rect x="379" y="758" width="180" height="180" fill="currentColor" />
      <rect x="758" y="379" width="180" height="180" fill="currentColor" />
      <rect y="379" width="180" height="180" fill="currentColor" />
      {/* four on the diagonals, turned 45° about their own top-left corner */}
      <rect x="726.994" y="77.8695" width="180" height="180" transform="rotate(45 726.994 77.8695)" fill="currentColor" />
      <rect x="191.006" y="613.856" width="180" height="180" transform="rotate(45 191.006 613.856)" fill="currentColor" />
      <rect x="726.994" y="613.856" width="180" height="180" transform="rotate(45 726.994 613.856)" fill="currentColor" />
      <rect x="191.006" y="77.8694" width="180" height="180" transform="rotate(45 191.006 77.8694)" fill="currentColor" />
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

  // Apply the frame's fixed glass look (blur/frost/radius/border/shadow).
  useEffect(() => {
    if (navRef.current) applyGlass(navRef.current, GLASS_DEFAULTS);
  }, [pathname]);

  return (
    <>
    <nav ref={navRef} className="xnav" data-theme={theme} aria-label="Experiences">
      <Link
        href="/circle"
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
        /* pointer events, gated to mice — a touch tap fires mouseenter
           with no mouseleave and would strand the pill on screen */
        onPointerEnter={(e) => { if (e.pointerType === 'mouse') setShadesHover(true); }}
        onPointerLeave={() => setShadesHover(false)}
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
