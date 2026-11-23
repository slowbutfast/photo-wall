import { describe, expect, it } from 'vitest';
import {
  CELL_SIZE,
  ISLAND_GAP,
  PLACARD_HEIGHT,
  PLACARD_WIDTH,
  computeAlbumGrid,
} from '../../layout/islandLayout';
import type { WallAlbum, WallPhoto } from '../../layout/types';
import {
  LIGHT_CFG,
  buildWorldFixtures,
  rawIrradiance,
  type WorldShadedObject,
} from '../fixtures';

function makePhotos(albumId: string, count: number): WallPhoto[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `${albumId}-p${index}`,
    storagePath: `${albumId}/${index}.jpg`,
    width: 800,
    height: 600,
    aspectRatio: 4 / 3,
    dominantColor: null,
    thumbHash: null,
    sortOrder: index,
  }));
}

function makeAlbum(
  id: string,
  count: number,
  gridColumns: number,
  position = { x: 0, y: 0 },
): WallAlbum {
  const grid = computeAlbumGrid(count, gridColumns, false);
  return {
    id,
    slug: id,
    title: id,
    description: null,
    gridColumns,
    sortOrder: 0,
    position,
    bounds: grid.bounds,
    cameraName: null,
    dateLabel: null,
    locationLabel: null,
    soundtrack: null,
    photos: makePhotos(id, count),
  };
}

function objectsFor(objects: WorldShadedObject[], albumId: string): WorldShadedObject[] {
  return objects.filter((object) => object.albumId === albumId);
}

describe('LIGHT_CFG', () => {
  it('locks the unified spotlight model constants', () => {
    expect(LIGHT_CFG.fixturePerCols).toBe(2);
    expect(LIGHT_CFG.hotspotFrac).toBe(0.28);
    expect(LIGHT_CFG.heightFrac).toBe(0.98);
    expect(LIGHT_CFG.throwFrac).toBe(0.72);
    expect(LIGHT_CFG.innerDeg).toBe(16);
    expect(LIGHT_CFG.outerDeg).toBe(32);
    expect(LIGHT_CFG.ambientObj).toBeCloseTo(0.42, 10);
    expect(LIGHT_CFG.warm).toBe('#FFF5E3');
  });
});

describe('buildWorldFixtures', () => {
  it('emits one track head per two grid columns (ceil)', () => {
    const albums = [
      makeAlbum('three', 6, 3, { x: 0, y: 0 }),
      makeAlbum('five', 10, 5, { x: 20, y: 0 }),
      makeAlbum('one', 1, 6, { x: -20, y: 0 }),
    ];
    const { fixtures } = buildWorldFixtures(albums);

    expect(fixtures.filter((f) => f.albumId === 'three')).toHaveLength(2);
    // Only one photo exists, so only one column is used even with gridColumns = 6.
    expect(fixtures.filter((f) => f.albumId === 'one')).toHaveLength(1);
    expect(fixtures.filter((f) => f.albumId === 'five')).toHaveLength(3);
  });

  it('places fixtures at exact world coordinates with a unit axis toward the hotspot', () => {
    const album = makeAlbum('one', 6, 3, { x: 4, y: -2 });
    const grid = computeAlbumGrid(6, 3, false);
    const { fixtures } = buildWorldFixtures([album]);
    const gridWidth = grid.grid.width;
    const gridHeight = grid.grid.height;
    const islandTop = grid.bounds.height / 2;
    const gridLeft = (PLACARD_WIDTH + ISLAND_GAP) / 2 - gridWidth / 2;
    const heads = fixtures.length;
    const throwDepth = gridHeight * LIGHT_CFG.throwFrac;
    const fixtureLift = gridHeight * LIGHT_CFG.heightFrac;
    const hotspotLocalY = islandTop - gridHeight * LIGHT_CFG.hotspotFrac;

    fixtures.forEach((fixture, index) => {
      const expectedX = album.position.x + gridLeft + (gridWidth * (index + 0.5)) / heads;
      const expectedY = album.position.y + hotspotLocalY + fixtureLift;
      expect(fixture.pos[0]).toBeCloseTo(expectedX, 9);
      expect(fixture.pos[1]).toBeCloseTo(expectedY, 9);
      expect(fixture.pos[2]).toBeCloseTo(throwDepth, 9);
      expect(fixture.hot[0]).toBeCloseTo(expectedX, 9);
      expect(fixture.hot[1]).toBeCloseTo(album.position.y + hotspotLocalY, 9);
      expect(fixture.axis[0]).toBeCloseTo(0, 12);
      expect(fixture.axis[1]).toBeCloseTo(-fixtureLift / Math.hypot(fixtureLift, throwDepth), 9);
      expect(fixture.axis[2]).toBeCloseTo(-throwDepth / Math.hypot(fixtureLift, throwDepth), 9);
      expect(Math.hypot(...fixture.axis)).toBeCloseTo(1, 9);
      expect(fixture.invPeak).toBeGreaterThan(0);
    });
  });

  it('emits one placard plus every print using their true world-space z', () => {
    const album = makeAlbum('shade', 6, 3, { x: 0, y: 0 });
    const { objects } = buildWorldFixtures([album]);
    const albumObjects = objectsFor(objects, 'shade');

    const placards = albumObjects.filter((object) => object.kind === 'placard');
    const prints = albumObjects.filter((object) => object.kind === 'print');
    expect(placards).toHaveLength(1);
    expect(prints).toHaveLength(6);
    expect(placards[0].z).toBeCloseTo(0.14, 10);
    expect(placards[0].width).toBeCloseTo(PLACARD_WIDTH, 10);
    expect(placards[0].height).toBeCloseTo(PLACARD_HEIGHT, 10);
    prints.forEach((print) => {
      expect(print.z).toBeCloseTo(0.22, 10);
      expect(print.width).toBeCloseTo(CELL_SIZE, 10);
      expect(print.height).toBeCloseTo(CELL_SIZE, 10);
    });
  });

  it('lights the top row more than the bottom row', () => {
    const album = makeAlbum('rows', 6, 3, { x: 0, y: 0 });
    const { objects } = buildWorldFixtures([album]);
    const prints = objectsFor(objects, 'rows').filter((object) => object.kind === 'print');

    const sortedByY = [...prints].sort((a, b) => b.y - a.y);
    const topRow = sortedByY.slice(0, 3);
    const bottomRow = sortedByY.slice(3);
    const average = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;

    expect(average(topRow.map((print) => print.lit))).toBeGreaterThan(
      average(bottomRow.map((print) => print.lit)),
    );
    prints.forEach((print) => {
      expect(print.litTop).toBeGreaterThanOrEqual(print.litBot - 1e-9);
    });
  });

  it('computes lit values from each object’s actual z (not a shared depth)', () => {
    const album = makeAlbum('depth', 6, 3, { x: 0, y: 0 });
    const { fixtures, objects } = buildWorldFixtures([album]);
    const albumFixtures = fixtures.filter((fixture) => fixture.albumId === 'depth');
    const peak = 1 / albumFixtures[0].invPeak;
    const evaluate = (x: number, y: number, z: number) =>
      LIGHT_CFG.ambientObj +
      (1 - LIGHT_CFG.ambientObj) *
        Math.min(1, rawIrradiance(albumFixtures, x, y, z) / peak);

    const placard = objectsFor(objects, 'depth').find((object) => object.kind === 'placard')!;
    const print = objectsFor(objects, 'depth').find((object) => object.kind === 'print')!;

    expect(placard.lit).toBeCloseTo(evaluate(placard.x, placard.y, 0.14), 8);
    expect(print.lit).toBeCloseTo(evaluate(print.x, print.y, 0.22), 8);
    // The same point evaluated at the placard vs print standoff differs, so
    // the true per-object z is actually carried into the irradiance math.
    expect(rawIrradiance(albumFixtures, print.x, print.y, 0.22)).not.toBeCloseTo(
      rawIrradiance(albumFixtures, print.x, print.y, 0.14),
      6,
    );
  });

  it('throws wall-plane shadows away from the strongest fixture using k = z / (D - z)', () => {
    const album = makeAlbum('shadows', 6, 3, { x: 0, y: 0 });
    const { fixtures, objects } = buildWorldFixtures([album]);
    const albumFixtures = fixtures.filter((fixture) => fixture.albumId === 'shadows');
    const prints = objectsFor(objects, 'shadows').filter((object) => object.kind === 'print');

    const sample = prints[0];
    let strongest = albumFixtures[0];
    let strongestE = -1;
    for (const fixture of albumFixtures) {
      const e = rawIrradiance([fixture], sample.x, sample.y, sample.z);
      if (e > strongestE) {
        strongestE = e;
        strongest = fixture;
      }
    }
    const k = sample.z / (strongest.pos[2] - sample.z);

    expect(sample.shadow.sx).toBeCloseTo((sample.x - strongest.pos[0]) * k, 8);
    expect(sample.shadow.sy).toBeCloseTo((sample.y - strongest.pos[1]) * k, 8);
    if (Math.abs(sample.x - strongest.pos[0]) > 1e-9) {
      expect(Math.sign(sample.shadow.sx)).toBe(Math.sign(sample.x - strongest.pos[0]));
    }
    // The overhead fixture sits above the print, so the wall shadow falls downward.
    expect(sample.shadow.sy).toBeLessThan(0);
  });

  it('handles every album independently', () => {
    const albums = [
      makeAlbum('a', 6, 3, { x: -20, y: 0 }),
      makeAlbum('b', 8, 4, { x: 20, y: 0 }),
    ];
    const { fixtures, objects } = buildWorldFixtures(albums);
    expect(fixtures.every((fixture) => fixture.albumId === 'a' || fixture.albumId === 'b')).toBe(true);
    expect(fixtures.filter((fixture) => fixture.albumId === 'a')).toHaveLength(2);
    expect(fixtures.filter((fixture) => fixture.albumId === 'b')).toHaveLength(2);
    expect(objects.filter((object) => object.albumId === 'a')).toHaveLength(7);
    expect(objects.filter((object) => object.albumId === 'b')).toHaveLength(9);
  });
});
