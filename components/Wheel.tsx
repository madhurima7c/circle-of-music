'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame, useLoader, type ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';
import { makeArt, paletteFor } from '@/lib/art';

type WheelProps = {
  /** Items to lay around the ring (countries OR genres). */
  items: readonly string[];
  /** 0..items.length-1; the card currently at the front of the ring. */
  selectedIdx: number;
  /** Position of the wheel center in world space. */
  position: [number, number, number];
  /** Direction sign — flips the ring so left/right wheels mirror each other.
   *  +1 spins one way, -1 the other; doesn't change layout, only feel. */
  facing?: 1 | -1;
  /** Called when the user drags or scrolls; dir = ±1 per click. */
  onSpin: (dir: number) => void;
  /** Called when a card is clicked instead of dragged — caller may snap to it. */
  onPick?: (i: number) => void;
};

const RADIUS         = 2.4;     // ring radius (world units)
const ANGLE_STEP_DEG = 18;      // degrees between adjacent cards
const VISIBLE_RANGE  = 7;       // cards above/below selected we render
const CARD_SIZE      = 1.6;     // square cards — vinyl aspect
const SPINE_BIAS_DEG = 62;      // extra tilt added to non-selected cards
const MAX_TILT_DEG   = 86;      // cap so cards never flip past edge-on

const DEG = Math.PI / 180;

/**
 * A single card on the ring. Memoized on (idx, palette) so geometry +
 * texture aren't rebuilt every frame — only the parent group re-renders.
 */
function Card({ idx, side }: { idx: number; side: 'left' | 'right' }) {
  // distinct palette stripe per side so the two wheels feel different
  const palette = paletteFor(idx + (side === 'right' ? 2 : 0));
  const dataUrl = useMemo(() => makeArt(idx * 31 + (side === 'right' ? 17 : 7), palette), [idx, side, palette]);
  const texture = useLoader(THREE.TextureLoader, dataUrl);

  useEffect(() => {
    if (!texture) return;
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 4;
  }, [texture]);

  return (
    <group>
      {/* front face — vinyl cover */}
      <mesh>
        <planeGeometry args={[CARD_SIZE, CARD_SIZE]} />
        <meshBasicMaterial map={texture} toneMapped={false} />
      </mesh>
      {/* back face — solid dark so the card has presence when seen edge-on */}
      <mesh rotation={[0, Math.PI, 0]}>
        <planeGeometry args={[CARD_SIZE, CARD_SIZE]} />
        <meshBasicMaterial color="#1a1a1a" toneMapped={false} />
      </mesh>
      {/* spine extrusion — gives the card thickness when tilted */}
      <mesh position={[0, CARD_SIZE / 2, -0.01]}>
        <boxGeometry args={[CARD_SIZE, 0.04, 0.04]} />
        <meshBasicMaterial color="#0a0a0a" toneMapped={false} />
      </mesh>
    </group>
  );
}

export default function Wheel({
  items,
  selectedIdx,
  position,
  facing = 1,
  onSpin,
  onPick,
}: WheelProps) {
  const groupRef = useRef<THREE.Group>(null);
  const targetIdx = useRef<number>(selectedIdx);
  const renderedIdx = useRef<number>(selectedIdx);
  // continuous, fractional version of selectedIdx — animates between integers
  const fractional = useRef<number>(selectedIdx);

  useEffect(() => {
    targetIdx.current = selectedIdx;
  }, [selectedIdx]);

  // drag-to-spin local state
  const [dragging, setDragging] = useState(false);
  const dragStartY = useRef(0);
  const dragAccum  = useRef(0);

  // wheel/scroll-to-spin local accumulator
  const wheelAccum = useRef(0);

  useFrame(() => {
    // critically damped lerp toward the target index
    const target = targetIdx.current;
    fractional.current += (target - fractional.current) * 0.18;
    renderedIdx.current = fractional.current;
  });

  /* ---------- pointer drag ---------- */
  const onPointerDown = (e: ThreeEvent<PointerEvent>) => {
    setDragging(true);
    dragStartY.current = e.clientY;
    dragAccum.current = 0;
    (e.target as Element)?.setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e: ThreeEvent<PointerEvent>) => {
    if (!dragging) return;
    const dy = e.clientY - dragStartY.current;
    dragStartY.current = e.clientY;
    dragAccum.current += dy * facing;
    while (dragAccum.current > 22) {
      onSpin(1);
      dragAccum.current -= 22;
    }
    while (dragAccum.current < -22) {
      onSpin(-1);
      dragAccum.current += 22;
    }
  };
  const onPointerUp = (e: ThreeEvent<PointerEvent>) => {
    setDragging(false);
    (e.target as Element)?.releasePointerCapture?.(e.pointerId);
  };

  /* ---------- wheel scroll (mouse + trackpad) ---------- */
  useEffect(() => {
    const el = groupRef.current;
    if (!el) return;
    // we attach to window because R3F's onWheel doesn't easily bubble through Canvas
    const handler = (e: WheelEvent) => {
      // scope: only when pointer is over our half of the screen
      const half = window.innerWidth / 2;
      const inLeft  = e.clientX <  half;
      const inRight = e.clientX >= half;
      const meLeft  = position[0] < 0;
      if ((meLeft && !inLeft) || (!meLeft && !inRight)) return;
      e.preventDefault();
      wheelAccum.current += e.deltaY * facing;
      while (wheelAccum.current > 24) {
        onSpin(1);
        wheelAccum.current -= 24;
      }
      while (wheelAccum.current < -24) {
        onSpin(-1);
        wheelAccum.current += 24;
      }
    };
    window.addEventListener('wheel', handler, { passive: false });
    return () => window.removeEventListener('wheel', handler);
  }, [onSpin, facing, position]);

  /* ---------- card layout ---------- */
  const total = items.length;
  const cardSlots = useMemo(() => {
    const arr: number[] = [];
    for (let d = -VISIBLE_RANGE; d <= VISIBLE_RANGE; d++) arr.push(d);
    return arr;
  }, []);

  return (
    <group ref={groupRef} position={position}>
      {/* invisible drag plate — catches pointer events for the whole wheel column */}
      <mesh
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <planeGeometry args={[CARD_SIZE * 2, RADIUS * 4]} />
        <meshBasicMaterial visible={false} />
      </mesh>

      <CardRing
        items={items}
        total={total}
        cardSlots={cardSlots}
        renderedIdxRef={renderedIdx}
        side={position[0] < 0 ? 'left' : 'right'}
        onPick={onPick}
      />
    </group>
  );
}

/**
 * Pulled into its own component so we can call useFrame for per-frame
 * card transforms without re-rendering React on every tick.
 */
function CardRing({
  items, total, cardSlots, renderedIdxRef, side, onPick,
}: {
  items: readonly string[];
  total: number;
  cardSlots: number[];
  renderedIdxRef: React.RefObject<number>;
  side: 'left' | 'right';
  onPick?: (i: number) => void;
}) {
  // refs to each card's group so we can mutate transforms cheaply
  const refs = useRef<(THREE.Group | null)[]>([]);

  useFrame(() => {
    const fractional = renderedIdxRef.current ?? 0;
    cardSlots.forEach((slot, i) => {
      const g = refs.current[i];
      if (!g) return;

      // The card at this slot represents (round(fractional) + slot) of the items
      const baseIdx = Math.round(fractional) + slot;
      // delta is the *fractional* distance from the camera-front of the ring
      const delta = (baseIdx - fractional);

      const dist = Math.abs(delta);
      if (dist > VISIBLE_RANGE) {
        g.visible = false;
        return;
      }
      g.visible = true;

      const θdeg = delta * ANGLE_STEP_DEG;
      const θ = θdeg * DEG;
      // ring math: y descends with delta, z curves back away from camera
      g.position.y = -Math.sin(θ) * RADIUS;
      g.position.z =  Math.cos(θ) * RADIUS - RADIUS;

      // rotation: arc-tangent + spine bias, capped so we never flip past edge-on
      // Selected card pops to face camera (rotX → 0 as |delta| → 0).
      const flatness = Math.max(0, 1 - Math.abs(delta) * 1.6); // 1 at center, 0 by |delta|≥0.625
      const arcTilt   = -θdeg;                     // matches ring tangent
      const spineTilt = -Math.sign(delta) * SPINE_BIAS_DEG;
      const tiltDeg   = (arcTilt + spineTilt) * (1 - flatness) + 0 * flatness;
      const tiltClamped = Math.max(-MAX_TILT_DEG, Math.min(MAX_TILT_DEG, tiltDeg));
      g.rotation.x = tiltClamped * DEG;

      // selected card lifts forward — matches Cash App-style scroll interaction
      g.position.z += flatness * 0.6;
      g.scale.setScalar(1 + flatness * 0.08);
    });
  });

  return (
    <>
      {cardSlots.map((slot, i) => {
        // baseIdx wraps modulo total — picked at render time by useFrame
        const idx = ((Math.round(slot) % total) + total) % total;
        return (
          <group
            key={`slot-${slot}`}
            ref={(el) => { refs.current[i] = el; }}
            onClick={() => onPick?.(idx)}
          >
            <CardSlot slot={slot} side={side} items={items} total={total} renderedIdxRef={renderedIdxRef} />
          </group>
        );
      })}
    </>
  );
}

/**
 * Renders the actual textured Card based on which item *currently* lives in
 * this slot. Since slots are stable but the item they display rotates, we
 * remount the Card when the item changes (cheap — just texture swap).
 */
function CardSlot({
  slot, side, items, total, renderedIdxRef,
}: {
  slot: number;
  side: 'left' | 'right';
  items: readonly string[];
  total: number;
  renderedIdxRef: React.RefObject<number>;
}) {
  const [itemIdx, setItemIdx] = useState(() => {
    const f = renderedIdxRef.current ?? 0;
    return ((Math.round(f) + slot) % total + total) % total;
  });

  useFrame(() => {
    const f = renderedIdxRef.current ?? 0;
    const next = ((Math.round(f) + slot) % total + total) % total;
    if (next !== itemIdx) setItemIdx(next);
  });

  // unused but kept so downstream may attach text labels per item later
  void items;

  return <Card idx={itemIdx} side={side} />;
}
