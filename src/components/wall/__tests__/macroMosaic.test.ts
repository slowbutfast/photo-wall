/**
 * Macro-tier mosaic plan (Task 3.2 fallback activated after the Task 1.5 spike).
 *
 * One pre-baked canvas per island replaces 20 mounted `.photo-frame` nodes at
 * `scale < 0.25`; the plan is the geometry contract shared by the component, the
 * painter and the spike benchmark.
 */

import { describe, expect, it } from 'vitest';

import {
  MOSAIC_MAX_EDGE_PX,
  fitFrameInCell,
  macroMosaicElementCount,
  macroPrintElementCount,
  planMacroMosaic,
} from '../macroMosaic';
import { computeAlbumGrid, computeWallGridPositions } from '@/lib/layout/islandLayout';
import type { WallAlbum, WallPhoto } from '@/lib/layout/types';

const ASPECTS = [4 / 5, 3 / 2, 2 / 3];

function makeAlbum(index: number, photoCount = 20, gridColumns = 5): WallAlbum {
  const photos: WallPhoto[] = Array.from({ length: photoCount }, (_, photoIndex) => ({
    id: `album-${index}-p${photoIndex}`,
    storagePath: `albums/${index}/${photoIndex}.jpg`,
    width: 1600,
    height: 1200,
    aspectRatio: ASPECTS[(index + photoIndex) % ASPECTS.length],
    dominantColor: null,
    thumbHash: null,
    sortOrder: photoIndex,
  }));

  return {
    id: `album-${index}`,
    slug: `album-${index}`,
    title: `Album ${index}`,
    description: null,
    gridColumns,
    sortOrder: index,
    position: { x: 0, y: 0 },
    bounds: { width: 0, height: 0 },
    cameraName: null,
    dateLabel: null,
    locationLabel: null,
    soundtrack: null,
    photos,
  };
}

function withPlacement(albums: WallAlbum[]): WallAlbum[] {
  const placements = computeWallGridPositions(
    albums.map((album) => ({
      id: album.id,
      status: 'published' as const,
      photoCount: album.photos.length,
      gridColumns: album.gridColumns,
      sortOrder: album.sortOrder,
      hasSoundtrack: album.soundtrack !== null,
    })),
  );
  const byId = new Map(placements.map((placement) => [placement.id, placement]));
  return albums.map((album) => ({
    ...album,
    position: byId.get(album.id)!.position,
    bounds: byId.get(album.id)!.bounds,
  }));
}

function overlaps(a: { x: number; y: number; width: number; height: number }, b: typeof a) {
  return (
    a.x < b.x + b.width &&
    b.x < a.x + a.width &&
    a.y < b.y + b.height &&
    b.y < a.y + a.height
  );
}

describe('fitFrameInCell', () => {
  it('fits portraits and landscapes inside the cell without distorting', () => {
    const portrait = fitFrameInCell(4 / 5);
    expect(portrait.height).toBeGreaterThan(portrait.width);
    expect(portrait.height).toBeLessThanOrEqual(1);

    const landscape = fitFrameInCell(3 / 2);
    expect(landscape.width).toBeGreaterThan(landscape.height);
    expect(landscape.width).toBeLessThanOrEqual(1);
    expect(landscape.width / landscape.height).toBeCloseTo(3 / 2, 6);
    expect(portrait.width / portrait.height).toBeCloseTo(4 / 5, 6);

    const square = fitFrameInCell(1);
    expect(square.width).toBeCloseTo(square.height, 9);
    expect(square.width).toBeLessThan(1); // thin mat inset
  });

  it('survives degenerate aspect ratios', () => {
    expect(fitFrameInCell(0).width).toBeGreaterThan(0);
    expect(fitFrameInCell(Number.NaN).width).toBeGreaterThan(0);
    expect(fitFrameInCell(-2).width).toBeGreaterThan(0);
  });
});

describe('planMacroMosaic', () => {
  const album = withPlacement([makeAlbum(0)])[0];

  it('caps the mosaic buffer on the long edge', () => {
    const plan = planMacroMosaic(album);
    expect(Math.max(plan.width, plan.height)).toBe(MOSAIC_MAX_EDGE_PX);
    expect(Math.min(plan.width, plan.height)).toBeGreaterThan(0);
    // Buffer keeps the island aspect ratio.
    expect(plan.width / plan.height).toBeCloseTo(album.bounds.width / album.bounds.height, 2);
  });

  it('maps every photo to one aspect-fitted, contained cell', () => {
    const plan = planMacroMosaic(album);
    const grid = computeAlbumGrid(album.photos.length, album.gridColumns, false);

    expect(plan.cells).toHaveLength(album.photos.length);
    expect(plan.cells.map((cell) => cell.photoIndex)).toEqual(
      album.photos.map((_, index) => index),
    );

    for (const cell of plan.cells) {
      const aspect = album.photos[cell.photoIndex].aspectRatio;
      expect(cell.width / cell.height).toBeCloseTo(aspect, 3);
      expect(cell.x).toBeGreaterThanOrEqual(-0.5);
      expect(cell.y).toBeGreaterThanOrEqual(-0.5);
      expect(cell.x + cell.width).toBeLessThanOrEqual(plan.width + 0.5);
      expect(cell.y + cell.height).toBeLessThanOrEqual(plan.height + 0.5);
    }

    // One cell per grid slot, no duplicate photo indices.
    expect(new Set(plan.cells.map((cell) => cell.photoIndex)).size).toBe(grid.photos.length);
  });

  it('lays cells out without overlapping and places the placard on the left', () => {
    const plan = planMacroMosaic(album);
    for (let i = 0; i < plan.cells.length; i += 1) {
      for (let j = i + 1; j < plan.cells.length; j += 1) {
        expect(overlaps(plan.cells[i], plan.cells[j]), `${i} overlaps ${j}`).toBe(false);
      }
    }

    const leftmostCell = Math.min(...plan.cells.map((cell) => cell.x));
    expect(plan.placard.x + plan.placard.width).toBeLessThanOrEqual(leftmostCell + 0.5);
    expect(plan.placard.width / plan.pixelsPerUnit).toBeCloseTo(2.14, 3);
    expect(plan.placard.height / plan.pixelsPerUnit).toBeCloseTo(2, 3);
  });

  it('is deterministic and honours a custom cap', () => {
    expect(planMacroMosaic(album)).toEqual(planMacroMosaic(album));

    const small = planMacroMosaic(album, { maxEdgePx: 128 });
    expect(Math.max(small.width, small.height)).toBe(128);
    expect(small.cells).toHaveLength(album.photos.length);
  });

  it('handles an empty album without throwing', () => {
    const empty = withPlacement([makeAlbum(0, 0, 5)])[0];
    const plan = planMacroMosaic(empty);
    expect(plan.cells).toHaveLength(0);
    expect(plan.width).toBeGreaterThan(0);
  });
});

describe('macro-tier element budget', () => {
  it('mounts one mosaic per island instead of one element per print', () => {
    const albums = withPlacement(Array.from({ length: 50 }, (_, index) => makeAlbum(index)));

    expect(macroPrintElementCount(albums)).toBe(1_000);
    expect(macroMosaicElementCount(albums)).toBe(50);
    // 20x fewer nodes at macro tier, which is what removes the 233ms re-raster.
    expect(macroMosaicElementCount(albums)).toBe(macroPrintElementCount(albums) / 20);
  });
});
