'use client';

/**
 * Capability-gated gyroscope driver for the wall's mobile glare.
 *
 * Everything that can be wrong is framework-free and unit-tested:
 *
 * - `createGyroController(adapter, onTilt)` owns the sensor lifecycle. It
 *   attaches `deviceorientation` listeners only on `(pointer: coarse)` devices,
 *   only outside `prefers-reduced-motion: reduce`, and only outside `macro`
 *   tier. Readings are throttled to one `requestAnimationFrame` per burst and
 *   emitted imperatively through `onTilt` — never through React state, because
 *   `deviceorientation` fires at 60–120Hz across 12–20 mounted prints.
 * - The first valid finite sample after entering `album`/`print` becomes the
 *   relative baseline; `tier`, `focusedPhotoId` and live `screen.orientation`
 *   changes reset the baseline and smoother, and announce an explicit `{ 0, 0 }`
 *   only when a real tilt has been emitted since the previous reset.
 * - `createGyroPermissionRequester()` memoizes iOS 13+
 *   `DeviceOrientationEvent.requestPermission()` for the session and swallows
 *   rejections into `'denied'`; `requestGyroPermission` is the production
 *   no-argument export used inside the Print Focus tap handler.
 *
 * `useGyroTilt(tier, focusedPhotoId)` is the thin React wrapper `GalleryCanvas`
 * calls; it returns a stable `{ subscribe, requestGyroPermission }` handle that
 * is passed down to `FramedPrint`.
 */

import { useCallback, useEffect, useMemo, useRef } from 'react';

import { computeGyroTilt, smoothTilt, type GyroSample, type TiltVector } from './gyroTilt';
import type { ZoomTier } from './zoomTier';

/**
 * Smallest summed per-axis change worth an imperative DOM write.
 *
 * `0.004` normalized ≈ 0.2° of combined movement, above the resting MEMS
 * sensor noise floor (~0.04°) that otherwise emits at 60Hz on a still phone.
 */
const MIN_EMIT_DELTA = 0.004;

const COARSE_POINTER_QUERY = '(pointer: coarse)';
const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

/** One raw `deviceorientation` reading; either axis may be missing. */
export interface GyroReading {
  beta: number | null;
  gamma: number | null;
}

export type GyroTiltListener = (tilt: TiltVector) => void;

/** Unsubscribe handle returned by the hook for `FramedPrint` subscriptions. */
export type GyroSubscribe = (listener: GyroTiltListener) => () => void;

/**
 * The single injection seam: production wires real browser APIs, tests wire a
 * deterministic fake (no `window`, no `rAF`, no sensor globals).
 */
export interface GyroAdapter {
  /** Capability probe, e.g. `matchMedia('(pointer: coarse)').matches`. */
  matchesMedia(query: string): boolean;
  subscribeOrientation(listener: (reading: GyroReading) => void): () => void;
  subscribeScreenOrientation(listener: () => void): () => void;
  /** `screen.orientation.angle`, or `0` when unavailable. */
  getScreenAngle(): number;
  requestFrame(callback: () => void): number;
  cancelFrame(handle: number): void;
  now(): number;
}

export interface GyroController {
  /** Declare the current zoom tier and focused photo. Idempotent. */
  setContext(tier: ZoomTier, focusedPhotoId: string | null): void;
  /** Stop every listener, subscribe and pending frame. */
  destroy(): void;
}

/** `'granted'` also covers platforms without a permission prompt (Android, desktop). */
export type GyroPermissionResult = 'granted' | 'denied';
export type GyroPermissionRequester = () => Promise<GyroPermissionResult>;

function isFiniteReading(reading: GyroReading): reading is GyroSample {
  return (
    typeof reading.beta === 'number' &&
    typeof reading.gamma === 'number' &&
    Number.isFinite(reading.beta) &&
    Number.isFinite(reading.gamma)
  );
}

/**
 * Framework-free sensor controller. `onTilt` is the imperative sink; it is the
 * only outward effect of a sensor tick.
 */
export function createGyroController(
  adapter: GyroAdapter,
  onTilt: GyroTiltListener = () => {},
): GyroController {
  const capable =
    adapter.matchesMedia(COARSE_POINTER_QUERY) &&
    !adapter.matchesMedia(REDUCED_MOTION_QUERY);

  let disposed = false;
  let listening = false;
  let hasContext = false;
  let contextTier: ZoomTier | null = null;
  let contextFocus: string | null = null;

  let baseline: GyroSample | null = null;
  let current: TiltVector = { nx: 0, ny: 0 };
  let lastEmitted: TiltVector = { nx: 0, ny: 0 };
  let lastTickAt: number | null = null;
  let lastScreenAngle: number | null = null;
  let pending: GyroSample | null = null;
  let frame: number | null = null;
  /**
   * Whether a real smoothed tilt has reached `onTilt` since the last reset.
   * Distinguishes "re-center an actively tilting print" from "the context
   * changed on a device that never streamed a sample" (denied permission or
   * no gyroscope): the latter must stay silent and keep the CSS rest pose.
   */
  let hasEmittedSinceReset = false;
  let unsubscribeOrientation: (() => void) | null = null;
  let unsubscribeScreen: (() => void) | null = null;

  const emit = (tilt: TiltVector) => {
    lastEmitted = tilt;
    onTilt(tilt);
  };

  const cancelPending = () => {
    pending = null;
    if (frame !== null) {
      adapter.cancelFrame(frame);
      frame = null;
    }
  };

  /** Forget the entry baseline and every derived value; optionally tell sinks. */
  const reset = (announce: boolean) => {
    // Only the *first* reset with real tilt since the last reset may announce:
    // a device that never streamed has no pose to unwind.
    const shouldAnnounce = announce && hasEmittedSinceReset;
    cancelPending();
    hasEmittedSinceReset = false;
    baseline = null;
    current = { nx: 0, ny: 0 };
    lastTickAt = null;
    lastScreenAngle = adapter.getScreenAngle();
    lastEmitted = { nx: 0, ny: 0 };
    if (shouldAnnounce) emit({ nx: 0, ny: 0 });
  };

  const tick = () => {
    frame = null;
    const reading = pending;
    pending = null;
    if (!reading) return;

    const now = adapter.now();
    const dtMs = lastTickAt === null ? 0 : now - lastTickAt;
    lastTickAt = now;

    if (baseline === null) baseline = reading;

    const screenAngle = adapter.getScreenAngle();
    lastScreenAngle = screenAngle;

    const target = computeGyroTilt(reading, baseline, screenAngle);
    current = smoothTilt(current, target, dtMs);

    if (Math.abs(current.nx - lastEmitted.nx) + Math.abs(current.ny - lastEmitted.ny) > MIN_EMIT_DELTA) {
      hasEmittedSinceReset = true;
      emit(current);
    }
  };

  const handleReading = (reading: GyroReading) => {
    if (disposed || !listening) return;
    if (!isFiniteReading(reading)) return;

    // A rotation whose event we never saw (WebView / older Safari) still rebases.
    if (lastScreenAngle !== null && adapter.getScreenAngle() !== lastScreenAngle) {
      reset(true);
    }

    pending = { beta: reading.beta, gamma: reading.gamma };
    if (frame === null) frame = adapter.requestFrame(tick);
  };

  const handleScreenOrientationChange = () => {
    if (disposed || !listening) return;
    reset(true);
  };

  const attach = () => {
    if (listening) return;
    listening = true;
    unsubscribeOrientation = adapter.subscribeOrientation(handleReading);
    unsubscribeScreen = adapter.subscribeScreenOrientation(handleScreenOrientationChange);
    lastScreenAngle = adapter.getScreenAngle();
  };

  const detach = () => {
    if (!listening) return;
    listening = false;
    unsubscribeOrientation?.();
    unsubscribeScreen?.();
    unsubscribeOrientation = null;
    unsubscribeScreen = null;
    cancelPending();
  };

  const setContext = (tier: ZoomTier, focusedPhotoId: string | null) => {
    if (disposed) return;

    const hadContext = hasContext;
    const wasListening = listening;
    const changed = !hadContext || contextTier !== tier || contextFocus !== focusedPhotoId;
    hasContext = true;
    contextTier = tier;
    contextFocus = focusedPhotoId;

    if (!capable || tier === 'macro') {
      detach();
      if (changed || wasListening) reset(wasListening && hadContext);
      return;
    }

    if (!listening) attach();
    if (changed) reset(hadContext);
  };

  const destroy = () => {
    if (disposed) return;
    disposed = true;
    detach();
    hasContext = false;
  };

  return { setContext, destroy };
}

interface DeviceOrientationEventConstructor {
  requestPermission?: () => Promise<unknown>;
}

/**
 * Reads the platform's `requestPermission` inside a user gesture. iOS 13+
 * only; every other browser returns `null`.
 */
function readDeviceOrientationPermission(): (() => Promise<unknown>) | null {
  if (typeof window === 'undefined') return null;
  const ctor = window.DeviceOrientationEvent as unknown as
    | DeviceOrientationEventConstructor
    | undefined;
  const request = ctor?.requestPermission;
  return typeof request === 'function' ? () => request.call(ctor) : null;
}

/**
 * Session-memoized permission requester. The first call asks the platform and
 * every later call returns the same promise: one native prompt per page load.
 * Rejections (and anything other than `'granted'`) collapse to `'denied'`, so
 * a denied or failed prompt is silent and never an unhandled rejection.
 */
export function createGyroPermissionRequester(
  readRequest: () => (() => Promise<unknown>) | null = readDeviceOrientationPermission,
): GyroPermissionRequester {
  let memo: Promise<GyroPermissionResult> | null = null;

  return () => {
    if (!memo) {
      memo = (async (): Promise<GyroPermissionResult> => {
        const request = readRequest();
        if (!request) return 'granted';
        try {
          const result = await request();
          return result === 'granted' ? 'granted' : 'denied';
        } catch {
          return 'denied';
        }
      })();
    }
    return memo;
  };
}

/** Production export: callable with no arguments, e.g. from a tap handler. */
export const requestGyroPermission: GyroPermissionRequester = createGyroPermissionRequester();

/** Production adapter over the real browser APIs. */
export function createDefaultGyroAdapter(): GyroAdapter {
  return {
    matchesMedia(query) {
      if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
      return window.matchMedia(query).matches;
    },
    subscribeOrientation(listener) {
      const handler = (event: DeviceOrientationEvent) =>
        listener({ beta: event.beta, gamma: event.gamma });
      window.addEventListener('deviceorientation', handler);
      return () => window.removeEventListener('deviceorientation', handler);
    },
    subscribeScreenOrientation(listener) {
      const orientation = typeof screen !== 'undefined' ? screen.orientation : undefined;
      if (orientation && typeof orientation.addEventListener === 'function') {
        orientation.addEventListener('change', listener);
        return () => orientation.removeEventListener('change', listener);
      }
      window.addEventListener('orientationchange', listener);
      return () => window.removeEventListener('orientationchange', listener);
    },
    getScreenAngle() {
      const angle = typeof screen !== 'undefined' ? screen.orientation?.angle : 0;
      return typeof angle === 'number' && Number.isFinite(angle) ? angle : 0;
    },
    requestFrame(callback) {
      return window.requestAnimationFrame(callback);
    },
    cancelFrame(handle) {
      window.cancelAnimationFrame(handle);
    },
    now() {
      return typeof performance !== 'undefined' ? performance.now() : Date.now();
    },
  };
}

/** Stable handle `GalleryCanvas` passes through `AlbumTier` to every print. */
export interface GyroTiltHandle {
  subscribe: GyroSubscribe;
  requestGyroPermission: GyroPermissionRequester;
}

/**
 * React wrapper: one controller per mount, re-targeted whenever the zoom tier
 * or focused photo changes. Subscribers register on a ref-held set, so a child
 * print can subscribe from its own effect *before* this component's effect has
 * created the controller without losing anything.
 */
export function useGyroTilt(tier: ZoomTier, focusedPhotoId: string | null): GyroTiltHandle {
  const listenersRef = useRef<Set<GyroTiltListener>>(new Set());
  const controllerRef = useRef<GyroController | null>(null);
  const tierRef = useRef(tier);
  const focusedPhotoIdRef = useRef(focusedPhotoId);
  tierRef.current = tier;
  focusedPhotoIdRef.current = focusedPhotoId;

  useEffect(() => {
    const controller = createGyroController(createDefaultGyroAdapter(), (tilt) => {
      for (const listener of listenersRef.current) listener(tilt);
    });
    controllerRef.current = controller;
    controller.setContext(tierRef.current, focusedPhotoIdRef.current);

    return () => {
      controller.destroy();
      if (controllerRef.current === controller) controllerRef.current = null;
    };
  }, []);

  useEffect(() => {
    controllerRef.current?.setContext(tier, focusedPhotoId);
  }, [tier, focusedPhotoId]);

  const subscribe = useCallback<GyroSubscribe>((listener) => {
    listenersRef.current.add(listener);
    return () => {
      listenersRef.current.delete(listener);
    };
  }, []);

  return useMemo(() => ({ subscribe, requestGyroPermission }), [subscribe]);
}
