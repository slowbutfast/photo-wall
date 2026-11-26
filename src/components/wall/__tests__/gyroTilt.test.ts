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

import * as gyro from '../gyroTilt';
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

// ---------------------------------------------------------------------------
// gyro-relative-recenter: relative rotation and the stillness recentre.
//
// The new API is reached through the `gyro` namespace import above so this
// file still links, and every pre-existing case still runs, before the new
// exports exist. After implementation the same cases run against the real
// exports.
// ---------------------------------------------------------------------------

const DEG = Math.PI / 180;
const RAD = 180 / Math.PI;

type Mat3 = [[number, number, number], [number, number, number], [number, number, number]];

/** A raw W3C Z-X′-Y″ triple in degrees (never normalized; trig is periodic). */
interface Pose {
  alpha: number;
  beta: number;
  gamma: number;
}

function Rx(deg: number): Mat3 {
  const c = Math.cos(deg * DEG);
  const s = Math.sin(deg * DEG);
  return [
    [1, 0, 0],
    [0, c, -s],
    [0, s, c],
  ];
}

function Ry(deg: number): Mat3 {
  const c = Math.cos(deg * DEG);
  const s = Math.sin(deg * DEG);
  return [
    [c, 0, s],
    [0, 1, 0],
    [-s, 0, c],
  ];
}

function Rz(deg: number): Mat3 {
  const c = Math.cos(deg * DEG);
  const s = Math.sin(deg * DEG);
  return [
    [c, -s, 0],
    [s, c, 0],
    [0, 0, 1],
  ];
}

function multiply(a: Mat3, b: Mat3): Mat3 {
  const row = (i: number): [number, number, number] => [
    a[i][0] * b[0][0] + a[i][1] * b[1][0] + a[i][2] * b[2][0],
    a[i][0] * b[0][1] + a[i][1] * b[1][1] + a[i][2] * b[2][1],
    a[i][0] * b[0][2] + a[i][1] * b[1][2] + a[i][2] * b[2][2],
  ];
  return [row(0), row(1), row(2)];
}

/** `R = Rz(alpha) · Rx(beta) · Ry(gamma)` (W3C intrinsic Z-X′-Y″). */
function poseMatrix(pose: Pose): Mat3 {
  return multiply(Rz(pose.alpha), multiply(Rx(pose.beta), Ry(pose.gamma)));
}

/** Matrix → W3C triple, i.e. the inverse of `poseMatrix`. */
function toPose(m: Mat3): Pose {
  const clampUnit = (value: number) => Math.min(1, Math.max(-1, value));
  return {
    alpha: Math.atan2(-m[0][1], m[1][1]) * RAD,
    beta: Math.asin(clampUnit(m[2][1])) * RAD,
    gamma: Math.atan2(-m[2][0], m[2][2]) * RAD,
  };
}

/** A physical rotation applied in the device frame of `base`. */
function rotated(base: Pose, rotation: Mat3): Pose {
  return toPose(multiply(poseMatrix(base), rotation));
}

describe('recentre constants', () => {
  it('pins the documented stillness window, band, glide tau and settle threshold', () => {
    expect(gyro.RECENTER_STILL_MS).toBe(3000);
    expect(gyro.RECENTER_STILL_BAND_DEG).toBe(1.5);
    expect(gyro.RECENTER_GLIDE_TAU_MS).toBe(450);
    expect(gyro.GLIDE_SETTLE_EPS).toBe(0.002);
  });
});

describe('orientationMatrix', () => {
  it('builds Rz(alpha)·Rx(beta)·Ry(gamma), the W3C intrinsic Z-X′-Y″ rotation', () => {
    const expected = poseMatrix({ alpha: 30, beta: 40, gamma: 70 });
    const actual = gyro.orientationMatrix(30, 40, 70);

    for (let row = 0; row < 3; row += 1) {
      for (let column = 0; column < 3; column += 1) {
        expect(actual[row][column]).toBeCloseTo(expected[row][column], 12);
      }
    }
  });
});

describe('relativeDeviceTilt', () => {
  it('reads a pure +10° beta rotation from (0,45,0) as aboutX = +10°, aboutY = 0°', () => {
    const baseline: GyroSample = { alpha: 0, beta: 45, gamma: 0 };
    const sample: GyroSample = { alpha: 0, beta: 55, gamma: 0 };

    const tilt = gyro.relativeDeviceTilt(sample, baseline);

    expect(tilt.aboutX).toBeCloseTo(10, 6);
    expect(tilt.aboutY).toBeCloseTo(0, 6);
  });

  it('reads a pure +10° gamma rotation as aboutY = +10°, aboutX = 0°', () => {
    const baseline: GyroSample = { alpha: 20, beta: 45, gamma: 30 };
    const sample: GyroSample = { alpha: 20, beta: 45, gamma: 40 };

    const tilt = gyro.relativeDeviceTilt(sample, baseline);

    expect(tilt.aboutY).toBeCloseTo(10, 6);
    expect(tilt.aboutX).toBeCloseTo(0, 6);
  });

  it.each([0, 90, 180, 270])(
    'matches the Euler delta for single-axis motion at screen angle %i°',
    (screenAngle) => {
      // A gamma-free hold makes the Δβ matrix path coincide exactly with the
      // Euler delta; Δγ collapses to `Ry(Δγ)` for any baseline.
      const pairs: [GyroSample, GyroSample][] = [
        [
          { alpha: 12, beta: 55, gamma: 0 },
          { alpha: 12, beta: 45, gamma: 0 },
        ],
        [
          { alpha: 12, beta: 45, gamma: 40 },
          { alpha: 12, beta: 45, gamma: 30 },
        ],
      ];

      for (const [sample, baseline] of pairs) {
        const relative = gyro.relativeDeviceTilt(sample, baseline);
        const euler = gyro.relativeDeviceTilt(
          { ...sample, alpha: null },
          { ...baseline, alpha: null },
        );

        expect(relative.aboutX).toBeCloseTo(euler.aboutX, 6);
        expect(relative.aboutY).toBeCloseTo(euler.aboutY, 6);

        const matrixTilt = gyro.computeGyroTilt(sample, baseline, screenAngle);
        const eulerTilt = gyro.computeGyroTilt(
          { ...sample, alpha: null },
          { ...baseline, alpha: null },
          screenAngle,
        );
        expect(matrixTilt.nx).toBeCloseTo(eulerTilt.nx, 6);
        expect(matrixTilt.ny).toBeCloseTo(eulerTilt.ny, 6);
      }
    },
  );

  it('stays continuous through the (0,50,80) → (180,130,-85) gimbal crossing', () => {
    // The browser flips to the equivalent triple as gamma leaves [-90, 90):
    // the physical pose is a +15° rotation about device y.
    const baseline: GyroSample = { alpha: 0, beta: 50, gamma: 80 };
    const sample: GyroSample = { alpha: 180, beta: 130, gamma: -85 };

    const tilt = gyro.relativeDeviceTilt(sample, baseline);

    expect(tilt.aboutY).toBeCloseTo(15, 6);
    expect(Math.abs(tilt.aboutX)).toBeLessThan(1e-6);
  });

  it('gives the same relative rotation for the equivalent Euler triple', () => {
    const samples: GyroSample[] = [
      { alpha: 60, beta: 55, gamma: -10 },
      { alpha: 240, beta: 125, gamma: 170 },
    ];
    const baselines: GyroSample[] = [
      { alpha: 30, beta: 40, gamma: 25 },
      { alpha: 0, beta: 50, gamma: 80 },
      { alpha: 300, beta: 10, gamma: -30 },
    ];

    for (const baseline of baselines) {
      const first = gyro.relativeDeviceTilt(samples[0], baseline);
      const equivalent = gyro.relativeDeviceTilt(samples[1], baseline);

      expect(equivalent.aboutX).toBeCloseTo(first.aboutX, 6);
      expect(equivalent.aboutY).toBeCloseTo(first.aboutY, 6);
    }
  });

  it('reads a 10° device-x rotation from an upright β = 89° hold as aboutX ≈ 10°', () => {
    const baseline = toPose(poseMatrix({ alpha: 20, beta: 89, gamma: 0 }));
    const sample = rotated(baseline, Rx(10));

    const tilt = gyro.relativeDeviceTilt(sample, baseline);

    expect(tilt.aboutX).toBeCloseTo(10, 6);
    expect(tilt.aboutY).toBeCloseTo(0, 6);
  });

  it('does not register an in-plane twist about the screen normal as tilt', () => {
    const baseline: Pose = { alpha: 30, beta: 40, gamma: 25 };

    for (const theta of [30, -30, 90, -90]) {
      const sample = rotated(baseline, Rz(theta));
      const tilt = gyro.relativeDeviceTilt(sample, baseline);

      expect(tilt.aboutX).toBeCloseTo(0, 6);
      expect(tilt.aboutY).toBeCloseTo(0, 6);
    }
  });
});

describe('screenTiltFromDevice', () => {
  it('clamps device-frame tilt to ±0.5 and collapses -0', () => {
    expect(gyro.screenTiltFromDevice({ aboutX: 30, aboutY: -40 }, 0)).toEqual({
      nx: -0.5,
      ny: 0.5,
    });

    const negativeZero = gyro.screenTiltFromDevice({ aboutX: -0, aboutY: -0 }, 90);
    expect(Object.is(negativeZero.nx, 0)).toBe(true);
    expect(Object.is(negativeZero.ny, 0)).toBe(true);
  });
});

describe('computeGyroTilt relative-rotation path', () => {
  it('lands the gimbal-crossing tilt off the clamp where the Euler delta saturates', () => {
    const baseline: GyroSample = { alpha: 0, beta: 50, gamma: 80 };
    const sample: GyroSample = { alpha: 180, beta: 130, gamma: -85 };

    const matrix = gyro.computeGyroTilt(sample, baseline, 0);
    expect(matrix.nx).toBeCloseTo(15 / 44, 6);
    expect(Math.abs(matrix.ny)).toBeLessThan(1e-6);

    // The Euler delta documents the bug this change fixes.
    const euler = gyro.computeGyroTilt(
      { beta: sample.beta, gamma: sample.gamma },
      { beta: baseline.beta, gamma: baseline.gamma },
      0,
    );
    expect(Math.abs(euler.nx)).toBe(0.5);
    expect(Math.abs(euler.ny)).toBe(0.5);
  });

  it('clamps an extreme relative rotation on the matrix path', () => {
    const baseline: GyroSample = { alpha: 10, beta: 45, gamma: 0 };
    const sample: GyroSample = { alpha: 10, beta: 89, gamma: 0 };

    const tilt = gyro.computeGyroTilt(sample, baseline, 0);

    expect(tilt.ny).toBe(0.5);
    expect(Math.abs(tilt.nx)).toBeLessThan(1e-6);
  });
});

describe('missing alpha', () => {
  it('falls back to the Euler delta bit-identically when either side has no alpha', () => {
    const baseline: GyroSample = { beta: 50, gamma: 80 };
    const sample: GyroSample = { beta: 130, gamma: -85 };
    const expected = {
      aboutX: wrapAngleDelta(sample.beta - baseline.beta),
      aboutY: wrapAngleDelta(sample.gamma - baseline.gamma),
    };

    const fallbacks: [GyroSample, GyroSample][] = [
      [
        { ...sample, alpha: null },
        { ...baseline, alpha: null },
      ],
      [
        { ...sample, alpha: null },
        { ...baseline, alpha: 10 },
      ],
      [
        { ...sample, alpha: 10 },
        { ...baseline, alpha: null },
      ],
      [{ ...sample }, { ...baseline, alpha: 10 }],
    ];

    for (const [fallbackSample, fallbackBaseline] of fallbacks) {
      expect(gyro.relativeDeviceTilt(fallbackSample, fallbackBaseline)).toEqual(expected);
    }

    // The composite path is exactly the previous Euler-delta mapping.
    const eulerBaseline: GyroSample = { beta: 50, gamma: -8 };
    const eulerSample: GyroSample = { beta: 64, gamma: 2 };
    expect(gyro.computeGyroTilt(eulerSample, eulerBaseline, 0)).toEqual({
      nx: 10 / 44,
      ny: 14 / 44,
    });
    expect(gyro.computeGyroTilt(eulerSample, eulerBaseline, 90)).toEqual({
      nx: -14 / 44,
      ny: 10 / 44,
    });
  });

  it('treats a null alpha alone as a valid reading (only beta/gamma gate acceptance)', () => {
    const baseline: GyroSample = { alpha: null, beta: 50, gamma: -8 };
    const sample: GyroSample = { alpha: null, beta: 61, gamma: -8 };

    expect(gyro.computeGyroTilt(sample, baseline, 0).ny).toBeCloseTo(11 / 44, 12);
  });
});
