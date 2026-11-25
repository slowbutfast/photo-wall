/**
 * Pure gyroscope tilt maths for the wall's mobile glare.
 *
 * `DeviceOrientationEvent` reports `beta` (front-back) / `gamma` (left-right)
 * in device coordinates, relative to a phone lying flat. A visitor holds the
 * phone at 35°–60°, so the first sample after entering a tier becomes the
 * baseline and every later sample is measured *relative* to it. The delta is
 * wrapped across ±180°, rotated into screen space with the explicit
 * `screen.orientation.angle` sign table, clamped to `±22°`, divided by
 * `2 * 22` into the same `[-0.5, +0.5]` space `FramedPrint` already uses for
 * mouse hover, then smoothed with a time-based exponential filter so 30Hz and
 * 120Hz devices feel identical.
 *
 * Zero DOM, zero React: `useGyroTilt.ts` owns the lifecycle and the tests drive
 * exactly the code the hook runs.
 */

/** Half-range of the tilt: `±22°` raw maps to `±0.5` normalized. */
export const DEFAULT_GYRO_MAX_DEG = 22;

/** Exponential smoothing time constant; larger is calmer, smaller is snappier. */
export const DEFAULT_GYRO_TAU_MS = 85;

/** Longest frame gap the smoother honours, so a backgrounded tab never snaps. */
const MAX_SMOOTH_DT_MS = 100;

/** Normalized tilt in `[-0.5, +0.5]`, matching the mouse-hover coordinate space. */
export interface TiltVector {
  nx: number;
  ny: number;
}

/** One `deviceorientation` reading, in degrees. */
export interface GyroSample {
  beta: number;
  gamma: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Collapses the `-0` that negated deltas produce, so `{ nx: 0 }` stays exact. */
function noNegativeZero(value: number): number {
  return value === 0 ? 0 : value;
}

/**
 * Shortest signed rotation from one angle to another, inside `[-180, 180)`.
 * Non-finite input collapses to `0` so a bad reading can never poison the tilt.
 */
export function wrapAngleDelta(delta: number): number {
  if (!Number.isFinite(delta)) return 0;
  return (((delta + 180) % 360) + 360) % 360 - 180;
}

/** Normalizes any reported screen angle to one of `0 / 90 / 180 / 270`. */
function screenAngleQuadrant(screenAngleDeg: number): number {
  if (!Number.isFinite(screenAngleDeg)) return 0;
  return ((Math.round(screenAngleDeg / 90) * 90) % 360 + 360) % 360;
}

/**
 * Maps a reading onto screen-space tilt relative to the entry baseline.
 *
 * The sign table is the contract: tilting the right edge of the screen down is
 * always `nx > 0` (`rotY > 0`) and tilting the top of the screen toward the
 * viewer is always `ny < 0` (`rotX > 0`), whatever the device rotation.
 */
export function computeGyroTilt(
  sample: GyroSample,
  baseline: GyroSample,
  screenAngleDeg: number,
): TiltVector {
  const dBeta = wrapAngleDelta(sample.beta - baseline.beta);
  const dGamma = wrapAngleDelta(sample.gamma - baseline.gamma);

  let screenX: number;
  let screenY: number;
  switch (screenAngleQuadrant(screenAngleDeg)) {
    case 90:
      screenX = -dBeta;
      screenY = dGamma;
      break;
    case 180:
      screenX = -dGamma;
      screenY = -dBeta;
      break;
    case 270:
      screenX = dBeta;
      screenY = -dGamma;
      break;
    case 0:
    default:
      screenX = dGamma;
      screenY = dBeta;
      break;
  }

  const range = DEFAULT_GYRO_MAX_DEG * 2;
  return {
    nx: noNegativeZero(clamp(screenX, -DEFAULT_GYRO_MAX_DEG, DEFAULT_GYRO_MAX_DEG) / range),
    ny: noNegativeZero(clamp(screenY, -DEFAULT_GYRO_MAX_DEG, DEFAULT_GYRO_MAX_DEG) / range),
  };
}

/**
 * One step of a time-based exponential low-pass filter:
 * `alpha = 1 - exp(-clamp(dtMs, 0, 100) / tauMs)`.
 *
 * Because `alpha` is derived from elapsed time, six 30Hz steps and twenty-four
 * 120Hz steps cover the same distance over the same wall-clock interval.
 */
export function smoothTilt(
  prev: TiltVector,
  next: TiltVector,
  dtMs: number,
  tauMs: number = DEFAULT_GYRO_TAU_MS,
): TiltVector {
  const tau = Number.isFinite(tauMs) && tauMs > 0 ? tauMs : DEFAULT_GYRO_TAU_MS;
  const dt = Number.isFinite(dtMs) ? clamp(dtMs, 0, MAX_SMOOTH_DT_MS) : 0;
  const alpha = 1 - Math.exp(-dt / tau);

  return {
    nx: noNegativeZero(clamp(prev.nx + (next.nx - prev.nx) * alpha, -0.5, 0.5)),
    ny: noNegativeZero(clamp(prev.ny + (next.ny - prev.ny) * alpha, -0.5, 0.5)),
  };
}
