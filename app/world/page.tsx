'use client';

import dynamic from 'next/dynamic';
import { useStore } from '@/lib/store';
import { Dock, HandTracking, GestureToast } from '@/components/Overlay';
import { ExperienceNav } from '@/components/ExperienceNav';
import { WorldNowPlaying } from '@/components/WorldNowPlaying';
import { PhoneIntro } from '@/components/PhoneIntro';
import { usePhone } from '@/lib/use-phone';

// react-globe.gl needs WebGL + window — client-only, split out.
const WorldGlobe = dynamic(() => import('@/components/WorldGlobe'), {
  ssr: false,
  loading: () => <div className="world-loading">Loading the globe…</div>,
});

export default function WorldPage() {
  const phone = usePhone();
  const { handMode } = useStore();
  if (phone) return <PhoneIntro initial={1} />;
  return (
    <main className="world-frame">
      <WorldGlobe />

      <ExperienceNav />

      {/* One compact now-playing card — the globe itself is the queue. */}
      <WorldNowPlaying />

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
