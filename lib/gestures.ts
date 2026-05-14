/**
 * Hand-shape detection from MediaPipe landmarks.
 * All thresholds are tuned empirically — adjust if a gesture doesn't trigger reliably.
 */

import type { NormalizedLandmark } from '@mediapipe/tasks-vision';

type Lm = NormalizedLandmark;

export type HandShape = {
  isPinch:       boolean;
  isOpenPalm:    boolean;
  isIndexPoint:  boolean;
  isThumbRight:  boolean; // thumb extended sideways pointing right (visual / mirrored sense)
  isThumbLeft:   boolean; // thumb extended sideways pointing left
};

/** Approximate hand size = wrist-to-middle-MCP distance in normalized coords. */
function handSize(lm: Lm[]): number {
  return Math.hypot(lm[0].x - lm[9].x, lm[0].y - lm[9].y);
}

/** Distance from a fingertip to the wrist, normalized by hand size. */
function fingertipDist(lm: Lm[], tipIdx: number, hs: number): number {
  return Math.hypot(lm[tipIdx].x - lm[0].x, lm[tipIdx].y - lm[0].y) / hs;
}

export function detectShape(lm: Lm[]): HandShape {
  const hs = handSize(lm);
  if (hs < 0.001) {
    return {
      isPinch: false, isOpenPalm: false, isIndexPoint: false,
      isThumbRight: false, isThumbLeft: false,
    };
  }

  // Finger extension flags
  const idxExt   = fingertipDist(lm, 8,  hs) > 1.6;
  const midExt   = fingertipDist(lm, 12, hs) > 1.6;
  const ringExt  = fingertipDist(lm, 16, hs) > 1.4;
  const pinkyExt = fingertipDist(lm, 20, hs) > 1.2;

  // Pinch: thumb tip and index tip close together
  const pinchDist = Math.hypot(lm[4].x - lm[8].x, lm[4].y - lm[8].y) / hs;
  const isPinch = pinchDist < 0.4;

  // Thumb extension: tip far from MCP joint
  const thumbDist = Math.hypot(lm[4].x - lm[2].x, lm[4].y - lm[2].y) / hs;
  const thumbExt = thumbDist > 0.55;

  // Thumb sideways: thumb extended AND mostly horizontal AND other fingers curled
  const dx = lm[4].x - lm[2].x;
  const dy = lm[4].y - lm[2].y;
  const horizontal = thumbExt && Math.abs(dx) > Math.abs(dy) * 1.3;
  const othersCurled = !idxExt && !midExt && !ringExt && !pinkyExt;

  // Note: video is mirrored at display time, but landmarks are in un-mirrored coords.
  // User pointing thumb to their right = camera's left = dx < 0 in landmarks.
  // After display mirror, this thumb appears pointing right on screen, matching intent.
  const isThumbRight = horizontal && othersCurled && dx < -0.04;
  const isThumbLeft  = horizontal && othersCurled && dx >  0.04;

  return {
    isPinch,
    isOpenPalm:   idxExt && midExt && ringExt && pinkyExt,
    isIndexPoint: idxExt && !midExt && !ringExt && !pinkyExt,
    isThumbRight,
    isThumbLeft,
  };
}

/**
 * 'left' = user's left hand (controls left wheel).
 * The mediapipe video is mirrored at display, but landmarks come in un-mirrored
 * coords — user's left side appears at high x.
 */
export function getHandSide(lm: Lm[]): 'left' | 'right' {
  return lm[0].x > 0.5 ? 'left' : 'right';
}

/** Center of palm in normalized [0,1] video coords. */
export function palmCenter(lm: Lm[]): { x: number; y: number } {
  return { x: lm[9].x, y: lm[9].y };
}

/** Human-readable label for the most prominent shape (for debug overlay). */
export function describeShape(s: HandShape): string {
  if (s.isPinch)       return 'pinch';
  if (s.isThumbRight)  return 'thumb→ next';
  if (s.isThumbLeft)   return '←thumb prev';
  if (s.isOpenPalm)    return 'open palm';
  if (s.isIndexPoint)  return 'index point';
  return '—';
}
