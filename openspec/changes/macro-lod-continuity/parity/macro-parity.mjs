#!/usr/bin/env node
/**
 * Parity + measurement harness for `macro-lod-continuity`.
 *
 * Two modes:
 *
 *   1. `--measure-only` (task 1.1): on the base build only, settle Overview on
 *      `?demo=4` at 1440x900 (fine), `?demo=4` at 393x852 (coarse) and
 *      `?demo=1000` at 1440x900, then record the settled CSS scale — the
 *      `scale(...)` factor in `.wall-world`'s inline transform. Writes
 *      `logs/1.1-overview-scale.log` and prints the band check for
 *      `[0.22, 0.25)`.
 *
 *   2. full (default): base `b616dbc` against head.
 *      - Album Focus and Print Focus at rest: 0 differing pixels and 0 computed
 *        style diffs for `.museum-placard`, `.soundtrack-plaque` and
 *        `.photo-frame`.
 *      - Overview (macro) at rest: differing pixels confined per pixel to the
 *        placard-plate and soundtrack-slot rects of each island (2px tolerance).
 *      - Overview crops for all three moods at 1440x900 fine, plus 393x852
 *        coarse for alabaster and chiaroscuro.
 *      - Hysteresis probe: drive the CSS scale through
 *        `[0.20, 0.251, 0.235, 0.26, 0.225, 0.249, 0.23]` and count coalesced
 *        `.island-mosaic` add/remove + `.album-island[data-tier]` waves. Head
 *        must show exactly 1, base at least 4.
 *      - Island-count ratio: detail islands (`.album-island` without
 *        `.island-mosaic`) at scale 0.221 on head against 0.25 on base on
 *        `?demo=1000`.
 *      - Writes `parity/report.json` and the crops under `parity/`.
 *
 * Usage (serve both builds yourself; see the change's verification.md):
 *
 *   # task 1.1, base only
 *   PARITY_MODULE=<...>/playwright-core/index.js \
 *   PARITY_BASE_ORIGIN=http://127.0.0.1:3131 \
 *   node openspec/changes/macro-lod-continuity/parity/macro-parity.mjs --measure-only
 *
 *   # full parity
 *   PARITY_MODULE=<...>/playwright-core/index.js \
 *   PARITY_BASE_ORIGIN=http://127.0.0.1:3131 \
 *   PARITY_HEAD_ORIGIN=http://127.0.0.1:3132 \
 *   node openspec/changes/macro-lod-continuity/parity/macro-parity.mjs
 *
 * Env:
 *   PARITY_BASE_ORIGIN  base origin            (default http://127.0.0.1:3131)
 *   PARITY_HEAD_ORIGIN  head origin            (default http://127.0.0.1:3132)
 *   PARITY_MODULE       playwright-core entry  (default: resolve `playwright-core`)
 *   PARITY_OUT          full-page screenshots  (default .parity-tmp/macro-shots)
 *   PARITY_CROPS        crop + report output   (default this directory)
 *
 * Chromium only (no WebKit in this environment). Fine pointer = 1440x900,
 * `hasTouch: false`. Coarse = 393x852, `hasTouch: true`, `isMobile: true`,
 * `deviceScaleFactor: 1`.
 *
 * Never point this at a remote origin: `?demo=` fixtures need no database, but
 * preview/production share the real Turso DB and Bunny storage.
 */

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CHANGE_DIR = path.resolve(HERE, '..');
const BASE = process.env.PARITY_BASE_ORIGIN ?? 'http://127.0.0.1:3131';
const HEAD = process.env.PARITY_HEAD_ORIGIN ?? 'http://127.0.0.1:3132';
const OUT = process.env.PARITY_OUT ?? path.join(process.cwd(), '.parity-tmp', 'macro-shots');
const CROPS = process.env.PARITY_CROPS ?? HERE;

const MEASURE_ONLY = process.argv.includes('--measure-only');

const VIEWPORT = { width: 1440, height: 900 };
const COARSE_VIEWPORT = { width: 393, height: 852 };
const MOODS = ['chiaroscuro', 'concrete', 'alabaster'];
const COARSE_MOODS = ['alabaster', 'chiaroscuro'];

/** Wheel -> zoom factor, verbatim from `GalleryCanvas.tsx` `onWheel`. */
const WHEEL_K = 0.0014;
/** `MACRO_DEMOTE_SCALE` / `MACRO_PROMOTE_SCALE` from the umbrella doc. */
const DEMOTE = 0.22;
const PROMOTE = 0.25;
/** Jitter sequence from the `zoomTier` fold test. */
const JITTER = [0.20, 0.251, 0.235, 0.26, 0.225, 0.249, 0.23];
/** Coalesce mutation bursts inside this window into one tier transition. */
const WAVE_WINDOW_MS = 100;
/** Per-pixel tolerance around each plate/slot rect, in screenshot pixels. */
const RECT_TOLERANCE = 2;

// Placard geometry in island-local CSS px (100px = 1 world unit).
const PLACARD_LEFT = 20; // ISLAND_PADDING 0.2u
const PLACARD_TOP = 28; // ISLAND_PADDING 0.2u + PLACARD_TOP_OFFSET 0.08u
const PLACARD_WIDTH = 214; // PLACARD_WIDTH 2.14u
const PLACARD_HEIGHT = 200; // PLACARD_HEIGHT 2.0u
const SOUNDTRACK_TOP = PLACARD_TOP + PLACARD_HEIGHT + 12; // SOUNDTRACK_GAP 0.12u

async function loadPlaywright() {
  const candidates = [process.env.PARITY_MODULE, 'playwright', 'playwright-core'].filter(Boolean);
  for (const candidate of candidates) {
    try {
      const mod = await import(candidate);
      return mod.default ?? mod;
    } catch {
      /* try next */
    }
  }
  throw new Error('Playwright unavailable: set PARITY_MODULE to playwright-core/index.js.');
}

/** The `scale(...)` factor in `.wall-world`'s inline transform, or null. */
const READ_SCALE = () => {
  const transform = document.querySelector('.wall-world')?.style.transform ?? '';
  const match = /scale\(([-\d.eE+]+)\)/.exec(transform);
  return match ? Number(match[1]) : null;
};

/**
 * Island plate/slot screen rects, from each `.album-island` bounding rect and
 * its inline local width: `s = rect.width / parseFloat(el.style.width)`.
 */
const READ_RECTS = ({ left, top, width, height, soundtrackTop }) => {
  const islands = Array.from(document.querySelectorAll('.album-island'));
  return islands.map((island) => {
    const rect = island.getBoundingClientRect();
    const localWidth = Number.parseFloat(island.style.width);
    const s = localWidth > 0 ? rect.width / localWidth : 0;
    const hasSoundtrack = Boolean(island.querySelector('.soundtrack-plaque'));
    return {
      albumId: island.getAttribute('data-album-id'),
      tier: island.getAttribute('data-tier'),
      scale: s,
      plate: {
        x: rect.left + left * s,
        y: rect.top + top * s,
        width: width * s,
        height: height * s,
      },
      slot: hasSoundtrack
        ? {
            x: rect.left + left * s,
            y: rect.top + soundtrackTop * s,
            width: width * s,
            height: height * s,
          }
        : null,
    };
  });
};

const RECT_ARGS = {
  left: PLACARD_LEFT,
  top: PLACARD_TOP,
  width: PLACARD_WIDTH,
  height: PLACARD_HEIGHT,
  soundtrackTop: SOUNDTRACK_TOP,
};

/**
 * Wait for the wall to exist and the camera to stop moving: two identical
 * `.wall-world` transform samples 450ms apart.
 */
async function settle(page, { requirePlacard = false } = {}) {
  await page.waitForSelector('.album-island', { timeout: 120_000 });
  if (requirePlacard) await page.waitForSelector('.museum-placard', { timeout: 120_000 });
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
        setTimeout(() => resolve(first !== '' && first === (world?.style.transform ?? '')), 450);
      }),
    undefined,
    { timeout: 120_000, polling: 250 },
  );
  // One more frame pair so React has published the settled snapshot.
  await page.waitForTimeout(250);
}

async function readScale(page) {
  return page.evaluate(READ_SCALE);
}

async function readRects(page) {
  return page.evaluate(READ_RECTS, RECT_ARGS);
}

async function openContext(browser, { origin, mood, profile = 'fine', material = null, demo }) {
  const coarse = profile === 'coarse';
  const context = await browser.newContext({
    viewport: coarse ? COARSE_VIEWPORT : VIEWPORT,
    deviceScaleFactor: 1,
    hasTouch: coarse,
    isMobile: coarse,
  });
  if (material) {
    await context.addInitScript(
      ([key, value]) => {
        localStorage.setItem(key, value);
      },
      ['photo-wall:placard-material', material],
    );
  }
  const page = await context.newPage();
  const diagnostics = [];
  page.on('pageerror', (error) => diagnostics.push(`pageerror: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') diagnostics.push(`console: ${message.text().slice(0, 300)}`);
  });
  page.on('response', (response) => {
    if (response.status() >= 400) diagnostics.push(`${response.status()} ${response.url()}`);
  });
  const moodQuery = mood ? `&mood=${mood}` : '';
  await page.goto(`${origin}/photos?demo=${demo}${moodQuery}`, {
    waitUntil: 'load',
    timeout: 180_000,
  });
  return { context, page, diagnostics };
}

/**
 * One wheel step that lands `factor = target / current` (scale is inversely
 * proportional to camera `z`, and `factor` multiplies `1/z`).
 */
async function wheelToScale(page, current, target) {
  if (!(current > 0) || !(target > 0)) return false;
  const factor = target / current;
  const deltaY = -Math.log(factor) / WHEEL_K;
  const box = page.viewportSize() ?? VIEWPORT;
  await page.mouse.move(box.width / 2, box.height / 2);
  await page.mouse.wheel(0, deltaY);
  await settle(page);
  return true;
}

function roundRect(rect) {
  return {
    x: Math.round(rect.x),
    y: Math.round(rect.y),
    width: Math.round(rect.width),
    height: Math.round(rect.height),
  };
}

/** Per-pixel diff count plus how many differing pixels fall outside `allowed`. */
async function pixelDiff(sharp, pixelmatch, baseFile, headFile, allowed = []) {
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
  let outside = 0;
  const insideAny = (x, y) =>
    allowed.some(
      (rect) =>
        x >= rect.x - RECT_TOLERANCE &&
        x <= rect.x + rect.width + RECT_TOLERANCE &&
        y >= rect.y - RECT_TOLERANCE &&
        y <= rect.y + rect.height + RECT_TOLERANCE,
    );

  for (let y = 0; y < a.info.height; y += 1) {
    for (let x = 0; x < a.info.width; x += 1) {
      const offset = (y * a.info.width + x) * 4;
      if (diff[offset + 3] === 0) continue;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
      if (allowed.length > 0 && !insideAny(x, y)) outside += 1;
    }
  }

  return {
    differingPixels,
    totalPixels: a.info.width * a.info.height,
    differingPixelsOutsideRects: allowed.length > 0 ? outside : null,
    bbox:
      maxX >= 0
        ? { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 }
        : null,
  };
}

const STYLE_PROPS = [
  'background-image',
  'background-color',
  'backdrop-filter',
  'border-top-width',
  'border-bottom-width',
  'border-top-color',
  'border-bottom-color',
  'box-shadow',
  'color',
  'opacity',
  'transform',
  'width',
  'height',
];

async function readRestStyles(page) {
  return page.evaluate(
    ({ props }) => {
      const read = (selector) => {
        const elements = Array.from(document.querySelectorAll(selector));
        return elements.map((element) => {
          const style = getComputedStyle(element);
          const values = {};
          for (const prop of props) values[prop] = style.getPropertyValue(prop);
          const rect = element.getBoundingClientRect();
          values.rect = {
            x: Math.round(rect.x * 100) / 100,
            y: Math.round(rect.y * 100) / 100,
            width: Math.round(rect.width * 100) / 100,
            height: Math.round(rect.height * 100) / 100,
          };
          return values;
        });
      };
      return {
        placard: read('.museum-placard'),
        soundtrack: read('.soundtrack-plaque'),
        frame: read('.photo-frame'),
      };
    },
    { props: STYLE_PROPS },
  );
}

function styleDiffs(base, head) {
  const diffs = [];
  for (const group of ['placard', 'soundtrack', 'frame']) {
    const left = base[group] ?? [];
    const right = head[group] ?? [];
    if (left.length !== right.length) {
      diffs.push({ group, property: '<count>', base: left.length, head: right.length });
    }
    for (let index = 0; index < Math.min(left.length, right.length); index += 1) {
      for (const property of Object.keys(left[index])) {
        const a = left[index][property];
        const b = right[index][property];
        if (property === 'rect') {
          for (const axis of ['x', 'y', 'width', 'height']) {
            if (Math.abs(a[axis] - b[axis]) > 0.01) {
              diffs.push({ group, index, property: `rect.${axis}`, base: a[axis], head: b[axis] });
            }
          }
        } else if (a !== b) {
          diffs.push({ group, index, property, base: a, head: b });
        }
      }
    }
  }
  return diffs;
}

/** An arm that starts recording coalesced tier/mosaic transitions. */
const START_WAVES = ({ windowMs }) => {
  window.waveLog = [];
  let lastAt = 0;
  let dirty = false;
  const flush = () => {
    if (!dirty) return;
    dirty = false;
    window.waveLog.push({
      at: Date.now(),
      macroCount: document.querySelectorAll('.island-mosaic').length,
      tiers: Array.from(document.querySelectorAll('.album-island')).map((island) =>
        island.getAttribute('data-tier'),
      ),
    });
  };
  const mark = () => {
    const now = Date.now();
    if (now - lastAt > windowMs) {
      flush();
      dirty = true;
    }
    lastAt = now;
  };
  const observer = new MutationObserver((records) => {
    for (const record of records) {
      if (record.type === 'attributes') {
        mark();
        return;
      }
      const nodes = [...record.addedNodes, ...record.removedNodes];
      if (nodes.some((node) => node.nodeType === 1 && node.classList?.contains('island-mosaic'))) {
        mark();
        return;
      }
    }
  });
  observer.observe(document.body, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ['data-tier'],
  });
  window.__stopWaves = () => {
    observer.disconnect();
    flush();
    return window.waveLog;
  };
};

const STOP_WAVES = () => (window.__stopWaves ? window.__stopWaves() : []);

const COUNT_DETAIL_ISLANDS = () =>
  Array.from(document.querySelectorAll('.album-island')).filter(
    (island) => !island.querySelector('.island-mosaic'),
  ).length;

const COUNT_MACRO_ISLANDS = () =>
  Array.from(document.querySelectorAll('.album-island')).filter((island) =>
    island.querySelector('.island-mosaic'),
  ).length;

async function measureOverviewScale(browser) {
  const cases = [
    { key: 'demo4-1440x900-fine', demo: 4, profile: 'fine', origin: BASE },
    { key: 'demo4-393x852-coarse', demo: 4, profile: 'coarse', origin: BASE },
    { key: 'demo1000-1440x900-fine', demo: 1000, profile: 'fine', origin: BASE },
  ];
  const results = [];
  for (const entry of cases) {
    const { context, page, diagnostics } = await openContext(browser, {
      origin: entry.origin,
      demo: entry.demo,
      profile: entry.profile,
    });
    await settle(page);
    const scale = await readScale(page);
    const islands = await page.evaluate(
      () => document.querySelectorAll('.album-island').length,
    );
    const inBand = scale !== null && scale >= DEMOTE && scale < PROMOTE;
    results.push({ ...entry, scale, islands, inBand, diagnostics });
    console.log(
      `${entry.key}: overview scale=${scale} islands=${islands} inBand=[0.22,0.25)=${inBand}`,
    );
    await context.close();
  }
  return results;
}

async function captureAlbumFocus(browser, side, origin, mood) {
  const { context, page, diagnostics } = await openContext(browser, { origin, mood, demo: 4 });
  await settle(page);

  // Zoom in above the promote scale until the detail tier exists, then click.
  const overviewScale = await readScale(page);
  await wheelToScale(page, overviewScale, 0.32);
  await settle(page, { requirePlacard: true });
  await page.click('.museum-placard');

  await settle(page, { requirePlacard: true });
  await page.waitForTimeout(900);
  await settle(page, { requirePlacard: true });

  const shotFile = path.join(OUT, side, `${mood}-album.png`);
  await mkdir(path.dirname(shotFile), { recursive: true });
  await page.screenshot({ path: shotFile });
  const styles = await readRestStyles(page);
  const scale = await readScale(page);
  await context.close();
  return { shotFile, styles, scale, diagnostics };
}

async function capturePrintFocus(browser, side, origin, mood) {
  const { context, page, diagnostics } = await openContext(browser, { origin, mood, demo: 4 });
  await settle(page);
  const overviewScale = await readScale(page);
  await wheelToScale(page, overviewScale, 0.32);
  await settle(page, { requirePlacard: true });

  const frame = page.locator('.photo-frame').first();
  await frame.click();
  await page.waitForTimeout(1200);
  await settle(page);
  await page.waitForTimeout(600);

  const shotFile = path.join(OUT, side, `${mood}-print.png`);
  await mkdir(path.dirname(shotFile), { recursive: true });
  await page.screenshot({ path: shotFile });
  const styles = await readRestStyles(page);
  const scale = await readScale(page);
  await context.close();
  return { shotFile, styles, scale, diagnostics };
}

async function captureOverview(browser, side, origin, mood, profile = 'fine') {
  const { context, page, diagnostics } = await openContext(browser, {
    origin,
    mood,
    profile,
    demo: 4,
  });
  await settle(page);
  const scale = await readScale(page);
  const rects = await readRects(page);
  const suffix = profile === 'coarse' ? '-coarse' : '';
  const shotFile = path.join(OUT, side, `${mood}${suffix}-overview.png`);
  await mkdir(path.dirname(shotFile), { recursive: true });
  await page.screenshot({ path: shotFile });
  await context.close();
  return { shotFile, scale, rects, diagnostics };
}

async function hysteresisProbe(browser, origin, label) {
  const { context, page, diagnostics } = await openContext(browser, { origin, demo: 4 });
  await settle(page);
  await page.evaluate(START_WAVES, { windowMs: WAVE_WINDOW_MS });

  let current = await readScale(page);
  const trail = [];
  for (const target of JITTER) {
    await wheelToScale(page, current, target);
    current = await readScale(page);
    trail.push({ target, reached: current });
  }

  // Give the coalescer a final flush window, then stop.
  await page.waitForTimeout(WAVE_WINDOW_MS * 2);
  const waves = await page.evaluate(STOP_WAVES);
  await context.close();
  return {
    origin,
    label,
    trail,
    waves: waves.length,
    waveDetail: waves,
    diagnostics,
  };
}

async function islandCountAt(browser, origin, scale) {
  const { context, page, diagnostics } = await openContext(browser, { origin, demo: 1000 });
  await settle(page);
  const overviewScale = await readScale(page);
  if (overviewScale === null || Math.abs(overviewScale - scale) > 0.002) {
    await wheelToScale(page, overviewScale, scale);
  }
  await page.waitForTimeout(700);
  await settle(page);
  const reached = await readScale(page);
  const detail = await page.evaluate(COUNT_DETAIL_ISLANDS);
  const macro = await page.evaluate(COUNT_MACRO_ISLANDS);
  const tiers = await readRects(page);
  await context.close();
  return { origin, target: scale, reached, detail, macro, tiers: tiers.length, diagnostics };
}

async function runMeasureOnly(sharp, pixelmatch) {
  void sharp;
  void pixelmatch;
  const { chromium } = await loadPlaywright();
  const browser = await chromium.launch({
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--enable-unsafe-swiftshader'],
  });
  try {
    const results = await measureOverviewScale(browser);
    const anyInBand = results.some((entry) => entry.inBand);
    const json = {
      generatedAt: new Date().toISOString(),
      mode: 'measure-only',
      origin: BASE,
      viewports: { fine: VIEWPORT, coarse: COARSE_VIEWPORT },
      band: [DEMOTE, PROMOTE],
      results,
      anyInBand,
    };
    const logDir = path.join(CHANGE_DIR, 'logs');
    await mkdir(logDir, { recursive: true });
    const logFile = path.join(logDir, '1.1-overview-scale.log');
    const consoleLines = [
      '# macro-lod-continuity task 1.1 — Overview-settled CSS scale on base b616dbc',
      `# generated ${json.generatedAt}`,
      `# origin ${BASE}`,
      `# band [${DEMOTE}, ${PROMOTE})`,
      '',
      ...results.map(
        (entry) =>
          `${entry.key}: scale=${entry.scale} islands=${entry.islands} inBand=${entry.inBand}` +
          (entry.diagnostics.length > 0 ? ` diagnostics=${JSON.stringify(entry.diagnostics)}` : ''),
      ),
      '',
      `anyInBand=${anyInBand}`,
      '',
      '## JSON',
      JSON.stringify(json, null, 2),
      '',
    ].join('\n');
    await writeFile(logFile, consoleLines);
    console.log(consoleLines);
    console.log(`wrote ${logFile}`);
    return { json, logFile, anyInBand };
  } finally {
    await browser.close();
  }
}

async function runFull(sharp, pixelmatch) {
  const { chromium } = await loadPlaywright();
  await mkdir(path.join(OUT, 'base'), { recursive: true });
  await mkdir(path.join(OUT, 'head'), { recursive: true });

  const browser = await chromium.launch({
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--enable-unsafe-swiftshader'],
  });

  const report = {
    generatedAt: new Date().toISOString(),
    mode: 'full',
    base: BASE,
    head: HEAD,
    viewport: VIEWPORT,
    coarseViewport: COARSE_VIEWPORT,
    moods: MOODS,
    rest: {},
    overview: {},
    coarseOverview: {},
    hysteresis: {},
    islandCount: {},
  };

  try {
    for (const mood of MOODS) {
      for (const state of ['album', 'print']) {
        const key = `${mood}/${state}`;
        const capture = state === 'album' ? captureAlbumFocus : capturePrintFocus;
        const base = await capture(browser, 'base', BASE, mood);
        const head = await capture(browser, 'head', HEAD, mood);
        const pixels = await pixelDiff(sharp, pixelmatch, base.shotFile, head.shotFile);
        const diffs = styleDiffs(base.styles, head.styles);
        report.rest[key] = {
          ...pixels,
          baseScale: base.scale,
          headScale: head.scale,
          computedStyleDiffs: diffs,
          pass: pixels.differingPixels === 0 && diffs.length === 0,
        };
        console.log(
          `${key} rest: pixels=${pixels.differingPixels ?? pixels.error} styleDiffs=${diffs.length} ` +
            `pass=${report.rest[key].pass}`,
        );
        for (const diff of diffs.slice(0, 10)) {
          console.log(
            `  ${diff.group}[${diff.index ?? ''}] ${diff.property}: ${diff.base} -> ${diff.head}`,
          );
        }
      }
    }

    for (const mood of MOODS) {
      const base = await captureOverview(browser, 'base', BASE, mood, 'fine');
      const head = await captureOverview(browser, 'head', HEAD, mood, 'fine');
      const allowed = head.rects.flatMap((entry) =>
        entry.slot ? [entry.plate, entry.slot] : [entry.plate],
      );
      const pixels = await pixelDiff(sharp, pixelmatch, base.shotFile, head.shotFile, allowed);
      report.overview[mood] = {
        ...pixels,
        baseScale: base.scale,
        headScale: head.scale,
        islands: head.rects.length,
        plates: head.rects.length,
        slots: head.rects.filter((entry) => entry.slot).length,
        crop: path.relative(CROPS, head.shotFile),
        pass:
          (pixels.differingPixels ?? 0) > 0 &&
          pixels.differingPixelsOutsideRects === 0,
      };
      // Visual-review crops, one per mood.
      const cropFile = path.join(CROPS, 'crops', `overview-${mood}-fine.png`);
      await mkdir(path.dirname(cropFile), { recursive: true });
      await sharp(head.shotFile)
        .extract({ left: 0, top: 0, width: VIEWPORT.width, height: VIEWPORT.height })
        .toFile(cropFile);
      console.log(
        `${mood} overview: pixels=${pixels.differingPixels} outsidePlates+Slots=` +
          `${pixels.differingPixelsOutsideRects} islands=${head.rects.length} pass=${report.overview[mood].pass}`,
      );
    }

    for (const mood of COARSE_MOODS) {
      const head = await captureOverview(browser, 'head', HEAD, mood, 'coarse');
      const cropFile = path.join(CROPS, 'crops', `overview-${mood}-coarse.png`);
      await mkdir(path.dirname(cropFile), { recursive: true });
      await sharp(head.shotFile)
        .extract({
          left: 0,
          top: 0,
          width: COARSE_VIEWPORT.width,
          height: COARSE_VIEWPORT.height,
        })
        .toFile(cropFile);
      report.coarseOverview[mood] = {
        scale: head.scale,
        islands: head.rects.length,
        slots: head.rects.filter((entry) => entry.slot).length,
        crop: path.relative(CROPS, cropFile),
        diagnostics: head.diagnostics,
      };
      console.log(
        `${mood} coarse overview: scale=${head.scale} islands=${head.rects.length} ` +
          `slots=${report.coarseOverview[mood].slots} crop=${report.coarseOverview[mood].crop}`,
      );
    }

    const headProbe = await hysteresisProbe(browser, HEAD, 'head');
    const baseProbe = await hysteresisProbe(browser, BASE, 'base');
    report.hysteresis = {
      sequence: JITTER,
      head: headProbe,
      base: baseProbe,
      pass: headProbe.waves === 1 && baseProbe.waves >= 4,
    };
    console.log(
      `hysteresis: head waves=${headProbe.waves} (expect 1) base waves=${baseProbe.waves} (expect >=4) ` +
        `pass=${report.hysteresis.pass}`,
    );

    const headCount = await islandCountAt(browser, HEAD, 0.221);
    const baseCount = await islandCountAt(browser, BASE, 0.25);
    const ratio = baseCount.detail > 0 ? headCount.detail / baseCount.detail : null;
    report.islandCount = {
      head: headCount,
      base: baseCount,
      ratio,
      expectedRatio: 1.29,
      pass: ratio !== null && ratio >= 1.1 && ratio <= 1.5,
    };
    console.log(
      `island count: head@0.221=${headCount.detail} (scale ${headCount.reached}) ` +
        `base@0.25=${baseCount.detail} (scale ${baseCount.reached}) ratio=${ratio} ` +
        `pass=${report.islandCount.pass}`,
    );

    report.pass =
      Object.values(report.rest).every((entry) => entry.pass) &&
      Object.values(report.overview).every((entry) => entry.pass) &&
      report.hysteresis.pass &&
      report.islandCount.pass;

    await writeFile(path.join(CROPS, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
    console.log(`wrote ${path.join(CROPS, 'report.json')} pass=${report.pass}`);
    if (!report.pass) process.exitCode = 1;
    return report;
  } finally {
    await browser.close();
  }
}

async function main() {
  const sharpModule = await import('sharp');
  const sharp = sharpModule.default ?? sharpModule;
  const pixelmatchModule = await import('pixelmatch');
  const pixelmatch = pixelmatchModule.default ?? pixelmatchModule;

  if (MEASURE_ONLY) {
    const { anyInBand } = await runMeasureOnly(sharp, pixelmatch);
    if (anyInBand) {
      console.log(
        'WARNING: an Overview scale falls inside the hysteresis band [0.22, 0.25). ' +
          'Do not retune framing; flag it in verification.md.',
      );
    }
    return;
  }
  await runFull(sharp, pixelmatch);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
