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
}

export const MARQUEE_CFG = {
  holdMs: 2000,
  speedPxPerSec: 30,
  gapPx: 40,
  fadePx: 12,
  overflowEpsilonPx: 1,
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
 * The hold-then-scroll cycle, or `null` when the line fits.
 *
 * `distancePx` is rounded up to a whole pixel so the compositor never has to
 * resample the glyphs on a half-pixel boundary. `scrollMs` uses that rounded
 * distance, keeping the glide at `speedPxPerSec` within one pixel of travel.
 */
export function marqueeTimeline(
  textWidth: number,
  boxWidth: number,
  cfg: MarqueeConfig = MARQUEE_CFG,
): MarqueeTimeline | null {
  if (!exceedsBy(textWidth, boxWidth, cfg.overflowEpsilonPx)) return null;

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
