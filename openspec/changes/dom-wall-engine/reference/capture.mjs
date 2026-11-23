#!/usr/bin/env node
/**
 * Task 1.1 — capture component-level visual reference crops from the static
 * `playgrounds/photo_wall_playground.html` prototype.
 *
 * The playground is a single static HTML file that loads
 * `../public/textures/wall/*.webp`, so it must be served from the repository
 * root (not `file://`). Start the server first:
 *
 *   python3 -m http.server 4173 --bind 127.0.0.1
 *
 * Then run this script (Playwright is not a project dependency; either install
 * it on demand or point `PLAYWRIGHT_MODULE` at an existing install):
 *
 *   PLAYWRIGHT_MODULE=playwright node openspec/changes/dom-wall-engine/reference/capture.mjs
 *
 * Crops are written next to this script. Moods are forced through the
 * playground's own `#adminMoodPreview` control (dispatched directly so the
 * hidden Curator drawer does not need to be opened).
 */

import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ORIGIN = process.env.PLAYGROUND_ORIGIN ?? 'http://127.0.0.1:4173';
const PLAYGROUND_URL = `${ORIGIN}/playgrounds/photo_wall_playground.html`;
const VIEWPORT = { width: 1600, height: 1000 };
const ALBUM_ID = process.env.REFERENCE_ALBUM_ID ?? 'tokyo';
const MOODS = ['alabaster', 'concrete', 'chiaroscuro'];

async function loadPlaywright() {
  const candidates = [
    process.env.PLAYWRIGHT_MODULE,
    'playwright',
    'playwright-core',
  ].filter(Boolean);
  const failures = [];
  for (const candidate of candidates) {
    try {
      const mod = await import(candidate);
      return mod.default ?? mod;
    } catch (error) {
      failures.push(`${candidate}: ${error.message}`);
    }
  }
  throw new Error(
    `Unable to import Playwright. Tried:\n  ${failures.join('\n  ')}\n` +
      'Install it (`npm i --no-save playwright`) or set PLAYWRIGHT_MODULE=<path to playwright-core/index.js>.',
  );
}

/** Hide the prototype's HUD/drawer chrome so crops isolate the wall itself. */
const OVERLAY_SELECTORS = [
  '.hud-top-right',
  '#albumDock',
  '#photoFocusBar',
  '#minimapBox',
  '#adminDrawer',
  '#playgroundToast',
  '.playground-section',
];

/** Fly to an album and wait until the eased camera has actually settled. */
async function flyToAlbumAndSettle(page, albumId) {
  await page.evaluate((id) => flyToAlbum(id), albumId);
  await page.waitForFunction(
    () =>
      Math.abs(state.scale - state.targetScale) < 1e-4 &&
      Math.abs(state.camX - state.targetX) < 0.05 &&
      Math.abs(state.camY - state.targetY) < 0.05 &&
      Math.abs(state.swayX) < 0.01 &&
      Math.abs(state.swayY) < 0.01,
    undefined,
    { timeout: 20_000, polling: 100 },
  );
}

async function forceMood(page, mood) {
  await page.evaluate(
    ({ value }) => {
      const select = document.getElementById('adminMoodPreview');
      if (!select) throw new Error('adminMoodPreview missing');
      select.value = value;
      select.dispatchEvent(new Event('change', { bubbles: true }));
    },
    { value: mood },
  );
  const applied = await page.evaluate(() => (typeof state === 'undefined' ? null : state.theme));
  if (applied !== mood) {
    throw new Error(`Mood ${mood} did not apply (state.theme = ${String(applied)})`);
  }
}

async function boxOf(page, selector, margin = 0) {
  const box = await page.locator(selector).first().boundingBox();
  if (!box) throw new Error(`No bounding box for ${selector}`);
  const x = Math.max(0, Math.round(box.x - margin));
  const y = Math.max(0, Math.round(box.y - margin));
  const right = Math.min(VIEWPORT.width, Math.round(box.x + box.width + margin));
  const bottom = Math.min(VIEWPORT.height, Math.round(box.y + box.height + margin));
  return { x, y, width: right - x, height: bottom - y };
}

async function shoot(page, filename, clip) {
  await page.screenshot({ path: path.join(HERE, filename), clip, animations: 'disabled' });
  console.log(`  wrote ${filename} (${clip.width}x${clip.height})`);
}

async function main() {
  const { chromium } = await loadPlaywright();
  await mkdir(HERE, { recursive: true });

  const browser = await chromium.launch({
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--enable-unsafe-swiftshader'],
  });
  try {
    const page = await browser.newPage({
      viewport: VIEWPORT,
      deviceScaleFactor: 1,
      colorScheme: 'dark',
    });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('requestfailed', (request) => errors.push(`${request.url()} → ${request.failure()?.errorText}`));

    await page.goto(PLAYGROUND_URL, { waitUntil: 'load' });
    await page.waitForFunction(
      () => document.querySelectorAll('.album-island').length > 0,
      undefined,
      { timeout: 30_000 },
    );
    await page.addStyleTag({
      content: `${OVERLAY_SELECTORS.join(',')} { display: none !important; }
        html, body { overflow: hidden !important; }`,
    });

    const webgl2 = await page.evaluate(() => {
      const canvas = document.getElementById('pbrWallCanvas');
      return Boolean(canvas && canvas.getContext('webgl2'));
    });
    console.log(`WebGL2 PBR wall available: ${webgl2}`);
    if (!webgl2) throw new Error('Playground fell back from WebGL2; reference crops would be invalid.');

    for (const mood of MOODS) {
      console.log(`\n[${mood}]`);
      await forceMood(page, mood);
      await flyToAlbumAndSettle(page, ALBUM_ID);

      const island = `.album-island[data-album-id="${ALBUM_ID}"]`;
      const islandBox = await boxOf(page, island, 48);
      await shoot(page, `album-island-album-zoom-${mood}.png`, islandBox);

      await shoot(page, `placard-beveled-glass-${mood}.png`, await boxOf(page, `${island} .museum-placard`, 28));
      await shoot(page, `print-frame-${mood}.png`, await boxOf(page, `${island} .photo-frame`, 40));

      // Edge shadows: the outer bottom-right corner of the island, where the
      // last print row's directional cast shadow falls onto open wall —
      // `contain: paint` would clip exactly this.
      const raw = await page.locator(island).boundingBox();
      const edge = {
        x: Math.max(0, Math.round(raw.x + raw.width - 300)),
        y: Math.max(0, Math.round(raw.y + raw.height - 230)),
        width: 380,
        height: 310,
      };
      edge.width = Math.min(edge.width, VIEWPORT.width - edge.x);
      edge.height = Math.min(edge.height, VIEWPORT.height - edge.y);
      await shoot(page, `island-edge-shadows-${mood}.png`, edge);
    }

    // One full-viewport album-zoom frame per mood for the acceptance baseline.
    for (const mood of MOODS) {
      await forceMood(page, mood);
      await flyToAlbumAndSettle(page, ALBUM_ID);
      await page.screenshot({
        path: path.join(HERE, `viewport-album-zoom-${mood}.png`),
        animations: 'disabled',
      });
      console.log(`  wrote viewport-album-zoom-${mood}.png (1600x1000)`);
    }

    if (errors.length > 0) {
      console.warn(`\nNon-fatal page errors during capture:\n  ${errors.join('\n  ')}`);
    }
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
