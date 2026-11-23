#!/usr/bin/env node
/**
 * Task 1.5 — generate the `?demo=1000` spike fixture.
 *
 * 50 albums x 20 prints (1,000 `<img>` elements) with **real JPEG bytes**:
 * each file is a baseline-JPEG re-encode of a crop of this repository's own
 * plaster maps (`public/textures/wall/wall_{albedo,normal,ao,roughness}.webp`),
 * colour-shaded per photo. Using photographic-frequency content (not flat SVG
 * shapes) keeps decode cost in the same order of magnitude as a real photograph,
 * which is what the `?demo=1000` gate is about.
 *
 * Geometry comes from the production contract (`src/lib/layout/islandLayout.ts`)
 * via Node's built-in TypeScript type stripping — no re-implemented layout math.
 *
 * Output (git-ignored, regenerate at will):
 *   spike/.generated/photos/p-<album>-<photo>.jpg
 *   spike/.generated/manifest.json
 */

import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import sharp from 'sharp';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '../../../..');
const GENERATED = path.join(HERE, '.generated');
const PHOTOS_DIR = path.join(GENERATED, 'photos');

const ALBUM_COUNT = 50;
const PHOTOS_PER_ALBUM = 20; // MAX_PHOTOS_PER_ALBUM
const GRID_COLUMNS = 5; // 4-5 salon columns per the spec
const LOD_LONG_EDGE = 256; // macro-tier bucket
const FRAME_MAX_EDGE = 0.92; // world units, inside the 1.0u cell
const ASPECTS = [4 / 5, 3 / 2, 2 / 3]; // mixed portrait / landscape / portrait

const WALL_MAPS = [
  'wall_albedo.webp',
  'wall_normal.webp',
  'wall_ao.webp',
  'wall_roughness.webp',
];

const PALETTE = [
  '#d2a67e',
  '#9fb4c8',
  '#c4c0b2',
  '#e2bd8f',
  '#8fa0b2',
  '#c9b6a2',
  '#b08b6e',
  '#dfe6ea',
];

const TITLES = [
  'Tokyo Nocturnes',
  'Pacific Coastline',
  'Brutalist Concrete',
  'Alpine Winter',
  'Desert Meridian',
  'Harbour Fog',
  'Quiet Interiors',
  'Neon Crossings',
  'Salt Flats',
  'Northern Pines',
  'Market Light',
  'Canal Mornings',
  'Stone Gardens',
  'Long Exposure',
  'Coastal Drift',
  'Studio Studies',
  'Field Notes',
  'Blue Hour',
  'Glass & Steel',
  'Terracotta',
];

const { computeAlbumGrid, computeWallGridPositions } = await import(
  path.join(REPO_ROOT, 'src/lib/layout/islandLayout.ts')
);

async function buildBaseBuffers() {
  const bases = new Map();
  for (const name of WALL_MAPS) {
    const source = path.join(REPO_ROOT, 'public/textures/wall', name);
    // Normalise to a square-ish source so per-photo crops stay cheap.
    const buffer = await sharp(source)
      .resize({ width: 640, height: 640, fit: 'cover' })
      .toBuffer();
    bases.set(name, buffer);
  }
  return bases;
}

function aspectFittedFrame(aspectRatio) {
  const ratio = Number.isFinite(aspectRatio) && aspectRatio > 0 ? aspectRatio : 1;
  const width = ratio >= 1 ? FRAME_MAX_EDGE : FRAME_MAX_EDGE * ratio;
  const height = ratio >= 1 ? FRAME_MAX_EDGE / ratio : FRAME_MAX_EDGE;
  return { width, height };
}

async function main() {
  const startedAt = Date.now();
  await rm(GENERATED, { recursive: true, force: true });
  await mkdir(PHOTOS_DIR, { recursive: true });

  const bases = await buildBaseBuffers();
  const wallMapNames = [...bases.keys()];

  const seeds = Array.from({ length: ALBUM_COUNT }, (_, index) => ({
    id: `album-${String(index + 1).padStart(2, '0')}`,
    status: 'published',
    photoCount: PHOTOS_PER_ALBUM,
    gridColumns: GRID_COLUMNS,
    sortOrder: index,
    hasSoundtrack: false,
  }));
  const placements = computeWallGridPositions(seeds);
  const placementById = new Map(placements.map((entry) => [entry.id, entry]));

  let totalBytes = 0;
  const albums = [];

  for (const [albumIndex, seed] of seeds.entries()) {
    const placement = placementById.get(seed.id);
    if (!placement) throw new Error(`missing placement for ${seed.id}`);

    const grid = computeAlbumGrid(PHOTOS_PER_ALBUM, GRID_COLUMNS, false);
    const islandLeft = placement.position.x - placement.bounds.width / 2;
    const islandTop = placement.position.y + placement.bounds.height / 2;
    const toLocal = (worldX, worldY) => ({
      x: worldX - islandLeft,
      y: islandTop - worldY,
    });

    const photos = [];
    for (const [photoIndex, cell] of grid.photos.entries()) {
      const aspect = ASPECTS[(albumIndex + photoIndex) % ASPECTS.length];
      const color = PALETTE[(albumIndex * 3 + photoIndex) % PALETTE.length];
      const wallMap = wallMapNames[(albumIndex + photoIndex) % wallMapNames.length];
      const longEdge = aspect >= 1 ? LOD_LONG_EDGE : Math.round(LOD_LONG_EDGE * aspect);

      const filename = `p-${String(albumIndex + 1).padStart(2, '0')}-${String(
        photoIndex + 1,
      ).padStart(2, '0')}.jpg`;

      const buffer = await sharp(bases.get(wallMap))
        .resize({
          width: aspect >= 1 ? LOD_LONG_EDGE : longEdge,
          height: aspect >= 1 ? longEdge : LOD_LONG_EDGE,
          fit: 'cover',
          position: 'centre',
        })
        .modulate({ brightness: 1.05 + ((photoIndex % 5) * 0.09), saturation: 0.9 })
        .tint(color)
        .sharpen({ sigma: 0.8 })
        .jpeg({ quality: 88, mozjpeg: true })
        .toBuffer();

      totalBytes += buffer.byteLength;
      await writeFile(path.join(PHOTOS_DIR, filename), buffer);

      const frame = aspectFittedFrame(aspect);
      const local = toLocal(placement.position.x + cell.x, placement.position.y + cell.y);

      photos.push({
        src: `.generated/photos/${filename}`,
        bytes: buffer.byteLength,
        x: Number(local.x.toFixed(4)),
        y: Number(local.y.toFixed(4)),
        width: Number(frame.width.toFixed(4)),
        height: Number(frame.height.toFixed(4)),
        aspect: Number(aspect.toFixed(4)),
        color,
      });
    }

    const placardWorld = {
      x: placement.position.x + grid.placard.x,
      y: placement.position.y + grid.placard.y,
    };
    const placard = toLocal(placardWorld.x, placardWorld.y);

    albums.push({
      id: seed.id,
      title: TITLES[albumIndex % TITLES.length],
      x: placement.position.x,
      y: placement.position.y,
      width: placement.bounds.width,
      height: placement.bounds.height,
      placard: {
        x: Number((placard.x - grid.placard.width / 2).toFixed(4)),
        y: Number((placard.y - grid.placard.height / 2).toFixed(4)),
        width: grid.placard.width,
        height: grid.placard.height,
      },
      photos,
    });
  }

  const minX = Math.min(...placements.map((p) => p.position.x - p.bounds.width / 2));
  const maxX = Math.max(...placements.map((p) => p.position.x + p.bounds.width / 2));
  const minY = Math.min(...placements.map((p) => p.position.y - p.bounds.height / 2));
  const maxY = Math.max(...placements.map((p) => p.position.y + p.bounds.height / 2));

  const manifest = {
    generatedAt: new Date().toISOString(),
    provenance:
      'Real baseline JPEGs derived at build time from public/textures/wall/*.webp via sharp (no external assets, no SVG).',
    photoCount: albums.reduce((sum, album) => sum + album.photos.length, 0),
    albumCount: albums.length,
    lodLongEdge: LOD_LONG_EDGE,
    totalJpegBytes: totalBytes,
    wall: {
      albedo: '../../../../public/textures/wall/wall_albedo.webp',
      tilePx: 520,
    },
    bounds: { minX, maxX, minY, maxY },
    albums,
  };

  await writeFile(path.join(GENERATED, 'manifest.json'), JSON.stringify(manifest));
  console.log(
    `generated ${manifest.albumCount} albums / ${manifest.photoCount} real JPEGs ` +
      `(${(totalBytes / 1024 / 1024).toFixed(1)} MB) in ${((Date.now() - startedAt) / 1000).toFixed(1)}s`,
  );
  console.log(`wall bounds: x ${minX.toFixed(2)}..${maxX.toFixed(2)} u, y ${minY.toFixed(2)}..${maxY.toFixed(2)} u`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
