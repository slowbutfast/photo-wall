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

import { CELL_SIZE, computeAlbumGrid, WORLD_SCALE } from '@/lib/layout/islandLayout';
import type { WallAlbum } from '@/lib/layout/types';
import type { PlaygroundTheme } from '@/lib/lighting/playgroundTheme';

import type { PlacardMaterial } from './placardMaterial';

/** Long-edge cap for one island mosaic buffer (device pixels). */
export const MOSAIC_MAX_EDGE_PX = 512;

/** Print long edge before the mat, in world units (`140px` in the playground). */
export const PRINT_LONG_EDGE = 1.4;
/** Mat padding per side, in world units (`11px`). */
export const FRAME_MAT = 0.11;

/**
 * Frame outer size for one aspect ratio, matching the playground's
 * `.photo-frame` inline width/height: fit the print inside a `1.4u` square, then
 * add the `0.11u` mat on every side. Used by both the mosaic painter and the
 * real `.photo-frame` styles.
 */
export function fitFrameInCell(
  aspectRatio: number,
  _cellSize: number = CELL_SIZE,
  _inset?: number,
): { width: number; height: number } {
  const ratio =
    Number.isFinite(aspectRatio) && aspectRatio > 0 ? aspectRatio : 1;
  const printWidth = ratio >= 1 ? PRINT_LONG_EDGE : PRINT_LONG_EDGE * ratio;
  const printHeight = ratio >= 1 ? PRINT_LONG_EDGE / ratio : PRINT_LONG_EDGE;
  return {
    width: printWidth + FRAME_MAT * 2,
    height: printHeight + FRAME_MAT * 2,
  };
}

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
  /** Soundtrack plaque under the placard, or `null` when the album has none. */
  soundtrack: MosaicRect | null;
  /** Greeked title bar, plus two caption bars when a description exists. */
  placardLines: MosaicRect[];
}

/**
 * Greeked bar geometry, in placard-local CSS px inside the `214 x 200` placard
 * box (design.md §3). Widths are fixed rather than measured: `measureText` per
 * album would cost more than the bars are worth at macro scale, where a `17px`
 * title renders under 4.3 CSS px tall.
 */
export const PLACARD_LINE_RECTS = {
  title: { x: 24, y: 24, width: 104, height: 10 },
  caption1: { x: 24, y: 50, width: 150, height: 6 },
  caption2: { x: 24, y: 67, width: 112, height: 6 },
} as const;

/** Plate fill: a three-stop acrylic gradient, or a flat material fill. */
export type MacroMosaicPlate =
  | { kind: 'gradient'; stops: [string, string, string] }
  | { kind: 'solid'; color: string };

/** A placard edge highlight, with its height in placard-local CSS px. */
export interface MacroMosaicEdge {
  color: string;
  px: number;
}

/**
 * Every colour one macro mosaic needs, resolved once per `(theme, material,
 * pointer)` triple (architecture D4). Canvas cannot read CSS custom properties,
 * so these values mirror `wall.css` and `macroPaletteAudit.test.ts` guards them.
 */
export interface MacroMosaicPalette {
  /** Stable cache key built from the colour values only. */
  key: string;
  plate: MacroMosaicPlate;
  /** Acrylic glass edges; `null` for the flat materials (design.md §2). */
  edges: { top: MacroMosaicEdge; bottom: MacroMosaicEdge } | null;
  /** Greeked title-bar ink. */
  titleInk: string;
  /** Greeked caption-bar ink. */
  captionInk: string;
  /** Soundtrack slot base + stroke, mirroring `.soundtrack-plaque`. */
  slot: { fill: string; stroke: string };
}

/** `.mat-acrylic` border-top / border-bottom (design.md §2, Plate edges). */
const ACRYLIC_EDGES: { top: MacroMosaicEdge; bottom: MacroMosaicEdge } = {
  top: { color: 'rgba(242, 255, 248, 0.72)', px: 1.5 },
  bottom: { color: 'rgba(140, 185, 165, 0.52)', px: 3 },
};

/** `.soundtrack-plaque`: `--color-placard-core` plus its 1px border. */
const SOUNDTRACK_SLOT = { fill: '#161616', stroke: 'rgba(255, 255, 255, 0.08)' };

/**
 * Fixed fills for the non-glass materials: the aluminum `42%` gradient stop and
 * the foamcore background, with their up-close ink colours (design.md §2).
 */
const FIXED_MATERIALS: Record<
  Exclude<PlacardMaterial, 'acrylic'>,
  { plate: string; titleInk: string; captionInk: string }
> = {
  aluminum: {
    plate: '#d2d5d9',
    titleInk: 'rgba(17, 17, 17, 0.38)',
    captionInk: 'rgba(17, 17, 17, 0.26)',
  },
  foamcore: {
    plate: '#161616',
    titleInk: 'rgba(244, 246, 244, 0.30)',
    captionInk: 'rgba(240, 244, 241, 0.20)',
  },
};

/** `#rgb` / `#rrggbb` / `rgb()` / `rgba()` -> channels, defaulting to glass ink. */
function rgbChannels(color: string): [number, number, number] {
  const trimmed = color.trim();
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(trimmed);
  if (hex) {
    const body = hex[1].length === 3 ? hex[1].replace(/./g, (c) => c + c) : hex[1];
    return [
      Number.parseInt(body.slice(0, 2), 16),
      Number.parseInt(body.slice(2, 4), 16),
      Number.parseInt(body.slice(4, 6), 16),
    ];
  }
  const rgb = /rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/i.exec(trimmed);
  if (rgb) return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])];
  return [244, 246, 244];
}

/** The same RGB with a new alpha, so greeked ink can't inherit `glassCap`'s. */
function withAlpha(color: string, alpha: number): string {
  const [r, g, b] = rgbChannels(color);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/**
 * Resolve the mosaic palette for one theme, material and pointer type.
 *
 * Pure and total: two palettes that paint the same pixels share a `key`, which
 * is what `mosaicSignature` folds in, so switching mood or material replaces
 * cached mosaics through the existing defer-disposal path.
 */
export function resolveMacroMosaicPalette(
  theme: PlaygroundTheme,
  material: PlacardMaterial,
  coarse: boolean,
): MacroMosaicPalette {
  if (material === 'acrylic') {
    const stops = coarse ? theme.macroPlate.coarse : theme.macroPlate.fine;
    const base = {
      plate: {
        kind: 'gradient' as const,
        stops: [stops[0], stops[1], stops[2]] as [string, string, string],
      },
      edges: ACRYLIC_EDGES,
      titleInk: withAlpha(theme.glassInk, 0.34),
      captionInk: withAlpha(theme.glassCap, 0.24),
      slot: { ...SOUNDTRACK_SLOT },
    };
    return { ...base, key: JSON.stringify(base) };
  }

  const fixed = FIXED_MATERIALS[material];
  const base = {
    plate: { kind: 'solid' as const, color: fixed.plate },
    edges: null,
    titleInk: fixed.titleInk,
    captionInk: fixed.captionInk,
    slot: { ...SOUNDTRACK_SLOT },
  };
  return { ...base, key: JSON.stringify(base) };
}

/**
 * Plan one island's mosaic: buffer size capped at `maxEdgePx` on the long edge,
 * every photo mapped to an aspect-fitted, centred rect, the placard block, the
 * optional soundtrack slot and the greeked placard lines.
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
  const placard: MosaicRect = {
    x: placardCentre.x - (grid.placard.width * pixelsPerUnit) / 2,
    y: placardCentre.y - (grid.placard.height * pixelsPerUnit) / 2,
    width: grid.placard.width * pixelsPerUnit,
    height: grid.placard.height * pixelsPerUnit,
  };

  // Design.md §3 rects are placard-local CSS px; `WORLD_SCALE` turns one CSS px
  // into world units, and `pixelsPerUnit` turns that into buffer px.
  const pixelsPerCssPx = pixelsPerUnit * WORLD_SCALE;
  const toLine = (line: { x: number; y: number; width: number; height: number }): MosaicRect => ({
    x: placard.x + line.x * pixelsPerCssPx,
    y: placard.y + line.y * pixelsPerCssPx,
    width: line.width * pixelsPerCssPx,
    height: line.height * pixelsPerCssPx,
  });
  const hasDescription =
    typeof album.description === 'string' && album.description.trim().length > 0;
  const placardLines: MosaicRect[] = hasDescription
    ? [toLine(PLACARD_LINE_RECTS.title), toLine(PLACARD_LINE_RECTS.caption1), toLine(PLACARD_LINE_RECTS.caption2)]
    : [toLine(PLACARD_LINE_RECTS.title)];

  let soundtrack: MosaicRect | null = null;
  if (grid.soundtrack) {
    const centre = toBuffer(grid.soundtrack.x, grid.soundtrack.y);
    soundtrack = {
      x: centre.x - (grid.soundtrack.width * pixelsPerUnit) / 2,
      y: centre.y - (grid.soundtrack.height * pixelsPerUnit) / 2,
      width: grid.soundtrack.width * pixelsPerUnit,
      height: grid.soundtrack.height * pixelsPerUnit,
    };
  }

  return {
    width,
    height,
    pixelsPerUnit,
    cells,
    placard,
    soundtrack,
    placardLines,
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
