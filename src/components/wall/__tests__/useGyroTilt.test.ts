/**
 * Task 1.2 — gyroscope lifecycle & permission seam
 * (`src/components/wall/useGyroTilt.ts`).
 *
 * The hook itself is a thin React wrapper; every decision that can be wrong
 * lives in the framework-free `createGyroController(adapter, onTilt)` factory
 * and the session-memoized permission requester, both driven here through fake
 * adapters (no React renderer, no real `deviceorientation`/`rAF` globals).
 *
 * Contract from `specs/instanced-photo-renderer` (mobile-gyroscope-glare):
 * - listeners exist only on `(pointer: coarse)` devices, outside
 *   `prefers-reduced-motion: reduce`, and never in `macro` tier;
 * - entering/leaving Print Focus, changing the focused photo, or rotating the
 *   screen resets the entry baseline and smoother and emits an explicit zero;
 * - `null`/`NaN`/`Infinity` readings are dropped without corrupting state;
 * - one rAF per burst of sensor readings; `destroy()` removes everything.
 */

import { describe, expect, it, vi } from 'vitest';

import type { TiltVector } from '../gyroTilt';
import {
  createGyroController,
  createGyroPermissionRequester,
  requestGyroPermission,
  type GyroAdapter,
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

  let nextHandle = 1;
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
    setScreenAngle(angle: number) {
      screenAngle = angle;
    },
    orientationListenerCount: () => orientationListeners.size,
    screenListenerCount: () => screenListeners.size,
    pendingFrameCount: () => frames.size,
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

  it('attaches exactly one orientation and one screen-orientation listener in album tier', () => {
    const fake = createFakeAdapter();
    const controller = createGyroController(fake.adapter);

    controller.setContext('album', null);

    expect(fake.orientationListenerCount()).toBe(1);
    expect(fake.screenListenerCount()).toBe(1);

    controller.destroy();
  });
});

describe('tilt pipeline', () => {
  it('captures the first valid sample as the relative baseline', () => {
    const fake = createFakeAdapter();
    const tilts: TiltVector[] = [];
    const controller = createGyroController(fake.adapter, (tilt) => tilts.push(tilt));

    controller.setContext('album', null);
    feed(fake, { beta: 50, gamma: -8 });

    // The holding angle became neutral; nothing had to be emitted.
    expect(tilts).toEqual([]);

    controller.destroy();
  });

  it('emits wrapped, clamped and smoothed screen-space tilt', () => {
    const fake = createFakeAdapter({ screenAngle: 0 });
    const tilts: TiltVector[] = [];
    const controller = createGyroController(fake.adapter, (tilt) => tilts.push(tilt));

    controller.setContext('album', null);
    feed(fake, { beta: 50, gamma: -8 });
    feedConverged(fake, { beta: 61, gamma: -8 });

    const last = tilts.at(-1);
    expect(last).toBeDefined();
    expect(last?.nx).toBeCloseTo(0, 6);
    expect(last?.ny).toBeCloseTo(0.25, 2);

    controller.destroy();
  });

  it('throttles a burst of readings into one animation frame', () => {
    const fake = createFakeAdapter();
    const controller = createGyroController(fake.adapter);

    controller.setContext('album', null);
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

    controller.setContext('album', null);
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

  it('resets the baseline when entering Print Focus so the next sample is neutral', () => {
    const fake = createFakeAdapter();
    const tilts: TiltVector[] = [];
    const controller = createGyroController(fake.adapter, (tilt) => tilts.push(tilt));

    controller.setContext('album', null);
    feed(fake, { beta: 50, gamma: -8 });
    feedConverged(fake, { beta: 61, gamma: -8 });
    expect(tilts.at(-1)?.ny).toBeGreaterThan(0.2);

    controller.setContext('print', 'photo-1');
    expect(tilts.at(-1)).toEqual(NEUTRAL);

    // Same physical reading after the reset is the new neutral: no jump.
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

  it('keeps state untouched when the same tier and focus are re-asserted', () => {
    const fake = createFakeAdapter();
    const tilts: TiltVector[] = [];
    const controller = createGyroController(fake.adapter, (tilt) => tilts.push(tilt));

    controller.setContext('album', null);
    feed(fake, { beta: 50, gamma: -8 });
    feedConverged(fake, { beta: 61, gamma: -8 });
    const settled = tilts.at(-1);
    const emitted = tilts.length;

    controller.setContext('album', null);

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

    controller.setContext('album', null);
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

    controller.setContext('album', null);
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

    controller.setContext('album', null);
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
