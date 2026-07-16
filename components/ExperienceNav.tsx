'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { STR } from '@/lib/strings';

/**
 * Top-center experience switcher — replaces the page titles. Three ways
 * into the music: Circle (the wheels), World (the globe), Shades (the
 * color-first experience, not yet designed — shown but not navigable).
 *
 * Frameless: the icons float directly over the stage, so label color and
 * glow adapt per route via data-theme (Circle = light stage, World = dark).
 * Each icon previews its instrument's motion on hover (see globals.css).
 */
export function ExperienceNav() {
  const pathname = usePathname();
  const theme = pathname === '/world' ? 'dark' : 'light';

  return (
    <nav className="xnav" data-theme={theme} aria-label="Experiences">
      <Link
        href="/circle"
        className="xnav__item"
        data-active={pathname === '/circle' ? 'true' : 'false'}
      >
        <span className="xnav__iconwrap" aria-hidden>
          <img className="xnav__icon xnav__icon--circle" src="/icons/nav-circle.svg" alt="" />
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
      >
        <span className="xnav__iconwrap" aria-hidden>
          <img className="xnav__icon xnav__icon--world" src="/icons/nav-world.png" alt="" />
        </span>
        <span className="xnav__label">
          <span className="xnav__dot" aria-hidden />
          {STR.nav.world}
        </span>
      </Link>

      <button
        type="button"
        className="xnav__item xnav__item--soon"
        title={STR.nav.shadesSoon}
        aria-disabled="true"
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
  );
}
