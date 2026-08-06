'use client';

import { Canvas } from '@react-three/fiber';
import { Suspense, useEffect, useMemo, useState } from 'react';
import { button, folder, useControls, Leva } from 'leva';
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
  cardSize:      1.06,   // 1.25 × 0.85 — user asked the two big cards −15%
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

/* Portrait tablets (iPad, 641–900px): the desktop camera pushes the wheels
 * fully off-canvas at these widths — pull them in so the active cards peek
 * from the edges like they do on desktop. */
const TABLET_CAMERA = {
  cameraZ: 9,
  fov: 48,
  wheelOffsetX: 5.6,
};

const TABLET_TUNING: WheelTuning = {
  ...DESKTOP_TUNING,
  radius:        3.2,
  cardSize:      0.85,
  popZ:          1.30,
  popScale:      1.35,
  paddingAmount: 0.30,
};

/**
 * The 3D stage: two large card circles, mostly clipped off-canvas.
 * Wheel rotates so the selected card lands at the fixed active position
 * (3 o'clock left, 9 o'clock right). Visual params are locked constants
 * (desktop vs mobile); mirror symmetry is enforced inside Wheel.tsx.
 */
export default function Stage() {
  const { countryIdx, genreIdx, spinLeft, spinRight, setCountry, setGenre } = useStore();

  // Info flip per wheel: clicking the SELECTED card flips it to a note about
  // that country's scene / that genre (clicking again, or moving the wheel,
  // flips it back). Clicking a non-selected card still picks it.
  const [flipLeft, setFlipLeft] = useState(false);
  const [flipRight, setFlipRight] = useState(false);
  useEffect(() => { setFlipLeft(false); }, [countryIdx]);
  useEffect(() => { setFlipRight(false); }, [genreIdx]);

  const pickLeft = (i: number) => {
    if (i === countryIdx) setFlipLeft(f => !f);
    else setCountry(i);
  };
  const pickRight = (i: number) => {
    if (i === genreIdx) setFlipRight(f => !f);
    else setGenre(i);
  };

  /* Viewport-driven framing.
   *
   * Phones keep their own fixed preset (they get PhoneIntro anyway). Above
   * that, the tablet and desktop values are the two ANCHORS of a continuous
   * blend rather than a step: stepping at 900px left everything from 901 to
   * ~1200 with the desktop camera, whose wheelOffsetX of 7.5 pushes the cards
   * clean off a 1024-wide iPad — "FRANCE" rendered as "RANCE".
   *
   * Height counts too. A short window (1280×600) has the same problem as a
   * narrow one, so the blend runs on an effective width that a squat viewport
   * pulls down. */
  const [vp, setVp] = useState({ w: 1440, h: 900 });
  useEffect(() => {
    const apply = () => setVp({ w: window.innerWidth, h: window.innerHeight });
    apply();
    window.addEventListener('resize', apply);
    // Some embedded/emulated browsers never fire matchMedia change events —
    // plain resize keeps this honest everywhere.
    return () => window.removeEventListener('resize', apply);
  }, []);

  const { cam: respCam, tun: respTun, camKey } = useMemo(() => {
    const effective = Math.min(vp.w, vp.h * 1.7);
    // Three anchors, blended piecewise. Anchoring only tablet↔desktop left
    // 641–900 pinned to the tablet preset, and at 768 (iPad portrait) its
    // wheelOffsetX of 5.6 put BOTH wheels past the edge — the Circle's two
    // wheels, the whole instrument, reduced to slivers.
    const lo  = effective <= 900 ? MOBILE_CAMERA : TABLET_CAMERA;
    const hi  = effective <= 900 ? TABLET_CAMERA : DESKTOP_CAMERA;
    const loT = effective <= 900 ? MOBILE_TUNING : TABLET_TUNING;
    const hiT = effective <= 900 ? TABLET_TUNING : DESKTOP_TUNING;
    const t = effective <= 900
      ? Math.max(0, Math.min(1, (effective - 640) / (900 - 640)))
      : Math.max(0, Math.min(1, (effective - 900) / (1440 - 900)));
    const mix = (a: number, b: number) => a + (b - a) * t;
    return {
      cam: {
        cameraZ:      mix(lo.cameraZ,      hi.cameraZ),
        fov:          mix(lo.fov,          hi.fov),
        wheelOffsetX: mix(lo.wheelOffsetX, hi.wheelOffsetX),
      },
      tun: {
        ...DESKTOP_TUNING,
        radius:        mix(loT.radius,        hiT.radius),
        cardSize:      mix(loT.cardSize,      hiT.cardSize),
        popZ:          mix(loT.popZ,          hiT.popZ),
        popScale:      mix(loT.popScale,      hiT.popScale),
        paddingAmount: mix(loT.paddingAmount, hiT.paddingAmount),
      },
      // R3F reads `camera` only on mount, so the Canvas has to remount for a
      // new framing to take. Bucketed to ~6 steps rather than keyed on the
      // raw value, so dragging a window edge doesn't rebuild the scene on
      // every pixel — the tuning still moves continuously.
      camKey: `${effective <= 900 ? 's' : 'd'}${Math.round(t * 5)}`,
    };
  }, [vp.w, vp.h]);

  /* ---------- Live tuning panel (leva) — a DEV tool ----------
   * Shown in local dev, or on any deploy when the URL carries ?tune, and
   * never on phones (it would cover the screen) or for ordinary production
   * visitors. When shown ("tuneOn"), its dials OVERRIDE the responsive values
   * above with a fixed desktop framing so you can dial the look in and then
   * bake the numbers back into DESKTOP_TUNING / DESKTOP_CAMERA / LIGHTS.
   * The dials are always declared (hooks rules); they only APPLY when tuneOn. */
  const isMobile = vp.w <= 640;
  const [allowTune, setAllowTune] = useState(false);
  useEffect(() => {
    const dev = process.env.NODE_ENV !== 'production';
    const param = new URLSearchParams(window.location.search).has('tune');
    setAllowTune(dev || param);
  }, []);
  const tuneOn = allowTune && !isMobile;

  const [camDial, setCamDial] = useControls('Camera', () => ({
    cameraZ:      { value: DESKTOP_CAMERA.cameraZ,      min: 4,  max: 16, step: 0.1 },
    fov:          { value: DESKTOP_CAMERA.fov,          min: 20, max: 80, step: 1   },
    wheelOffsetX: { value: DESKTOP_CAMERA.wheelOffsetX, min: 3,  max: 12, step: 0.1, label: 'wheel center X' },
  }));
  const [lightDial, setLightDial] = useControls('Lighting', () => ({
    ambient: { value: LIGHTS.ambient, min: 0,   max: 2,  step: 0.05 },
    sky:     { value: LIGHTS.sky,     min: 0,   max: 2,  step: 0.05 },
    key:     { value: LIGHTS.key,     min: 0,   max: 2,  step: 0.05 },
    fill:    { value: LIGHTS.fill,    min: 0,   max: 2,  step: 0.05 },
    keyX:    { value: LIGHTS.keyX,    min: -12, max: 12, step: 0.5  },
    keyY:    { value: LIGHTS.keyY,    min: -12, max: 12, step: 0.5  },
  }));
  // One schema, instantiated twice so the Country (left) and Genre (right)
  // cards tune INDEPENDENTLY. Both start from DESKTOP_TUNING, so dials you
  // don't touch keep the two wheels mirror-identical; move a folder to make
  // just that wheel's cards differ.
  const wheelSchema = () => ({
    Layout: folder({
      radius:        { value: DESKTOP_TUNING.radius,        min: 2,    max: 8,    step: 0.1  },
      cardSize:      { value: DESKTOP_TUNING.cardSize,      min: 0.2,  max: 1.6,  step: 0.01 },
      cardThickness: { value: DESKTOP_TUNING.cardThickness, min: 0.01, max: 0.30, step: 0.01 },
    }),
    Rotation: folder({
      spineAngleDeg: { value: DESKTOP_TUNING.spineAngleDeg, min: -90, max: 90, step: 1,    label: 'Y · spine (°)' },
      xTiltDeg:      { value: DESKTOP_TUNING.xTiltDeg,      min: -90, max: 90, step: 1,    label: 'X · tilt (°)'  },
      extraZDeg:     { value: DESKTOP_TUNING.extraZDeg,     min: -90, max: 90, step: 1,    label: 'Z · extra (°)' },
      tangentAmount: { value: DESKTOP_TUNING.tangentAmount, min: 0,   max: 2,  step: 0.05, label: 'tangent align' },
      flipSpine:     { value: DESKTOP_TUNING.flipSpine,                                    label: 'flip spine side' },
    }),
    'Active card': folder({
      popZ:     { value: DESKTOP_TUNING.popZ,     min: 0,  max: 3,   step: 0.05 },
      popScale: { value: DESKTOP_TUNING.popScale, min: 0,  max: 2,   step: 0.05 },
      recedeZ:  { value: DESKTOP_TUNING.recedeZ,  min: -1, max: 0.5, step: 0.05 },
    }),
    Padding: folder({
      paddingAmount: { value: DESKTOP_TUNING.paddingAmount, min: 0,   max: 0.5, step: 0.005, label: 'gap size (rad)' },
      paddingDecay:  { value: DESKTOP_TUNING.paddingDecay,  min: 0.2, max: 5,   step: 0.1,   label: 'gap falloff'    },
    }),
  });
  const [countryDial, setCountryDial] = useControls('Country cards (left)', wheelSchema);
  const [genreDial,   setGenreDial]   = useControls('Genre cards (right)',  wheelSchema);
  useControls('Reset', () => ({
    'Reset all to defaults': button(() => {
      setCamDial({ ...DESKTOP_CAMERA });
      setLightDial({ ...LIGHTS });
      setCountryDial({ ...DESKTOP_TUNING });
      setGenreDial({ ...DESKTOP_TUNING });
    }),
  }));

  const cam     = tuneOn ? camDial : respCam;
  const tunLeft:  WheelTuning = tuneOn ? { ...DESKTOP_TUNING, ...countryDial } : respTun;
  const tunRight: WheelTuning = tuneOn ? { ...DESKTOP_TUNING, ...genreDial }   : respTun;
  const lights  = tuneOn ? lightDial : LIGHTS;

  return (
    <div className="absolute inset-0 z-[2]">
      <Leva hidden={!tuneOn} collapsed />
      <Canvas
        /* R3F reads `camera` only on mount, so a camera change needs a remount.
           While tuning, key on the camera values so cameraZ/fov update live. */
        key={tuneOn ? `tune-${cam.cameraZ}-${cam.fov}` : camKey}
        camera={{ position: [0, 0, cam.cameraZ], fov: cam.fov, near: 0.1, far: 100 }}
        dpr={[1, 2]}
        gl={{ alpha: true, antialias: true }}
        style={{ background: 'transparent', touchAction: 'none' }}
      >
        {/* Warm key + soft fill so tilted cards catch light like real
            record sleeves; hemisphere gives a natural sky/ground gradient,
            the camera point light a laminate catch-highlight. */}
        <ambientLight intensity={lights.ambient} />
        <hemisphereLight args={['#fff7ea', '#8a8478', lights.sky]} />
        <directionalLight position={[lights.keyX, lights.keyY, 5]} intensity={lights.key} />
        <directionalLight position={[-6, 2, 4]} intensity={lights.fill} />
        <pointLight position={[0, 1, 6]} intensity={0.35} />

        <Suspense fallback={null}>
          {/* left circle — countries */}
          <Wheel
            {...tunLeft}
            items={COUNTRIES}
            selectedIdx={countryIdx}
            position={[-cam.wheelOffsetX, 0, 0]}
            facing={1}
            onSpin={spinLeft}
            onPick={pickLeft}
            flipped={flipLeft}
          />
          {/* right circle — genres */}
          <Wheel
            {...tunRight}
            items={GENRES}
            selectedIdx={genreIdx}
            position={[cam.wheelOffsetX, 0, 0]}
            facing={1}
            onSpin={spinRight}
            onPick={pickRight}
            flipped={flipRight}
          />
        </Suspense>
      </Canvas>
    </div>
  );
}
