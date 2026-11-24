'use client';

/**
 * Pure, memoizable lighting -> CSS custom properties.
 *
 * `--lit`, `--lit-top`, `--lit-bot`, `--lit-l`, `--lit-r` shade each print and
 * placard; `--sx` / `--sy` are the directional cast-shadow offsets (projected
 * away from the object's strongest fixture at its true world-space depth:
 * `0.14u` for placards, `0.22u` for prints).
 *
 * No DOM reads and no hooks state: the same inputs always produce the same map,
 * so a `useMemo` on `(albums)` is enough and the render path never re-measures.
 */

import { buildWorldFixtures, type WorldShadedObject } from '@/lib/lighting/fixtures';
import type { WallAlbum } from '@/lib/layout/types';

export type GalleryLightingVars = Record<string, string>;

/** Stable key for one CSS target: `albumId:kind:index` (placards use `0`). */
export function galleryLightingKey(
  albumId: string,
  kind: WorldShadedObject['kind'],
  index: number,
): string {
  return `${albumId}:${kind}:${index}`;
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

function litVar(value: number): string {
  return String(Number(clamp01(value).toFixed(4)));
}

function pxVar(value: number): string {
  const safe = Number.isFinite(value) ? value : 0;
  return `${Number(safe.toFixed(2))}px`;
}

/** Format one shaded object into inline CSS custom properties. */
export function computeObjectCssVars(object: WorldShadedObject): GalleryLightingVars {
  return {
    '--lit': litVar(object.lit),
    '--lit-top': litVar(object.litTop),
    '--lit-bot': litVar(object.litBot),
    '--lit-l': litVar(object.litL),
    '--lit-r': litVar(object.litR),
    '--sx': pxVar(object.shadow.sx),
    '--sy': pxVar(object.shadow.sy),
  };
}

/**
 * Shade every print and placard on the wall.
 *
 * `buildWorldFixtures` emits, per album, one object per photo (in the album's
 * photo array order) followed by the placard, so the print index used in the key
 * is simply the running print count for that album.
 */
export function computeGalleryLightingVars(
  albums: readonly WallAlbum[],
): Map<string, GalleryLightingVars> {
  const vars = new Map<string, GalleryLightingVars>();
  if (albums.length === 0) return vars;

  const { objects } = buildWorldFixtures([...albums]);
  const printIndexByAlbum = new Map<string, number>();

  for (const object of objects) {
    let index = 0;
    if (object.kind === 'print') {
      index = printIndexByAlbum.get(object.albumId) ?? 0;
      printIndexByAlbum.set(object.albumId, index + 1);
    }
    vars.set(galleryLightingKey(object.albumId, object.kind, index), computeObjectCssVars(object));
  }

  return vars;
}
