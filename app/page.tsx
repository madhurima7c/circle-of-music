'use client';

import dynamic from 'next/dynamic';
import { StoreProvider, useStore } from '@/lib/store';
import {
  Title,
  Heart,
  PopulatingText,
  ConnectorTags,
  CenterStack,
  Dial,
  Dock,
  Hint,
  MenuMark,
  HandTracking,
} from '@/components/Overlay';
import { COUNTRIES, GENRES } from '@/lib/data';

// 3D stage is client-only and bundle-heavy — split it.
const Stage = dynamic(() => import('@/components/Stage'), { ssr: false });

function Inner() {
  const { countryIdx, genreIdx } = useStore();
  return (
    <>
      <Title />
      <MenuMark />

      <Stage />

      <Heart />
      <PopulatingText />
      <ConnectorTags />
      <CenterStack />

      <Dial side="left"  item={COUNTRIES[countryIdx]} />
      <Dial side="right" item={GENRES[genreIdx]} />

      <div className="glass top"    style={{ top: 0,    height: 130 }} />
      <div className="glass bottom" style={{ bottom: 0, height: 160 }} />

      <Dock />
      <HandTracking />
      <Hint />
    </>
  );
}

export default function Page() {
  return (
    <main className="frame">
      <StoreProvider>
        <Inner />
      </StoreProvider>
    </main>
  );
}
