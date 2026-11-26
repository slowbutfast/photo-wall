/**
 * Pure gyroscope tilt maths for the wall's mobile glare.
 *
 * `DeviceOrientationEvent` reports `alpha` (compass yaw) / `beta` (front-back) /
 * `gamma` (left-right) in device coordinates, relative to a phone lying flat. A
 * visitor holds the phone at 35°–60°, so the first sample after entering a tier
 * becomes the **entry baseline** and every later sample is measured relative to
 * it.
 *
 * That relative pose is a true **relative rotation**,
 * `R_rel = R_baseᵀ · R_cur` with `R = Rz(alpha)·Rx(beta)·Ry(gamma)` (W3C
 * intrinsic Z-X′-Y″), not an Euler-angle subtraction. The rotated device normal
 * `R_rel · (0, 0, 1)` yields two unclamped **device-frame tilt** angles,
 * `aboutY` and `aboutX`, which survive a landscape or upright hold and a gimbal
 * crossing. When either side lacks a finite `alpha` the maths falls back to the
 * wrapped **Euler delta**, which is exactly the pre-change behaviour.
 *
 * The device-frame tilt is then rotated into screen space with the explicit
 * `screen.orientation.angle` sign table, clamped to `±22°`, divided by `2 * 22`
 * into the same `[-0.5, +0.5]` space `FramedPrint` already uses for mouse hover,
 * then smoothed with a time-based exponential filter so 30Hz and 120Hz devices
 * feel identical.
 *
 * Zero DOM, zero React: `useGyroTilt.ts` owns the lifecycle and the tests drive
 * exactly the code the hook runs.
 */

/** Half-range of the tilt: `±22°` raw maps to `±0.5` normalized. */
export const DEFAULT_GYRO_MAX_DEG = 22;

/** Exponential smoothing time constant; larger is calmer, smaller is snappier. */
export const DEFAULT_GYRO_TAU_MS = 85;

/** Consecutive **stillness** needed before a **recentre**. */
export const RECENTER_STILL_MS = 3000;

/** Per-axis band, in unclamped device-frame degrees, that breaks stillness. */
export const RECENTER_STILL_BAND_DEG = 1.5;

/** **Glide** time constant after a recentre: calmer than the tracking tau. */
export const RECENTER_GLIDE_TAU_MS = 450;

/** Normalized settle threshold that ends a glide and emits the exact target. */
export const GLIDE_SETTLE_EPS = 0.002;

/** Longest frame gap the smoother honours, so a backgrounded tab never snaps. */
const MAX_SMOOTH_DT_MS = 100;

/** Normalized tilt in `[-0.5, +0.5]`, matching the mouse-hover coordinate space. */
export interface TiltVector {
  nx: number;
  ny: number;
}

/**
 * One `deviceorientation` reading, in degrees. `alpha` is the W3C `double?`:
 * absent or `null` means the platform cannot provide it, which selects the
 * Euler-delta fallback.
 */
export interface GyroSample {
  alpha?: number | null;
  beta: number;
  gamma: number;
}

/**
 * Two unclamped **device-frame tilt** angles in degrees, relative to the entry
 * baseline. Screen-space `nx`/`ny` come later, after the sign table and clamp.
 */
export interface DeviceTilt {
  aboutX: number;
  aboutY: number;
}

/** Row-major 3×3 rotation matrix. */
export type Mat3 = [[number, number, number], [number, number, number], [number, number, number]];

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

const DEG_TO_RAD = Math.PI / 180;
const RAD_TO_DEG = 180 / Math.PI;

/**
 * `R = Rz(alpha) · Rx(beta) · Ry(gamma)`, the W3C intrinsic Z-X′-Y″ rotation,
 * in right-handed coordinates.
 */
export function orientationMatrix(alpha: number, beta: number, gamma: number): Mat3 {
  const ca = Math.cos(alpha * DEG_TO_RAD);
  const sa = Math.sin(alpha * DEG_TO_RAD);
  const cb = Math.cos(beta * DEG_TO_RAD);
  const sb = Math.sin(beta * DEG_TO_RAD);
  const cg = Math.cos(gamma * DEG_TO_RAD);
  const sg = Math.sin(gamma * DEG_TO_RAD);

  return [
    [ca * cg - sa * sb * sg, -sa * cb, ca * sg + sa * sb * cg],
    [sa * cg + ca * sb * sg, ca * cb, sa * sg - ca * sb * cg],
    [-cb * sg, sb, cb * cg],
  ];
}

/**
 * **Device-frame tilt** of `sample` relative to the entry baseline, in
 * unclamped degrees.
 *
 * With a finite `alpha` on both sides this is the **relative rotation**
 * `R_rel = R_baseᵀ · R_cur`. Reading the rotated device normal
 * `v = R_rel · (0, 0, 1)` gives `aboutY = atan2(v.x, v.z)` and
 * `aboutX = atan2(−v.y, v.z)`. That stays continuous through a **gimbal
 * crossing**, where an Euler delta does not.
 *
 * With `alpha` missing on either side it returns the wrapped **Euler delta**,
 * bit-identical to the pre-change maths. Forcing `alpha = 0` instead would be
 * worse at a crossing.
 */
export function relativeDeviceTilt(sample: GyroSample, baseline: GyroSample): DeviceTilt {
  const sampleAlpha = sample.alpha;
  const baselineAlpha = baseline.alpha;
  const hasBothAlpha =
    typeof sampleAlpha === 'number' &&
    Number.isFinite(sampleAlpha) &&
    typeof baselineAlpha === 'number' &&
    Number.isFinite(baselineAlpha);

  if (hasBothAlpha) {
    const base = orientationMatrix(baselineAlpha, baseline.beta, baseline.gamma);
    const current = orientationMatrix(sampleAlpha, sample.beta, sample.gamma);
    // Third column of `R_baseᵀ · R_cur` = `R_baseᵀ · (R_cur · (0, 0, 1))`.
    const vx =
      base[0][0] * current[0][2] + base[1][0] * current[1][2] + base[2][0] * current[2][2];
    const vy =
      base[0][1] * current[0][2] + base[1][1] * current[1][2] + base[2][1] * current[2][2];
    const vz =
      base[0][2] * current[0][2] + base[1][2] * current[1][2] + base[2][2] * current[2][2];

    return {
      aboutX: Math.atan2(-vy, vz) * RAD_TO_DEG,
      aboutY: Math.atan2(vx, vz) * RAD_TO_DEG,
    };
  }

  return {
    aboutX: wrapAngleDelta(sample.beta - baseline.beta),
    aboutY: wrapAngleDelta(sample.gamma - baseline.gamma),
  };
}

/**
 * Maps device-frame tilt onto screen-space tilt.
 *
 * The sign table is the contract: tilting the right edge of the screen down is
 * always `nx > 0` (`rotY > 0`) and tilting the top of the screen toward the
 * viewer is always `ny < 0` (`rotX > 0`), whatever the device rotation.
 * `aboutY` plays the role `dGamma` played, and `aboutX` the role `dBeta`.
 */
export function screenTiltFromDevice(tilt: DeviceTilt, screenAngleDeg: number): TiltVector {
  const { aboutX: dBeta, aboutY: dGamma } = tilt;

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
 * Maps a reading onto screen-space tilt relative to the entry baseline:
 * `screenTiltFromDevice(relativeDeviceTilt(sample, baseline), screenAngle)`.
 */
export function computeGyroTilt(
  sample: GyroSample,
  baseline: GyroSample,
  screenAngleDeg: number,
): TiltVector {
  return screenTiltFromDevice(relativeDeviceTilt(sample, baseline), screenAngleDeg);
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
