/**
 * Task 1.1 — path-scaled camera flights (`src/lib/camera/flightPlan.ts`).
 *
 * Contract from `specs/spatial-camera-navigation`:
 * - `durationMs = clamp(round(300 + 380·S), 450, 1100)` from the van Wijk path
 *   length `S`, which must be the exact `S` `interpolateZoom` uses;
 * - short same-zoom steps pan at constant zoom, everything else arcs;
 * - one shared smoothstep `flightEase`; the entry framing keeps its own 620 ms;
 * - samples hit their endpoints exactly.
 *
 * Fixtures are the research.md measurements at a 393×852 viewport, `z = 6.2`
 * and a grid step of `CELL_SIZE + GUTTER`.
 */

import { describe, expect, it } from 'vitest';

import { CELL_SIZE, GUTTER } from '@/lib/layout/islandLayout';

import {
  CAMERA_FOV_DEG,
  cameraToCssScale,
  interpolateZoom,
  type CameraState,
} from '../cameraMath';
import {
  flightDurationMs,
  flightEase,
  planFlight,
  sampleFlight,
  zoomPathLength,
} from '../flightPlan';

const VIEWPORT = { width: 393, height: 852 };
const Z = 6.2;
const STEP = CELL_SIZE + GUTTER;

/** One viewport width in world units at a given zoom. */
function viewportWidthWorld(z: number): number {
  const cssScale = cameraToCssScale(z, VIEWPORT.height);
  return VIEWPORT.width / (cssScale * 100);
}

function sameZoomAt(widths: number): { from: CameraState; to: CameraState } {
  const distance = widths * viewportWidthWorld(Z);
  return {
    from: { x: 0, y: 0, z: Z },
    to: { x: distance, y: 0, z: Z },
  };
}

/**
 * Peak camera-centre speed in viewport widths per second, using the zoom at
 * each sample so a mid-flight zoom-out counts the same way it looks.
 */
function peakViewportWidthsPerSecond(
  sampler: (t: number) => CameraState,
  durationMs: number,
  samples = 400,
): number {
  let peak = 0;
  let previous: { x: number; y: number } | null = null;
  const dtSeconds = durationMs / 1000 / samples;
  for (let index = 0; index <= samples; index += 1) {
    const camera = sampler(index / samples);
    const cssScale = cameraToCssScale(camera.z, VIEWPORT.height) * 100;
    const point = { x: camera.x * cssScale, y: camera.y * cssScale };
    if (previous) {
      const distancePx = Math.hypot(point.x - previous.x, point.y - previous.y);
      peak = Math.max(peak, distancePx / VIEWPORT.width / dtSeconds);
    }
    previous = point;
  }
  return peak;
}

function smoothstep(t: number): number {
  return t * t * (3 - 2 * t);
}

describe('flightEase', () => {
  it('is smoothstep', () => {
    expect(flightEase(0)).toBe(0);
    expect(flightEase(0.25)).toBeCloseTo(0.15625, 12);
    expect(flightEase(0.5)).toBe(0.5);
    expect(flightEase(0.75)).toBeCloseTo(0.84375, 12);
    expect(flightEase(1)).toBe(1);
  });

  it('clamps outside [0, 1]', () => {
    expect(flightEase(-0.4)).toBe(0);
    expect(flightEase(1.7)).toBe(1);
  });
});

describe('zoomPathLength', () => {
  it('equals the S interpolateZoom uses for a coincident-centre zoom', () => {
    const from: CameraState = { x: 0, y: 0, z: 4 };
    const to: CameraState = { x: 0, y: 0, z: 9 };

    expect(zoomPathLength(from, to)).toBeCloseTo(Math.log(9 / 4) / Math.SQRT2, 12);

    // The same trajectory parameterised by S must land on the target at t = 1.
    const s = zoomPathLength(from, to);
    const zAtOne = from.z * Math.exp(Math.SQRT2 * 1 * s);
    expect(zAtOne).toBeCloseTo(to.z, 10);
  });

  it('matches the adjacent research fixture (S ≈ 0.409)', () => {
    const distance = STEP;
    const from: CameraState = { x: 0, y: 0, z: Z };
    const to: CameraState = { x: distance, y: 0, z: Z };

    expect(zoomPathLength(from, to)).toBeCloseTo(0.409, 3);
  });

  it('is symmetric in its endpoints', () => {
    const from: CameraState = { x: 1, y: -2, z: Z };
    const to: CameraState = { x: 4, y: 3, z: Z * 0.8 };

    expect(zoomPathLength(from, to)).toBeCloseTo(zoomPathLength(to, from), 12);
  });
});

describe('flightDurationMs', () => {
  it('matches the research fixtures (455 / 746 / 849 ms)', () => {
    expect(flightDurationMs(0.409)).toBe(455);
    expect(flightDurationMs(1.173)).toBe(746);
    expect(flightDurationMs(1.446)).toBe(849);
  });

  it('clamps to 450 ms and 1100 ms', () => {
    expect(flightDurationMs(0)).toBe(450);
    expect(flightDurationMs(100)).toBe(1100);
  });

  it('scales the real adjacent step to 455 ms ± 1', () => {
    const from: CameraState = { x: 0, y: 0, z: Z };
    const to: CameraState = { x: STEP, y: 0, z: Z };
    const plan = planFlight(from, to, VIEWPORT);

    expect(Math.abs(plan.durationMs - 455)).toBeLessThanOrEqual(1);
  });
});

describe('planFlight pan versus arc', () => {
  it('pans an adjacent same-zoom step (0.92 viewport widths)', () => {
    const { from, to } = sameZoomAt(0.92);
    expect(planFlight(from, to, VIEWPORT).kind).toBe('pan');
  });

  it('arcs a row wrap (3.81 viewport widths)', () => {
    const { from, to } = sameZoomAt(3.81);
    expect(planFlight(from, to, VIEWPORT).kind).toBe('arc');
  });

  it('arcs a 1.4 viewport step that changes zoom by 10%', () => {
    const { from, to } = sameZoomAt(1.4);
    expect(planFlight(from, { ...to, z: from.z * 1.1 }, VIEWPORT).kind).toBe('arc');
  });
});

describe('sampleFlight', () => {
  it('hits both endpoints exactly for a pan and an arc', () => {
    for (const widths of [0.92, 3.81]) {
      const { from, to } = sameZoomAt(widths);
      const { kind } = planFlight(from, to, VIEWPORT);

      expect(sampleFlight(from, to, kind, 0).camera).toEqual(from);
      expect(sampleFlight(from, to, kind, 1).camera).toEqual(to);
      expect(sampleFlight(from, to, kind, 0).eased).toBe(0);
      expect(sampleFlight(from, to, kind, 1).eased).toBe(1);
    }
  });

  it('keeps z constant and lerps x/y by the eased progress for a pan', () => {
    const { from, to } = sameZoomAt(0.92);

    for (const t of [0, 0.25, 0.5, 0.75, 1]) {
      const { camera, eased } = sampleFlight(from, to, 'pan', t);
      expect(camera.z).toBeCloseTo(from.z, 12);
      expect(camera.x).toBeCloseTo(from.x + eased * (to.x - from.x), 12);
      expect(camera.y).toBeCloseTo(from.y + eased * (to.y - from.y), 12);
    }
  });

  it('matches interpolateZoom at the eased progress for an arc', () => {
    const { from, to } = sameZoomAt(3.81);

    for (const t of [0, 0.2, 0.5, 0.8, 1]) {
      const { camera, eased } = sampleFlight(from, to, 'arc', t);
      const expected = interpolateZoom(from, to, eased);
      expect(camera.x).toBeCloseTo(expected.x, 12);
      expect(camera.y).toBeCloseTo(expected.y, 12);
      expect(camera.z).toBeCloseTo(expected.z, 12);
    }
  });
});

describe('can-fail guard: the fix actually tames the wrap whip', () => {
  it('roughly halves the 5-column wrap peak camera speed versus the fixed 720 ms arc', () => {
    const { from, to } = sameZoomAt(3.81);

    // Sampled on the camera centre, at each sample's own zoom. The research
    // note's absolute figures came from a slightly different apparent-speed
    // metric; the guard's job is to prove the fix moves the number materially.
    const oldPeak = peakViewportWidthsPerSecond(
      (t) => interpolateZoom(from, to, smoothstep(t)),
      720,
    );
    const plan = planFlight(from, to, VIEWPORT);
    const newPeak = peakViewportWidthsPerSecond(
      (t) => sampleFlight(from, to, plan.kind, t).camera,
      plan.durationMs,
    );

    expect(oldPeak).toBeGreaterThan(9);
    expect(newPeak).toBeLessThan(8.5);
    expect(newPeak).toBeLessThan(oldPeak * 0.9);
  });
});
