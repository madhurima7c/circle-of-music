'use client';

import dynamic from 'next/dynamic';
import { useEffect } from 'react';
import { useStore } from '@/lib/store';
import { COUNTRIES, GENRES } from '@/lib/data';
import { coverSlug } from '@/lib/covers';
import {
  Title,
  Heart,
  PopulatingText,
  ConnectorTags,
  CenterStack,
  Dial,
  WheelLock,
  Dock,
  Hint,
  HandTracking,
  GestureToast,
} from '@/components/Overlay';
import { Library } from '@/components/Library';

// 3D stage is client-only and bundle-heavy — split it.
const Stage = dynamic(() => import('@/components/Stage'), { ssr: false });

export default function CirclePage() {
  const {
    commit, tracks, handMode, status,
    countryIdx, genreIdx, setCountry, setGenre,
  } = useStore();

  // On first load: restore a shared pairing from the URL
  // (/circle?country=turkey&genre=funk) if present, else auto-commit the
  // default after first paint. Skipped when returning mid-session (tracks
  // already loaded) — the store lives at the root layout, so selection
  // survives navigation.
  useEffect(() => {
    if (tracks.length > 0) return;
    const params = new URLSearchParams(window.location.search);
    const ci = COUNTRIES.findIndex(c => coverSlug(c) === params.get('country'));
    const gi = GENRES.findIndex(g => coverSlug(g) === params.get('genre'));
    if (ci >= 0 || gi >= 0) {
      // setCountry/setGenre schedule the debounced auto-commit themselves.
      if (ci >= 0) setCountry(ci);
      if (gi >= 0) setGenre(gi);
      return;
    }
    const t = setTimeout(commit, 900);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep the URL in sync with the committed pairing so any moment is
  // shareable — replaceState avoids polluting history while spinning.
  useEffect(() => {
    if (status !== 'populating' && status !== 'ready') return;
    const url = `/circle?country=${coverSlug(COUNTRIES[countryIdx])}&genre=${coverSlug(GENRES[genreIdx])}`;
    window.history.replaceState(null, '', url);
  }, [status, countryIdx, genreIdx]);

  return (
    <main className="frame">
      <Title />
      <Library />

      <Stage />

      <Heart />
      <PopulatingText />
      <ConnectorTags />
      <CenterStack />

      <Dial side="left" />
      <Dial side="right" />
      <WheelLock side="left" />
      <WheelLock side="right" />

      <div className="glass top"    style={{ top: 0,    height: 130 }} />
      <div className="glass bottom" style={{ bottom: 0, height: 160 }} />

      <Dock />
      {/* Hand tracking is opt-in: camera + MediaPipe only spin up when the
          user flips the dock toggle. Unmounting releases the webcam. */}
      {handMode && <HandTracking />}
      <GestureToast />
      <Hint />
    </main>
  );
}
