/**
 * Pinned demo fixtures (`?demo=4`, `?demo=1000`).
 *
 * `four` must stay a byte-for-byte reproduction of
 * `playgrounds/photo_wall_playground.html` (`dcc7a048`): same titles, captions,
 * 12/15/12/16 counts, 4/5/4/4 columns, positions, soundtracks, aspects and
 * procedural `PALETTES` art. `thousand` stays 50 x 20 so the macro-tier budget
 * keeps being measured against the same wall.
 */

import { readdir, stat } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { buildDemoWallSummary } from '../fakeManifest';
import { MAX_PHOTOS_PER_ALBUM } from '@/lib/layout/islandLayout';

const DEMO_DIR = path.resolve(process.cwd(), 'public/demo');

describe('demo manifests carry the base path', () => {
  it('serves /photos/demo for both fixtures', () => {
    expect(buildDemoWallSummary('four').cdnBase).toBe('/photos/demo');
    expect(buildDemoWallSummary('thousand').cdnBase).toBe('/photos/demo');
  });
});

describe('?demo=4 playground parity fixture', () => {
  const wall = buildDemoWallSummary('four');

  it('is exactly the playground four albums (12/15/12/16 = 55 prints)', () => {
    expect(wall.albums.map((album) => album.title)).toEqual([
      'Tokyo Nocturnes',
      'Pacific Coastline',
      'Brutalist Concrete',
      'Alpine Winter',
    ]);
    expect(wall.albums.map((album) => album.photos.length)).toEqual([12, 15, 12, 16]);
    expect(wall.albums.reduce((sum, album) => sum + album.photos.length, 0)).toBe(55);
    expect(wall.albums.every((album) => album.photos.length <= MAX_PHOTOS_PER_ALBUM)).toBe(true);
  });

  it('uses the playground captions, columns, 2x2 grid and soundtracks', () => {
    const top = (album: (typeof wall.albums)[number]) =>
      album.position.y + album.bounds.height / 2;
    expect(wall.albums.map((album) => album.gridColumns)).toEqual([4, 5, 4, 4]);
    expect(top(wall.albums[0])).toBeCloseTo(top(wall.albums[1]), 6);
    expect(top(wall.albums[2])).toBeCloseTo(top(wall.albums[3]), 6);
    expect(top(wall.albums[0])).toBeGreaterThan(top(wall.albums[2]));
    expect(wall.albums.map((album) => album.soundtrack?.videoId ?? null)).toEqual([
      'jfKfPfyJRdk',
      '5qap5aO4i9A',
      null,
      'DWcJFNfaw9c',
    ]);
    expect(wall.albums[0].description).toBe('35mm autumn studies, 2025.');
  });

  it('uses the exact playground aspects and PALETTES SVG art', () => {
    const expectedAspects = [1.45, 0.72, 1.33, 0.78, 1.0, 1.5, 0.75, 1.28, 0.82, 1.4];
    wall.albums.forEach((album, index) => {
      const seedOffset = [1, 3, 5, 7][index];
      album.photos.forEach((photo, photoIndex) => {
        expect(photo.aspectRatio).toBe(expectedAspects[(photoIndex + seedOffset) % expectedAspects.length]);
        expect(photo.storagePath.startsWith('data:image/svg+xml;charset=utf-8,')).toBe(true);
      });
    });
    // Different albums carry different palettes.
    expect(wall.albums[0].photos[0].storagePath).not.toBe(wall.albums[1].photos[0].storagePath);
  });

  it('lays row 0 above row 1 in balanced 2x2 with positive production geometry', () => {
    const row0 = wall.albums.slice(0, 2);
    const row1 = wall.albums.slice(2, 4);
    const top = (album: (typeof wall.albums)[number]) =>
      album.position.y + album.bounds.height / 2;
    expect(top(row0[0])).toBeCloseTo(top(row0[1]), 6);
    expect(top(row1[0])).toBeCloseTo(top(row1[1]), 6);
    expect(top(row1[0])).toBeLessThan(top(row0[0]));
    for (const album of wall.albums) {
      expect(album.bounds.width).toBeGreaterThan(0);
      expect(album.bounds.height).toBeGreaterThan(0);
      expect(album.gridColumns).toBeGreaterThanOrEqual(4);
      expect(album.gridColumns).toBeLessThanOrEqual(5);
    }
  });
});

describe('?demo=1000 stress fixture', () => {
  const wall = buildDemoWallSummary('thousand');

  it('is 50 albums x 20 prints = 1,000', () => {
    expect(wall.albums).toHaveLength(50);
    expect(wall.albums.every((album) => album.photos.length === 20)).toBe(true);
    expect(wall.albums.reduce((sum, album) => sum + album.photos.length, 0)).toBe(1_000);
  });

  it('mixes the three salon aspect ratios and stays within the 20-print cap', () => {
    const aspects = new Set(
      wall.albums.flatMap((album) => album.photos.map((photo) => photo.aspectRatio.toFixed(3))),
    );
    expect([...aspects].sort()).toEqual(['0.667', '0.800', '1.500'].sort());
    expect(wall.albums.every((album) => album.photos.length <= MAX_PHOTOS_PER_ALBUM)).toBe(true);
  });

  it('ships the referenced JPEG files (no 404s when the fixture renders)', async () => {
    const committed = new Set(await readdir(DEMO_DIR));
    for (const album of wall.albums) {
      for (const photo of album.photos) {
        expect(committed.has(photo.storagePath), `${photo.storagePath} missing`).toBe(true);
      }
    }

    const sample = path.join(DEMO_DIR, wall.albums[0].photos[0].storagePath);
    const info = await stat(sample);
    expect(info.size).toBeGreaterThan(2_000);
  });
});
