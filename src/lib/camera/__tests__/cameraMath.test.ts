import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import {
  CAMERA_FAR,
  CAMERA_FOV_DEG,
  CAMERA_NEAR,
  ZOOM_MAX,
  ZOOM_MIN,
  fitBoundsToViewport,
  hitTestWall,
  interpolateZoom,
  screenToWorld,
  worldPerPixel,
  worldToScreen,
  zoomToCursor,
} from '../cameraMath';
import { computeAlbumGrid } from '../../layout/islandLayout';
import type { WallAlbum, WallPhoto } from '../../layout/types';

const VIEWPORT = { width: 1440, height: 900 };

function makePhotos(albumId: string, count: number): WallPhoto[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `${albumId}-p${index}`,
    storagePath: `${albumId}/${index}.jpg`,
    width: 800,
    height: 600,
    aspectRatio: 4 / 3,
    dominantColor: null,
    thumbHash: null,
    sortOrder: index,
  }));
}

function makeAlbum(
  id: string,
  count: number,
  gridColumns: number,
  position: { x: number; y: number },
  photos?: WallPhoto[],
): WallAlbum {
  const grid = computeAlbumGrid(count, gridColumns, false);
  return {
    id,
    slug: id,
    title: id,
    description: null,
    gridColumns,
    sortOrder: 0,
    position,
    bounds: grid.bounds,
    cameraName: null,
    dateLabel: null,
    locationLabel: null,
    soundtrack: null,
    photos: photos ?? makePhotos(id, count),
  };
}

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

describe('hitTestWall', () => {
  const album = makeAlbum('alpha', 6, 3, { x: 10, y: -5 });
  const grid = computeAlbumGrid(6, 3, false);
  const worldPoint = (localX: number, localY: number) => ({
    x: album.position.x + localX,
    y: album.position.y + localY,
  });

  it('resolves every photo centre to the correct album, photo and cell', () => {
    for (let index = 0; index < grid.photos.length; index += 1) {
      const cell = grid.photos[index];
      const hit = hitTestWall(worldPoint(cell.x, cell.y), [album]);
      expect(hit).not.toBeNull();
      expect(hit?.album.id).toBe('alpha');
      expect(hit?.photo.id).toBe(`alpha-p${index}`);
      expect(hit?.cell).toEqual({ row: cell.row, column: cell.column, index });
    }
  });

  it('returns null outside every album AABB', () => {
    expect(hitTestWall({ x: 500, y: 500 }, [album])).toBeNull();
  });

  it('returns null on the placard and in gutters', () => {
    expect(hitTestWall(worldPoint(grid.placard.x, grid.placard.y), [album])).toBeNull();
    const first = grid.photos[0];
    const second = grid.photos[1];
    const gutterX = (first.x + second.x) / 2;
    expect(hitTestWall(worldPoint(gutterX, first.y), [album])).toBeNull();
  });

  it('picks the matching album out of many without reading every photo (O(1) cell lookup)', () => {
    const albums = [
      makeAlbum('left', 4, 2, { x: -40, y: 0 }),
      makeAlbum('target', 9, 3, { x: 0, y: 0 }),
      makeAlbum('right', 12, 4, { x: 40, y: 0 }),
    ];
    const targetGrid = computeAlbumGrid(9, 3, false);
    const cell = targetGrid.photos[7];

    let numericReads = 0;
    const guardedPhotos = new Proxy(albums[1].photos, {
      get(target, prop, receiver) {
        if (typeof prop === 'string' && /^\d+$/.test(prop)) numericReads += 1;
        return Reflect.get(target, prop, receiver);
      },
    });
    const guardedAlbum: WallAlbum = { ...albums[1], photos: guardedPhotos };

    const targetPoint = { x: albums[1].position.x + cell.x, y: albums[1].position.y + cell.y };
    const hit = hitTestWall(targetPoint, [albums[0], guardedAlbum, albums[2]]);
    expect(hit?.album.id).toBe('target');
    expect(hit?.photo.id).toBe('target-p7');
    expect(numericReads).toBeLessThanOrEqual(1);
  });
});
