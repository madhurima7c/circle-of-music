import Link from 'next/link';
import { STR } from '@/lib/strings';

/**
 * Landing hub — the one front door to the two instruments:
 * Circle of Music (live) and World of Music (in the works).
 * Server component: no store, no audio, nothing fetched.
 */
export default function HubPage() {
  return (
    <main className="frame">
      <div className="hub">
        <header className="hub__head">
          <h1 className="title hub__title">{STR.hub.title}</h1>
          <p className="hub__thesis">{STR.hub.thesis}</p>
        </header>

        <nav className="hub__cards" aria-label="Experiences">
          <Link href="/circle" className="hub__card" data-live="true">
            <span className="hub__card-mark" aria-hidden>◐</span>
            <span className="hub__card-name">{STR.hub.circleName}</span>
            <span className="hub__card-desc">{STR.hub.circleDesc}</span>
            <span className="hub__card-cta">{STR.hub.circleCta}</span>
          </Link>

          <Link href="/world" className="hub__card" data-live="false">
            <span className="hub__card-mark" aria-hidden>◍</span>
            <span className="hub__card-name">{STR.hub.worldName}</span>
            <span className="hub__card-desc">{STR.hub.worldDesc}</span>
            <span className="hub__card-cta">{STR.hub.worldCta}</span>
          </Link>
        </nav>

        <footer className="hub__foot">{STR.hub.foot}</footer>
      </div>
    </main>
  );
}
