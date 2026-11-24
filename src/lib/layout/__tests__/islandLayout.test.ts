import { describe, expect, it } from 'vitest';

import {
  ALBUMS_PER_ROW,
  ISLAND_GAP,
  PLACARD_GAP,
  PLACARD_HEIGHT,
  PLACARD_WIDTH,
  SOUNDTRACK_GAP,
  SOUNDTRACK_HEIGHT,
  WORLD_SCALE,
  computeAlbumBounds,
  computeAlbumGrid,
  computeWallGridPositions,
  type LayoutAlbum,
} from '@/lib/layout/islandLayout';

function makeAlbum(overrides: Partial<LayoutAlbum> & { id: string }): LayoutAlbum {
  return {
    status: 'published',
    photoCount: 12,
    gridColumns: 3,
    sortOrder: 0,
    ...overrides,
  };
}

describe('islandLayout constants', () => {
  it('maps 100 design pixels to exactly one world unit', () => {
    expect(WORLD_SCALE).toBe(0.01);
    expect(PLACARD_WIDTH / WORLD_SCALE).toBeCloseTo(214, 6);
    expect(PLACARD_HEIGHT / WORLD_SCALE).toBeCloseTo(200, 6);
    expect(SOUNDTRACK_HEIGHT / WORLD_SCALE).toBeCloseTo(200, 6);
    expect(SOUNDTRACK_GAP / WORLD_SCALE).toBeCloseTo(12, 6);
    expect(ALBUMS_PER_ROW).toBe(3);
  });
});

describe('computeAlbumBounds', () => {
  it('adds the placard and the island gap to the left of the photo grid', () => {
    const bounds = computeAlbumBounds(9, 3);

    // 3 columns of 1u cells with 0.24u gutters.
    const gridWidth = 3 + 2 * 0.24;
    const gridHeight = 3 + 2 * 0.24;

    expect(bounds.width).toBeCloseTo(PLACARD_WIDTH + PLACARD_GAP + gridWidth, 6);
    // The grid is taller than the placard stack, so it sets the height.
    expect(bounds.height).toBeCloseTo(gridHeight, 6);
  });

  it('grows the width when the photo grid is wider than the placard', () => {
    const threeColumns = computeAlbumBounds(9, 3);
    const fiveColumns = computeAlbumBounds(20, 5);

    expect(fiveColumns.width).toBeGreaterThan(threeColumns.width);
    expect(fiveColumns.height).toBeGreaterThan(threeColumns.height);
  });

  it('uses the taller placard stack or grid, never the sum of both', () => {
    // One row of prints (1u) is shorter than the 2u placard.
    expect(computeAlbumBounds(3, 3).height).toBeCloseTo(PLACARD_HEIGHT, 6);
    // Adding the soundtrack plaque grows the stack to 2 + 0.12 + 2.
    expect(computeAlbumBounds(3, 3, true).height).toBeCloseTo(
      PLACARD_HEIGHT + SOUNDTRACK_GAP + SOUNDTRACK_HEIGHT,
      6,
    );
    // A tall grid still wins over the placard stack.
    expect(computeAlbumBounds(20, 5).height).toBeCloseTo(4 + 3 * 0.24, 6);
  });
});

describe('computeAlbumGrid', () => {
  it('mounts the placard left of the top-aligned grid with PLACARD_GAP (distinct from ISLAND_GAP)', () => {
    const layout = computeAlbumGrid(9, 3);
    const gridLeft = -layout.bounds.width / 2 + PLACARD_WIDTH + PLACARD_GAP;
    const gridRight = layout.bounds.width / 2;
    const placardRight = layout.placard.x + layout.placard.width / 2;
    const placardTop = layout.placard.y + layout.placard.height / 2;
    const gridCenterX = (gridLeft + gridRight) / 2;

    // The grid shifts right of the album center by half a placard plus half a gap.
    expect(gridCenterX).toBeCloseTo((PLACARD_WIDTH + PLACARD_GAP) / 2, 6);
    expect(layout.placard.x).toBeCloseTo(-(PLACARD_GAP + layout.grid.width) / 2, 6);
    expect(layout.placard.x + layout.placard.width / 2).toBeLessThan(gridLeft);
    expect(gridLeft - placardRight).toBeCloseTo(PLACARD_GAP, 6);
    expect(ISLAND_GAP).toBeGreaterThan(PLACARD_GAP);
    // Top edges align: both sit on the island's top edge (+y up).
    expect(placardTop).toBeCloseTo(layout.bounds.height / 2, 6);
    expect(layout.placard.width).toBe(PLACARD_WIDTH);
    expect(layout.placard.height).toBe(PLACARD_HEIGHT);
    expect(layout.soundtrack).toBeNull();
  });

  it('stacks the soundtrack plaque SOUNDTRACK_GAP below the placard and includes it in bounds', () => {
    const layout = computeAlbumGrid(9, 3, true);
    const soundtrack = layout.soundtrack;

    expect(soundtrack).not.toBeNull();
    if (!soundtrack) throw new Error('expected a soundtrack plaque');

    expect(soundtrack.x).toBe(layout.placard.x);
    expect(soundtrack.width).toBe(PLACARD_WIDTH);
    expect(soundtrack.height).toBe(SOUNDTRACK_HEIGHT);
    const placardBottom = layout.placard.y - layout.placard.height / 2;
    const soundtrackTop = soundtrack.y + soundtrack.height / 2;
    expect(placardBottom - soundtrackTop).toBeCloseTo(SOUNDTRACK_GAP, 6);

    // The placard + gap + plaque stack is taller than this grid, so it drives bounds.
    expect(layout.bounds.height).toBeCloseTo(
      PLACARD_HEIGHT + SOUNDTRACK_GAP + SOUNDTRACK_HEIGHT,
      6,
    );
    expect(soundtrack.y - soundtrack.height / 2).toBeCloseTo(-layout.bounds.height / 2, 6);
  });

  it('lays out photo cells top-left first inside the grid', () => {
    const layout = computeAlbumGrid(5, 3);
    const topLeft = layout.photos[0];
    const second = layout.photos[1];

    expect(layout.grid.rows).toBe(2);
    expect(layout.grid.columns).toBe(3);
    expect(topLeft.column).toBe(0);
    expect(topLeft.row).toBe(0);
    expect(second.column).toBe(1);
    expect(topLeft.y).toBeGreaterThan(second.y - 0.0001);
    expect(second.x).toBeGreaterThan(topLeft.x);
    // Prints sit right of the placard.
    expect(topLeft.x).toBeGreaterThan(layout.placard.x + layout.placard.width / 2);
  });

  it('falls back to a single placeholder cell when an album has no photos', () => {
    const layout = computeAlbumGrid(0, 3);

    expect(layout.grid.rows).toBe(1);
    expect(layout.grid.columns).toBe(1);
    expect(layout.photos).toHaveLength(0);
    expect(layout.bounds.width).toBeCloseTo(PLACARD_WIDTH + PLACARD_GAP + 1, 6);
  });
});

describe('computeWallGridPositions', () => {
  it('excludes drafts and deleting albums from the wall', () => {
    const placements = computeWallGridPositions([
      makeAlbum({ id: 'a', sortOrder: 0 }),
      makeAlbum({ id: 'draft', sortOrder: 1, status: 'draft' }),
      makeAlbum({ id: 'b', sortOrder: 2 }),
      makeAlbum({ id: 'deleting', sortOrder: 3, status: 'deleting' }),
    ]);

    expect(placements.map((placement) => placement.id)).toEqual(['a', 'b']);
  });

  it('wraps seven published albums at three per row without draft holes', () => {
    const albums: LayoutAlbum[] = [];
    for (let index = 0; index < 7; index += 1) {
      albums.push(
        makeAlbum({
          id: `published-${index}`,
          sortOrder: index,
          photoCount: 10 + index,
          gridColumns: 3 + (index % 3),
        }),
      );
    }
    albums.push(makeAlbum({ id: 'draft-1', sortOrder: 7, status: 'draft' }));
    albums.push(makeAlbum({ id: 'draft-2', sortOrder: 8, status: 'draft' }));

    const placements = computeWallGridPositions(albums);

    expect(placements).toHaveLength(7);

    // Albums within a row share the same vertical center; rows advance downwards.
    const rowKey = (placement: (typeof placements)[number]): string =>
      placement.position.y.toFixed(6);
    const rows = [...new Set(placements.map(rowKey))];

    expect(rows).toHaveLength(3);
    expect(placements.slice(0, 3).map(rowKey)).toEqual([rows[0], rows[0], rows[0]]);
    expect(placements.slice(3, 6).map(rowKey)).toEqual([rows[1], rows[1], rows[1]]);
    expect(rowKey(placements[6])).toBe(rows[2]);
    expect(rows[0]).not.toBe(rows[1]);
    expect(Number(rows[0])).toBeGreaterThan(Number(rows[1]));
  });

  it('never overlaps two album boxes plus the island gap', () => {
    const albums: LayoutAlbum[] = [];
    for (let index = 0; index < 50; index += 1) {
      albums.push(
        makeAlbum({
          id: `album-${index}`,
          sortOrder: index,
          photoCount: 1 + (index % 20),
          gridColumns: 1 + (index % 5),
        }),
      );
    }

    const placements = computeWallGridPositions(albums);

    expect(placements).toHaveLength(50);
    for (let a = 0; a < placements.length; a += 1) {
      for (let b = a + 1; b < placements.length; b += 1) {
        const left = placements[a];
        const right = placements[b];
        const xGap = Math.abs(left.position.x - right.position.x);
        const yGap = Math.abs(left.position.y - right.position.y);
        const minX = (left.bounds.width + right.bounds.width) / 2;
        const minY = (left.bounds.height + right.bounds.height) / 2;
        const separated = xGap >= minX - 1e-9 || yGap >= minY - 1e-9;
        expect(separated).toBe(true);
      }
    }
  });

  it('keeps column positions aligned across rows', () => {
    const albums = Array.from({ length: 6 }, (_, index) =>
      makeAlbum({ id: `album-${index}`, sortOrder: index, photoCount: 9, gridColumns: 3 }),
    );

    const placements = computeWallGridPositions(albums);
    const firstRow = placements.slice(0, 3);
    const secondRow = placements.slice(3, 6);

    firstRow.forEach((placement, index) => {
      expect(placement.position.x).toBeCloseTo(secondRow[index].position.x, 6);
      expect(placement.bounds.width).toBeCloseTo(secondRow[index].bounds.width, 6);
    });
  });

  it('is deterministic regardless of input order', () => {
    const albums = [
      makeAlbum({ id: 'b', sortOrder: 1 }),
      makeAlbum({ id: 'a', sortOrder: 0 }),
      makeAlbum({ id: 'c', sortOrder: 2 }),
    ];

    const forward = computeWallGridPositions(albums);
    const reversed = computeWallGridPositions([...albums].reverse());

    expect(reversed).toEqual(forward);
  });
});
