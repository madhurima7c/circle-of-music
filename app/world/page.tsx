import Link from 'next/link';
import { STR } from '@/lib/strings';

/**
 * World of Music — placeholder while the globe (Phase 1b) is built.
 * Will become the r3f-globe experience: tap a country, hear its music.
 */
export default function WorldPage() {
  return (
    <main className="frame">
      <div className="hub">
        <header className="hub__head">
          <h1 className="title hub__title">{STR.world.title}</h1>
          <p className="hub__thesis">{STR.world.thesis}</p>
        </header>
        <nav className="hub__cards" aria-label="Navigation">
          <Link href="/circle" className="hub__card" data-live="true">
            <span className="hub__card-mark" aria-hidden>◐</span>
            <span className="hub__card-name">{STR.hub.circleName}</span>
            <span className="hub__card-desc">{STR.world.circleTeaser}</span>
            <span className="hub__card-cta">{STR.hub.circleCta}</span>
          </Link>
          <Link href="/" className="hub__card" data-live="true">
            <span className="hub__card-mark" aria-hidden>←</span>
            <span className="hub__card-name">{STR.world.backName}</span>
            <span className="hub__card-desc">{STR.world.backDesc}</span>
            <span className="hub__card-cta">{STR.world.backCta}</span>
          </Link>
        </nav>
      </div>
    </main>
  );
}
