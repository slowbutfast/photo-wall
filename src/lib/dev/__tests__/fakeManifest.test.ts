/**
 * Pinned demo fixtures (`?demo=4`, `?demo=1000`).
 *
 * The parity fixture must stay a *matched* visual baseline: four albums, 12-16
 * prints each, all three salon aspect ratios present, and real JPEG bytes behind
 * every print (never SVG data URLs). The stress fixture must stay 50 x 20 so the
 * macro-tier budget from Task 1.5 keeps being measured against the same wall.
 */

import { readdir, stat } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { buildDemoWallSummary } from '../fakeManifest';
import { MAX_PHOTOS_PER_ALBUM } from '@/lib/layout/islandLayout';

const DEMO_DIR = path.resolve(process.cwd(), 'public/demo');

describe('?demo=4 parity fixture', () => {
  const wall = buildDemoWallSummary('four');

  it('is exactly four published albums of 12-16 prints', () => {
    expect(wall.albums).toHaveLength(4);
    for (const album of wall.albums) {
      expect(album.photos.length).toBeGreaterThanOrEqual(12);
      expect(album.photos.length).toBeLessThanOrEqual(16);
      expect(album.photos.length).toBeLessThanOrEqual(MAX_PHOTOS_PER_ALBUM);
    }
    expect(wall.albums.reduce((sum, album) => sum + album.photos.length, 0)).toBe(55);
  });

  it('covers all three salon aspect ratios in every album', () => {
    for (const album of wall.albums) {
      const aspects = new Set(album.photos.map((photo) => photo.aspectRatio.toFixed(3)));
      expect([...aspects].sort()).toEqual(
        ['0.667', '0.800', '1.500'].sort(),
      );
    }
  });

  it('uses real JPEG paths and the pinned /demo CDN base', () => {
    expect(wall.cdnBase).toBe('/demo');
    for (const album of wall.albums) {
      for (const photo of album.photos) {
        expect(photo.storagePath).toMatch(/^photo-\d{2}\.jpg$/);
        expect(photo.storagePath.startsWith('data:')).toBe(false);
      }
    }
  });

  it('lays the albums out with the production 3-column wall geometry', () => {
    const row0 = wall.albums.slice(0, 3);
    const row1 = wall.albums.slice(3);
    expect(row0.every((album) => album.position.y === row0[0].position.y)).toBe(true);
    expect(row1[0].position.y).toBeLessThan(row0[0].position.y);
    for (const album of wall.albums) {
      expect(album.bounds.width).toBeGreaterThan(0);
      expect(album.bounds.height).toBeGreaterThan(0);
      expect(album.gridColumns).toBeGreaterThanOrEqual(4);
      expect(album.gridColumns).toBeLessThanOrEqual(5);
    }
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
});
