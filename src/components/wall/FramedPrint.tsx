'use client';

/**
 * Recessed archival print frame.
 *
 * Owns the local pointer hover tilt and `.photo-sheen` glare on its own
 * `<button>`, plus the `.photo-cell` grid slot. Camera ownership, tier
 * resolution and drag suppression stay in `GalleryCanvas`; `wasDragged()`
 * keeps a completed pan from firing the click.
 *
 * On coarse-pointer devices `useGyroTilt` feeds this print the same normalized
 * `(nx, ny)` space the mouse uses, imperatively (no React state per sensor
 * tick): Album View sweeps the sheen only, Print Focus also tilts the frame,
 * lifts it and shifts its cast shadow. `PrintSharpOverlay` mirrors the focused
 * frame's computed transform and sheen every rAF, so it needs no changes here.
 */

import { useCallback, useEffect, useRef } from 'react';

import type { WallPhoto } from '@/lib/layout/types';

import type { TiltVector } from './gyroTilt';
import { prefetchPrintImage } from './printImagePrefetch';
import type { GyroPermissionRequester, GyroSubscribe } from './useGyroTilt';
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
  /** Imperative smoothed gyro tilt feed; omitted on desktop-only renders. */
  gyroSubscribe?: GyroSubscribe;
  /** iOS 13+ motion permission prompt, fired from the Print Focus tap. */
  requestGyroPermission?: GyroPermissionRequester;
}

/** Album View uses 30% of the Print Focus sheen travel: 38% * 0.3 = 11.4%. */
const ALBUM_SHEEN_PERCENT = 38 * 0.3;

function isCoarsePointer(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia('(pointer: coarse)').matches;
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
  gyroSubscribe,
  requestGyroPermission,
}: FramedPrintProps) {
  const frameRef = useRef<HTMLButtonElement>(null);

  /** Undo every gyro-written inline style so CSS and the mouse path own them again. */
  const resetGyroStyles = useCallback(() => {
    const frameElement = frameRef.current;
    if (!frameElement) return;
    frameElement.style.transform = '';
    frameElement.style.removeProperty('--tilt-sx');
    frameElement.style.removeProperty('--tilt-sy');
    const sheen = frameElement.querySelector<HTMLElement>('.photo-sheen');
    if (sheen) {
      sheen.style.transform = '';
      sheen.style.opacity = '';
    }
  }, []);

  useEffect(() => {
    if (!gyroSubscribe) return undefined;
    if (tier === 'macro') return undefined;
    // Only the focused print physically tilts in Print Focus; siblings are still.
    if (tier === 'print' && !focused) return undefined;

    const unsubscribe = gyroSubscribe((tilt: TiltVector) => {
      const frameElement = frameRef.current;
      if (!frameElement) return;
      const sheen = frameElement.querySelector<HTMLElement>('.photo-sheen');
      const { nx, ny } = tilt;

      if (tier === 'print') {
        // ±4° at ±0.5, same curve as the mouse hover path in Print Focus.
        const rotY = nx * 8;
        const rotX = -ny * 8;
        frameElement.style.transform = `translateZ(58px) rotateY(${rotY.toFixed(2)}deg) rotateX(${rotX.toFixed(2)}deg)`;
        frameElement.style.setProperty('--tilt-sx', `${(-rotY * 2.4).toFixed(2)}px`);
        frameElement.style.setProperty('--tilt-sy', `${(rotX * 2.4).toFixed(2)}px`);
        if (sheen) {
          sheen.style.transform = `translate3d(${(-nx * 38).toFixed(1)}%, ${(-ny * 38).toFixed(1)}%, 0)`;
          sheen.style.opacity = '0.92';
        }
        return;
      }

      // Album View: glare only — frames and cast shadows never move.
      if (sheen) {
        sheen.style.transform = `translate3d(${(-nx * ALBUM_SHEEN_PERCENT).toFixed(1)}%, ${(-ny * ALBUM_SHEEN_PERCENT).toFixed(1)}%, 0)`;
      }
    });

    return () => {
      unsubscribe();
      resetGyroStyles();
    };
  }, [gyroSubscribe, tier, focused, resetGyroStyles]);

  return (
    <div className="photo-cell">
      <button
        type="button"
        ref={frameRef}
        className={`photo-frame is-lit${focused ? ' focused' : ''}`}
        style={{
          width: frameSize.width,
          height: frameSize.height,
          ...(lightingVars ?? {}),
        }}
        onClick={(event) => {
          event.stopPropagation();
          if (wasDragged()) return;
          if (tier === 'macro' || (scale < 0.52 && !albumFocused)) {
            onSelectAlbum(albumId);
            return;
          }
          onSelectPhoto(albumId, photo.id);
          // iOS 13+ only hands out motion data if the prompt is answered inside
          // the user-gesture stack, so ask on the tap that opens Print Focus.
          // One prompt per session; denied/unsupported stays silent.
          if (isCoarsePointer()) void requestGyroPermission?.();
        }}
        onPointerEnter={() => {
          // Warm the full-resolution file so a click lands on a sharp print.
          if (tier !== 'macro' && albumFocused) prefetchPrintImage(lodUrl(photo, PRINT_FOCUS_LOD_WIDTH));
        }}
        onPointerMove={(event) => {
          // Tilt, lift and sheen are hover affordances: touch and pen taps must
          // never leave a print frozen mid-tilt after the finger lifts.
          if (event.pointerType !== 'mouse') return;
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
          // Only the mouse ever applies a tilt, so nothing to unwind on touch.
          if (event.pointerType !== 'mouse') return;
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
