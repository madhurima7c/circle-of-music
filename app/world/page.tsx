'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { STR } from '@/lib/strings';
import { useStore } from '@/lib/store';
import { CenterStack, HandTracking, GestureToast } from '@/components/Overlay';

// react-globe.gl needs WebGL + window — client-only, split out.
const WorldGlobe = dynamic(() => import('@/components/WorldGlobe'), {
  ssr: false,
  loading: () => <div className="world-loading">Loading the globe…</div>,
});

export default function WorldPage() {
  const { handMode } = useStore();
  return (
    <main className="world-frame">
      <Link href="/" className="title world-title" title={STR.world.backName}>
        {STR.world.title}
      </Link>
      <WorldGlobe />

      {/* The playlist panel — same card as the Circle, docked right; it may
          overlap the globe (by design: the globe zooms past the frame). */}
      <CenterStack dock="right" />

      {/* Instrument toggle: underlined link on the right edge. */}
      <Link href="/circle" className="world-to-circle-link">
        ◐ {STR.world.toCircleLink}
      </Link>

      {/* Hand tracking is the same opt-in VR-cursor system as the Circle —
          the fab in WorldGlobe toggles it; pinch-drag rotates the globe. */}
      {handMode && <HandTracking />}
      <GestureToast />
    </main>
  );
}
