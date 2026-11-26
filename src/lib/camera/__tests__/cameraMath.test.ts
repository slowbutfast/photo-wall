import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import {
  CAMERA_FAR,
  CAMERA_FOV_DEG,
  CAMERA_NEAR,
  WORLD_PX_PER_UNIT,
  ZOOM_MAX,
  ZOOM_MIN,
  cameraToCssScale,
  clampCameraToBounds,
  computeFirstRowBounds,
  computeMaxZoom,
  computeWallBounds,
  fitBoundsToViewport,
  interpolateZoom,
  screenToWorld,
  snapToDevicePixel,
  worldPerPixel,
  worldToCss,
  worldToScreen,
  worldXToCssLeft,
  worldYToCssTop,
  zoomToCursor,
} from '../cameraMath';
import { computeWallGridPositions } from '../../layout/islandLayout';

const VIEWPORT = { width: 1440, height: 900 };

describe('camera constants', () => {
  it('matches the DESIGN.md / architecture camera contract', () => {
    expect(CAMERA_FOV_DEG).toBe(38);
    expect(CAMERA_NEAR).toBe(0.2);
    expect(CAMERA_FAR).toBe(500);
    expect(ZOOM_MIN).toBe(2.4);
    expect(ZOOM_MAX).toBe(140);
  });
});

describe('worldPerPixel', () => {
  it('derives world units per CSS pixel from the vertical FOV', () => {
    const expected = (2 * 10 * Math.tan((CAMERA_FOV_DEG * Math.PI) / 360)) / 1000;
    expect(worldPerPixel(10, 1000)).toBeCloseTo(expected, 12);
    // Twice as far away -> twice as many world units per pixel.
    expect(worldPerPixel(20, 1000)).toBeCloseTo(expected * 2, 12);
    // Twice the viewport height -> half as many world units per pixel.
    expect(worldPerPixel(10, 2000)).toBeCloseTo(expected / 2, 12);
  });
});

describe('screenToWorld / worldToScreen', () => {
  it('round-trips screen coordinates through world coordinates', () => {
    fc.assert(
      fc.property(
        fc.double({ min: -60, max: 60, noNaN: true, noDefaultInfinity: true }),
        fc.double({ min: -60, max: 60, noNaN: true, noDefaultInfinity: true }),
        fc.double({ min: ZOOM_MIN, max: ZOOM_MAX, noNaN: true, noDefaultInfinity: true }),
        fc.double({ min: 0, max: 1, noNaN: true, noDefaultInfinity: true }),
        fc.double({ min: 0, max: 1, noNaN: true, noDefaultInfinity: true }),
        (x, y, z, fx, fy) => {
          const camera = { x, y, z };
          const screen = { x: fx * VIEWPORT.width, y: fy * VIEWPORT.height };
          const world = screenToWorld(screen, camera, VIEWPORT);
          const back = worldToScreen(world, camera, VIEWPORT);
          expect(back.x).toBeCloseTo(screen.x, 7);
          expect(back.y).toBeCloseTo(screen.y, 7);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('maps the viewport centre to the camera centre', () => {
    const camera = { x: 12.5, y: -8.25, z: 30 };
    const world = screenToWorld({ x: 720, y: 450 }, camera, VIEWPORT);
    expect(world.x).toBeCloseTo(camera.x, 10);
    expect(world.y).toBeCloseTo(camera.y, 10);
  });
});

describe('zoomToCursor', () => {
  it('keeps the world point under the cursor invariant within 1e-4', () => {
    fc.assert(
      fc.property(
        fc.double({ min: -80, max: 80, noNaN: true, noDefaultInfinity: true }),
        fc.double({ min: -80, max: 80, noNaN: true, noDefaultInfinity: true }),
        fc.double({ min: ZOOM_MIN, max: ZOOM_MAX, noNaN: true, noDefaultInfinity: true }),
        fc.double({ min: 0, max: 1, noNaN: true, noDefaultInfinity: true }),
        fc.double({ min: 0, max: 1, noNaN: true, noDefaultInfinity: true }),
        fc.double({ min: 0.2, max: 5, noNaN: true, noDefaultInfinity: true }),
        (x, y, z, fx, fy, factor) => {
          const camera = { x, y, z };
          const cursor = { x: fx * VIEWPORT.width, y: fy * VIEWPORT.height };
          const before = screenToWorld(cursor, camera, VIEWPORT);
          const next = zoomToCursor(camera, cursor, VIEWPORT, factor);
          const after = screenToWorld(cursor, next, VIEWPORT);
          expect(after.x).toBeCloseTo(before.x, 4);
          expect(after.y).toBeCloseTo(before.y, 4);
          expect(next.z).toBeGreaterThanOrEqual(ZOOM_MIN);
          expect(next.z).toBeLessThanOrEqual(ZOOM_MAX);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('clamps at the near bound without drifting the anchored point', () => {
    const camera = { x: 3, y: -4, z: ZOOM_MIN };
    const cursor = { x: 200, y: 100 };
    const before = screenToWorld(cursor, camera, VIEWPORT);
    const next = zoomToCursor(camera, cursor, VIEWPORT, 4);
    expect(next.z).toBe(ZOOM_MIN);
    const after = screenToWorld(cursor, next, VIEWPORT);
    expect(after.x).toBeCloseTo(before.x, 6);
    expect(after.y).toBeCloseTo(before.y, 6);
  });

  it('clamps at the far bound without drifting the anchored point', () => {
    const camera = { x: 3, y: -4, z: ZOOM_MAX };
    const cursor = { x: 1200, y: 800 };
    const before = screenToWorld(cursor, camera, VIEWPORT);
    const next = zoomToCursor(camera, cursor, VIEWPORT, 0.25);
    expect(next.z).toBe(ZOOM_MAX);
    const after = screenToWorld(cursor, next, VIEWPORT);
    expect(after.x).toBeCloseTo(before.x, 6);
    expect(after.y).toBeCloseTo(before.y, 6);
  });

  it('ignores invalid zoom factors', () => {
    const camera = { x: 1, y: 2, z: 30 };
    expect(zoomToCursor(camera, { x: 10, y: 10 }, VIEWPORT, 0)).toEqual(camera);
    expect(zoomToCursor(camera, { x: 10, y: 10 }, VIEWPORT, -2)).toEqual(camera);
  });
});

describe('fitBoundsToViewport', () => {
  it('frames a landscape print above bottomInsetPx on a portrait mobile viewport', () => {
    const bounds = { x: 12, y: -7, width: 1.2, height: 0.8 };
    const aspect = 0.5;
    const padding = 0.08;
    const bottomInsetPx = 96;
    const viewportHeightPx = 844;
    const planeZ = 0.54;

    const target = fitBoundsToViewport(bounds, {
      fovDeg: CAMERA_FOV_DEG,
      aspect,
      padding,
      planeZ,
      bottomInsetPx,
      viewportHeightPx,
    });

    expect(target.z).toBeGreaterThanOrEqual(ZOOM_MIN);
    expect(target.z).toBeLessThanOrEqual(ZOOM_MAX);

    const distance = target.z - planeZ;
    const visibleHeight = 2 * distance * Math.tan((CAMERA_FOV_DEG * Math.PI) / 360);
    const visibleWidth = visibleHeight * aspect;
    const insetWorld = (bottomInsetPx / viewportHeightPx) * visibleHeight;

    expect(bounds.width).toBeLessThanOrEqual(visibleWidth * (1 - 2 * padding) + 1e-9);
    expect(bounds.height).toBeLessThanOrEqual((visibleHeight - insetWorld) * (1 - 2 * padding) + 1e-9);
    expect(target.x).toBeCloseTo(bounds.x, 9);
    expect(target.y).toBeCloseTo(bounds.y - insetWorld / 2, 9);
  });

  it('fits an album on an ultrawide viewport', () => {
    const bounds = { x: 0, y: 0, width: 8, height: 4 };
    const aspect = 3.5;
    const padding = 0.1;
    const target = fitBoundsToViewport(bounds, { fovDeg: CAMERA_FOV_DEG, aspect, padding, planeZ: 0 });

    expect(target.z).toBeGreaterThanOrEqual(ZOOM_MIN);
    expect(target.z).toBeLessThanOrEqual(ZOOM_MAX);
    const visibleHeight = 2 * target.z * Math.tan((CAMERA_FOV_DEG * Math.PI) / 360);
    const visibleWidth = visibleHeight * aspect;
    expect(bounds.width).toBeLessThanOrEqual(visibleWidth * (1 - 2 * padding) + 1e-9);
    expect(bounds.height).toBeLessThanOrEqual(visibleHeight * (1 - 2 * padding) + 1e-9);
    expect(target.x).toBeCloseTo(0, 9);
    expect(target.y).toBeCloseTo(0, 9);
  });

  it('lowers the target y so the subject sits above the bottom inset', () => {
    const bounds = { x: 0, y: 0, width: 2, height: 2 };
    const base = { fovDeg: CAMERA_FOV_DEG, aspect: 0.6, padding: 0.08, planeZ: 0.54, viewportHeightPx: 844 };
    const withoutInset = fitBoundsToViewport(bounds, { ...base, bottomInsetPx: 0 });
    const withInset = fitBoundsToViewport(bounds, { ...base, bottomInsetPx: 160 });
    expect(withInset.y).toBeLessThan(withoutInset.y);
  });
});

describe('interpolateZoom (van Wijk & Nuij)', () => {
  it('hits both endpoints', () => {
    const a = { x: -5, y: 3, z: 2.4 };
    const b = { x: 40, y: -18, z: 20 };
    expect(interpolateZoom(a, b, 0).x).toBeCloseTo(a.x, 10);
    expect(interpolateZoom(a, b, 0).y).toBeCloseTo(a.y, 10);
    expect(interpolateZoom(a, b, 0).z).toBeCloseTo(a.z, 10);
    expect(interpolateZoom(a, b, 1).x).toBeCloseTo(b.x, 10);
    expect(interpolateZoom(a, b, 1).y).toBeCloseTo(b.y, 10);
    expect(interpolateZoom(a, b, 1).z).toBeCloseTo(b.z, 10);
  });

  it('arcs outward for distant fly-to targets instead of lerping linearly', () => {
    const a = { x: 0, y: 0, z: 2.4 };
    const b = { x: 100, y: 80, z: 20 };
    const mid = interpolateZoom(a, b, 0.5);
    // van Wijk & Nuij zoom out beyond both endpoints before flying in.
    expect(mid.z).toBeGreaterThan(Math.max(a.z, b.z));
    // At t=0.5 the centre has barely travelled (non-linear timing).
    expect(mid.x).toBeLessThan(50);
    expect(mid.y).toBeLessThan(40);
    expect(Number.isFinite(mid.x)).toBe(true);
    expect(Number.isFinite(mid.y)).toBe(true);
    expect(Number.isFinite(mid.z)).toBe(true);
  });

  it('uses exponential zoom when the centres coincide', () => {
    const a = { x: 5, y: 5, z: 3 };
    const b = { x: 5, y: 5, z: 30 };
    const mid = interpolateZoom(a, b, 0.5);
    expect(mid.x).toBeCloseTo(5, 10);
    expect(mid.y).toBeCloseTo(5, 10);
    expect(mid.z).toBeCloseTo(3 * Math.sqrt(10), 6);
  });
});


// ---------------------------------------------------------------------------
// Task 1.3 (cameraMath additions) — cameraToCssScale, Y-axis flip, row-0 entry
// ---------------------------------------------------------------------------

describe('cameraToCssScale', () => {
  const tanHalf = (fovDeg: number) => Math.tan(((fovDeg * Math.PI) / 180) / 2);

  it('implements the shared CSS scale contract verbatim', () => {
    const expected = 1080 / (2 * 10 * tanHalf(CAMERA_FOV_DEG) * 100);
    expect(cameraToCssScale(10, 1080)).toBeCloseTo(expected, 12);
    expect(cameraToCssScale(10, 1080, CAMERA_FOV_DEG)).toBeCloseTo(expected, 12);
  });

  it('matches 1 / (worldPerPixel * 100) so the wall and DOM never drift', () => {
    for (const z of [2.4, 6, 12.5, 40, 140]) {
      for (const height of [738, 844, 1000, 1080, 1440]) {
        const scale = cameraToCssScale(z, height);
        expect(scale).toBeCloseTo(1 / (worldPerPixel(z, height) * 100), 12);
        // The full visible wall height maps exactly onto the viewport height.
        const visibleWorldHeight = 2 * z * tanHalf(CAMERA_FOV_DEG);
        expect(visibleWorldHeight * 100 * scale).toBeCloseTo(height, 9);
      }
    }
  });

  it('scales with viewport height between desktop (1080) and mobile (844)', () => {
    const desktop = cameraToCssScale(12, 1080);
    const mobile = cameraToCssScale(12, 844);
    expect(desktop).toBeGreaterThan(mobile);
    expect(desktop / mobile).toBeCloseTo(1080 / 844, 12);
  });

  it('halves as the camera pulls back and never drifts from the zoom clamp', () => {
    expect(cameraToCssScale(20, 1080)).toBeCloseTo(cameraToCssScale(10, 1080) / 2, 12);
    expect(cameraToCssScale(ZOOM_MIN, 1080)).toBeGreaterThan(cameraToCssScale(ZOOM_MAX, 1080));
    expect(cameraToCssScale(ZOOM_MAX, 1080)).toBeGreaterThan(0);
  });

  it('renders one world unit as WORLD_PX_PER_UNIT * scale CSS pixels', () => {
    expect(WORLD_PX_PER_UNIT).toBe(100);
    const scale = cameraToCssScale(18, 1000);
    expect(1 * WORLD_PX_PER_UNIT * scale).toBeCloseTo(100 * scale, 12);
  });
});

describe('world -> CSS placement (y-up world, y-down CSS)', () => {
  it('flips the Y axis: cssTop = -worldY * 100', () => {
    expect(worldYToCssTop(0)).toBeCloseTo(0, 12);
    expect(worldYToCssTop(3)).toBe(-300);
    expect(worldYToCssTop(-2)).toBe(200);
    expect(worldYToCssTop(0.11)).toBeCloseTo(-11, 12);
  });

  it('maps X straight through: cssLeft = worldX * 100', () => {
    expect(worldXToCssLeft(0)).toBe(0);
    expect(worldXToCssLeft(2.5)).toBe(250);
    expect(worldXToCssLeft(-7.25)).toBeCloseTo(-725, 12);
  });

  it('exposes a combined helper', () => {
    const placed = worldToCss({ x: 2, y: -2 });
    expect(placed.left).toBe(200);
    expect(placed.top).toBe(200);

    const origin = worldToCss({ x: 0, y: 0 });
    expect(origin.left).toBeCloseTo(0, 12);
    expect(origin.top).toBeCloseTo(0, 12);
  });

  it('renders row 0 above row 1 for a real 12-album wall', () => {
    const placements = computeWallGridPositions(
      Array.from({ length: 12 }, (_, index) => ({
        id: `album-${index}`,
        status: 'published' as const,
        photoCount: 20,
        gridColumns: 10,
        sortOrder: index,
        hasSoundtrack: false,
      })),
    );

    const row0 = placements.slice(0, 3);
    const row1 = placements.slice(3, 6);

    for (const upper of row0) {
      for (const lower of row1) {
        // Smaller CSS top == higher on screen.
        expect(worldYToCssTop(upper.position.y)).toBeLessThan(worldYToCssTop(lower.position.y));
        const upperTop = worldYToCssTop(upper.position.y + upper.bounds.height / 2);
        const lowerTop = worldYToCssTop(lower.position.y + lower.bounds.height / 2);
        expect(upperTop).toBeLessThan(lowerTop);
      }
    }
  });
});

describe('computeFirstRowBounds', () => {
  function makePlacements(count: number) {
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

  it('frames only the first three albums of row 0 out of 50', () => {
    const placements = makePlacements(50);
    const bounds = computeFirstRowBounds(placements);
    const row0 = placements.slice(0, 3);

    const expectedMinX = Math.min(...row0.map((entry) => entry.position.x - entry.bounds.width / 2));
    const expectedMaxX = Math.max(...row0.map((entry) => entry.position.x + entry.bounds.width / 2));
    const expectedTop = Math.max(...row0.map((entry) => entry.position.y + entry.bounds.height / 2));
    const expectedBottom = Math.min(...row0.map((entry) => entry.position.y - entry.bounds.height / 2));

    expect(bounds.x - bounds.width / 2).toBeCloseTo(expectedMinX, 9);
    expect(bounds.x + bounds.width / 2).toBeCloseTo(expectedMaxX, 9);
    expect(bounds.y + bounds.height / 2).toBeCloseTo(expectedTop, 9);
    expect(bounds.y - bounds.height / 2).toBeCloseTo(expectedBottom, 9);
    expect(bounds.width).toBeCloseTo(expectedMaxX - expectedMinX, 9);
    expect(bounds.height).toBeCloseTo(expectedTop - expectedBottom, 9);
  });

  it('excludes row 1 and the rest of a 50-album wall', () => {
    const placements = makePlacements(50);
    const bounds = computeFirstRowBounds(placements);
    const row0Bottom = bounds.y - bounds.height / 2;

    for (const lower of placements.slice(3)) {
      expect(lower.position.y + lower.bounds.height / 2).toBeLessThan(row0Bottom);
    }
    // Row 0 frames one row of prints, not the 17-row / 50-album wall: the
    // bounds height is a single row's height and exactly 3 albums overlap it.
    const wallTop = Math.max(...placements.map((entry) => entry.position.y + entry.bounds.height / 2));
    const wallBottom = Math.min(...placements.map((entry) => entry.position.y - entry.bounds.height / 2));
    expect(bounds.height).toBeLessThan((wallTop - wallBottom) / 8);
    expect(bounds.width).toBeGreaterThan(0);

    const inside = placements.filter((entry) => {
      const top = entry.position.y + entry.bounds.height / 2;
      const bottom = entry.position.y - entry.bounds.height / 2;
      const left = entry.position.x - entry.bounds.width / 2;
      const right = entry.position.x + entry.bounds.width / 2;
      return (
        top > bounds.y - bounds.height / 2 &&
        bottom < bounds.y + bounds.height / 2 &&
        right > bounds.x - bounds.width / 2 &&
        left < bounds.x + bounds.width / 2
      );
    });
    expect(inside).toHaveLength(3);
  });

  it('frames the 3 albums horizontally across a desktop viewport', () => {
    const placements = makePlacements(50);
    const bounds = computeFirstRowBounds(placements);
    const target = fitBoundsToViewport(bounds, { aspect: 1.6, padding: 0.06 });

    expect(target.z).toBeGreaterThanOrEqual(ZOOM_MIN);
    expect(target.z).toBeLessThanOrEqual(ZOOM_MAX);

    const visibleHeight = 2 * target.z * Math.tan((19 * Math.PI) / 180);
    const visibleWidth = visibleHeight * 1.6;
    expect(visibleWidth).toBeGreaterThanOrEqual(bounds.width);
    expect(visibleWidth).toBeLessThanOrEqual(bounds.width / 0.88 + 1e-6);

    // Only row 0 is framed: the whole wall's height does not fit.
    const wallTop = Math.max(...placements.map((entry) => entry.position.y + entry.bounds.height / 2));
    const wallBottom = Math.min(...placements.map((entry) => entry.position.y - entry.bounds.height / 2));
    expect(visibleHeight).toBeLessThan(wallTop - wallBottom);
  });

  it('handles walls with fewer than three albums and empty walls', () => {
    const single = computeFirstRowBounds(makePlacements(1));
    expect(single.width).toBeCloseTo(makePlacements(1)[0].bounds.width, 9);

    const pair = computeFirstRowBounds(makePlacements(2));
    expect(pair.width).toBeGreaterThan(single.width);

    expect(computeFirstRowBounds([])).toEqual({ x: 0, y: 0, width: 0, height: 0 });
  });

  it('is deterministic and does not mutate its input', () => {
    const placements = makePlacements(9);
    const snapshot = JSON.parse(JSON.stringify(placements));
    expect(computeFirstRowBounds(placements)).toEqual(computeFirstRowBounds(placements));
    expect(JSON.parse(JSON.stringify(placements))).toEqual(snapshot);
  });
});

describe('30% viewport containment bounding box', () => {
  const fourAlbumPlacements: Parameters<typeof computeWallBounds>[0] = [
    { id: 'a1', position: { x: -11.8, y: 4.4 }, bounds: { width: 9.7, height: 5.5 } },
    { id: 'a2', position: { x: 0, y: 4.4 }, bounds: { width: 11.5, height: 5.5 } },
    { id: 'a3', position: { x: 11.8, y: 4.4 }, bounds: { width: 9.7, height: 5.5 } },
    { id: 'a4', position: { x: -11.8, y: -4.6 }, bounds: { width: 9.7, height: 7.3 } },
  ];

  it('computes the union AABB across all placements', () => {
    const wall = computeWallBounds(fourAlbumPlacements);
    expect(wall.x - wall.width / 2).toBeCloseTo(-11.8 - 9.7 / 2, 9);
    expect(wall.x + wall.width / 2).toBeCloseTo(11.8 + 9.7 / 2, 9);
    expect(wall.y + wall.height / 2).toBeCloseTo(4.4 + 5.5 / 2, 9);
    expect(wall.y - wall.height / 2).toBeCloseTo(-4.6 - 7.3 / 2, 9);
    expect(computeWallBounds([])).toEqual({ x: 0, y: 0, width: 0, height: 0 });
  });

  it('caps max zoom-out on small walls below ZOOM_MAX while allowing tall 50-album walls to reach macro tier', () => {
    const smallWall = computeWallBounds(fourAlbumPlacements);
    const smallMaxZ = computeMaxZoom(smallWall, VIEWPORT);
    expect(smallMaxZ).toBeLessThan(ZOOM_MAX);
    expect(smallMaxZ).toBeGreaterThan(30);

    const fiftyPlacements = computeWallGridPositions(
      Array.from({ length: 50 }, (_, index) => ({
        id: `album-${index}`,
        status: 'published' as const,
        photoCount: 20,
        gridColumns: 5,
        sortOrder: index,
        hasSoundtrack: false,
      })),
    );
    const largeWall = computeWallBounds(fiftyPlacements);
    const largeMaxZ = computeMaxZoom(largeWall, VIEWPORT);
    expect(largeMaxZ).toBe(ZOOM_MAX);
    expect(cameraToCssScale(largeMaxZ, VIEWPORT.height)).toBeLessThan(0.25);
  });

  it('clamps pan to the 30% horizontal margin (15% per side) and respects empty walls', () => {
    const wall = computeWallBounds(fourAlbumPlacements);
    const padX = wall.width * 0.15;
    const minX = wall.x - wall.width / 2 - padX;
    const maxX = wall.x + wall.width / 2 + padX;

    const farLeft = clampCameraToBounds({ x: -999, y: 0, z: 30 }, wall, VIEWPORT);
    const farRight = clampCameraToBounds({ x: 999, y: 0, z: 30 }, wall, VIEWPORT);
    const farOut = clampCameraToBounds({ x: 0, y: 0, z: 500 }, wall, VIEWPORT);

    expect(farLeft.x).toBeCloseTo(minX, 9);
    expect(farRight.x).toBeCloseTo(maxX, 9);
    expect(farOut.z).toBe(computeMaxZoom(wall, VIEWPORT));

    const empty = { x: 0, y: 0, width: 0, height: 0 };
    expect(clampCameraToBounds({ x: 50, y: -20, z: 40 }, empty, VIEWPORT)).toEqual({
      x: 50,
      y: -20,
      z: 40,
    });
  });

  it('respects a custom maxZ in zoomToCursor without drifting the anchored point', () => {
    const camera = { x: 0, y: 0, z: 35 };
    const cursor = { x: 900, y: 300 };
    const before = screenToWorld(cursor, camera, VIEWPORT);
    const next = zoomToCursor(camera, cursor, VIEWPORT, 0.25, CAMERA_FOV_DEG, 42);
    expect(next.z).toBe(42);
    const after = screenToWorld(cursor, next, VIEWPORT);
    expect(after.x).toBeCloseTo(before.x, 6);
    expect(after.y).toBeCloseTo(before.y, 6);
  });
});


describe('snapToDevicePixel (coarse-pointer settle snap)', () => {
  it('rounds to the nearest whole device pixel', () => {
    expect(snapToDevicePixel(10.6667, 3)).toBeCloseTo(32 / 3, 12);
    expect(snapToDevicePixel(10.4, 3)).toBeCloseTo(31 / 3, 12);
    expect(snapToDevicePixel(2170.6667, 3) * 3).toBeCloseTo(6512, 9);
    expect(snapToDevicePixel(-254.4, 3) * 3).toBeCloseTo(-763, 9);
  });

  it('is a no-op at dpr 1 and clamps a non-positive ratio', () => {
    expect(snapToDevicePixel(12.4, 1)).toBe(12);
    expect(snapToDevicePixel(12.4, 0)).toBe(12);
  });
});
