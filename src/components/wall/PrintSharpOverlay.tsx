'use client';

/**
 * Crisp full-resolution layer for the focused print.
 *
 * The wall is zoomed with a CSS `scale()` on `.wall-world`, and the focused
 * frame sits on a 3D layer (`translateZ` + `perspective`). Safari and Firefox
 * paint such a layer once at its unzoomed size and then stretch the bitmap, so
 * even a 2048px `<img>` looks soft. This component draws a second `<img>` of
 * the same (cached) file *outside* the scaled world, at its real on-screen
 * size, so the browser decodes and paints it at device resolution.
 *
 * Geometry is read from the live DOM while a print is focused: the frame's
 * computed transform (hover tilt, lift) is mirrored with its translation scaled
 * by the world scale, and the sheen is copied over, so the overlay lines up
 * with the in-world frame, including during the camera flight.
 *
 * Syncing is event-driven (`printSharpOverlaySync`): camera motion, viewport
 * resize, focus/hover, and gyro tilt wake it, and focus/hover/tilt holds a
 * fixed `300 ms` settling tail so the desktop `transform 0.24s` + `padding
 * 0.25s` transitions never ghost. At rest the scheduler parks at `0` rAF/s and
 * unchanged inline styles are never rewritten.
 */

import { useEffect, useRef, type RefObject } from 'react';

import { handoffDebug } from './handoffDebug';
import { createOverlaySyncScheduler } from './printSharpOverlaySync';
import type { GyroSubscribe } from './useGyroTilt';

/** `.photo-frame` runs `transform 0.24s` and `padding 0.25s`; hold 50 ms past. */
const SETTLE_TAIL_MS = 300;

interface PrintSharpOverlayProps {
  containerRef: RefObject<HTMLElement | null>;
  /** True only in Print Focus. */
  active: boolean;
  /** The parent keys this component by photo id, one instance per participant. */
  photoId: string | null;
  /** Full-resolution URL of the focused print, known the moment focus starts. */
  src: string | null;
  /** Camera-motion wake hook owned by `GalleryCanvas`'s rAF loop. */
  cameraWakeRef?: RefObject<(() => void) | null>;
  /** Imperative smoothed gyro tilt feed (coarse pointers). */
  gyroSubscribe?: GyroSubscribe;
  /** Current focus weight for this print (`--focus-w`); 1 at rest. */
  getWeight?: (photoId: string) => number;
}

export default function PrintSharpOverlay({
  containerRef,
  active,
  photoId,
  src,
  cameraWakeRef,
  gyroSubscribe,
  getWeight,
}: PrintSharpOverlayProps) {
  const boxRef = useRef<HTMLDivElement>(null);
  const readyRef = useRef(false);
  // Late image loads must still wake the scheduler (the tail may already have
  // parked); `onLoad` fires outside the effect.
  const wakeRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!active || !photoId) return undefined;
    const boxAtMount = boxRef.current;

    // Resolved DOM refs. Re-queried only when the cached node disconnects; a
    // per-frame `querySelector` chain was the bulk of Print Focus's forced
    // layouts.
    const refs = {
      container: null as HTMLElement | null,
      frame: null as HTMLElement | null,
      cell: null as HTMLElement | null,
      win: null as HTMLElement | null,
      sheenIn: null as HTMLElement | null,
      sheenOut: null as HTMLElement | null,
      outImg: null as HTMLImageElement | null,
    };

    // Last formatted values written by this effect. Identical strings are
    // skipped so a resting print never dirties the layer tree.
    const last = {
      width: null as string | null,
      height: null as string | null,
      transformOrigin: null as string | null,
      transform: null as string | null,
      sheenTransform: null as string | null,
      sheenOpacity: null as string | null,
      opacity: null as string | null,
    };

    const coarsePointer =
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(pointer: coarse)').matches;
    let lastHandoff: boolean | null = null;
    let lastLive: boolean | null = null;

    const sync = () => {
      const box = boxRef.current;
      if (!box) return;

      let container = refs.container;
      if (!container || !container.isConnected) {
        container = containerRef.current;
        refs.container = container;
        refs.frame = null;
      }

      let frame = refs.frame;
      if (!frame || !frame.isConnected) {
        frame = photoId
          ? container?.querySelector<HTMLElement>(`.photo-frame[data-photo-id="${photoId}"]`) ?? null
          : null;
        refs.frame = frame;
        refs.cell = frame?.parentElement ?? null;
        refs.win = frame?.querySelector<HTMLElement>('.photo-window') ?? null;
        refs.sheenIn = refs.win?.querySelector<HTMLElement>('.photo-sheen') ?? null;
      }
      if (!refs.sheenOut) refs.sheenOut = box.querySelector<HTMLElement>('.photo-sheen');
      if (!refs.outImg) refs.outImg = box.querySelector<HTMLImageElement>('img.print-sharp-img');

      // Mirror the hand-off so the 0.14 s opacity transition is bypassed while
      // `--focus-w` drives the crossfade every frame.
      const handoff = frame?.classList.contains('is-handoff') ?? false;
      if (handoff !== lastHandoff) {
        box.classList.toggle('is-handoff', handoff);
        lastHandoff = handoff;
      }

      const cell = refs.cell;
      const win = refs.win;
      if (!container || !frame || !cell || !win || cell.offsetWidth === 0) {
        box.classList.remove('is-live');
        if (last.opacity !== '0') {
          box.style.opacity = '0';
          last.opacity = '0';
        }
        return;
      }

      const cellRect = cell.getBoundingClientRect();
      const containerRect = container.getBoundingClientRect();
      const scale = cellRect.width / cell.offsetWidth;

      // Window box inside the frame (layout px, border-box coordinates).
      const windowWidth = win.offsetWidth;
      const windowHeight = win.offsetHeight;
      const dx = frame.clientLeft + win.offsetLeft + windowWidth / 2 - frame.offsetWidth / 2;
      const dy = frame.clientTop + win.offsetTop + windowHeight / 2 - frame.offsetHeight / 2;

      const width = `${windowWidth * scale}px`;
      if (width !== last.width) {
        box.style.width = width;
        last.width = width;
      }
      const height = `${windowHeight * scale}px`;
      if (height !== last.height) {
        box.style.height = height;
        last.height = height;
      }
      const originX = scale * (windowWidth / 2 - dx);
      const originY = scale * (windowHeight / 2 - dy);
      const transformOrigin = `${originX}px ${originY}px`;
      if (transformOrigin !== last.transformOrigin) {
        box.style.transformOrigin = transformOrigin;
        last.transformOrigin = transformOrigin;
      }

      const centerX = cellRect.left + cellRect.width / 2 - containerRect.left;
      const centerY = cellRect.top + cellRect.height / 2 - containerRect.top;

      let matrix: DOMMatrix;
      try {
        const computed = getComputedStyle(frame).transform;
        matrix = new DOMMatrix(computed === 'none' ? undefined : computed);
      } catch {
        matrix = new DOMMatrix();
      }
      matrix.m41 *= scale;
      matrix.m42 *= scale;
      matrix.m43 *= scale;
      const perspective = parseFloat(getComputedStyle(cell).perspective) || 1150;
      const transform =
        `translate(${centerX - originX}px, ${centerY - originY}px) ` +
        `perspective(${perspective * scale}px) ${matrix.toString()}`;
      if (transform !== last.transform) {
        box.style.transform = transform;
        last.transform = transform;
      }

      // Mirror the hover / gyro glare. On coarse pointers the sheen opacity is
      // now composed in CSS (`0.92 · --focus-w`), so read it back.
      const sheenIn = refs.sheenIn;
      const sheenOut = refs.sheenOut;
      if (sheenIn && sheenOut) {
        const sheenTransform = coarsePointer
          ? sheenIn.style.transform || getComputedStyle(sheenIn).transform
          : sheenIn.style.transform;
        if (sheenTransform !== last.sheenTransform) {
          sheenOut.style.transform = sheenTransform;
          last.sheenTransform = sheenTransform;
        }
        const sheenOpacity = coarsePointer
          ? getComputedStyle(sheenIn).opacity || sheenIn.style.opacity
          : sheenIn.style.opacity;
        if (sheenOpacity !== last.sheenOpacity) {
          sheenOut.style.opacity = sheenOpacity;
          last.sheenOpacity = sheenOpacity;
        }
      }

      if (refs.outImg?.complete && refs.outImg.naturalWidth > 0) readyRef.current = true;
      const opacity = readyRef.current ? String(getWeight?.(photoId) ?? 1) : '0';
      if (opacity !== last.opacity) {
        box.style.opacity = opacity;
        last.opacity = opacity;
      }
      box.classList.toggle('is-live', readyRef.current);
      if (readyRef.current !== lastLive) {
        lastLive = readyRef.current;
        handoffDebug.overlay(photoId ?? '', readyRef.current);
      }
    };

    const scheduler = createOverlaySyncScheduler(
      {
        requestFrame: (callback) => window.requestAnimationFrame(callback),
        cancelFrame: (handle) => window.cancelAnimationFrame(handle),
        now: () => performance.now(),
      },
      sync,
    );

    const cameraWake = () => scheduler.wake();
    if (cameraWakeRef) cameraWakeRef.current = cameraWake;
    wakeRef.current = cameraWake;
    const unsubscribeGyro = gyroSubscribe?.(() => scheduler.wake(SETTLE_TAIL_MS));

    const container = containerRef.current;
    const wakeWithTail = () => scheduler.wake(SETTLE_TAIL_MS);
    // `pointerleave` does not bubble, so the frame's leaving transition is
    // caught via the bubbling `pointerout` on the container.
    const onPointerActivity = (event: PointerEvent) => {
      const target = event.target as Element | null;
      if (target?.closest?.('.photo-frame.focused')) wakeWithTail();
    };
    const onFocusIn = (event: FocusEvent) => {
      const target = event.target as Element | null;
      if (target?.closest?.('.photo-frame.focused')) wakeWithTail();
    };

    container?.addEventListener('pointermove', onPointerActivity);
    container?.addEventListener('pointerover', onPointerActivity);
    container?.addEventListener('pointerout', onPointerActivity);
    container?.addEventListener('focusin', onFocusIn);

    let resizeObserver: ResizeObserver | null = null;
    if (container && typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(() => scheduler.wake());
      resizeObserver.observe(container);
    }

    // Focus entry animates `transform` and `padding`; track it from the start.
    scheduler.wake(SETTLE_TAIL_MS);

    return () => {
      resizeObserver?.disconnect();
      container?.removeEventListener('pointermove', onPointerActivity);
      container?.removeEventListener('pointerover', onPointerActivity);
      container?.removeEventListener('pointerout', onPointerActivity);
      container?.removeEventListener('focusin', onFocusIn);
      unsubscribeGyro?.();
      if (cameraWakeRef && cameraWakeRef.current === cameraWake) cameraWakeRef.current = null;
      if (wakeRef.current === cameraWake) wakeRef.current = null;
      scheduler.destroy();
      boxAtMount?.classList.remove('is-live');
    };
  }, [active, photoId, containerRef, cameraWakeRef, gyroSubscribe, getWeight]);

  if (!active) return null;

  return (
    <div className="print-sharp-layer" aria-hidden="true">
      <div className="print-sharp-overlay" ref={boxRef}>
        {src ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            className="print-sharp-img"
            src={src}
            alt=""
            draggable={false}
            onLoad={() => {
              readyRef.current = true;
              wakeRef.current?.();
            }}
          />
        ) : null}
        <span className="photo-paper-grain" />
        <span className="photo-sheen" />
      </div>
    </div>
  );
}
