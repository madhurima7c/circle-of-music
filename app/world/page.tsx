'use client';

import dynamic from 'next/dynamic';
import { useStore } from '@/lib/store';
import { CenterStack, Dock, HandTracking, GestureToast } from '@/components/Overlay';
import { ExperienceNav } from '@/components/ExperienceNav';

// react-globe.gl needs WebGL + window — client-only, split out.
const WorldGlobe = dynamic(() => import('@/components/WorldGlobe'), {
  ssr: false,
  loading: () => <div className="world-loading">Loading the globe…</div>,
});

export default function WorldPage() {
  const { handMode } = useStore();
  return (
    <main className="world-frame">
      <WorldGlobe />

      <ExperienceNav />

      {/* The playlist panel — same card as the Circle, docked right; it may
          overlap the globe (by design: the globe zooms past the frame). */}
      <CenterStack dock="right" />

      {/* Shared dock — shuffle routes to the globe's own random-country
          spin (it owns the fly-to camera), via a window event. */}
      <Dock onSurprise={() => window.dispatchEvent(new Event('world:shuffle'))} />

      {/* Hand tracking is the same opt-in VR-cursor system as the Circle —
          toggled from the dock menu; pinch-drag rotates the globe. */}
      {handMode && <HandTracking />}
      <GestureToast />
    </main>
  );
}
