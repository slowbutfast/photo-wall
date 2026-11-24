'use client';

/**
 * The DOM wall: viewport-culled album islands inside one 2D-transformed
 * `.world` container.
 *
 * Compositor hygiene (non-negotiable, see `architecture.md` decision 3):
 * - `.world` gets a plain `translate(...) scale(...)` (written imperatively by
 *   `GalleryViewport`, gesture-only `will-change`), never `preserve-3d`.
 * - `.album-island` uses `contain: layout` — **not** `contain: paint`, so
 *   directional cast shadows and the hover tilt are never clipped.
 * - No `opacity < 1`, `filter`, `mask`, `clip-path` or `mix-blend-mode` on
 *   `.world` / `.album-island`; print-focus dimming is per-`.photo-frame` only,
 *   otherwise Chrome `backdrop-filter` loses its backdrop root.
 *
 * Zoom tiers:
 * - `macro` (< 0.25): **one pre-baked mosaic canvas per island** (the fallback
 *   activated after the Task 1.5 spike), flat placard, no soundtrack plaque.
 * - `album`: real aspect-fitted `<button>` prints at projected-size LOD, glass
 *   placard, soundtrack facade.
 * - `print`: same, plus per-element periphery dimming on non-focused siblings.
 */

import { useEffect, useMemo, useRef } from 'react';
import { thumbHashToDataURL } from 'thumbhash';

import { worldXToCssLeft, worldYToCssTop, type CameraState } from '@/lib/camera/cameraMath';
import { CELL_SIZE, computeAlbumGrid } from '@/lib/layout/islandLayout';
import type { AlbumPlacement, WallAlbum, WallPhoto } from '@/lib/layout/types';

import SoundtrackPlaque from './SoundtrackPlaque';
import { islandRectStyle } from './islandPlacement';
import { fitFrameInCell, planMacroMosaic } from './macroMosaic';
import type { PlacardMaterial } from './placardMaterial';
import { computeGalleryLightingVars, galleryLightingKey } from './useGalleryLighting';
import { visibleIslands } from './visibleIslands';
import { resolveProjectedLodWidth, resolveZoomTier, type ZoomTier } from './zoomTier';

export interface CssGalleryWorldProps {
  albums: readonly WallAlbum[];
  /** Longest-edge LOD URL builder bound to the manifest's CDN base. */
  lodUrl: (photo: WallPhoto, longestEdge: number) => string;
  /** Coarse camera snapshot (updated when it moves enough to change culling). */
  camera: CameraState;
  viewport: { width: number; height: number };
  /** `.world` CSS scale, i.e. `cameraToCssScale(z, viewport.height)`. */
  scale: number;
  dpr: number;
  focusedAlbumId: string | null;
  focusedPhotoId: string | null;
  placardMaterial: PlacardMaterial;
  worldRef: React.RefObject<HTMLDivElement | null>;
  onSelectAlbum: (albumId: string) => void;
  onSelectPhoto: (albumId: string, photoId: string) => void;
  /** Marks the gesture as drag-thresholded so a click after a pan is ignored. */
  wasDragged: () => boolean;
}

/** Pre-fetch width used by the macro mosaic (macro LOD bucket). */
const MACRO_MOSAIC_LOD = 256;
const MOSAIC_LOADED = new WeakMap<HTMLImageElement, boolean>();
/** Upper bound on cached island mosaics (memory stays ~13 MB at 50 islands). */
const MOSAIC_CACHE_LIMIT = 120;

function thumbHashUrl(photo: WallPhoto): string | null {
  if (!photo.thumbHash || typeof atob === 'undefined') return null;
  try {
    const binary = atob(photo.thumbHash);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return thumbHashToDataURL(bytes);
  } catch {
    return null;
  }
}

function photoAlt(album: WallAlbum, photo: WallPhoto, index: number): string {
  const caption = album.description?.trim();
  if (caption) return `${caption} — ${album.title}, print ${index + 1}`;
  return `${album.title}, print ${index + 1}`;
}

/**
 * Module-level mosaic cache: one painted canvas per album island. It lives
 * outside React so zooming out does not re-decode the prints, and so creating a
 * canvas never has to force a re-render.
 */
const mosaicCache = new Map<string, { canvas: HTMLCanvasElement; signature: string }>();

function mosaicSignature(album: WallAlbum, lodUrl: (photo: WallPhoto, longestEdge: number) => string) {
  const firstPhoto = album.photos[0];
  const sample = firstPhoto ? lodUrl(firstPhoto, MACRO_MOSAIC_LOD) : '';
  return `${album.id}|${album.photos.map((photo) => photo.id).join(',')}|${album.bounds.width}x${album.bounds.height}|${sample}`;
}

/**
 * Paint (or reuse) the pre-baked mosaic for one island: mat-coloured cells with
 * each photo drawn as it decodes, plus a flat macro-tier placard block. No
 * `backdrop-filter`, no per-print element, no text.
 */
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
  const paint = () => {
    if (!context) return;
    // Transparent outside the prints so the plaster wall shows through the
    // island slot; the island box is not a painted rectangle.
    context.clearRect(0, 0, plan.width, plan.height);

    plan.cells.forEach((cell) => {
      // One flat macrotier shadow, baked into the tile (no CSS box-shadow on a
      // transparent canvas, which would draw a rectangle around the slot).
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

  paint();
  mosaicCache.set(album.id, { canvas, signature });

  // Bound total mosaic memory (~13 MB at the 50-island overview).
  while (mosaicCache.size > MOSAIC_CACHE_LIMIT) {
    const oldest = mosaicCache.keys().next().value;
    if (oldest === undefined) break;
    mosaicCache.delete(oldest);
  }

  return canvas;
}

export default function CssGalleryWorld({
  albums: rawAlbums,
  lodUrl,
  camera,
  viewport,
  scale,
  dpr,
  focusedAlbumId,
  focusedPhotoId,
  placardMaterial,
  worldRef,
  onSelectAlbum,
  onSelectPhoto,
  wasDragged,
}: CssGalleryWorldProps) {
  // Sort prints by `sortOrder` once: the tab order, the visual order and the
  // lighting-variable index must all refer to the same array position.
  const albums = useMemo<WallAlbum[]>(
    () =>
      rawAlbums.map((album) => ({
        ...album,
        photos: [...album.photos].sort((a, b) => a.sortOrder - b.sortOrder),
      })),
    [rawAlbums],
  );

  const tier: ZoomTier = resolveZoomTier(scale, Boolean(focusedAlbumId && focusedPhotoId));
  const placements = useMemo<AlbumPlacement[]>(
    () =>
      albums.map((album) => ({
        id: album.id,
        position: album.position,
        bounds: album.bounds,
      })),
    [albums],
  );

  // One row of margin so a fast pan never flashes an empty island slot.
  const visible = useMemo(
    () => visibleIslands(camera, viewport, placements, 3),
    [camera, viewport, placements],
  );
  const visibleIds = useMemo(() => new Set(visible.map((entry) => entry.id)), [visible]);

  const lightingVars = useMemo(() => computeGalleryLightingVars(albums), [albums]);

  return (
    <div className="world" ref={worldRef} data-tier={tier}>
      {albums.map((album) => {
        if (!visibleIds.has(album.id)) return null;

        const islandStyle: React.CSSProperties = {
          left: worldXToCssLeft(album.position.x - album.bounds.width / 2),
          top: worldYToCssTop(album.position.y + album.bounds.height / 2),
          width: album.bounds.width * 100,
          height: album.bounds.height * 100,
        };

        const placardVars = lightingVars.get(galleryLightingKey(album.id, 'placard', 0));

        return (
          <div
            key={album.id}
            className="album-island"
            style={islandStyle}
            data-tier={tier}
            data-album-id={album.id}
          >
            {tier === 'macro' ? (
              <MacroIsland
                album={album}
                lodUrl={lodUrl}
                onSelect={() => {
                  if (wasDragged()) return;
                  onSelectAlbum(album.id);
                }}
              />
            ) : (
              <AlbumTier
                album={album}
                lodUrl={lodUrl}
                tier={tier}
                scale={scale}
                dpr={dpr}
                focusedPhotoId={focusedAlbumId === album.id ? focusedPhotoId : null}
                placardMaterial={placardMaterial}
                placardVars={placardVars}
                lightingVars={lightingVars}
                onSelectAlbum={onSelectAlbum}
                onSelectPhoto={onSelectPhoto}
                wasDragged={wasDragged}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

function MacroIsland({
  album,
  lodUrl,
  onSelect,
}: {
  album: WallAlbum;
  lodUrl: (photo: WallPhoto, longestEdge: number) => string;
  onSelect: () => void;
}) {
  const hostRef = useRef<HTMLSpanElement>(null);

  // Attach the cached/painted canvas to the DOM; creation is idempotent and
  // never needs a React state update.
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

interface AlbumTierProps {
  album: WallAlbum;
  lodUrl: (photo: WallPhoto, longestEdge: number) => string;
  tier: ZoomTier;
  scale: number;
  dpr: number;
  focusedPhotoId: string | null;
  placardMaterial: PlacardMaterial;
  placardVars: Record<string, string> | undefined;
  lightingVars: Map<string, Record<string, string>>;
  onSelectAlbum: (albumId: string) => void;
  onSelectPhoto: (albumId: string, photoId: string) => void;
  wasDragged: () => boolean;
}

function AlbumTier({
  album,
  lodUrl,
  tier,
  scale,
  dpr,
  focusedPhotoId,
  placardMaterial,
  placardVars,
  lightingVars,
  onSelectAlbum,
  onSelectPhoto,
  wasDragged,
}: AlbumTierProps) {
  const grid = useMemo(
    () => computeAlbumGrid(album.photos.length, album.gridColumns, album.soundtrack !== null),
    [album.photos.length, album.gridColumns, album.soundtrack],
  );

  const ordered = album.photos;

  const lodWidth = resolveProjectedLodWidth(CELL_SIZE * 100, scale, dpr);

  return (
    <>
      <button
        type="button"
        className="museum-placard"
        data-material={placardMaterial}
        data-tier={tier}
        style={{
          ...islandRectStyle(album.bounds, grid.placard.x, grid.placard.y, {
            width: grid.placard.width,
            height: grid.placard.height,
          }),
          ...placardVars,
        }}
        onClick={() => {
          if (wasDragged()) return;
          onSelectAlbum(album.id);
        }}
        aria-label={`Open ${album.title}`}
      >
        <h3 className="placard-title">{album.title}</h3>
        {album.description ? <p className="placard-caption">{album.description}</p> : null}
        <p className="placard-meta">
          {[album.cameraName, album.dateLabel, album.locationLabel]
            .filter((value): value is string => Boolean(value && value.trim()))
            .join(' • ') || `${album.photos.length} prints`}
        </p>
        {album.soundtrack ? (
          <p className="placard-track">
            {album.soundtrack.artist ?? 'YouTube'} — {album.soundtrack.title ?? 'Soundtrack'}
          </p>
        ) : null}
      </button>

      {ordered.map((photo, index) => {
        const cell = grid.photos[index];
        if (!cell) return null;
        const frame = fitFrameInCell(photo.aspectRatio);
        const lit = lightingVars.get(galleryLightingKey(album.id, 'print', index));
        const dimmed = tier === 'print' && focusedPhotoId !== null && photo.id !== focusedPhotoId;
        const placeholder = thumbHashUrl(photo);

        return (
          <button
            key={photo.id}
            type="button"
            className={`photo-frame${dimmed ? ' is-dimmed' : ''}${
              focusedPhotoId === photo.id ? ' is-focused' : ''
            }`}
            style={{
              ...islandRectStyle(album.bounds, cell.x, cell.y, frame),
              ...lit,
            }}
            onClick={() => {
              if (wasDragged()) return;
              onSelectPhoto(album.id, photo.id);
            }}
            aria-label={photoAlt(album, photo, index)}
            title={photoAlt(album, photo, index)}
          >
            <span
              className="photo-frame-inner"
              style={{
                backgroundColor: photo.dominantColor ?? undefined,
                backgroundImage: placeholder ? `url(${placeholder})` : undefined,
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={lodUrl(photo, lodWidth)}
                alt=""
                loading="lazy"
                decoding="async"
                draggable={false}
                width={Math.round(frame.width * 100)}
                height={Math.round(frame.height * 100)}
              />
            </span>
          </button>
        );
      })}

      <SoundtrackPlaque album={album} tier={tier} />
    </>
  );
}
