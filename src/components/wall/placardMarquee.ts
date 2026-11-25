/**
 * Pure timeline math for the placard soundtrack ticker.
 *
 * A single Web Animations API animation carries the whole cycle: hold at the
 * start, then a linear leftward scroll of `textWidth + gapPx`. Because the
 * animated track renders `[text][gap][duplicate]`, the final keyframe places
 * the duplicate exactly where the original started, so each iteration restart
 * is visually seamless. Only `transform` is animated (compositor-only), and the
 * hold is part of every iteration.
 *
 * No DOM access lives here; the component feeds measured widths in.
 */

export interface MarqueeConfig {
  readonly holdMs: number;
  readonly speedPxPerSec: number;
  readonly gapPx: number;
  readonly fadePx: number;
  readonly overflowEpsilonPx: number;
  /** Most times the ticker may switch on within one play session. */
  readonly maxActivationsPerPlay: number;
}

export const MARQUEE_CFG = {
  holdMs: 2000,
  speedPxPerSec: 30,
  gapPx: 40,
  fadePx: 12,
  overflowEpsilonPx: 1,
  maxActivationsPerPlay: 2,
} as const satisfies MarqueeConfig;

export interface MarqueeKeyframe {
  transform: string;
  offset: number;
  easing: 'linear';
  [property: string]: string | number;
}

export interface MarqueeTimeline {
  /** Whole-pixel travel: `ceil(textWidth) + gapPx`. */
  distancePx: number;
  /** Linear scroll phase length in milliseconds. */
  scrollMs: number;
  /** One full hold + scroll cycle in milliseconds. */
  durationMs: number;
  /** Keyframe offset where the hold ends and the scroll begins (`holdMs / durationMs`). */
  holdOffset: number;
  keyframes: MarqueeKeyframe[];
}

function hasUsableMeasurement(textWidth: number, boxWidth: number): boolean {
  return (
    Number.isFinite(textWidth) &&
    Number.isFinite(boxWidth) &&
    textWidth >= 0 &&
    boxWidth >= 0
  );
}

function exceedsBy(
  textWidth: number,
  boxWidth: number,
  overflowEpsilonPx: number,
): boolean {
  return (
    hasUsableMeasurement(textWidth, boxWidth) &&
    textWidth - boxWidth > overflowEpsilonPx
  );
}

/**
 * Whether the laid-out text is wider than its box by more than the epsilon.
 * Sub-pixel noise and degenerate measurements (NaN, Infinity, negatives) never
 * start a ticker.
 */
export function isOverflowing(textWidth: number, boxWidth: number): boolean {
  return exceedsBy(textWidth, boxWidth, MARQUEE_CFG.overflowEpsilonPx);
}

/**
 * The hold-then-scroll cycle for a given text width, with no overflow gate.
 *
 * `distancePx` is rounded up to a whole pixel so the compositor never has to
 * resample the glyphs on a half-pixel boundary. `scrollMs` uses that rounded
 * distance, keeping the glide at `speedPxPerSec` within one pixel of travel.
 * The component uses this directly while the ticker is mounted, so an active
 * line always has a timeline even if an active-layout measurement says "fits".
 */
export function scrollTimeline(
  textWidth: number,
  cfg: MarqueeConfig = MARQUEE_CFG,
): MarqueeTimeline {
  const distancePx = Math.ceil(textWidth) + cfg.gapPx;
  const scrollMs = (distancePx / cfg.speedPxPerSec) * 1000;
  const durationMs = cfg.holdMs + scrollMs;
  const holdOffset = cfg.holdMs / durationMs;

  return {
    distancePx,
    scrollMs,
    durationMs,
    holdOffset,
    keyframes: [
      { transform: 'translateX(0px)', offset: 0, easing: 'linear' },
      { transform: 'translateX(0px)', offset: holdOffset, easing: 'linear' },
      { transform: `translateX(-${distancePx}px)`, offset: 1, easing: 'linear' },
    ],
  };
}

/** The hold-then-scroll cycle, or `null` when the line fits. */
export function marqueeTimeline(
  textWidth: number,
  boxWidth: number,
  cfg: MarqueeConfig = MARQUEE_CFG,
): MarqueeTimeline | null {
  if (!exceedsBy(textWidth, boxWidth, cfg.overflowEpsilonPx)) return null;
  return scrollTimeline(textWidth, cfg);
}

/**
 * How much of the first hold is left, so a late measurement can start the
 * animation as if it had been running since the play click.
 */
export function remainingFirstHoldMs(
  elapsedSincePlayMs: number,
  cfg: MarqueeConfig = MARQUEE_CFG,
): number {
  return Math.max(0, cfg.holdMs - elapsedSincePlayMs);
}

export interface MarqueeMeasure {
  textWidth: number;
  boxWidth: number;
}

export interface MarqueeGate {
  active: boolean;
  /** Activations so far in the current play session. */
  activations: number;
  /** First measurement taken in the current DOM mode; `null` until one lands. */
  baseline: MarqueeMeasure | null;
  /** True once the activation cap refused an overflowing line this session. */
  capped: boolean;
}

export const INITIAL_MARQUEE_GATE: MarqueeGate = {
  active: false,
  activations: 0,
  baseline: null,
  capped: false,
};

function changedBeyond(a: MarqueeMeasure, b: MarqueeMeasure, epsilonPx: number): boolean {
  return (
    Math.abs(a.textWidth - b.textWidth) > epsilonPx ||
    Math.abs(a.boxWidth - b.boxWidth) > epsilonPx
  );
}

/**
 * Decides whether the ticker should be mounted, given a fresh measurement.
 *
 * The idle and active layouts measure the text differently, and a browser can
 * disagree with itself between them ("overflows" idle, "fits" active). If each
 * mode re-decided from scratch, the line would flip forever and every flip
 * restyles the whole wall. So:
 *  - the first measurement after a mode switch is adopted as that mode's
 *    baseline and never re-decides overflow while active;
 *  - afterwards only a real width change (beyond the epsilon) can re-decide;
 *  - at most `maxActivationsPerPlay` activations are allowed per play session.
 *
 * Pure: returns the same object when nothing changes.
 */
export function stepMarqueeGate(
  gate: MarqueeGate,
  measure: MarqueeMeasure,
  cfg: MarqueeConfig = MARQUEE_CFG,
): MarqueeGate {
  const { textWidth, boxWidth } = measure;
  if (!hasUsableMeasurement(textWidth, boxWidth)) return gate;

  const overflowing = exceedsBy(textWidth, boxWidth, cfg.overflowEpsilonPx);

  if (gate.active) {
    if (gate.baseline === null) return { ...gate, baseline: measure };
    if (!changedBeyond(gate.baseline, measure, cfg.overflowEpsilonPx)) return gate;
    if (overflowing) return { ...gate, baseline: measure };
    return { ...gate, active: false, baseline: null };
  }

  if (gate.baseline !== null && !changedBeyond(gate.baseline, measure, cfg.overflowEpsilonPx)) {
    return gate;
  }
  if (!overflowing) return { ...gate, baseline: measure };
  if (gate.activations >= cfg.maxActivationsPerPlay) {
    return { ...gate, capped: true, baseline: measure };
  }
  return { ...gate, active: true, activations: gate.activations + 1, baseline: null };
}
