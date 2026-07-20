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
  HandTracking,
  GestureToast,
} from '@/components/Overlay';
import { ExperienceNav } from '@/components/ExperienceNav';
import { PhoneIntro } from '@/components/PhoneIntro';
import { usePhone } from '@/lib/use-phone';

const Stage = dynamic(() => import('@/components/Stage'), { ssr: false });

export default function CirclePage() {
  const phone = usePhone();
  const {
    commit, tracks, handMode, status,
    countryIdx, genreIdx, setCountry, setGenre, countryName,
  } = useStore();

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
      return;
    }
    const t = setTimeout(commit, 900);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (status !== 'populating' && status !== 'ready') return;
    if (countryName !== COUNTRIES[countryIdx]) return;
    const url = `/?country=${coverSlug(COUNTRIES[countryIdx])}&genre=${coverSlug(GENRES[genreIdx])}`;
    window.history.replaceState(null, '', url);
  }, [status, countryIdx, genreIdx, countryName]);

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
      {handMode && <HandTracking />}
      <GestureToast />
    </main>
  );
}
