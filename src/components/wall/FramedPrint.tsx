'use client';

/**
 * Recessed archival print frame.
 *
 * Owns the local pointer hover tilt and `.photo-sheen` glare on its own
 * `<button>`, plus the `.photo-cell` grid slot. Camera ownership, tier
 * resolution and drag suppression stay in `GalleryCanvas`; `wasDragged()`
 * keeps a completed pan from firing the click.
 *
 * On coarse-pointer devices `useGyroTilt` feeds only the focused Print Focus
 * print the same normalized `(nx, ny)` space the mouse uses, imperatively (no
 * React state per sensor tick): the frame tilts and lifts, its cast shadow
 * shifts, and its sheen sweeps. Album View never subscribes — coarse-pointer
 * Album View sheen is CSS-off. `PrintSharpOverlay` mirrors the focused frame's
 * computed transform and sheen every rAF, so it needs no changes here.
 */

import { useCallback, useEffect, useRef } from 'react';

import type { WallPhoto } from '@/lib/layout/types';

import type { TiltVector } from './gyroTilt';
import { handoffDebug } from './handoffDebug';
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
    // A hand-off still needs the outgoing tilt to unwind through
    // `--focus-w`; `GalleryCanvas` clears these when the hand-off ends.
    if (frameElement.classList.contains('is-handoff')) return;
    frameElement.style.transform = '';
    frameElement.style.removeProperty('--gyro-rx');
    frameElement.style.removeProperty('--gyro-ry');
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
    // Only Print Focus subscribes on coarse pointers. Album View sheen is
    // CSS-off, so a per-print sensor subscription there would be pure churn.
    if (tier !== 'print' || !focused) return undefined;

    // Cache the sheen node once per subscription: the callback runs at the
    // sensor rate (60–120Hz across many mounted prints), so a per-tick
    // `querySelector` would be pure DOM churn. `resetGyroStyles` still
    // re-queries on cleanup.
    const sheen = frameRef.current?.querySelector<HTMLElement>('.photo-sheen') ?? null;

    // Last strings written by this subscription. A resting phone still emits
    // micro-tilts, and re-assigning an identical inline style forces a style
    // recalc, so every write is compared against the previous formatted value.
    let lastRotX: string | null = null;
    let lastRotY: string | null = null;
    let lastTiltSx: string | null = null;
    let lastTiltSy: string | null = null;
    let lastSheenTransform: string | null = null;

    const unsubscribe = gyroSubscribe((tilt: TiltVector) => {
      const frameElement = frameRef.current;
      if (!frameElement) return;
      const { nx, ny } = tilt;
      handoffDebug.gyro(tilt);

      // ±4° at ±0.5, same curve as the mouse hover path in Print Focus. CSS
      // composes the rotation with `--focus-w`, so the hand-off can unwind it.
      const rotY = nx * 8;
      const rotX = -ny * 8;
      const nextRotY = rotY.toFixed(2);
      if (nextRotY !== lastRotY) {
        frameElement.style.setProperty('--gyro-ry', nextRotY);
        lastRotY = nextRotY;
      }
      const nextRotX = rotX.toFixed(2);
      if (nextRotX !== lastRotX) {
        frameElement.style.setProperty('--gyro-rx', nextRotX);
        lastRotX = nextRotX;
      }
      const tiltSx = `${(-rotY * 2.4).toFixed(2)}px`;
      if (tiltSx !== lastTiltSx) {
        frameElement.style.setProperty('--tilt-sx', tiltSx);
        lastTiltSx = tiltSx;
      }
      const tiltSy = `${(rotX * 2.4).toFixed(2)}px`;
      if (tiltSy !== lastTiltSy) {
        frameElement.style.setProperty('--tilt-sy', tiltSy);
        lastTiltSy = tiltSy;
      }
      if (sheen) {
        const sheenTransform = `translate3d(${(-nx * 38).toFixed(1)}%, ${(-ny * 38).toFixed(1)}%, 0)`;
        if (sheenTransform !== lastSheenTransform) {
          sheen.style.transform = sheenTransform;
          lastSheenTransform = sheenTransform;
        }
        // Opacity is composed in CSS as `0.92 · var(--focus-w, 1)`.
      }
    });

    return () => {
      unsubscribe();
      // The outgoing print's subscription tears down at the tap, before the
      // parent focus effect has marked `.is-handoff`. Re-check on the next
      // frame and keep the tilt alive for the hand-off to unwind.
      if (typeof requestAnimationFrame === 'function') {
        requestAnimationFrame(() => resetGyroStyles());
      } else {
        resetGyroStyles();
      }
      lastRotX = null;
      lastRotY = null;
      lastTiltSx = null;
      lastTiltSy = null;
      lastSheenTransform = null;
    };
  }, [gyroSubscribe, tier, focused, resetGyroStyles]);

  return (
    <div className={`photo-cell${focused ? ' is-focused-cell' : ''}`}>
      <button
        type="button"
        ref={frameRef}
        data-photo-id={photo.id}
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
        <span className="photo-shadow-rest" aria-hidden="true" />
        <span className="photo-shadow-focus" aria-hidden="true" />
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
        <span className="photo-dim" aria-hidden="true" />
      </button>
    </div>
  );
}
