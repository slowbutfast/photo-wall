#!/usr/bin/env node
/**
 * PATCH-01 evidence — does every crisp overlay still follow its print?
 *
 * Coarse emulation (393×852 @ dpr 3, touch). Enters Print Focus, presses NEXT
 * and samples every animation frame of the flight. For each overlay that is
 * visible (computed opacity > 0.05) it records the best IoU against every
 * `.photo-window` rect. A healthy overlay stays ≈ 1 against the window it
 * covers; an overlay that stopped following the camera drifts to ≈ 0.
 *
 * Also taps Overview from Print Focus and reads `--print-w` and the neighbour
 * veils once the flight has landed (they must be cleared).
 *
 * Usage:
 *   OVERLAY_TARGETS="pr18=http://127.0.0.1:3141,patch=http://127.0.0.1:3142" \
 *   PARITY_MODULE=/home/node/.npm/_npx/41b79885fbdb2a18/node_modules/playwright-core/index.js \
 *   node openspec/changes/mobile-print-transitions/parity/overlay-follow.mjs
 */

const TARGETS = (process.env.OVERLAY_TARGETS ?? 'head=http://127.0.0.1:3142')
  .split(',')
  .map((entry) => entry.split('='))
  .map(([name, origin]) => ({ name, origin }));
const MOOD = process.env.OVERLAY_MOOD ?? 'alabaster';
const VIEWPORT = { width: 393, height: 852 };

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

/** Samples overlay/window alignment on every frame for `ms` milliseconds. */
function sampleAlignment(page, ms) {
  return page.evaluate(
    (duration) =>
      new Promise((resolve) => {
        const start = performance.now();
        const frames = [];
        const iou = (a, b) => {
          const w = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left));
          const h = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
          const inter = w * h;
          const union = a.width * a.height + b.width * b.height - inter;
          return union > 0 ? inter / union : 0;
        };
        const step = (now) => {
          const windows = Array.from(document.querySelectorAll('.photo-frame .photo-window')).map((el) =>
            el.getBoundingClientRect(),
          );
          const overlays = Array.from(document.querySelectorAll('.print-sharp-overlay'))
            .map((el) => ({ el, opacity: Number.parseFloat(getComputedStyle(el).opacity) }))
            .filter((entry) => entry.opacity > 0.05);
          const best = overlays.map((entry) => {
            const rect = entry.el.getBoundingClientRect();
            return {
              opacity: Number(entry.opacity.toFixed(3)),
              iou: Number(Math.max(0, ...windows.map((win) => iou(rect, win))).toFixed(3)),
            };
          });
          frames.push({ t: Math.round(now - start), overlays: best });
          if (now - start < duration) requestAnimationFrame(step);
          else resolve(frames);
        };
        requestAnimationFrame(step);
      }),
    ms,
  );
}

async function run(playwright, target) {
  const browser = await playwright.chromium.launch();
  const context = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: 3,
    hasTouch: true,
    isMobile: true,
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(`${target.origin}/photos?demo=4&mood=${MOOD}`, { waitUntil: 'load', timeout: 180_000 });
  await settle(page);
  await enterPrintFocus(page);
  await page.waitForTimeout(700);

  const result = { target: target.name, origin: target.origin, mood: MOOD };

  // NEXT: sample the whole flight plus the settling tail.
  await page.keyboard.press('ArrowRight');
  const frames = await sampleAlignment(page, 1500);
  const visible = frames.filter((frame) => frame.overlays.length > 0);
  const ious = visible.flatMap((frame) => frame.overlays.map((overlay) => overlay.iou));
  result.next = {
    frames: frames.length,
    framesWithOverlay: visible.length,
    maxOverlaysAtOnce: Math.max(0, ...frames.map((frame) => frame.overlays.length)),
    minIou: ious.length ? Math.min(...ious) : null,
    framesBelow0_9: visible.filter((frame) => frame.overlays.some((overlay) => overlay.iou < 0.9)).length,
    worst: visible
      .flatMap((frame) => frame.overlays.map((overlay) => ({ t: frame.t, ...overlay })))
      .sort((a, b) => a.iou - b.iou)
      .slice(0, 3),
  };

  // Second NEXT, then Overview from Print Focus.
  await settle(page, 400);
  await page.getByRole('button', { name: /^overview$/i }).tap();
  await page.waitForTimeout(1800);
  result.overview = await page.evaluate(() => {
    const grids = Array.from(document.querySelectorAll('.album-grid'));
    const printW = grids.map((grid) => grid.style.getPropertyValue('--print-w')).filter(Boolean);
    const litVeils = Array.from(document.querySelectorAll('.photo-dim')).filter(
      (el) => Number.parseFloat(getComputedStyle(el).opacity) > 0.01 && getComputedStyle(el).display !== 'none',
    ).length;
    return {
      gridsWithPrintW: printW,
      litVeils,
      overlaysLeft: document.querySelectorAll('.print-sharp-overlay').length,
    };
  });

  result.errors = errors;
  await browser.close();
  return result;
}

const playwright = await loadPlaywright();
const results = [];
for (const target of TARGETS) {
  results.push(await run(playwright, target));
}
console.log(JSON.stringify(results, null, 2));
