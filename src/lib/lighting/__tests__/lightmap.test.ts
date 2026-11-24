/**
 * Task 1.2 — GPU-baked wall-space lightmap contract (`src/lib/lighting/lightmap.ts`, Task 2.3).
 *
 * `bakeLightmap` is the CPU reference implementation of the offscreen WebGL2
 * bake: same maths, same texture layout, deterministic in Node so the shader
 * path can be diffed against it. Every assertion here maps to
 * `specs/3d-pbr-wall-and-lighting/spec.md` ("Continuous PBR plaster wall with
 * baked wall-space lightmap") or `architecture.md` decision 2.
 */

import { describe, expect, it } from 'vitest';

import {
  LIGHTMAP_AMBIENT_RATIO_MAX,
  LIGHTMAP_AMBIENT_RATIO_MIN,
  LIGHTMAP_MARGIN_UNITS,
  LIGHTMAP_MAX_SIZE,
  LIGHTMAP_TEXELS_PER_UNIT,
  bakeLightmap,
  decodeIrradiance,
  decodeLightDirection,
  encodeIrradiance,
  encodeLightDirection,
  planLightmapGrid,
  sampleLightmap,
  worldToLightmapUv,
} from '../lightmap';
import { computeWallGridPositions } from '../../layout/islandLayout';
import type { WallAlbum, WallPhoto } from '../../layout/types';

function makePhotos(albumId: string, count: number, aspectRatio = 4 / 3): WallPhoto[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `${albumId}-p${index}`,
    storagePath: `${albumId}/${index}.jpg`,
    width: 1600,
    height: Math.round(1600 / aspectRatio),
    aspectRatio,
    dominantColor: null,
    thumbHash: null,
    sortOrder: index,
  }));
}

/**
 * Build `count` published albums with real `computeWallGridPositions` geometry
 * (3 per row, `gridColumns` wide) so the lightmap is planned against the
 * production layout contract rather than hand-rolled boxes.
 */
function makeWall(count: number, photosPerAlbum: number, gridColumns = 10): WallAlbum[] {
  const seeds = Array.from({ length: count }, (_, index) => ({
    id: `album-${index}`,
    status: 'published' as const,
    photoCount: photosPerAlbum,
    gridColumns,
    sortOrder: index,
    hasSoundtrack: false,
  }));
  const placements = computeWallGridPositions(seeds);
  const placementById = new Map(placements.map((placement) => [placement.id, placement]));

  return seeds.map((seed) => {
    const placement = placementById.get(seed.id);
    if (!placement) throw new Error(`missing placement for ${seed.id}`);
    return {
      id: seed.id,
      slug: seed.id,
      title: `Album ${seed.id}`,
      description: null,
      gridColumns,
      sortOrder: seed.sortOrder,
      position: placement.position,
      bounds: placement.bounds,
      cameraName: null,
      dateLabel: null,
      locationLabel: null,
      soundtrack: null,
      photos: makePhotos(seed.id, photosPerAlbum),
    } satisfies WallAlbum;
  });
}

function unionAabb(albums: readonly WallAlbum[]) {
  const minX = Math.min(...albums.map((album) => album.position.x - album.bounds.width / 2));
  const maxX = Math.max(...albums.map((album) => album.position.x + album.bounds.width / 2));
  const minY = Math.min(...albums.map((album) => album.position.y - album.bounds.height / 2));
  const maxY = Math.max(...albums.map((album) => album.position.y + album.bounds.height / 2));
  return { minX, maxX, minY, maxY };
}

describe('lightmap budget constants', () => {
  it('locks RGBA8 8 texels/unit capped at 2048x2048 with a 6u margin', () => {
    expect(LIGHTMAP_TEXELS_PER_UNIT).toBe(8);
    expect(LIGHTMAP_MAX_SIZE).toBe(2048);
    expect(LIGHTMAP_MARGIN_UNITS).toBe(6);
  });

  it('targets a 35-45% inter-cluster ambient ratio', () => {
    expect(LIGHTMAP_AMBIENT_RATIO_MIN).toBe(0.35);
    expect(LIGHTMAP_AMBIENT_RATIO_MAX).toBe(0.45);
    expect(LIGHTMAP_AMBIENT_RATIO_MIN).toBeLessThan(LIGHTMAP_AMBIENT_RATIO_MAX);
  });
});

describe('planLightmapGrid', () => {
  it('covers 50 albums / 250+ fixtures at 8 texels per world unit', () => {
    const albums = makeWall(50, 20, 10);
    const grid = planLightmapGrid(albums);

    expect(grid.albumCount).toBe(50);
    // One track head per two grid columns => ceil(10 / 2) = 5 per album.
    expect(grid.fixtureCount).toBe(250);
    expect(grid.fixtureCount).toBeGreaterThanOrEqual(250);
    expect(grid.texelsPerUnit).toBe(8);
  });

  it('stays inside the 2048x2048 GPU budget for a 50-album wall', () => {
    const grid = planLightmapGrid(makeWall(50, 20, 10));

    expect(Number.isInteger(grid.width)).toBe(true);
    expect(Number.isInteger(grid.height)).toBe(true);
    expect(grid.width).toBeGreaterThan(0);
    expect(grid.height).toBeGreaterThan(0);
    expect(grid.width).toBeLessThanOrEqual(LIGHTMAP_MAX_SIZE);
    expect(grid.height).toBeLessThanOrEqual(LIGHTMAP_MAX_SIZE);
  });

  it('extends the coverage by the 6u zero-irradiance margin on every side', () => {
    const albums = makeWall(4, 20, 10);
    const aabb = unionAabb(albums);
    const grid = planLightmapGrid(albums);

    expect(grid.originX).toBeLessThanOrEqual(aabb.minX - LIGHTMAP_MARGIN_UNITS + 1e-9);
    expect(grid.originY).toBeLessThanOrEqual(aabb.minY - LIGHTMAP_MARGIN_UNITS + 1e-9);
    expect(grid.originX + grid.worldWidth).toBeGreaterThanOrEqual(
      aabb.maxX + LIGHTMAP_MARGIN_UNITS - 1e-9,
    );
    expect(grid.originY + grid.worldHeight).toBeGreaterThanOrEqual(
      aabb.maxY + LIGHTMAP_MARGIN_UNITS - 1e-9,
    );
    // Texture size and world coverage agree at the baked texel density.
    expect(grid.worldWidth).toBeCloseTo(grid.width / grid.texelsPerUnit, 9);
    expect(grid.worldHeight).toBeCloseTo(grid.height / grid.texelsPerUnit, 9);
    // The margin never inflates the map by more than a texel of slack.
    expect(grid.originX).toBeGreaterThanOrEqual(
      aabb.minX - LIGHTMAP_MARGIN_UNITS - 1 / grid.texelsPerUnit,
    );
    expect(grid.originY).toBeGreaterThanOrEqual(
      aabb.minY - LIGHTMAP_MARGIN_UNITS - 1 / grid.texelsPerUnit,
    );
  });

  it('degrades texel density instead of dropping coverage when the cap binds', () => {
    // One absurdly large island: 4000 world units square.
    const huge: WallAlbum[] = [
      {
        ...makeWall(1, 20, 10)[0],
        position: { x: 0, y: 0 },
        bounds: { width: 4000, height: 4000 },
      },
    ];
    const grid = planLightmapGrid(huge);

    expect(grid.width).toBeLessThanOrEqual(LIGHTMAP_MAX_SIZE);
    expect(grid.height).toBeLessThanOrEqual(LIGHTMAP_MAX_SIZE);
    expect(grid.texelsPerUnit).toBeLessThan(LIGHTMAP_TEXELS_PER_UNIT);
    // Coverage is preserved: the margin still surrounds the whole wall.
    expect(grid.worldWidth).toBeGreaterThanOrEqual(4000 + 2 * LIGHTMAP_MARGIN_UNITS - 1e-9);
    expect(grid.worldHeight).toBeGreaterThanOrEqual(4000 + 2 * LIGHTMAP_MARGIN_UNITS - 1e-9);
  });

  it('is deterministic and never mutates the albums it plans for', () => {
    const albums = makeWall(5, 20, 10);
    const snapshot = JSON.parse(JSON.stringify(albums));
    const first = planLightmapGrid(albums);
    const second = planLightmapGrid(albums);

    expect(second).toEqual(first);
    expect(JSON.parse(JSON.stringify(albums))).toEqual(snapshot);
  });
});

describe('worldToLightmapUv', () => {
  it('maps the wall centre to (0.5, 0.5) and the coverage corners to 0 / 1', () => {
    const albums = makeWall(3, 20, 10);
    const grid = planLightmapGrid(albums);
    const aabb = unionAabb(albums);

    const centre = worldToLightmapUv(grid, (aabb.minX + aabb.maxX) / 2, (aabb.minY + aabb.maxY) / 2);
    // Symmetric margin => the union AABB centre is the texture centre.
    expect(centre.u).toBeCloseTo(0.5, 6);
    expect(centre.v).toBeCloseTo(0.5, 6);

    const bottomLeft = worldToLightmapUv(grid, grid.originX, grid.originY);
    expect(bottomLeft.u).toBeCloseTo(0, 12);
    expect(bottomLeft.v).toBeCloseTo(0, 12);

    const topRight = worldToLightmapUv(
      grid,
      grid.originX + grid.worldWidth,
      grid.originY + grid.worldHeight,
    );
    expect(topRight.u).toBeCloseTo(1, 12);
    expect(topRight.v).toBeCloseTo(1, 12);
  });

  it('keeps world +y pointing up in the texture (v grows with world y)', () => {
    const grid = planLightmapGrid(makeWall(4, 20, 10));
    const low = worldToLightmapUv(grid, grid.originX + grid.worldWidth / 2, grid.originY + 1);
    const high = worldToLightmapUv(
      grid,
      grid.originX + grid.worldWidth / 2,
      grid.originY + grid.worldHeight - 1,
    );
    expect(high.v).toBeGreaterThan(low.v);
  });

  it('reports UV outside [0, 1] for points beyond the baked wall', () => {
    const grid = planLightmapGrid(makeWall(4, 20, 10));
    const far = worldToLightmapUv(grid, grid.originX - 50, grid.originY + grid.worldHeight / 2);
    expect(far.u).toBeLessThan(0);
    const above = worldToLightmapUv(
      grid,
      grid.originX + grid.worldWidth / 2,
      grid.originY + grid.worldHeight + 50,
    );
    expect(above.v).toBeGreaterThan(1);
  });
});

describe('irradiance & 3D direction encoding (RGBA8)', () => {
  it('round-trips normalized irradiance into 0-255', () => {
    expect(encodeIrradiance(-1)).toBe(0);
    expect(encodeIrradiance(0)).toBe(0);
    expect(encodeIrradiance(1)).toBe(255);
    expect(encodeIrradiance(2)).toBe(255);
    expect(encodeIrradiance(0.5)).toBe(128);
    expect(decodeIrradiance(0)).toBe(0);
    expect(decodeIrradiance(255)).toBe(1);
    for (const value of [0.1, 0.25, 0.35, 0.45, 0.72, 0.99]) {
      expect(decodeIrradiance(encodeIrradiance(value))).toBeCloseTo(value, 2);
    }
  });

  it('encodes (dirX, dirY) into GB and reconstructs dirZ in-shader', () => {
    const straightUp = decodeLightDirection(128, 128);
    expect(straightUp.z).toBeGreaterThan(0.999);

    for (const [dirX, dirY] of [
      [1, 0],
      [-1, 0],
      [0, -1],
      [0.6, -0.8],
      [0.4, 0.3],
    ] as const) {
      const encoded = encodeLightDirection(dirX, dirY);
      expect(encoded.g).toBeGreaterThanOrEqual(0);
      expect(encoded.g).toBeLessThanOrEqual(255);
      expect(encoded.b).toBeGreaterThanOrEqual(0);
      expect(encoded.b).toBeLessThanOrEqual(255);

      const decoded = decodeLightDirection(encoded.g, encoded.b);
      expect(decoded.x).toBeCloseTo(dirX, 2);
      expect(decoded.y).toBeCloseTo(dirY, 2);
      // 3D: dirZ is the reconstructed out-of-wall component, always >= 0.
      expect(decoded.z).toBeGreaterThanOrEqual(0);
      expect(decoded.z).toBeCloseTo(
        Math.sqrt(Math.max(0, 1 - decoded.x * decoded.x - decoded.y * decoded.y)),
        9,
      );
      expect(Math.hypot(decoded.x, decoded.y, decoded.z)).toBeCloseTo(1, 2);
    }
  });

  it('clamps directions that cannot form a unit 3D vector', () => {
    // Greedy planar directions must not produce NaN dirZ.
    const encoded = encodeLightDirection(1, 1);
    const decoded = decodeLightDirection(encoded.g, encoded.b);
    expect(Number.isFinite(decoded.z)).toBe(true);
    expect(decoded.z).toBeGreaterThanOrEqual(0);
  });
});

describe('bakeLightmap (CPU reference of the GPU bake)', () => {
  const albums = makeWall(3, 20, 10);
  const baked = bakeLightmap(albums);
  const { grid, data } = baked;
  const aabb = unionAabb(albums);

  it('writes a tightly packed opaque RGBA8 texture', () => {
    expect(data).toBeInstanceOf(Uint8Array);
    expect(data.length).toBe(grid.width * grid.height * 4);
    for (let index = 3; index < data.length; index += 4) {
      if (data[index] !== 255) {
        throw new Error(`alpha channel not opaque at texel ${(index - 3) / 4}`);
      }
    }
  });

  it('stores irradiance in R and a decode-correct 3D direction in GB', () => {
    const uv = worldToLightmapUv(grid, albums[0].position.x, albums[0].position.y);
    const sample = sampleLightmap(data, grid, uv);
    expect(sample.insideBounds).toBe(true);
    expect(sample.irradiance).toBeGreaterThan(0);
    expect(sample.dirZ).toBeGreaterThanOrEqual(0);
    expect(
      Math.hypot(sample.dirX, sample.dirY, sample.dirZ),
    ).toBeGreaterThan(0.9);
  });

  it('never leaves an unlit hole inside the published wall AABB', () => {
    let maxR = 0;
    let minR = 255;
    for (let ty = 0; ty < grid.height; ty += 1) {
      for (let tx = 0; tx < grid.width; tx += 1) {
        const wx = grid.originX + ((tx + 0.5) / grid.width) * grid.worldWidth;
        const wy = grid.originY + ((ty + 0.5) / grid.height) * grid.worldHeight;
        if (wx < aabb.minX || wx > aabb.maxX || wy < aabb.minY || wy > aabb.maxY) continue;
        const r = data[(ty * grid.width + tx) * 4];
        maxR = Math.max(maxR, r);
        minR = Math.min(minR, r);
      }
    }
    expect(maxR).toBeGreaterThan(128);
    // Inter-cluster wall space falls to ~35-45% of pool peak, never to black.
    expect(minR).toBeGreaterThan(0.2 * maxR);
  });

  it('falls towards zero irradiance across the 6u margin outside the wall AABB', () => {
    const corner = sampleLightmap(
      data,
      grid,
      worldToLightmapUv(grid, grid.originX + 0.05, grid.originY + 0.05),
    );
    const inside = sampleLightmap(
      data,
      grid,
      worldToLightmapUv(grid, albums[1].position.x, albums[1].position.y),
    );
    expect(corner.insideBounds).toBe(true);
    expect(corner.irradiance).toBeLessThan(inside.irradiance);
    expect(corner.irradiance).toBeLessThan(0.35);
  });
});

describe('sampleLightmap edge behaviour', () => {
  const albums = makeWall(3, 20, 10);
  const { grid, data } = bakeLightmap(albums);

  it('returns zero irradiance outside [0, 1] UV instead of wrapping or smearing', () => {
    const edgeTexel = sampleLightmap(data, grid, { u: 0.0001, v: 0.0001 });
    expect(edgeTexel.insideBounds).toBe(true);
    expect(edgeTexel.irradiance).toBeGreaterThanOrEqual(0);

    for (const uv of [
      { u: -0.0001, v: 0.5 },
      { u: 1.0001, v: 0.5 },
      { u: 0.5, v: -0.0001 },
      { u: 0.5, v: 1.0001 },
      { u: -2, v: -2 },
      { u: 3, v: 3 },
    ]) {
      const sample = sampleLightmap(data, grid, uv);
      expect(sample.insideBounds).toBe(false);
      expect(sample.irradiance).toBe(0);
    }
  });

  it('clamps to edge texels exactly on the [0, 1] boundary', () => {
    const atZero = sampleLightmap(data, grid, { u: 0, v: 0 });
    const atEpsilon = sampleLightmap(data, grid, { u: 1e-6, v: 1e-6 });
    expect(atZero.insideBounds).toBe(true);
    expect(atZero.irradiance).toBe(atEpsilon.irradiance);

    const atOne = sampleLightmap(data, grid, { u: 1, v: 1 });
    expect(atOne.insideBounds).toBe(true);
    expect(Number.isFinite(atOne.irradiance)).toBe(true);
  });
});
