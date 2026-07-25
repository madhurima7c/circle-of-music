'use client';

import dynamic from 'next/dynamic';
import { useEffect } from 'react';
import { useStore } from '@/lib/store';
import { COUNTRIES, GENRES } from '@/lib/data';
import { coverSlug } from '@/lib/covers';
import {
  Heart,
  PopulatingText,
  ConnectorTags,
  CenterStack,
  Dial,
  WheelLock,
  Dock,
} from '@/components/Overlay';
import { ExperienceNav } from '@/components/ExperienceNav';
import { PhoneIntro } from '@/components/PhoneIntro';
import { usePhone } from '@/lib/use-phone';

const Stage = dynamic(() => import('@/components/Stage'), { ssr: false });

/**
 * Circle of Music — lives at `/circle`, mirroring `/world`. (`/` redirects
 * here.) The URL deliberately stays clean: the pairing is app state, not
 * something the address bar narrates, so spinning the wheels no longer
 * rewrites the location. A `?country=…&genre=…` link still opens that exact
 * pairing, so older shared links keep working.
 */
export default function CirclePage() {
  const phone = usePhone();
  const { commit, tracks, setCountry, setGenre } = useStore();

  useEffect(() => {
    // Phones get the intro panels — don't kick off the pairing fetch.
    if (window.matchMedia('(max-width: 640px)').matches) return;
    if (tracks.length > 0) return;
    const params = new URLSearchParams(window.location.search);
    const ci = COUNTRIES.findIndex(c => coverSlug(c) === params.get('country'));
    const gi = GENRES.findIndex(g => coverSlug(g) === params.get('genre'));
    if (ci >= 0 || gi >= 0) {
      if (ci >= 0) setCountry(ci);
      if (gi >= 0) setGenre(gi);
      // Drop the params once they've been applied — they were an entry
      // point, and the address bar should settle back to a plain /circle.
      window.history.replaceState(null, '', '/circle');
      return;
    }
    const t = setTimeout(commit, 900);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (phone) return <PhoneIntro initial={0} />;

  return (
    <main className="frame">
      <Stage />

      <div className="edge-blur edge-blur--top" aria-hidden>
        <span /><span /><span /><span />
      </div>
      <div className="edge-blur edge-blur--bottom" aria-hidden>
        <span /><span /><span /><span />
      </div>

      <ExperienceNav />

      <Heart />
      <PopulatingText />
      <ConnectorTags />
      <CenterStack />

      <Dial side="left" />
      <Dial side="right" />
      <WheelLock side="left" />
      <WheelLock side="right" />

      <Dock />
    </main>
  );
}
