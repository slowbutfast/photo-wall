/**
 * Task 1.2 — pure CSS-variable lighting contract (`src/components/wall/useGalleryLighting.ts`, Task 3.1).
 *
 * The hook must be memoizable and DOM-free: it consumes the same
 * `WorldShadedObject`s that `buildWorldFixtures` already shades at each object's
 * true world-space depth (`0.14u` placard, `0.22u` prints) and emits inline CSS
 * custom properties. No `getBoundingClientRect`, no `MutationObserver`, no
 * `window` access — this suite runs in a Node environment with no DOM at all.
 */

import { describe, expect, it } from 'vitest';

import {
  computeGalleryLightingVars,
  computeObjectCssVars,
  galleryLightingKey,
} from '../useGalleryLighting';
import { PLACARD_Z, PRINT_Z, buildWorldFixtures } from '@/lib/lighting/fixtures';
import { computeAlbumGrid, computeWallGridPositions } from '@/lib/layout/islandLayout';
import type { WallAlbum, WallPhoto } from '@/lib/layout/types';

const LIT_VARS = ['--lit', '--lit-top', '--lit-bot', '--lit-l', '--lit-r'] as const;
const SHADOW_VARS = ['--sx', '--sy'] as const;

function makePhotos(albumId: string, count: number): WallPhoto[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `${albumId}-p${index}`,
    storagePath: `${albumId}/${index}.jpg`,
    width: 1600,
    height: 1200,
    aspectRatio: 4 / 3,
    dominantColor: null,
    thumbHash: null,
    sortOrder: index,
  }));
}

function makeAlbums(specs: Array<{ id: string; photos: number; gridColumns: number }>): WallAlbum[] {
  const seeds = specs.map((spec, index) => ({
    id: spec.id,
    status: 'published' as const,
    photoCount: spec.photos,
    gridColumns: spec.gridColumns,
    sortOrder: index,
    hasSoundtrack: false,
  }));
  const placementById = new Map(
    computeWallGridPositions(seeds).map((placement) => [placement.id, placement]),
  );

  return specs.map((spec, index) => {
    const placement = placementById.get(spec.id);
    if (!placement) throw new Error(`missing placement for ${spec.id}`);
    return {
      id: spec.id,
      slug: spec.id,
      title: spec.id,
      description: null,
      gridColumns: spec.gridColumns,
      sortOrder: index,
      position: placement.position,
      bounds: placement.bounds,
      cameraName: null,
      dateLabel: null,
      locationLabel: null,
      soundtrack: null,
      photos: makePhotos(spec.id, spec.photos),
    } satisfies WallAlbum;
  });
}

function numericVar(vars: Record<string, string>, name: string): number {
  const raw = vars[name];
  expect(raw, `${name} missing`).toBeTypeOf('string');
  const value = Number(raw);
  expect(Number.isFinite(value), `${name} is not numeric: ${raw}`).toBe(true);
  return value;
}

function pxVar(vars: Record<string, string>, name: string): number {
  const raw = vars[name];
  expect(raw, `${name} missing`).toBeTypeOf('string');
  expect(raw.endsWith('px'), `${name} must be a px length: ${raw}`).toBe(true);
  const value = Number(raw.slice(0, -2));
  expect(Number.isFinite(value), `${name} is not numeric: ${raw}`).toBe(true);
  return value;
}

describe('gallery lighting keys', () => {
  it('addresses every print and its placard unambiguously', () => {
    expect(galleryLightingKey('album-a', 'print', 3)).toBe('album-a:print:3');
    expect(galleryLightingKey('album-a', 'placard', 0)).toBe('album-a:placard:0');
    expect(galleryLightingKey('album-a', 'print', 3)).not.toBe(
      galleryLightingKey('album-a', 'placard', 3),
    );
  });
});

describe('computeGalleryLightingVars', () => {
  const albums = makeAlbums([
    { id: 'alpha', photos: 6, gridColumns: 3 },
    { id: 'beta', photos: 4, gridColumns: 2 },
  ]);

  it('emits one entry per print plus one per placard', () => {
    const vars = computeGalleryLightingVars(albums);

    expect(vars.size).toBe(6 + 1 + 4 + 1);
    for (let index = 0; index < 6; index += 1) {
      expect(vars.has(galleryLightingKey('alpha', 'print', index))).toBe(true);
    }
    expect(vars.has(galleryLightingKey('alpha', 'placard', 0))).toBe(true);
    for (let index = 0; index < 4; index += 1) {
      expect(vars.has(galleryLightingKey('beta', 'print', index))).toBe(true);
    }
    expect(vars.has(galleryLightingKey('beta', 'placard', 0))).toBe(true);
  });

  it('emits the full --lit* / --sx / --sy custom-property set', () => {
    const vars = computeGalleryLightingVars(albums);
    for (const entry of vars.values()) {
      for (const name of LIT_VARS) expect(entry).toHaveProperty(name);
      for (const name of SHADOW_VARS) expect(entry).toHaveProperty(name);
      for (const name of LIT_VARS) {
        const value = numericVar(entry, name);
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThanOrEqual(1);
      }
      for (const name of SHADOW_VARS) pxVar(entry, name);
    }
  });

  it('derives every variable from the shared world shading (true depths flow through)', () => {
    const vars = computeGalleryLightingVars(albums);
    const { objects } = buildWorldFixtures(albums);

    // Exactly one shaded object per CSS target.
    expect(objects.length).toBe(vars.size);

    for (const album of albums) {
      const grid = computeAlbumGrid(album.photos.length, album.gridColumns, false);

      grid.photos.forEach((cell, index) => {
        const worldX = album.position.x + cell.x;
        const worldY = album.position.y + cell.y;
        const shaded = objects.filter(
          (object) =>
            object.albumId === album.id &&
            object.kind === 'print' &&
            Math.abs(object.x - worldX) < 1e-9 &&
            Math.abs(object.y - worldY) < 1e-9,
        );
        expect(shaded).toHaveLength(1);
        const object = shaded[0];
        expect(object.z).toBe(PRINT_Z);

        const key = galleryLightingKey(album.id, 'print', index);
        const entry = vars.get(key);
        expect(entry, `missing vars for ${key}`).toBeDefined();
        expect(entry).toEqual(computeObjectCssVars(object));
        expect(numericVar(entry!, '--lit')).toBeCloseTo(Number(object.lit.toFixed(4)), 6);
        expect(pxVar(entry!, '--sx')).toBeCloseTo(Number(object.shadow.sx.toFixed(2)), 6);
        expect(pxVar(entry!, '--sy')).toBeCloseTo(Number(object.shadow.sy.toFixed(2)), 6);
      });

      const placardWorldX = album.position.x + grid.placard.x;
      const placardWorldY = album.position.y + grid.placard.y;
      const placard = objects.find(
        (object) =>
          object.albumId === album.id &&
          object.kind === 'placard' &&
          Math.abs(object.x - placardWorldX) < 1e-9 &&
          Math.abs(object.y - placardWorldY) < 1e-9,
      );
      expect(placard, `missing placard shading for ${album.id}`).toBeDefined();
      // Placards sit 0.14u off the wall, prints 0.22u: the CSS vars must use
      // each object's real depth, never one shared standoff.
      expect(placard!.z).toBe(PLACARD_Z);

      const placardKey = galleryLightingKey(album.id, 'placard', 0);
      expect(vars.get(placardKey)).toEqual(computeObjectCssVars(placard!));
    }
  });

  it('gives prints and placards different shadows because they sit at different depths', () => {
    const [album] = albums;
    const vars = computeGalleryLightingVars([album]);
    expect(vars.get(galleryLightingKey(album.id, 'placard', 0))).toBeDefined();

    const { objects } = buildWorldFixtures([album]);
    const shadedPlacard = objects.find((object) => object.kind === 'placard');
    expect(shadedPlacard).toBeDefined();
    expect(shadedPlacard!.z).toBe(PLACARD_Z);

    const printShadows = objects
      .filter((object) => object.kind === 'print')
      .map((object) => Math.hypot(object.shadow.sx, object.shadow.sy));
    const placardShadow = Math.hypot(shadedPlacard!.shadow.sx, shadedPlacard!.shadow.sy);

    // Prints stand further off the wall (0.22u > 0.14u) so their directional
    // shadows reach further than the placard's for the same lighting rig.
    expect(Math.max(...printShadows)).toBeGreaterThan(placardShadow);
    expect(printShadows.every((value) => Number.isFinite(value))).toBe(true);
  });

  it('is deterministic, allocation-stable and DOM-free', () => {
    expect(typeof document).toBe('undefined');
    expect(typeof window).toBe('undefined');

    const first = computeGalleryLightingVars(albums);
    const second = computeGalleryLightingVars(albums);

    expect(first.size).toBe(second.size);
    for (const [key, value] of first) {
      expect(second.get(key)).toEqual(value);
    }
    // Values are plain inline-style CSS custom properties.
    for (const entry of first.values()) {
      for (const name of Object.keys(entry)) {
        expect(name.startsWith('--')).toBe(true);
      }
    }
  });

  it('returns an empty map for an empty wall', () => {
    expect(computeGalleryLightingVars([]).size).toBe(0);
  });
});

describe('computeObjectCssVars', () => {
  it('formats each channel and shadow into CSS-ready strings', () => {
    const vars = computeObjectCssVars({
      albumId: 'a',
      kind: 'print',
      x: 0,
      y: 0,
      z: PRINT_Z,
      width: 1,
      height: 1,
      lit: 0.81234,
      litTop: 0.9,
      litBot: 0.7,
      litL: 0.75,
      litR: 0.85,
      shadow: { sx: 2.3456, sy: -1.2 },
    });

    expect(vars['--lit']).toBe('0.8123');
    expect(vars['--lit-top']).toBe('0.9');
    expect(vars['--lit-bot']).toBe('0.7');
    expect(vars['--lit-l']).toBe('0.75');
    expect(vars['--lit-r']).toBe('0.85');
    expect(vars['--sx']).toBe('2.35px');
    expect(vars['--sy']).toBe('-1.2px');
  });

  it('clamps stray out-of-range lighting samples into [0, 1]', () => {
    const vars = computeObjectCssVars({
      albumId: 'a',
      kind: 'placard',
      x: 0,
      y: 0,
      z: PLACARD_Z,
      width: 2,
      height: 2,
      lit: 1.4,
      litTop: -0.2,
      litBot: 2,
      litL: Number.NaN,
      litR: 0.5,
      shadow: { sx: 0, sy: 0 },
    });

    expect(numericVar(vars, '--lit')).toBe(1);
    expect(numericVar(vars, '--lit-top')).toBe(0);
    expect(numericVar(vars, '--lit-bot')).toBe(1);
    expect(numericVar(vars, '--lit-l')).toBe(0);
    expect(numericVar(vars, '--lit-r')).toBe(0.5);
  });
});
