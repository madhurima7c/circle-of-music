'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { STR } from '@/lib/strings';

/**
 * Top-center experience switcher — replaces the page titles. Three ways
 * into the music: Circle (the wheels), World (the globe), Shades (the
 * color-first experience, not yet designed — shown but not navigable).
 */
export function ExperienceNav() {
  const pathname = usePathname();

  return (
    <nav className="xnav" aria-label="Experiences">
      <Link
        href="/circle"
        className="xnav__item"
        data-active={pathname === '/circle' ? 'true' : 'false'}
      >
        <img className="xnav__icon" src="/icons/nav-circle.svg" alt="" aria-hidden />
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
        <img className="xnav__icon" src="/icons/nav-world.png" alt="" aria-hidden />
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
        <img className="xnav__icon" src="/icons/nav-shades.png" alt="" aria-hidden />
        <span className="xnav__label">
          <span className="xnav__dot" aria-hidden />
          {STR.nav.shades}
        </span>
      </button>
    </nav>
  );
}
