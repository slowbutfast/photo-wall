#!/usr/bin/env node
/**
 * Task 3.2: coarse-touch emulation of the glare toggle, and a fine-pointer
 * control, on local dev (`?demo=4`, STORAGE_DRIVER=local).
 *
 * Run: PARITY_MODULE=/tmp/dl/node_modules/playwright-core/index.js \
 *      BASE_URL=http://localhost:3217 node glare-toggle.mjs
 *
 * Coarse (393x852, hasTouch, isMobile): open Print Focus, then tap the focused
 * print twice. Records `data-glare`, the computed `background-image` of the
 * focused frame's sheen and the overlay's sheen, the inline sheen opacity the
 * gyro path owns, the hint text, and saves screenshots to `./`.
 * Fine (1440x900, mouse): click the focused print; nothing may toggle.
 */
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const BASE = process.env.BASE_URL ?? 'http://localhost:3217';
const mod = await import(process.env.PARITY_MODULE ?? 'playwright');
const { chromium } = mod.default ?? mod;
await mkdir(HERE, { recursive: true });

const browser = await chromium.launch({ headless: true });

const READ = () => {
  const viewport = document.querySelector('.wall-viewport');
  const frameSheen = document.querySelector('.photo-frame.focused .photo-sheen');
  const overlaySheen = document.querySelector('.print-sharp-overlay .photo-sheen');
  const bg = (el) => (el ? getComputedStyle(el).backgroundImage : null);
  return {
    dataGlare: viewport?.getAttribute('data-glare') ?? null,
    tier: viewport?.getAttribute('data-tier') ?? null,
    focusedFrame: Boolean(document.querySelector('.photo-frame.focused')),
    frameSheenBg: bg(frameSheen)?.slice(0, 40) ?? null,
    overlaySheenBg: bg(overlaySheen)?.slice(0, 40) ?? null,
    frameSheenInlineOpacity: frameSheen?.style.opacity ?? null,
    hint: document.querySelector('.glare-hint')?.textContent ?? null,
    hintVisible: document.querySelector('.glare-hint')?.getAttribute('data-visible') ?? null,
  };
};

async function coarse() {
  const context = await browser.newContext({
    viewport: { width: 393, height: 852 },
    deviceScaleFactor: 2,
    hasTouch: true,
    isMobile: true,
  });
  const page = await context.newPage();
  await page.goto(`${BASE}/photos?demo=4&mood=chiaroscuro`, { waitUntil: 'networkidle' });
  const pointer = await page.evaluate(() => matchMedia('(pointer: coarse)').matches);
  console.log('coarse pointer matches:', pointer);

  const centre = async (selector) => {
    const box = await page.locator(selector).first().boundingBox();
    if (!box) throw new Error(`no box for ${selector}`);
    return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  };

  // Overview (macro) -> album focus -> print focus.
  await page.waitForSelector('.island-mosaic-button, .photo-frame', { timeout: 30000 });
  if (await page.locator('.island-mosaic-button').count()) {
    const c = await centre('.island-mosaic-button');
    await page.touchscreen.tap(c.x, c.y);
    await page.waitForTimeout(1600);
  }
  const frame = await centre('.photo-frame');
  await page.touchscreen.tap(frame.x, frame.y);
  await page.waitForSelector('.photo-frame.focused', { timeout: 15000 });
  await page.waitForTimeout(1500);

  const out = {};
  out.printFocus = await page.evaluate(READ);
  console.log('print focus      ', JSON.stringify(out.printFocus));
  await page.screenshot({ path: path.join(HERE, 'coarse-glare-on.png') });

  const focused = await centre('.photo-frame.focused');
  await page.touchscreen.tap(focused.x, focused.y);
  await page.waitForTimeout(400);
  out.afterFirstTap = await page.evaluate(READ);
  console.log('after 1st tap    ', JSON.stringify(out.afterFirstTap));
  await page.screenshot({ path: path.join(HERE, 'coarse-glare-off.png') });

  await page.waitForTimeout(1800);
  out.hintGone = await page.evaluate(READ);
  console.log('after hint ends  ', JSON.stringify(out.hintGone));

  const again = await centre('.photo-frame.focused');
  await page.touchscreen.tap(again.x, again.y);
  await page.waitForTimeout(400);
  out.afterSecondTap = await page.evaluate(READ);
  console.log('after 2nd tap    ', JSON.stringify(out.afterSecondTap));
  await context.close();
  return out;
}

async function fine() {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  await page.goto(`${BASE}/photos?demo=4&mood=chiaroscuro`, { waitUntil: 'networkidle' });
  await page.waitForSelector('.photo-frame', { timeout: 30000 });
  // At desktop rest (scale < 0.52) the first click focuses the album; the
  // second enters Print Focus.
  await page.locator('.photo-frame').first().click();
  await page.waitForTimeout(1600);
  await page.locator('.photo-frame').first().click();
  await page.waitForSelector('.photo-frame.focused', { timeout: 15000 });
  await page.waitForTimeout(1500);
  const before = await page.evaluate(READ);
  await page.locator('.photo-frame.focused').click();
  await page.waitForTimeout(400);
  const after = await page.evaluate(READ);
  console.log('fine before click', JSON.stringify(before));
  console.log('fine after click ', JSON.stringify(after));
  await context.close();
  return { before, after };
}

const c = await coarse();
const f = await fine();

const verdict = {
  coarseToggledOff: c.afterFirstTap.dataGlare === 'off',
  coarseFrameSheenHidden: c.afterFirstTap.frameSheenBg === 'none',
  coarseOverlaySheenHidden: c.afterFirstTap.overlaySheenBg === 'none',
  coarseHintShown: c.afterFirstTap.hint === 'Glare off · tap photo to restore',
  coarseHintCleared: c.hintGone.hintVisible === 'false',
  coarseRestored: c.afterSecondTap.dataGlare === null && c.afterSecondTap.frameSheenBg?.startsWith('radial-gradient'),
  coarseStillFocused: c.afterFirstTap.focusedFrame && c.afterSecondTap.focusedFrame,
  fineNeverToggles: f.after.dataGlare === null,
  fineSheenBgUntouched: f.after.frameSheenBg?.startsWith('radial-gradient') ?? false,
};
console.log('VERDICT', JSON.stringify(verdict, null, 2));
await browser.close();
