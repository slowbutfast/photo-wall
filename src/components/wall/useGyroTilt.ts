'use client';

/**
 * Capability-gated gyroscope driver for the wall's mobile glare.
 *
 * Everything that can be wrong is framework-free and unit-tested:
 *
 * - `createGyroController(adapter, onTilt)` owns the sensor lifecycle. It
 *   attaches `deviceorientation` listeners only on `(pointer: coarse)` devices,
 *   only outside `prefers-reduced-motion: reduce`, and only in `print` focus
 *   (`tier === 'print' && focusedPhotoId !== null`). Album (`album`) and
 *   overview (`macro`) tiers attach nothing: on coarse pointers Album View
 *   sheen is CSS-off. Readings are throttled to one `requestAnimationFrame` per
 *   burst and emitted imperatively through `onTilt` — never through React
 *   state, because `deviceorientation` fires at 60–120Hz across 12–20 mounted
 *   prints.
 * - The first valid finite sample after entering Print Focus becomes the
 *   relative baseline; `tier`, `focusedPhotoId` and live `screen.orientation`
 *   changes reset the baseline and smoother, and announce an explicit `{ 0, 0 }`
 *   only when a real tilt has been emitted since the previous reset.
 * - Once listening with a baseline, the controller tracks **stillness** on the
 *   unclamped device-frame tilt through an injected adapter timer. A still
 *   window of `RECENTER_STILL_MS` triggers a **recentre**: the latest reading
 *   becomes the new entry baseline and the print **glides** home with
 *   `RECENTER_GLIDE_TAU_MS`, driven by rAF so it completes even without further
 *   sensor events. Any reading beyond the stillness band hands control straight
 *   back to the hand at the tracking tau.
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

import {
  DEFAULT_GYRO_TAU_MS,
  GLIDE_SETTLE_EPS,
  RECENTER_GLIDE_TAU_MS,
  RECENTER_STILL_BAND_DEG,
  RECENTER_STILL_MS,
  relativeDeviceTilt,
  screenTiltFromDevice,
  smoothTilt,
  type DeviceTilt,
  type GyroSample,
  type TiltVector,
} from './gyroTilt';
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

/** One raw `deviceorientation` reading; any axis may be missing. */
export interface GyroReading {
  /** W3C `double?`: `null`/absent means the platform cannot provide yaw. */
  alpha?: number | null;
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
  /** One-shot timer, so stillness is measured by wall time, not event arrival. */
  setTimer(callback: () => void, ms: number): number;
  clearTimer(handle: number): void;
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
  /** Latest valid reading: the recentre target and every glide frame's input. */
  let lastReading: GyroSample | null = null;
  /** Device-frame tilt at the start of the current stillness window. */
  let stillAnchor: DeviceTilt | null = null;
  let stillTimer: number | null = null;
  /** Whether the smoother is easing home after a recentre. */
  let gliding = false;
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

  const clearStillTimer = () => {
    if (stillTimer !== null) {
      adapter.clearTimer(stillTimer);
      stillTimer = null;
    }
  };

  /**
   * Stillness timer callback: rebase the entry baseline on the latest reading
   * and start the glide. `current` and `lastEmitted` are untouched, so there is
   * no snap and no `{ 0, 0 }` announcement. The timer is not re-armed; only
   * breaking the stillness band starts the next window.
   */
  const recentre = () => {
    stillTimer = null;
    if (disposed || !listening || lastReading === null) return;

    baseline = lastReading;
    stillAnchor = { aboutX: 0, aboutY: 0 };
    // Nothing has reached `onTilt` since the last reset, so there is no pose to
    // unwind. Rebase quietly and skip the glide: a settle emit would otherwise
    // flash the sheen from its CSS rest opacity to the active inline opacity.
    if (!hasEmittedSinceReset) return;
    gliding = true;
    pending = lastReading;
    if (frame === null) frame = adapter.requestFrame(tick);
  };

  const armStillTimer = () => {
    clearStillTimer();
    stillTimer = adapter.setTimer(recentre, RECENTER_STILL_MS);
  };

  /** Forget the entry baseline and every derived value; optionally tell sinks. */
  const reset = (announce: boolean) => {
    // Only the *first* reset with real tilt since the last reset may announce:
    // a device that never streamed has no pose to unwind.
    const shouldAnnounce = announce && hasEmittedSinceReset;
    cancelPending();
    clearStillTimer();
    hasEmittedSinceReset = false;
    baseline = null;
    stillAnchor = null;
    gliding = false;
    lastReading = null;
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
    lastReading = reading;

    const screenAngle = adapter.getScreenAngle();
    lastScreenAngle = screenAngle;

    const deviceTilt = relativeDeviceTilt(reading, baseline);

    // Stillness runs before smoothing, on unclamped device-frame degrees: a
    // saturated pose still counts as still, and a band break returns to the
    // tracking tau on this same tick.
    const brokeBand =
      stillAnchor === null ||
      Math.abs(deviceTilt.aboutX - stillAnchor.aboutX) > RECENTER_STILL_BAND_DEG ||
      Math.abs(deviceTilt.aboutY - stillAnchor.aboutY) > RECENTER_STILL_BAND_DEG;
    if (brokeBand) {
      stillAnchor = deviceTilt;
      gliding = false;
      armStillTimer();
    }

    const target = screenTiltFromDevice(deviceTilt, screenAngle);
    current = smoothTilt(
      current,
      target,
      dtMs,
      gliding ? RECENTER_GLIDE_TAU_MS : DEFAULT_GYRO_TAU_MS,
    );

    if (gliding) {
      const settled =
        Math.max(Math.abs(current.nx - target.nx), Math.abs(current.ny - target.ny)) <
        GLIDE_SETTLE_EPS;
      if (settled) {
        // The final settle emit bypasses `MIN_EMIT_DELTA`, so the print lands
        // exactly at rest instead of within a dead band of it. Collapse the
        // `atan2` round-off from a near-identity rotation to literal zero.
        current = {
          nx: Math.abs(target.nx) < 1e-9 ? 0 : target.nx,
          ny: Math.abs(target.ny) < 1e-9 ? 0 : target.ny,
        };
        hasEmittedSinceReset = true;
        gliding = false;
        emit(current);
        return;
      }
      pending = lastReading;
      if (frame === null) frame = adapter.requestFrame(tick);
    }

    if (
      Math.abs(current.nx - lastEmitted.nx) + Math.abs(current.ny - lastEmitted.ny) >
      MIN_EMIT_DELTA
    ) {
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

    pending = {
      alpha:
        typeof reading.alpha === 'number' && Number.isFinite(reading.alpha) ? reading.alpha : null,
      beta: reading.beta,
      gamma: reading.gamma,
    };
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
    clearStillTimer();
    gliding = false;
    stillAnchor = null;
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

    // Print focus is the only tier that physically tilts on coarse pointers.
    // Album View (and macro/overview) must attach nothing: the per-print sheen
    // is CSS-off there, so a live sensor would only burn battery and wakeups.
    if (!capable || tier !== 'print' || focusedPhotoId === null) {
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
        listener({ alpha: event.alpha, beta: event.beta, gamma: event.gamma });
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
    setTimer(callback, ms) {
      return window.setTimeout(callback, ms);
    },
    clearTimer(handle) {
      window.clearTimeout(handle);
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
