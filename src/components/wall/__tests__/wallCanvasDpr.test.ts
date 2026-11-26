/**
 * Task 1.2 — coarse-pointer WebGL wall DPR budget
 * (`src/components/wall/PlaygroundPbrWall.tsx`).
 *
 * `PlaygroundPbrWall` sizes its WebGL2 backing store imperatively, so the DPR
 * decision is a pure helper with no SSR hydration impact. Coarse pointers cap
 * at `MOBILE_WALL_MAX_DPR` (1.0, an isolated thermal/GPU experiment) while
 * desktop fine pointers keep the existing 2.0 ceiling.
 */

import { describe, expect, it } from 'vitest';

import { MOBILE_WALL_MAX_DPR, resolveWallCanvasDpr } from '../PlaygroundPbrWall';

describe('resolveWallCanvasDpr', () => {
  it('pins the coarse-pointer wall canvas to MOBILE_WALL_MAX_DPR (1.0)', () => {
    expect(MOBILE_WALL_MAX_DPR).toBe(1);
    expect(resolveWallCanvasDpr(3, true)).toBe(1);
    expect(resolveWallCanvasDpr(2, true)).toBe(1);
    expect(resolveWallCanvasDpr(1, true)).toBe(1);
  });

  it('keeps desktop fine pointers capped at 2.0', () => {
    expect(resolveWallCanvasDpr(2, false)).toBe(2);
    expect(resolveWallCanvasDpr(3, false)).toBe(2);
    expect(resolveWallCanvasDpr(5, false)).toBe(2);
  });

  it('raises a sub-1 fine-pointer DPR to 1 rather than downsampling', () => {
    expect(resolveWallCanvasDpr(0.5, false)).toBe(1);
    expect(resolveWallCanvasDpr(1, false)).toBe(1);
  });

  it('survives degenerate inputs without throwing or returning 0', () => {
    for (const dpr of [0, -1, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      expect(resolveWallCanvasDpr(dpr, false)).toBe(1);
      expect(resolveWallCanvasDpr(dpr, true)).toBe(1);
    }
  });
});
