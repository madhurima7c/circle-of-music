import Link from 'next/link';

/**
 * World of Music — placeholder while the globe (Phase 1b) is built.
 * Will become the r3f-globe experience: tap a country, hear its music.
 */
export default function WorldPage() {
  return (
    <main className="frame">
      <div className="hub">
        <header className="hub__head">
          <h1 className="title hub__title">World of Music</h1>
          <p className="hub__thesis">
            A globe of sound — every beat and melody placed where it was made.
            The globe is under construction; the wheels are already turning.
          </p>
        </header>
        <nav className="hub__cards" aria-label="Navigation">
          <Link href="/circle" className="hub__card" data-live="true">
            <span className="hub__card-mark" aria-hidden>◐</span>
            <span className="hub__card-name">Circle of Music</span>
            <span className="hub__card-desc">
              Explore by country × genre while the globe takes shape.
            </span>
            <span className="hub__card-cta">Start spinning →</span>
          </Link>
          <Link href="/" className="hub__card" data-live="true">
            <span className="hub__card-mark" aria-hidden>←</span>
            <span className="hub__card-name">Back to the hub</span>
            <span className="hub__card-desc">The front door.</span>
            <span className="hub__card-cta">Home →</span>
          </Link>
        </nav>
      </div>
    </main>
  );
}
