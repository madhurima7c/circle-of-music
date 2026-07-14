'use client';

import dynamic from 'next/dynamic';
import { useEffect } from 'react';
import { useStore } from '@/lib/store';
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
  MenuMark,
  HandTracking,
  GestureToast,
} from '@/components/Overlay';

// 3D stage is client-only and bundle-heavy — split it.
const Stage = dynamic(() => import('@/components/Stage'), { ssr: false });

export default function CirclePage() {
  const { commit, tracks, handMode } = useStore();

  // First auto-commit after first paint so the ready state actually
  // populates. Skipped when returning mid-session (tracks already loaded) —
  // the store lives at the root layout, so selection survives navigation.
  useEffect(() => {
    if (tracks.length > 0) return;
    const t = setTimeout(commit, 900);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <main className="frame">
      <Title />
      <MenuMark />

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
