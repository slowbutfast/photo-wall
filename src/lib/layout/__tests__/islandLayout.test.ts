import { describe, expect, it } from 'vitest';

import {
  ALBUMS_PER_ROW,
  CELL_SIZE,
  GUTTER,
  ISLAND_GAP,
  ISLAND_PADDING,
  PLACARD_GAP,
  PLACARD_HEIGHT,
  PLACARD_TOP_OFFSET,
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
    expect(CELL_SIZE / WORLD_SCALE).toBeCloseTo(158, 6);
    expect(GUTTER / WORLD_SCALE).toBeCloseTo(24, 6);
    expect(PLACARD_GAP / WORLD_SCALE).toBeCloseTo(44, 6);
    expect(ISLAND_PADDING / WORLD_SCALE).toBeCloseTo(20, 6);
    expect(PLACARD_TOP_OFFSET / WORLD_SCALE).toBeCloseTo(8, 6);
    expect(ALBUMS_PER_ROW).toBe(3);
  });
});

describe('computeAlbumBounds', () => {
  it('adds the island padding, placard and gap to the photo grid', () => {
    const bounds = computeAlbumBounds(9, 3);

    const gridWidth = 3 * CELL_SIZE + 2 * GUTTER;
    const gridHeight = 3 * CELL_SIZE + 2 * GUTTER;
    const placardStack = PLACARD_TOP_OFFSET + PLACARD_HEIGHT;

    expect(bounds.width).toBeCloseTo(
      PLACARD_WIDTH + PLACARD_GAP + gridWidth + ISLAND_PADDING * 2,
      6,
    );
    expect(bounds.height).toBeCloseTo(
      Math.max(gridHeight, placardStack) + ISLAND_PADDING * 2,
      6,
    );
  });

  it('uses the taller placard stack or grid, never the sum of both', () => {
    // One row of prints is shorter than the 2u placard (+8px top offset).
    expect(computeAlbumBounds(3, 3).height).toBeCloseTo(
      PLACARD_TOP_OFFSET + PLACARD_HEIGHT + ISLAND_PADDING * 2,
      6,
    );
    // Adding the soundtrack plaque grows the stack.
    expect(computeAlbumBounds(3, 3, true).height).toBeCloseTo(
      PLACARD_TOP_OFFSET +
        PLACARD_HEIGHT +
        SOUNDTRACK_GAP +
        SOUNDTRACK_HEIGHT +
        ISLAND_PADDING * 2,
      6,
    );
    // A tall grid still wins over the placard stack.
    expect(computeAlbumBounds(20, 5).height).toBeCloseTo(
      4 * CELL_SIZE + 3 * GUTTER + ISLAND_PADDING * 2,
      6,
    );
  });
});

describe('computeAlbumGrid', () => {
  it('mounts the placard left of the grid with PLACARD_GAP and the 8px top offset', () => {
    const layout = computeAlbumGrid(9, 3);
    const contentLeft = -layout.bounds.width / 2 + ISLAND_PADDING;
    const contentTop = layout.bounds.height / 2 - ISLAND_PADDING;
    const gridLeft = contentLeft + PLACARD_WIDTH + PLACARD_GAP;
    const gridRight = layout.bounds.width / 2 - ISLAND_PADDING;
    const placardRight = layout.placard.x + layout.placard.width / 2;
    const placardTop = layout.placard.y + layout.placard.height / 2;

    expect(gridLeft - placardRight).toBeCloseTo(PLACARD_GAP, 6);
    expect(placardTop).toBeCloseTo(contentTop - PLACARD_TOP_OFFSET, 6);
    expect(contentTop - placardTop).toBeCloseTo(PLACARD_TOP_OFFSET, 6);
    expect(layout.placard.width).toBe(PLACARD_WIDTH);
    expect(layout.placard.height).toBe(PLACARD_HEIGHT);
    expect(layout.soundtrack).toBeNull();
    expect(gridRight).toBeCloseTo(layout.bounds.width / 2 - ISLAND_PADDING, 6);
    expect(ISLAND_GAP).toBeGreaterThan(PLACARD_GAP);
  });

  it('stacks the soundtrack plaque SOUNDTRACK_GAP below the placard and includes it in bounds', () => {
    const layout = computeAlbumGrid(3, 3, true);
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
      PLACARD_TOP_OFFSET +
        PLACARD_HEIGHT +
        SOUNDTRACK_GAP +
        SOUNDTRACK_HEIGHT +
        ISLAND_PADDING * 2,
      6,
    );
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
    expect(topLeft.x).toBeGreaterThan(layout.placard.x + layout.placard.width / 2);
  });

  it('falls back to a single placeholder cell when an album has no photos', () => {
    const layout = computeAlbumGrid(0, 3);

    expect(layout.grid.rows).toBe(1);
    expect(layout.grid.columns).toBe(1);
    expect(layout.photos).toHaveLength(0);
    expect(layout.bounds.width).toBeCloseTo(
      PLACARD_WIDTH + PLACARD_GAP + CELL_SIZE + ISLAND_PADDING * 2,
      6,
    );
  });
});

/**
 * 1px golden: reproduce the playground's DOM geometry from its own CSS values
 * (158px cells, 24px gutter, 20px island padding, 44px placard gap, 8px placard
 * margin) and compare it with `computeAlbumGrid` for the four pinned albums.
 */
describe('1px playground golden geometry', () => {
  const PLAYGROUND_ALBUMS = [
    { count: 12, columns: 4, soundtrack: true },
    { count: 15, columns: 5, soundtrack: true },
    { count: 12, columns: 4, soundtrack: false },
    { count: 16, columns: 4, soundtrack: true },
  ] as const;

  function expected(album: (typeof PLAYGROUND_ALBUMS)[number]) {
    const gridWidth = album.columns * 158 + (album.columns - 1) * 24;
    const rows = Math.ceil(album.count / album.columns);
    const gridHeight = rows * 158 + (rows - 1) * 24;
    const stackHeight = 8 + 200 + (album.soundtrack ? 12 + 200 : 0);
    const contentHeight = Math.max(gridHeight, stackHeight);
    const width = 20 + 214 + 44 + gridWidth + 20;
    const height = contentHeight + 40;
    const contentLeft = -width / 2 + 20;
    const contentTop = height / 2 - 20;
    const gridLeft = contentLeft + 214 + 44;

    const cells = Array.from({ length: album.count }, (_, index) => {
      const row = Math.floor(index / album.columns);
      const column = index % album.columns;
      return {
        x: gridLeft + 79 + column * 182,
        y: contentTop - 79 - row * 182,
      };
    });

    return {
      width,
      height,
      cells,
      placard: { x: contentLeft + 107, y: contentTop - 8 - 100 },
      soundtrack: album.soundtrack
        ? { x: contentLeft + 107, y: contentTop - 8 - 100 - 100 - 12 - 100 }
        : null,
    };
  }

  it.each(PLAYGROUND_ALBUMS.map((album, index) => [index, album] as const))(
    'matches cell centres, placard and soundtrack within 1px for album %i',
    (_index, album) => {
      const layout = computeAlbumGrid(album.count, album.columns, album.soundtrack);
      const golden = expected(album);

      expect(layout.bounds.width * 100).toBeCloseTo(golden.width, 6);
      expect(layout.bounds.height * 100).toBeCloseTo(golden.height, 6);

      layout.photos.forEach((cell, index) => {
        expect(Math.abs(cell.x * 100 - golden.cells[index].x)).toBeLessThanOrEqual(1);
        expect(Math.abs(cell.y * 100 - golden.cells[index].y)).toBeLessThanOrEqual(1);
      });

      expect(Math.abs(layout.placard.x * 100 - golden.placard.x)).toBeLessThanOrEqual(1);
      expect(Math.abs(layout.placard.y * 100 - golden.placard.y)).toBeLessThanOrEqual(1);

      if (golden.soundtrack) {
        expect(layout.soundtrack).not.toBeNull();
        expect(Math.abs((layout.soundtrack?.x ?? 0) * 100 - golden.soundtrack.x)).toBeLessThanOrEqual(1);
        expect(Math.abs((layout.soundtrack?.y ?? 0) * 100 - golden.soundtrack.y)).toBeLessThanOrEqual(1);
      }
    },
  );
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

describe('computeWallGridPositions includeStatuses', () => {
  const albums = [
    makeAlbum({ id: 'published', sortOrder: 0 }),
    makeAlbum({ id: 'draft', sortOrder: 1, status: 'draft' }),
    makeAlbum({ id: 'deleting', sortOrder: 2, status: 'deleting' }),
  ];

  it('defaults to published albums only', () => {
    const placements = computeWallGridPositions(albums);
    expect(placements.map((placement) => placement.id)).toEqual(['published']);
  });

  it('includes published and draft albums when requested', () => {
    const placements = computeWallGridPositions(albums, {
      includeStatuses: ['published', 'draft'],
    });
    expect(placements.map((placement) => placement.id)).toEqual(['published', 'draft']);
  });

  it('lays drafts out with the same deterministic geometry rules as published albums', () => {
    const withDrafts = computeWallGridPositions(
      [
        makeAlbum({ id: 'a', sortOrder: 0 }),
        makeAlbum({ id: 'b', sortOrder: 1 }),
        makeAlbum({ id: 'c', sortOrder: 2, status: 'draft' }),
      ],
      { includeStatuses: ['published', 'draft'] },
    );

    expect(withDrafts.map((placement) => placement.id)).toEqual(['a', 'b', 'c']);
    expect(withDrafts).toHaveLength(3);
    expect(new Set(withDrafts.map((placement) => placement.position.y)).size).toBe(1);
    for (const placement of withDrafts) {
      expect(Number.isFinite(placement.position.x)).toBe(true);
      expect(placement.bounds.width).toBeGreaterThan(0);
    }
  });
});
