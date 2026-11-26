/**
 * Task 1.2 — focus hand-off controller (`src/components/wall/focusHandoff.ts`).
 *
 * Contract from `specs/print-focus-handoff`:
 * - semantic focus flips at the tap; the visual weight `w` follows flight
 *   progress `e = flightEase(t)`;
 * - incoming `w = e`, outgoing `w = w₀·(1 − e)`;
 * - a cancelled flight releases toward the targets over 160 ms;
 * - a new focus change mid-hand-off re-targets from the current weights;
 * - reduced motion applies the targets immediately;
 * - only participants ever receive writes.
 */

import { describe, expect, it } from 'vitest';

import {
  HANDOFF_RELEASE_MS,
  createFocusHandoff,
  type FocusHandoffSink,
} from '../focusHandoff';

interface Write {
  photoId: string;
  w: number | null;
}

function createHarness(options: { reducedMotion?: boolean } = {}) {
  let now = 0;
  const writes: Write[] = [];
  const printWrites: Array<{ albumId: string; p: number | null }> = [];
  const ended: string[] = [];

  const sink: FocusHandoffSink = {
    setWeight: (photoId, w) => writes.push({ photoId, w }),
    setPrintWeight: (albumId, p) => printWrites.push({ albumId, p }),
    onEnd: (photoId) => ended.push(photoId),
  };

  const handoff = createFocusHandoff(sink, {
    now: () => now,
    reducedMotion: options.reducedMotion,
  });

  return {
    handoff,
    writes,
    printWrites,
    ended,
    advanceBy(ms: number) {
      now += ms;
    },
    lastWrite(photoId: string): number | null | undefined {
      for (let index = writes.length - 1; index >= 0; index -= 1) {
        if (writes[index].photoId === photoId) return writes[index].w;
      }
      return undefined;
    },
    writtenIds(): string[] {
      return [...new Set(writes.map((write) => write.photoId))];
    },
  };
}

describe('hand-off shapes', () => {
  it('album → print: incoming only, the print weight ramps 0 → 1', () => {
    const harness = createHarness();
    harness.handoff.begin({
      outgoing: null,
      incoming: 'b',
      printFrom: 0,
      printTo: 1,
      albumId: 'album-1',
    });

    harness.handoff.tick(0.5);

    expect(harness.writtenIds()).toEqual(['b']);
    expect(harness.lastWrite('b')).toBeCloseTo(0.5, 6);
    expect(harness.printWrites.at(-1)).toEqual({ albumId: 'album-1', p: 0.5 });
    expect(harness.handoff.participants().map((entry) => entry.photoId)).toEqual(['b']);
  });

  it('print → print: both participants, the print weight stays 1', () => {
    const harness = createHarness();
    harness.handoff.begin({
      outgoing: 'a',
      incoming: 'b',
      printFrom: 1,
      printTo: 1,
      albumId: 'album-1',
    });

    harness.handoff.tick(0.5);

    expect(harness.lastWrite('a')).toBeCloseTo(0.5, 6);
    expect(harness.lastWrite('b')).toBeCloseTo(0.5, 6);
    expect(harness.printWrites.at(-1)).toEqual({ albumId: 'album-1', p: 1 });
    expect(harness.handoff.participants().map((entry) => entry.photoId).sort()).toEqual([
      'a',
      'b',
    ]);
  });

  it('print → album: outgoing only, the print weight ramps 1 → 0', () => {
    const harness = createHarness();
    harness.handoff.begin({
      outgoing: 'a',
      incoming: null,
      printFrom: 1,
      printTo: 0,
      albumId: 'album-1',
    });

    harness.handoff.tick(0.5);

    expect(harness.writtenIds()).toEqual(['a']);
    expect(harness.lastWrite('a')).toBeCloseTo(0.5, 6);
    expect(harness.printWrites.at(-1)).toEqual({ albumId: 'album-1', p: 0.5 });
  });
});

describe('weights and end', () => {
  it('writes focused/incoming weights and ends at e = 1', () => {
    const harness = createHarness();
    harness.handoff.begin({
      outgoing: 'a',
      incoming: 'b',
      printFrom: 1,
      printTo: 1,
      albumId: 'album-1',
    });
    harness.handoff.tick(0.5);

    expect(harness.lastWrite('a')).toBeCloseTo(0.5, 6);
    expect(harness.lastWrite('b')).toBeCloseTo(0.5, 6);

    harness.handoff.tick(1);

    expect(harness.lastWrite('a')).toBeNull();
    expect(harness.lastWrite('b')).toBeNull();
    expect(harness.ended).toEqual(['a']);
    expect(harness.handoff.isActive()).toBe(false);
    expect(harness.handoff.participants()).toEqual([]);
  });

  it('never writes a non-participant', () => {
    const harness = createHarness();
    harness.handoff.begin({
      outgoing: 'a',
      incoming: 'b',
      printFrom: 1,
      printTo: 1,
      albumId: 'album-1',
    });
    for (const eased of [0, 0.1, 0.33, 0.6, 0.99, 1]) harness.handoff.tick(eased);

    expect(new Set(harness.writtenIds())).toEqual(new Set(['a', 'b']));
  });

  it('skips identical consecutive tick values', () => {
    const harness = createHarness();
    harness.handoff.begin({
      outgoing: 'a',
      incoming: 'b',
      printFrom: 1,
      printTo: 1,
      albumId: 'album-1',
    });
    harness.handoff.tick(0.5);
    const count = harness.writes.length + harness.printWrites.length;

    harness.handoff.tick(0.5);

    expect(harness.writes.length + harness.printWrites.length).toBe(count);
  });
});

describe('interruption', () => {
  it('releases a cancelled flight over 160 ms with no step above 0.25', () => {
    const harness = createHarness();
    harness.handoff.begin({
      outgoing: 'a',
      incoming: 'b',
      printFrom: 1,
      printTo: 1,
      albumId: 'album-1',
    });
    harness.handoff.tick(0.3);
    harness.handoff.cancel();

    let incoming = harness.handoff.weightOf('b') ?? 0;
    let outgoing = harness.handoff.weightOf('a') ?? 0;
    let frames = 0;
    let active = true;

    while (active && frames < 40) {
      harness.advanceBy(16.7);
      active = harness.handoff.advance();
      frames += 1;

      const nextIncoming = harness.handoff.weightOf('b') ?? 1;
      const nextOutgoing = harness.handoff.weightOf('a') ?? 0;
      expect(nextIncoming - incoming).toBeLessThanOrEqual(0.25);
      expect(outgoing - nextOutgoing).toBeLessThanOrEqual(0.25);
      incoming = nextIncoming;
      outgoing = nextOutgoing;
    }

    expect(active).toBe(false);
    expect(frames * 16.7).toBeGreaterThanOrEqual(HANDOFF_RELEASE_MS - 1);
    expect(frames * 16.7).toBeLessThanOrEqual(HANDOFF_RELEASE_MS + 17);
    expect(harness.lastWrite('b')).toBeNull();
    expect(harness.lastWrite('a')).toBeNull();
  });

  it('re-begins from the current weights at e = 0.6', () => {
    const harness = createHarness();
    harness.handoff.begin({
      outgoing: 'a',
      incoming: 'b',
      printFrom: 1,
      printTo: 1,
      albumId: 'album-1',
    });
    harness.handoff.tick(0.6);

    harness.handoff.begin({
      outgoing: 'b',
      incoming: 'c',
      printFrom: 1,
      printTo: 1,
      albumId: 'album-1',
    });

    // The old incoming keeps its 0.6 as the new outgoing's w₀.
    expect(harness.handoff.weightOf('b')).toBeCloseTo(0.6, 6);
    expect(harness.handoff.weightOf('c')).toBe(0);
    // The original outgoing releases from 0.4.
    expect(harness.handoff.weightOf('a')).toBeCloseTo(0.4, 6);

    harness.handoff.advance();
    harness.advanceBy(160);
    harness.handoff.advance();

    expect(harness.handoff.weightOf('a') ?? 0).toBe(0);
    expect(harness.ended).toContain('a');
    expect(harness.handoff.weightOf('b')).toBeCloseTo(0.6, 6);
  });

  it('applies the targets immediately under prefers-reduced-motion', () => {
    const harness = createHarness({ reducedMotion: true });
    harness.handoff.begin({
      outgoing: 'a',
      incoming: 'b',
      printFrom: 1,
      printTo: 1,
      albumId: 'album-1',
    });

    expect(harness.handoff.isActive()).toBe(false);
    expect(harness.handoff.participants()).toEqual([]);
    // The resting `.focused` / unfocused CSS is already the target look, so the
    // only acceptable writes are clears — never an interim weight.
    expect(harness.writes.filter((write) => write.w !== null)).toEqual([]);
  });
});

describe('PATCH-01: print weight never jumps', () => {
  const lastPrint = (harness: ReturnType<typeof createHarness>): number | null | undefined =>
    harness.printWrites.at(-1)?.p;

  it('eases the print weight to its target when a flight is cancelled', () => {
    const harness = createHarness();
    harness.handoff.begin({ outgoing: null, incoming: 'b', printFrom: 0, printTo: 1, albumId: 'album-1' });
    harness.handoff.tick(0.3);
    const atCancel = lastPrint(harness) as number;
    expect(atCancel).toBeCloseTo(0.3, 6);

    harness.handoff.cancel();
    // Nothing is written at the cancel itself: the veil must not jump to 1.
    expect(lastPrint(harness)).toBeCloseTo(0.3, 6);

    let previous = atCancel;
    let frames = 0;
    let active = true;
    while (active && frames < 40) {
      harness.advanceBy(16.7);
      active = harness.handoff.advance();
      frames += 1;
      const next = lastPrint(harness) as number;
      expect(next - previous).toBeLessThanOrEqual(0.25);
      previous = next;
    }

    expect(active).toBe(false);
    expect(frames * 16.7).toBeGreaterThanOrEqual(HANDOFF_RELEASE_MS - 1);
    expect(lastPrint(harness)).toBe(1);
  });

  it('continues the print weight when a NEXT starts during the entry flight', () => {
    const harness = createHarness();
    harness.handoff.begin({ outgoing: null, incoming: 'a', printFrom: 0, printTo: 1, albumId: 'album-1' });
    harness.handoff.tick(0.6);
    expect(lastPrint(harness)).toBeCloseTo(0.6, 6);

    harness.handoff.begin({ outgoing: 'a', incoming: 'b', printFrom: 1, printTo: 1, albumId: 'album-1' });
    // Not 1: the neighbours were 60% veiled a frame ago.
    expect(lastPrint(harness)).toBeCloseTo(0.6, 6);

    harness.handoff.tick(0.5);
    expect(lastPrint(harness)).toBeCloseTo(0.8, 6);
    harness.handoff.tick(1);
    expect(harness.printWrites.at(-1)?.p).toBe(1);
  });

  it('hands off to Overview mid-NEXT without a weight or veil jump', () => {
    const harness = createHarness();
    harness.handoff.begin({ outgoing: 'a', incoming: 'b', printFrom: 1, printTo: 1, albumId: 'album-1' });
    harness.handoff.tick(0.6);

    // Overview pressed: the focused print (b) leaves, no incoming print.
    harness.handoff.begin({ outgoing: 'b', incoming: null, printFrom: 1, printTo: 0, albumId: 'album-1' });
    expect(harness.handoff.weightOf('b')).toBeCloseTo(0.6, 6);
    expect(harness.handoff.weightOf('a')).toBeCloseTo(0.4, 6);
    expect(lastPrint(harness)).toBe(1);

    harness.handoff.tick(0.5);
    expect(harness.handoff.weightOf('b')).toBeCloseTo(0.3, 6);
    expect(lastPrint(harness)).toBeCloseTo(0.5, 6);

    harness.handoff.tick(1);
    expect(harness.handoff.isActive()).toBe(false);
    expect(harness.ended).toContain('b');
    // `--print-w` is cleared, so the veil cannot outlive the album's Print Focus.
    expect(lastPrint(harness)).toBeNull();
  });
});
