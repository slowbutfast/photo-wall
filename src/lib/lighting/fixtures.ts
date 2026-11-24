/**
 * Unified analytic spotlight model shared by the PBR wall shader, the
 * instanced print/placard shading, and wall-plane cast shadows.
 *
 * One track head is placed per `fixturePerCols` grid columns, aimed
 * `hotspotFrac` down the grid. Irradiance and shadows are evaluated at every
 * object's true world-space `z` (`0.14` placards, `0.22` prints) on the CPU at
 * manifest load so the renderer only uploads flat instance attributes.
 */

import {
  CELL_SIZE,
  PLACARD_GAP,
  PLACARD_WIDTH,
  computeAlbumGrid,
} from '../layout/islandLayout';
import type { WallAlbum } from '../layout/types';

export interface LightConfig {
  /** One track head per this many grid columns. */
  fixturePerCols: number;
  /** Cone axis aims this fraction down the grid (top-row bias). */
  hotspotFrac: number;
  /** Fixture height above the hotspot, as a fraction of grid height. */
  heightFrac: number;
  /** Fixture standoff from the wall, as a fraction of grid height. */
  throwFrac: number;
  innerDeg: number;
  outerDeg: number;
  /** Minimum object illumination outside every cone (0–1). */
  ambientObj: number;
  warm: string;
}

export const LIGHT_CFG: LightConfig = {
  fixturePerCols: 2,
  hotspotFrac: 0.28,
  heightFrac: 0.98,
  throwFrac: 0.72,
  innerDeg: 16,
  outerDeg: 32,
  ambientObj: 0.42,
  warm: '#FFF5E3',
};

/** World-space standoffs for the physical z-layers. */
export const PLACARD_Z = 0.14;
export const PRINT_Z = 0.22;

export type Vec3 = [number, number, number];
export type Vec2 = [number, number];

export interface WorldFixture {
  albumId: string;
  /** World position of the track head. */
  pos: Vec3;
  /** Unit cone axis pointing from the fixture toward its hotspot. */
  axis: Vec3;
  /** World position of the hotspot on the wall plane. */
  hot: Vec2;
  /** `1 / peakIrradiance` for this album. */
  invPeak: number;
}

export interface WorldShadow {
  sx: number;
  sy: number;
}

export interface WorldShadedObject {
  albumId: string;
  kind: 'print' | 'placard';
  x: number;
  y: number;
  z: number;
  width: number;
  height: number;
  lit: number;
  litTop: number;
  litBot: number;
  litL: number;
  litR: number;
  shadow: WorldShadow;
}

export interface WorldFixturesResult {
  fixtures: WorldFixture[];
  objects: WorldShadedObject[];
}

const DEG_TO_RAD = Math.PI / 180;

function smoothstep(edge0: number, edge1: number, value: number): number {
  const t = Math.min(1, Math.max(0, (value - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/**
 * Raw (un-normalised) irradiance at `(x, y, h)` from a set of fixtures.
 * `h` is the object's physical standoff from the wall.
 */
export function rawIrradiance(
  fixtures: readonly WorldFixture[],
  x: number,
  y: number,
  h: number,
): number {
  const cosInner = Math.cos(LIGHT_CFG.innerDeg * DEG_TO_RAD);
  const cosOuter = Math.cos(LIGHT_CFG.outerDeg * DEG_TO_RAD);
  let energy = 0;

  for (const fixture of fixtures) {
    const dx = x - fixture.pos[0];
    const dy = y - fixture.pos[1];
    const dz = h - fixture.pos[2];
    const distance = Math.hypot(dx, dy, dz);
    if (distance < 1e-6) continue;

    // L points from the object toward the fixture.
    const lx = -dx / distance;
    const ly = -dy / distance;
    const lz = -dz / distance;
    const nDotL = Math.max(0, lz);
    const cone = smoothstep(
      cosOuter,
      cosInner,
      -(lx * fixture.axis[0] + ly * fixture.axis[1] + lz * fixture.axis[2]),
    );
    energy += (nDotL * cone) / (distance * distance);
  }

  return energy;
}

function shadeObject(
  albumId: string,
  kind: WorldShadedObject['kind'],
  x: number,
  y: number,
  z: number,
  width: number,
  height: number,
  fixtures: readonly WorldFixture[],
  peak: number,
): WorldShadedObject {
  const ambient = LIGHT_CFG.ambientObj;
  const evaluate = (sampleX: number, sampleY: number) =>
    ambient +
    (1 - ambient) * Math.min(1, rawIrradiance(fixtures, sampleX, sampleY, z) / peak);

  let strongest = fixtures[0];
  let strongestEnergy = -1;
  for (const fixture of fixtures) {
    const energy = rawIrradiance([fixture], x, y, z);
    if (energy > strongestEnergy) {
      strongestEnergy = energy;
      strongest = fixture;
    }
  }

  const throwDepth = strongest.pos[2];
  const denominator = throwDepth - z;
  const k = denominator > 1e-4 ? z / denominator : 0;
  const shadow: WorldShadow = {
    sx: (x - strongest.pos[0]) * k,
    sy: (y - strongest.pos[1]) * k,
  };

  return {
    albumId,
    kind,
    x,
    y,
    z,
    width,
    height,
    lit: evaluate(x, y),
    litTop: evaluate(x, y + height / 2),
    litBot: evaluate(x, y - height / 2),
    litL: evaluate(x - width / 2, y),
    litR: evaluate(x + width / 2, y),
    shadow,
  };
}

/**
 * Build world-space fixtures and pre-computed object shading for every album.
 * Uses `computeAlbumGrid` (the shared backend layout contract) for local
 * coordinates and `album.position` for the world origin.
 */
export function buildWorldFixtures(albums: WallAlbum[]): WorldFixturesResult {
  const fixtures: WorldFixture[] = [];
  const objects: WorldShadedObject[] = [];

  for (const album of albums) {
    const grid = computeAlbumGrid(
      album.photos.length,
      album.gridColumns,
      Boolean(album.soundtrack),
    );
    const gridWidth = grid.grid.width;
    const gridHeight = grid.grid.height;
    const islandTop = grid.bounds.height / 2;
    const gridCenterX = (PLACARD_WIDTH + PLACARD_GAP) / 2;
    const heads = Math.max(1, Math.ceil(grid.grid.columns / LIGHT_CFG.fixturePerCols));

    const hotspotLocalY = islandTop - gridHeight * LIGHT_CFG.hotspotFrac;
    const fixtureLift = gridHeight * LIGHT_CFG.heightFrac;
    const throwDepth = gridHeight * LIGHT_CFG.throwFrac;
    const axisLength = Math.hypot(fixtureLift, throwDepth);
    const axis: Vec3 = [0, -fixtureLift / axisLength, -throwDepth / axisLength];

    const albumFixtures: WorldFixture[] = [];
    for (let head = 0; head < heads; head += 1) {
      const localX = gridCenterX - gridWidth / 2 + (gridWidth * (head + 0.5)) / heads;
      albumFixtures.push({
        albumId: album.id,
        pos: [
          album.position.x + localX,
          album.position.y + hotspotLocalY + fixtureLift,
          throwDepth,
        ],
        axis,
        hot: [album.position.x + localX, album.position.y + hotspotLocalY],
        invPeak: 1,
      });
    }

    const peak =
      Math.max(
        ...albumFixtures.map((fixture) => rawIrradiance(albumFixtures, fixture.hot[0], fixture.hot[1], 0)),
      ) || 1;
    const invPeak = 1 / peak;
    for (const fixture of albumFixtures) {
      fixture.invPeak = invPeak;
      fixtures.push(fixture);
    }

    for (const photo of grid.photos) {
      objects.push(
        shadeObject(
          album.id,
          'print',
          album.position.x + photo.x,
          album.position.y + photo.y,
          PRINT_Z,
          CELL_SIZE,
          CELL_SIZE,
          albumFixtures,
          peak,
        ),
      );
    }

    objects.push(
      shadeObject(
        album.id,
        'placard',
        album.position.x + grid.placard.x,
        album.position.y + grid.placard.y,
        PLACARD_Z,
        grid.placard.width,
        grid.placard.height,
        albumFixtures,
        peak,
      ),
    );
  }

  return { fixtures, objects };
}
