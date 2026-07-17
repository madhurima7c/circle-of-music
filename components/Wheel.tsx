'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame, useLoader, type ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';
import { makeArt, paletteFor } from '@/lib/art';
import { loadCoverTextures, type CoverTextures } from '@/lib/covers';
import { drawNoteCanvas } from '@/lib/wheel-notes';

/* Note textures (the card back's country/genre blurb) — every card's back
 * face carries its note permanently (visible whenever the wheel shows a
 * card from behind — a visual cue that a second layer of information
 * exists), so these build at mount and cache for the session. The bg is
 * part of the key: the first build can precede the cover's backColor. */
const noteTexCache = new Map<string, THREE.CanvasTexture>();
function noteTexture(side: 'left' | 'right', name: string, bg: string): THREE.CanvasTexture {
  const key = `${side}|${name}|${bg}`;
  let tex = noteTexCache.get(key);
  if (!tex) {
    tex = new THREE.CanvasTexture(drawNoteCanvas(side, name, bg));
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    noteTexCache.set(key, tex);
  }
  return tex;
}

export type WheelTuning = {
  /* layout */
  radius: number;
  cardSize: number;
  cardThickness: number;
  /* rotation — all three axes are modulated by flatness so the
   * active card remains face-on, upright, untilted */
  spineAngleDeg: number;     // Y-axis tilt (existing — face↔spine)
  xTiltDeg: number;          // X-axis tilt (forward/backward lean)
  extraZDeg: number;         // extra Z rotation on top of tangent alignment
  tangentAmount: number;     // 0..1 multiplier on the tangent (spoke) alignment
  flipSpine: boolean;        // mirror the Y-axis spine direction
  /* active card emphasis */
  popZ: number;
  popScale: number;
  recedeZ: number;
  /* angular padding around active card (radians) */
  paddingAmount: number;
  paddingDecay: number;
};

type WheelProps = WheelTuning & {
  items: readonly string[];
  selectedIdx: number;
  position: [number, number, number];
  facing?: 1 | -1;
  onSpin: (dir: number) => void;
  onPick?: (i: number) => void;
  /** Selected card is flipped to its info side (see Stage's onPick). */
  flipped?: boolean;
};

/* ---------- reusable math objects ---------- */
const _qX      = new THREE.Quaternion();
const _qY      = new THREE.Quaternion();
const _qZ      = new THREE.Quaternion();
const _qTmp    = new THREE.Quaternion();
const _qResult = new THREE.Quaternion();
const _qCurX   = new THREE.Quaternion();
const _qCurZ   = new THREE.Quaternion();
const _axisX   = new THREE.Vector3(1, 0, 0);
const _axisY   = new THREE.Vector3(0, 1, 0);
const _axisZ   = new THREE.Vector3(0, 0, 1);

/* ---------- cursor ripple (Spencer-Gabor-style card reaction) ----------
 * The pointer's position on the wheel arc + its angular VELOCITY drive a
 * whole-body 3D reaction on nearby cards: a lift toward the viewer, a bow
 * (perspective shift) that grows with hover, and a lean/twist against the
 * sweep direction that grows with speed — each card on its own eased
 * spring with distance-based lag so the ripple trails the cursor. */
type WheelCursor = {
  angle: number;    // cursor's angle on the wheel (wheel-local, radians)
  x: number;        // wheel-local cursor position (for the active-card tilt)
  y: number;
  active: boolean;  // pointer currently over the wheel arc
  vel: number;      // smoothed angular velocity (rad/s, signed)
  lastT: number;    // performance.now() of the last move (staleness guard)
};
// Values dialed in live by the user (2026-07) with the dev dial kit.
const RIPPLE = {
  sigma: 0.9,       // falloff width, in units of angleStep (≈ reaches 2 cards)
  lift: 0.25,       // z-lift toward viewer, in units of cardSize
  bow: 0,           // rad — no resting lean; the riffle is purely speed-driven
  velLean: 0.155,   // rad per (rad/s) — lean against the sweep
  velLeanMax: 0.27, // rad cap (~15°) so violent sweeps stay composed
  twist: 0.045,     // rad per (rad/s) — subtle in-plane twist with velocity
  ease: 0.28,       // spring rate — snappy follow; near cards ease ~2× faster
};

/* The ACTIVE (face-on, selected) card gets its own physics: a classic
 * "look at the cursor" tilt — perspective follows the pointer across the
 * card's face — instead of the ring's ripple, which fades out as a card
 * settles into the active position. */
const RIPPLE_ACTIVE = {
  tilt: 0.08,       // rad — max tilt as the cursor crosses the face (~5°)
  lift: 0.10,       // z-lift toward the viewer while hovered, × cardSize
  reach: 1.5,       // hover reach around the card center, × cardSize
  ease: 0.13,       // spring rate (low = glidey, high = tight tracking)
};

/* ---------- single card ---------- */
function Card({
  idx,
  side,
  name,
  cardSize,
  cardThickness,
  flipped,
}: {
  idx: number;
  side: 'left' | 'right';
  name: string;
  cardSize: number;
  cardThickness: number;
  /** This card is the selected one and is currently flipped to its note. */
  flipped: boolean;
}) {
  // Procedural vinyl art — fallback for items without a cover file.
  const palette = paletteFor(idx + (side === 'right' ? 2 : 0));
  const dataUrl = useMemo(
    () => makeArt(idx * 31 + (side === 'right' ? 17 : 7), palette),
    [idx, side, palette],
  );
  const fallback = useLoader(THREE.TextureLoader, dataUrl);

  useEffect(() => {
    if (!fallback) return;
    fallback.colorSpace = THREE.SRGBColorSpace;
    fallback.anisotropy = 4;
  }, [fallback]);

  // Real cover artwork: front = cover image, the four edges = the dedicated
  // spine strip, back = a solid fill of the spine's dominant color. Null
  // until loaded (or if the cover file is absent → procedural fallback).
  const [cover, setCover] = useState<CoverTextures | null>(null);
  useEffect(() => {
    let cancelled = false;
    const kind = side === 'left' ? 'countries' : 'genres';
    loadCoverTextures(kind, name).then((tex) => {
      if (cancelled) {
        if (tex) { tex.front.dispose(); tex.spine.dispose(); }
        return;
      }
      if (tex) setCover(tex);
    });
    return () => { cancelled = true; };
  }, [side, name]);

  // The note (info) texture lives on the back face permanently — seen
  // whenever a card shows its back on the wheel AND when flipped. (It was
  // flip-gated before; the always-there text reads better than a plain back.)
  const [noteTex, setNoteTex] = useState<THREE.CanvasTexture | null>(null);
  useEffect(() => {
    setNoteTex(noteTexture(side, name, cover?.backColor ?? '#26262a'));
  }, [side, name, cover]);

  // Rotated spine variants for the TOP/BOTTOM edges: the spine strip's long
  // axis runs vertically, so on the horizontal edges it must rotate a
  // quarter turn or the name renders squashed sideways. Mirror pair so the
  // two edges read consistently as the wheel turns the card.
  const spineTB = useMemo(() => {
    if (!cover) return null;
    const mk = (rot: number) => {
      const t = cover.spine.clone();
      t.center.set(0.5, 0.5);
      t.rotation = rot;
      t.needsUpdate = true;
      return t;
    };
    return { top: mk(-Math.PI / 2), bottom: mk(Math.PI / 2) };
  }, [cover]);

  if (cover) {
    return (
      // Box face order: +x, −x, +y, −y (spine edges), +z (front), −z (back).
      // Lit PBR materials so each card shades realistically as the wheel
      // tilts it: matte printed edges/back, a laminated sleeve on the front.
      <mesh>
        <boxGeometry args={[cardSize, cardSize, cardThickness]} />
        <meshStandardMaterial attach="material-0" map={cover.spine} roughness={0.82} metalness={0.04} toneMapped={false} />
        <meshStandardMaterial attach="material-1" map={cover.spine} roughness={0.82} metalness={0.04} toneMapped={false} />
        <meshStandardMaterial attach="material-2" map={spineTB?.top ?? cover.spine} roughness={0.82} metalness={0.04} toneMapped={false} />
        <meshStandardMaterial attach="material-3" map={spineTB?.bottom ?? cover.spine} roughness={0.82} metalness={0.04} toneMapped={false} />
        <meshPhysicalMaterial attach="material-4" map={cover.front} roughness={0.5} metalness={0} clearcoat={0.4} clearcoatRoughness={0.3} toneMapped={false} />
        {noteTex ? (
          // Unlit while showing text so the blurb reads evenly at any tilt.
          <meshBasicMaterial attach="material-5" map={noteTex} toneMapped={false} />
        ) : (
          <meshStandardMaterial attach="material-5" color={cover.backColor} roughness={0.82} metalness={0.04} toneMapped={false} />
        )}
      </mesh>
    );
  }

  return (
    <group>
      {/* card body — a proper box so the spine has visible thickness */}
      <mesh position={[0, 0, 0]}>
        <boxGeometry args={[cardSize, cardSize, cardThickness]} />
        <meshStandardMaterial color="#212222" roughness={0.8} metalness={0.05} />
      </mesh>
      {/* front face — vinyl cover, sits just in front of the box */}
      <mesh position={[0, 0, cardThickness / 2 + 0.001]}>
        <planeGeometry args={[cardSize, cardSize]} />
        <meshStandardMaterial map={fallback} roughness={0.55} metalness={0} toneMapped={false} />
      </mesh>
      {/* back face — the note, for cards without cover art */}
      {noteTex && (
        <mesh position={[0, 0, -cardThickness / 2 - 0.001]} rotation={[0, Math.PI, 0]}>
          <planeGeometry args={[cardSize, cardSize]} />
          <meshBasicMaterial map={noteTex} toneMapped={false} />
        </mesh>
      )}
    </group>
  );
}

/* ================================================================
 *  Wheel — a large circle, mostly clipped off-canvas. Spinning
 *  rotates the wheel so the SELECTED card lands at the fixed
 *  active position (3 o'clock for left, 9 o'clock for right).
 * ================================================================ */
export default function Wheel({
  items,
  selectedIdx,
  position,
  facing = 1,
  onSpin,
  onPick,
  flipped = false,
  /* tuning */
  radius,
  cardSize,
  cardThickness,
  spineAngleDeg,
  xTiltDeg,
  extraZDeg,
  tangentAmount,
  flipSpine,
  popZ,
  popScale,
  recedeZ,
  paddingAmount,
  paddingDecay,
}: WheelProps) {
  const groupRef    = useRef<THREE.Group>(null);
  const targetRot   = useRef(0);
  const wheelRot    = useRef(0);
  const total       = items.length;
  const angleStep   = (2 * Math.PI) / total;
  const isLeft      = position[0] < 0;
  const activeAngle = isLeft ? 0 : Math.PI;

  useEffect(() => {
    targetRot.current = activeAngle - selectedIdx * angleStep;
  }, [selectedIdx, activeAngle, angleStep]);

  /* ---- drag state ---- */
  const [dragging, setDragging] = useState(false);
  const dragStartY = useRef(0);
  const dragAccum  = useRef(0);
  const wheelAccum = useRef(0);

  /* ---- cursor ripple state (see RIPPLE above) ---- */
  const cursorRef = useRef<WheelCursor>({ angle: 0, x: 0, y: 0, active: false, vel: 0, lastT: 0 });
  const trackCursor = (e: ThreeEvent<PointerEvent>) => {
    // e.point is the world-space hit on the drag plate → wheel-local angle.
    const lx = e.point.x - position[0];
    const ly = e.point.y - position[1];
    const a  = Math.atan2(ly, lx);
    const c  = cursorRef.current;
    const now = performance.now();
    if (c.active) {
      let da = a - c.angle;
      while (da >  Math.PI) da -= 2 * Math.PI;
      while (da < -Math.PI) da += 2 * Math.PI;
      const dt = Math.max(8, now - c.lastT);
      c.vel = c.vel * 0.7 + (da / dt) * 1000 * 0.3;   // rad/s, event-smoothed
    }
    c.angle = a;
    c.x = lx;
    c.y = ly;
    c.active = true;
    c.lastT = now;
  };
  const releaseCursor = () => { cursorRef.current.active = false; };

  /* lerp wheel rotation toward target, taking shortest path */
  useFrame(() => {
    let diff = targetRot.current - wheelRot.current;
    while (diff >  Math.PI) diff -= 2 * Math.PI;
    while (diff < -Math.PI) diff += 2 * Math.PI;
    wheelRot.current += diff * 0.13;
  });

  const onPointerDown = (e: ThreeEvent<PointerEvent>) => {
    setDragging(true);
    dragStartY.current = e.clientY;
    dragAccum.current  = 0;
    (e.target as Element)?.setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e: ThreeEvent<PointerEvent>) => {
    if (!dragging) return;
    const dy = e.clientY - dragStartY.current;
    dragStartY.current = e.clientY;
    dragAccum.current += dy * facing;
    while (dragAccum.current >  22) { onSpin(1);  dragAccum.current -= 22; }
    while (dragAccum.current < -22) { onSpin(-1); dragAccum.current += 22; }
  };
  const onPointerUp = (e: ThreeEvent<PointerEvent>) => {
    setDragging(false);
    (e.target as Element)?.releasePointerCapture?.(e.pointerId);
  };

  useEffect(() => {
    const handler = (e: WheelEvent) => {
      const half    = window.innerWidth / 2;
      const inLeft  = e.clientX <  half;
      const inRight = e.clientX >= half;
      const meLeft  = position[0] < 0;
      if ((meLeft && !inLeft) || (!meLeft && !inRight)) return;
      e.preventDefault();
      wheelAccum.current += e.deltaY * facing;
      while (wheelAccum.current >  24) { onSpin(1);  wheelAccum.current -= 24; }
      while (wheelAccum.current < -24) { onSpin(-1); wheelAccum.current += 24; }
    };
    window.addEventListener('wheel', handler, { passive: false });
    return () => window.removeEventListener('wheel', handler);
  }, [onSpin, facing, position]);

  const platePosX = isLeft ? radius * 0.7 : -radius * 0.7;

  return (
    <group ref={groupRef} position={position}>
      {/* invisible drag plate — only over the visible arc */}
      <mesh
        position={[platePosX, 0, 1.0]}
        onPointerDown={onPointerDown}
        onPointerMove={(e) => { onPointerMove(e); trackCursor(e); }}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onPointerLeave={releaseCursor}
        onPointerOut={releaseCursor}
      >
        <planeGeometry args={[radius * 1.0, radius * 2.2]} />
        <meshBasicMaterial visible={false} />
      </mesh>

      <CircleRing
        items={items}
        total={total}
        angleStep={angleStep}
        wheelRotRef={wheelRot}
        cursorRef={cursorRef}
        activeAngle={activeAngle}
        isLeft={isLeft}
        onPick={onPick}
        selectedIdx={selectedIdx}
        flipped={flipped}
        radius={radius}
        cardSize={cardSize}
        cardThickness={cardThickness}
        spineAngleDeg={spineAngleDeg}
        xTiltDeg={xTiltDeg}
        extraZDeg={extraZDeg}
        tangentAmount={tangentAmount}
        flipSpine={flipSpine}
        popZ={popZ}
        popScale={popScale}
        recedeZ={recedeZ}
        paddingAmount={paddingAmount}
        paddingDecay={paddingDecay}
      />
    </group>
  );
}

/* ================================================================
 *  CircleRing — every frame, place each card at its current world
 *  angle (localAngle + wheelRotation + padding-push) and rotate it
 *  to show spine or face based on proximity to the active angle.
 * ================================================================ */
function CircleRing({
  items,
  total,
  angleStep,
  wheelRotRef,
  cursorRef,
  activeAngle,
  isLeft,
  onPick,
  selectedIdx,
  flipped,
  radius,
  cardSize,
  cardThickness,
  spineAngleDeg,
  xTiltDeg,
  extraZDeg,
  tangentAmount,
  flipSpine,
  popZ,
  popScale,
  recedeZ,
  paddingAmount,
  paddingDecay,
}: {
  items: readonly string[];
  total: number;
  angleStep: number;
  wheelRotRef: React.RefObject<number>;
  cursorRef: React.RefObject<WheelCursor>;
  activeAngle: number;
  isLeft: boolean;
  onPick?: (i: number) => void;
  selectedIdx: number;
  flipped: boolean;
} & WheelTuning) {
  const refs = useRef<(THREE.Group | null)[]>([]);
  // Flatness reach: only the card AT the active position is fully face-on.
  const FLATNESS_REACH = 1 / angleStep;
  // Eased flip progress (0 = face, 1 = note side) for the selected card.
  const flipAmt = useRef(0);
  // Per-card eased cursor-reaction springs (0..1) + frame-smoothed velocity.
  const react = useMemo(() => new Float32Array(total), [total]);
  const velSm = useRef(0);
  // Active-card "look at cursor" springs (one active position per wheel).
  const aTiltX = useRef(0);
  const aTiltY = useRef(0);
  const aLift  = useRef(0);
  const reducedMotion = useMemo(
    () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    [],
  );

  useFrame(() => {
    const wheelRot      = wheelRotRef.current ?? 0;
    const spineAngleRad = spineAngleDeg * (Math.PI / 180);
    const xTiltRad      = xTiltDeg     * (Math.PI / 180);
    const extraZRad     = extraZDeg    * (Math.PI / 180);
    // Mirror signs across the canvas vertical axis (right wheel mirrors left):
    //   • X rotation is invariant under mirror → same sign on both wheels.
    //   • Y and Z rotations flip sign under mirror → multiplied by the side sign.
    //   • The tangent term `(worldAngle - activeAngle)` already auto-mirrors
    //     because activeAngle differs (0 vs π) between the two wheels.
    const sideSign      = isLeft ? 1 : -1;
    const ySign         = sideSign * (flipSpine ? -1 : 1);
    const sigma         = Math.max(1e-6, paddingDecay * angleStep);

    // Ease the info-flip toward its target each frame (~0.5s settle).
    flipAmt.current += ((flipped ? 1 : 0) - flipAmt.current) * 0.09;
    if (flipAmt.current < 0.001) flipAmt.current = 0;

    // ----- cursor ripple bookkeeping (once per frame) -----
    const cur = cursorRef.current;
    // Staleness guard: pointer capture can swallow the leave event — a
    // cursor that hasn't moved in a while no longer holds the wheel.
    const cursorLive =
      !!cur && cur.active && performance.now() - cur.lastT < 700 && !reducedMotion;
    // Frame-smoothed velocity eases toward the live value and settles to 0.
    velSm.current += ((cursorLive ? cur.vel : 0) - velSm.current) * 0.12;
    if (cur) cur.vel *= 0.92;   // event-driven spikes decay between moves
    const rippleSigma = RIPPLE.sigma * angleStep;
    const velLean = Math.sign(velSm.current) *
      Math.min(RIPPLE.velLeanMax, Math.abs(velSm.current) * RIPPLE.velLean);

    // ----- active-card tilt targets: perspective follows the pointer -----
    let tTiltX = 0, tTiltY = 0, tLift = 0;
    if (cursorLive) {
      const ax = radius * Math.cos(activeAngle);
      const ay = radius * Math.sin(activeAngle);
      const dx = cur.x - ax;
      const dy = cur.y - ay;
      const reach = RIPPLE_ACTIVE.reach * cardSize;
      const d = Math.hypot(dx, dy);
      if (d < reach) {
        const fall = 1 - (d / reach) * (d / reach);   // 1 at center → 0 at reach
        const nx = Math.max(-1, Math.min(1, dx / (cardSize * 0.55)));
        const ny = Math.max(-1, Math.min(1, dy / (cardSize * 0.55)));
        tTiltX = -ny * RIPPLE_ACTIVE.tilt * fall;     // cursor above → top leans back
        tTiltY =  nx * RIPPLE_ACTIVE.tilt * fall;     // cursor right → right leans back
        tLift  = RIPPLE_ACTIVE.lift * fall;
      }
    }
    aTiltX.current += (tTiltX - aTiltX.current) * RIPPLE_ACTIVE.ease;
    aTiltY.current += (tTiltY - aTiltY.current) * RIPPLE_ACTIVE.ease;
    aLift.current  += (tLift  - aLift.current)  * RIPPLE_ACTIVE.ease;

    for (let i = 0; i < total; i++) {
      const g = refs.current[i];
      if (!g) continue;

      const localAngle     = i * angleStep;
      const baseWorldAngle = localAngle + wheelRot;

      // ----- distance to active position (shortest path around circle) -----
      let dist = baseWorldAngle - activeAngle;
      while (dist >  Math.PI) dist -= 2 * Math.PI;
      while (dist < -Math.PI) dist += 2 * Math.PI;

      // ----- angular padding push around the active position -----
      // Tanh: 0 at dist=0, MONOTONICALLY increases, saturates at ±paddingAmount.
      // (A derivative-of-Gaussian would peak at ±sigma and then DECAY, which
      //  causes the card right next to active to overshoot the card after it
      //  — visible overlap. Tanh avoids that.)
      const push = paddingAmount * Math.tanh(dist / sigma);
      const worldAngle = baseWorldAngle + push;

      // Smoothstep easing: ramps 0→1 with zero derivative at both ends so
      // the active card's pop/scale/rotation enter and exit gracefully.
      const linear = Math.max(0, Math.min(1, 1 - Math.abs(dist) * FLATNESS_REACH));
      const flatness = linear * linear * (3 - 2 * linear);

      // ----- position on circle -----
      g.position.x = radius * Math.cos(worldAngle);
      g.position.y = radius * Math.sin(worldAngle);
      g.position.z = flatness * popZ + (1 - flatness) * recedeZ;

      // ----- rotation: X tilt → Y spine → Z (tangent + extra) -----
      // Each axis modulated by (1 - flatness) so the active card is unrotated.
      // qResult = qZ · qY · qX  (X applied first in card frame, then Y, then Z in world frame)
      // X stays the same sign across wheels; Y and Z flip sign for mirror symmetry.
      const xAngle = xTiltRad      * (1 - flatness);
      // The selected card can flip a half-turn about Y to show its info
      // side; modulated by flatness so a mid-flip spin-away degrades softly.
      const flipRot = (i === selectedIdx) ? Math.PI * flipAmt.current * flatness * ySign : 0;
      const yAngle = spineAngleRad * (1 - flatness) * ySign + flipRot;
      // Tangent term must use the WRAPPED distance (dist + push), not the raw
      // (worldAngle - activeAngle): the raw difference grows by 2π per full
      // revolution, and ×tangentAmount(0.5) that flipped every card 180°
      // on alternate laps.
      const zAngle = (dist + push) * tangentAmount
                     + extraZRad * (1 - flatness) * sideSign;
      _qX.setFromAxisAngle(_axisX, xAngle);
      _qY.setFromAxisAngle(_axisY, yAngle);
      _qZ.setFromAxisAngle(_axisZ, zAngle);
      _qTmp.multiplyQuaternions(_qY, _qX);     // qY · qX
      _qResult.multiplyQuaternions(_qZ, _qTmp); // qZ · (qY · qX)

      // ----- cursor ripple: whole-body reaction with distance falloff -----
      // Target = Gaussian bump centered on the cursor's wheel angle; each
      // card runs its own spring, and nearer cards ease faster, so the
      // ripple TRAILS the cursor along the arc (the reference's lag chain).
      let target = 0;
      if (cursorLive) {
        let cd = worldAngle - cur.angle;
        while (cd >  Math.PI) cd -= 2 * Math.PI;
        while (cd < -Math.PI) cd += 2 * Math.PI;
        target = Math.exp(-(cd * cd) / (2 * rippleSigma * rippleSigma));
      }
      react[i] += (target - react[i]) * (RIPPLE.ease + RIPPLE.ease * target);
      // Ring ripple fades out as a card settles into the ACTIVE position —
      // there the card is governed by its own RIPPLE_ACTIVE physics below.
      const r = react[i] * (1 - flatness);
      if (r > 0.002) {
        // Lift toward the viewer + bow (hover) + lean against the sweep
        // (velocity) + a subtle in-plane twist — composed in world space on
        // top of the card's normal pose, so the ENTIRE body shifts.
        g.position.z += r * cardSize * RIPPLE.lift;
        _qCurX.setFromAxisAngle(_axisX, r * (RIPPLE.bow * -1 + velLean * -1));
        _qCurZ.setFromAxisAngle(_axisZ, r * -velSm.current * RIPPLE.twist);
        _qCurX.multiply(_qCurZ);
        _qResult.premultiply(_qCurX);
      }

      // ----- active card: "look at cursor" tilt (own dial settings) -----
      const aStrength = flatness;
      if (aStrength > 0.01 &&
          (Math.abs(aTiltX.current) > 1e-4 || Math.abs(aTiltY.current) > 1e-4 || aLift.current > 1e-4)) {
        g.position.z += aLift.current * cardSize * aStrength;
        _qCurX.setFromAxisAngle(_axisX, aTiltX.current * aStrength);
        _qCurZ.setFromAxisAngle(_axisY, aTiltY.current * aStrength);
        _qCurX.multiply(_qCurZ);
        _qResult.premultiply(_qCurX);
      }

      g.quaternion.copy(_qResult);

      // ----- scale -----
      g.scale.setScalar(1 + flatness * popScale);
    }
  });

  return (
    <>
      {items.map((item, i) => (
        <group
          key={i}
          ref={(el) => { refs.current[i] = el; }}
          onClick={() => onPick?.(i)}
        >
          <Card
            idx={i}
            side={isLeft ? 'left' : 'right'}
            name={item}
            cardSize={cardSize}
            cardThickness={cardThickness}
            flipped={flipped && i === selectedIdx}
          />
        </group>
      ))}
    </>
  );
}
