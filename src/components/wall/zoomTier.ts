/**
 * Zoom-tier styling and projected-size image LOD.
 *
 * Two decisions live here, because they must agree:
 * 1. **Projected-size width** — `lodWidth = ceil(cellPx * scale * DPR)` snapped
 *    up to the backend's `256 / 800 / 2048` buckets (`128` was dropped). Snapping
 *    keeps the browser cache hit-rate high and keeps 1,000 prints from all
 *    jumping to `800px` the instant `scale` crosses `0.25`.
 * 2. **Zoom tier** — `macro` (< 0.25) vs `album` vs `print`, which decides
 *    whether `backdrop-filter`, directional shadows, placard text, the soundtrack
 *    facade and (at most one) iframe are allowed at all.
 */

/** Backend image buckets (Bunny Optimizer and `/api/local-uploads?width=`). */
export const LOD_BUCKETS = [256, 800, 2048] as const;
export type LodWidth = (typeof LOD_BUCKETS)[number];

/**
 * The focused print always requests the largest bucket. It fills most of the
 * viewport, so its on-screen size must not depend on the unscaled `<img>` box.
 */
export const PRINT_FOCUS_LOD_WIDTH: LodWidth = LOD_BUCKETS[LOD_BUCKETS.length - 1];

/** Tiers below this CSS scale are macro; at/above it the album tier begins. */
export const MACRO_SCALE_THRESHOLD = 0.25;

export type ZoomTier = 'macro' | 'album' | 'print';

export interface ZoomTierStyle {
  /** Frosted glass `backdrop-filter` on placards. Off at macro tier. */
  backdropFilter: boolean;
  /** `flat` = one cheap shadow; `directional` = umbra + penumbra from `--sx/--sy`. */
  shadow: 'flat' | 'directional';
  /** Placard typography mounted. */
  placardText: boolean;
  /** Resting YouTube thumbnail facade on the soundtrack plaque. */
  soundtrackThumbnail: boolean;
  /** Native iframes allowed to mount (0 or 1, never more). */
  maxIframes: 0 | 1;
  /** Dim non-focused sibling prints during print focus. */
  focusDimming: boolean;
}

function positive(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 0;
}

/**
 * `ceil(cellPx * scale * dpr)` snapped up to the next backend bucket. Degenerate
 * inputs collapse to the smallest bucket instead of throwing or returning `128`.
 *
 * `maxDpr` caps the effective device pixel ratio for non-focused prints on
 * coarse pointers (`2`). It defaults to `Infinity`, preserving the uncapped
 * desktop path; a non-finite or non-positive cap is treated as no cap.
 */
export function resolveProjectedLodWidth(
  cellPx: number,
  scale: number,
  dpr: number,
  maxDpr: number = Number.POSITIVE_INFINITY,
): LodWidth {
  const dprValue = Number.isFinite(dpr) && dpr > 0 ? dpr : 1;
  const cap = Number.isFinite(maxDpr) && maxDpr > 0 ? maxDpr : Number.POSITIVE_INFINITY;
  const effectiveDpr = Math.min(dprValue, cap);
  const projected = Math.ceil(positive(cellPx) * positive(scale) * effectiveDpr);
  for (const bucket of LOD_BUCKETS) {
    if (projected <= bucket) return bucket;
  }
  return LOD_BUCKETS[LOD_BUCKETS.length - 1];
}

/**
 * Width bucket for one print: the focused print gets `PRINT_FOCUS_LOD_WIDTH`,
 * everything else keeps the projected-size bucket. A focused print bypasses
 * `maxDpr` entirely — Print Focus must stay at full `2048px` sharpness.
 */
export function resolvePrintLodWidth(
  cellPx: number,
  scale: number,
  dpr: number,
  focused: boolean,
  maxDpr: number = Number.POSITIVE_INFINITY,
): LodWidth {
  return focused ? PRINT_FOCUS_LOD_WIDTH : resolveProjectedLodWidth(cellPx, scale, dpr, maxDpr);
}

/** `macro` below 0.25, else `print` only for a focused print, else `album`. */
export function resolveZoomTier(scale: number, printFocused = false): ZoomTier {
  if (!Number.isFinite(scale) || scale < MACRO_SCALE_THRESHOLD) return 'macro';
  return printFocused ? 'print' : 'album';
}

const TIER_STYLES: Record<ZoomTier, ZoomTierStyle> = {
  macro: {
    backdropFilter: false,
    shadow: 'flat',
    placardText: false,
    soundtrackThumbnail: false,
    maxIframes: 0,
    focusDimming: false,
  },
  album: {
    backdropFilter: true,
    shadow: 'directional',
    placardText: true,
    soundtrackThumbnail: true,
    maxIframes: 1,
    focusDimming: false,
  },
  print: {
    backdropFilter: true,
    shadow: 'directional',
    placardText: true,
    soundtrackThumbnail: true,
    maxIframes: 1,
    focusDimming: true,
  },
};

export function zoomTierStyle(tier: ZoomTier): ZoomTierStyle {
  return TIER_STYLES[tier];
}
