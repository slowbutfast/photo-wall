#!/usr/bin/env node
/**
 * Task 1.5 — visual evidence for the spike (not a performance gate).
 *
 * Captures the `?demo=1000` DOM/compositor spike at:
 *   - macro / overview framing (all 50 islands present in the DOM),
 *   - row-0 entry framing (the product's default view),
 *   - album zoom on the first island.
 *
 * Writes PNGs to `spike/screenshots/`.
 *
 *   PLAYWRIGHT_MODULE=playwright node openspec/changes/dom-wall-engine/spike/screenshots.mjs
 */

import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, 'screenshots');
const ORIGIN = process.env.SPIKE_ORIGIN ?? 'http://127.0.0.1:4173';
const URL = `${ORIGIN}/openspec/changes/dom-wall-engine/spike/index.html?demo=1000&mood=chiaroscuro`;

async function loadPlaywright() {
  const candidates = [process.env.PLAYWRIGHT_MODULE, 'playwright', 'playwright-core'].filter(Boolean);
  for (const candidate of candidates) {
    try {
      const mod = await import(candidate);
      return mod.default ?? mod;
    } catch {
      /* try the next candidate */
    }
  }
  throw new Error('Playwright unavailable: install it or set PLAYWRIGHT_MODULE.');
}

async function main() {
  const { chromium } = await loadPlaywright();
  await mkdir(OUT, { recursive: true });
  const browser = await chromium.launch({
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--enable-unsafe-swiftshader'],
  });
  try {
    const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1 });
    await page.goto(URL, { waitUntil: 'load' });
    await page.waitForFunction(() => window.__spikeReady === true, undefined, { timeout: 120_000 });
    await page.waitForTimeout(800);
    await page.screenshot({ path: path.join(OUT, 'demo1000-row0-entry.png') });

    // Macro: pull the whole wall back into the macro tier (scale < 0.25).
    await page.evaluate(() => {
      const spike = window.__spike;
      const { bounds } = spike.manifest;
      const worldWidth = (bounds.maxX - bounds.minX) * 100;
      const worldHeight = (bounds.maxY - bounds.minY) * 100;
      const scale = Math.min((window.innerWidth * 0.94) / worldWidth, (window.innerHeight * 0.94) / worldHeight);
      spike.state.scale = scale;
      spike.state.targetScale = scale;
      spike.state.x = window.innerWidth / 2 - ((bounds.minX + bounds.maxX) / 2) * 100 * scale;
      spike.state.y = window.innerHeight / 2 + ((bounds.minY + bounds.maxY) / 2) * 100 * scale;
      spike.state.targetX = spike.state.x;
      spike.state.targetY = spike.state.y;
    });
    await page.waitForTimeout(600);
    await page.screenshot({ path: path.join(OUT, 'demo1000-macro-overview.png') });

    // Album zoom on the first island.
    await page.evaluate(() => {
      const spike = window.__spike;
      const album = spike.manifest.albums[0];
      const scale = 1.05;
      spike.state.scale = scale;
      spike.state.targetScale = scale;
      spike.state.x = window.innerWidth / 2 - album.x * 100 * scale;
      spike.state.y = window.innerHeight / 2 + album.y * 100 * scale;
      spike.state.targetX = spike.state.x;
      spike.state.targetY = spike.state.y;
    });
    await page.waitForTimeout(600);
    await page.screenshot({ path: path.join(OUT, 'demo1000-album-zoom.png') });

    const info = await page.evaluate(() => ({
      images: window.__spike.images.length,
      decoded: window.__spike.images.filter((img) => img.complete && img.naturalWidth > 0).length,
      failed: window.__spike.failedImages,
      scale: window.__spike.state.scale,
    }));
    console.log(info);
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
