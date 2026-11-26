/**
 * Event-driven overlay scheduler state machine.
 *
 * `PrintSharpOverlay` used to poll `requestAnimationFrame` for the whole life of
 * Print Focus, rewriting identical inline styles ~60 times a second. The
 * scheduler parks after a clean sync and only keeps running for a fixed
 * `300 ms` settling tail after focus / hover / tilt wakes, so the desktop
 * `transform 0.24s` + `padding 0.25s` ease-back never ghosts.
 */

import { describe, expect, it, vi } from 'vitest';

import {
  createOverlaySyncScheduler,
  type OverlaySyncAdapter,
} from '../printSharpOverlaySync';

interface FrameHarness {
  adapter: OverlaySyncAdapter;
  /** rAF callbacks currently queued. */
  pending: () => number;
  advance: (ms: number) => void;
  runFrame: () => void;
}

function createFrameHarness(): FrameHarness {
  let now = 0;
  let nextHandle = 1;
  const frames = new Map<number, (timestamp: number) => void>();

  return {
    adapter: {
      requestFrame(callback) {
        const handle = nextHandle;
        nextHandle += 1;
        frames.set(handle, callback);
        return handle;
      },
      cancelFrame(handle) {
        frames.delete(handle);
      },
      now() {
        return now;
      },
    },
    pending: () => frames.size,
    advance(ms) {
      now += ms;
    },
    runFrame() {
      const queued = [...frames.values()];
      frames.clear();
      for (const callback of queued) callback(now);
    },
  };
}

describe('createOverlaySyncScheduler', () => {
  it('parks after one clean sync (idle stop)', () => {
    const harness = createFrameHarness();
    const onSync = vi.fn();
    const scheduler = createOverlaySyncScheduler(harness.adapter, onSync);

    scheduler.wake();
    expect(harness.pending()).toBe(1);

    harness.runFrame();
    expect(onSync).toHaveBeenCalledTimes(1);
    expect(harness.pending()).toBe(0);

    // Later time alone never restarts the loop.
    harness.advance(1000);
    harness.runFrame();
    expect(onSync).toHaveBeenCalledTimes(1);
    expect(harness.pending()).toBe(0);
  });

  it('keeps syncing for the full fixed 300 ms tail, then stops', () => {
    const harness = createFrameHarness();
    const onSync = vi.fn();
    const scheduler = createOverlaySyncScheduler(harness.adapter, onSync);

    scheduler.wake(300);

    harness.runFrame(); // t = 0
    expect(onSync).toHaveBeenCalledTimes(1);

    for (let elapsed = 16; elapsed <= 288; elapsed += 16) {
      harness.advance(16);
      harness.runFrame();
    }
    // t = 0, 16, ... 288 -> still inside the tail, so a frame stays queued.
    expect(onSync).toHaveBeenCalledTimes(19);
    expect(harness.pending()).toBe(1);

    harness.advance(16); // t = 304, past the tail
    harness.runFrame();
    expect(onSync).toHaveBeenCalledTimes(20);
    expect(harness.pending()).toBe(0);
  });

  it('extends the tail from the latest wake instead of truncating it', () => {
    const harness = createFrameHarness();
    const onSync = vi.fn();
    const scheduler = createOverlaySyncScheduler(harness.adapter, onSync);

    scheduler.wake(300);
    harness.advance(200);
    harness.runFrame(); // t = 200, tail still due at 300
    expect(onSync).toHaveBeenCalledTimes(1);
    expect(harness.pending()).toBe(1);

    scheduler.wake(300); // re-arm: tail now due at 500
    harness.advance(99); // t = 299
    harness.runFrame();
    expect(onSync).toHaveBeenCalledTimes(2);
    expect(harness.pending()).toBe(1);

    harness.advance(1); // t = 300: old tail would have expired here
    harness.runFrame();
    expect(onSync).toHaveBeenCalledTimes(3);
    expect(harness.pending()).toBe(1);

    harness.advance(200); // t = 500
    harness.runFrame();
    expect(onSync).toHaveBeenCalledTimes(4);
    expect(harness.pending()).toBe(0);
  });

  it('coalesces multiple wakes in one frame into a single callback', () => {
    const harness = createFrameHarness();
    const onSync = vi.fn();
    const scheduler = createOverlaySyncScheduler(harness.adapter, onSync);

    scheduler.wake();
    scheduler.wake(300);
    scheduler.wake();

    expect(harness.pending()).toBe(1);
    harness.runFrame();
    expect(onSync).toHaveBeenCalledTimes(1);
  });

  it('destroy() cancels the pending frame and ignores later wakes', () => {
    const harness = createFrameHarness();
    const onSync = vi.fn();
    const scheduler = createOverlaySyncScheduler(harness.adapter, onSync);

    scheduler.wake(300);
    expect(harness.pending()).toBe(1);

    scheduler.destroy();
    expect(harness.pending()).toBe(0);

    scheduler.wake();
    scheduler.wake(300);
    expect(harness.pending()).toBe(0);

    harness.runFrame();
    expect(onSync).not.toHaveBeenCalled();
  });
});
