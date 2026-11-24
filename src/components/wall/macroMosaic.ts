'use client';

/**
 * Macro-tier pre-baked island mosaic.
 *
 * The Group 1 spike (`openspec/changes/dom-wall-engine/spike-results.md`) showed
 * that holding 1,000 mounted `.photo-frame` nodes under a live `scale()` costs a
 * ~233 ms full-layer re-raster whenever `will-change: transform` is dropped. The
 * documented fallback is therefore mandatory at macro tier: each visible island
 * composites **one** cheap pre-baked canvas instead of 20 DOM prints, and the
 * real accessible `<button>` prints appear at `album` / `print` zoom.
 *
 * This module owns the geometry so the canvas drawing, the DOM island box and
 * the spike benchmark all agree on one plan.
 */

import { CELL_SIZE, computeAlbumGrid } from '@/lib/layout/islandLayout';
import type { WallAlbum } from '@/lib/layout/types';

/** Long-edge cap for one island mosaic buffer (device pixels). */
export const MOSAIC_MAX_EDGE_PX = 512;

/** Print inset from a `CELL_SIZE x CELL_SIZE` slot, in world units. */
const FRAME_INSET = 0.015;

export interface MosaicRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface MosaicCell extends MosaicRect {
  /** Index into `album.photos` (canvas paint order). */
  photoIndex: number;
}

export interface MosaicPlan {
  /** Canvas buffer size in device pixels. */
  width: number;
  height: number;
  /** World units -> buffer pixels. */
  pixelsPerUnit: number;
  cells: MosaicCell[];
  placard: MosaicRect;
}

/**
 * Fit a print (true aspect ratio) inside a grid cell, centred, leaving a thin
 * mat inset. Used by both the mosaic painter and the real `.photo-frame` styles.
 */
export function fitFrameInCell(
  aspectRatio: number,
  cellSize: number = CELL_SIZE,
  inset: number = FRAME_INSET,
): { width: number; height: number } {
  const ratio =
    Number.isFinite(aspectRatio) && aspectRatio > 0 ? aspectRatio : 1;
  const usable = Math.max(0.05, cellSize - inset * 2);
  return ratio >= 1
    ? { width: usable, height: usable / ratio }
    : { width: usable * ratio, height: usable };
}

/**
 * Plan one island's mosaic: buffer size capped at `maxEdgePx` on the long edge,
 * every photo mapped to an aspect-fitted, centred rect, plus the placard block.
 * Pure and deterministic — no DOM, no image loading.
 */
export function planMacroMosaic(
  album: WallAlbum,
  options: { maxEdgePx?: number } = {},
): MosaicPlan {
  const maxEdge = Math.max(32, options.maxEdgePx ?? MOSAIC_MAX_EDGE_PX);
  const grid = computeAlbumGrid(
    album.photos.length,
    album.gridColumns,
    album.soundtrack !== null,
  );

  const worldWidth = Math.max(1e-3, album.bounds.width);
  const worldHeight = Math.max(1e-3, album.bounds.height);
  const pixelsPerUnit = maxEdge / Math.max(worldWidth, worldHeight);
  const width = Math.max(1, Math.round(worldWidth * pixelsPerUnit));
  const height = Math.max(1, Math.round(worldHeight * pixelsPerUnit));

  const toBuffer = (localX: number, localY: number) => ({
    x: (localX + worldWidth / 2) * pixelsPerUnit,
    y: (worldHeight / 2 - localY) * pixelsPerUnit,
  });

  const cells: MosaicCell[] = grid.photos.map((cell, photoIndex) => {
    const aspect = album.photos[photoIndex]?.aspectRatio ?? 1;
    const frame = fitFrameInCell(aspect);
    const centre = toBuffer(cell.x, cell.y);
    return {
      x: centre.x - (frame.width * pixelsPerUnit) / 2,
      y: centre.y - (frame.height * pixelsPerUnit) / 2,
      width: frame.width * pixelsPerUnit,
      height: frame.height * pixelsPerUnit,
      photoIndex,
    };
  });

  const placardCentre = toBuffer(grid.placard.x, grid.placard.y);

  return {
    width,
    height,
    pixelsPerUnit,
    cells,
    placard: {
      x: placardCentre.x - (grid.placard.width * pixelsPerUnit) / 2,
      y: placardCentre.y - (grid.placard.height * pixelsPerUnit) / 2,
      width: grid.placard.width * pixelsPerUnit,
      height: grid.placard.height * pixelsPerUnit,
    },
  };
}

/**
 * Number of DOM elements the macro tier mounts for these albums: exactly one
 * mosaic per island (the fallback's whole point), versus `photos.length` prints
 * per island on the album tier.
 */
export function macroMosaicElementCount(albums: readonly WallAlbum[]): number {
  return albums.length;
}

/** Prints that would otherwise be mounted at macro tier. */
export function macroPrintElementCount(albums: readonly WallAlbum[]): number {
  return albums.reduce((sum, album) => sum + album.photos.length, 0);
}
