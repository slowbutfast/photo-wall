/**
 * Placard soundtrack ticker timeline (`src/components/wall/placardMarquee.ts`).
 *
 * Contract from `openspec/changes/placard-soundtrack-marquee` (architecture D1):
 * - one exported `MARQUEE_CFG` owns every timing/geometry constant;
 * - `isOverflowing` ignores sub-pixel noise and degenerate measurements;
 * - `marqueeTimeline` builds a hold-then-linear-scroll cycle whose end lands the
 *   `aria-hidden` duplicate exactly where the original started;
 * - `remainingFirstHoldMs` clamps the late-measurement hold to the play click.
 */

import { describe, expect, it } from 'vitest';

import {
  MARQUEE_CFG,
  isOverflowing,
  marqueeTimeline,
  remainingFirstHoldMs,
} from '../placardMarquee';

/** `translateX(-300px)` → `-300`. */
function translateXPx(transform: string): number {
  const match = /translateX\((-?\d+(?:\.\d+)?)px\)/.exec(transform);
  if (!match) throw new Error(`unexpected transform: ${transform}`);
  return Number(match[1]);
}

describe('MARQUEE_CFG', () => {
  it('pins the one exported set of constants', () => {
    expect(MARQUEE_CFG).toEqual({
      holdMs: 2000,
      speedPxPerSec: 30,
      gapPx: 40,
      fadePx: 12,
      overflowEpsilonPx: 1,
    });
  });
});

describe('isOverflowing', () => {
  it('is false when the text exactly fills the box', () => {
    expect(isOverflowing(166, 166)).toBe(false);
  });

  it('ignores a one-pixel difference (within the epsilon)', () => {
    expect(isOverflowing(167, 166)).toBe(false);
  });

  it('is true once the text exceeds the box by more than one pixel', () => {
    expect(isOverflowing(167.5, 166)).toBe(true);
  });

  it('is false for non-finite or negative measurements', () => {
    expect(isOverflowing(Number.NaN, 166)).toBe(false);
    expect(isOverflowing(200, Number.NaN)).toBe(false);
    expect(isOverflowing(Number.POSITIVE_INFINITY, 166)).toBe(false);
    expect(isOverflowing(-10, 166)).toBe(false);
    expect(isOverflowing(200, -1)).toBe(false);
  });
});

describe('marqueeTimeline', () => {
  it('returns null when the line fits', () => {
    expect(marqueeTimeline(100, 166)).toBeNull();
    expect(marqueeTimeline(167, 166)).toBeNull();
  });

  it('works the 260 / 166 example', () => {
    const timeline = marqueeTimeline(260, 166);
    expect(timeline).not.toBeNull();
    expect(timeline?.distancePx).toBe(300);
    expect(timeline?.scrollMs).toBe(10000);
    expect(timeline?.durationMs).toBe(12000);
    expect(timeline?.holdOffset).toBeCloseTo(2000 / 12000, 12);
  });

  it('holds at x = 0, holds again at the offset, then lands at -distance', () => {
    const timeline = marqueeTimeline(260, 166);
    expect(timeline).not.toBeNull();
    const frames = timeline!.keyframes;

    expect(frames.map((frame) => frame.offset)).toEqual([0, timeline!.holdOffset, 1]);
    expect(frames.map((frame) => translateXPx(frame.transform))).toEqual([0, 0, -300]);
    expect(frames.map((frame) => frame.easing)).toEqual(['linear', 'linear', 'linear']);
  });

  it('rounds the endpoint up to a whole pixel when the text width is fractional', () => {
    const timeline = marqueeTimeline(260.4, 166);
    expect(timeline).not.toBeNull();
    expect(Number.isInteger(timeline!.distancePx)).toBe(true);
    expect(timeline!.distancePx).toBe(301);
    expect(translateXPx(timeline!.keyframes[2].transform)).toBe(-301);
  });

  it('ends the loop exactly one gap past the text, so the duplicate restarts at x = 0', () => {
    const textWidth = 260;
    const timeline = marqueeTimeline(textWidth, 166);
    expect(timeline).not.toBeNull();
    // The final translate equals -(textWidth + gap): the duplicate copy, which
    // sits one gap behind the original, arrives at the original's start point.
    expect(translateXPx(timeline!.keyframes.at(-1)!.transform)).toBe(-(textWidth + MARQUEE_CFG.gapPx));
    expect(timeline!.distancePx).toBe(textWidth + MARQUEE_CFG.gapPx);
  });
});

describe('remainingFirstHoldMs', () => {
  it('returns the full hold at the play click', () => {
    expect(remainingFirstHoldMs(0)).toBe(MARQUEE_CFG.holdMs);
  });

  it('counts down with elapsed playback', () => {
    expect(remainingFirstHoldMs(500)).toBe(1500);
  });

  it('clamps to zero once the hold has elapsed', () => {
    expect(remainingFirstHoldMs(2500)).toBe(0);
    expect(remainingFirstHoldMs(9000)).toBe(0);
  });

  it('never returns a negative hold', () => {
    expect(remainingFirstHoldMs(-100)).toBeGreaterThanOrEqual(0);
    expect(remainingFirstHoldMs(Number.POSITIVE_INFINITY)).toBe(0);
  });
});
