#!/usr/bin/env node
/**
 * Generate the committed `?demo=4` / `?demo=1000` fixture photographs.
 *
 * Each photo is a deterministic miniature scene rasterised by `sharp` from an
 * inline SVG scene graph, then overlaid with a low-opacity crop of this
 * repository's own plaster maps for film grain, sharpened and encoded as a
 * baseline **JPEG**. The browser only ever loads JPEG (`public/demo/*.jpg`,
 * served through `/demo/photo-NN.jpg?width=…`); the SVG exists solely inside
 * this build-time generator, never as a data URL in the app.
 *
 *   node openspec/changes/dom-wall-engine/fixtures/generate-demo-photos.mjs
 */

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import sharp from 'sharp';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '../../../..');
const OUT_DIR = path.join(REPO_ROOT, 'public/demo');

const COUNT = 48;
const LONG_EDGE = 640;
const ASPECTS = [4 / 5, 3 / 2, 2 / 3];

const WALL_MAPS = ['wall_albedo.webp', 'wall_normal.webp', 'wall_roughness.webp'];

function mulberry32(seed) {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function scene(index, width, height) {
  const random = mulberry32(0x9e3779b9 + index * 7919);
  const pick = (list) => list[Math.floor(random() * list.length) % list.length];
  const sky = pick([
    ['#1b2436', '#4a4658', '#c97b63'],
    ['#7ea8be', '#b8d0dc', '#f7efe5'],
    ['#334155', '#5b6b80', '#d9a273'],
    ['#2c2a28', '#6d6b65', '#d8cbb4'],
    ['#3b2f3a', '#8a5560', '#efc9a1'],
  ]);
  const ground = pick(['#2a211c', '#3c3228', '#4a3a2c', '#243036']);
  const accent = pick(['#f4d3a1', '#f7efe5', '#efd0a8', '#dfe6ea']);

  const horizon = height * (0.48 + random() * 0.18);
  const sunX = width * (0.2 + random() * 0.6);
  const sunY = horizon * (0.25 + random() * 0.45);
  const sunR = Math.min(width, height) * (0.05 + random() * 0.05);

  const ridges = Array.from({ length: 3 }, (_, ridge) => {
    const base = horizon + (ridge * (height - horizon)) / 3.4;
    const amplitude = (height - horizon) * (0.16 + random() * 0.18);
    const steps = 5;
    const points = Array.from({ length: steps + 1 }, (_, step) => {
      const x = (width * step) / steps;
      const y = base - (step % 2 === 0 ? amplitude : amplitude * 0.35) * (0.6 + random() * 0.7);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    });
    return `<polygon points="0,${height} ${points.join(' ')} ${width},${height}" fill="${ground}" opacity="${(0.55 + ridge * 0.16).toFixed(2)}"/>`;
  }).join('');

  const silhouette = '#141210';
  const blocks = Array.from({ length: 2 + Math.floor(random() * 3) }, () => {
    const w = width * (0.05 + random() * 0.1);
    const h = (height - horizon) * (0.2 + random() * 0.35);
    const x = width * random();
    return `<rect x="${x.toFixed(1)}" y="${(horizon - h).toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" fill="${silhouette}" opacity="0.88"/>`;
  }).join('');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
  <defs>
    <linearGradient id="sky" x1="0" y1="0" x2="0.1" y2="1">
      <stop offset="0%" stop-color="${sky[0]}"/>
      <stop offset="62%" stop-color="${sky[1]}"/>
      <stop offset="100%" stop-color="${sky[2]}"/>
    </linearGradient>
    <radialGradient id="vig" cx="50%" cy="45%" r="72%">
      <stop offset="55%" stop-color="rgba(0,0,0,0)"/>
      <stop offset="100%" stop-color="rgba(0,0,0,0.42)"/>
    </radialGradient>
  </defs>
  <rect width="100%" height="100%" fill="url(#sky)"/>
  <circle cx="${sunX.toFixed(1)}" cy="${sunY.toFixed(1)}" r="${sunR.toFixed(1)}" fill="${accent}" opacity="0.92"/>
  ${blocks}
  ${ridges}
  <rect width="100%" height="100%" fill="url(#vig)"/>
</svg>`;
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });

  const grains = new Map();
  for (const [i, name] of WALL_MAPS.entries()) {
    grains.set(
      i,
      await sharp(path.join(REPO_ROOT, 'public/textures/wall', name))
        .resize({ width: 420, height: 420, fit: 'cover' })
        .greyscale()
        .toBuffer(),
    );
  }

  let bytes = 0;
  for (let index = 0; index < COUNT; index += 1) {
    const aspect = ASPECTS[index % ASPECTS.length];
    const width = aspect >= 1 ? LONG_EDGE : Math.round(LONG_EDGE * aspect);
    const height = aspect >= 1 ? Math.round(LONG_EDGE / aspect) : LONG_EDGE;

    const base = await sharp(Buffer.from(scene(index, width, height))).png().toBuffer();
    // Cover the whole frame: a smaller overlay would print as a visible patch.
    const grain = await sharp(grains.get(index % WALL_MAPS.length))
      .resize({ width, height, fit: 'cover' })
      .toBuffer();

    const buffer = await sharp(base)
      .composite([{ input: grain, blend: 'soft-light', opacity: 0.18 }])
      .sharpen({ sigma: 0.6 })
      .jpeg({ quality: 82, mozjpeg: true })
      .toBuffer();

    bytes += buffer.byteLength;
    await writeFile(path.join(OUT_DIR, `photo-${String(index + 1).padStart(2, '0')}.jpg`), buffer);
  }

  console.log(
    `wrote ${COUNT} demo JPEGs to public/demo (${(bytes / 1024).toFixed(0)} KB total, ${LONG_EDGE}px long edge)`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
