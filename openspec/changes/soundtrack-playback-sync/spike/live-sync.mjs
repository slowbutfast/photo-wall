#!/usr/bin/env node
/**
 * Task 3.2: live check of the placard timecode against the embed's own reports.
 *
 * Run: PARITY_MODULE=/tmp/dl/node_modules/playwright-core/index.js \
 *      BASE_URL=http://localhost:3217 node live-sync.mjs
 *
 * Local dev only (demo manifest, STORAGE_DRIVER=local). Clicks the first
 * soundtrack facade, then samples the placard timecode, the capture layer and
 * the player's reported state/position (via a window message tap) for ~12 s.
 */
const BASE = process.env.BASE_URL ?? 'http://localhost:3217';
const mod = await import(process.env.PARITY_MODULE ?? 'playwright');
const { chromium } = mod.default ?? mod;

const browser = await chromium.launch({
  headless: true,
  args: ['--autoplay-policy=no-user-gesture-required'],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const consoleLines = [];
page.on('console', (m) => {
  if (m.text().startsWith('[soundtrack]')) consoleLines.push(m.text());
});

await page.addInitScript(() => {
  window.__bridge = [];
  window.addEventListener('message', (e) => {
    if (e.origin !== 'https://www.youtube-nocookie.com') return;
    try {
      const d = typeof e.data === 'string' ? JSON.parse(e.data) : e.data;
      if (d.event === 'infoDelivery' || d.event === 'initialDelivery' || d.event === 'onStateChange') {
        const info = d.event === 'onStateChange' ? { playerState: d.info } : d.info ?? {};
        if ('playerState' in info || 'currentTime' in info) {
          window.__bridge.push({ t: Math.round(performance.now()), state: info.playerState, time: info.currentTime });
        }
      }
    } catch {
      /* ignore */
    }
  });
});

await page.goto(`${BASE}/photos?demo=4&mood=chiaroscuro&debugSoundtrack=1`, { waitUntil: 'networkidle' });
await page.waitForSelector('.soundtrack-facade', { timeout: 30000 });

const sample = async (label) => {
  const row = await page.evaluate(() => {
    const plaque = document.querySelector('.soundtrack-plaque[data-state="playing"]');
    const island = plaque?.closest('.album-island');
    const bridge = window.__bridge;
    const last = bridge[bridge.length - 1] ?? null;
    return {
      timecode: island?.querySelector('.placard-timecode')?.textContent ?? null,
      captureLayer: Boolean(plaque?.querySelector('.soundtrack-capture-layer')),
      iframe: Boolean(plaque?.querySelector('.soundtrack-iframe')),
      lastReport: last,
      reports: bridge.length,
    };
  });
  console.log(label.padEnd(10), JSON.stringify(row));
  return row;
};

await page.locator('.soundtrack-facade').first().click();
await page.waitForSelector('.soundtrack-iframe', { timeout: 15000 });
const t0 = Date.now();
const rows = [];
for (const at of [500, 1200, 2000, 3000, 5000, 8000, 12000]) {
  await page.waitForTimeout(Math.max(0, at - (Date.now() - t0)));
  rows.push(await sample(`+${at}ms`));
}

console.log('--- console ([soundtrack] debug)');
console.log(consoleLines.slice(0, 20).join('\n'));

const first = rows[0];
const last = rows[rows.length - 1];
const states = rows.map((r) => r.lastReport?.state);
const verdict = {
  reachedPlaying: states.includes(1),
  timecodeAtEnd: last.timecode,
  captureLayerAtEnd: last.captureLayer,
  captureLayerAt500ms: first.captureLayer,
};
console.log('VERDICT', JSON.stringify(verdict));
await browser.close();
