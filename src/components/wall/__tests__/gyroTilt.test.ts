/**
 * Task 1.1 — pure gyroscope tilt maths (`src/components/wall/gyroTilt.ts`).
 *
 * Contract from `specs/instanced-photo-renderer` (mobile-gyroscope-glare):
 * - relative-to-entry baseline: the comfortable hand-holding angle maps to
 *   neutral `(nx, ny) = (0, 0)`, not raw `beta = 0, gamma = 0`;
 * - wrapped angular deltas and the explicit `0° / 90° / 180° / 270°`
 *   `screen.orientation.angle` sign table, so "tilt the right edge down" is
 *   always `nx > 0` and "tilt the top toward the viewer" is always `ny < 0`;
 * - `±22°` clamp into the same `[-0.5, +0.5]` space `FramedPrint` already uses
 *   for mouse hover;
 * - time-based exponential smoothing so a 30Hz and a 120Hz device feel alike.
 */

import { describe, expect, it } from 'vitest';

import {
  DEFAULT_GYRO_MAX_DEG,
  DEFAULT_GYRO_TAU_MS,
  computeGyroTilt,
  smoothTilt,
  wrapAngleDelta,
  type GyroSample,
  type TiltVector,
} from '../gyroTilt';

const EPSILON = 1e-12;
/** Mid-range, deliberately non-zero holding angle. */
const BASELINE: GyroSample = { beta: 50, gamma: -8 };

describe('constants', () => {
  it('pins the documented clamp and smoothing time constant', () => {
    expect(DEFAULT_GYRO_MAX_DEG).toBe(22);
    expect(DEFAULT_GYRO_TAU_MS).toBe(85);
  });
});

describe('wrapAngleDelta', () => {
  it('returns the signed shortest delta inside [-180, 180)', () => {
    expect(wrapAngleDelta(0)).toBe(0);
    expect(wrapAngleDelta(30)).toBe(30);
    expect(wrapAngleDelta(-30)).toBe(-30);
    expect(wrapAngleDelta(179)).toBe(179);
    expect(wrapAngleDelta(181)).toBeCloseTo(-179, 12);
    expect(wrapAngleDelta(-181)).toBeCloseTo(179, 12);
    expect(wrapAngleDelta(359)).toBeCloseTo(-1, 12);
    expect(wrapAngleDelta(-359)).toBeCloseTo(1, 12);
    expect(wrapAngleDelta(720)).toBeCloseTo(0, 12);
  });

  it('collapses non-finite input to zero instead of poisoning the tilt', () => {
    expect(wrapAngleDelta(Number.NaN)).toBe(0);
    expect(wrapAngleDelta(Number.POSITIVE_INFINITY)).toBe(0);
    expect(wrapAngleDelta(Number.NEGATIVE_INFINITY)).toBe(0);
  });
});

describe('computeGyroTilt', () => {
  it('treats the entry holding angle as neutral, not beta = 0 / gamma = 0', () => {
    expect(computeGyroTilt(BASELINE, BASELINE, 0)).toEqual({ nx: 0, ny: 0 });
    expect(computeGyroTilt({ beta: 50, gamma: -8 }, BASELINE, 90)).toEqual({ nx: 0, ny: 0 });
    expect(computeGyroTilt({ beta: 50, gamma: -8 }, BASELINE, 180)).toEqual({ nx: 0, ny: 0 });
    expect(computeGyroTilt({ beta: 50, gamma: -8 }, BASELINE, 270)).toEqual({ nx: 0, ny: 0 });
  });

  it('clamps each axis to ±22° and saturates at ±0.5', () => {
    // 0° portrait: screenX = +dGamma, screenY = +dBeta.
    expect(computeGyroTilt({ beta: 80, gamma: -8 }, BASELINE, 0).ny).toBe(0.5);
    expect(computeGyroTilt({ beta: 20, gamma: -8 }, BASELINE, 0).ny).toBe(-0.5);
    expect(computeGyroTilt({ beta: 50, gamma: 22 }, BASELINE, 0).nx).toBe(0.5);
    expect(computeGyroTilt({ beta: 50, gamma: -38 }, BASELINE, 0).nx).toBe(-0.5);
  });

  it.each([
    { angle: 0, dBeta: -11, dGamma: 11, xAxis: '+dGamma', yAxis: '+dBeta' },
    { angle: 90, dBeta: -11, dGamma: -11, xAxis: '-dBeta', yAxis: '+dGamma' },
    { angle: 180, dBeta: 11, dGamma: -11, xAxis: '-dGamma', yAxis: '-dBeta' },
    { angle: 270, dBeta: 11, dGamma: 11, xAxis: '+dBeta', yAxis: '-dGamma' },
  ])(
    'maps screen angle $angle° ($xAxis, $yAxis) onto screen axes',
    ({ angle, dBeta, dGamma }) => {
      const sample: GyroSample = {
        beta: BASELINE.beta + dBeta,
        gamma: BASELINE.gamma + dGamma,
      };

      const tilt = computeGyroTilt(sample, BASELINE, angle);

      expect(tilt.nx).toBeCloseTo(0.25, 12);
      expect(tilt.ny).toBeCloseTo(-0.25, 12);
    },
  );

  it('accepts -90 as the 270° landscape alias some browsers report', () => {
    const sample: GyroSample = { beta: BASELINE.beta + 11, gamma: BASELINE.gamma + 11 };

    expect(computeGyroTilt(sample, BASELINE, -90)).toEqual(
      computeGyroTilt(sample, BASELINE, 270),
    );
  });

  it('wraps ±180 readings into continuous small deltas instead of jumping', () => {
    // gamma 179 -> -179 is a 2° step across the seam, not -358°.
    const gammaSeam = computeGyroTilt({ beta: 30, gamma: -179 }, { beta: 30, gamma: 179 }, 0);
    expect(gammaSeam.nx).toBeCloseTo(2 / 44, 12);
    expect(gammaSeam.ny).toBe(0);

    // beta -179 -> 179 is a -2° step.
    const betaSeam = computeGyroTilt({ beta: 179, gamma: 0 }, { beta: -179, gamma: 0 }, 0);
    expect(betaSeam.ny).toBeCloseTo(-2 / 44, 12);
    expect(betaSeam.nx).toBe(0);
  });

  it('keeps both axes inside [-0.5, +0.5] for extreme deltas', () => {
    const tilt = computeGyroTilt({ beta: 179, gamma: 89 }, { beta: -179, gamma: -89 }, 0);

    expect(tilt.nx).toBeGreaterThanOrEqual(-0.5);
    expect(tilt.nx).toBeLessThanOrEqual(0.5);
    expect(tilt.ny).toBeGreaterThanOrEqual(-0.5);
    expect(tilt.ny).toBeLessThanOrEqual(0.5);
  });
});

describe('smoothTilt', () => {
  const START: TiltVector = { nx: 0, ny: 0 };
  const TARGET: TiltVector = { nx: 0.4, ny: -0.3 };

  it('applies alpha = 1 - exp(-dt / tau) on the first step', () => {
    const alpha = 1 - Math.exp(-50 / DEFAULT_GYRO_TAU_MS);

    const first = smoothTilt(START, TARGET, 50);

    expect(first.nx).toBeCloseTo(TARGET.nx * alpha, 12);
    expect(first.ny).toBeCloseTo(TARGET.ny * alpha, 12);
  });

  it('converges monotonically toward the target', () => {
    let value = START;
    let previous = START.nx;

    for (let step = 0; step < 20; step += 1) {
      value = smoothTilt(value, TARGET, 33.3);
      expect(value.nx).toBeGreaterThan(previous);
      expect(value.nx).toBeLessThan(TARGET.nx);
      previous = value.nx;
    }

    expect(value.nx).toBeCloseTo(TARGET.nx, 3);
  });

  it('matches across 30Hz and 120Hz sampling over the same elapsed time', () => {
    let slow = START;
    for (let step = 0; step < 6; step += 1) slow = smoothTilt(slow, TARGET, 1000 / 30);

    let fast = START;
    for (let step = 0; step < 24; step += 1) fast = smoothTilt(fast, TARGET, 1000 / 120);

    expect(fast.nx).toBeCloseTo(slow.nx, 12);
    expect(fast.ny).toBeCloseTo(slow.ny, 12);
  });

  it('caps long frame gaps at 100ms so a backgrounded tab does not snap', () => {
    expect(smoothTilt(START, TARGET, 5000)).toEqual(smoothTilt(START, TARGET, 100));
  });

  it('holds the previous value for non-positive dt', () => {
    const prev: TiltVector = { nx: 0.125, ny: -0.25 };

    expect(smoothTilt(prev, TARGET, 0)).toEqual(prev);
    expect(smoothTilt(prev, TARGET, -20)).toEqual(prev);
  });

  it('bounds its output to [-0.5, +0.5]', () => {
    const out = smoothTilt(START, { nx: 5, ny: -5 }, 1000);

    expect(out.nx).toBeLessThanOrEqual(0.5);
    expect(out.ny).toBeGreaterThanOrEqual(-0.5);
    expect(out.nx).toBeGreaterThanOrEqual(-0.5);
    expect(out.ny).toBeLessThanOrEqual(0.5);
  });

  it('is exact for a two-step 120Hz run versus one 60Hz step', () => {
    const half = smoothTilt(START, TARGET, 1000 / 120);
    const two = smoothTilt(half, TARGET, 1000 / 120);
    const one = smoothTilt(START, TARGET, 1000 / 60);

    expect(two.nx).toBeCloseTo(one.nx, 12);
    expect(two.ny).toBeCloseTo(one.ny, 12);
    expect(Math.abs(two.nx - one.nx)).toBeLessThan(EPSILON);
  });
});
