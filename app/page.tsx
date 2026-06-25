'use client';

import dynamic from 'next/dynamic';
import { StoreProvider } from '@/lib/store';
import {
  Title,
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

// 3D stage is client-only and bundle-heavy — split it.
const Stage = dynamic(() => import('@/components/Stage'), { ssr: false });

function Inner() {
  return (
    <>
      <Title />

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
      <HandTracking />
      <GestureToast />
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
