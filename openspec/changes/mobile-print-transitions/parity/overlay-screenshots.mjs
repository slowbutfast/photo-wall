#!/usr/bin/env node
/**
 * Visual evidence for the frozen crisp overlay (postmortem.md).
 *
 * Coarse emulation (393×852, dpr 2). Enters Print Focus, presses NEXT and takes
 * screenshots through the flight on a slowed page clock, once per target. Each
 * frame is named by its in-flight offset (ms of the real 455 ms flight).
 *
 *   SHOT_TARGETS="pr18=http://127.0.0.1:3141,patch=http://127.0.0.1:3142" \
 *   SHOT_OUT=openspec/changes/mobile-print-transitions/evidence \
 *   PARITY_MODULE=/home/node/.npm/_npx/41b79885fbdb2a18/node_modules/playwright-core/index.js \
 *   node openspec/changes/mobile-print-transitions/parity/overlay-screenshots.mjs
 */

import { mkdir } from 'node:fs/promises';
import path from 'node:path';

const TARGETS = (process.env.SHOT_TARGETS ?? 'head=http://127.0.0.1:3142')
  .split(',')
  .map((entry) => entry.split('='))
  .map(([name, origin]) => ({ name, origin }));
const OUT = process.env.SHOT_OUT ?? 'evidence';
const MOOD = process.env.SHOT_MOOD ?? 'alabaster';
const SCALE = 0.1;
const SHOTS = Number(process.env.SHOT_COUNT ?? 9);

async function loadPlaywright() {
  for (const candidate of [process.env.PARITY_MODULE, 'playwright', 'playwright-core'].filter(Boolean)) {
    try {
      const mod = await import(candidate);
      return mod.default ?? mod;
    } catch {
      /* try the next candidate */
    }
  }
  throw new Error('Playwright unavailable: set PARITY_MODULE.');
}

async function settle(page, extraMs = 900) {
  await page.waitForSelector('.wall-world', { state: 'attached', timeout: 120_000 });
  await page.waitForSelector('.photo-frame', { state: 'attached', timeout: 120_000 });
  await page.waitForFunction(() => Array.from(document.images).every((image) => image.complete), undefined, {
    timeout: 120_000,
  });
  await page.waitForTimeout(extraMs);
}

async function enterPrintFocus(page) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    if ((await page.locator('.photo-frame.focused').count()) > 0) return;
    if ((await page.locator('.island-mosaic-button').count()) > 0) {
      await page.locator('.island-mosaic-button').first().tap();
    } else {
      const index = await page.evaluate(() => {
        const frames = Array.from(document.querySelectorAll('.photo-frame'));
        return frames.findIndex((frame) => {
          const rect = frame.getBoundingClientRect();
          return rect.height > 0 && rect.width / rect.height > 1.05;
        });
      });
      await page.locator('.photo-frame').nth(index >= 0 ? index : 0).tap();
    }
    await settle(page);
  }
}

const playwright = await loadPlaywright();
await mkdir(OUT, { recursive: true });
for (const target of TARGETS) {
  const browser = await playwright.chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 393, height: 852 },
    deviceScaleFactor: 2,
    hasTouch: true,
    isMobile: true,
  });
  const page = await context.newPage();
  await page.goto(`${target.origin}/photos?demo=4&mood=${MOOD}`, { waitUntil: 'load', timeout: 180_000 });
  await settle(page);
  await enterPrintFocus(page);
  await page.waitForTimeout(800);

  // Slow the page clock 10x from here on (performance.now and the rAF
  // timestamps together, so the camera loop and the overlay scheduler stay
  // consistent). The 455 ms flight then takes ~4.5 s and slow screenshots land
  // at known points of it. Filenames carry the scaled (in-flight) milliseconds.
  await page.evaluate((scale) => {
    const realNow = performance.now.bind(performance);
    const realRaf = window.requestAnimationFrame.bind(window);
    const t0 = realNow();
    performance.now = () => t0 + (realNow() - t0) * scale;
    window.requestAnimationFrame = (callback) => realRaf((t) => callback(t0 + (t - t0) * scale));
  }, SCALE);
  const start = Date.now();
  await page.keyboard.press("ArrowRight");
  for (let index = 0; index < SHOTS; index += 1) {
    const inFlight = Math.round((Date.now() - start) * SCALE);
    await page.screenshot({ path: path.join(OUT, `${target.name}-next-${String(inFlight).padStart(3, "0")}ms.png`) });
  }
  await browser.close();
}
console.log('done');
