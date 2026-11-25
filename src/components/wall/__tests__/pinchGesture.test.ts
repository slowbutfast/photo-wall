/**
 * Task 1.1 — pure wall-gesture maths (`src/components/wall/pinchGesture.ts`).
 *
 * Contract from `specs/spatial-camera-navigation`:
 * - a pinch zooms by `dist(curr) / dist(prev)` about the *current* midpoint and
 *   pans by the midpoint delta, so the world point under the fingers stays put;
 * - lifting one finger mid-pinch hands off to a one-finger pan with zero jump
 *   and never fires a click on release;
 * - degenerate pointer geometry never produces a NaN camera.
 */

import { describe, expect, it } from 'vitest';

import {
  CAMERA_FOV_DEG,
  screenToWorld,
  worldPerPixel,
  worldToScreen,
  zoomToCursor,
  type CameraState,
  type Viewport,
} from '@/lib/camera/cameraMath';

import {
  beginPointer,
  createIdleGesture,
  movePointer,
  pinchStep,
  releasePointer,
  type PinchPoints,
} from '../pinchGesture';

const EPSILON = 1e-6;
const VIEWPORT: Viewport = { width: 390, height: 844 };
/** Deliberately mid-range so neither the zoom-in nor the zoom-out clamp engages. */
const START_CAMERA: CameraState = { x: 1.7, y: -0.4, z: 38 };

/**
 * Reference camera application, mirroring `GalleryCanvas`'s `size >= 2`
 * branch: `panByPixels(pan)` first, then `zoomToCursor(anchor, factor)`.
 */
function applyPinchStep(camera: CameraState, prev: PinchPoints, curr: PinchPoints): CameraState {
  const step = pinchStep(prev, curr);
  if (!step) throw new Error('expected a pinch step for this geometry');

  const unitsPerPixel = worldPerPixel(camera.z, VIEWPORT.height, CAMERA_FOV_DEG);
  const panned: CameraState = {
    x: camera.x - step.panDx * unitsPerPixel,
    y: camera.y + step.panDy * unitsPerPixel,
    z: camera.z,
  };
  return zoomToCursor(panned, step.anchor, VIEWPORT, step.zoomFactor, CAMERA_FOV_DEG);
}

describe('pinchStep', () => {
  it('zooms by the distance ratio about a stationary midpoint with no pan', () => {
    const prev = { a: { x: 150, y: 400 }, b: { x: 250, y: 400 } };
    const curr = { a: { x: 130, y: 400 }, b: { x: 270, y: 400 } };

    const step = pinchStep(prev, curr);

    expect(step).not.toBeNull();
    expect(step?.zoomFactor).toBeCloseTo(1.4, 12);
    expect(step?.panDx).toBe(0);
    expect(step?.panDy).toBe(0);
    expect(step?.anchor).toEqual({ x: 200, y: 400 });
  });

  it('slides with a fixed finger separation without zooming', () => {
    const prev = { a: { x: 100, y: 100 }, b: { x: 200, y: 200 } };
    const curr = { a: { x: 160, y: 100 }, b: { x: 260, y: 200 } };

    const step = pinchStep(prev, curr);

    expect(step?.zoomFactor).toBeCloseTo(1, 12);
    expect(step?.panDx).toBeCloseTo(60, 12);
    expect(step?.panDy).toBeCloseTo(0, 12);
    expect(step?.anchor).toEqual({ x: 210, y: 150 });
  });

  it('keeps the world point under the fingers fixed through a combined pinch and slide', () => {
    const prev = { a: { x: 120, y: 300 }, b: { x: 220, y: 300 } };
    const curr = { a: { x: 260, y: 340 }, b: { x: 400, y: 340 } };
    const prevMidpoint = { x: 170, y: 300 };
    const currMidpoint = { x: 330, y: 340 };

    const anchoredWorld = screenToWorld(prevMidpoint, START_CAMERA, VIEWPORT);
    const next = applyPinchStep(START_CAMERA, prev, curr);
    const projected = worldToScreen(anchoredWorld, next, VIEWPORT);

    // Unclamped, so the invariant is exact up to float rounding.
    expect(Math.abs(projected.x - currMidpoint.x)).toBeLessThan(EPSILON);
    expect(Math.abs(projected.y - currMidpoint.y)).toBeLessThan(EPSILON);
  });

  it('moves the wall 120px right when a widening pinch also slides 120px right', () => {
    // spec scenario: pinch outward while moving both fingers 120px to the right
    const prev = { a: { x: 100, y: 400 }, b: { x: 200, y: 400 } };
    const curr = { a: { x: 180, y: 400 }, b: { x: 360, y: 400 } };

    const step = pinchStep(prev, curr);
    expect(step?.zoomFactor).toBeCloseTo(1.8, 12);
    expect(step?.panDx).toBeCloseTo(120, 12);
    expect(step?.panDy).toBeCloseTo(0, 12);

    // A wall feature that sat under the old midpoint follows the fingers.
    const anchoredWorld = screenToWorld({ x: 150, y: 400 }, START_CAMERA, VIEWPORT);
    const projected = worldToScreen(anchoredWorld, applyPinchStep(START_CAMERA, prev, curr), VIEWPORT);
    expect(Math.abs(projected.x - 270)).toBeLessThan(EPSILON);
    expect(Math.abs(projected.y - 400)).toBeLessThan(EPSILON);
  });

  it('returns null for degenerate geometry', () => {
    const valid = { a: { x: 5, y: 5 }, b: { x: 25, y: 5 } };

    // Zero previous distance.
    expect(pinchStep({ a: { x: 5, y: 5 }, b: { x: 5, y: 5 } }, valid)).toBeNull();
    // Zero current distance.
    expect(pinchStep(valid, { a: { x: 10, y: 10 }, b: { x: 10, y: 10 } })).toBeNull();
    // Non-finite coordinates (and therefore non-finite distances).
    expect(pinchStep({ a: { x: Number.NaN, y: 5 }, b: { x: 25, y: 5 } }, valid)).toBeNull();
    expect(pinchStep(valid, { a: { x: Number.POSITIVE_INFINITY, y: 5 }, b: { x: 25, y: 5 } })).toBeNull();
  });
});

describe('pointer hand-off state', () => {
  it('resets the drag latch only on the first finger down', () => {
    const pressed = beginPointer(createIdleGesture(), { id: 1, x: 100, y: 100 });
    expect(pressed.dragged).toBe(false);

    const dragging = movePointer(pressed, 1, 150, 100);
    expect(dragging.state.dragged).toBe(true);

    // A second finger must not resurrect "this was a tap".
    const second = beginPointer(dragging.state, { id: 2, x: 300, y: 100 });
    expect(second.dragged).toBe(true);
    expect(second.pointers).toHaveLength(2);
    expect(second.pinch).toEqual({ a: { x: 150, y: 100 }, b: { x: 300, y: 100 } });
  });

  it('hands a 1 → 2 → 1 finger sequence off without a positional jump', () => {
    // 1. One finger drags well past the tap threshold.
    const pressed = beginPointer(createIdleGesture(), { id: 1, x: 100, y: 100 });
    const dragged = movePointer(pressed, 1, 150, 100);
    expect(dragged.pan).toEqual({ dx: 50, dy: 0 });
    expect(dragged.state.dragged).toBe(true);

    // 2. A second finger lands, so the gesture becomes a pinch.
    const pinching = beginPointer(dragged.state, { id: 2, x: 300, y: 100 });
    expect(pinching.dragged).toBe(true);

    // 3. The second finger lifts without ever moving.
    const released = releasePointer(pinching, 2);
    expect(released.dragged).toBe(true);
    expect(released.pointers).toHaveLength(1);
    expect(released.pinch).toBeNull();
    // The remaining finger restarts its delta from where it actually is.
    expect(released.pointers[0]).toMatchObject({ id: 1, x: 150, y: 100, startX: 150, startY: 100 });

    // 4. The next move produces only the incremental delta — no jump back to `startX`.
    const resumed = movePointer(released, 1, 160, 100);
    expect(resumed.state.dragged).toBe(true);
    expect(resumed.pan).toEqual({ dx: 10, dy: 0 });
  });

  it('keeps the drag latch through release so the click that follows a pan is ignored', () => {
    const pressed = beginPointer(createIdleGesture(), { id: 1, x: 100, y: 100 });
    const dragged = movePointer(pressed, 1, 150, 100);

    const released = releasePointer(dragged.state, 1);
    expect(released.pointers).toEqual([]);
    expect(released.dragged).toBe(true);

    // The caller clears the latch on the next tick; only then does a new tap reset it.
    const nextTap = beginPointer({ ...released, dragged: false }, { id: 3, x: 20, y: 20 });
    expect(nextTap.dragged).toBe(false);
  });

  it('ignores moves from pointers it does not track', () => {
    const idle = createIdleGesture();
    const result = movePointer(idle, 99, 10, 10);
    expect(result.state).toBe(idle);
    expect(result.pan).toBeNull();
    expect(result.pinch).toBeNull();
  });
});
