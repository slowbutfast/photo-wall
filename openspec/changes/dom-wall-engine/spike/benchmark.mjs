#!/usr/bin/env node
/**
 * Task 1.5 — `?demo=1000` macro-tier compositor benchmark harness.
 *
 * Usage (Playwright is not a project dependency):
 *
 *   python3 -m http.server 4173 --bind 127.0.0.1      # from the repository root
 *   node openspec/changes/dom-wall-engine/spike/generate-fixtures.mjs
 *   PLAYWRIGHT_MODULE=playwright \
 *     node openspec/changes/dom-wall-engine/spike/benchmark.mjs --repeats 3
 *
 * Measured inside the page (`window.runZoomBenchmark`) on the real gesture path:
 *   - p95 frame time while continuously zooming inside the macro band
 *     (`scale 0.09 -> 0.24`, i.e. always `< 0.25`);
 *   - settle hitch: the first frames after `will-change: transform` is removed;
 *   - decode/transfer totals for the 1,000 real JPEGs.
 *
 * The harness prints the numbers and writes the full JSON next to the fixture.
 * Hardware gates (named iGPU Chrome / named iPhone Safari) must be run on that
 * hardware by the maintainer — headless Chromium on a shared Linux container
 * cannot stand in for either.
 */

import { mkdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const GENERATED = path.join(HERE, '.generated');
const ORIGIN = process.env.SPIKE_ORIGIN ?? 'http://127.0.0.1:4173';
const PAGE_URL = `${ORIGIN}/openspec/changes/dom-wall-engine/spike/index.html`;

function parseArgs(argv) {
  const args = {
    repeats: 3,
    frames: 240,
    demo: '1000',
    mood: 'chiaroscuro',
    width: 1600,
    height: 1000,
    dpr: 1,
    mosaic: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    const next = argv[index + 1];
    switch (token) {
      case '--repeats':
        args.repeats = Number(next);
        index += 1;
        break;
      case '--frames':
        args.frames = Number(next);
        index += 1;
        break;
      case '--demo':
        args.demo = next;
        index += 1;
        break;
      case '--mood':
        args.mood = next;
        index += 1;
        break;
      case '--width':
        args.width = Number(next);
        index += 1;
        break;
      case '--height':
        args.height = Number(next);
        index += 1;
        break;
      case '--dpr':
        args.dpr = Number(next);
        index += 1;
        break;
      case '--mosaic':
        args.mosaic = true;
        break;
      default:
        break;
    }
  }
  return args;
}

async function loadPlaywright() {
  const candidates = [process.env.PLAYWRIGHT_MODULE, 'playwright', 'playwright-core'].filter(Boolean);
  const failures = [];
  for (const candidate of candidates) {
    try {
      const mod = await import(candidate);
      return mod.default ?? mod;
    } catch (error) {
      failures.push(`${candidate}: ${error.message}`);
    }
  }
  throw new Error(
    `Unable to import Playwright. Tried:\n  ${failures.join('\n  ')}\n` +
      'Install it (`npm i --no-save playwright`) or set PLAYWRIGHT_MODULE=<path to playwright-core/index.js>.',
  );
}

function summarise(runs) {
  const field = (name) => runs.map((run) => run[name]);
  const median = (values) => {
    const sorted = [...values].sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length / 2)];
  };
  return {
    p95FrameMs: median(field('p95FrameMs')),
    medianFrameMs: median(field('p50FrameMs')),
    worstFrameMs: Math.max(...field('maxFrameMs')),
    settleHitchMs: Math.max(...field('settleHitchMs')),
    framesOver17_5: median(field('framesOver17_5')),
    droppedFramesOver25: median(field('droppedFramesOver25')),
    settleControlHitchMs: Math.max(...field('settleControlHitchMs')),
    decodedImages: runs[0].decodedImages,
    failedImages: runs[0].failedImages,
    jpegBytesOnWire: runs[0].jpegBytesOnWire,
    photoCount: runs[0].photoCount,
    albumCount: runs[0].albumCount,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const { chromium } = await loadPlaywright();
  await mkdir(GENERATED, { recursive: true });

  const browser = await chromium.launch({
    args: [
      '--no-sandbox',
      '--disable-dev-shm-usage',
      '--enable-unsafe-swiftshader',
      // Keep vsync pacing honest: do not uncap the frame rate.
    ],
  });

  try {
    const context = await browser.newContext({
      viewport: { width: args.width, height: args.height },
      deviceScaleFactor: args.dpr,
    });
    const page = await context.newPage();
    const consoleErrors = [];
    page.on('pageerror', (error) => consoleErrors.push(error.message));

    const url = `${PAGE_URL}?demo=${args.demo}&mood=${args.mood}${args.mosaic ? '&mosaic=1' : ''}`;
    await page.goto(url, { waitUntil: 'load' });
    await page.waitForFunction(() => window.__spikeReady === true, undefined, { timeout: 120_000 });

    const fixture = await page.evaluate(() => ({
      albumCount: window.__spike.manifest.albumCount,
      photoCount: window.__spike.manifest.photoCount,
      totalJpegBytes: window.__spike.manifest.totalJpegBytes,
      failedImages: window.__spike.failedImages,
    }));

    const runs = [];
    for (let index = 0; index < args.repeats; index += 1) {
      // Reload between runs so each gesture starts from a cold camera and a
      // freshly rasterised layer stack.
      if (index > 0) {
        await page.reload({ waitUntil: 'load' });
        await page.waitForFunction(() => window.__spikeReady === true, undefined, {
          timeout: 120_000,
        });
      }
      const result = await page.evaluate(
        (options) => window.runZoomBenchmark(options),
        { frames: args.frames },
      );
      runs.push(result);
    }

    const environment = {
      measuredAt: new Date().toISOString(),
      runner: 'benchmark.mjs',
      url,
      viewport: { width: args.width, height: args.height, dpr: args.dpr },
      chromiumVersion: browser.version(),
      userAgent: await page.evaluate(() => navigator.userAgent),
      headless: true,
      gpuRenderer: runs[0].gpu,
      hardwareConcurrency: await page.evaluate(() => navigator.hardwareConcurrency ?? null),
      deviceMemoryGb: await page.evaluate(() => navigator.deviceMemory ?? null),
      host: {
        platform: `${process.platform} ${process.arch}`,
        cpu: os.cpus()?.[0]?.model ?? 'unknown',
        cpuCount: os.cpus()?.length ?? null,
        totalMemoryGb: Number((os.totalmem() / 1024 ** 3).toFixed(1)),
        node: process.version,
      },
      pageErrors: consoleErrors,
    };

    const summary = summarise(runs);
    const payload = { environment, fixture, runs, summary, args };
    const filename = `benchmark-${args.demo}${args.mosaic ? '-mosaic' : ''}-${args.width}x${args.height}-${Date.now()}.json`;
    await writeFile(path.join(GENERATED, filename), JSON.stringify(payload, null, 2));

    console.log(`\n?demo=${args.demo} · ${fixture.albumCount} albums · ${fixture.photoCount} JPEGs · ${args.width}x${args.height}@${args.dpr}x`);
    console.log(`GPU (headless): ${environment.gpuRenderer}`);
    console.log(`CPU: ${environment.host.cpu} (${environment.host.cpuCount} cores)`);
    console.log('\n  run   p50     p95     max     >17.5ms  >25ms   settle    control');
    runs.forEach((run, index) => {
      console.log(
        `  ${String(index + 1).padEnd(4)}  ${String(run.p50FrameMs).padEnd(6)}  ${String(
          run.p95FrameMs,
        ).padEnd(6)}  ${String(run.maxFrameMs).padEnd(6)}  ${String(run.framesOver17_5).padEnd(8)}  ${String(
          run.droppedFramesOver25,
        ).padEnd(7)}  ${String(run.settleHitchMs).padEnd(8)}  ${run.settleControlHitchMs}ms`,
      );
    });
    console.log(
      `  mounted: ${runs[0].mountedIslands} islands · ${runs[0].mountedMosaicElements} mosaics · ${runs[0].mountedPrintElements} print elements`,
    );
    console.log(
      `\n  median p95 ${summary.p95FrameMs.toFixed(2)}ms (gate <= 16.7ms) · ` +
        `worst settle ${summary.settleHitchMs.toFixed(2)}ms (gate <= 100ms; control ${summary.settleControlHitchMs.toFixed(2)}ms) · ` +
        `decoded ${summary.decodedImages}/${summary.photoCount} JPEGs (${(
          summary.jpegBytesOnWire / 1024 / 1024
        ).toFixed(1)} MB)`,
    );
    console.log(`\n  JSON: openspec/changes/dom-wall-engine/spike/.generated/${filename}`);
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
