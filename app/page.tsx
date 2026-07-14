import Link from 'next/link';

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
          <h1 className="title hub__title">Music Exploration</h1>
          <p className="hub__thesis">
            Wander, don&rsquo;t search. The world&rsquo;s music, browsable by
            place and genre — no algorithm, no login, no destination required.
          </p>
        </header>

        <nav className="hub__cards" aria-label="Experiences">
          <Link href="/circle" className="hub__card" data-live="true">
            <span className="hub__card-mark" aria-hidden>◐</span>
            <span className="hub__card-name">Circle of Music</span>
            <span className="hub__card-desc">
              The cultural compass. Spin a wheel of countries against a wheel
              of genres and listen to the intersection.
            </span>
            <span className="hub__card-cta">Start spinning →</span>
          </Link>

          <Link href="/world" className="hub__card" data-live="false">
            <span className="hub__card-mark" aria-hidden>◍</span>
            <span className="hub__card-name">World of Music</span>
            <span className="hub__card-desc">
              The globe. Music anchored to the places it comes from — layers,
              origins, and the reach a sound has had around the planet.
            </span>
            <span className="hub__card-cta">In the works — preview →</span>
          </Link>
        </nav>

        <footer className="hub__foot">
          30-second tastings via Deezer · open every find in your own music app
        </footer>
      </div>
    </main>
  );
}
