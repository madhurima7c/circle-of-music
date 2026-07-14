'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { STR } from '@/lib/strings';

// react-globe.gl needs WebGL + window — client-only, split out.
const WorldGlobe = dynamic(() => import('@/components/WorldGlobe'), {
  ssr: false,
  loading: () => <div className="world-loading">Loading the globe…</div>,
});

export default function WorldPage() {
  return (
    <main className="world-frame">
      <Link href="/" className="title world-title" title={STR.world.backName}>
        {STR.world.title}
      </Link>
      <Link href="/circle" className="world-to-circle">◐ {STR.world.circleTeaser}</Link>
      <WorldGlobe />
    </main>
  );
}
