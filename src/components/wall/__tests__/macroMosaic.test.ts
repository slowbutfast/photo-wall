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
  resolveMacroMosaicPalette,
} from '../macroMosaic';
import { computeAlbumGrid, computeWallGridPositions, WORLD_SCALE } from '@/lib/layout/islandLayout';
import type { WallAlbum, WallPhoto, WallSoundtrack } from '@/lib/layout/types';
import { PLAYGROUND_THEMES } from '@/lib/lighting/playgroundTheme';

const ASPECTS = [4 / 5, 3 / 2, 2 / 3];

const SOUNDTRACK: WallSoundtrack = {
  videoId: 'jfKfPfyJRdk',
  artist: 'Lofi Girl',
  title: 'lofi hip hop radio',
  durationSec: 3600,
};

function makeAlbum(
  index: number,
  photoCount = 20,
  gridColumns = 5,
  overrides: Partial<WallAlbum> = {},
): WallAlbum {
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
    ...overrides,
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
  it('fits portraits and landscapes inside the playground 140px print window plus the 11px mat', () => {
    const portrait = fitFrameInCell(4 / 5);
    expect(portrait.height).toBeGreaterThan(portrait.width);
    expect(portrait.height).toBeCloseTo(1.62, 6);

    const landscape = fitFrameInCell(3 / 2);
    expect(landscape.width).toBeGreaterThan(landscape.height);
    expect(landscape.width).toBeCloseTo(1.62, 6);
    // The print (frame minus the mat) keeps the source aspect ratio.
    expect((landscape.width - 0.22) / (landscape.height - 0.22)).toBeCloseTo(3 / 2, 6);
    expect((portrait.width - 0.22) / (portrait.height - 0.22)).toBeCloseTo(4 / 5, 6);

    const square = fitFrameInCell(1);
    expect(square.width).toBeCloseTo(square.height, 9);
    expect(square.width).toBeCloseTo(1.62, 9);
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
      // Outside the 11px mat on every side, the print keeps its source aspect.
      expect((cell.width - 2 * 0.11 * plan.pixelsPerUnit) / (cell.height - 2 * 0.11 * plan.pixelsPerUnit)).toBeCloseTo(aspect, 1);
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

describe('macro mosaic footprint geometry', () => {
  /** The same `toBuffer` maths `planMacroMosaic` uses, written out. */
  function expectedRect(
    plan: { pixelsPerUnit: number },
    album: WallAlbum,
    rect: { x: number; y: number; width: number; height: number },
  ) {
    const ppu = plan.pixelsPerUnit;
    return {
      x: (rect.x + album.bounds.width / 2) * ppu - (rect.width * ppu) / 2,
      y: (album.bounds.height / 2 - rect.y) * ppu - (rect.height * ppu) / 2,
      width: rect.width * ppu,
      height: rect.height * ppu,
    };
  }

  function expectRectClose(
    actual: { x: number; y: number; width: number; height: number },
    expected: { x: number; y: number; width: number; height: number },
    tolerance = 1,
  ) {
    expect(Math.abs(actual.x - expected.x)).toBeLessThanOrEqual(tolerance);
    expect(Math.abs(actual.y - expected.y)).toBeLessThanOrEqual(tolerance);
    expect(Math.abs(actual.width - expected.width)).toBeLessThanOrEqual(tolerance);
    expect(Math.abs(actual.height - expected.height)).toBeLessThanOrEqual(tolerance);
  }

  it('reserves the soundtrack slot at the exact `computeAlbumGrid` rect', () => {
    const album = withPlacement([
      makeAlbum(0, 20, 5, { soundtrack: SOUNDTRACK }),
    ])[0];
    const plan = planMacroMosaic(album);
    const grid = computeAlbumGrid(album.photos.length, album.gridColumns, true);
    expect(grid.soundtrack).not.toBeNull();

    expect(plan.soundtrack).not.toBeNull();
    expectRectClose(plan.soundtrack!, expectedRect(plan, album, grid.soundtrack!));

    // Directly beneath the placard, in the same column.
    expect(plan.soundtrack!.x).toBeCloseTo(plan.placard.x, 6);
    expect(plan.soundtrack!.width).toBeCloseTo(plan.placard.width, 6);
    expect(plan.soundtrack!.height).toBeCloseTo(plan.placard.height, 6);
    expect(plan.soundtrack!.y).toBeGreaterThan(plan.placard.y + plan.placard.height);
  });

  it('returns a null soundtrack rect when the album has no soundtrack', () => {
    const album = withPlacement([makeAlbum(0)])[0];
    expect(album.soundtrack).toBeNull();
    expect(planMacroMosaic(album).soundtrack).toBeNull();
  });

  it('keeps the plan unchanged for albums without a soundtrack', () => {
    // The buffer cap must not depend on the soundtrack column.
    const withoutSoundtrack = withPlacement([makeAlbum(0)])[0];
    const withSoundtrack = withPlacement([
      makeAlbum(0, 20, 5, {
        soundtrack: SOUNDTRACK,
        bounds: withoutSoundtrack.bounds,
        position: withoutSoundtrack.position,
      }),
    ])[0];
    const plain = planMacroMosaic(withoutSoundtrack);
    const sound = planMacroMosaic(withSoundtrack);
    expect(plain.cells).toEqual(sound.cells);
    expect(plain.placard).toEqual(sound.placard);
  });

  it('emits one greeked title bar without a description', () => {
    const album = withPlacement([makeAlbum(0)])[0];
    const plan = planMacroMosaic(album);
    expect(plan.placardLines).toHaveLength(1);

    const ppuPerCssPx = plan.pixelsPerUnit * WORLD_SCALE;
    // design.md §3: title bar at (24, 24) in a 214x200 placard box, 104x10.
    expectRectClose(plan.placardLines[0], {
      x: plan.placard.x + 24 * ppuPerCssPx,
      y: plan.placard.y + 24 * ppuPerCssPx,
      width: 104 * ppuPerCssPx,
      height: 10 * ppuPerCssPx,
    });
  });

  it('emits the same one bar for empty and whitespace-only descriptions', () => {
    for (const description of ['', '   ', '\n\t ']) {
      const album = withPlacement([makeAlbum(0, 20, 5, { description })])[0];
      expect(planMacroMosaic(album).placardLines, JSON.stringify(description)).toHaveLength(1);
    }
  });

  it('emits three greeked bars with a description, all inside the plate', () => {
    const album = withPlacement([
      makeAlbum(0, 20, 5, { description: 'throwback to bali group 19' }),
    ])[0];
    const plan = planMacroMosaic(album);
    expect(plan.placardLines).toHaveLength(3);

    const ppuPerCssPx = plan.pixelsPerUnit * WORLD_SCALE;
    const expected = [
      { x: 24, y: 24, width: 104, height: 10 },
      { x: 24, y: 50, width: 150, height: 6 },
      { x: 24, y: 67, width: 112, height: 6 },
    ];
    plan.placardLines.forEach((bar, index) => {
      const spec = expected[index];
      expectRectClose(bar, {
        x: plan.placard.x + spec.x * ppuPerCssPx,
        y: plan.placard.y + spec.y * ppuPerCssPx,
        width: spec.width * ppuPerCssPx,
        height: spec.height * ppuPerCssPx,
      });
    });

    for (const bar of plan.placardLines) {
      expect(bar.x).toBeGreaterThanOrEqual(plan.placard.x);
      expect(bar.y).toBeGreaterThanOrEqual(plan.placard.y);
      expect(bar.x + bar.width).toBeLessThanOrEqual(plan.placard.x + plan.placard.width);
      expect(bar.y + bar.height).toBeLessThanOrEqual(plan.placard.y + plan.placard.height);
    }
  });

  it('keeps the greeked bars inside the plate at every buffer cap', () => {
    const album = withPlacement([
      makeAlbum(0, 20, 5, { description: 'spent over a decade...', soundtrack: SOUNDTRACK }),
    ])[0];
    for (const maxEdgePx of [64, 128, MOSAIC_MAX_EDGE_PX]) {
      const plan = planMacroMosaic(album, { maxEdgePx });
      expect(plan.placardLines).toHaveLength(3);
      for (const bar of plan.placardLines) {
        expect(bar.width).toBeGreaterThan(0);
        expect(bar.height).toBeGreaterThan(0);
        expect(bar.x + bar.width).toBeLessThanOrEqual(plan.placard.x + plan.placard.width + 1e-6);
        expect(bar.y + bar.height).toBeLessThanOrEqual(plan.placard.y + plan.placard.height + 1e-6);
      }
    }
  });
});

describe('resolveMacroMosaicPalette', () => {
  it('mirrors the acrylic plate stops from the theme, per pointer type', () => {
    const fine = resolveMacroMosaicPalette(PLAYGROUND_THEMES.chiaroscuro, 'acrylic', false);
    expect(fine.plate).toEqual({
      kind: 'gradient',
      stops: ['rgba(24, 28, 26, 0.58)', 'rgba(18, 22, 20, 0.46)', 'rgba(26, 30, 28, 0.54)'],
    });

    const coarse = resolveMacroMosaicPalette(PLAYGROUND_THEMES.chiaroscuro, 'acrylic', true);
    expect(coarse.plate).toEqual({
      kind: 'gradient',
      stops: ['rgba(26, 31, 28, 0.62)', 'rgba(18, 22, 20, 0.52)', 'rgba(28, 33, 30, 0.6)'],
    });
    expect(coarse.key).not.toBe(fine.key);
  });

  it('gives alabaster its own stops on both pointer profiles', () => {
    const alabasterFine = resolveMacroMosaicPalette(PLAYGROUND_THEMES.alabaster, 'acrylic', false);
    const alabasterCoarse = resolveMacroMosaicPalette(PLAYGROUND_THEMES.alabaster, 'acrylic', true);
    expect(alabasterFine.plate).toEqual(alabasterCoarse.plate);
    expect(alabasterFine.key).toBe(alabasterCoarse.key);
    expect(alabasterFine.key).not.toBe(
      resolveMacroMosaicPalette(PLAYGROUND_THEMES.chiaroscuro, 'acrylic', false).key,
    );
  });

  it('shares a key for chiaroscuro and concrete on a fine pointer', () => {
    expect(
      resolveMacroMosaicPalette(PLAYGROUND_THEMES.concrete, 'acrylic', false).key,
    ).toBe(resolveMacroMosaicPalette(PLAYGROUND_THEMES.chiaroscuro, 'acrylic', false).key);
  });

  it('uses the fixed aluminum and foamcore fills, mood-independently', () => {
    const aluminum = resolveMacroMosaicPalette(PLAYGROUND_THEMES.chiaroscuro, 'aluminum', false);
    expect(aluminum.plate).toEqual({ kind: 'solid', color: '#d2d5d9' });
    expect(aluminum.titleInk).toBe('rgba(17, 17, 17, 0.38)');
    expect(aluminum.captionInk).toBe('rgba(17, 17, 17, 0.26)');

    const foamcore = resolveMacroMosaicPalette(PLAYGROUND_THEMES.alabaster, 'foamcore', true);
    expect(foamcore.plate).toEqual({ kind: 'solid', color: '#161616' });
    expect(foamcore.titleInk).toBe('rgba(244, 246, 244, 0.30)');
    expect(foamcore.captionInk).toBe('rgba(240, 244, 241, 0.20)');

    // Mood and pointer must not leak into a fixed material's key.
    expect(foamcore.key).toBe(
      resolveMacroMosaicPalette(PLAYGROUND_THEMES.chiaroscuro, 'foamcore', false).key,
    );
  });

  it('derives the greeked acrylic inks from the theme glass inks', () => {
    const palette = resolveMacroMosaicPalette(PLAYGROUND_THEMES.chiaroscuro, 'acrylic', false);
    // glassInk #F4F6F4 at alpha 0.34; glassCap RGB at alpha 0.24.
    expect(palette.titleInk).toBe('rgba(244, 246, 244, 0.34)');
    expect(palette.captionInk).toBe('rgba(240, 244, 241, 0.24)');
  });

  it('gives every material the plaque-base slot and its 1px stroke', () => {
    for (const material of ['acrylic', 'aluminum', 'foamcore'] as const) {
      const palette = resolveMacroMosaicPalette(PLAYGROUND_THEMES.chiaroscuro, material, false);
      expect(palette.slot).toEqual({ fill: '#161616', stroke: 'rgba(255, 255, 255, 0.08)' });
    }
  });

  it('paints the acrylic glass edges and no edge for the flat materials', () => {
    expect(
      resolveMacroMosaicPalette(PLAYGROUND_THEMES.chiaroscuro, 'acrylic', false).edges,
    ).toEqual({
      top: { color: 'rgba(242, 255, 248, 0.72)', px: 1.5 },
      bottom: { color: 'rgba(140, 185, 165, 0.52)', px: 3 },
    });
    expect(resolveMacroMosaicPalette(PLAYGROUND_THEMES.chiaroscuro, 'aluminum', false).edges).toBeNull();
    expect(resolveMacroMosaicPalette(PLAYGROUND_THEMES.chiaroscuro, 'foamcore', false).edges).toBeNull();
  });

  it('never reaches for the opaque placard core as the plate', () => {
    for (const material of ['acrylic', 'aluminum', 'foamcore'] as const) {
      const palette = resolveMacroMosaicPalette(PLAYGROUND_THEMES.alabaster, material, false);
      if (material !== 'foamcore' && palette.plate.kind === 'solid') {
        expect(palette.plate.color).not.toBe('#161616');
      }
    }
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
