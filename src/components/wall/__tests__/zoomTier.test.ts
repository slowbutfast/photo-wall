/**
 * Task 1.3 — projected-size LOD + zoom-tier styling (`src/components/wall/zoomTier.ts`, Task 3.1).
 *
 * `lodWidth = ceil(cellPx * scale * DPR)` snaps to the backend's image buckets
 * (`256 / 800 / 2048` — `128` was removed) so crossing `scale = 0.25` never
 * forces every visible print straight to an `800px` decode. Zoom tiers decide
 * which styling switches are allowed (`macro` = flat shadows, no blur, no
 * iframes).
 */

import { describe, expect, it } from 'vitest';

import {
  LOD_BUCKETS,
  MACRO_DEMOTE_SCALE,
  MACRO_PROMOTE_SCALE,
  MACRO_SCALE_THRESHOLD,
  PRINT_FOCUS_LOD_WIDTH,
  resolvePrintLodWidth,
  resolveProjectedLodWidth,
  resolveZoomTier,
  zoomTierStyle,
  type ZoomTier,
} from '../zoomTier';
import { CELL_SIZE } from '@/lib/layout/islandLayout';
import { buildLodUrl } from '@/lib/cdn/lodUrl';

const CELL_PX = CELL_SIZE * 100; // 100 CSS px per grid cell at scale 1

describe('LOD buckets', () => {
  it('exposes exactly the 256 / 800 / 2048 backend buckets', () => {
    expect([...LOD_BUCKETS]).toEqual([256, 800, 2048]);
    expect(LOD_BUCKETS).not.toContain(128);
  });
});

describe('resolveProjectedLodWidth', () => {
  it('snaps ceil(cellPx * scale * dpr) up to the next backend bucket', () => {
    expect(resolveProjectedLodWidth(100, 0.1, 2)).toBe(256); // 20
    expect(resolveProjectedLodWidth(100, 1, 2)).toBe(256); // 200
    expect(resolveProjectedLodWidth(100, 1.3, 2)).toBe(800); // 260
    expect(resolveProjectedLodWidth(100, 2.5, 2)).toBe(800); // 500
    expect(resolveProjectedLodWidth(100, 4.5, 2)).toBe(2048); // 900
    expect(resolveProjectedLodWidth(100, 40, 2)).toBe(2048); // capped
  });

  it('keeps an exact bucket boundary at that bucket (never rounds up a step)', () => {
    expect(resolveProjectedLodWidth(100, 4, 2)).toBe(800); // 800 exactly
    expect(resolveProjectedLodWidth(100, 8, 1)).toBe(800); // 800 exactly
    expect(resolveProjectedLodWidth(100, 2.56, 1)).toBe(256);
    expect(resolveProjectedLodWidth(100, 2.57, 1)).toBe(800);
  });

  it('does not jump 1,000 prints to 800px when the macro->album threshold is crossed', () => {
    const belowThreshold = resolveProjectedLodWidth(CELL_PX, 0.249, 2);
    const atThreshold = resolveProjectedLodWidth(CELL_PX, MACRO_SCALE_THRESHOLD, 2);

    expect(belowThreshold).toBe(256);
    expect(atThreshold).toBe(256);
    expect(atThreshold).not.toBe(800);
  });

  it('only ever returns a backend bucket', () => {
    for (const cellPx of [0, 24, 100, 340, 1000]) {
      for (const scale of [0.01, 0.1, 0.25, 0.5, 1, 1.5, 4, 20, 140]) {
        for (const dpr of [1, 2, 3]) {
          const width = resolveProjectedLodWidth(cellPx, scale, dpr);
          expect(LOD_BUCKETS).toContain(width);
        }
      }
    }
  });

  it('is monotonic in scale and never below the smallest bucket', () => {
    let previous = 0;
    for (const scale of [0, 0.01, 0.25, 0.5, 1, 2, 3, 4, 5, 8, 16, 64, 140]) {
      const width = resolveProjectedLodWidth(CELL_PX, scale, 2);
      expect(width).toBeGreaterThanOrEqual(256);
      expect(width).toBeGreaterThanOrEqual(previous);
      previous = width;
    }
  });

  it('survives degenerate inputs without throwing', () => {
    expect(resolveProjectedLodWidth(0, 1, 2)).toBe(256);
    expect(resolveProjectedLodWidth(100, 0, 2)).toBe(256);
    expect(resolveProjectedLodWidth(100, Number.NaN, 2)).toBe(256);
    expect(resolveProjectedLodWidth(100, 1, 0)).toBe(256);
    expect(resolveProjectedLodWidth(Number.NaN, 1, 2)).toBe(256);
    expect(resolveProjectedLodWidth(-100, 1, 2)).toBe(256);
  });

  it('produces URLs the local derivative route can serve', () => {
    const width = resolveProjectedLodWidth(CELL_PX, 2.5, 2);
    const url = buildLodUrl('/api/local-uploads', 'albums/a1/p1.jpg', width, 4 / 5);
    expect(url).toContain('?');
    expect(url).toMatch(/[?&](width|height)=(256|800|2048)(&|$)/);
  });
});

describe('print-focus LOD', () => {
  it('pins the focused print to the largest backend bucket', () => {
    expect(PRINT_FOCUS_LOD_WIDTH).toBe(2048);
    expect(PRINT_FOCUS_LOD_WIDTH).toBe(LOD_BUCKETS[LOD_BUCKETS.length - 1]);
  });

  it('requests 2048 for the focused print and keeps the projected bucket for siblings', () => {
    // 158 CSS px cell * 3.5 zoom * DPR 1 = 553 px -> projected bucket 800.
    expect(resolvePrintLodWidth(CELL_PX, 3.5, 1, true)).toBe(2048);
    expect(resolvePrintLodWidth(CELL_PX, 3.5, 1, false)).toBe(800);
    expect(resolvePrintLodWidth(CELL_PX, 3.5, 1, false)).toBe(
      resolveProjectedLodWidth(CELL_PX, 3.5, 1),
    );
  });

  it('never loads 2048 for unfocused prints at overview scale', () => {
    expect(resolvePrintLodWidth(CELL_PX, 0.2, 1, false)).toBe(256);
  });
});

describe('coarse-pointer thumbnail DPR cap', () => {
  it('defaults to no cap so desktop behaviour is unchanged', () => {
    expect(resolveProjectedLodWidth(158, 2, 3)).toBe(
      resolveProjectedLodWidth(158, 2, 3, Number.POSITIVE_INFINITY),
    );
  });

  it('clamps a DPR 3 phone to effective DPR 2, dropping 2048 to 800', () => {
    // 158 * 2 * 3 = 948 -> 2048 bucket uncapped; 158 * 2 * 2 = 632 -> 800 capped.
    expect(resolveProjectedLodWidth(158, 2, 3)).toBe(2048);
    expect(resolveProjectedLodWidth(158, 2, 3, 2)).toBe(800);
    expect(resolvePrintLodWidth(158, 2, 3, false)).toBe(2048);
    expect(resolvePrintLodWidth(158, 2, 3, false, 2)).toBe(800);
  });

  it('keeps the focused Print Focus print at 2048 even with a DPR cap', () => {
    expect(resolvePrintLodWidth(158, 2, 3, true, 2)).toBe(PRINT_FOCUS_LOD_WIDTH);
    expect(resolvePrintLodWidth(158, 40, 3, true, 2)).toBe(PRINT_FOCUS_LOD_WIDTH);
  });

  it('treats a degenerate cap as no cap and never returns a non-bucket width', () => {
    for (const maxDpr of [0, -2, Number.NaN, Number.NEGATIVE_INFINITY]) {
      expect(resolveProjectedLodWidth(158, 2, 3, maxDpr)).toBe(2048);
    }
    expect(LOD_BUCKETS).toContain(resolveProjectedLodWidth(158, 2, 3, 2));
  });

  it('never exceeds the uncapped bucket when the cap is larger than the device DPR', () => {
    expect(resolveProjectedLodWidth(158, 2, 3, 4)).toBe(
      resolveProjectedLodWidth(158, 2, 3),
    );
  });
});

describe('resolveZoomTier', () => {
  it('switches to macro below scale 0.25 and to album at/above it', () => {
    expect(MACRO_SCALE_THRESHOLD).toBe(0.25);
    expect(resolveZoomTier(0.249)).toBe('macro');
    expect(resolveZoomTier(0.1)).toBe('macro');
    expect(resolveZoomTier(MACRO_SCALE_THRESHOLD)).toBe('album');
    expect(resolveZoomTier(1.2)).toBe('album');
  });

  it('only enters print tier for a focused print in a zoomed-in album', () => {
    expect(resolveZoomTier(1.2, true)).toBe('print');
    expect(resolveZoomTier(1.2, false)).toBe('album');
    // Macro tier always wins: focusing a print must zoom in first.
    expect(resolveZoomTier(0.1, true)).toBe('macro');
  });
});

describe('hysteresis on the macro tier boundary', () => {
  it('exposes a promote edge at 0.25 and a demote edge at 0.22', () => {
    expect(MACRO_PROMOTE_SCALE).toBe(0.25);
    // The legacy name stays an alias of the same value: no BREAKING change.
    expect(MACRO_PROMOTE_SCALE).toBe(MACRO_SCALE_THRESHOLD);
    expect(MACRO_DEMOTE_SCALE).toBe(0.22);
    expect(MACRO_DEMOTE_SCALE).toBeLessThan(MACRO_PROMOTE_SCALE);
  });

  it('keeps today\'s single threshold when no previous tier is supplied', () => {
    expect(resolveZoomTier(0.2199, false, undefined)).toBe('macro');
    expect(resolveZoomTier(0.221, false, undefined)).toBe('macro');
    expect(resolveZoomTier(0.249, false, undefined)).toBe('macro');
    expect(resolveZoomTier(0.25, false, undefined)).toBe('album');
    // Identical to the two-argument call for every scale.
    for (const scale of [0, 0.1, 0.2199, 0.221, 0.23, 0.249, 0.25, 0.251, 1.2]) {
      expect(resolveZoomTier(scale, false, undefined)).toBe(resolveZoomTier(scale));
    }
  });

  it('holds macro until the promote edge while zooming in', () => {
    expect(resolveZoomTier(0.23, false, 'macro')).toBe('macro');
    expect(resolveZoomTier(0.249, false, 'macro')).toBe('macro');
    expect(resolveZoomTier(0.25, false, 'macro')).toBe('album');
    expect(resolveZoomTier(0.251, false, 'macro')).toBe('album');
  });

  it('holds a detail tier until the demote edge while zooming out', () => {
    expect(resolveZoomTier(0.24, false, 'album')).toBe('album');
    expect(resolveZoomTier(0.221, false, 'album')).toBe('album');
    // `print` is a detail tier too: passing it back means "stay detailed".
    expect(resolveZoomTier(0.221, false, 'print')).toBe('album');
    expect(resolveZoomTier(0.2199, false, 'album')).toBe('macro');
  });

  it('never changes the album/print decision, which depends on focus only', () => {
    expect(resolveZoomTier(0.23, true, 'print')).toBe('print');
    expect(resolveZoomTier(0.23, true, 'album')).toBe('print');
    expect(resolveZoomTier(0.23, false, 'print')).toBe('album');
    // Macro always wins, at any previous tier.
    expect(resolveZoomTier(0.1, true, 'print')).toBe('macro');
  });

  it('always returns macro for a non-finite scale, whatever the previous tier', () => {
    for (const previous of [undefined, 'macro', 'album', 'print'] as const) {
      for (const scale of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
        expect(resolveZoomTier(scale, false, previous)).toBe('macro');
      }
    }
  });

  it('folds a pinch held across the boundary to exactly one tier change', () => {
    const jitter = [0.2, 0.251, 0.235, 0.26, 0.225, 0.249, 0.23];
    let previous: ZoomTier | undefined;
    const tiers: ZoomTier[] = [];
    for (const scale of jitter) {
      previous = resolveZoomTier(scale, false, previous);
      tiers.push(previous);
    }

    const changes = tiers.filter((tier, index) => index > 0 && tier !== tiers[index - 1]);
    expect(tiers).toEqual(['macro', 'album', 'album', 'album', 'album', 'album', 'album']);
    expect(changes).toHaveLength(1);
    // The single change is the promote at 0.251, not one of the jitters after it.
    expect(tiers[1]).toBe('album');
  });

  it('can fail: the same sequence without `previous` oscillates at least 4 times', () => {
    const jitter = [0.2, 0.251, 0.235, 0.26, 0.225, 0.249, 0.23];
    const tiers = jitter.map((scale) => resolveZoomTier(scale, false));
    const changes = tiers.filter((tier, index) => index > 0 && tier !== tiers[index - 1]);
    expect(changes.length).toBeGreaterThanOrEqual(4);
    expect(tiers).toEqual(['macro', 'album', 'macro', 'album', 'macro', 'macro', 'macro']);
  });
});

describe('zoomTierStyle', () => {
  it('strips expensive styling at macro tier', () => {
    const style = zoomTierStyle('macro');
    expect(style.backdropFilter).toBe(false);
    expect(style.shadow).toBe('flat');
    expect(style.placardText).toBe(false);
    expect(style.soundtrackThumbnail).toBe(false);
    expect(style.maxIframes).toBe(0);
    expect(style.focusDimming).toBe(false);
  });

  it('enables glass, directional shadows and a single soundtrack facade at album tier', () => {
    const style = zoomTierStyle('album');
    expect(style.backdropFilter).toBe(true);
    expect(style.shadow).toBe('directional');
    expect(style.placardText).toBe(true);
    expect(style.soundtrackThumbnail).toBe(true);
    expect(style.maxIframes).toBe(1);
    expect(style.focusDimming).toBe(false);
  });

  it('adds per-print focus dimming at print tier without changing compositor hygiene', () => {
    const album = zoomTierStyle('album');
    const print = zoomTierStyle('print');
    expect(print.backdropFilter).toBe(true);
    expect(print.shadow).toBe('directional');
    expect(print.placardText).toBe(true);
    expect(print.maxIframes).toBe(1);
    expect(print.focusDimming).toBe(true);
    expect(print.focusDimming).not.toBe(album.focusDimming);
  });
});
