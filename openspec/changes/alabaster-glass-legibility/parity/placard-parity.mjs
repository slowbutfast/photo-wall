#!/usr/bin/env node
/**
 * Task 3.2 / 3.3 — placard parity for `alabaster-glass-legibility`.
 *
 * Compares the pre-change build (`main` @ `b3cceff`) with the head build across
 * every mood × placard material on a fine pointer. Only Alabaster × Beveled
 * Glass (`acrylic`) may differ; every other combination must be pixel- and
 * computed-style-identical. It also captures the coarse emulation, where the
 * Alabaster gradient must equal desktop's while `backdrop-filter` stays `none`,
 * and samples the real composited plate pixel next to the timecode.
 *
 * Usage (both servers already running, see the change's verification.md):
 *   PARITY_BASE_ORIGIN=http://127.0.0.1:3131 \
 *   PARITY_HEAD_ORIGIN=http://127.0.0.1:3132 \
 *   PARITY_OUT=.parity-tmp/shots \
 *   PARITY_MODULE=/home/node/.npm/_npx/41b79885fbdb2a18/node_modules/playwright-core/index.js \
 *   node openspec/changes/alabaster-glass-legibility/parity/placard-parity.mjs
 *
 * Full-page screenshots stay in `PARITY_OUT`; only the placard crops and
 * `report.json` are written next to this script.
 */

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const BASE = process.env.PARITY_BASE_ORIGIN ?? 'http://127.0.0.1:3131';
const HEAD = process.env.PARITY_HEAD_ORIGIN ?? 'http://127.0.0.1:3132';
const OUT = process.env.PARITY_OUT ?? path.join(process.cwd(), '.parity-tmp', 'shots');
const CROPS = process.env.PARITY_CROPS ?? HERE;
const MATERIAL_KEY = 'photo-wall:placard-material';
const VIEWPORT = { width: 1440, height: 900 };
const COARSE_VIEWPORT = { width: 393, height: 852 };
const MOODS = ['chiaroscuro', 'concrete', 'alabaster'];
const MATERIALS = ['acrylic', 'aluminum', 'foamcore'];
const LINES = [
  '.placard-title',
  '.placard-caption',
  '.placard-meta',
  '.placard-track-name',
  '.placard-timecode',
];

const lineStyleProps = ['color', 'text-shadow', 'opacity', 'font-size', 'font-weight', 'line-height'];
const placardStyleProps = ['background-image', 'backdrop-filter', 'background-color', 'color'];

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
  throw new Error('Playwright unavailable: set PARITY_MODULE.');
}

function roundRect(rect) {
  return {
    x: Math.round(rect.x),
    y: Math.round(rect.y),
    width: Math.round(rect.width),
    height: Math.round(rect.height),
  };
}

async function settle(page) {
  await page.waitForSelector('.museum-placard', { timeout: 120_000 });
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
        setTimeout(() => resolve(first !== '' && first === (world?.style.transform ?? '')), 450);
      }),
    undefined,
    { timeout: 60_000, polling: 300 },
  );
  await page.waitForTimeout(700);
  await page
    .addStyleTag({ content: '*,*::before,*::after{transition:none!important;animation:none!important;}' })
    .catch(() => {});
  await page.waitForTimeout(150);
}

async function readStyles(page) {
  return page.evaluate(
    ({ lines, lineProps, placardProps }) => {
      const read = (element, props) => {
        if (!element) return null;
        const style = getComputedStyle(element);
        const values = {};
        for (const prop of props) values[prop] = style.getPropertyValue(prop);
        const rect = element.getBoundingClientRect();
        values.rect = { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
        return values;
      };

      const placards = Array.from(document.querySelectorAll('.museum-placard'));
      const first = placards[0];
      const out = {
        placard: read(first, placardProps),
        placardRects: placards.map((placard) => {
          const rect = placard.getBoundingClientRect();
          return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
        }),
        lines: {},
      };
      for (const selector of lines) {
        out.lines[selector] = read(
          first?.querySelector(selector) ?? document.querySelector(selector),
          lineProps,
        );
      }
      return out;
    },
    { lines: LINES, lineProps: lineStyleProps, placardProps: placardStyleProps },
  );
}

async function capture(browser, origin, side, mood, material, profile) {
  const context = await browser.newContext({
    viewport: profile === 'coarse' ? COARSE_VIEWPORT : VIEWPORT,
    deviceScaleFactor: 1,
    hasTouch: profile === 'coarse',
    isMobile: profile === 'coarse',
  });
  await context.addInitScript(
    ([key, value]) => {
      localStorage.setItem(key, value);
    },
    [MATERIAL_KEY, material],
  );

  const page = await context.newPage();
  const errors = [];
  const http = [];
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`console: ${message.text().slice(0, 300)}`);
  });
  page.on('response', (response) => {
    if (response.status() >= 400) http.push(`${response.status()} ${response.url()}`);
  });

  const tag = `${mood}-${material}${profile === 'coarse' ? '-coarse' : ''}`;
  await page.goto(`${origin}/photos?demo=4&mood=${mood}`, { waitUntil: 'load', timeout: 180_000 });
  await settle(page);

  const shotsDir = path.join(OUT, side);
  await mkdir(shotsDir, { recursive: true });
  const shotFile = path.join(shotsDir, `${tag}.png`);
  await page.screenshot({ path: shotFile });

  const styles = await readStyles(page);
  const placard = roundRect(styles.placard.rect);
  const crop = {
    x: Math.max(0, placard.x - 12),
    y: Math.max(0, placard.y - 12),
    width: placard.width + 24,
    height: placard.height + 24,
  };
  const cropFile = path.join(CROPS, side, `${tag}-placard.png`);
  await mkdir(path.dirname(cropFile), { recursive: true });
  await page.screenshot({ path: cropFile, clip: crop });

  const devicePixelRatio = await page.evaluate(() => window.devicePixelRatio);
  await context.close();
  return { origin, tag, shotFile, cropFile, styles, devicePixelRatio, errors, http };
}

function styleDiffs(base, head) {
  const diffs = [];
  for (const group of ['placard', 'lines']) {
    const left = group === 'placard' ? { placard: base.placard } : base.lines;
    const right = group === 'placard' ? { placard: head.placard } : head.lines;
    for (const key of Object.keys(left)) {
      const a = left[key];
      const b = right[key];
      if (!a || !b) {
        if (Boolean(a) !== Boolean(b)) diffs.push({ group, key, property: '<missing element>' });
        continue;
      }
      for (const property of Object.keys(a)) {
        if (property === 'rect') {
          for (const axis of ['x', 'y', 'width', 'height']) {
            if (Math.abs(a.rect[axis] - b.rect[axis]) > 0.01) {
              diffs.push({
                group,
                key,
                property: `rect.${axis}`,
                base: a.rect[axis],
                head: b.rect[axis],
              });
            }
          }
        } else if (a[property] !== b[property]) {
          diffs.push({ group, key, property, base: a[property], head: b[property] });
        }
      }
    }
  }
  return diffs;
}

async function pixelDiff(sharp, pixelmatch, baseFile, headFile, placardRects = []) {
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
  let outsidePlacards = 0;
  const tolerance = 2;
  for (let y = 0; y < a.info.height; y += 1) {
    for (let x = 0; x < a.info.width; x += 1) {
      const offset = (y * a.info.width + x) * 4;
      // pixelmatch marks a differing pixel by writing the diff colour with
      // alpha 255 into the diff buffer.
      if (diff[offset + 3] !== 0) {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);

        if (placardRects.length > 0) {
          const inside = placardRects.some(
            (rect) =>
              x >= rect.x - tolerance &&
              x <= rect.x + rect.width + tolerance &&
              y >= rect.y - tolerance &&
              y <= rect.y + rect.height + tolerance,
          );
          if (!inside) outsidePlacards += 1;
        }
      }
    }
  }

  return {
    differingPixels,
    totalPixels: a.info.width * a.info.height,
    differingPixelsOutsidePlacards: placardRects.length > 0 ? outsidePlacards : null,
    bbox:
      maxX >= 0
        ? { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 }
        : null,
  };
}

/** Median RGB of a small patch, so a stray glyph antialias pixel can't decide. */
async function samplePatch(sharp, file, centre, radius = 2) {
  const left = Math.max(0, Math.round(centre.x) - radius);
  const top = Math.max(0, Math.round(centre.y) - radius);
  const size = radius * 2 + 1;
  const { data } = await sharp(file)
    .extract({ left, top, width: size, height: size })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const channels = [[], [], []];
  for (let index = 0; index < data.length; index += 4) {
    channels[0].push(data[index]);
    channels[1].push(data[index + 1]);
    channels[2].push(data[index + 2]);
  }
  const median = (values) => values.sort((a, b) => a - b)[Math.floor(values.length / 2)];
  return [median(channels[0]), median(channels[1]), median(channels[2])];
}

const srgb = (channel) => {
  const value = channel / 255;
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
};
const luminance = ([r, g, b]) => 0.2126 * srgb(r) + 0.7152 * srgb(g) + 0.0722 * srgb(b);
const contrast = (a, b) => {
  const first = luminance(a);
  const second = luminance(b);
  const lighter = Math.max(first, second);
  const darker = Math.min(first, second);
  return (lighter + 0.05) / (darker + 0.05);
};
const over = (ink, alpha, plate) => ink.map((channel, index) => alpha * channel + (1 - alpha) * plate[index]);
const hex = (rgb) => `#${rgb.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`;

function parseRgb(value) {
  const match = /rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/i.exec(value);
  if (!match) throw new Error(`Unsupported computed colour: ${value}`);
  return [Number(match[1]), Number(match[2]), Number(match[3])];
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
    matrix: {},
    diagnostics: { base: { errors: [], http: [] }, head: { errors: [], http: [] } },
  };

  try {
    const headCaptures = new Map();

    for (const mood of MOODS) {
      for (const material of MATERIALS) {
        const key = `${mood}/${material}`;
        const expectsDifference = mood === 'alabaster' && material === 'acrylic';

        const base = await capture(browser, BASE, 'base', mood, material, 'fine');
        const head = await capture(browser, HEAD, 'head', mood, material, 'fine');
        headCaptures.set(key, head);
        report.diagnostics.base.errors.push(...base.errors);
        report.diagnostics.base.http.push(...base.http);
        report.diagnostics.head.errors.push(...head.errors);
        report.diagnostics.head.http.push(...head.http);

        const pixels = await pixelDiff(
          sharp,
          pixelmatch,
          base.shotFile,
          head.shotFile,
          expectsDifference ? head.styles.placardRects : [],
        );
        const diffs = styleDiffs(base.styles, head.styles);
        const confined = expectsDifference
          ? pixels.differingPixelsOutsidePlacards === 0
          : true;

        report.matrix[key] = {
          expectsDifference,
          ...pixels,
          differenceConfinedToPlacards: confined,
          computedStyleDiffs: diffs,
          pass: expectsDifference
            ? pixels.differingPixels > 0 && confined
            : pixels.differingPixels === 0 && diffs.length === 0,
        };

        console.log(
          `${key}: pixels=${pixels.differingPixels ?? pixels.error} ` +
            `styleDiffs=${diffs.length} confined=${confined} expected=${expectsDifference}`,
        );
        for (const diff of diffs.slice(0, 12)) {
          console.log(`  ${diff.group} ${diff.key} ${diff.property}: ${diff.base} -> ${diff.head}`);
        }
      }
    }

    const desktop = headCaptures.get('alabaster/acrylic');
    const coarse = await capture(browser, HEAD, 'head', 'alabaster', 'acrylic', 'coarse');
    report.diagnostics.head.errors.push(...coarse.errors);
    report.diagnostics.head.http.push(...coarse.http);

    const coarseStyles = coarse.styles;
    report.coarse = {
      desktopBackgroundImage: desktop.styles.placard['background-image'],
      coarseBackgroundImage: coarseStyles.placard['background-image'],
      desktopBackdropFilter: desktop.styles.placard['backdrop-filter'],
      coarseBackdropFilter: coarseStyles.placard['backdrop-filter'],
      sameGradient:
        desktop.styles.placard['background-image'] === coarseStyles.placard['background-image'],
      sameLineColours: Object.fromEntries(
        LINES.map((line) => {
          const desktopColor = desktop.styles.lines[line]?.color;
          const coarseColor = coarseStyles.lines[line]?.color;
          return [
            line,
            desktopColor == null || coarseColor == null
              ? 'not-rendered'
              : desktopColor === coarseColor,
          ];
        }),
      ),
      pass:
        desktop.styles.placard['background-image'] === coarseStyles.placard['background-image'] &&
        coarseStyles.placard['backdrop-filter'] === 'none' &&
        desktop.styles.placard['backdrop-filter'] === 'blur(2.5px)',
    };
    console.log(
      `coarse: sameGradient=${report.coarse.sameGradient} ` +
        `desktopBackdrop=${report.coarse.desktopBackdropFilter} coarseBackdrop=${report.coarse.coarseBackdropFilter}`,
    );

    // 3.3 — sample the real composited plate pixel next to the timecode.
    const timecode = desktop.styles.lines['.placard-timecode'];
    const placard = desktop.styles.placard;
    const placardRect = roundRect(placard.rect);
    const samplePoint = {
      x: timecode.rect.x + timecode.rect.width + 8,
      y: timecode.rect.y + timecode.rect.height / 2,
    };
    const platePixel = await samplePatch(sharp, desktop.shotFile, samplePoint);
    const wallPoint = {
      x: Math.max(2, placardRect.x - 12),
      y: placardRect.y + placardRect.height / 2,
    };
    const wallPixel = await samplePatch(sharp, desktop.shotFile, wallPoint);

    const ink = parseRgb(timecode.color);
    const opacity = Number(timecode.opacity);
    const renderedInk = over(ink, opacity, platePixel);
    const measuredRatio = contrast(renderedInk, platePixel);

    report.pixelSample = {
      samplePoint,
      wallSamplePoint: wallPoint,
      platePixel: hex(platePixel),
      wallPixel: hex(wallPixel),
      timecodeColor: timecode.color,
      timecodeOpacity: opacity,
      renderedInk: hex(renderedInk),
      measuredContrast: Number(measuredRatio.toFixed(3)),
      passesFloor: measuredRatio >= 4.5,
      desktopBackdropFilter: placard['backdrop-filter'],
    };
    console.log(
      `pixel sample: plate=${hex(platePixel)} wall=${hex(wallPixel)} ` +
        `contrast=${measuredRatio.toFixed(2)} backdrop=${placard['backdrop-filter']}`,
    );

    const matrixPassed = Object.values(report.matrix).every((entry) => entry.pass);
    report.pass = matrixPassed && report.coarse.pass && report.pixelSample.passesFloor;
    await writeFile(path.join(CROPS, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
    console.log(`wrote ${path.join(CROPS, 'report.json')} pass=${report.pass}`);
    if (!report.pass) process.exitCode = 1;
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
