'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame, useLoader, type ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';
import { makeArt, paletteFor } from '@/lib/art';

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
};

/* ---------- reusable math objects ---------- */
const _qX      = new THREE.Quaternion();
const _qY      = new THREE.Quaternion();
const _qZ      = new THREE.Quaternion();
const _qTmp    = new THREE.Quaternion();
const _qResult = new THREE.Quaternion();
const _axisX   = new THREE.Vector3(1, 0, 0);
const _axisY   = new THREE.Vector3(0, 1, 0);
const _axisZ   = new THREE.Vector3(0, 0, 1);

/* ---------- single card ---------- */
function Card({
  idx,
  side,
  cardSize,
  cardThickness,
}: {
  idx: number;
  side: 'left' | 'right';
  cardSize: number;
  cardThickness: number;
}) {
  const palette = paletteFor(idx + (side === 'right' ? 2 : 0));
  const dataUrl = useMemo(
    () => makeArt(idx * 31 + (side === 'right' ? 17 : 7), palette),
    [idx, side, palette],
  );
  const texture = useLoader(THREE.TextureLoader, dataUrl);

  useEffect(() => {
    if (!texture) return;
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 4;
  }, [texture]);

  return (
    <group>
      {/* card body — a proper box so the spine has visible thickness */}
      <mesh position={[0, 0, 0]}>
        <boxGeometry args={[cardSize, cardSize, cardThickness]} />
        <meshBasicMaterial color="#212222" toneMapped={false} />
      </mesh>
      {/* front face — vinyl cover, sits just in front of the box */}
      <mesh position={[0, 0, cardThickness / 2 + 0.001]}>
        <planeGeometry args={[cardSize, cardSize]} />
        <meshBasicMaterial map={texture} toneMapped={false} />
      </mesh>
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
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <planeGeometry args={[radius * 1.0, radius * 2.2]} />
        <meshBasicMaterial visible={false} />
      </mesh>

      <CircleRing
        items={items}
        total={total}
        angleStep={angleStep}
        wheelRotRef={wheelRot}
        activeAngle={activeAngle}
        isLeft={isLeft}
        onPick={onPick}
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
  activeAngle,
  isLeft,
  onPick,
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
  activeAngle: number;
  isLeft: boolean;
  onPick?: (i: number) => void;
} & WheelTuning) {
  const refs = useRef<(THREE.Group | null)[]>([]);
  // Flatness reach: only the card AT the active position is fully face-on.
  const FLATNESS_REACH = 1 / angleStep;

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
      const yAngle = spineAngleRad * (1 - flatness) * ySign;
      const zAngle = (worldAngle - activeAngle) * tangentAmount
                     + extraZRad * (1 - flatness) * sideSign;
      _qX.setFromAxisAngle(_axisX, xAngle);
      _qY.setFromAxisAngle(_axisY, yAngle);
      _qZ.setFromAxisAngle(_axisZ, zAngle);
      _qTmp.multiplyQuaternions(_qY, _qX);     // qY · qX
      _qResult.multiplyQuaternions(_qZ, _qTmp); // qZ · (qY · qX)
      g.quaternion.copy(_qResult);

      // ----- scale -----
      g.scale.setScalar(1 + flatness * popScale);
    }
  });

  return (
    <>
      {items.map((_, i) => (
        <group
          key={i}
          ref={(el) => { refs.current[i] = el; }}
          onClick={() => onPick?.(i)}
        >
          <Card
            idx={i}
            side={isLeft ? 'left' : 'right'}
            cardSize={cardSize}
            cardThickness={cardThickness}
          />
        </group>
      ))}
    </>
  );
}
