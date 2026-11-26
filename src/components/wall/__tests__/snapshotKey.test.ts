// @vitest-environment jsdom

/**
 * Imperative rAF snapshot key.
 *
 * `GalleryCanvas` only calls React `setSnapshot` when this key changes, so the
 * key must include every value a descendant reads: the zoom tier, the projected
 * LOD bucket, and the `scale < 0.52` interaction threshold `FramedPrint` uses to
 * route a click to Album Focus instead of Print Focus. Crossing `0.52` must bust
 * the key even when IDs, tier, and LOD bucket are unchanged.
 */

import { describe, expect, it } from 'vitest';

import { buildSnapshotKey } from '../GalleryCanvas';

const VISIBLE = ['album-a', 'album-b'] as const;

describe('buildSnapshotKey', () => {
  it('is stable for identical inputs', () => {
    expect(buildSnapshotKey('album', 800, 0.7, VISIBLE)).toBe(
      buildSnapshotKey('album', 800, 0.7, VISIBLE),
    );
  });

  it('changes when the scale crosses the 0.52 click-routing threshold', () => {
    const below = buildSnapshotKey('album', 800, 0.5199, VISIBLE);
    const above = buildSnapshotKey('album', 800, 0.5201, VISIBLE);
    expect(below).not.toBe(above);
    // Exactly 0.52 is not below the threshold, matching `scale < 0.52`.
    expect(buildSnapshotKey('album', 800, 0.52, VISIBLE)).toBe(above);
  });

  it('changes when tier, LOD bucket, or visible IDs change', () => {
    const base = buildSnapshotKey('album', 800, 0.7, VISIBLE);
    expect(buildSnapshotKey('print', 800, 0.7, VISIBLE)).not.toBe(base);
    expect(buildSnapshotKey('album', 2048, 0.7, VISIBLE)).not.toBe(base);
    expect(buildSnapshotKey('album', 800, 0.7, ['album-a'])).not.toBe(base);
    expect(buildSnapshotKey('album', 800, 0.7, ['album-b', 'album-a'])).not.toBe(base);
  });

  it('encodes the threshold as a boolean segment, not the raw scale', () => {
    // Any two scales on the same side of 0.52 share a key: a tiny pan must not
    // force a React re-render.
    expect(buildSnapshotKey('album', 800, 0.3, VISIBLE)).toBe(
      buildSnapshotKey('album', 800, 0.51, VISIBLE),
    );
    expect(buildSnapshotKey('album', 800, 0.53, VISIBLE)).toBe(
      buildSnapshotKey('album', 800, 2.4, VISIBLE),
    );
  });
});
