/**
 * Pure viewport culling for the DOM wall.
 *
 * Off-screen islands must never mount their `<img>` elements, so visibility is
 * decided from `islandLayout` world AABBs and the shared camera projection —
 * never from `getBoundingClientRect` or any other DOM read.
 */

import {
  CAMERA_FOV_DEG,
  worldPerPixel,
  type Bounds,
  type CameraState,
  type Viewport,
} from '@/lib/camera/cameraMath';
import type { AlbumPlacement } from '@/lib/layout/types';

/** Visible wall rectangle in world units (centre-based), as the camera sees it. */
export function computeVisibleWorldBounds(
  camera: CameraState,
  viewport: Viewport,
  fovDeg: number = CAMERA_FOV_DEG,
): Bounds {
  const unitsPerPixel = worldPerPixel(camera.z, Math.max(1, viewport.height), fovDeg);
  return {
    x: camera.x,
    y: camera.y,
    width: Math.max(0, viewport.width) * unitsPerPixel,
    height: Math.max(0, viewport.height) * unitsPerPixel,
  };
}

/**
 * Islands whose AABB intersects the visible wall rectangle, in input order.
 * `margin` (world units) pre-loads slightly beyond the edge so a fast pan does
 * not flash empty space; the intersection test itself is inclusive.
 */
export function visibleIslands(
  camera: CameraState,
  viewport: Viewport,
  placements: readonly AlbumPlacement[],
  margin = 0,
): AlbumPlacement[] {
  const bounds = computeVisibleWorldBounds(camera, viewport);
  const pad = Number.isFinite(margin) ? Math.max(0, margin) : 0;
  const halfWidth = bounds.width / 2 + pad;
  const halfHeight = bounds.height / 2 + pad;
  const minX = camera.x - halfWidth;
  const maxX = camera.x + halfWidth;
  const minY = camera.y - halfHeight;
  const maxY = camera.y + halfHeight;

  return placements.filter((placement) => {
    const left = placement.position.x - placement.bounds.width / 2;
    const right = placement.position.x + placement.bounds.width / 2;
    const bottom = placement.position.y - placement.bounds.height / 2;
    const top = placement.position.y + placement.bounds.height / 2;
    return right >= minX && left <= maxX && top >= minY && bottom <= maxY;
  });
}
