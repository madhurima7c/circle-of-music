'use client';

import { Canvas } from '@react-three/fiber';
import { Suspense, useEffect, useState } from 'react';
import Wheel, { type WheelTuning } from './Wheel';
import { useStore } from '@/lib/store';
import { COUNTRIES, GENRES } from '@/lib/data';

/* ------------------------------------------------------------------
 * Final dial values — locked in from the (removed) leva tuning panel.
 * These produce two wheels that are perfect mirror images of each
 * other across the canvas vertical center.
 * ------------------------------------------------------------------ */
const DESKTOP_CAMERA = {
  cameraZ: 9,
  fov: 46,
  wheelOffsetX: 7.5,
};

const DESKTOP_TUNING: WheelTuning = {
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

/* Portrait phones: same composition, scaled to fit — the wheels become
 * edge-hugging arcs and the active cards sit closer to the center card. */
const MOBILE_CAMERA = {
  cameraZ: 9,
  fov: 50,
  wheelOffsetX: 4.0,
};

const MOBILE_TUNING: WheelTuning = {
  ...DESKTOP_TUNING,
  radius:        2.4,
  cardSize:      0.62,
  popZ:          1.25,
  popScale:      1.15,
  paddingAmount: 0.24,
};

/**
 * The 3D stage: two large card circles, mostly clipped off-canvas.
 * Wheel rotates so the selected card lands at the fixed active position
 * (3 o'clock left, 9 o'clock right). Visual params are locked constants
 * (desktop vs mobile); mirror symmetry is enforced inside Wheel.tsx.
 */
export default function Stage() {
  const { countryIdx, genreIdx, spinLeft, spinRight, setCountry, setGenre } = useStore();

  // Portrait/phone breakpoint — swaps in the mobile camera + wheel tuning.
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 640px)');
    const apply = () => setIsMobile(mq.matches);
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, []);

  const cam = isMobile ? MOBILE_CAMERA : DESKTOP_CAMERA;
  const tun = isMobile ? MOBILE_TUNING : DESKTOP_TUNING;

  return (
    <div className="absolute inset-0 z-[2]">
      <Canvas
        key={isMobile ? 'mobile' : 'desktop'}
        camera={{ position: [0, 0, cam.cameraZ], fov: cam.fov, near: 0.1, far: 100 }}
        dpr={[1, 2]}
        gl={{ alpha: true, antialias: true }}
        style={{ background: 'transparent', touchAction: 'none' }}
      >
        <ambientLight intensity={1.0} />
        <directionalLight position={[3, 4, 5]} intensity={0.4} />

        <Suspense fallback={null}>
          {/* left circle — countries */}
          <Wheel
            {...tun}
            items={COUNTRIES}
            selectedIdx={countryIdx}
            position={[-cam.wheelOffsetX, 0, 0]}
            facing={1}
            onSpin={spinLeft}
            onPick={setCountry}
          />
          {/* right circle — genres */}
          <Wheel
            {...tun}
            items={GENRES}
            selectedIdx={genreIdx}
            position={[cam.wheelOffsetX, 0, 0]}
            facing={1}
            onSpin={spinRight}
            onPick={setGenre}
          />
        </Suspense>
      </Canvas>
    </div>
  );
}
