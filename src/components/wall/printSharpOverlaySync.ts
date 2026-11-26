/**
 * Dirty-driven `requestAnimationFrame` scheduler for `PrintSharpOverlay`.
 *
 * Framework-free on purpose: the state machine (single queued frame, coalesced
 * wakes, fixed settling tail, `destroy()`) is the part that must be provably
 * idle-stopped, so Vitest verifies it without React or DOM globals.
 *
 * `wake(tailMs)` marks the geometry dirty and guarantees the scheduler keeps
 * running until `tailMs` after the last wake. The tail is fixed rather than
 * ended by `transitionend`: `.photo-sheen` bubbles `opacity 0.25s` and
 * `.photo-frame` fires one event per property (`transform 0.24s` before
 * `padding 0.25s`), so an early stop would park the overlay mid-transition.
 */

export interface OverlaySyncAdapter {
  requestFrame(callback: (timestamp: number) => void): number;
  cancelFrame(handle: number): void;
  now(): number;
}

export interface OverlaySyncScheduler {
  /** Run a sync now-ish and keep syncing for at least `tailMs` after this call. */
  wake(tailMs?: number): void;
  /** Cancel any pending frame and permanently ignore future wakes. */
  destroy(): void;
}

export function createOverlaySyncScheduler(
  adapter: OverlaySyncAdapter,
  onSync: () => void,
): OverlaySyncScheduler {
  let dirty = false;
  let tailUntilMs = 0;
  let rafHandle: number | null = null;
  let destroyed = false;

  const schedule = () => {
    if (destroyed || rafHandle !== null) return;
    rafHandle = adapter.requestFrame(tick);
  };

  const tick = () => {
    rafHandle = null;
    if (destroyed) return;
    onSync();
    dirty = false;
    if (dirty || adapter.now() < tailUntilMs) schedule();
  };

  const wake = (tailMs = 0) => {
    if (destroyed) return;
    dirty = true;
    if (tailMs > 0) {
      tailUntilMs = Math.max(tailUntilMs, adapter.now() + tailMs);
    }
    schedule();
  };

  const destroy = () => {
    if (destroyed) return;
    destroyed = true;
    dirty = false;
    tailUntilMs = 0;
    if (rafHandle !== null) {
      adapter.cancelFrame(rafHandle);
      rafHandle = null;
    }
  };

  return { wake, destroy };
}
