/**
 * Task 1.3 — pure viewport culling (`src/components/wall/visibleIslands.ts`, Task 3.1).
 *
 * `visibleIslands(camera, viewport, placements, margin)` must cull from the
 * `islandLayout` world AABBs with zero DOM reads: no `getBoundingClientRect`,
 * no `window`, no element measurement. Off-screen islands stay unmounted so
 * their `<img>` elements never decode.
 */

import { describe, expect, it } from 'vitest';

import { computeVisibleWorldBounds, visibleIslands } from '../visibleIslands';
import { CAMERA_FOV_DEG, worldPerPixel } from '@/lib/camera/cameraMath';
import { computeWallGridPositions } from '@/lib/layout/islandLayout';
import type { AlbumPlacement } from '@/lib/layout/types';

const DESKTOP = { width: 1600, height: 1000 };
const MOBILE = { width: 390, height: 844 };

function placement(
  id: string,
  x: number,
  y: number,
  width = 10,
  height = 4,
): AlbumPlacement {
  return { id, position: { x, y }, bounds: { width, height } };
}

/** 50 published albums with real `computeWallGridPositions` geometry. */
function makeWall(count: number): AlbumPlacement[] {
  return computeWallGridPositions(
    Array.from({ length: count }, (_, index) => ({
      id: `album-${index}`,
      status: 'published' as const,
      photoCount: 20,
      gridColumns: 10,
      sortOrder: index,
      hasSoundtrack: false,
    })),
  );
}

describe('computeVisibleWorldBounds', () => {
  it('derives the wall AABB from the shared camera projection', () => {
    const camera = { x: 3, y: -2, z: 10 };
    const bounds = computeVisibleWorldBounds(camera, DESKTOP);

    const unitsPerPixel = worldPerPixel(camera.z, DESKTOP.height, CAMERA_FOV_DEG);
    expect(bounds.width).toBeCloseTo(DESKTOP.width * unitsPerPixel, 9);
    expect(bounds.height).toBeCloseTo(DESKTOP.height * unitsPerPixel, 9);
    expect(bounds.x).toBeCloseTo(camera.x, 12);
    expect(bounds.y).toBeCloseTo(camera.y, 12);
  });

  it('sees strictly less wall horizontally on a mobile viewport', () => {
    const camera = { x: 0, y: 0, z: 10 };
    const desktop = computeVisibleWorldBounds(camera, DESKTOP);
    const mobile = computeVisibleWorldBounds(camera, MOBILE);

    expect(mobile.height).toBeCloseTo(desktop.height, 9);
    expect(mobile.width).toBeLessThan(desktop.width);
    expect(mobile.width / mobile.height).toBeCloseTo(MOBILE.width / MOBILE.height, 9);
  });

  it('widens the visible wall as the camera pulls back', () => {
    const near = computeVisibleWorldBounds({ x: 0, y: 0, z: 10 }, DESKTOP);
    const far = computeVisibleWorldBounds({ x: 0, y: 0, z: 20 }, DESKTOP);
    expect(far.width).toBeCloseTo(near.width * 2, 9);
    expect(far.height).toBeCloseTo(near.height * 2, 9);
  });
});

describe('visibleIslands', () => {
  it('culls islands outside the wall AABB with zero DOM reads', () => {
    expect(typeof document).toBe('undefined');
    expect(typeof window).toBe('undefined');

    const placements = [
      placement('centre', 0, 0),
      placement('right', 20, 0),
      placement('left', -20, 0),
      placement('below', 0, -20),
    ];
    const visible = visibleIslands({ x: 0, y: 0, z: 10 }, DESKTOP, placements);
    expect(visible.map((entry: AlbumPlacement) => entry.id)).toEqual(['centre']);
  });

  it('culls more aggressively on a narrow mobile viewport', () => {
    const placements = [placement('centre', 0, 0), placement('flank', 7, 0), placement('flank-2', -7, 0)];
    const camera = { x: 0, y: 0, z: 10 };

    const desktop = visibleIslands(camera, DESKTOP, placements).map((entry: AlbumPlacement) => entry.id);
    const mobile = visibleIslands(camera, MOBILE, placements).map((entry: AlbumPlacement) => entry.id);

    expect(desktop).toEqual(['centre', 'flank', 'flank-2']);
    expect(mobile).toEqual(['centre']);
  });

  it('expands the cull region by the requested world-unit margin', () => {
    const placements = [placement('just-off-screen', 11, 0)];
    const camera = { x: 0, y: 0, z: 10 };

    expect(visibleIslands(camera, DESKTOP, placements)).toEqual([]);
    expect(visibleIslands(camera, DESKTOP, placements, 1).map((entry: AlbumPlacement) => entry.id)).toEqual([
      'just-off-screen',
    ]);
  });

  it('treats an island whose edge exactly touches the viewport as visible', () => {
    const camera = { x: 0, y: 0, z: 10 };
    const bounds = computeVisibleWorldBounds(camera, DESKTOP);
    const touching = placement('touching', bounds.x + bounds.width / 2 + 1, bounds.y, 2, 2);
    const outside = placement('outside', bounds.x + bounds.width / 2 + 1 + 1e-6, bounds.y, 2, 2);

    expect(visibleIslands(camera, DESKTOP, [touching]).map((entry: AlbumPlacement) => entry.id)).toEqual(['touching']);
    expect(visibleIslands(camera, DESKTOP, [outside])).toEqual([]);
  });

  it('shows every island when zoomed all the way out', () => {
    const wall = makeWall(50);
    const ys = wall.map((entry) => entry.position.y);
    // Centre on the wall: at z=140 the visible height just covers the 17 rows.
    const camera = { x: 0, y: (Math.max(...ys) + Math.min(...ys)) / 2, z: 140 };
    expect(visibleIslands(camera, DESKTOP, wall)).toHaveLength(wall.length);
  });

  it('prefers row 0 and leaves deeper rows below the fold', () => {
    const wall = makeWall(12);
    const row0Centre = wall[1];
    const deeperRows = wall.slice(6);

    const camera = {
      x: row0Centre.position.x,
      y: row0Centre.position.y,
      z: 12,
    };

    const visibleIds = visibleIslands(camera, DESKTOP, wall).map((entry: AlbumPlacement) => entry.id);
    expect(visibleIds).toContain(row0Centre.id);
    for (const entry of deeperRows) expect(visibleIds).not.toContain(entry.id);
    expect(visibleIds.length).toBeLessThan(wall.length);
  });

  it('follows the camera down to later rows', () => {
    const wall = makeWall(12);
    const row0Centre = wall[1];
    const row1Centre = wall[4];
    const row2Centre = wall[7];

    const camera = { x: row1Centre.position.x, y: row1Centre.position.y, z: 6 };
    const visibleIds = visibleIslands(camera, DESKTOP, wall).map((entry: AlbumPlacement) => entry.id);

    expect(visibleIds).toContain(row1Centre.id);
    expect(visibleIds).not.toContain(row0Centre.id);
    expect(visibleIds).not.toContain(row2Centre.id);
  });

  it('preserves input order and returns the original placement objects', () => {
    const wall = makeWall(9);
    const snapshot = JSON.parse(JSON.stringify(wall));
    const visible = visibleIslands({ x: 0, y: 0, z: 24 }, DESKTOP, wall);

    expect(visible.length).toBeGreaterThan(0);
    const expectedOrder = wall.filter((entry) => visible.includes(entry)).map((entry: AlbumPlacement) => entry.id);
    expect(visible.map((entry: AlbumPlacement) => entry.id)).toEqual(expectedOrder);
    for (const entry of visible) expect(wall).toContain(entry);
    // Culling never mutates the caller's placements.
    expect(JSON.parse(JSON.stringify(wall))).toEqual(snapshot);
  });

  it('returns an empty list for an empty wall', () => {
    expect(visibleIslands({ x: 0, y: 0, z: 10 }, DESKTOP, [])).toEqual([]);
  });
});
