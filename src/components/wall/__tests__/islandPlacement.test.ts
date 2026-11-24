/**
 * Island-local placement contract (regression guard).
 *
 * `computeAlbumGrid` returns centre-relative, y-up world units; `.album-island`
 * is positioned by its top-left corner in y-down CSS. Every child box must be
 * re-based, otherwise a whole island's contents shift by half its size, which
 * looks plausible on screen but puts the focused print off-camera during print
 * focus.
 */

import { describe, expect, it } from 'vitest';

import { islandLocalPoint, islandRectStyle } from '../islandPlacement';
import { computeAlbumGrid, computeWallGridPositions } from '@/lib/layout/islandLayout';

const BOUNDS = { width: 16.5, height: 2.24 };

describe('islandLocalPoint', () => {
  it('maps the island top-left corner to (0, 0)', () => {
    const point = islandLocalPoint(BOUNDS, -BOUNDS.width / 2, BOUNDS.height / 2);
    expect(point.left).toBeCloseTo(0, 9);
    expect(point.top).toBeCloseTo(0, 9);
  });

  it('maps the island centre to half its CSS size and flips Y', () => {
    const point = islandLocalPoint(BOUNDS, 0, 0);
    expect(point.left).toBeCloseTo((BOUNDS.width / 2) * 100, 9);
    expect(point.top).toBeCloseTo((BOUNDS.height / 2) * 100, 9);

    const upper = islandLocalPoint(BOUNDS, 0, 1);
    const lower = islandLocalPoint(BOUNDS, 0, -1);
    // Larger world y is higher on screen (smaller CSS top).
    expect(upper.top).toBeLessThan(lower.top);
  });
});

describe('islandRectStyle', () => {
  it('keeps every print and the placard inside the island box', () => {
    const albums = computeWallGridPositions([
      { id: 'a', status: 'published', photoCount: 20, gridColumns: 10, sortOrder: 0 },
    ]);
    const bounds = albums[0].bounds;
    const grid = computeAlbumGrid(20, 10, false);

    const islandCssWidth = bounds.width * 100;
    const islandCssHeight = bounds.height * 100;

    for (const cell of grid.photos) {
      const frame = islandRectStyle(bounds, cell.x, cell.y, { width: 0.94, height: 0.94 });
      expect(frame.left).toBeGreaterThanOrEqual(0);
      expect(frame.top).toBeGreaterThanOrEqual(0);
      expect(frame.left + frame.width).toBeLessThanOrEqual(islandCssWidth + 1e-6);
      expect(frame.top + frame.height).toBeLessThanOrEqual(islandCssHeight + 1e-6);
    }

    const placard = islandRectStyle(bounds, grid.placard.x, grid.placard.y, {
      width: grid.placard.width,
      height: grid.placard.height,
    });
    // The placard hugs the padded island edge (20px = 0.2u).
    expect(placard.left).toBeCloseTo(20, 6);
    expect(placard.width).toBeCloseTo(214, 6);
    expect(placard.height).toBeCloseTo(200, 6);

    // The placard sits left of the print grid, as the salon layout specifies.
    const leftmostCell = Math.min(
      ...grid.photos.map(
        (cell) => islandRectStyle(bounds, cell.x, cell.y, { width: 0.94, height: 0.94 }).left,
      ),
    );
    expect(placard.left + placard.width).toBeLessThan(leftmostCell);
  });

  it('centres a box on its cell', () => {
    const style = islandRectStyle(BOUNDS, 2, 1, { width: 0.8, height: 0.6 });
    const centre = islandLocalPoint(BOUNDS, 2, 1);
    expect(style.left + style.width / 2).toBeCloseTo(centre.left, 9);
    expect(style.top + style.height / 2).toBeCloseTo(centre.top, 9);
  });
});
