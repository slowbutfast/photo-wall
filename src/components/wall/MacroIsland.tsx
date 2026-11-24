'use client';

/**
 * Macro-tier island: one pre-baked canvas mosaic per album.
 *
 * The camera demotes islands to this tier at `scale < 0.25` so the wall can
 * show hundreds of albums without mounting per-print DOM, blur, text or
 * iframes. `macroMosaic.ts` owns the geometry; this component only owns the
 * cache and the `<canvas>` host.
 */

import { useEffect, useRef } from 'react';

import type { WallAlbum, WallPhoto } from '@/lib/layout/types';

import { planMacroMosaic } from './macroMosaic';

const MACRO_MOSAIC_LOD = 256;
const MOSAIC_CACHE_LIMIT = 120;

const mosaicCache = new Map<string, { canvas: HTMLCanvasElement; signature: string }>();
const MOSAIC_LOADED = new WeakMap<HTMLImageElement, boolean>();

function mosaicSignature(
  album: WallAlbum,
  lodUrl: (photo: WallPhoto, longestEdge: number) => string,
): string {
  const sample = album.photos[0] ? lodUrl(album.photos[0], MACRO_MOSAIC_LOD) : '';
  return `${album.id}|${album.photos.map((photo) => photo.id).join(',')}|${album.bounds.width}x${album.bounds.height}|${sample}`;
}

function mosaicFor(
  album: WallAlbum,
  lodUrl: (photo: WallPhoto, longestEdge: number) => string,
): HTMLCanvasElement | null {
  if (typeof document === 'undefined') return null;
  const signature = mosaicSignature(album, lodUrl);
  const cached = mosaicCache.get(album.id);
  if (cached && cached.signature === signature) return cached.canvas;

  const canvas = document.createElement('canvas');
  const plan = planMacroMosaic(album);
  canvas.width = plan.width;
  canvas.height = plan.height;
  canvas.className = 'island-mosaic';
  canvas.setAttribute('aria-hidden', 'true');

  const context = canvas.getContext('2d');
  const images: HTMLImageElement[] = album.photos.map((photo) => {
    const image = new Image();
    image.decoding = 'async';
    image.onload = () => {
      MOSAIC_LOADED.set(image, true);
      paint();
    };
    image.onerror = () => MOSAIC_LOADED.set(image, false);
    image.src = lodUrl(photo, MACRO_MOSAIC_LOD);
    return image;
  });

  const paint = () => {
    if (!context) return;
    context.clearRect(0, 0, plan.width, plan.height);
    plan.cells.forEach((cell) => {
      context.fillStyle = 'rgba(0, 0, 0, 0.45)';
      context.fillRect(cell.x, cell.y + 2, cell.width, cell.height);
      context.fillStyle = '#f6f4ef';
      context.fillRect(cell.x, cell.y, cell.width, cell.height);
      const image = images[cell.photoIndex];
      if (!image || !MOSAIC_LOADED.get(image)) return;
      context.drawImage(
        image,
        cell.x + 1,
        cell.y + 1,
        Math.max(1, cell.width - 2),
        Math.max(1, cell.height - 2),
      );
    });

    context.fillStyle = 'rgba(226, 242, 234, 0.18)';
    context.fillRect(plan.placard.x, plan.placard.y, plan.placard.width, plan.placard.height);
    context.strokeStyle = 'rgba(240, 245, 242, 0.22)';
    context.lineWidth = 1;
    context.strokeRect(plan.placard.x, plan.placard.y, plan.placard.width, plan.placard.height);
  };

  paint();
  mosaicCache.set(album.id, { canvas, signature });
  while (mosaicCache.size > MOSAIC_CACHE_LIMIT) {
    const oldest = mosaicCache.keys().next().value;
    if (oldest === undefined) break;
    mosaicCache.delete(oldest);
  }
  return canvas;
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
    if (!host) return;
    const canvas = mosaicFor(album, lodUrl);
    if (canvas && canvas.parentElement !== host) host.replaceChildren(canvas);
    return () => {
      if (canvas && canvas.parentElement === host) host.removeChild(canvas);
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
