/**
 * Zoom-tier styling and projected-size image LOD.
 *
 * Two decisions live here, because they must agree:
 * 1. **Projected-size width** — `lodWidth = ceil(cellPx * scale * DPR)` snapped
 *    up to the backend's `256 / 800 / 2048` buckets (`128` was dropped). Snapping
 *    keeps the browser cache hit-rate high and keeps 1,000 prints from all
 *    jumping to `800px` the instant `scale` crosses `0.25`.
 * 2. **Zoom tier** — `macro` vs `album` vs `print`, which decides whether
 *    `backdrop-filter`, directional shadows, placard text, the soundtrack facade
 *    and (at most one) iframe are allowed at all. The macro boundary is a
 *    Schmitt trigger: islands promote at `MACRO_PROMOTE_SCALE` and demote at
 *    `MACRO_DEMOTE_SCALE`, and inside the band in between the committed tier is
 *    held, so a pinch jittering around one scale can't oscillate the whole wall
 *    between a canvas mosaic and full DOM.
 */

/** Backend image buckets (Bunny Optimizer and `/api/local-uploads?width=`). */
export const LOD_BUCKETS = [256, 800, 2048] as const;
export type LodWidth = (typeof LOD_BUCKETS)[number];

/**
 * The focused print always requests the largest bucket. It fills most of the
 * viewport, so its on-screen size must not depend on the unscaled `<img>` box.
 */
export const PRINT_FOCUS_LOD_WIDTH: LodWidth = LOD_BUCKETS[LOD_BUCKETS.length - 1];

/**
 * Islands promote from `macro` to a detail tier at this CSS scale. Kept as
 * `MACRO_SCALE_THRESHOLD` too, so callers that pin the old name keep working.
 */
export const MACRO_PROMOTE_SCALE = 0.25;
/** @deprecated Same value as `MACRO_PROMOTE_SCALE`; kept as an alias. */
export const MACRO_SCALE_THRESHOLD = MACRO_PROMOTE_SCALE;
/**
 * Islands demote back to `macro` only below this CSS scale. The band in between
 * (`[0.22, 0.25)`) holds whichever tier was committed last, which is what stops
 * a pinch held near one threshold from toggling every island.
 */
export const MACRO_DEMOTE_SCALE = 0.22;

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

/**
 * Schmitt-trigger tier on the macro boundary.
 *
 * Without `previous` this is exactly the old single-threshold rule (`scale <
 * 0.25` is macro), so existing callers and assertions are unaffected. With
 * `previous`:
 *
 * - `previous === 'macro'` stays macro until `scale >= MACRO_PROMOTE_SCALE`;
 * - any detail tier (`'album'` or `'print'`) stays detailed until
 *   `scale < MACRO_DEMOTE_SCALE`;
 * - a non-finite scale is always macro.
 *
 * `album` vs `print` is a focus decision, never a scale one, so `previous`
 * only carries "macro vs detail".
 */
export function resolveZoomTier(
  scale: number,
  printFocused = false,
  previous?: ZoomTier,
): ZoomTier {
  if (!Number.isFinite(scale)) return 'macro';
  const wasMacro = previous === undefined ? undefined : previous === 'macro';
  const macro =
    wasMacro === undefined
      ? scale < MACRO_PROMOTE_SCALE
      : wasMacro
        ? scale < MACRO_PROMOTE_SCALE
        : scale < MACRO_DEMOTE_SCALE;
  if (macro) return 'macro';
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
