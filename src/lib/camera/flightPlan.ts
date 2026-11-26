/**
 * Path-scaled camera flights (vertical slice).
 *
 * One clock for the camera and the focus hand-off: a flight's duration comes
 * from the van Wijk path length `S`, its kind from the zoom change and screen
 * distance, and both the camera and `--focus-w` read the same `flightEase`.
 *
 * Pure and DOM-agnostic; `GalleryCanvas` is the only integrator.
 */

import {
  CAMERA_FOV_DEG,
  interpolateZoom,
  zoomPathParams,
  type CameraState,
} from './cameraMath';

export type FlightKind = 'pan' | 'arc';

export interface FlightViewport {
  width: number;
  height: number;
}

export interface FlightPlan {
  kind: FlightKind;
  /** `clamp(round(300 + 380·|S|), 450, 1100)`. */
  durationMs: number;
  /** `|S|` — the van Wijk path length. */
  pathLength: number;
}

export interface FlightSample {
  camera: CameraState;
  /** `flightEase(t)` — the shared hand-off progress. */
  eased: number;
}

export const FLIGHT_DURATION_BASE_MS = 300;
export const FLIGHT_DURATION_PER_UNIT_MS = 380;
export const FLIGHT_DURATION_MIN_MS = 450;
export const FLIGHT_DURATION_MAX_MS = 1100;

/** Same-zoom threshold: `|ln(z1 / z0)| ≤ 0.05`. */
export const PAN_MAX_LOG_ZOOM_RATIO = 0.05;
/** A pan may cross at most this many viewport widths at the start zoom. */
export const PAN_MAX_SCREEN_WIDTHS = 1.5;

/** The single easing shared by the camera and the focus hand-off. */
export function flightEase(t: number): number {
  const clamped = Math.min(1, Math.max(0, t));
  return clamped * clamped * (3 - 2 * clamped);
}

/** van Wijk path length between two cameras (`|(r1 - r0) / √2|`). */
export function zoomPathLength(a: CameraState, b: CameraState): number {
  return Math.abs(zoomPathParams(a, b).S);
}

export function flightDurationMs(pathLength: number): number {
  const raw = Math.round(FLIGHT_DURATION_BASE_MS + FLIGHT_DURATION_PER_UNIT_MS * pathLength);
  return Math.min(FLIGHT_DURATION_MAX_MS, Math.max(FLIGHT_DURATION_MIN_MS, raw));
}

/** Screen-space distance between the centres, in viewport widths at `from.z`. */
function screenDistanceInViewportWidths(
  from: CameraState,
  to: CameraState,
  viewport: FlightViewport,
  fovDeg: number,
): number {
  const tanHalf = Math.tan((fovDeg * Math.PI) / 180 / 2);
  const aspect = Math.max(1e-6, viewport.width / Math.max(1, viewport.height));
  const visibleWidth = 2 * Math.max(1e-9, from.z) * tanHalf * aspect;
  return Math.hypot(to.x - from.x, to.y - from.y) / Math.max(1e-9, visibleWidth);
}

export function planFlight(
  from: CameraState,
  to: CameraState,
  viewport: FlightViewport,
  fovDeg: number = CAMERA_FOV_DEG,
): FlightPlan {
  const pathLength = zoomPathLength(from, to);
  const logZoomRatio = Math.abs(Math.log(Math.max(1e-9, to.z) / Math.max(1e-9, from.z)));
  const screenWidths = screenDistanceInViewportWidths(from, to, viewport, fovDeg);

  const kind: FlightKind =
    logZoomRatio <= PAN_MAX_LOG_ZOOM_RATIO && screenWidths <= PAN_MAX_SCREEN_WIDTHS
      ? 'pan'
      : 'arc';

  return { kind, durationMs: flightDurationMs(pathLength), pathLength };
}

export function sampleFlight(
  from: CameraState,
  to: CameraState,
  kind: FlightKind,
  t: number,
): FlightSample {
  const eased = flightEase(t);
  if (kind === 'pan') {
    // Constant-zoom pan: `z` still interpolates geometrically, so a pan whose
    // endpoints differ inside the tolerance never drifts visibly.
    const zoomRatio = Math.max(1e-9, to.z) / Math.max(1e-9, from.z);
    return {
      eased,
      camera: {
        x: from.x + eased * (to.x - from.x),
        y: from.y + eased * (to.y - from.y),
        z: from.z * Math.pow(zoomRatio, eased),
      },
    };
  }

  return { eased, camera: interpolateZoom(from, to, eased) };
}
