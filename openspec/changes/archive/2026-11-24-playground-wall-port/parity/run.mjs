/**
 * Playground parity harness (`playground-wall-port`, Task 4.1).
 *
 * Compares `?demo=4&mood=…` in the Next.js app with the pinned playground
 * (`playgrounds/photo_wall_playground.html`, `dcc7a048`) at the same camera and
 * viewport:
 *
 * 1. Captures full-frame composites (wall + DOM islands) for human review.
 * 2. Hides every DOM layer, captures the raw wall canvas, runs `pixelmatch` and
 *    writes a diff + side-by-side composite per mood.
 * 3. Exercises real mouse clicks, `Overview`/`0`, Tab-scroll, and the macro
 *    `?demo=1000` mosaic tier.
 *
 * Run (Playwright is provided by the host environment, not app dependencies):
 *
 *   APP_URL=http://localhost:3000 \
 *   PLAYGROUND_URL=http://localhost:4000/playgrounds/photo_wall_playground.html \
 *   PLAYWRIGHT_PACKAGE=/path/to/node_modules/playwright \
 *   node openspec/changes/playground-wall-port/parity/run.mjs
 */

import { createRequire } from 'node:module';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const OUT = path.dirname(fileURLToPath(import.meta.url));
const APP_URL = process.env.APP_URL ?? 'http://localhost:3002';
const PLAYGROUND_URL =
  process.env.PLAYGROUND_URL ??
  'http://localhost:4000/playgrounds/photo_wall_playground.html';
const MOODS = ['chiaroscuro', 'concrete', 'alabaster'];
const VIEWPORT = { width: 1440, height: 900 };

function loadPlaywright() {
  const candidates = [
    process.env.PLAYWRIGHT_PACKAGE,
    'playwright',
    '/home/node/global-sandbox/projects/portfolio/node_modules/playwright',
  ].filter(Boolean);
  for (const candidate of candidates) {
    try {
      return require(candidate);
    } catch {
      // Try the next location.
    }
  }
  throw new Error('Playwright not found; set PLAYWRIGHT_PACKAGE.');
}

function loadPixelmatch() {
  const mod = require('pixelmatch');
  return mod.default ?? mod;
}

const { chromium } = loadPlaywright();
const pixelmatch = loadPixelmatch();
const sharp = require('sharp');

const HIDE_APP_HUD = `
  nextjs-portal { display: none !important; }
  .hud-top-right, .hud-directory, .photo-focus-bar { display: none !important; }
`;

const HIDE_PLAYGROUND_CHROME = `
  html, body { overflow: hidden !important; background: #000; }
  .showcase-header, .playground-section, #playground-toast, .hud-top-right,
  .hud-album-dock, .hud-photo-bar, .hud-minimap, .admin-drawer { display: none !important; }
  .stage-wrapper { padding: 0 !important; max-width: none !important; margin: 0 !important; }
  .wall-viewport {
    width: 100vw !important; height: 100vh !important; min-height: 0 !important;
    max-height: none !important; border: 0 !important; border-radius: 0 !important;
    box-shadow: none !important;
  }
`;

const HIDE_WALL = `
  .wall-world, .wings-container, .viewport-chiaroscuro-vignette, .soundtrack-toast {
    display: none !important;
  }
`;

async function cameraFromPage(page) {
  return page.evaluate(() => {
    const transform = document.querySelector('.wall-world').style.transform;
    const scale = Number(/scale\(([-0-9.]+)\)/.exec(transform)[1]);
    const translate = /translate3d\(([-0-9.]+)px,\s*([-0-9.]+)px/.exec(transform);
    return { scale, x: -Number(translate[1]) / 100, y: Number(translate[2]) / 100 };
  });
}

async function waitForWall(page) {
  await page.waitForFunction(() => {
    const canvas = document.querySelector('.pbr-wall-canvas');
    return canvas && canvas.width > 32 && canvas.height > 32;
  });
  await page.waitForTimeout(600);
}

async function applyPlaygroundCamera(page, camera, mood) {
  await page.evaluate(
    ({ camera, mood }) => {
      applyTheme(mood);
      state.camX = camera.x * 100;
      state.camY = -camera.y * 100;
      state.scale = camera.scale;
      state.targetX = state.camX;
      state.targetY = state.camY;
      state.targetScale = state.scale;
      state.swayX = 0;
      state.swayY = 0;
    },
    { camera, mood },
  );
  await page.waitForTimeout(700);
}

async function composeSideBySide(left, right, output) {
  const meta = await sharp(left).metadata();
  await sharp({
    create: {
      width: meta.width * 2,
      height: meta.height,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 255 },
    },
  })
    .composite([
      { input: left, left: 0, top: 0 },
      { input: right, left: meta.width, top: 0 },
    ])
    .png()
    .toFile(output);
}

async function main() {
  await mkdir(OUT, { recursive: true });
  const browser = await chromium.launch({
    args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader'],
  });
  const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1 });
  const metrics = { viewport: VIEWPORT, moods: {}, interactions: {}, macro: {} };

  for (const mood of MOODS) {
    const app = await context.newPage();
    app.on('pageerror', (error) => console.log(`app ${mood} error:`, error.message));
    await app.goto(`${APP_URL}/?demo=4&mood=${mood}`, { waitUntil: 'networkidle' });
    await waitForWall(app);
    const camera = await cameraFromPage(app);
    const moodAttribute = await app.evaluate(
      () => document.querySelector('.playground-wall-root').dataset.mood,
    );

    // Full-frame composites (wall + DOM islands, no chrome) for human review.
    await app.addStyleTag({ content: HIDE_APP_HUD });
    await app.waitForTimeout(200);
    await app.screenshot({ path: path.join(OUT, `app-${mood}-full.png`) });

    const playground = await context.newPage();
    playground.on('pageerror', (error) => console.log(`playground ${mood} error:`, error.message));
    await playground.goto(PLAYGROUND_URL, { waitUntil: 'networkidle' });
    await playground.evaluate((css) => {
      const style = document.createElement('style');
      style.textContent = css;
      document.head.appendChild(style);
    }, HIDE_PLAYGROUND_CHROME);
    await applyPlaygroundCamera(playground, camera, mood);
    await playground.screenshot({ path: path.join(OUT, `playground-${mood}-full.png`) });

    // Wall-only diff: hide every DOM layer on both pages.
    await app.addStyleTag({ content: HIDE_WALL });
    await playground.addStyleTag({ content: HIDE_WALL });
    await app.waitForTimeout(200);
    await playground.waitForTimeout(200);
    const appWallPath = path.join(OUT, `app-${mood}-wall.png`);
    const playgroundWallPath = path.join(OUT, `playground-${mood}-wall.png`);
    await app.locator('.pbr-wall-canvas').screenshot({ path: appWallPath });
    await playground.locator('#pbrWallCanvas').screenshot({ path: playgroundWallPath });

    await composeSideBySide(
      path.join(OUT, `app-${mood}-full.png`),
      path.join(OUT, `playground-${mood}-full.png`),
      path.join(OUT, `full-side-by-side-${mood}.png`),
    );
    await composeSideBySide(
      appWallPath,
      playgroundWallPath,
      path.join(OUT, `side-by-side-${mood}.png`),
    );

    const appRaw = await sharp(appWallPath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const playgroundRaw = await sharp(playgroundWallPath)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const width = Math.min(appRaw.info.width, playgroundRaw.info.width);
    const height = Math.min(appRaw.info.height, playgroundRaw.info.height);
    const diff = Buffer.alloc(width * height * 4);
    const mismatched = pixelmatch(appRaw.data, playgroundRaw.data, diff, width, height, {
      threshold: 0.1,
      includeAA: false,
    });
    await sharp(diff, { raw: { width, height, channels: 4 } })
      .png()
      .toFile(path.join(OUT, `diff-${mood}.png`));

    metrics.moods[mood] = {
      camera,
      moodAttribute,
      width,
      height,
      mismatchedPixels: mismatched,
      totalPixels: width * height,
      mismatchRatio: Number((mismatched / (width * height)).toFixed(5)),
      threshold: 0.1,
    };
    console.log(
      `${mood}: ${mismatched} / ${width * height} px (${(
        (mismatched / (width * height)) *
        100
      ).toFixed(3)}%)`,
    );

    await app.close();
    await playground.close();
  }

  // --- Interaction gate (real mouse click, Overview/0, Tab scroll) ----------
  {
    const page = await context.newPage();
    await page.goto(`${APP_URL}/?demo=4&mood=chiaroscuro`, { waitUntil: 'networkidle' });
    await waitForWall(page);
    const read = () =>
      page.evaluate(() => {
        const viewport = document.querySelector('.wall-viewport');
        const transform = document.querySelector('.wall-world').style.transform;
        const scale = Number(/scale\(([-0-9.]+)\)/.exec(transform)[1]);
        const translate = /translate3d\(([-0-9.]+)px,\s*([-0-9.]+)px/.exec(transform);
        const height = viewport.getBoundingClientRect().height;
        const z = height / (2 * scale * Math.tan((38 * Math.PI) / 360) * 100);
        return {
          transform,
          camera: { x: -Number(translate[1]) / 100, y: Number(translate[2]) / 100, z },
          focusBar: Boolean(document.querySelector('.photo-focus-bar')),
          tier: viewport.dataset.tier,
          scroll: [viewport.scrollLeft, viewport.scrollTop],
        };
      });

    const initial = await read();
    const placard = page.locator('.museum-placard').first();
    await placard.click();
    await page.waitForTimeout(1100);
    const afterPlacard = await read();

    const frame = page.locator('.photo-frame').first();
    await frame.click();
    await page.waitForTimeout(1100);
    const afterFrame = await read();

    await page.keyboard.press('0');
    await page.waitForTimeout(1400);
    const afterOverview = await read();

    // Slow drag: 200px over 80 steps (2.5px per event) must still pan.
    await page.mouse.move(720, 450);
    await page.mouse.down();
    await page.mouse.move(920, 450, { steps: 80 });
    await page.mouse.up();
    await page.waitForTimeout(300);
    const afterSlowDrag = await read();
    const willChangeAfterDrag = await page.evaluate(
      () => getComputedStyle(document.querySelector('.wall-world')).willChange,
    );

    // Extreme wheel-out and pan must be clamped by the 30% containment box.
    await page.mouse.move(720, 450);
    for (let index = 0; index < 10; index += 1) {
      await page.mouse.wheel(0, 1200);
      await page.waitForTimeout(40);
    }
    await page.waitForTimeout(300);
    const willChangeAfterWheel = await page.evaluate(
      () => getComputedStyle(document.querySelector('.wall-world')).willChange,
    );
    const afterExtremeOut = await read();
    await page.mouse.move(720, 450);
    await page.mouse.down();
    await page.mouse.move(1400, 450, { steps: 10 });
    await page.mouse.up();
    await page.waitForTimeout(200);
    const afterExtremePan = await read();
    const afterManual = afterExtremePan;

    await page.keyboard.press('0');
    await page.waitForTimeout(1400);
    const afterReset = await read();

    const beforeResize = await read();
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.waitForTimeout(500);
    const afterResize = await read();
    await page.setViewportSize({ width: VIEWPORT.width, height: VIEWPORT.height });
    await page.waitForTimeout(200);

    for (let index = 0; index < 25; index += 1) await page.keyboard.press('Tab');
    await page.waitForTimeout(300);
    const afterTabs = await read();

    // Mobile portrait (390x844): tapping an album placard must zoom IN.
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${APP_URL}/?demo=4&mood=chiaroscuro`, { waitUntil: 'networkidle' });
    await waitForWall(page);
    const mobileInitial = await page.evaluate(() => {
      const transform = document.querySelector('.wall-world').style.transform;
      return Number(/scale\(([-0-9.]+)\)/.exec(transform)[1]);
    });
    await page.locator('.museum-placard').first().click();
    await page.waitForTimeout(1100);
    const mobileAfterPlacard = await page.evaluate(() => {
      const transform = document.querySelector('.wall-world').style.transform;
      return Number(/scale\(([-0-9.]+)\)/.exec(transform)[1]);
    });
    await page.setViewportSize({ width: VIEWPORT.width, height: VIEWPORT.height });

    metrics.interactions = {
      initial,
      afterPlacard,
      afterFrame,
      afterOverview,
      afterSlowDrag,
      afterExtremeOut,
      afterExtremePan,
      afterManual,
      afterReset,
      afterTabs,
      placardOpenedAlbum: afterPlacard.transform !== initial.transform,
      frameOpenedPrint: afterFrame.focusBar,
      overviewFromPrintExact:
        Math.abs(afterOverview.camera.x - initial.camera.x) < 1e-3 &&
        Math.abs(afterOverview.camera.y - initial.camera.y) < 1e-3 &&
        Math.abs(afterOverview.camera.z - initial.camera.z) < 1e-3,
      slowDragPanned: Math.abs(afterSlowDrag.camera.x - afterOverview.camera.x) > 0.5,
      willChangeCleared:
        willChangeAfterDrag === 'auto' && willChangeAfterWheel === 'auto',
      containmentClamped:
        afterExtremeOut.camera.z <= 48 && Math.abs(afterExtremePan.camera.x) <= 23,
      mobileAlbumZoomedIn: mobileAfterPlacard > mobileInitial,
      mobileInitialScale: mobileInitial,
      mobileAfterPlacardScale: mobileAfterPlacard,
      overviewReset:
        Math.abs(afterReset.camera.x - initial.camera.x) < 1e-3 &&
        Math.abs(afterReset.camera.y - initial.camera.y) < 1e-3 &&
        Math.abs(afterReset.camera.z - initial.camera.z) < 1e-3,
      resizeKeptCamera:
        Math.abs(afterResize.camera.x - beforeResize.camera.x) < 1e-3 &&
        Math.abs(afterResize.camera.y - beforeResize.camera.y) < 1e-3 &&
        Math.abs(afterResize.camera.z - beforeResize.camera.z) < 1e-3,
      tabKeptScrollZero: afterTabs.scroll[0] === 0 && afterTabs.scroll[1] === 0,
    };
    await page.close();
  }

  // --- Macro tier: ?demo=1000 at scale < 0.25 has mosaics only ---------------
  {
    const macroContext = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1 });
    const page = await macroContext.newPage();
    await page.goto(`${APP_URL}/?demo=1000&mood=chiaroscuro`, { waitUntil: 'networkidle' });
    await waitForWall(page);
    // Let the initial album-tier print decodes settle so the long-task sample
    // measures only the macro switch itself.
    await page.waitForTimeout(2500);
    await page.evaluate(() => {
      window.__longTasks = [];
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) window.__longTasks.push(entry.duration);
      }).observe({ entryTypes: ['longtask'] });
    });
    await page.mouse.move(720, 450);
    for (let index = 0; index < 8; index += 1) {
      await page.mouse.wheel(0, 800);
      await page.waitForTimeout(120);
    }
    await page.waitForTimeout(900);
    metrics.macro = await page.evaluate(() => ({
      tier: document.querySelector('.wall-viewport').dataset.tier,
      islands: document.querySelectorAll('.album-island').length,
      mosaics: document.querySelectorAll('.island-mosaic').length,
      frames: document.querySelectorAll('.photo-frame').length,
      iframes: document.querySelectorAll('iframe').length,
      backdropFilters: [...document.querySelectorAll('.album-island *')].filter((element) => {
        const value = getComputedStyle(element).backdropFilter;
        return value && value !== 'none';
      }).length,
      maxLongTaskMs: Math.max(0, ...window.__longTasks),
      longTasks: window.__longTasks,
    }));
    await page.screenshot({ path: path.join(OUT, 'macro-1000.png') });
    await macroContext.close();
  }

  // --- `?demo=2000` falls back to the 1,000 fixture -----------------------
  {
    const fallbackContext = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1 });
    const page = await fallbackContext.newPage();
    await page.goto(`${APP_URL}/?demo=2000&mood=concrete`, { waitUntil: 'networkidle' });
    await waitForWall(page);
    metrics.demoFallback2000 = await page.evaluate(() => ({
      mood: document.querySelector('.playground-wall-root').dataset.mood,
      albumDockItems: document.querySelectorAll('.hud-directory-item').length,
    }));
    await fallbackContext.close();
  }

  await writeFile(path.join(OUT, 'metrics.json'), `${JSON.stringify(metrics, null, 2)}\n`);
  // Keep composites + metrics; raw per-side captures are redundant.
  for (const mood of MOODS) {
    for (const name of [
      `app-${mood}-full.png`,
      `playground-${mood}-full.png`,
      `app-${mood}-wall.png`,
      `playground-${mood}-wall.png`,
      `diff-${mood}.png`,
    ]) {
      await rm(path.join(OUT, name), { force: true });
    }
  }
  await browser.close();
  console.log(JSON.stringify(metrics, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
