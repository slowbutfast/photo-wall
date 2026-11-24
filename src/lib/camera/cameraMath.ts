/**
 * Pure spatial camera math for the infinite gallery wall.
 *
 * Coordinate contract (`100px = 1 world unit`, owned by
 * `src/lib/layout/islandLayout.ts`): the camera looks straight down `-z` at a
 * wall plane at `z = 0`. `camera.z` is the distance from the camera to that
 * plane, `screen` coordinates are CSS pixels with `y` pointing down, and world
 * coordinates have `y` pointing up.
 */

import { ALBUMS_PER_ROW } from '../layout/islandLayout';
import type { AlbumPlacement } from '../layout/types';

/** Perspective camera field of view (degrees). */
export const CAMERA_FOV_DEG = 38;
export const CAMERA_NEAR = 0.2;
export const CAMERA_FAR = 500;
/** Closest / farthest camera distance from the wall plane, in world units. */
export const ZOOM_MIN = 2.4;
export const ZOOM_MAX = 140;

const MAX_GRID_COLUMNS = 12;
const DEG_TO_RAD = Math.PI / 180;

/** CSS pixels per world unit (`100px = 1 world unit`). */
export const WORLD_PX_PER_UNIT = 100;

export interface CameraState {
  x: number;
  y: number;
  z: number;
}

export interface Viewport {
  width: number;
  height: number;
}

export interface ScreenPoint {
  x: number;
  y: number;
}

export interface WorldPoint {
  x: number;
  y: number;
}

/** Axis-aligned bounds in world units; `x`/`y` are the centre. */
export interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface FitViewportOptions {
  fovDeg?: number;
  /** Viewport width / height. */
  aspect: number;
  /** Fraction of the usable viewport kept as margin on each side (0–0.45). */
  padding?: number;
  /** World-space z of the framed plane (e.g. `0.54` for a lifted print). */
  planeZ?: number;
  /** Bottom Photo Focus bar height + mobile safe-area inset, in CSS pixels. */
  bottomInsetPx?: number;
  /** Needed to convert `bottomInsetPx` into world units. */
  viewportHeightPx?: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function tanHalfFov(fovDeg: number): number {
  return Math.tan((fovDeg * DEG_TO_RAD) / 2);
}

/**
 * World units spanned by one CSS pixel at `cameraZ` (distance to the wall
 * plane) for a perspective camera with a vertical field of view of `fovDeg`.
 */
export function worldPerPixel(
  cameraZ: number,
  viewportHeightPx: number,
  fovDeg: number = CAMERA_FOV_DEG,
): number {
  const height = Math.max(1e-6, viewportHeightPx);
  const visibleHeight = 2 * cameraZ * tanHalfFov(fovDeg);
  return visibleHeight / height;
}

/**
 * On-screen scale factor for the 2D `.world` layer at camera distance `z`:
 * `worldPx * scale` CSS pixels fill the viewport height exactly.
 *
 * `cameraToCssScale(z, h, fov) = h / (2 * z * tan(fov/2) * 100)`
 */
export function cameraToCssScale(
  z: number,
  viewportHeightCss: number,
  fovDeg: number = CAMERA_FOV_DEG,
): number {
  const height = Math.max(1, viewportHeightCss);
  const distance = Math.max(1e-6, z);
  return height / (2 * distance * tanHalfFov(fovDeg) * WORLD_PX_PER_UNIT);
}

/** `cssLeft = worldX * 100`. */
export function worldXToCssLeft(worldX: number): number {
  return worldX * WORLD_PX_PER_UNIT;
}

/** `cssTop = -worldY * 100` — the world is y-up, CSS is y-down. */
export function worldYToCssTop(worldY: number): number {
  return -worldY * WORLD_PX_PER_UNIT;
}

/** World point -> untransformed CSS offset inside `.world`. */
export function worldToCss(world: WorldPoint): { left: number; top: number } {
  return { left: worldXToCssLeft(world.x), top: worldYToCssTop(world.y) };
}

/**
 * Horizontal framing target for the default entry view: the union AABB of the
 * first (up to) three albums of row 0, so the gallery opens on the first row
 * across the viewport instead of zooming out to the whole wall.
 */
export function computeFirstRowBounds(
  placements: readonly AlbumPlacement[],
  albumsPerRow: number = ALBUMS_PER_ROW,
): Bounds {
  const count = Math.max(0, Math.floor(albumsPerRow));
  const row = placements.slice(0, count);
  if (row.length === 0) return { x: 0, y: 0, width: 0, height: 0 };

  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const placement of row) {
    minX = Math.min(minX, placement.position.x - placement.bounds.width / 2);
    maxX = Math.max(maxX, placement.position.x + placement.bounds.width / 2);
    minY = Math.min(minY, placement.position.y - placement.bounds.height / 2);
    maxY = Math.max(maxY, placement.position.y + placement.bounds.height / 2);
  }

  return {
    x: (minX + maxX) / 2,
    y: (minY + maxY) / 2,
    width: maxX - minX,
    height: maxY - minY,
  };
}

/** Project a screen-space point onto the wall plane (`z = 0`). */
export function screenToWorld(
  screen: ScreenPoint,
  camera: CameraState,
  viewport: Viewport,
  fovDeg: number = CAMERA_FOV_DEG,
): WorldPoint {
  const unitsPerPixel = worldPerPixel(camera.z, viewport.height, fovDeg);
  return {
    x: camera.x + (screen.x - viewport.width / 2) * unitsPerPixel,
    y: camera.y - (screen.y - viewport.height / 2) * unitsPerPixel,
  };
}

/** Project a wall-plane world point back into screen space. */
export function worldToScreen(
  world: WorldPoint,
  camera: CameraState,
  viewport: Viewport,
  fovDeg: number = CAMERA_FOV_DEG,
): ScreenPoint {
  const unitsPerPixel = worldPerPixel(camera.z, viewport.height, fovDeg);
  return {
    x: viewport.width / 2 + (world.x - camera.x) / unitsPerPixel,
    y: viewport.height / 2 - (world.y - camera.y) / unitsPerPixel,
  };
}

/**
 * Cursor-anchored zoom. `zoomFactor > 1` zooms in. The new `camera.z` is
 * clamped to `[ZOOM_MIN, ZOOM_MAX]`; the camera centre is then re-anchored so
 * the wall-plane point under the cursor stays fixed for the *effective*
 * (clamped) factor.
 */
export function zoomToCursor(
  camera: CameraState,
  cursor: ScreenPoint,
  viewport: Viewport,
  zoomFactor: number,
  fovDeg: number = CAMERA_FOV_DEG,
): CameraState {
  if (!Number.isFinite(zoomFactor) || zoomFactor <= 0) {
    return { x: camera.x, y: camera.y, z: camera.z };
  }

  const anchor = screenToWorld(cursor, camera, viewport, fovDeg);
  const nextZ = clamp(camera.z / zoomFactor, ZOOM_MIN, ZOOM_MAX);
  const unitsPerPixel = worldPerPixel(nextZ, viewport.height, fovDeg);

  return {
    x: anchor.x - (cursor.x - viewport.width / 2) * unitsPerPixel,
    y: anchor.y + (cursor.y - viewport.height / 2) * unitsPerPixel,
    z: nextZ,
  };
}

/**
 * Frame `bounds` against both the horizontal and vertical FOV, leaving
 * `padding` on every side and keeping the subject above `bottomInsetPx`.
 * Returns the target camera state (z clamped to the zoom contract).
 */
export function fitBoundsToViewport(
  bounds: Bounds,
  options: FitViewportOptions,
): CameraState {
  const aspect = Math.max(1e-6, options.aspect);
  const fovDeg = options.fovDeg ?? CAMERA_FOV_DEG;
  const padding = clamp(options.padding ?? 0.08, 0, 0.45);
  const planeZ = options.planeZ ?? 0;
  const bottomInsetPx = Math.max(0, options.bottomInsetPx ?? 0);
  const viewportHeightPx = Math.max(1, options.viewportHeightPx ?? 1080);

  const tanHalf = tanHalfFov(fovDeg);
  const contentFactor = Math.max(1e-6, 1 - 2 * padding);
  const usableHeightFraction = Math.max(1e-6, (viewportHeightPx - bottomInsetPx) / viewportHeightPx);

  const width = Math.max(0, bounds.width);
  const height = Math.max(0, bounds.height);
  const distanceForWidth = width / contentFactor / (2 * tanHalf * aspect);
  const distanceForHeight = height / (contentFactor * usableHeightFraction) / (2 * tanHalf);

  const z = clamp(Math.max(distanceForWidth, distanceForHeight) + planeZ, ZOOM_MIN, ZOOM_MAX);
  const distance = Math.max(0, z - planeZ);
  const visibleHeight = 2 * distance * tanHalf;
  const insetWorld = (bottomInsetPx / viewportHeightPx) * visibleHeight;

  return {
    x: bounds.x,
    y: bounds.y - insetWorld / 2,
    z,
  };
}

const RHO = Math.SQRT2;
const RHO2 = 2;
const RHO4 = 4;
const EPSILON2 = 1e-12;

function cosh(value: number): number {
  const exp = Math.exp(value);
  return (exp + 1 / exp) / 2;
}

function sinh(value: number): number {
  const exp = Math.exp(value);
  return (exp - 1 / exp) / 2;
}

function tanh(value: number): number {
  const exp = Math.exp(2 * value);
  return (exp - 1) / (exp + 1);
}

/**
 * van Wijk & Nuij smooth zoom/pan interpolation between two camera states.
 * `z` is used as the trajectory's zoom-scale parameter (proportional to the
 * visible viewport width); the returned state is not clamped, so callers may
 * clamp the camera themselves.
 */
export function interpolateZoom(a: CameraState, b: CameraState, t: number): CameraState {
  if (t <= 0) return { x: a.x, y: a.y, z: a.z };
  if (t >= 1) return { x: b.x, y: b.y, z: b.z };

  const ux0 = a.x;
  const uy0 = a.y;
  const w0 = Math.max(1e-9, a.z);
  const ux1 = b.x;
  const uy1 = b.y;
  const w1 = Math.max(1e-9, b.z);
  const dx = ux1 - ux0;
  const dy = uy1 - uy0;
  const d2 = dx * dx + dy * dy;

  if (d2 < EPSILON2) {
    const S = Math.log(w1 / w0) / RHO;
    const scale = Math.exp(RHO * t * S);
    return {
      x: ux0 + t * dx,
      y: uy0 + t * dy,
      z: w0 * scale,
    };
  }

  const d1 = Math.sqrt(d2);
  const b0 = (w1 * w1 - w0 * w0 + RHO4 * d2) / (2 * w0 * RHO2 * d1);
  const b1 = (w1 * w1 - w0 * w0 - RHO4 * d2) / (2 * w1 * RHO2 * d1);
  const r0 = Math.log(Math.sqrt(b0 * b0 + 1) - b0);
  const r1 = Math.log(Math.sqrt(b1 * b1 + 1) - b1);
  const S = (r1 - r0) / RHO;

  const s = t * S;
  const coshR0 = cosh(r0);
  const u = (w0 / (RHO2 * d1)) * (coshR0 * tanh(RHO * s + r0) - sinh(r0));

  return {
    x: ux0 + u * dx,
    y: uy0 + u * dy,
    z: (w0 * coshR0) / cosh(RHO * s + r0),
  };
}
