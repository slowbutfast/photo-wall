'use client';

/**
 * Recessed archival print frame.
 *
 * Owns the local pointer hover tilt and `.photo-sheen` glare on its own
 * `<button>`, plus the `.photo-cell` grid slot. Camera ownership, tier
 * resolution and drag suppression stay in `GalleryCanvas`; `wasDragged()`
 * keeps a completed pan from firing the click.
 */

import type { WallPhoto } from '@/lib/layout/types';

import { prefetchPrintImage } from './printImagePrefetch';
import { PRINT_FOCUS_LOD_WIDTH, type ZoomTier } from './zoomTier';

export interface FramedPrintProps {
  albumId: string;
  albumTitle: string;
  photo: WallPhoto;
  index: number;
  /** Frame box in island-local CSS pixels. */
  frameSize: { width: number; height: number };
  lodUrl: (photo: WallPhoto, longestEdge: number) => string;
  lodWidth: number;
  tier: ZoomTier;
  scale: number;
  focused: boolean;
  albumFocused?: boolean;
  /** Per-print `--lit*` custom properties from `playgroundLighting`. */
  lightingVars?: Record<string, string>;
  onSelectAlbum: (albumId: string) => void;
  onSelectPhoto: (albumId: string, photoId: string) => void;
  wasDragged: () => boolean;
}

export default function FramedPrint({
  albumId,
  albumTitle,
  photo,
  index,
  frameSize,
  lodUrl,
  lodWidth,
  tier,
  scale,
  focused,
  albumFocused = false,
  lightingVars,
  onSelectAlbum,
  onSelectPhoto,
  wasDragged,
}: FramedPrintProps) {
  return (
    <div className="photo-cell">
      <button
        type="button"
        className={`photo-frame is-lit${focused ? ' focused' : ''}`}
        style={{
          width: frameSize.width,
          height: frameSize.height,
          ...(lightingVars ?? {}),
        }}
        onClick={(event) => {
          event.stopPropagation();
          if (wasDragged()) return;
          if (tier === 'macro' || (scale < 0.52 && !albumFocused)) onSelectAlbum(albumId);
          else onSelectPhoto(albumId, photo.id);
        }}
        onPointerEnter={() => {
          // Warm the full-resolution file so a click lands on a sharp print.
          if (tier !== 'macro' && albumFocused) prefetchPrintImage(lodUrl(photo, PRINT_FOCUS_LOD_WIDTH));
        }}
        onPointerMove={(event) => {
          if (wasDragged()) return;
          const frameElement = event.currentTarget;
          const isFocused = frameElement.classList.contains('focused');
          if (tier === 'print' && !isFocused) return;
          const rect = frameElement.getBoundingClientRect();
          const nx = (event.clientX - rect.left) / rect.width - 0.5;
          const ny = (event.clientY - rect.top) / rect.height - 0.5;
          const maxTilt = isFocused ? Math.min(4, 5 * 0.75) : 5;
          const liftZ = isFocused ? 58 : 36;
          const rotY = nx * maxTilt * 2;
          const rotX = -ny * maxTilt * 2;
          frameElement.style.transform = `translateZ(${liftZ}px) rotateY(${rotY.toFixed(2)}deg) rotateX(${rotX.toFixed(2)}deg)`;
          frameElement.style.setProperty('--tilt-sx', `${(-rotY * 2.4).toFixed(2)}px`);
          frameElement.style.setProperty('--tilt-sy', `${(rotX * 2.4).toFixed(2)}px`);
          const sheen = frameElement.querySelector<HTMLElement>('.photo-sheen');
          if (sheen) {
            sheen.style.transform = `translate3d(${(-nx * 38).toFixed(1)}%, ${(-ny * 38).toFixed(1)}%, 0)`;
            sheen.style.opacity = '0.92';
          }
        }}
        onPointerLeave={(event) => {
          const frameElement = event.currentTarget;
          frameElement.style.transform = frameElement.classList.contains('focused')
            ? 'translateZ(54px)'
            : '';
          frameElement.style.removeProperty('--tilt-sx');
          frameElement.style.removeProperty('--tilt-sy');
          const sheen = frameElement.querySelector<HTMLElement>('.photo-sheen');
          if (sheen) {
            sheen.style.transform = '';
            sheen.style.opacity = '';
          }
        }}
        aria-label={`${albumTitle}, print ${index + 1}`}
        title={`${albumTitle}, print ${index + 1}`}
      >
        <span className="photo-window">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            className="photo-img"
            src={lodUrl(photo, focused ? PRINT_FOCUS_LOD_WIDTH : lodWidth)}
            alt=""
            loading="lazy"
            decoding="async"
            draggable={false}
          />
          <span className="photo-paper-grain" />
          <span className="photo-sheen" />
        </span>
      </button>
    </div>
  );
}
