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
  INITIAL_MARQUEE_GATE,
  MARQUEE_CFG,
  isOverflowing,
  marqueeTimeline,
  remainingFirstHoldMs,
  scrollTimeline,
  stepMarqueeGate,
  type MarqueeGate,
  type MarqueeMeasure,
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
      maxActivationsPerPlay: 2,
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

const m = (textWidth: number, boxWidth: number): MarqueeMeasure => ({ textWidth, boxWidth });

describe('scrollTimeline', () => {
  it('has the same maths as marqueeTimeline but no overflow gate', () => {
    const gated = marqueeTimeline(260, 166);
    expect(scrollTimeline(260)).toEqual(gated);
  });

  it('still builds a cycle for text that would not overflow', () => {
    const timeline = scrollTimeline(150);
    expect(timeline.distancePx).toBe(190);
    expect(timeline.scrollMs).toBeCloseTo((190 / 30) * 1000, 9);
    expect(timeline.durationMs).toBeCloseTo(2000 + (190 / 30) * 1000, 9);
  });
});

describe('stepMarqueeGate', () => {
  it('starts idle with no baseline', () => {
    expect(INITIAL_MARQUEE_GATE).toEqual({
      active: false,
      activations: 0,
      baseline: null,
      capped: false,
    });
  });

  it('activates on an overflowing idle measurement', () => {
    const next = stepMarqueeGate(INITIAL_MARQUEE_GATE, m(260, 166));
    expect(next).toMatchObject({ active: true, activations: 1, baseline: null });
  });

  it('records a baseline and stays idle when the line fits', () => {
    const next = stepMarqueeGate(INITIAL_MARQUEE_GATE, m(100, 166));
    expect(next).toMatchObject({ active: false, activations: 0, baseline: m(100, 166) });
  });

  it('does not re-decide an idle line whose measurement has not changed', () => {
    const idle = stepMarqueeGate(INITIAL_MARQUEE_GATE, m(100, 166));
    expect(stepMarqueeGate(idle, m(100.4, 166))).toBe(idle);
  });

  it('disagreement A: idle says overflow, active says fits -> stays active, one activation', () => {
    let gate = stepMarqueeGate(INITIAL_MARQUEE_GATE, m(260, 166));
    expect(gate.active).toBe(true);
    gate = stepMarqueeGate(gate, m(160, 166));
    expect(gate).toMatchObject({ active: true, activations: 1, baseline: m(160, 166) });
    for (let i = 0; i < 10; i += 1) gate = stepMarqueeGate(gate, m(160, 166));
    expect(gate).toMatchObject({ active: true, activations: 1 });
  });

  it('disagreement B: a marginal overflow whose active text shrinks stays put', () => {
    let gate = stepMarqueeGate(INITIAL_MARQUEE_GATE, m(170, 166));
    expect(gate.active).toBe(true);
    gate = stepMarqueeGate(gate, m(150, 166));
    expect(gate.baseline).toEqual(m(150, 166));
    const settled = gate;
    for (let i = 0; i < 10; i += 1) gate = stepMarqueeGate(gate, m(150, 166));
    expect(gate).toEqual(settled);
  });

  it('a real change (late font load) that now fits deactivates, and stays idle', () => {
    let gate = stepMarqueeGate(INITIAL_MARQUEE_GATE, m(260, 166));
    gate = stepMarqueeGate(gate, m(260, 166));
    expect(gate.active).toBe(true);
    gate = stepMarqueeGate(gate, m(150, 166));
    expect(gate).toMatchObject({ active: false, baseline: null });
    gate = stepMarqueeGate(gate, m(150, 166));
    expect(gate).toMatchObject({ active: false, activations: 1, baseline: m(150, 166) });
    expect(stepMarqueeGate(gate, m(150, 166))).toBe(gate);
  });

  it('a real change that still overflows stays active with a new baseline', () => {
    let gate = stepMarqueeGate(INITIAL_MARQUEE_GATE, m(260, 166));
    gate = stepMarqueeGate(gate, m(260, 166));
    gate = stepMarqueeGate(gate, m(300, 166));
    expect(gate).toMatchObject({ active: true, baseline: m(300, 166) });
  });

  it('caps activations per play at maxActivationsPerPlay', () => {
    let gate: MarqueeGate = INITIAL_MARQUEE_GATE;
    for (let lap = 0; lap < MARQUEE_CFG.maxActivationsPerPlay; lap += 1) {
      gate = stepMarqueeGate(gate, m(260, 166)); // idle -> activate
      gate = stepMarqueeGate(gate, m(260, 166)); // adopt active baseline
      gate = stepMarqueeGate(gate, m(150, 166)); // real change, fits -> deactivate
    }
    expect(gate.active).toBe(false);
    expect(gate.activations).toBe(2);
    const capped = stepMarqueeGate(gate, m(260, 166));
    expect(capped).toMatchObject({ active: false, activations: 2, capped: true });
    expect(capped.baseline).toEqual(m(260, 166));
  });

  it('a new play session (INITIAL_MARQUEE_GATE) can activate again', () => {
    expect(stepMarqueeGate(INITIAL_MARQUEE_GATE, m(260, 166)).active).toBe(true);
  });

  it('returns the gate unchanged for unusable measurements', () => {
    const active = stepMarqueeGate(INITIAL_MARQUEE_GATE, m(260, 166));
    for (const bad of [m(Number.NaN, 166), m(260, -1), m(Number.POSITIVE_INFINITY, 166)]) {
      expect(stepMarqueeGate(INITIAL_MARQUEE_GATE, bad)).toBe(INITIAL_MARQUEE_GATE);
      expect(stepMarqueeGate(active, bad)).toBe(active);
    }
  });

  it('never oscillates when the idle and active layouts disagree (1000 measurements)', () => {
    const scenarios: Array<{ idle: MarqueeMeasure; active: MarqueeMeasure }> = [
      { idle: m(260, 166), active: m(160, 166) },
      { idle: m(170, 166), active: m(150, 166) },
      { idle: m(100, 166), active: m(260, 166) },
    ];
    for (const { idle, active } of scenarios) {
      let gate: MarqueeGate = INITIAL_MARQUEE_GATE;
      let transitions = 0;
      for (let i = 0; i < 1000; i += 1) {
        const next = stepMarqueeGate(gate, gate.active ? active : idle);
        if (next.active !== gate.active) transitions += 1;
        gate = next;
      }
      expect(gate.activations).toBeLessThanOrEqual(MARQUEE_CFG.maxActivationsPerPlay);
      expect(transitions).toBeLessThanOrEqual(2 * MARQUEE_CFG.maxActivationsPerPlay);
    }
  });
});
