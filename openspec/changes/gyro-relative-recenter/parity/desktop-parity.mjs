#!/usr/bin/env node
/**
 * Task 4.2 — desktop fine-pointer parity for `gyro-relative-recenter`.
 *
 * The change is confined to the gyro slice, which only attaches on
 * `(pointer: coarse)`. Desktop is untouched by construction, so any pixel or
 * computed-style difference between the pre-change build (`a912ae5`) and the
 * head build is a defect.
 *
 * Usage (both servers must already be running):
 *   PARITY_BASE_ORIGIN=http://127.0.0.1:3131 \
 *   PARITY_HEAD_ORIGIN=http://127.0.0.1:3132 \
 *   PARITY_OUT=/tmp/gyro-parity \
 *   PLAYWRIGHT_MODULE=/home/node/.npm/_npx/41b79885fbdb2a18/node_modules/playwright-core/index.js \
 *   node openspec/changes/gyro-relative-recenter/parity/desktop-parity.mjs
 *
 * States: `idle`, `print` (pointer parked away), `print-hover` (pointer on the
 * focused frame). Writes screenshots, computed-style dumps and a JSON report.
 */

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const BASE = process.env.PARITY_BASE_ORIGIN ?? 'http://127.0.0.1:3131';
const HEAD = process.env.PARITY_HEAD_ORIGIN ?? 'http://127.0.0.1:3132';
const OUT = process.env.PARITY_OUT ?? '/tmp/gyro-parity';
const VIEWPORT = { width: 1440, height: 900 };
const FINE = { hasTouch: false, isMobile: false };

const STYLE_SELECTORS = [
  '.gallery-root-inner',
  '.wall-world',
  '.album-island',
  '.museum-placard',
  '.photo-frame',
  '.photo-frame.focused',
  '.photo-frame.focused .photo-sheen',
  '.photo-frame.focused .photo-window',
  '.print-sharp-overlay',
  '.print-sharp-overlay .photo-sheen',
  '.photo-focus-bar',
  '.hud-top-right',
];

async function loadPlaywright() {
  const candidates = [process.env.PLAYWRIGHT_MODULE, 'playwright', 'playwright-core'].filter(Boolean);
  for (const candidate of candidates) {
    try {
      const mod = await import(candidate);
      return mod.default ?? mod;
    } catch {
      /* try next */
    }
  }
  throw new Error('Playwright unavailable: set PLAYWRIGHT_MODULE.');
}

async function loadSharp() {
  const mod = await import('sharp');
  return mod.default ?? mod;
}

/** Wait until the eased camera flight stops moving `.world`, then let paint land. */
async function settle(page) {
  await page.waitForFunction(() => (document.querySelector('.wall-world')?.style.transform ?? '').length > 0, undefined, {
    timeout: 120_000,
  });
  await page.waitForFunction(
    () =>
      new Promise((resolve) => {
        const world = document.querySelector('.wall-world');
        const first = world?.style.transform ?? '';
        setTimeout(() => resolve(first !== '' && first === (world?.style.transform ?? '')), 450);
      }),
    undefined,
    { timeout: 60_000, polling: 300 },
  );
  await page.waitForTimeout(600);
}

async function dumpStyles(page) {
  return page.evaluate((selectors) => {
    const out = {};
    for (const selector of selectors) {
      const el = document.querySelector(selector);
      if (!el) {
        out[selector] = null;
        continue;
      }
      const style = getComputedStyle(el);
      const props = {};
      for (let i = 0; i < style.length; i += 1) {
        const name = style.item(i);
        props[name] = style.getPropertyValue(name);
      }
      const rect = el.getBoundingClientRect();
      out[selector] = {
        props,
        rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
      };
    }
    return out;
  }, STYLE_SELECTORS);
}

async function captureState(page, side, state, shots) {
  await page.addStyleTag({
    content: '*,*::before,*::after{transition:none!important;animation:none!important;}',
  }).catch(() => {});
  await page.waitForTimeout(120);
  const file = path.join(OUT, side, `${state}.png`);
  await page.screenshot({ path: file });
  shots[state] = file;
  return dumpStyles(page);
}

async function runSide(browser, origin, side) {
  const page = await browser.newPage({ viewport: VIEWPORT, deviceScaleFactor: 1, ...FINE });
  const errors = [];
  const http = [];
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`console: ${message.text().slice(0, 300)}`);
  });
  page.on('response', (response) => {
    if (response.status() >= 400) http.push(`${response.status()} ${response.url()}`);
  });

  await page.goto(`${origin}/photos?demo=4&mood=chiaroscuro`, { waitUntil: 'load', timeout: 180_000 });
  await settle(page);

  const styles = {};
  const shots = {};

  // Idle: default entry framing, pointer never moved.
  styles.idle = await captureState(page, side, 'idle', shots);

  // Print Focus: second placard, then the third print of the focused album.
  await page.evaluate(() => {
    const target =
      document.querySelectorAll('.museum-placard')[1] ??
      document.querySelector('.museum-placard') ??
      document.querySelectorAll('.island-mosaic-button')[1] ??
      document.querySelector('.island-mosaic-button');
    target?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
  await settle(page);
  await page.evaluate(() => {
    const frames = document.querySelectorAll('.photo-frame');
    (frames[2] ?? frames[0])?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
  await settle(page);

  // Park the pointer well away from any print, then capture the resting state.
  await page.mouse.move(8, 8);
  await page.waitForTimeout(350);
  styles.print = await captureState(page, side, 'print', shots);

  // Hover the focused print: same coordinates on both sides.
  const box = await page.locator('.photo-frame.focused').first().boundingBox();
  if (box) {
    await page.mouse.move(box.x + box.width * 0.72, box.y + box.height * 0.3);
  }
  await page.waitForTimeout(500);
  styles['print-hover'] = await captureState(page, side, 'print-hover', shots);

  await page.close();
  return { origin, styles, shots, errors, http };
}

function diffStyles(base, head) {
  const diffs = [];
  for (const selector of Object.keys(base)) {
    const a = base[selector];
    const b = head[selector];
    if (!a || !b) {
      if (Boolean(a) !== Boolean(b)) diffs.push({ selector, property: '<missing element>' });
      continue;
    }
    for (const name of new Set([...Object.keys(a.props), ...Object.keys(b.props)])) {
      if (a.props[name] !== b.props[name]) {
        diffs.push({ selector, property: name, base: a.props[name], head: b.props[name] });
      }
    }
    for (const key of ['x', 'y', 'width', 'height']) {
      if (Math.abs(a.rect[key] - b.rect[key]) > 0.01) {
        diffs.push({ selector, property: `rect.${key}`, base: a.rect[key], head: b.rect[key] });
      }
    }
  }
  return diffs;
}

async function pixelDiff(sharp, pixelmatch, baseFile, headFile) {
  const [a, b] = await Promise.all([sharp(baseFile).ensureAlpha().raw().toBuffer({ resolveWithObject: true }), sharp(headFile).ensureAlpha().raw().toBuffer({ resolveWithObject: true })]);
  if (a.info.width !== b.info.width || a.info.height !== b.info.height) {
    return { error: 'size-mismatch', base: a.info, head: b.info };
  }
  const diff = Buffer.alloc(a.info.width * a.info.height * 4);
  const count = pixelmatch(a.data, b.data, diff, a.info.width, a.info.height, { threshold: 0 });
  return { differingPixels: count, totalPixels: a.info.width * a.info.height };
}

async function main() {
  const { chromium } = await loadPlaywright();
  const sharp = await loadSharp();
  const { default: pixelmatch } = await import('pixelmatch');
  await mkdir(path.join(OUT, 'base'), { recursive: true });
  await mkdir(path.join(OUT, 'head'), { recursive: true });

  const browser = await chromium.launch({
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--enable-unsafe-swiftshader'],
  });

  try {
    const base = await runSide(browser, BASE, 'base');
    const head = await runSide(browser, HEAD, 'head');

    const report = { generatedAt: new Date().toISOString(), viewport: VIEWPORT, base: BASE, head: HEAD, states: {} };
    for (const state of ['idle', 'print', 'print-hover']) {
      const pixels = await pixelDiff(sharp, pixelmatch, base.shots[state], head.shots[state]);
      const styleDiffs = diffStyles(base.styles[state], head.styles[state]);
      report.states[state] = { ...pixels, computedStyleDiffs: styleDiffs };
      console.log(
        `${state}: differingPixels=${pixels.differingPixels ?? pixels.error} styleDiffs=${styleDiffs.length}`,
      );
      for (const diff of styleDiffs.slice(0, 20)) console.log(`  ${diff.selector} ${diff.property}: ${diff.base} -> ${diff.head}`);
    }
    report.diagnostics = { base: { errors: base.errors, http: base.http }, head: { errors: head.errors, http: head.http } };
    await writeFile(path.join(OUT, 'report.json'), JSON.stringify(report, null, 2));
    console.log(`wrote ${path.join(OUT, 'report.json')}`);
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
