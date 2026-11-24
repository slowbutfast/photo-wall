/**
 * Verbatim lighting math from `playgrounds/photo_wall_playground.html`
 * (`dcc7a048`), expressed in production world units (`100px = 1u`).
 *
 * The playground works in CSS pixels; production geometry already carries the
 * same numbers in world units, so only the constants are divided by 100. Peak
 * normalisation makes the inverse-square term scale-independent, and every
 * emitted CSS custom property is identical to the playground's.
 *
 * This module is pure: no DOM reads, no React. It powers
 *
 * - `computePlaygroundLighting(albums)` → per-object `--lit*` / `--sx` / `--sy`
 *   custom properties for prints and placards, plus wall-space fixtures.
 * - `selectVisibleSpots(fixtures, camera, viewport, 128)` → viewport-culled
 *   fixtures for the single-pass WebGL2 wall.
 * - `packFixtureDataTexture(spots)` → the row-major `RGBA32F` layout consumed by
 *   `PlaygroundPbrWall` (Row 0 = position + 1/peak, Row 1 = cone axis).
 */

import { worldPerPixel } from '@/lib/camera/cameraMath';
import type { CameraState, Viewport } from '@/lib/camera/cameraMath';
import {
  CELL_SIZE,
  PLACARD_GAP,
  PLACARD_WIDTH,
  computeAlbumGrid,
} from '@/lib/layout/islandLayout';
import type { WallAlbum } from '@/lib/layout/types';

/** Playground source works in CSS pixels; production world units are 1/100. */
export const PLAYGROUND_PX_PER_UNIT = 100;

/** Maximum culled fixtures accepted by the single-pass wall shader. */
export const MAX_SPOTS = 128;

/**
 * Exact `LIGHT_CFG` from the playground (`L1389-L1397`) plus its per-object
 * depth overrides (`L1485`). Depths stay in playground pixels so the constants
 * can be compared verbatim against the source; world-space helpers divide by
 * `PLAYGROUND_PX_PER_UNIT`.
 */
export const LIGHT_CFG = {
  fixturePerCols: 2,
  hotspotFrac: 0.28,
  heightFrac: 0.98,
  innerDeg: 16,
  outerDeg: 32,
  ambientObj: 0.42,
  objDepth: 9,
  throwFrac: 0.72,
  placardDepth: 14,
  printDepth: 22,
} as const;

/** Physical z standoffs in world units. */
export const PLACARD_DEPTH = LIGHT_CFG.placardDepth / PLAYGROUND_PX_PER_UNIT;
export const PRINT_DEPTH = LIGHT_CFG.printDepth / PLAYGROUND_PX_PER_UNIT;

export type Vec3 = [number, number, number];
export type Vec2 = [number, number];

export interface PlaygroundFixture {
  albumId: string;
  /** Wall-space track head position (world units). */
  pos: Vec3;
  /** Unit cone axis from the head toward its hotspot. */
  axis: Vec3;
  /** Hotspot on the wall plane (world units). */
  hot: Vec2;
  /** `1 / peakIrradiance` for this album. */
  invPeak: number;
  /** Album AABB in world units, used for cheap viewport culling. */
  bounds: { x: number; y: number; width: number; height: number };
}

export interface PlaygroundShadow {
  sx: number;
  sy: number;
}

export interface PlaygroundShadedObject {
  albumId: string;
  kind: 'print' | 'placard';
  /** Object index inside the album (placards use `0`). */
  index: number;
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
  shadow: PlaygroundShadow;
}

export interface PlaygroundLightingResult {
  fixtures: PlaygroundFixture[];
  objects: PlaygroundShadedObject[];
}

const DEG_TO_RAD = Math.PI / 180;

function smoothstep(edge0: number, edge1: number, value: number): number {
  const t = Math.min(1, Math.max(0, (value - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/**
 * Raw (un-normalised) irradiance at `(x, y, h)` from a set of fixtures. `h` is
 * the object's physical standoff from the wall, in world units.
 *
 * This is a line-for-line port of the playground's `rawIrradiance` (`L1417`).
 */
export function rawIrradiance(
  fixtures: readonly PlaygroundFixture[],
  x: number,
  y: number,
  h: number,
): number {
  const cosIn = Math.cos(LIGHT_CFG.innerDeg * DEG_TO_RAD);
  const cosOut = Math.cos(LIGHT_CFG.outerDeg * DEG_TO_RAD);
  let energy = 0;

  for (const fixture of fixtures) {
    const dx = x - fixture.pos[0];
    const dy = y - fixture.pos[1];
    const dz = h - fixture.pos[2];
    const distance = Math.hypot(dx, dy, dz);
    if (distance < 1e-9) continue;

    const lx = -dx / distance;
    const ly = -dy / distance;
    const lz = -dz / distance;
    const nDotL = Math.max(0, lz);
    const cone = smoothstep(
      cosOut,
      cosIn,
      -(lx * fixture.axis[0] + ly * fixture.axis[1] + lz * fixture.axis[2]),
    );
    energy += (nDotL * cone) / (distance * distance);
  }

  return energy;
}

/**
 * Playground frame outer size for one aspect ratio (`L1936-L1940`): the print
 * fits inside a `140px` square, then the `11px` mat is added on every side.
 * Returned in world units.
 */
export function playgroundFrameSize(aspectRatio: number): { width: number; height: number } {
  const ratio = Number.isFinite(aspectRatio) && aspectRatio > 0 ? aspectRatio : 1;
  const maxDim = 1.4;
  const printWidth = ratio >= 1 ? maxDim : maxDim * ratio;
  const printHeight = ratio >= 1 ? maxDim / ratio : maxDim;
  return { width: printWidth + 0.22, height: printHeight + 0.22 };
}

function shadeObject(
  albumId: string,
  kind: PlaygroundShadedObject['kind'],
  index: number,
  x: number,
  y: number,
  z: number,
  width: number,
  height: number,
  fixtures: readonly PlaygroundFixture[],
  peak: number,
): PlaygroundShadedObject {
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

  const denominator = strongest.pos[2] - z;
  const k = denominator > 1e-4 ? z / denominator : 0;

  return {
    albumId,
    kind,
    index,
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
    shadow: {
      sx: (x - strongest.pos[0]) * k,
      sy: (y - strongest.pos[1]) * k,
    },
  };
}

/**
 * Build wall-space fixtures and pre-computed object shading for every album,
 * using `islandLayout.ts` as the single geometry source.
 */
export function computePlaygroundLighting(
  albums: readonly WallAlbum[],
): PlaygroundLightingResult {
  const fixtures: PlaygroundFixture[] = [];
  const objects: PlaygroundShadedObject[] = [];

  for (const album of albums) {
    const grid = computeAlbumGrid(
      album.photos.length,
      album.gridColumns,
      Boolean(album.soundtrack),
    );

    const gridLeft =
      grid.placard.x + PLACARD_WIDTH / 2 + PLACARD_GAP;
    const gridTop = grid.photos[0]
      ? grid.photos[0].y + CELL_SIZE / 2
      : grid.bounds.height / 2;
    const heads = Math.max(
      1,
      Math.ceil(grid.grid.columns / LIGHT_CFG.fixturePerCols),
    );

    const hotspotY = gridTop - grid.grid.height * LIGHT_CFG.hotspotFrac;
    const lift = grid.grid.height * LIGHT_CFG.heightFrac;
    const throwDepth = grid.grid.height * LIGHT_CFG.throwFrac;
    const axisLength = Math.hypot(lift, throwDepth);
    const axis: Vec3 = [0, -lift / axisLength, -throwDepth / axisLength];

    const albumFixtures: PlaygroundFixture[] = [];
    for (let head = 0; head < heads; head += 1) {
      const localX = gridLeft + (grid.grid.width * (head + 0.5)) / heads;
      albumFixtures.push({
        albumId: album.id,
        pos: [
          album.position.x + localX,
          album.position.y + hotspotY + lift,
          throwDepth,
        ],
        axis,
        hot: [album.position.x + localX, album.position.y + hotspotY],
        invPeak: 1,
        bounds: {
          x: album.position.x,
          y: album.position.y,
          width: album.bounds.width,
          height: album.bounds.height,
        },
      });
    }

    const peak =
      Math.max(
        ...albumFixtures.map((fixture) =>
          rawIrradiance(albumFixtures, fixture.hot[0], fixture.hot[1], 0),
        ),
      ) || 1;
    const invPeak = 1 / peak;
    for (const fixture of albumFixtures) {
      fixture.invPeak = invPeak;
      fixtures.push(fixture);
    }

    grid.photos.forEach((cell, index) => {
      const frame = playgroundFrameSize(album.photos[index]?.aspectRatio ?? 1);
      objects.push(
        shadeObject(
          album.id,
          'print',
          index,
          album.position.x + cell.x,
          album.position.y + cell.y,
          PRINT_DEPTH,
          frame.width,
          frame.height,
          albumFixtures,
          peak,
        ),
      );
    });

    objects.push(
      shadeObject(
        album.id,
        'placard',
        0,
        album.position.x + grid.placard.x,
        album.position.y + grid.placard.y,
        PLACARD_DEPTH,
        grid.placard.width,
        grid.placard.height,
        albumFixtures,
        peak,
      ),
    );
  }

  return { fixtures, objects };
}

/**
 * Keep only fixtures whose album AABB intersects the visible wall rectangle
 * (plus a small margin so edge pools do not pop), capped at `maxSpots`.
 */
export function selectVisibleSpots(
  fixtures: readonly PlaygroundFixture[],
  camera: CameraState,
  viewport: Viewport,
  maxSpots: number = MAX_SPOTS,
): PlaygroundFixture[] {
  const cap = Math.max(0, Math.floor(maxSpots));
  if (cap === 0 || fixtures.length === 0) return [];

  const unitsPerPixel = worldPerPixel(camera.z, Math.max(1, viewport.height));
  // Half a screen of pre-load: a fast pan never reveals an unlit gap.
  const halfWidth = Math.max(0, viewport.width) * unitsPerPixel * 0.75;
  const halfHeight = Math.max(0, viewport.height) * unitsPerPixel * 0.75;
  const minX = camera.x - halfWidth;
  const maxX = camera.x + halfWidth;
  const minY = camera.y - halfHeight;
  const maxY = camera.y + halfHeight;

  const visible: PlaygroundFixture[] = [];
  for (const fixture of fixtures) {
    const { bounds } = fixture;
    const left = bounds.x - bounds.width / 2;
    const right = bounds.x + bounds.width / 2;
    const bottom = bounds.y - bounds.height / 2;
    const top = bounds.y + bounds.height / 2;
    if (right < minX || left > maxX || top < minY || bottom > maxY) continue;
    visible.push(fixture);
    if (visible.length >= cap) break;
  }

  return visible;
}

/**
 * Production fixtures live in the y-up world (`cameraMath` / `islandLayout`).
 * The playground shader is written for its y-down CSS world, so the GPU copy
 * negates y on both the position and cone axis. Keeping this transform next to
 * the packer means the shader can stay a verbatim port.
 */
export function toPlaygroundYDown(fixture: PlaygroundFixture): PlaygroundFixture {
  return {
    ...fixture,
    pos: [fixture.pos[0], -fixture.pos[1], fixture.pos[2]],
    axis: [fixture.axis[0], -fixture.axis[1], fixture.axis[2]],
    hot: [fixture.hot[0], -fixture.hot[1]],
  };
}

/**
 * Row-major `RGBA32F` payload for the spot data texture:
 *
 * - Row 0 (`0 .. N * 4`): `xyz = world position`, `w = 1 / peak`.
 * - Row 1 (`N * 4 .. 2 * N * 4`): `xyz = unit cone axis`, `w = 0`.
 *
 * Interleaving the two rows is the classic bug this layout guards against.
 */
export function packFixtureDataTexture(
  spots: readonly PlaygroundFixture[],
): Float32Array {
  const count = spots.length;
  const data = new Float32Array(count * 8);
  for (let index = 0; index < count; index += 1) {
    const spot = spots[index];
    data[index * 4 + 0] = spot.pos[0];
    data[index * 4 + 1] = spot.pos[1];
    data[index * 4 + 2] = spot.pos[2];
    data[index * 4 + 3] = spot.invPeak;
    data[count * 4 + index * 4 + 0] = spot.axis[0];
    data[count * 4 + index * 4 + 1] = spot.axis[1];
    data[count * 4 + index * 4 + 2] = spot.axis[2];
    data[count * 4 + index * 4 + 3] = 0;
  }
  return data;
}

/**
 * CSS custom properties for one shaded object (exactly the playground's
 * `applyGalleryLighting` output).
 */
export function playgroundLightingVars(
  object: PlaygroundShadedObject,
): Record<string, string> {
  const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
  return {
    '--lit': clamp01(object.lit).toFixed(3),
    '--lit-top': clamp01(object.litTop).toFixed(3),
    '--lit-bot': clamp01(object.litBot).toFixed(3),
    '--lit-l': clamp01(object.litL).toFixed(3),
    '--lit-r': clamp01(object.litR).toFixed(3),
    '--sx': `${object.shadow.sx.toFixed(2)}px`,
    '--sy': `${object.shadow.sy.toFixed(2)}px`,
  };
}
