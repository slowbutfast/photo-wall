/**
 * Task 1.2 — gyroscope lifecycle & permission seam
 * (`src/components/wall/useGyroTilt.ts`).
 *
 * The hook itself is a thin React wrapper; every decision that can be wrong
 * lives in the framework-free `createGyroController(adapter, onTilt)` factory
 * and the session-memoized permission requester, both driven here through fake
 * adapters (no React renderer, no real `deviceorientation`/`rAF` globals).
 *
 * Contract from `specs/instanced-photo-renderer` (mobile-render-profile):
 * - listeners exist only on `(pointer: coarse)` devices, outside
 *   `prefers-reduced-motion: reduce`, and ONLY in `print` focus
 *   (`tier === 'print' && focusedPhotoId !== null`) — never in `macro` or
 *   `album` tier;
 * - entering/leaving Print Focus, changing the focused photo, or rotating the
 *   screen resets the entry baseline and smoother and emits an explicit zero;
 * - `null`/`NaN`/`Infinity` readings are dropped without corrupting state;
 * - one rAF per burst of sensor readings; `destroy()` removes everything.
 */

import { describe, expect, it, vi } from 'vitest';

import type { GyroSample, TiltVector } from '../gyroTilt';
import {
  DEFAULT_GYRO_TAU_MS,
  computeGyroTilt,
  smoothTilt,
} from '../gyroTilt';
import {
  createGyroController,
  createGyroPermissionRequester,
  requestGyroPermission,
  type GyroAdapter,
  type GyroController,
  type GyroReading,
} from '../useGyroTilt';

interface FakeAdapterOptions {
  coarse?: boolean;
  reducedMotion?: boolean;
  screenAngle?: number;
}

function createFakeAdapter(options: FakeAdapterOptions = {}) {
  const orientationListeners = new Set<(reading: GyroReading) => void>();
  const screenListeners = new Set<() => void>();
  const frames = new Map<number, () => void>();
  const timers = new Map<number, { due: number; callback: () => void }>();

  let nextHandle = 1;
  let nextTimerHandle = 1;
  let now = 0;
  let screenAngle = options.screenAngle ?? 0;
  let canceledFrames = 0;

  const adapter: GyroAdapter = {
    matchesMedia(query) {
      if (query.includes('prefers-reduced-motion')) return options.reducedMotion === true;
      if (query.includes('pointer: coarse')) return options.coarse !== false;
      return false;
    },
    subscribeOrientation(listener) {
      orientationListeners.add(listener);
      return () => {
        orientationListeners.delete(listener);
      };
    },
    subscribeScreenOrientation(listener) {
      screenListeners.add(listener);
      return () => {
        screenListeners.delete(listener);
      };
    },
    getScreenAngle: () => screenAngle,
    requestFrame(callback) {
      const handle = nextHandle;
      nextHandle += 1;
      frames.set(handle, callback);
      return handle;
    },
    cancelFrame(handle) {
      if (frames.delete(handle)) canceledFrames += 1;
    },
    setTimer(callback, ms) {
      const handle = nextTimerHandle;
      nextTimerHandle += 1;
      timers.set(handle, { due: now + ms, callback });
      return handle;
    },
    clearTimer(handle) {
      timers.delete(handle);
    },
    now: () => now,
  };

  return {
    adapter,
    emitReading(reading: GyroReading) {
      for (const listener of [...orientationListeners]) listener(reading);
    },
    emitScreenOrientationChange() {
      for (const listener of [...screenListeners]) listener();
    },
    flushFrames() {
      const pending = [...frames.values()];
      frames.clear();
      for (const callback of pending) callback();
    },
    advance(ms: number) {
      now += ms;
    },
    /** Advance wall time and fire every due timer in due order. */
    advanceTimers(ms: number) {
      const target = now + ms;
      for (;;) {
        let dueHandle: number | null = null;
        let dueAt = Number.POSITIVE_INFINITY;
        for (const [handle, timer] of timers) {
          if (timer.due <= target && timer.due < dueAt) {
            dueAt = timer.due;
            dueHandle = handle;
          }
        }
        if (dueHandle === null) break;
        const timer = timers.get(dueHandle);
        if (!timer) break;
        timers.delete(dueHandle);
        now = timer.due;
        timer.callback();
      }
      now = target;
    },
    setScreenAngle(angle: number) {
      screenAngle = angle;
    },
    orientationListenerCount: () => orientationListeners.size,
    screenListenerCount: () => screenListeners.size,
    pendingFrameCount: () => frames.size,
    pendingTimerCount: () => timers.size,
    canceledFrameCount: () => canceledFrames,
  };
}

type FakeAdapter = ReturnType<typeof createFakeAdapter>;

/** One sensor reading followed by its rAF flush, `dtMs` after the previous. */
function feed(fake: FakeAdapter, reading: GyroReading, dtMs = 16): void {
  fake.advance(dtMs);
  fake.emitReading(reading);
  fake.flushFrames();
}

/**
 * Repeat the same reading long enough for the time-based smoother to settle.
 * `dtMs = 100` is the smoothing cap, so 40 steps converge to ~1e-19.
 */
function feedConverged(fake: FakeAdapter, reading: GyroReading): void {
  for (let step = 0; step < 40; step += 1) feed(fake, reading, 100);
}

const NEUTRAL: TiltVector = { nx: 0, ny: 0 };

describe('requestGyroPermission', () => {
  it('resolves granted when the platform has no requestPermission (non-iOS / unsupported)', async () => {
    const ask = createGyroPermissionRequester(() => null);

    await expect(ask()).resolves.toBe('granted');
  });

  it('resolves granted and calls requestPermission exactly once per session', async () => {
    const request = vi.fn<() => Promise<unknown>>().mockResolvedValue('granted');
    const ask = createGyroPermissionRequester(() => request);

    await expect(ask()).resolves.toBe('granted');
    await expect(ask()).resolves.toBe('granted');

    expect(request).toHaveBeenCalledTimes(1);
  });

  it('resolves denied when the visitor declines and never re-asks', async () => {
    const request = vi.fn<() => Promise<unknown>>().mockResolvedValue('denied');
    const ask = createGyroPermissionRequester(() => request);

    await expect(ask()).resolves.toBe('denied');
    await expect(ask()).resolves.toBe('denied');

    expect(request).toHaveBeenCalledTimes(1);
  });

  it('swallows a rejected requestPermission() into denied with no unhandled rejection', async () => {
    const request = vi.fn<() => Promise<unknown>>().mockRejectedValue(new Error('NotAllowedError'));
    const ask = createGyroPermissionRequester(() => request);
    const unhandled = vi.fn();
    process.on('unhandledRejection', unhandled);

    try {
      await expect(ask()).resolves.toBe('denied');
      await expect(ask()).resolves.toBe('denied');
      // Let any stray rejection surface before asserting.
      await Promise.resolve();
      expect(unhandled).not.toHaveBeenCalled();
      expect(request).toHaveBeenCalledTimes(1);
    } finally {
      process.off('unhandledRejection', unhandled);
    }
  });

  it('stays callable with no arguments and resolves in a non-browser test environment', async () => {
    await expect(requestGyroPermission()).resolves.toBe('granted');
  });
});

describe('capability gating', () => {
  it('attaches zero listeners on a (pointer: fine) desktop browser', () => {
    const fake = createFakeAdapter({ coarse: false });
    const tilts: TiltVector[] = [];
    const controller = createGyroController(fake.adapter, (tilt) => tilts.push(tilt));

    controller.setContext('album', null);
    controller.setContext('print', 'photo-1');

    expect(fake.orientationListenerCount()).toBe(0);
    expect(fake.screenListenerCount()).toBe(0);

    fake.emitReading({ beta: 60, gamma: 10 });
    fake.flushFrames();
    expect(fake.pendingFrameCount()).toBe(0);
    expect(tilts).toEqual([]);

    controller.destroy();
  });

  it('attaches zero listeners under prefers-reduced-motion: reduce', () => {
    const fake = createFakeAdapter({ coarse: true, reducedMotion: true });
    const tilts: TiltVector[] = [];
    const controller = createGyroController(fake.adapter, (tilt) => tilts.push(tilt));

    controller.setContext('album', null);
    controller.setContext('print', 'photo-1');

    expect(fake.orientationListenerCount()).toBe(0);
    expect(fake.screenListenerCount()).toBe(0);

    fake.emitReading({ beta: 60, gamma: 10 });
    fake.flushFrames();
    expect(tilts).toEqual([]);

    controller.destroy();
  });

  it('attaches zero listeners in album tier (Album View sheen is off on coarse pointers)', () => {
    const fake = createFakeAdapter();
    const controller = createGyroController(fake.adapter);

    controller.setContext('album', null);

    expect(fake.orientationListenerCount()).toBe(0);
    expect(fake.screenListenerCount()).toBe(0);

    controller.destroy();
  });

  it('attaches exactly one orientation and one screen-orientation listener in print focus', () => {
    const fake = createFakeAdapter();
    const controller = createGyroController(fake.adapter);

    controller.setContext('print', 'photo-1');

    expect(fake.orientationListenerCount()).toBe(1);
    expect(fake.screenListenerCount()).toBe(1);

    controller.destroy();
  });

  it('detaches when Print Focus is entered without a focused photo', () => {
    const fake = createFakeAdapter();
    const controller = createGyroController(fake.adapter);

    controller.setContext('print', 'photo-1');
    expect(fake.orientationListenerCount()).toBe(1);

    controller.setContext('print', null);

    expect(fake.orientationListenerCount()).toBe(0);
    expect(fake.screenListenerCount()).toBe(0);

    controller.destroy();
  });
});

describe('tilt pipeline', () => {
  it('captures the first valid sample as the relative baseline', () => {
    const fake = createFakeAdapter();
    const tilts: TiltVector[] = [];
    const controller = createGyroController(fake.adapter, (tilt) => tilts.push(tilt));

    controller.setContext('print', 'photo-1');
    feed(fake, { beta: 50, gamma: -8 });

    // The holding angle became neutral; nothing had to be emitted.
    expect(tilts).toEqual([]);

    controller.destroy();
  });

  it('emits wrapped, clamped and smoothed screen-space tilt', () => {
    const fake = createFakeAdapter({ screenAngle: 0 });
    const tilts: TiltVector[] = [];
    const controller = createGyroController(fake.adapter, (tilt) => tilts.push(tilt));

    controller.setContext('print', 'photo-1');
    feed(fake, { beta: 50, gamma: -8 });
    feedConverged(fake, { beta: 61, gamma: -8 });

    const last = tilts.at(-1);
    expect(last).toBeDefined();
    expect(last?.nx).toBeCloseTo(0, 6);
    expect(last?.ny).toBeCloseTo(0.25, 2);

    controller.destroy();
  });

  it('ignores sub-dead-band jitter while an intentional tilt still emits', () => {
    const fake = createFakeAdapter({ screenAngle: 0 });
    const tilts: TiltVector[] = [];
    const controller = createGyroController(fake.adapter, (tilt) => tilts.push(tilt));

    controller.setContext('print', 'photo-1');
    feed(fake, { beta: 50, gamma: -8 }); // baseline
    feedConverged(fake, { beta: 50.1, gamma: -8 }); // ~0.00227 normalized, < 0.004
    expect(tilts).toEqual([]);

    feedConverged(fake, { beta: 52, gamma: -8 }); // ~0.045, intentional
    expect(tilts.at(-1)?.ny).toBeGreaterThan(0.004);

    controller.destroy();
  });

  it('throttles a burst of readings into one animation frame', () => {
    const fake = createFakeAdapter();
    const controller = createGyroController(fake.adapter);

    controller.setContext('print', 'photo-1');
    fake.emitReading({ beta: 50, gamma: -8 });
    fake.emitReading({ beta: 51, gamma: -8 });
    fake.emitReading({ beta: 52, gamma: -8 });

    expect(fake.pendingFrameCount()).toBe(1);

    controller.destroy();
  });
});

describe('tier and focus lifecycle', () => {
  it('detaches every listener and emits an explicit zero in macro tier', () => {
    const fake = createFakeAdapter();
    const tilts: TiltVector[] = [];
    const controller = createGyroController(fake.adapter, (tilt) => tilts.push(tilt));

    controller.setContext('print', 'photo-1');
    feed(fake, { beta: 50, gamma: -8 });
    feedConverged(fake, { beta: 61, gamma: -8 });
    expect(tilts.at(-1)?.ny).toBeGreaterThan(0.2);

    // A reading is pending when the tier collapses: it must be dropped.
    fake.emitReading({ beta: 72, gamma: -8 });
    expect(fake.pendingFrameCount()).toBe(1);

    controller.setContext('macro', null);

    expect(fake.orientationListenerCount()).toBe(0);
    expect(fake.screenListenerCount()).toBe(0);
    expect(fake.pendingFrameCount()).toBe(0);
    expect(tilts.at(-1)).toEqual(NEUTRAL);

    const emitted = tilts.length;
    fake.flushFrames();
    expect(tilts).toHaveLength(emitted);

    controller.destroy();
  });

  it('rebases the baseline when re-entering Print Focus so the next sample is neutral', () => {
    const fake = createFakeAdapter();
    const tilts: TiltVector[] = [];
    const controller = createGyroController(fake.adapter, (tilt) => tilts.push(tilt));

    controller.setContext('print', 'photo-1');
    feed(fake, { beta: 50, gamma: -8 });
    feedConverged(fake, { beta: 61, gamma: -8 });
    expect(tilts.at(-1)?.ny).toBeGreaterThan(0.2);

    // Leaving Print Focus detaches the sensor and emits an explicit zero.
    controller.setContext('album', null);
    expect(fake.orientationListenerCount()).toBe(0);
    expect(tilts.at(-1)).toEqual(NEUTRAL);

    // Re-entering Print Focus rebases: the same physical reading is neutral.
    controller.setContext('print', 'photo-1');
    expect(fake.orientationListenerCount()).toBe(1);
    feed(fake, { beta: 61, gamma: -8 }, 16);
    expect(tilts.at(-1)).toEqual(NEUTRAL);

    // Only movement away from the new baseline moves the print again.
    feedConverged(fake, { beta: 72, gamma: -8 });
    expect(tilts.at(-1)?.ny).toBeGreaterThan(0.2);

    controller.destroy();
  });

  it('resets the baseline when the focused photo changes', () => {
    const fake = createFakeAdapter();
    const tilts: TiltVector[] = [];
    const controller = createGyroController(fake.adapter, (tilt) => tilts.push(tilt));

    controller.setContext('print', 'photo-1');
    feed(fake, { beta: 50, gamma: -8 });
    feedConverged(fake, { beta: 61, gamma: -8 });
    expect(tilts.at(-1)?.ny).toBeGreaterThan(0.2);

    controller.setContext('print', 'photo-2');
    expect(tilts.at(-1)).toEqual(NEUTRAL);

    controller.destroy();
  });

  it('does not emit a synthetic zero entering Print Focus from cold with no sensor readings', () => {
    const fake = createFakeAdapter();
    const tilts: TiltVector[] = [];
    const controller = createGyroController(fake.adapter, (tilt) => tilts.push(tilt));

    // Denied motion permission / no gyroscope: the device never streams, so
    // there is no tilt to re-center and no hover pose to hand `FramedPrint`.
    controller.setContext('print', 'photo-1');

    expect(tilts).toEqual([]);
    // The listener lifecycle itself is unchanged.
    expect(fake.orientationListenerCount()).toBe(1);
    expect(fake.screenListenerCount()).toBe(1);

    controller.destroy();
  });

  it('does not emit a synthetic zero crossing album into Print Focus with no sensor readings', () => {
    const fake = createFakeAdapter();
    const tilts: TiltVector[] = [];
    const controller = createGyroController(fake.adapter, (tilt) => tilts.push(tilt));

    controller.setContext('album', null);
    controller.setContext('print', 'photo-1');

    expect(tilts).toEqual([]);

    controller.destroy();
  });

  it('keeps state untouched when the same tier and focus are re-asserted', () => {
    const fake = createFakeAdapter();
    const tilts: TiltVector[] = [];
    const controller = createGyroController(fake.adapter, (tilt) => tilts.push(tilt));

    controller.setContext('print', 'photo-1');
    feed(fake, { beta: 50, gamma: -8 });
    feedConverged(fake, { beta: 61, gamma: -8 });
    const settled = tilts.at(-1);
    const emitted = tilts.length;

    controller.setContext('print', 'photo-1');

    expect(tilts).toHaveLength(emitted);
    expect(tilts.at(-1)).toEqual(settled);

    controller.destroy();
  });
});

describe('live screen-orientation change', () => {
  it('resets the smoother, emits zero, and rebases on the next sample', () => {
    const fake = createFakeAdapter({ screenAngle: 0 });
    const tilts: TiltVector[] = [];
    const controller = createGyroController(fake.adapter, (tilt) => tilts.push(tilt));

    controller.setContext('print', 'photo-1');
    feed(fake, { beta: 50, gamma: -8 });
    feedConverged(fake, { beta: 61, gamma: -8 });
    expect(tilts.at(-1)?.ny).toBeGreaterThan(0.2);

    fake.setScreenAngle(90);
    fake.emitScreenOrientationChange();
    expect(tilts.at(-1)).toEqual(NEUTRAL);
    expect(fake.pendingFrameCount()).toBe(0);

    // The first sample after the rotation is the new neutral — no jump.
    feed(fake, { beta: 61, gamma: -8 }, 16);
    expect(tilts.at(-1)).toEqual(NEUTRAL);

    // 90° landscape remaps the axes: beta is now the horizontal tilt, negated.
    feedConverged(fake, { beta: 72, gamma: -8 });
    expect(tilts.at(-1)?.nx).toBeCloseTo(-0.25, 2);
    expect(tilts.at(-1)?.ny).toBeCloseTo(0, 6);

    controller.destroy();
  });

  it('rebases even if the orientation event never arrives', () => {
    const fake = createFakeAdapter({ screenAngle: 0 });
    const tilts: TiltVector[] = [];
    const controller = createGyroController(fake.adapter, (tilt) => tilts.push(tilt));

    controller.setContext('print', 'photo-1');
    feed(fake, { beta: 50, gamma: -8 });
    feedConverged(fake, { beta: 61, gamma: -8 });

    fake.setScreenAngle(270);
    feed(fake, { beta: 61, gamma: -8 }, 16);

    expect(tilts.at(-1)).toEqual(NEUTRAL);

    controller.destroy();
  });
});

describe('resilience', () => {
  it('ignores null and non-finite readings without corrupting baseline or smoother', () => {
    const fake = createFakeAdapter();
    const tilts: TiltVector[] = [];
    const controller = createGyroController(fake.adapter, (tilt) => tilts.push(tilt));

    controller.setContext('print', 'photo-1');
    feed(fake, { beta: 50, gamma: -8 });

    feed(fake, { beta: null, gamma: 10 }, 16);
    feed(fake, { beta: 50, gamma: null }, 16);
    feed(fake, { beta: Number.NaN, gamma: 10 }, 16);
    feed(fake, { beta: Number.POSITIVE_INFINITY, gamma: -8 }, 16);
    feed(fake, { beta: 50, gamma: Number.NEGATIVE_INFINITY }, 16);

    expect(fake.pendingFrameCount()).toBe(0);
    expect(tilts).toEqual([]);

    // The original baseline still governs: this is +11° relative to beta 50.
    feedConverged(fake, { beta: 61, gamma: -8 });
    expect(tilts.at(-1)?.ny).toBeCloseTo(0.25, 2);
    expect(tilts.every((tilt) => Number.isFinite(tilt.nx) && Number.isFinite(tilt.ny))).toBe(true);

    controller.destroy();
  });
});

describe('destroy', () => {
  it('removes listeners, cancels the pending frame, and ignores later updates', () => {
    const fake = createFakeAdapter();
    const tilts: TiltVector[] = [];
    const controller = createGyroController(fake.adapter, (tilt) => tilts.push(tilt));

    controller.setContext('print', 'photo-1');
    fake.emitReading({ beta: 51, gamma: -8 });
    expect(fake.pendingFrameCount()).toBe(1);

    controller.destroy();

    expect(fake.orientationListenerCount()).toBe(0);
    expect(fake.screenListenerCount()).toBe(0);
    expect(fake.pendingFrameCount()).toBe(0);
    expect(fake.canceledFrameCount()).toBe(1);

    fake.flushFrames();
    expect(tilts).toEqual([]);

    controller.setContext('album', null);
    expect(fake.orientationListenerCount()).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// gyro-relative-recenter: alpha plumbing, stillness recentre and glide.
// ---------------------------------------------------------------------------

const BASE_READING: GyroSample = { beta: 50, gamma: -8 };
/** +10° about the device x axis from `BASE_READING` → `ny ≈ +10/44`. */
const TILTED_X: GyroSample = { beta: 60, gamma: -8 };
/** +10° about the device x axis from `TILTED_X`. */
const TILTED_X_MORE: GyroSample = { beta: 70, gamma: -8 };
/** +20° about the device x axis from `TILTED_X`, far past the stillness band. */
const INTERRUPTED: GyroSample = { beta: 80, gamma: -8 };

function startPrintFocus(options: FakeAdapterOptions = {}) {
  const fake = createFakeAdapter(options);
  const tilts: TiltVector[] = [];
  const controller = createGyroController(fake.adapter, (tilt) => tilts.push(tilt));
  controller.setContext('print', 'photo-1');
  return { fake, controller, tilts };
}

/** Feed the same reading every 100 ms: a hand held inside the band. */
function holdFor(fake: FakeAdapter, reading: GyroReading, ms: number): void {
  const step = 100;
  for (let elapsed = step; elapsed <= ms; elapsed += step) feed(fake, reading, step);
}

/**
 * The recentre recipe from `tests.md`: entry baseline, +10° about device x, a
 * fresh tick every 100 ms through the 3 s still window, then fire the injected
 * stillness timer. Keeping `lastTickAt` fresh means the first glide frame uses
 * a 16 ms dt instead of the 100 ms smoothing cap.
 */
function runStillHold(fake: FakeAdapter): void {
  feed(fake, BASE_READING);
  feed(fake, TILTED_X);
  holdFor(fake, TILTED_X, 3100);
  fake.advanceTimers(0);
}

/** Drive rAF-driven glide frames at 16 ms until the glide stops asking for them. */
function glideToSettle(fake: FakeAdapter, maxFrames = 300): number {
  for (let frames = 0; frames < maxFrames; frames += 1) {
    if (fake.pendingFrameCount() === 0) return frames;
    fake.advance(16);
    fake.flushFrames();
  }
  return maxFrames;
}

describe('alpha reading plumbing', () => {
  it('forwards alpha, so a landscape gimbal crossing stays off the clamp', () => {
    const { fake, controller, tilts } = startPrintFocus();
    feed(fake, { alpha: 0, beta: 50, gamma: 80 });
    for (let step = 0; step < 40; step += 1) {
      feed(fake, { alpha: 180, beta: 130, gamma: -85 }, 100);
    }

    const last = tilts.at(-1);
    expect(last).toBeDefined();
    // +15° about device y: `nx = aboutY / 44`, well inside the ±0.5 clamp.
    expect(last!.nx).toBeGreaterThan(0.33);
    expect(last!.nx).toBeLessThan(0.342);
    expect(Math.abs(last!.ny)).toBeLessThan(0.004);

    controller.destroy();
  });

  it('documents the Euler delta saturating at the same crossing when alpha is absent', () => {
    const { fake, controller, tilts } = startPrintFocus();
    feed(fake, { beta: 50, gamma: 80 });
    for (let step = 0; step < 40; step += 1) {
      feed(fake, { beta: 130, gamma: -85 }, 100);
    }

    expect(tilts.at(-1)?.nx).toBeCloseTo(-0.5, 2);
    expect(tilts.at(-1)?.ny).toBeCloseTo(0.5, 2);

    controller.destroy();
  });

  it('accepts a reading with alpha: null and uses the Euler delta', () => {
    const { fake, controller, tilts } = startPrintFocus();
    feed(fake, { alpha: null, beta: 50, gamma: -8 });
    feedConverged(fake, { alpha: null, beta: 61, gamma: -8 });

    expect(tilts.at(-1)?.ny).toBeCloseTo(0.25, 2);

    controller.destroy();
  });

  it('falls back to the Euler delta for a mixed pair with alpha on one side only', () => {
    const pairs: [GyroReading, GyroReading][] = [
      [
        { alpha: 10, beta: 50, gamma: -8 },
        { alpha: null, beta: 61, gamma: -8 },
      ],
      [
        { alpha: null, beta: 50, gamma: -8 },
        { alpha: 10, beta: 61, gamma: -8 },
      ],
      [{ beta: 50, gamma: -8 }, { alpha: 10, beta: 61, gamma: -8 }],
    ];

    for (const [baseline, sample] of pairs) {
      const { fake, controller, tilts } = startPrintFocus();
      feed(fake, baseline);
      feedConverged(fake, sample);

      expect(tilts.at(-1)?.ny).toBeCloseTo(0.25, 2);

      controller.destroy();
    }
  });
});

describe('stillness recentre and glide', () => {
  it('recentres after 3000 ms of stillness and glides the print home', () => {
    const { fake, controller, tilts } = startPrintFocus();

    feed(fake, BASE_READING);
    feed(fake, TILTED_X);
    holdFor(fake, TILTED_X, 3100);

    const beforeRecentre = tilts.at(-1);
    expect(beforeRecentre?.ny).toBeGreaterThan(0.2);
    expect(fake.pendingTimerCount()).toBe(1);

    fake.advanceTimers(0);
    expect(fake.pendingTimerCount()).toBe(0);
    expect(fake.pendingFrameCount()).toBe(1);

    const recentreIndex = tilts.length;
    for (let frame = 0; frame < 28; frame += 1) {
      fake.advance(16);
      fake.flushFrames();
    }

    // About e^(-448/450) ≈ 37% of the start value after ~450 ms.
    const fraction = (tilts.at(-1)?.ny ?? 0) / (beforeRecentre?.ny ?? 1);
    expect(fraction).toBeGreaterThan(0.32);
    expect(fraction).toBeLessThan(0.42);

    const moreFrames = glideToSettle(fake);
    expect(recentreIndex + 28 + moreFrames).toBeLessThan(200);
    expect(fake.pendingFrameCount()).toBe(0);

    const glided = tilts.slice(recentreIndex);
    expect(glided.length).toBeGreaterThan(10);
    expect(glided.at(-1)).toEqual({ nx: 0, ny: 0 });
    expect(Object.is(glided.at(-1)!.ny, 0)).toBe(true);

    // No snap: the first post-recentre emit is close to where the print was.
    expect(glided[0].ny).toBeGreaterThan(0);
    expect(glided[0].ny).toBeLessThan(beforeRecentre!.ny);
    expect(beforeRecentre!.ny - glided[0].ny).toBeLessThan(0.02);

    // The glide is monotonic non-increasing toward rest.
    for (let index = 1; index < glided.length; index += 1) {
      expect(glided[index].ny).toBeLessThanOrEqual(glided[index - 1].ny);
    }

    // The entry baseline is now the held pose: +10° from it tilts again.
    feedConverged(fake, TILTED_X_MORE);
    expect(tilts.at(-1)?.ny).toBeCloseTo(10 / 44, 2);

    controller.destroy();
  });

  it('completes the glide without further sensor events and then stops requesting frames', () => {
    const { fake, controller, tilts } = startPrintFocus();
    runStillHold(fake);

    const emittedBefore = tilts.length;
    const frames = glideToSettle(fake);

    expect(frames).toBeGreaterThan(0);
    expect(frames).toBeLessThan(200);
    expect(fake.pendingFrameCount()).toBe(0);
    expect(tilts.length).toBeGreaterThan(emittedBefore);
    expect(tilts.at(-1)).toEqual({ nx: 0, ny: 0 });

    fake.advance(1000);
    fake.flushFrames();
    expect(fake.pendingFrameCount()).toBe(0);
    expect(tilts.at(-1)).toEqual({ nx: 0, ny: 0 });

    controller.destroy();
  });

  it('never recentres while the hand keeps breaking the 1.5° band', () => {
    const { fake, controller, tilts } = startPrintFocus();
    feed(fake, BASE_READING);

    const poses: GyroReading[] = [
      { beta: 70, gamma: -8 },
      { beta: 40, gamma: -8 },
      { beta: 70, gamma: -8 },
      { beta: 40, gamma: -8 },
      { beta: 70, gamma: -8 },
    ];

    for (const pose of poses) {
      for (let step = 0; step < 5; step += 1) feed(fake, pose, 100);
      fake.advanceTimers(1500);

      // The window restarted instead of firing, and no glide was requested.
      expect(fake.pendingTimerCount()).toBe(1);
      expect(fake.pendingFrameCount()).toBe(0);
    }

    expect(Math.abs(tilts.at(-1)!.ny)).toBeGreaterThan(0.2);

    controller.destroy();
  });

  it('recentres once per still period and only re-arms after the band is broken', () => {
    const { fake, controller, tilts } = startPrintFocus();
    runStillHold(fake);
    expect(glideToSettle(fake)).toBeLessThan(200);
    expect(fake.pendingTimerCount()).toBe(0);

    // 9000 ms inside the band after the recentre: no second recentre.
    holdFor(fake, TILTED_X, 9000);
    expect(fake.pendingTimerCount()).toBe(0);
    expect(fake.pendingFrameCount()).toBe(0);

    // Breaking the band starts a fresh window, which does recentre.
    feed(fake, TILTED_X_MORE);
    expect(fake.pendingTimerCount()).toBe(1);
    holdFor(fake, TILTED_X_MORE, 3100);

    const beforeSecond = tilts.at(-1);
    expect(beforeSecond?.ny).toBeCloseTo(10 / 44, 2);
    const secondIndex = tilts.length;

    fake.advanceTimers(0);
    const frames = glideToSettle(fake);

    expect(frames).toBeGreaterThan(0);
    expect(frames).toBeLessThan(200);
    expect(tilts.at(-1)).toEqual({ nx: 0, ny: 0 });

    const glided = tilts.slice(secondIndex);
    expect(glided.length).toBeGreaterThan(5);
    expect(glided[0].ny).toBeLessThan(beforeSecond!.ny);

    controller.destroy();
  });

  it('hands control straight back to the hand when a reading breaks the band mid-glide', () => {
    const { fake, controller, tilts } = startPrintFocus();
    runStillHold(fake);

    fake.advance(16);
    fake.flushFrames();
    const glidingValue = tilts.at(-1)!;
    expect(glidingValue.ny).toBeGreaterThan(0);
    expect(fake.pendingTimerCount()).toBe(0);

    fake.advance(16);
    fake.emitReading(INTERRUPTED);
    fake.flushFrames();

    // The next step uses the 85 ms tracking tau, not the 450 ms glide tau.
    const target = computeGyroTilt(INTERRUPTED, TILTED_X, 0);
    const expected = smoothTilt(glidingValue, target, 16, DEFAULT_GYRO_TAU_MS);

    expect(tilts.at(-1)).toEqual(expected);
    expect(fake.pendingTimerCount()).toBe(1);
    expect(fake.pendingFrameCount()).toBe(0);

    controller.destroy();
  });

  const cancellationActions: {
    label: string;
    act: (controller: GyroController, fake: FakeAdapter) => void;
  }[] = [
    {
      label: 'leaving Print Focus',
      act: (controller) => controller.setContext('album', null),
    },
    {
      label: 'focusing another photo',
      act: (controller) => controller.setContext('print', 'photo-2'),
    },
    {
      label: 'rotating the screen',
      act: (_controller, fake) => {
        fake.setScreenAngle(90);
        fake.emitScreenOrientationChange();
      },
    },
    {
      label: 'destroy()',
      act: (controller) => controller.destroy(),
    },
  ];

  it.each(cancellationActions)('cancels the pending stillness timer when $label', ({ act }) => {
    const { fake, controller, tilts } = startPrintFocus();
    feed(fake, BASE_READING);
    feed(fake, TILTED_X);
    holdFor(fake, TILTED_X, 1000);
    expect(fake.pendingTimerCount()).toBe(1);

    act(controller, fake);

    expect(fake.pendingTimerCount()).toBe(0);
    const emitted = tilts.length;
    fake.advanceTimers(3000);
    fake.flushFrames();
    expect(tilts).toHaveLength(emitted);
    expect(fake.pendingFrameCount()).toBe(0);
  });

  it('stops an in-flight glide when the visitor leaves Print Focus', () => {
    const { fake, controller, tilts } = startPrintFocus();
    runStillHold(fake);
    fake.advance(16);
    fake.flushFrames();
    expect(fake.pendingFrameCount()).toBe(1);

    controller.setContext('album', null);
    expect(fake.pendingFrameCount()).toBe(0);
    expect(fake.pendingTimerCount()).toBe(0);

    const emitted = tilts.length;
    fake.advance(1000);
    fake.flushFrames();
    expect(tilts).toHaveLength(emitted);
  });

  it('arms no stillness timer when no reading ever arrives', () => {
    const { fake, controller, tilts } = startPrintFocus();
    expect(fake.pendingTimerCount()).toBe(0);

    fake.advanceTimers(10_000);
    fake.flushFrames();

    expect(tilts).toEqual([]);
    expect(fake.pendingTimerCount()).toBe(0);
    expect(fake.pendingFrameCount()).toBe(0);

    controller.destroy();
  });

  it('treats a pose held beyond the ±22° clamp as still and recentres', () => {
    const { fake, controller, tilts } = startPrintFocus();
    const held: GyroReading = { beta: 80, gamma: -8 }; // +30° about device x

    feed(fake, BASE_READING);
    feed(fake, held);
    holdFor(fake, held, 3100);
    expect(tilts.at(-1)?.ny).toBeCloseTo(0.5, 2);

    const recentreIndex = tilts.length;
    fake.advanceTimers(0);
    const frames = glideToSettle(fake);

    expect(frames).toBeGreaterThan(0);
    expect(frames).toBeLessThan(200);

    const glided = tilts.slice(recentreIndex);
    expect(glided.length).toBeGreaterThan(1);
    expect(glided[0].ny).toBeLessThan(0.5);
    expect(glided[0].ny).toBeGreaterThan(0);
    expect(glided.at(-1)).toEqual({ nx: 0, ny: 0 });

    controller.destroy();
  });

  it('treats a saturated 25°↔40° sweep as motion, not stillness', () => {
    const { fake, controller, tilts } = startPrintFocus();
    feed(fake, BASE_READING);

    const poses: GyroReading[] = [
      { beta: 75, gamma: -8 }, // +25° → clamps to +0.5
      { beta: 90, gamma: -8 }, // +40° → also clamps to +0.5
      { beta: 75, gamma: -8 },
      { beta: 90, gamma: -8 },
      { beta: 75, gamma: -8 },
    ];

    for (const pose of poses) {
      for (let step = 0; step < 6; step += 1) feed(fake, pose, 100);
      fake.advanceTimers(1400);
    }

    // The output is saturated on both poses, but the unclamped band sees 15°
    // of motion, so the window keeps restarting.
    expect(tilts.at(-1)?.ny).toBeGreaterThan(0.49);
    expect(fake.pendingTimerCount()).toBe(1);
    expect(fake.pendingFrameCount()).toBe(0);

    controller.destroy();
  });
});
