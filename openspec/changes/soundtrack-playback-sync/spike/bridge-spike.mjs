#!/usr/bin/env node
/**
 * Task 1.1: does the youtube-nocookie embed answer a raw `listening` post?
 * Serves a tiny host page at http://spike.local/ (route-fulfilled), mounts the
 * embed with enablejsapi=1&origin=..., and logs every message received.
 * Run: PARITY_MODULE=/tmp/dl/node_modules/playwright-core/index.js node bridge-spike.mjs [videoId]
 */
const VIDEO = process.argv[2] ?? 'jNQXAC9IVRw';
const mod = await import(process.env.PARITY_MODULE ?? 'playwright');
const { chromium } = mod.default ?? mod;
const browser = await chromium.launch({
  headless: true,
  args: ['--autoplay-policy=no-user-gesture-required'],
});
const page = await browser.newPage();
const logs = [];
page.on('console', (m) => logs.push(m.text()));
await page.route('http://spike.local/', (route) =>
  route.fulfill({
    contentType: 'text/html',
    body: `<!doctype html><iframe id="p" width="480" height="270" allow="autoplay; encrypted-media" src="https://www.youtube-nocookie.com/embed/${VIDEO}?autoplay=1&rel=0&modestbranding=1&playsinline=1&enablejsapi=1&origin=${encodeURIComponent('http://spike.local')}"></iframe>
<script>
  const f = document.getElementById('p'); const t0 = performance.now();
  window.addEventListener('message', (e) => {
    if (e.origin !== 'https://www.youtube-nocookie.com' || e.source !== f.contentWindow) return;
    console.log(JSON.stringify({ t: Math.round(performance.now() - t0), data: typeof e.data === 'string' ? e.data.slice(0, 300) : e.data }));
  });
  f.addEventListener('load', () => {
    console.log('load ' + Math.round(performance.now() - t0));
    const post = () => f.contentWindow.postMessage(JSON.stringify({ event: 'listening', id: 'a1', channel: 'widget' }), 'https://www.youtube-nocookie.com');
    post(); window.__iv = setInterval(post, 250); setTimeout(() => clearInterval(window.__iv), 3000);
  });
</script>`,
  }),
);
await page.goto('http://spike.local/');
await page.waitForTimeout(9000);
console.log(logs.slice(0, 40).join('\n'));
console.log('TOTAL', logs.length);
await browser.close();
