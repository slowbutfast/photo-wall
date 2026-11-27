'use client';

/**
 * Macro-tier island: one pre-baked canvas mosaic per album.
 *
 * The camera demotes islands to this tier at `scale < 0.22` so the wall can
 * show hundreds of albums without mounting per-print DOM, blur, text or
 * iframes. `macroMosaic.ts` owns the geometry; this component only owns the
 * cache and the `<canvas>` host.
 *
 * Painting is incremental: the placeholder footprint is drawn once when the
 * canvas is created, and each thumbnail's `onload` draws only its own cell.
 * That keeps startup at `O(N)` `drawImage` calls regardless of whether the
 * thumbnails resolve in one frame or `N` frames (`O(N²)` before).
 *
 * The placeholder reserves the album tier's silhouette: a placard plate in the
 * live material's colours, greeked title and caption bars where the text will
 * appear, and the soundtrack slot when the album has one. Text is never drawn
 * and no soundtrack thumbnail is ever requested, so the macro contract
 * (mosaics only) holds.
 *
 * Eviction is true LRU (a cache hit refreshes recency) and canvas backing stores
 * are zeroed only once detached: an evicted or signature-replaced canvas that is
 * still mounted in a visible island is queued in `pendingDisposal` and zeroed in
 * the component's unmount cleanup, so a visible mosaic is never blanked.
 */

import { useEffect, useRef } from 'react';

import { WORLD_SCALE } from '@/lib/layout/islandLayout';
import type { WallAlbum, WallPhoto } from '@/lib/layout/types';

import {
  planMacroMosaic,
  type MacroMosaicPalette,
  type MacroMosaicPlate,
  type MosaicCell,
  type MosaicPlan,
  type MosaicRect,
} from './macroMosaic';

const MACRO_MOSAIC_LOD = 256;
const MOSAIC_CACHE_LIMIT = 120;
/** The flat offset shadow every mosaic rect shares (`design.md` §2). */
const MOSAIC_SHADOW = 'rgba(0, 0, 0, 0.45)';

interface MosaicEntry {
  canvas: HTMLCanvasElement;
  signature: string;
}

let mosaicCache = new Map<string, MosaicEntry>();
const pendingDisposal = new WeakSet<HTMLCanvasElement>();

function mosaicSignature(
  album: WallAlbum,
  lodUrl: (photo: WallPhoto, longestEdge: number) => string,
  paletteKey: string,
): string {
  const sample = album.photos[0] ? lodUrl(album.photos[0], MACRO_MOSAIC_LOD) : '';
  const described = album.description?.trim() ? 1 : 0;
  return `${album.id}|${album.photos.map((photo) => photo.id).join(',')}|${album.bounds.width}x${album.bounds.height}|${sample}|${described}|${paletteKey}`;
}

/** Zero a dead canvas immediately; defer a still-mounted one to unmount cleanup. */
function disposeCanvas(canvas: HTMLCanvasElement): void {
  if (canvas.isConnected) {
    pendingDisposal.add(canvas);
    return;
  }
  canvas.width = 0;
  canvas.height = 0;
}

/** Release a deferred canvas once it leaves the DOM. */
function flushPendingDisposal(canvas: HTMLCanvasElement | null | undefined): void {
  if (!canvas || !pendingDisposal.has(canvas) || canvas.isConnected) return;
  pendingDisposal.delete(canvas);
  canvas.width = 0;
  canvas.height = 0;
}

/**
 * Plate fill for one mosaic. `linear-gradient(138deg, …)` is approximated by
 * the plate's top-left -> bottom-right diagonal, which is indistinguishable at
 * macro scale. Canvas gradient support is optional in some environments, so a
 * missing or throwing `createLinearGradient` falls back to the 55% stop.
 */
function plateFill(
  context: CanvasRenderingContext2D,
  plate: MacroMosaicPlate,
  rect: MosaicRect,
): string | CanvasGradient {
  if (plate.kind === 'solid') return plate.color;
  const middle = plate.stops[1];
  if (typeof context.createLinearGradient !== 'function') return middle;
  try {
    const gradient = context.createLinearGradient(
      rect.x,
      rect.y,
      rect.x + rect.width,
      rect.y + rect.height,
    );
    if (!gradient) return middle;
    gradient.addColorStop(0, plate.stops[0]);
    gradient.addColorStop(0.55, plate.stops[1]);
    gradient.addColorStop(1, plate.stops[2]);
    return gradient;
  } catch {
    return middle;
  }
}

function paintPlaceholder(
  context: CanvasRenderingContext2D,
  plan: MosaicPlan,
  palette: MacroMosaicPalette,
): void {
  context.clearRect(0, 0, plan.width, plan.height);
  for (const cell of plan.cells) {
    context.fillStyle = MOSAIC_SHADOW;
    context.fillRect(cell.x, cell.y + 2, cell.width, cell.height);
    context.fillStyle = '#f6f4ef';
    context.fillRect(cell.x, cell.y, cell.width, cell.height);
  }

  // Placard: the same flat shadow the prints use, then the plate, its glass
  // edges and the greeked text bars. Paint order matters: the bars sit on top.
  const plate = plan.placard;
  context.fillStyle = MOSAIC_SHADOW;
  context.fillRect(plate.x, plate.y + 2, plate.width, plate.height);
  context.fillStyle = plateFill(context, palette.plate, plate);
  context.fillRect(plate.x, plate.y, plate.width, plate.height);

  if (palette.edges) {
    const pixelsPerCssPx = plan.pixelsPerUnit * WORLD_SCALE;
    const { top, bottom } = palette.edges;
    const topHeight = top.px * pixelsPerCssPx;
    const bottomHeight = bottom.px * pixelsPerCssPx;
    context.fillStyle = top.color;
    context.fillRect(plate.x, plate.y, plate.width, topHeight);
    context.fillStyle = bottom.color;
    context.fillRect(plate.x, plate.y + plate.height - bottomHeight, plate.width, bottomHeight);
  }

  const inks = [palette.titleInk, palette.captionInk, palette.captionInk];
  plan.placardLines.forEach((bar, index) => {
    context.fillStyle = inks[Math.min(index, inks.length - 1)];
    context.fillRect(bar.x, bar.y, bar.width, bar.height);
  });

  // Soundtrack slot: the plaque's opaque base and its 1px pale border. The
  // cover art still arrives with the album tier; the macro tier reserves only
  // the footprint.
  const slot = plan.soundtrack;
  if (slot) {
    context.fillStyle = MOSAIC_SHADOW;
    context.fillRect(slot.x, slot.y + 2, slot.width, slot.height);
    context.fillStyle = palette.slot.fill;
    context.fillRect(slot.x, slot.y, slot.width, slot.height);
    context.strokeStyle = palette.slot.stroke;
    context.lineWidth = 1;
    context.strokeRect(slot.x, slot.y, slot.width, slot.height);
  }
}

function paintCell(
  context: CanvasRenderingContext2D,
  cell: MosaicCell,
  image: HTMLImageElement,
): void {
  context.drawImage(
    image,
    cell.x + 1,
    cell.y + 1,
    Math.max(1, cell.width - 2),
    Math.max(1, cell.height - 2),
  );
}

function mosaicFor(
  album: WallAlbum,
  lodUrl: (photo: WallPhoto, longestEdge: number) => string,
  palette: MacroMosaicPalette,
): HTMLCanvasElement | null {
  if (typeof document === 'undefined') return null;
  const signature = mosaicSignature(album, lodUrl, palette.key);
  const cached = mosaicCache.get(album.id);
  if (cached) {
    if (cached.signature === signature) {
      // True LRU: a hit becomes the most-recent entry.
      mosaicCache.delete(album.id);
      mosaicCache.set(album.id, cached);
      return cached.canvas;
    }
    mosaicCache.delete(album.id);
    disposeCanvas(cached.canvas);
  }

  const canvas = document.createElement('canvas');
  const plan = planMacroMosaic(album);
  canvas.width = plan.width;
  canvas.height = plan.height;
  canvas.className = 'island-mosaic';
  canvas.setAttribute('aria-hidden', 'true');

  const context = canvas.getContext('2d');
  if (context) {
    paintPlaceholder(context, plan, palette);
    for (const cell of plan.cells) {
      const photo = album.photos[cell.photoIndex];
      if (!photo) continue;
      const image = new Image();
      image.decoding = 'async';
      image.onload = () => paintCell(context, cell, image);
      image.src = lodUrl(photo, MACRO_MOSAIC_LOD);
    }
  }

  mosaicCache.set(album.id, { canvas, signature });
  while (mosaicCache.size > MOSAIC_CACHE_LIMIT) {
    const oldest = mosaicCache.keys().next().value;
    if (oldest === undefined) break;
    const evicted = mosaicCache.get(oldest);
    mosaicCache.delete(oldest);
    if (evicted) disposeCanvas(evicted.canvas);
  }
  return canvas;
}

/** Test seam: build an island mosaic without mounting React. */
export function __mosaicForTest(
  album: WallAlbum,
  lodUrl: (photo: WallPhoto, longestEdge: number) => string,
  palette: MacroMosaicPalette,
): HTMLCanvasElement | null {
  return mosaicFor(album, lodUrl, palette);
}

/** Test seam: cache insertion order, oldest first. */
export function __mosaicCacheKeys(): string[] {
  return [...mosaicCache.keys()];
}

/** Test seam: drop every cached mosaic. */
export function __resetMosaicCache(): void {
  mosaicCache = new Map();
}

export interface MacroIslandProps {
  album: WallAlbum;
  lodUrl: (photo: WallPhoto, longestEdge: number) => string;
  /** Resolved mosaic colours for the current theme, material and pointer. */
  palette: MacroMosaicPalette;
  onSelect: () => void;
}

export default function MacroIsland({ album, lodUrl, palette, onSelect }: MacroIslandProps) {
  const hostRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return undefined;
    const previous = host.firstElementChild as HTMLCanvasElement | null;
    const canvas = mosaicFor(album, lodUrl, palette);
    if (canvas && canvas.parentElement !== host) host.replaceChildren(canvas);
    // A replaced canvas may still be here (the cache entry already changed).
    flushPendingDisposal(previous);
    return () => {
      if (canvas && canvas.parentElement === host) host.removeChild(canvas);
      // Deferred evictions of *this* island are safe to zero only once gone.
      flushPendingDisposal(canvas);
    };
  }, [album, lodUrl, palette]);

  return (
    <button
      type="button"
      className="island-mosaic-button"
      onClick={onSelect}
      aria-label={`Open ${album.title} (${album.photos.length} prints)`}
    >
      <span className="island-mosaic-host" ref={hostRef} />
    </button>
  );
}
