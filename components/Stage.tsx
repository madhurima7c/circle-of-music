'use client';

import { Canvas } from '@react-three/fiber';
import { Suspense } from 'react';
import Wheel from './Wheel';
import { useStore } from '@/lib/store';
import { COUNTRIES, GENRES } from '@/lib/data';

/**
 * The 3D stage: two vertical card rings, one on each side. The Canvas is
 * absolutely positioned to fill the frame; HTML overlays sit on top of it.
 */
export default function Stage() {
  const { countryIdx, genreIdx, spinLeft, spinRight, setCountry, setGenre } = useStore();

  return (
    <div className="absolute inset-0 z-[2]">
      <Canvas
        // Orthographic-ish framing via a moderately tight perspective camera
        camera={{ position: [0, 0, 7], fov: 38, near: 0.1, far: 100 }}
        dpr={[1, 2]}
        gl={{ alpha: true, antialias: true }}
        // transparent so the off-white frame underneath shows through
        style={{ background: 'transparent' }}
      >
        <ambientLight intensity={1.0} />
        <directionalLight position={[3, 4, 5]} intensity={0.4} />

        <Suspense fallback={null}>
          {/* left ring — countries */}
          <Wheel
            items={COUNTRIES}
            selectedIdx={countryIdx}
            position={[-3.0, 0, 0]}
            facing={1}
            onSpin={spinLeft}
            onPick={setCountry}
          />
          {/* right ring — genres */}
          <Wheel
            items={GENRES}
            selectedIdx={genreIdx}
            position={[3.0, 0, 0]}
            facing={1}
            onSpin={spinRight}
            onPick={setGenre}
          />
        </Suspense>
      </Canvas>
    </div>
  );
}
