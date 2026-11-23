/**
 * Pure spatial camera math for the infinite gallery wall.
 *
 * Coordinate contract (`100px = 1 world unit`, owned by
 * `src/lib/layout/islandLayout.ts`): the camera looks straight down `-z` at a
 * wall plane at `z = 0`. `camera.z` is the distance from the camera to that
 * plane, `screen` coordinates are CSS pixels with `y` pointing down, and world
 * coordinates have `y` pointing up.
 */

import {
  CELL_SIZE,
  GUTTER,
  ISLAND_GAP,
  PLACARD_HEIGHT,
  PLACARD_WIDTH,
  SOUNDTRACK_GAP,
  SOUNDTRACK_HEIGHT,
} from '../layout/islandLayout';
import type { WallAlbum, WallPhoto } from '../layout/types';

/** Perspective camera field of view (degrees). */
export const CAMERA_FOV_DEG = 38;
export const CAMERA_NEAR = 0.2;
export const CAMERA_FAR = 500;
/** Closest / farthest camera distance from the wall plane, in world units. */
export const ZOOM_MIN = 2.4;
export const ZOOM_MAX = 140;

const MAX_GRID_COLUMNS = 12;
const DEG_TO_RAD = Math.PI / 180;

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

export interface HitCell {
  row: number;
  column: number;
  index: number;
}

export interface HitTestResult {
  album: WallAlbum;
  photo: WallPhoto;
  cell: HitCell;
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

interface GridMetrics {
  columns: number;
  rows: number;
  gridCenterX: number;
  islandTop: number;
}

/**
 * O(1) island arithmetic mirroring `computeAlbumGrid` (which is O(photos) and
 * therefore unsuitable for per-pointer hit testing).
 */
function gridMetrics(
  photoCount: number,
  gridColumns: number | undefined,
  hasSoundtrack: boolean,
): GridMetrics {
  const rawColumns = Math.floor(gridColumns ?? 3);
  const columns = Number.isFinite(rawColumns) && rawColumns > 0
    ? Math.min(rawColumns, MAX_GRID_COLUMNS)
    : 1;
  const count = Math.max(0, Math.floor(photoCount));
  const rows = count === 0 ? 1 : Math.ceil(count / columns);

  const gridHeight = rows * CELL_SIZE + (rows - 1) * GUTTER;
  const placardStackHeight =
    PLACARD_HEIGHT + (hasSoundtrack ? SOUNDTRACK_GAP + SOUNDTRACK_HEIGHT : 0);
  const islandHeight = Math.max(gridHeight, placardStackHeight);

  return {
    columns,
    rows,
    gridCenterX: (PLACARD_WIDTH + ISLAND_GAP) / 2,
    islandTop: islandHeight / 2,
  };
}

/**
 * Broad-phase album AABB scan (`O(albums)`) followed by `O(1)` grid-cell
 * arithmetic inside the matched island. Returns `null` when the point misses
 * every print (including the placard and gutters).
 */
export function hitTestWall(
  point: WorldPoint,
  albums: WallAlbum[],
): HitTestResult | null {
  for (const album of albums) {
    const halfWidth = album.bounds.width / 2;
    const halfHeight = album.bounds.height / 2;
    if (
      point.x < album.position.x - halfWidth ||
      point.x > album.position.x + halfWidth ||
      point.y < album.position.y - halfHeight ||
      point.y > album.position.y + halfHeight
    ) {
      continue;
    }

    const count = album.photos.length;
    if (count === 0) continue;

    const metrics = gridMetrics(count, album.gridColumns, Boolean(album.soundtrack));
    const localX = point.x - album.position.x;
    const localY = point.y - album.position.y;
    const stride = CELL_SIZE + GUTTER;
    const downFromTop = metrics.islandTop - localY;
    if (downFromTop < 0) continue;

    const row = Math.floor(downFromTop / stride);
    if (row < 0 || row >= metrics.rows) continue;

    const rowItemCount = Math.min(metrics.columns, count - row * metrics.columns);
    if (rowItemCount <= 0) continue;

    const rowWidth = rowItemCount * CELL_SIZE + (rowItemCount - 1) * GUTTER;
    const rowLeft = metrics.gridCenterX - rowWidth / 2;
    const fromRowLeft = localX - rowLeft;
    if (fromRowLeft < 0) continue;

    const column = Math.floor(fromRowLeft / stride);
    if (column < 0 || column >= rowItemCount) continue;

    const withinCellX = fromRowLeft - column * stride;
    const withinCellY = downFromTop - row * stride;
    if (withinCellX > CELL_SIZE || withinCellY > CELL_SIZE) continue;

    const index = row * metrics.columns + column;
    const photo = album.photos[index];
    if (!photo) continue;

    return { album, photo, cell: { row, column, index } };
  }

  return null;
}
