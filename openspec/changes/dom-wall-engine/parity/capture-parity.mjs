#!/usr/bin/env node
/**
 * Task 4.2 — component-level parity capture for the `dom-wall-engine` wall.
 *
 * Drives the real production build (`next start`) with the pinned
 * `?demo=4` fixture and captures, for every viewport x mood:
 *   - Row-0 Overview (the default entry framing),
 *   - Album Focus (click a placard),
 *   - Print Focus (click a print).
 *
 * Also captures the Brushed Aluminum placard variant and the macro tier
 * (`?demo=1000`, zoomed out) to prove zero print elements / mosaic canvases.
 *
 *   npx next build && npx next start -p 3111   (see parity/README.md)
 *   PLAYWRIGHT_MODULE=playwright node \
 *     openspec/changes/dom-wall-engine/parity/capture-parity.mjs
 *
 * Writes PNGs plus `parity-results.json` (console errors, HTTP failures, layout
 * invariants) next to this script.
 */

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ORIGIN = process.env.PARITY_ORIGIN ?? 'http://127.0.0.1:3111';
const VIEWPORTS = [
  { name: '1600x1000', width: 1600, height: 1000 },
  { name: '1920x1080', width: 1920, height: 1080 },
  { name: '390x844', width: 390, height: 844 },
];
const MOODS = ['concrete', 'alabaster', 'chiaroscuro'];

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
  throw new Error('Playwright unavailable: install it or set PLAYWRIGHT_MODULE.');
}

/** Wait until the eased camera flight stops moving the `.world` transform. */
async function settle(page) {
  await page.waitForFunction(() => (document.querySelector('.world')?.style.transform ?? '').length > 0, undefined, {
    timeout: 120_000,
  });
  await page.waitForFunction(
    () =>
      new Promise((resolve) => {
        const world = document.querySelector('.world');
        const first = world?.style.transform ?? '';
        setTimeout(() => resolve(first !== '' && first === (world?.style.transform ?? '')), 450);
      }),
    undefined,
    { timeout: 60_000, polling: 300 },
  );
  // Let fonts and image decodes land before the shot.
  await page.waitForTimeout(400);
}

function attachDiagnostics(page) {
  const errors = [];
  const http = [];
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`console: ${message.text().slice(0, 300)}`);
  });
  page.on('response', (response) => {
    if (response.status() >= 400) http.push(`${response.status()} ${response.url()}`);
  });
  return { errors, http };
}

async function capture(directory, name, page) {
  await page.screenshot({ path: path.join(directory, `${name}.png`) });
  return `${name}.png`;
}

async function pageInvariants(page) {
  return page.evaluate(() => {
    const world = document.querySelector('.world');
    const islands = Array.from(document.querySelectorAll('.album-island'));
    const row0 = islands
      .map((island) => ({ id: island.getAttribute('data-album-id'), rect: island.getBoundingClientRect() }))
      .sort((a, b) => a.rect.top - b.rect.top)
      .slice(0, 3);
    const docWidth = Math.max(document.documentElement.scrollWidth, document.body.scrollWidth);
    return {
      tier: world?.getAttribute('data-tier') ?? null,
      islandCount: islands.length,
      printCount: document.querySelectorAll('.photo-frame').length,
      mosaicCount: document.querySelectorAll('.island-mosaic').length,
      placardCount: document.querySelectorAll('.museum-placard').length,
      soundtrackPlaques: document.querySelectorAll('.soundtrack-plaque').length,
      dimmedPrints: document.querySelectorAll('.photo-frame.is-dimmed').length,
      focusedPrints: document.querySelectorAll('.photo-frame.is-focused').length,
      hudSegments: document.querySelectorAll('.hud-top-right .hud-button').length,
      dockItems: document.querySelectorAll('.hud-directory-item').length,
      focusBar: document.querySelector('.photo-focus-bar')?.textContent?.replace(/\s+/g, ' ').trim() ?? null,
      horizontaOverflowPx: Math.max(0, docWidth - window.innerWidth),
      // Entry framing is aspect-aware: 3 albums on a desktop, 2 on a tablet,
      // 1 on a phone (3 x 9u cannot fit 390px above the macro threshold).
      row0TargetAlbums: window.innerWidth >= 1024 ? 3 : window.innerWidth >= 768 ? 2 : 1,
      row0FullyFramedCount: row0.filter(
        (entry) => entry.rect.left >= -1 && entry.rect.right <= window.innerWidth + 1,
      ).length,
      row0FirstFullyFramed: Boolean(
        row0[0] && row0[0].rect.left >= -1 && row0[0].rect.right <= window.innerWidth + 1,
      ),
      row0SameTop: row0.length > 1 ? Math.abs(row0[0].rect.top - row0[1].rect.top) < 2 : true,
      row0Ids: row0.map((entry) => entry.id),
      domMood: document.querySelector('.gallery-root-inner')?.getAttribute('data-mood') ?? null,
      // Accessibility: every print is a labelled button; tab order follows sortOrder.
      printButtonsWithLabel: document.querySelectorAll('.photo-frame[aria-label]').length,
      printButtonCount: document.querySelectorAll('button.photo-frame').length,
      sampleAlt: document.querySelector('.photo-frame')?.getAttribute('aria-label') ?? null,
    };
  });
}

async function main() {
  const { chromium } = await loadPlaywright();
  await mkdir(HERE, { recursive: true });

  const browser = await chromium.launch({
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--enable-unsafe-swiftshader'],
  });

  const report = { generatedAt: new Date().toISOString(), origin: ORIGIN, shots: [], pages: [] };

  try {
    for (const viewport of VIEWPORTS) {
      for (const mood of MOODS) {
        const page = await browser.newPage({
          viewport: { width: viewport.width, height: viewport.height },
          deviceScaleFactor: 1,
        });
        const diagnostics = attachDiagnostics(page);
        await page.goto(`${ORIGIN}/?demo=4&mood=${mood}`, { waitUntil: 'load', timeout: 180_000 });
        await settle(page);

        const prefix = `${viewport.name}-${mood}`;
        const row0 = await pageInvariants(page);
        await capture(HERE, `${prefix}-row0`, page);

        // Album focus: click the second placard (album tier) or the second
        // mosaic tile (macro tier, e.g. a phone where row 0 cannot fit).
        await page.evaluate(() => {
          const target =
            document.querySelectorAll('.museum-placard')[1] ??
            document.querySelector('.museum-placard') ??
            document.querySelectorAll('.island-mosaic-button')[1] ??
            document.querySelector('.island-mosaic-button');
          target?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });
        await settle(page);
        const album = await pageInvariants(page);
        await capture(HERE, `${prefix}-album`, page);

        // Print focus: click the third print of the focused album.
        await page.evaluate(() => {
          const frames = document.querySelectorAll('.photo-frame');
          (frames[2] ?? frames[0])?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });
        await settle(page);
        const print = await pageInvariants(page);
        await capture(HERE, `${prefix}-print`, page);

        report.shots.push({ viewport: viewport.name, mood, prefix });
        report.pages.push({
          viewport: viewport.name,
          mood,
          row0,
          album,
          print,
          consoleErrors: diagnostics.errors,
          httpFailures: diagnostics.http,
        });
        console.log(
          `${prefix}: row0 islands=${row0.islandCount} framed=${row0.row0FullyFramedCount}/${row0.row0TargetAlbums} | ` +
            `album prints=${album.printCount} | print dimmed=${print.dimmedPrints} focused=${print.focusedPrints} ` +
            `bar=${print.focusBar ? 'yes' : 'no'} | errors=${diagnostics.errors.length} http>=400=${diagnostics.http.length}`,
        );
        await page.close();
      }
    }

    // Brushed Aluminum alternative (Curator Settings) persisted in localStorage.
    for (const viewport of [VIEWPORTS[0], VIEWPORTS[2]]) {
      const page = await browser.newPage({
        viewport: { width: viewport.width, height: viewport.height },
        deviceScaleFactor: 1,
      });
      const diagnostics = attachDiagnostics(page);
      await page.addInitScript(() => {
        window.localStorage.setItem('photo-wall:placard-material', 'brushed-aluminum');
      });
      await page.goto(`${ORIGIN}/?demo=4&mood=concrete`, { waitUntil: 'load', timeout: 180_000 });
      await settle(page);
      await page.evaluate(() => {
        const target =
          document.querySelectorAll('.museum-placard')[1] ??
          document.querySelector('.museum-placard') ??
          document.querySelectorAll('.island-mosaic-button')[1] ??
          document.querySelector('.island-mosaic-button');
        target?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });
      await settle(page);
      const invariants = await pageInvariants(page);
      const material = await page.evaluate(
        () => document.querySelector('.museum-placard')?.getAttribute('data-material') ?? null,
      );
      await capture(HERE, `${viewport.name}-concrete-brushed-aluminum`, page);
      report.pages.push({
        viewport: viewport.name,
        mood: 'concrete',
        variant: 'brushed-aluminum',
        material,
        album: invariants,
        consoleErrors: diagnostics.errors,
        httpFailures: diagnostics.http,
      });
      console.log(`${viewport.name} brushed-aluminum: material=${material} errors=${diagnostics.errors.length}`);
      await page.close();
    }

    // Macro tier at 50 x 20: zero print elements, mosaic canvases only.
    {
      const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1 });
      const diagnostics = attachDiagnostics(page);
      await page.goto(`${ORIGIN}/?demo=1000&mood=chiaroscuro`, { waitUntil: 'load', timeout: 180_000 });
      await settle(page);
      await page.mouse.move(800, 520);
      for (let step = 0; step < 16; step += 1) {
        await page.mouse.wheel(0, 260);
        await page.waitForTimeout(40);
      }
      await settle(page);
      const invariants = await pageInvariants(page);
      await capture(HERE, '1600x1000-chiaroscuro-demo1000-macro', page);
      report.pages.push({
        viewport: '1600x1000',
        mood: 'chiaroscuro',
        demo: 1000,
        macro: invariants,
        consoleErrors: diagnostics.errors,
        httpFailures: diagnostics.http,
      });
      console.log(
        `macro: tier=${invariants.tier} islands=${invariants.islandCount} mosaics=${invariants.mosaicCount} prints=${invariants.printCount} errors=${diagnostics.errors.length}`,
      );
      await page.close();
    }
  } finally {
    await browser.close();
  }

  await writeFile(path.join(HERE, 'parity-results.json'), JSON.stringify(report, null, 2));
  const failures = report.pages.filter(
    (entry) => (entry.consoleErrors?.length ?? 0) > 0 || (entry.httpFailures?.length ?? 0) > 0,
  );
  console.log(`\nwrote ${report.shots.length * 3 + 3} screenshots + parity-results.json`);
  if (failures.length > 0) {
    console.error(`pages with diagnostics: ${failures.length}`);
    for (const entry of failures) {
      console.error(` ${entry.viewport} ${entry.mood}`, entry.consoleErrors, entry.httpFailures);
    }
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
