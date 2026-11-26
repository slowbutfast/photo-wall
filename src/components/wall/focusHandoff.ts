/**
 * Focus hand-off controller (vertical slice).
 *
 * Semantic focus (`focusedPhotoId`, `.focused`) still flips at the tap; this
 * controller transfers the *visual* focused look between at most two
 * participants, driven by the camera flight's eased progress. It is
 * DOM-agnostic: every effect goes through the sink, so it is unit-testable
 * without a browser and `GalleryCanvas` owns the DOM lookup.
 *
 *   incoming w = e
 *   outgoing w = w₀ · (1 − e)
 *
 * A cancelled flight releases toward the targets over 160 ms; a new focus
 * change re-targets from the current weights, and reduced motion applies the
 * targets immediately.
 */

import { flightEase } from '@/lib/camera/flightPlan';

export const HANDOFF_RELEASE_MS = 160;

export interface FocusHandoffSink {
  /** `null` clears `--focus-w` and the `.is-handoff*` classes. */
  setWeight(photoId: string, w: number | null): void;
  /** `null` clears `--print-w` on the focused album grid. */
  setPrintWeight(albumId: string, p: number | null): void;
  /** The participant left the hand-off (clear deferred gyro vars, unmount). */
  onEnd(photoId: string): void;
}

export interface FocusHandoffOptions {
  now?: () => number;
  reducedMotion?: boolean;
  releaseMs?: number;
}

export interface FocusHandoffBegin {
  outgoing: string | null;
  incoming: string | null;
  printFrom: number;
  printTo: number;
  albumId: string | null;
}

export interface FocusHandoffParticipant {
  photoId: string;
  w: number;
}

export interface FocusHandoff {
  begin(input: FocusHandoffBegin): void;
  /** Flight-driven: `eased` is `flightEase(t)`. */
  tick(eased: number): void;
  /** The flight was cancelled; release toward the targets. */
  cancel(): void;
  /** Drives releases; `true` while anything is still animating. */
  advance(now?: number): boolean;
  participants(): FocusHandoffParticipant[];
  weightOf(photoId: string): number | null;
  isActive(): boolean;
}

type Role = 'incoming' | 'outgoing' | 'releasing';

interface Entry {
  photoId: string;
  w: number;
  role: Role;
  /** Outgoing only: its weight when the hand-off began. */
  w0: number;
  releaseFrom: number;
  releaseTarget: number;
  releaseAt: number;
  /** Last value handed to the sink, so identical ticks never touch the DOM. */
  written: number | null | undefined;
}

interface PrintWeight {
  albumId: string;
  from: number;
  to: number;
  p: number;
  written: number | null | undefined;
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

export function createFocusHandoff(
  sink: FocusHandoffSink,
  options: FocusHandoffOptions = {},
): FocusHandoff {
  const clock = options.now ?? (() => performance.now());
  const releaseMs = Math.max(1, options.releaseMs ?? HANDOFF_RELEASE_MS);
  const reducedMotion = options.reducedMotion === true;

  let entries: Entry[] = [];
  let print: PrintWeight | null = null;

  const writeWeight = (entry: Entry) => {
    if (entry.written === entry.w) return;
    entry.written = entry.w;
    sink.setWeight(entry.photoId, entry.w);
  };

  const writePrint = () => {
    if (!print) return;
    if (print.written === print.p) return;
    print.written = print.p;
    sink.setPrintWeight(print.albumId, print.p);
  };

  const clearEntry = (entry: Entry) => {
    if (entry.written !== null) {
      entry.written = null;
      sink.setWeight(entry.photoId, null);
    }
  };

  /** Remove a participant and tell the sink it is done. */
  const retire = (entry: Entry, announce: boolean) => {
    clearEntry(entry);
    if (announce) sink.onEnd(entry.photoId);
  };

  const finish = () => {
    for (const entry of entries) {
      clearEntry(entry);
      if (entry.role !== 'incoming') sink.onEnd(entry.photoId);
    }
    entries = [];
    if (print) {
      if (print.to <= 0) {
        print.written = null;
        sink.setPrintWeight(print.albumId, null);
      } else {
        print.p = print.to;
        writePrint();
      }
      print = null;
    }
  };

  const advanceRelease = (entry: Entry, now: number): boolean => {
    const elapsed = Math.max(0, now - entry.releaseAt);
    const progress = flightEase(Math.min(1, elapsed / releaseMs));
    entry.w = entry.releaseFrom + (entry.releaseTarget - entry.releaseFrom) * progress;
    writeWeight(entry);
    return elapsed >= releaseMs;
  };

  const begin = (input: FocusHandoffBegin) => {
    const now = clock();

    if (reducedMotion) {
      // Nothing is painted: the resting `.focused` / unfocused CSS already is
      // the target look, exactly as before this change.
      entries = [];
      if (print && print.to <= 0) sink.setPrintWeight(print.albumId, null);
      print = null;
      return;
    }

    const previous = new Map(entries.map((entry) => [entry.photoId, entry]));
    const next: Entry[] = [];

    if (input.outgoing) {
      const current = previous.get(input.outgoing);
      const w0 = current ? current.w : 1;
      next.push({
        photoId: input.outgoing,
        w: w0,
        role: 'outgoing',
        w0,
        releaseFrom: w0,
        releaseTarget: 0,
        releaseAt: now,
        written: current?.written,
      });
      previous.delete(input.outgoing);
    }

    for (const entry of previous.values()) {
      // A previous participant that is not in the new pair releases to 0
      // instead of snapping, whether it was incoming or already outgoing.
      if (entry.w <= 0) {
        retire(entry, true);
        continue;
      }
      next.push({
        photoId: entry.photoId,
        w: entry.w,
        role: 'releasing',
        w0: entry.w,
        releaseFrom: entry.w,
        releaseTarget: 0,
        releaseAt: now,
        written: entry.written,
      });
    }

    if (input.incoming) {
      next.push({
        photoId: input.incoming,
        w: 0,
        role: 'incoming',
        w0: 0,
        releaseFrom: 0,
        releaseTarget: 1,
        releaseAt: now,
        written: undefined,
      });
    }

    entries = next;
    for (const entry of entries) writeWeight(entry);

    print = input.albumId
      ? {
          albumId: input.albumId,
          from: input.printFrom,
          to: input.printTo,
          p: input.printFrom,
          written: undefined,
        }
      : null;
    writePrint();
  };

  const tick = (eased: number) => {
    if (entries.length === 0 && !print) return;
    if (reducedMotion) {
      finish();
      return;
    }

    const e = clamp01(eased);
    const now = clock();

    for (const entry of entries) {
      if (entry.role === 'releasing') continue;
      entry.w = entry.role === 'incoming' ? e : entry.w0 * (1 - e);
      writeWeight(entry);
    }

    for (const entry of [...entries]) {
      if (entry.role !== 'releasing') continue;
      if (advanceRelease(entry, now)) {
        entry.w = entry.releaseTarget;
        retire(entry, true);
        entries = entries.filter((candidate) => candidate !== entry);
      }
    }

    if (print) {
      print.p = print.from + (print.to - print.from) * e;
      writePrint();
    }

    if (e >= 1) finish();
  };

  const cancel = () => {
    const now = clock();
    for (const entry of entries) {
      if (entry.role === 'releasing') continue;
      entry.releaseFrom = entry.w;
      entry.releaseTarget = entry.role === 'incoming' ? 1 : 0;
      entry.releaseAt = now;
      entry.role = 'releasing';
    }
    if (print) {
      print.p = print.to;
      writePrint();
    }
  };

  const advance = (now = clock()): boolean => {
    if (reducedMotion) {
      finish();
      return false;
    }

    let animating = false;
    for (const entry of [...entries]) {
      if (entry.role !== 'releasing') {
        animating = true;
        continue;
      }
      if (advanceRelease(entry, now)) {
        entry.w = entry.releaseTarget;
        retire(entry, true);
        entries = entries.filter((candidate) => candidate !== entry);
      } else {
        animating = true;
      }
    }

    if (!animating) {
      // Only a successfully released set can reach here; the print weight has
      // already been driven by the flight or the cancel.
      if (print) {
        if (print.to <= 0) {
          print.written = null;
          sink.setPrintWeight(print.albumId, null);
        }
        print = null;
      }
    }

    return animating;
  };

  return {
    begin,
    tick,
    cancel,
    advance,
    participants: () => entries.map((entry) => ({ photoId: entry.photoId, w: entry.w })),
    weightOf: (photoId) => {
      const entry = entries.find((candidate) => candidate.photoId === photoId);
      return entry ? entry.w : null;
    },
    isActive: () => entries.length > 0,
  };
}
