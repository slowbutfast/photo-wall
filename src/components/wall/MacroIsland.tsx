'use client';

/**
 * Macro-tier island: one pre-baked canvas mosaic per album.
 *
 * The camera demotes islands to this tier at `scale < 0.25` so the wall can
 * show hundreds of albums without mounting per-print DOM, blur, text or
 * iframes. `macroMosaic.ts` owns the geometry; this component only owns the
 * cache and the `<canvas>` host.
 *
 * Painting is incremental: the placeholder frame/placard is drawn once when
 * the canvas is created, and each thumbnail's `onload` draws only its own cell.
 * That keeps startup at `O(N)` `drawImage` calls regardless of whether the
 * thumbnails resolve in one frame or `N` frames (`O(N²)` before).
 *
 * Eviction is true LRU (a cache hit refreshes recency) and canvas backing stores
 * are zeroed only once detached: an evicted or signature-replaced canvas that is
 * still mounted in a visible island is queued in `pendingDisposal` and zeroed in
 * the component's unmount cleanup, so a visible mosaic is never blanked.
 */

import { useEffect, useRef } from 'react';

import type { WallAlbum, WallPhoto } from '@/lib/layout/types';

import { planMacroMosaic, type MosaicCell, type MosaicPlan } from './macroMosaic';

const MACRO_MOSAIC_LOD = 256;
const MOSAIC_CACHE_LIMIT = 120;

interface MosaicEntry {
  canvas: HTMLCanvasElement;
  signature: string;
}

let mosaicCache = new Map<string, MosaicEntry>();
const pendingDisposal = new WeakSet<HTMLCanvasElement>();

function mosaicSignature(
  album: WallAlbum,
  lodUrl: (photo: WallPhoto, longestEdge: number) => string,
): string {
  const sample = album.photos[0] ? lodUrl(album.photos[0], MACRO_MOSAIC_LOD) : '';
  return `${album.id}|${album.photos.map((photo) => photo.id).join(',')}|${album.bounds.width}x${album.bounds.height}|${sample}`;
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

function paintPlaceholder(context: CanvasRenderingContext2D, plan: MosaicPlan): void {
  context.clearRect(0, 0, plan.width, plan.height);
  for (const cell of plan.cells) {
    context.fillStyle = 'rgba(0, 0, 0, 0.45)';
    context.fillRect(cell.x, cell.y + 2, cell.width, cell.height);
    context.fillStyle = '#f6f4ef';
    context.fillRect(cell.x, cell.y, cell.width, cell.height);
  }
  context.fillStyle = 'rgba(226, 242, 234, 0.18)';
  context.fillRect(plan.placard.x, plan.placard.y, plan.placard.width, plan.placard.height);
  context.strokeStyle = 'rgba(240, 245, 242, 0.22)';
  context.lineWidth = 1;
  context.strokeRect(plan.placard.x, plan.placard.y, plan.placard.width, plan.placard.height);
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
): HTMLCanvasElement | null {
  if (typeof document === 'undefined') return null;
  const signature = mosaicSignature(album, lodUrl);
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
    paintPlaceholder(context, plan);
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
): HTMLCanvasElement | null {
  return mosaicFor(album, lodUrl);
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
  onSelect: () => void;
}

export default function MacroIsland({ album, lodUrl, onSelect }: MacroIslandProps) {
  const hostRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return undefined;
    const previous = host.firstElementChild as HTMLCanvasElement | null;
    const canvas = mosaicFor(album, lodUrl);
    if (canvas && canvas.parentElement !== host) host.replaceChildren(canvas);
    // A replaced canvas may still be here (the cache entry already changed).
    flushPendingDisposal(previous);
    return () => {
      if (canvas && canvas.parentElement === host) host.removeChild(canvas);
      // Deferred evictions of *this* island are safe to zero only once gone.
      flushPendingDisposal(canvas);
    };
  }, [album, lodUrl]);

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
