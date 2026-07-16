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
  cardSize:      1.25,
  cardThickness: 0.07,
  /* rotation */
  spineAngleDeg: 17,
  xTiltDeg:      -80,
  extraZDeg:     -3,
  tangentAmount: 0.50,
  flipSpine:     false,
  /* active card emphasis */
  popZ:     1.35,
  popScale: 1.55,
  recedeZ:  -0.20,
  /* angular padding around active */
  paddingAmount: 0.38,
  paddingDecay:  0.2,
};

/* Locked lighting rig (from the removed Lighting dials): warm key + soft
 * fill so tilted cards catch light like real record sleeves. */
const LIGHTS = {
  ambient: 0.35,
  sky:     1.10,
  key:     0.95,
  fill:    1.15,
  keyX:    6.5,
  keyY:    3.5,
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
        {/* Warm key + soft fill so tilted cards catch light like real
            record sleeves; hemisphere gives a natural sky/ground gradient,
            the camera point light a laminate catch-highlight. */}
        <ambientLight intensity={LIGHTS.ambient} />
        <hemisphereLight args={['#fff7ea', '#8a8478', LIGHTS.sky]} />
        <directionalLight position={[LIGHTS.keyX, LIGHTS.keyY, 5]} intensity={LIGHTS.key} />
        <directionalLight position={[-6, 2, 4]} intensity={LIGHTS.fill} />
        <pointLight position={[0, 1, 6]} intensity={0.35} />

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
