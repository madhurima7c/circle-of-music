'use client';

import { Canvas } from '@react-three/fiber';
import { Suspense } from 'react';
import Wheel, { type WheelTuning } from './Wheel';
import { useStore } from '@/lib/store';
import { COUNTRIES, GENRES } from '@/lib/data';

/* ------------------------------------------------------------------
 * Default dial values — these produce two wheels that are perfect
 * mirror images of each other across the canvas vertical center.
 * ------------------------------------------------------------------ */
const DEFAULT_CAMERA = {
  cameraZ: 9,
  fov: 46,
  wheelOffsetX: 7.5,
};

const DEFAULT_TUNING: WheelTuning = {
  /* layout */
  radius:        4.0,
  cardSize:      1.0,
  cardThickness: 0.05,
  /* rotation */
  spineAngleDeg: 17,
  xTiltDeg:      -80,
  extraZDeg:     -3,
  tangentAmount: 0.50,
  flipSpine:     false,
  /* active card emphasis */
  popZ:     1.70,
  popScale: 1.40,
  recedeZ:  -0.20,
  /* angular padding around active */
  paddingAmount: 0.32,
  paddingDecay:  0.6,
};

/**
 * The 3D stage: two large card circles, mostly clipped off-canvas.
 * Wheel rotates so the selected card lands at the fixed active position
 * (3 o'clock left, 9 o'clock right). Mirror symmetry is enforced inside Wheel.tsx.
 */
export default function Stage() {
  const { countryIdx, genreIdx, spinLeft, spinRight, setCountry, setGenre } = useStore();
  const camera = DEFAULT_CAMERA;
  const tuning = DEFAULT_TUNING;

  return (
    <div className="absolute inset-0 z-[2]">
      <Canvas
        camera={{ position: [0, 0, camera.cameraZ], fov: camera.fov, near: 0.1, far: 100 }}
        dpr={[1, 2]}
        gl={{ alpha: true, antialias: true }}
        style={{ background: 'transparent' }}
      >
        <ambientLight intensity={1.0} />
        <directionalLight position={[3, 4, 5]} intensity={0.4} />

        <Suspense fallback={null}>
          {/* left circle — countries */}
          <Wheel
            {...tuning}
            items={COUNTRIES}
            selectedIdx={countryIdx}
            position={[-camera.wheelOffsetX, 0, 0]}
            facing={1}
            onSpin={spinLeft}
            onPick={setCountry}
          />
          {/* right circle — genres */}
          <Wheel
            {...tuning}
            items={GENRES}
            selectedIdx={genreIdx}
            position={[camera.wheelOffsetX, 0, 0]}
            facing={1}
            onSpin={spinRight}
            onPick={setGenre}
          />
        </Suspense>
      </Canvas>
    </div>
  );
}
