'use client';

import { Canvas } from '@react-three/fiber';
import { Suspense } from 'react';
import { button, folder, useControls } from 'leva';
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
 * (3 o'clock left, 9 o'clock right). All visual params are live-tunable
 * via the leva panel; mirror symmetry is enforced inside Wheel.tsx.
 */
export default function Stage() {
  const { countryIdx, genreIdx, spinLeft, spinRight, setCountry, setGenre } = useStore();

  // Camera dials — function form so we get a `set` for the reset button.
  const [camera, setCamera] = useControls('Camera', () => ({
    cameraZ:      { value: DEFAULT_CAMERA.cameraZ,      min: 4, max: 16, step: 0.1 },
    fov:          { value: DEFAULT_CAMERA.fov,          min: 20, max: 80, step: 1   },
    wheelOffsetX: { value: DEFAULT_CAMERA.wheelOffsetX, min: 3,  max: 12, step: 0.1, label: 'wheel center X' },
  }));

  // Wheel tuning dials + reset-all button.
  const [tuning, setTuning] = useControls('Wheel', () => ({
    Layout: folder({
      radius:        { value: DEFAULT_TUNING.radius,        min: 2,    max: 8,    step: 0.1  },
      cardSize:      { value: DEFAULT_TUNING.cardSize,      min: 0.2,  max: 1.5,  step: 0.05 },
      cardThickness: { value: DEFAULT_TUNING.cardThickness, min: 0.01, max: 0.30, step: 0.01 },
    }),
    Rotation: folder({
      spineAngleDeg: { value: DEFAULT_TUNING.spineAngleDeg, min: -90, max: 90, step: 1,    label: 'Y · spine (°)' },
      xTiltDeg:      { value: DEFAULT_TUNING.xTiltDeg,      min: -90, max: 90, step: 1,    label: 'X · tilt (°)'  },
      extraZDeg:     { value: DEFAULT_TUNING.extraZDeg,     min: -90, max: 90, step: 1,    label: 'Z · extra (°)' },
      tangentAmount: { value: DEFAULT_TUNING.tangentAmount, min: 0,   max: 2,  step: 0.05, label: 'tangent align' },
      flipSpine:     { value: DEFAULT_TUNING.flipSpine,                                    label: 'flip spine side' },
    }),
    'Active card': folder({
      popZ:     { value: DEFAULT_TUNING.popZ,     min: 0,  max: 3,    step: 0.05 },
      popScale: { value: DEFAULT_TUNING.popScale, min: 0,  max: 2,    step: 0.05 },
      recedeZ:  { value: DEFAULT_TUNING.recedeZ,  min: -1, max: 0.5,  step: 0.05 },
    }),
    Padding: folder({
      paddingAmount: { value: DEFAULT_TUNING.paddingAmount, min: 0,   max: 0.5, step: 0.005, label: 'gap size (rad)' },
      paddingDecay:  { value: DEFAULT_TUNING.paddingDecay,  min: 0.2, max: 5,   step: 0.1,   label: 'gap falloff'    },
    }),
    'Reset to defaults': button(() => {
      setTuning({ ...DEFAULT_TUNING });
      setCamera({ ...DEFAULT_CAMERA });
    }),
  }));

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
