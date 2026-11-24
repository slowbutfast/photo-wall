import { describe, expect, it } from 'vitest';

import {
  LIGHT_CFG,
  MAX_SPOTS,
  PLACARD_DEPTH,
  PRINT_DEPTH,
  WALL_SHADER_CFG,
  computePlaygroundLighting,
  packFixtureDataTexture,
  playgroundFrameSize,
  rawIrradiance,
  selectVisibleSpots,
  type PlaygroundFixture,
} from '../playgroundLighting';
import { computeAlbumGrid } from '@/lib/layout/islandLayout';
import type { WallAlbum, WallPhoto } from '@/lib/layout/types';

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

function spot(x: number, y = 0, invPeak = 1, ellipseX = 1): PlaygroundFixture {
  return {
    albumId: 'a',
    pos: [x, y, 4],
    axis: [0, -1, 0],
    hot: [x, y],
    invPeak,
    ellipseX,
    bounds: { x, y, width: 2, height: 2 },
  };
}

describe('WALL_SHADER_CFG', () => {
  it('locks the fine-grain architectural plaster PBR surface constants', () => {
    expect(WALL_SHADER_CFG).toEqual({
      tileUnits: 2.2,
      normalStrength: 0.4,
      aoStrength: 0.55,
    });
  });
});

describe('LIGHT_CFG', () => {
  it('locks the wide single-wash elliptical spotlight constants', () => {
    expect(LIGHT_CFG.fixturePerCols).toBe(99);
    expect(LIGHT_CFG.hotspotFrac).toBe(0.34);
    expect(LIGHT_CFG.heightFrac).toBe(1.05);
    expect(LIGHT_CFG.innerDeg).toBe(26);
    expect(LIGHT_CFG.outerDeg).toBe(54);
    expect(LIGHT_CFG.ambientObj).toBeCloseTo(0.56, 10);
    expect(LIGHT_CFG.objDepth).toBe(9);
    expect(LIGHT_CFG.throwFrac).toBe(1.15);
    expect(LIGHT_CFG.placardDepth).toBe(14);
    expect(LIGHT_CFG.printDepth).toBe(22);
    expect(PLACARD_DEPTH).toBeCloseTo(0.14, 10);
    expect(PRINT_DEPTH).toBeCloseTo(0.22, 10);
  });
});

describe('selectVisibleSpots', () => {
  it('culls fixtures outside the padded visible wall rectangle', () => {
    const fixtures = [spot(-1000), spot(0), spot(1000)];
    const visible = selectVisibleSpots(fixtures, { x: 0, y: 0, z: 10 }, { width: 800, height: 600 });
    expect(visible.map((fixture) => fixture.pos[0])).toEqual([0]);
  });

  it('caps the number of fixtures fed to the single-pass shader', () => {
    const fixtures = Array.from({ length: 300 }, () => spot(0));
    const visible = selectVisibleSpots(fixtures, { x: 0, y: 0, z: 10 }, { width: 800, height: 600 }, 256);
    expect(visible).toHaveLength(256);
    expect(MAX_SPOTS).toBe(256);
  });

  it('keeps all 50 single-wash fixtures lit for a 50-album 5-column wall and prioritizes nearest spots when capped', () => {
    const albums = Array.from({ length: 50 }, (_, index) =>
      makeAlbum(`a-${index}`, 20, 5, { x: (index % 3) * 10, y: -Math.floor(index / 3) * 8 }),
    );
    const { fixtures } = computePlaygroundLighting(albums);
    expect(fixtures).toHaveLength(50);

    const visible = selectVisibleSpots(
      fixtures,
      { x: 10, y: -60, z: 140 },
      { width: 1440, height: 900 },
    );
    expect(visible).toHaveLength(50);

    const capped = selectVisibleSpots(
      [spot(20, 0), spot(1, 0), spot(10, 0), spot(-2, 0)],
      { x: 0, y: 0, z: 40 },
      { width: 1440, height: 900 },
      2,
    );
    expect(capped.map((fixture) => fixture.pos[0])).toEqual([1, -2]);
  });

  it('accepts a custom cap and degrades to an empty list for a non-positive cap', () => {
    const fixtures = Array.from({ length: 10 }, () => spot(0));
    expect(selectVisibleSpots(fixtures, { x: 0, y: 0, z: 10 }, { width: 800, height: 600 }, 3)).toHaveLength(3);
    expect(selectVisibleSpots(fixtures, { x: 0, y: 0, z: 10 }, { width: 800, height: 600 }, 0)).toEqual([]);
  });
});

describe('packFixtureDataTexture', () => {
  it('writes position row first, then the axis+ellipseX row (no interleaving)', () => {
    const fixtures = [spot(1, 2, 0.25, 1.5), spot(3, 4, 0.5, 2.0)];
    const data = packFixtureDataTexture(fixtures);
    expect(data).toHaveLength(2 * 8);

    // Row 0: pos.xyz + 1/peak per spot.
    expect(Array.from(data.slice(0, 4))).toEqual([1, 2, 4, 0.25]);
    expect(Array.from(data.slice(4, 8))).toEqual([3, 4, 4, 0.5]);
    // Row 1: axis.xyz + ellipseX per spot.
    expect(Array.from(data.slice(8, 12))).toEqual([0, -1, 0, 1.5]);
    expect(Array.from(data.slice(12, 16))).toEqual([0, -1, 0, 2.0]);
  });

  it('returns an empty payload for no spots', () => {
    expect(packFixtureDataTexture([])).toHaveLength(0);
  });
});

describe('computePlaygroundLighting', () => {
  const album = makeAlbum('rows', 12, 4);

  it('emits one wide elliptical cluster wash fixture per album covering placard and grid', () => {
    const { fixtures, objects } = computePlaygroundLighting([album]);
    expect(fixtures).toHaveLength(1);
    const fixture = fixtures[0];
    expect(Math.hypot(...fixture.axis)).toBeCloseTo(1, 9);
    expect(fixture.invPeak).toBeGreaterThan(0);
    expect(fixture.ellipseX).toBeGreaterThanOrEqual(1);
    expect(fixture.pos[2]).toBeGreaterThan(0);
    // The axis points down and back toward the wall.
    expect(fixture.axis[1]).toBeLessThan(0);
    expect(fixture.axis[2]).toBeLessThan(0);

    const placard = objects.find((object) => object.kind === 'placard')!;
    expect(placard.lit).toBeGreaterThanOrEqual(0.72);
  });

  it('emits one placard plus every print at their true standoff depths', () => {
    const { objects } = computePlaygroundLighting([album]);
    const placards = objects.filter((object) => object.kind === 'placard');
    const prints = objects.filter((object) => object.kind === 'print');
    expect(placards).toHaveLength(1);
    expect(prints).toHaveLength(12);
    expect(placards[0].z).toBeCloseTo(0.14, 10);
    prints.forEach((print) => expect(print.z).toBeCloseTo(0.22, 10));
  });

  it('lights the top row more than the bottom row and keeps the 0.42 floor', () => {
    const { objects } = computePlaygroundLighting([album]);
    const prints = objects
      .filter((object) => object.kind === 'print')
      .sort((a, b) => b.y - a.y);
    const average = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;

    expect(average(prints.slice(0, 4).map((print) => print.lit))).toBeGreaterThan(
      average(prints.slice(-4).map((print) => print.lit)),
    );
    prints.forEach((print) => {
      expect(print.lit).toBeGreaterThanOrEqual(LIGHT_CFG.ambientObj - 1e-9);
      expect(print.litTop).toBeGreaterThanOrEqual(print.litBot - 1e-9);
    });
  });

  it('matches the playground rawIrradiance port for a known sample', () => {
    const { fixtures, objects } = computePlaygroundLighting([album]);
    const albumFixtures = fixtures.filter((fixture) => fixture.albumId === 'rows');
    const print = objects.find((object) => object.kind === 'print')!;
    const peak = 1 / albumFixtures[0].invPeak;
    const expected =
      LIGHT_CFG.ambientObj +
      (1 - LIGHT_CFG.ambientObj) *
        Math.min(1, rawIrradiance(albumFixtures, print.x, print.y, PRINT_DEPTH) / peak);
    expect(print.lit).toBeCloseTo(expected, 8);
  });
});

describe('playgroundFrameSize', () => {
  it('fits inside 140px plus the 11px mat on every side', () => {
    const square = playgroundFrameSize(1);
    expect(square.width).toBeCloseTo(1.62, 10);
    expect(square.height).toBeCloseTo(1.62, 10);
    expect(playgroundFrameSize(1.4).height).toBeCloseTo(1.22, 10);
    expect(playgroundFrameSize(0.5).width).toBeCloseTo(0.92, 10);
  });
});
