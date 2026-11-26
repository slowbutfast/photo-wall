#!/usr/bin/env node
/**
 * Task 5.2 — desktop resting parity + coarse sanity for
 * `mobile-print-transitions`.
 *
 * Desktop: build `cdeda3b` (base) and head, serve both, then compare every
 * resting state on a fine pointer at 1440×900 for 3 moods. Expect 0 differing
 * pixels and 0 computed-style diffs (including `.wall-world`'s transform
 * string). The DOM may differ only by `data-photo-id` and the hidden spans.
 *
 * Coarse: 393×852 @ dpr 3 (head only) — focused rest at translateZ(58px), a
 * neighbour veil of 0.38, a device-pixel-snapped world translation, and
 * constant box-shadow strings across mid-flight samples.
 *
 * Usage (both servers already running):
 *   PARITY_BASE_ORIGIN=http://127.0.0.1:3131 \
 *   PARITY_HEAD_ORIGIN=http://127.0.0.1:3132 \
 *   PARITY_MODULE=/home/node/.npm/_npx/41b79885fbdb2a18/node_modules/playwright-core/index.js \
 *   node openspec/changes/mobile-print-transitions/parity/handoff-parity.mjs
 *
 * Full-page screenshots go to `PARITY_OUT` (default: the OS temp dir), never
 * into the repo.
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const BASE = process.env.PARITY_BASE_ORIGIN ?? 'http://127.0.0.1:3131';
const HEAD = process.env.PARITY_HEAD_ORIGIN ?? 'http://127.0.0.1:3132';
const OUT = process.env.PARITY_OUT ?? path.join(tmpdir(), 'mpt-parity');
const VIEWPORT = { width: 1440, height: 900 };
const COARSE_VIEWPORT = { width: 393, height: 852 };
const MOODS = ['chiaroscuro', 'concrete', 'alabaster'];
const STATE_NAMES = ['overview', 'album', 'print', 'next', 'prev', 'album-after-return', 'hover'];

async function loadPlaywright() {
  const candidates = [process.env.PARITY_MODULE, 'playwright', 'playwright-core'].filter(Boolean);
  for (const candidate of candidates) {
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
  await page.waitForFunction(
    () => Array.from(document.images).every((image) => image.complete),
    undefined,
    { timeout: 120_000 },
  );
  await page.waitForFunction(
    () => (document.querySelector('.wall-world')?.style.transform ?? '').length > 0,
    undefined,
    { timeout: 120_000 },
  );
  await page.waitForFunction(
    () =>
      new Promise((resolve) => {
        const world = document.querySelector('.wall-world');
        const first = world?.style.transform ?? '';
        setTimeout(() => resolve(first !== '' && first === (world?.style.transform ?? '')), 500);
      }),
    undefined,
    { timeout: 60_000, polling: 300 },
  );
  await page.waitForTimeout(extraMs);
}

const READ_STYLES = () => {
  const frames = Array.from(document.querySelectorAll('.photo-frame')).map((frame) => {
    const style = getComputedStyle(frame);
    const after = getComputedStyle(frame, '::after');
    const cell = frame.parentElement;
    return {
      id: frame.getAttribute('data-photo-id'),
      transform: style.transform,
      boxShadow: style.boxShadow,
      zIndex: style.zIndex,
      opacity: style.opacity,
      falloffOpacity: after.opacity,
      falloffBackground: after.backgroundImage,
      cellPerspective: cell ? getComputedStyle(cell).perspective : null,
      cellTransformStyle: cell ? getComputedStyle(cell).transformStyle : null,
    };
  });
  const overlays = Array.from(document.querySelectorAll('.print-sharp-overlay')).map((box) => {
    const style = getComputedStyle(box);
    return {
      transform: style.transform,
      opacity: style.opacity,
      width: style.width,
      height: style.height,
      transition: style.transition,
    };
  });
  const world = document.querySelector('.wall-world');
  return {
    frames,
    overlays,
    worldTransform: world ? getComputedStyle(world).transform : null,
  };
};

async function readStyles(page) {
  return page.evaluate(READ_STYLES);
}

function styleDiffs(base, head, label) {
  const diffs = [];
  const compare = (group, index, property, a, b) => {
    if (a !== b) diffs.push({ state: label, group, index, property, base: a, head: b });
  };
  for (const group of ['frames', 'overlays']) {
    const left = base[group];
    const right = head[group];
    if (left.length !== right.length) {
      diffs.push({
        state: label,
        group,
        index: -1,
        property: 'count',
        base: left.length,
        head: right.length,
      });
      continue;
    }
    for (let index = 0; index < left.length; index += 1) {
      for (const property of Object.keys(left[index])) {
        // `data-photo-id` is the one allowed DOM addition; everything else must
        // be identical.
        if (property === 'id') continue;
        compare(group, index, property, left[index][property], right[index][property]);
      }
    }
  }
  compare('world', 0, 'transform', base.worldTransform, head.worldTransform);
  return diffs;
}

async function captureState(page, side, mood, state, buffer) {
  const shotFile = path.join(OUT, side, `${mood}-${state}.png`);
  await page.screenshot({ path: shotFile });
  const styles = await readStyles(page);
  buffer.set(state, { shotFile, styles });

  const dom = await page.evaluate(() => ({
    frames: document.querySelectorAll('.photo-frame').length,
    overlays: document.querySelectorAll('.print-sharp-overlay').length,
  }));
  return { shotFile, styles, dom };
}

async function enterAlbum(page) {
  if ((await page.locator('.island-mosaic-button').count()) > 0) {
    await page.locator('.island-mosaic-button').first().click();
  } else {
    await page.locator('.photo-frame').first().click();
  }
  await settle(page);
}

async function enterPrint(page) {
  await page.locator('.photo-frame').first().click();
  await settle(page);
}

async function captureDesktop(browser, origin, side, mood, report, buffer) {
  const context = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: 1,
    hasTouch: false,
    isMobile: false,
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`console: ${message.text().slice(0, 300)}`);
  });

  await page.goto(`${origin}/photos?demo=4&mood=${mood}`, { waitUntil: 'load', timeout: 180_000 });
  await settle(page);

  await captureState(page, side, mood, 'overview', buffer);

  await enterAlbum(page);
  await captureState(page, side, mood, 'album', buffer);

  await enterPrint(page);
  await captureState(page, side, mood, 'print', buffer);

  await page.keyboard.press('ArrowRight');
  await settle(page);
  await captureState(page, side, mood, 'next', buffer);

  await page.keyboard.press('ArrowLeft');
  await settle(page);
  await captureState(page, side, mood, 'prev', buffer);

  await page.keyboard.press('Escape');
  await settle(page);
  await captureState(page, side, mood, 'album-after-return', buffer);

  await enterPrint(page);
  const frame = page.locator('.photo-frame.focused');
  const box = await frame.boundingBox();
  if (box) {
    await page.mouse.move(box.x + box.width * 0.7, box.y + box.height * 0.35);
    await page.waitForTimeout(700);
  }
  await captureState(page, side, mood, 'hover', buffer);

  report.diagnostics[side].errors.push(...errors);
  await context.close();
}

async function pixelDiff(sharp, pixelmatch, baseFile, headFile) {
  const [a, b] = await Promise.all([
    sharp(baseFile).ensureAlpha().raw().toBuffer({ resolveWithObject: true }),
    sharp(headFile).ensureAlpha().raw().toBuffer({ resolveWithObject: true }),
  ]);
  if (a.info.width !== b.info.width || a.info.height !== b.info.height) {
    return { error: 'size-mismatch', base: a.info, head: b.info };
  }
  const diff = Buffer.alloc(a.info.width * a.info.height * 4);
  const differingPixels = pixelmatch(a.data, b.data, diff, a.info.width, a.info.height, {
    threshold: 0,
    diffMask: true,
  });
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -1;
  let maxY = -1;
  if (differingPixels > 0) {
    for (let y = 0; y < a.info.height; y += 1) {
      for (let x = 0; x < a.info.width; x += 1) {
        if (diff[(y * a.info.width + x) * 4 + 3] !== 0) {
          minX = Math.min(minX, x);
          minY = Math.min(minY, y);
          maxX = Math.max(maxX, x);
          maxY = Math.max(maxY, y);
        }
      }
    }
  }
  return {
    differingPixels,
    totalPixels: a.info.width * a.info.height,
    bbox: maxX >= 0 ? { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 } : null,
  };
}

async function captureCoarse(browser, report) {
  const context = await browser.newContext({
    viewport: COARSE_VIEWPORT,
    deviceScaleFactor: 3,
    hasTouch: true,
    isMobile: true,
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
  await page.goto(`${HEAD}/photos?demo=4&mood=alabaster`, { waitUntil: 'load', timeout: 180_000 });
  await settle(page);
  // Tap, not click: a mouse click would leave the desktop hover handler's
  // inline `translateZ(54px)` on the frame.
  for (let attempt = 0; attempt < 3; attempt += 1) {
    if ((await page.locator('.photo-frame.focused').count()) > 0) break;
    if ((await page.locator('.island-mosaic-button').count()) > 0) {
      await page.locator('.island-mosaic-button').first().tap();
    } else {
      const landscapeIndex = await page.evaluate(() => {
        const frames = Array.from(document.querySelectorAll('.photo-frame'));
        return frames.findIndex((frame) => {
          const rect = frame.getBoundingClientRect();
          return rect.height > 0 && rect.width / rect.height > 1.05;
        });
      });
      await page
        .locator('.photo-frame')
        .nth(landscapeIndex >= 0 ? landscapeIndex : 0)
        .tap();
    }
    await settle(page);
  }
  await page.waitForTimeout(600);

  const rest = await page.evaluate(() => {
    const focused = document.querySelector('.photo-frame.focused');
    if (!focused) return null;
    const matrix = new DOMMatrix(getComputedStyle(focused).transform);
    const neighbour = Array.from(document.querySelectorAll('.photo-frame')).find(
      (frame) => frame !== focused && !frame.classList.contains('focused'),
    );
    const dim = neighbour?.querySelector('.photo-dim');
    const world = document.querySelector('.wall-world');
    const worldTransform = world?.style.transform ?? '';
    const grid = focused.closest('.album-grid');
    const focusedRect = focused.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const margin = viewportWidth * 0.08;
    const neighboursInSideMargins = Array.from(document.querySelectorAll('.photo-frame')).filter(
      (frame) => {
        if (frame === focused) return false;
        const rect = frame.getBoundingClientRect();
        const dim = frame.querySelector('.photo-dim');
        const dimOpacity = dim ? Number.parseFloat(getComputedStyle(dim).opacity) : 0;
        return (
          dimOpacity > 0 &&
          rect.right > 0 &&
          rect.left < viewportWidth &&
          (rect.left < margin || rect.right > viewportWidth - margin)
        );
      },
    ).length;
    return {
      fillRatio: focusedRect.width / viewportWidth,
      neighboursInSideMargins,
      focusW: focused.style.getPropertyValue('--focus-w'),
      translateZ: matrix.m43,
      rotationY: matrix.m13,
      neighbourDimOpacity: dim ? getComputedStyle(dim).opacity : null,
      printW: grid ? getComputedStyle(grid).getPropertyValue('--print-w') : null,
      worldTransform,
      devicePixelRatio: window.devicePixelRatio,
    };
  });

  // Mid-flight sampling: 5–12 frames of the participants' weights, falloff,
  // shadow layers and computed box-shadow strings.
  await page.keyboard.press('ArrowRight');
  const samples = await page.evaluate(
    () =>
      new Promise((resolve) => {
        const frames = [];
        const step = () => {
          const participants = Array.from(document.querySelectorAll('.photo-frame.is-handoff'));
          if (participants.length > 0) {
            frames.push(
              participants.map((frame) => ({
                id: frame.getAttribute('data-photo-id'),
                focusW: frame.style.getPropertyValue('--focus-w'),
                falloffOpacity: getComputedStyle(frame, '::after').opacity,
                frameBoxShadow: getComputedStyle(frame).boxShadow,
                shadows: Array.from(
                  frame.querySelectorAll('.photo-shadow-rest, .photo-shadow-focus'),
                ).map((span) => ({
                  className: span.className,
                  opacity: getComputedStyle(span).opacity,
                  boxShadow: getComputedStyle(span).boxShadow,
                })),
              })),
            );
          }
          if (frames.length >= 6 || frames.length === 0) {
            if (frames.length === 0 && performance.now() < 2000) requestAnimationFrame(step);
            else resolve(frames);
          } else if (frames.length >= 6) {
            resolve(frames);
          } else {
            requestAnimationFrame(step);
          }
        };
        requestAnimationFrame(step);
      }),
  );

  // Each shadow *element* must keep one box-shadow string across every sample;
  // the rest layer and the focus layer intentionally differ from each other.
  const shadowSeries = new Map();
  for (const frame of samples) {
    for (const participant of frame) {
      shadowSeries.set(`${participant.id}:frame`, [
        ...(shadowSeries.get(`${participant.id}:frame`) ?? []),
        participant.frameBoxShadow,
      ]);
      for (const span of participant.shadows) {
        const key = `${participant.id}:${span.className}`;
        shadowSeries.set(key, [...(shadowSeries.get(key) ?? []), span.boxShadow]);
      }
    }
  }
  const varyingShadowSeries = [...shadowSeries.entries()]
    .map(([key, values]) => ({ key, unique: [...new Set(values)] }))
    .filter((entry) => entry.unique.length > 1);

  const dpr = rest?.devicePixelRatio ?? 3;
  const translation = /translate3d\(([-\d.]+)px, ([-\d.]+)px/.exec(rest?.worldTransform ?? '');
  const translateX = Number(translation?.[1] ?? Number.NaN);
  const translateY = Number(translation?.[2] ?? Number.NaN);
  // Chrome serialises `transform` to 6 significant digits, so a 1/3-px snap
  // becomes `2170.67`; allow the serialisation error, not a wrong snap.
  const onDevicePixel = (value) =>
    Number.isFinite(value) && Math.abs(value * dpr - Math.round(value * dpr)) <= 0.02;

  report.coarse = {
    errors,
    rest,
    samples,
    boxShadowsConstant: varyingShadowSeries.length === 0,
    varyingShadowSeries,
    pass: {
      restLift:
        Math.abs((rest?.translateZ ?? 0) - 58) < 0.05 && Math.abs(rest?.rotationY ?? 0) < 1e-6,
      neighbourVeil: Math.abs(Number(rest?.neighbourDimOpacity ?? -1) - 0.38) < 0.005,
      printWeight: Number(rest?.printW ?? -1) === 1,
      portraitFill: Math.abs((rest?.fillRatio ?? 0) - 0.84) <= 0.02,
      sideMarginsClear: rest?.neighboursInSideMargins === 0,
      snappedTranslation: onDevicePixel(translateX) && onDevicePixel(translateY),
      shadowStringsConstant: varyingShadowSeries.length === 0,
      sampledFrames: samples.length > 0,
    },
  };
  report.coarse.allPass = Object.values(report.coarse.pass).every(Boolean);
  await context.close();
}

async function main() {
  const { chromium } = await loadPlaywright();
  const sharp = (await import('sharp')).default ?? (await import('sharp'));
  const pixelmatch = (await import('pixelmatch')).default;

  await mkdir(path.join(OUT, 'base'), { recursive: true });
  await mkdir(path.join(OUT, 'head'), { recursive: true });

  const browser = await chromium.launch({
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--enable-unsafe-swiftshader'],
  });

  const report = {
    generatedAt: new Date().toISOString(),
    base: BASE,
    head: HEAD,
    viewport: VIEWPORT,
    coarseViewport: COARSE_VIEWPORT,
    reportPath: HERE,
    matrix: {},
    diagnostics: { base: { errors: [] }, head: { errors: [] } },
  };

  try {
    for (const mood of MOODS) {
      const baseBuffer = new Map();
      const headBuffer = new Map();
      await captureDesktop(browser, BASE, 'base', mood, report, baseBuffer);
      await captureDesktop(browser, HEAD, 'head', mood, report, headBuffer);

      for (const state of STATE_NAMES) {
        const base = baseBuffer.get(state);
        const head = headBuffer.get(state);
        if (!base || !head) {
          report.matrix[`${mood}/${state}`] = { error: 'missing-state' };
          continue;
        }
        const pixels = await pixelDiff(sharp, pixelmatch, base.shotFile, head.shotFile);
        const diffs = styleDiffs(base.styles, head.styles, state);
        report.matrix[`${mood}/${state}`] = {
          ...pixels,
          labels: base.dom,
          computedStyleDiffs: diffs,
          pass: pixels.differingPixels === 0 && diffs.length === 0,
        };
        console.log(
          `${mood}/${state}: pixels=${pixels.differingPixels ?? pixels.error} ` +
            `styleDiffs=${diffs.length} pass=${report.matrix[`${mood}/${state}`].pass}`,
        );
        for (const diff of diffs.slice(0, 10)) {
          console.log(
            `  ${diff.group}[${diff.index}] ${diff.property}: ${diff.base} -> ${diff.head}`,
          );
        }
      }
    }

    await captureCoarse(browser, report);
    console.log('coarse:', JSON.stringify(report.coarse.pass));
    if (!report.coarse.boxShadowsConstant) {
      console.log('coarse varying shadows:', JSON.stringify(report.coarse.varyingShadowSeries));
    }
  } finally {
    await browser.close();
  }

  const desktopPass = Object.values(report.matrix).every((entry) => entry.pass === true);
  report.pass = desktopPass && report.coarse?.allPass === true;
  await writeFile(path.join(HERE, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
  console.log(`RESULT pass=${report.pass} report=${path.join(HERE, 'report.json')}`);
  if (!report.pass) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
