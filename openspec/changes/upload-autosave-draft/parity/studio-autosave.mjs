#!/usr/bin/env node
/**
 * Task 3.2: drive the real Curator Studio on LOCAL dev only.
 *
 * Run (server started with ADMIN_ENABLED=true STORAGE_DRIVER=local and a local
 * SQLite file, never preview or production):
 *   PARITY_MODULE=/tmp/dl/node_modules/playwright-core/index.js \
 *   BASE_URL=http://localhost:3217 node studio-autosave.mjs
 *
 * Flow 1: upload 3 demo photos with Location set -> one metadata PATCH without
 *         `status`, the preview refetches and shows a Draft badge, then Publish
 *         sends only `status`.
 * Flow 2: upload again -> Discard -> DELETE, the draft leaves the preview.
 */
import { copyFile, mkdir, mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '../../../..');
const BASE = process.env.BASE_URL ?? 'http://localhost:3217';
const PASSWORD = process.env.ADMIN_PASSWORD ?? 'test-password-1234';
const DEMO = ['photo-01.jpg', 'photo-02.jpg', 'photo-03.jpg'];

// The Studio's file input is a `webkitdirectory` input, so Playwright needs a
// directory. Build two small album folders from the committed demo photos.
const WORK = await mkdtemp(path.join(process.env.WORK_DIR ?? os.tmpdir(), 'studio-albums-'));
async function album(name, photos) {
  const dir = path.join(WORK, name);
  await mkdir(dir, { recursive: true });
  for (const photo of photos) await copyFile(path.join(REPO, 'public/demo', photo), path.join(dir, photo));
  return dir;
}
const ALBUM_ONE = await album('kyoto-trip', DEMO);
const ALBUM_TWO = await album('osaka-trip', DEMO.slice(0, 2));

if (!/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(BASE)) {
  throw new Error(`Refusing to run against ${BASE}: local dev only.`);
}

const mod = await import(process.env.PARITY_MODULE ?? 'playwright');
const { chromium } = mod.default ?? mod;
await mkdir(HERE, { recursive: true });

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();

const log = [];
const t0 = Date.now();
page.on('request', (request) => {
  const url = new URL(request.url());
  if (!url.pathname.includes('/api/admin/')) return;
  if (url.pathname.endsWith('/photos')) return; // per-photo uploads are noisy
  let body = null;
  try {
    body = request.postData() ? JSON.parse(request.postData()) : null;
  } catch {
    body = '(non-json)';
  }
  log.push({ t: Date.now() - t0, method: request.method(), path: url.pathname.replace('/photos', ''), body });
});

const login = await page.request.post(`${BASE}/photos/api/admin/auth`, {
  data: { password: PASSWORD },
  headers: { origin: BASE },
});
console.log('login status', login.status());

await page.goto(`${BASE}/photos/admin`, { waitUntil: 'domcontentloaded', timeout: 120000 });
await page.waitForSelector('[role="tab"]', { timeout: 120000 });
await page.getByRole('tab', { name: 'Upload' }).or(page.getByRole('button', { name: 'Upload', exact: true })).first().click();
await page.waitForSelector('input[type="file"]', { state: 'attached' });

const draftIslands = () =>
  page.evaluate(() => document.querySelectorAll('.studio-canvas-root .album-island.is-draft').length);
const statusText = () =>
  page.evaluate(() => document.querySelector('.admin-draft-status')?.textContent ?? null);
const cardCount = () => page.evaluate(() => document.querySelectorAll('.admin-draft').length);
const buttonLabels = () =>
  page.evaluate(() =>
    Array.from(document.querySelectorAll('.admin-draft button')).map((b) => b.textContent),
  );

const baselineDrafts = await draftIslands();
console.log('draft islands before', baselineDrafts);

// --- Flow 1 -------------------------------------------------------------
await page.locator('input[placeholder="Shibuya, Tokyo"]').fill('Kyoto');
await page.locator('input[type="file"]').setInputFiles(ALBUM_ONE);
await page.waitForFunction(
  () => document.querySelector('.admin-draft-status')?.textContent === 'Saved as draft',
  null,
  { timeout: 60000 },
);
await page.waitForTimeout(1500); // let the refresh requests land
const afterSave = {
  status: await statusText(),
  buttons: await buttonLabels(),
  notices: await page.evaluate(() => Array.from(document.querySelectorAll('.admin-note')).map((el) => el.textContent)),
  draftIslands: await draftIslands(),
};
console.log('after auto-save ', JSON.stringify(afterSave));
await page.screenshot({ path: path.join(HERE, 'studio-after-autosave.png') });

const patchesAfterSave = log.filter((entry) => entry.method === 'PATCH');
const savePatch = patchesAfterSave[0];
const refreshesAfterSave = log.filter(
  (entry) => entry.t >= (savePatch?.t ?? 0) && entry.method === 'GET' && /wall-preview|\/albums$/.test(entry.path),
);

await page.getByRole('button', { name: 'Publish album' }).click();
await page.waitForFunction(
  () => document.querySelector('.admin-draft-status')?.textContent === 'Published',
  null,
  { timeout: 30000 },
);
await page.waitForTimeout(1500);
const publishPatch = log.filter((entry) => entry.method === 'PATCH')[1];
const afterPublish = { status: await statusText(), draftIslands: await draftIslands() };
console.log('after publish   ', JSON.stringify(afterPublish));
await page.screenshot({ path: path.join(HERE, 'studio-after-publish.png') });

// --- Flow 2 -------------------------------------------------------------
await page.locator('input[type="file"]').setInputFiles(ALBUM_TWO);
await page.waitForFunction(
  () => Array.from(document.querySelectorAll('.admin-draft-status')).some((el) => el.textContent === 'Saved as draft'),
  null,
  { timeout: 60000 },
);
await page.waitForTimeout(1500);
const beforeDiscard = { cards: await cardCount(), draftIslands: await draftIslands() };
const cardsBefore = beforeDiscard.cards;
await page.locator('.admin-draft', { hasText: 'Saved as draft' }).getByRole('button', { name: 'Discard draft' }).click();
await page.waitForFunction((n) => document.querySelectorAll('.admin-draft').length === n - 1, cardsBefore, { timeout: 30000 });
await page.waitForTimeout(1500);
const afterDiscard = { cards: await cardCount(), draftIslands: await draftIslands() };
const deletes = log.filter((entry) => entry.method === 'DELETE');
console.log('discard before  ', JSON.stringify(beforeDiscard));
console.log('discard after   ', JSON.stringify(afterDiscard));

console.log('--- admin requests (in order)');
for (const entry of log) console.log(`${String(entry.t).padStart(6)}ms ${entry.method.padEnd(6)} ${entry.path} ${entry.body ? JSON.stringify(entry.body) : ''}`);

const patches = log.filter((entry) => entry.method === 'PATCH');
const verdict = {
  oneSavePatchPerAlbum: patches.filter((entry) => !('status' in entry.body)).length === 2,
  onePublishPatch: patches.filter((entry) => entry.body?.status === 'published').length === 1,
  noticeNamesTheDraft: afterSave.notices.some((text) => text === 'Saved Untitled Album as draft'),
  savePatchHasNoStatus: Boolean(savePatch) && !('status' in savePatch.body),
  savePatchCarriesLocation: savePatch?.body?.locationLabel === 'Kyoto',
  cardReadsSavedAsDraft: afterSave.status === 'Saved as draft',
  noExtraButtons: JSON.stringify([...afterSave.buttons].sort()) === JSON.stringify(['Discard draft', 'Publish album']),
  previewRefetchedAfterSave: refreshesAfterSave.length >= 2,
  previewShowsDraftBadge: afterSave.draftIslands > baselineDrafts,
  publishSendsOnlyStatus: JSON.stringify(Object.keys(publishPatch?.body ?? {})) === JSON.stringify(['status']),
  publishedLeavesDraftIslands: afterPublish.draftIslands === baselineDrafts,
  noStatusDraftEver: !patches.some((entry) => entry.body?.status === 'draft'),
  discardSentDelete: deletes.length === 1,
  discardRemovedCardAndDraft: afterDiscard.cards === beforeDiscard.cards - 1 && afterDiscard.draftIslands === beforeDiscard.draftIslands - 1,
};
console.log('VERDICT', JSON.stringify(verdict, null, 2));
await browser.close();
