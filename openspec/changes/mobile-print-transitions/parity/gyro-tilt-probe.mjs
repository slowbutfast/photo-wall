#!/usr/bin/env node
/**
 * PATCH-02 evidence — does the focused print still tilt with the gyro?
 *
 * Coarse emulation (393×852 @ dpr 3, touch). Enters Print Focus, feeds
 * synthetic `deviceorientation` readings (a neutral baseline, then a tilt) and
 * reads the focused frame's computed 3D transform, the gyro custom properties
 * and the glare opacity. Repeats after a NEXT has landed, which is where the
 * gyro hold could keep the tilt from coming back.
 *
 * Usage:
 *   PROBE_TARGETS="main=http://127.0.0.1:3140,pr18=http://127.0.0.1:3141,patch=http://127.0.0.1:3142" \
 *   PARITY_MODULE=/home/node/.npm/_npx/41b79885fbdb2a18/node_modules/playwright-core/index.js \
 *   node openspec/changes/mobile-print-transitions/parity/gyro-tilt-probe.mjs
 */

const TARGETS = (process.env.PROBE_TARGETS ?? 'head=http://127.0.0.1:3142')
  .split(',')
  .map((entry) => entry.split('='))
  .map(([name, origin]) => ({ name, origin }));
const MOOD = process.env.PROBE_MOOD ?? 'alabaster';
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

function emit(page, reading) {
  return page.evaluate((r) => {
    window.dispatchEvent(
      new DeviceOrientationEvent('deviceorientation', { alpha: 0, beta: r.beta, gamma: r.gamma, absolute: false }),
    );
  }, reading);
}

async function feed(page, reading, count, gapMs) {
  for (let index = 0; index < count; index += 1) {
    await emit(page, reading);
    await page.waitForTimeout(gapMs);
  }
}

function readFrame(page) {
  return page.evaluate(() => {
    const frame = document.querySelector('.photo-frame.focused');
    if (!frame) return null;
    const matrix = new DOMMatrix(getComputedStyle(frame).transform);
    const sheen = frame.querySelector('.photo-sheen');
    return {
      translateZ: Number(matrix.m43.toFixed(2)),
      rotationTerms: Number((Math.abs(matrix.m13) + Math.abs(matrix.m23)).toFixed(5)),
      gyroRx: frame.style.getPropertyValue('--gyro-rx'),
      gyroRy: frame.style.getPropertyValue('--gyro-ry'),
      gyroOn: frame.style.getPropertyValue('--gyro-on'),
      inlineTransform: frame.style.transform,
      boxShadow: getComputedStyle(frame).boxShadow,
      sheenOpacity: sheen ? Number(Number.parseFloat(getComputedStyle(sheen).opacity).toFixed(3)) : null,
      sheenTransform: sheen ? sheen.style.transform : null,
      classes: frame.className,
    };
  });
}

async function tiltCycle(page) {
  await feed(page, { beta: 60, gamma: 0 }, 6, 40);
  await page.waitForTimeout(300);
  const neutral = await readFrame(page);
  await feed(page, { beta: 72, gamma: 14 }, 14, 40);
  await page.waitForTimeout(500);
  const tilted = await readFrame(page);
  await feed(page, { beta: 60, gamma: 0 }, 4, 40);
  return { neutral, tilted };
}

async function run(playwright, target) {
  const browser = await playwright.chromium.launch();
  const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 3, hasTouch: true, isMobile: true });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(`${target.origin}/photos?demo=4&mood=${MOOD}`, { waitUntil: 'load', timeout: 180_000 });
  await settle(page);
  await enterPrintFocus(page);
  await page.waitForTimeout(800);

  const result = { target: target.name, mood: MOOD };
  result.rest = await readFrame(page);
  result.afterEntry = await tiltCycle(page);

  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(1800);
  result.afterNextRest = await readFrame(page);
  result.afterNext = await tiltCycle(page);

  // "Pop on arrival": sample every visible frame's veil and falloff opacity on
  // every animation frame through a NEXT and 900 ms past it, and report any
  // single-frame step above 0.04 together with how long after the flight ended
  // it happened (the flight is over once the world transform stops changing).
  result.pop = await page.evaluate(
    () =>
      new Promise((resolve) => {
        const start = performance.now();
        const world = document.querySelector('.wall-world');
        const series = new Map();
        const steps = [];
        let lastWorld = world.style.transform;
        let lastChangeAt = start;
        let frameIndex = 0;
        const label = (frame) =>
          `${frame.dataset.photoId ?? '?'}${frame.classList.contains('focused') ? ':focused' : ''}${
            frame.classList.contains('is-handoff') ? ':handoff' : ''
          }`;
        const step = (now) => {
          if (world.style.transform !== lastWorld) {
            lastWorld = world.style.transform;
            lastChangeAt = now;
          }
          for (const frame of document.querySelectorAll('.photo-frame')) {
            const rect = frame.getBoundingClientRect();
            if (rect.right < 0 || rect.left > innerWidth || rect.bottom < 0 || rect.top > innerHeight) continue;
            const id = frame.dataset.photoId ?? String(frameIndex);
            const dim = frame.querySelector('.photo-dim');
            const sample = {
              dim: dim && getComputedStyle(dim).display !== 'none' ? Number.parseFloat(getComputedStyle(dim).opacity) : 0,
              after: Number.parseFloat(getComputedStyle(frame, '::after').opacity || '0'),
            };
            const previous = series.get(id);
            if (previous) {
              for (const key of ['dim', 'after']) {
                const delta = Math.abs(sample[key] - previous[key]);
                if (delta > 0.04) {
                  steps.push({
                    t: Math.round(now - start),
                    sinceCameraStoppedMs: Math.round(now - lastChangeAt),
                    frame: label(frame),
                    prop: key,
                    from: Number(previous[key].toFixed(3)),
                    to: Number(sample[key].toFixed(3)),
                  });
                }
              }
            }
            series.set(id, sample);
          }
          frameIndex += 1;
          if (now - start < 2600) requestAnimationFrame(step);
          else resolve({ frames: frameIndex, steps });
        };
        requestAnimationFrame(step);
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
      }),
  );

  result.errors = errors;
  await browser.close();
  return result;
}

const playwright = await loadPlaywright();
const results = [];
for (const target of TARGETS) results.push(await run(playwright, target));
console.log(JSON.stringify(results, null, 2));
