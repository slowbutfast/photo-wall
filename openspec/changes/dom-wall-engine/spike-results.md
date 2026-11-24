# Task 1.5 — Blocking Macro Spike Results (`?demo=1000`)

**Status:** automated headless measurements complete · **named-iGPU and named-iPhone hardware gates PENDING MAINTAINER SIGN-OFF** · the desktop settle gate failed on the as-built macro tier, the documented **pre-baked per-island mosaic fallback is now implemented** (`CssGalleryWorld`, Task 3.2) and re-measured — see [Macro mosaic fallback](#macro-mosaic-fallback-implemented-task-32).

- **Measured:** 2026-11-23 · `openspec/changes/dom-wall-engine/spike/benchmark.mjs`
- **Fixture:** `?demo=1000` → 50 albums × 20 prints = **1,000 real-JPEG `<img>` elements**, mixed `4:5` / `3:2` / `2:3`, 256px long edge (macro LOD bucket)
- **Harness source of truth:** `openspec/changes/dom-wall-engine/spike/` (`index.html`, `generate-fixtures.mjs`, `benchmark.mjs`, `screenshots.mjs`)
- **Raw JSON:** `spike/.generated/benchmark-1000-*.json` (git-ignored, regenerate with the commands in [Reproduce](#reproduce))
- **Screenshots:** `spike/screenshots/demo1000-{row0-entry,macro-overview,album-zoom}.png`

---

## Environment (automated run)

| Item | Value |
| :--- | :--- |
| Host | Linux container, `Neoverse-N1` (ARM64), **3 vCPU**, shared |
| Node | v22.23.2 |
| Browser | HeadlessChrome **159.0.8154.6** (Playwright `chromium`), SwiftShader software WebGL |
| GPU reported | `ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (LLVM 10.0.0) (0x0000C0DE)), SwiftShader driver)` |
| Viewports tested | `1600×1000 @1x`, `1600×1000 @2x`, `390×844 @3x` (mobile proxy) |
| Fixture payload | 1,000 unique JPEGs · 3.6 MB on disk · 0.95 MB transferred · **1,000/1,000 decoded, 0 failed** |

> This is **not** the gate hardware. It is a software rasterizer on three shared cores with no GPU and no compositor thread budget comparable to a real iGPU or an iPhone. The numbers below are a lower bound on what hardware acceleration can be assumed to do, and an upper bound on what the DOM structure costs.

## Method

1. Page loads `?demo=1000`, waits for all 1,000 `<img>` elements to reach `complete && naturalWidth > 0` (`window.__spikeReady`).
2. 60 warm-up frames.
3. **Zoom gesture:** 240 frames of a continuous cursor-anchored wheel zoom from `scale 0.09` → `0.24` (entirely inside the macro band `< 0.25`), one zoom step + forced transform write per frame; frame time = `requestAnimationFrame` delta.
4. **Settle hitch:** a 4-frame control window at the same pacing, then `will-change: transform` is removed (forced style flush), then the next 4 frames are measured. Control isolates the removal cost from ambient compositor load. A `PerformanceObserver` for `long-animation-frame` runs across the whole gesture.
5. Each configuration is repeated with a full page reload; the summary uses the median of runs and the worst of the settle windows.

## Results — desktop `1600×1000 @1x` (3 runs × 240 frames)

| Run | p50 | p95 | p99 | max | frames > 25ms | settle hitch | control |
| :--- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | 16.7 | 16.8 | 16.8 | 266.6 | 1 | **232.9 ms** | 16.7 ms |
| 2 | 16.7 | 16.7 | 16.8 | 199.9 | 1 | **232.8 ms** | 16.7 ms |
| 3 | 16.7 | 16.7 | 16.8 | 266.6 | 1 | **232.9 ms** | 16.7 ms |

- Gesture window: ~4.2 s per run; **239 of 240 frames hit the 60 Hz vsync** (`p95 = 16.7–16.8 ms`, i.e. vsync-quantised — the 0.1 ms over 16.7 is clock jitter, not a missed frame).
- **One** frame per run blew past 25 ms (199.9–266.6 ms) — a re-raster when the compositor re-tiles the scaled layer.
- Removing `will-change: transform` costs **≈ 216 ms above the 16.7 ms control** (232.9 − 16.7). This is the whole-layer re-raster of all 1,000 mounted prints.

## Results — desktop `1600×1000 @2x` (2 runs × 180 frames)

| Run | p50 | p95 | max | frames > 25ms | settle hitch | control |
| :--- | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | 16.7 | 16.7 | 250.0 | 1 | **233.0 ms** | 16.7 ms |
| 2 | 16.7 | 16.8 | 266.7 | 1 | **233.0 ms** | 16.7 ms |

## Results — mobile proxy `390×844 @3x` (2 runs × 180 frames)

| Run | p50 | p95 | max | frames > 25ms | settle hitch | control |
| :--- | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | 16.7 | 16.7 | 83.4 | 1 | **82.9 ms** | 16.7 ms |
| 2 | 16.7 | 16.7 | 83.3 | 1 | **82.9 ms** | 16.7 ms |

The settle hitch tracks rasterised **area**, not element count alone: the mobile viewport rasters ~3.0 M device px vs ~8.0 M at `1600×1000 @2x`, and the hitch falls from 233 ms to 83 ms. That is consistent with the desktop figure being a full-layer re-raster.

## Verdicts

| Gate | Threshold | Measured (headless) | Verdict |
| :--- | :--- | :--- | :--- |
| **(a)** p95 frame time during zoom gesture, macro tier | `<= 16.7 ms` | **16.7–16.8 ms** (vsync-locked; 1 dropped frame / 180–240) | **PASS (automated)** · named-iGPU Chrome **PENDING MAINTAINER SIGN-OFF** |
| **(b)** settle hitch on `will-change: transform` removal | `<= 100 ms` | as-built prints: `1600×1000` **232.9–233.0 ms** → **failed** · after the macro mosaic fallback: `1600×1000` **49.6–49.7 ms**, `390×844 @3x` **16.8 ms** → passes | **PASS with the implemented mosaic fallback (automated)** · hardware re-run **PENDING MAINTAINER SIGN-OFF** |
| **(c)** zero tab reloads / OOM crashes at macro zoom | `0` reloads | not measurable headless (no iOS Safari, no iOS memory accounting) | **PENDING MAINTAINER SIGN-OFF** |

### Interpretation of (b)

The original failing figure was the cost of *compositing hygiene*: when `will-change:
transform` is dropped, Chrome re-rasterises the entire `.world` layer, and in
this spike that layer contains all 1,000 prints because **the spike does no
viewport culling**. It is a real cost of the design as specified (the engine
must drop `will-change` on settle so typography re-rasterises sharp), measured
in the harshest configuration.

Both mitigations are now in place:

1. **Viewport culling** (`visibleIslands`, Tasks 3.1–3.2) runs at every tier, so
   only on-screen islands mount anything.
2. **Pre-baked per-island mosaic at macro tier** (implemented in `CssGalleryWorld`
   / `macroMosaic.ts`, re-measured above) removes the 1,000 mounted print nodes
   that caused the re-raster.

The hardware sign-off below should therefore be run against the mosaic build; if
the named iGPU still exceeds 100 ms the remaining lever is the LOD bucket for the
mosaic source images (256px → 128px-equivalent `img` fetch), which only affects
first paint, not the settle hitch.

Neither (a) nor the decode/transfer data suggests memory pressure at 1,000
images (0.95 MB transferred, 1,000/1,000 decoded, no reloads observed in the
headless runs); (c) still needs a real device.

## Macro mosaic fallback — implemented (Task 3.2)

The gate (b) failure above was caused by the **as-built** macro tier mounting every print element. Per Task 1.5 and `architecture.md`, `CssGalleryWorld` now composites **one pre-baked canvas per visible island** at `scale < 0.25` (`macroMosaic.ts` + `mosaicFor()`), and only mounts the real accessible `<button>` prints at `album` / `print` tiers. Re-measured with the same harness (`--mosaic`, identical gesture, identical environment):

```bash
PLAYWRIGHT_MODULE=playwright node openspec/changes/dom-wall-engine/spike/benchmark.mjs \
  --repeats 3 --frames 240 --mosaic
```

| Configuration | Mounted DOM | p50 / p95 | max frame | frames > 25ms | settle hitch | control |
| :--- | :--- | ---: | ---: | ---: | ---: | ---: |
| `1600×1000 @1x` (3 runs) | 50 islands · **50 canvases** · **0 prints** | 16.7 / 16.7 | 16.8 | 0 | **49.7 ms** | 16.8 ms |
| `1600×1000 @2x` (2 runs) | same | 16.7 / 16.8 | 33.4 | 1 | **49.6 ms** | 16.8 ms |
| `390×844 @3x` (2 runs) | same | 16.7 / 16.7 | 16.8 | 0 | **16.8 ms** | 16.7 ms |

Compared with the as-built numbers at the same viewports: settle **232.9 → 49.7 ms** (`@1x`), **233.0 → 49.6 ms** (`@2x`), **82.9 → 16.8 ms** (`@3x`). The one-off 200–266 ms re-raster spikes during the gesture are gone (worst frame 16.8 ms at `@1x`).

- 1,000/1,000 JPEGs still decode (the mosaic paints each photo once into its island canvas; the `<img>` elements are not mounted at macro tier).
- Element budget: `macroMosaicElementCount(albums)` = 50 vs `macroPrintElementCount(albums)` = 1,000 — both asserted in `src/components/wall/__tests__/macroMosaic.test.ts`.
- The same strategy is mirrored by the spike page's `?mosaic=1` mode so the measurement can be re-run without the React app.

**Gate (b) now passes in the measured environment** (49.7 ms ≤ 100 ms). Gate (a) still sits at the vsync ceiling (16.7 ms) and gate (c) is still unmeasurable here, so the **hardware sign-off table below is unchanged and still required** before relying on the numbers for a real iGPU/iPhone.

## Maintainer sign-off (to be completed on hardware)

| Gate | Machine / browser (name it) | Result | Date | Signed |
| :--- | :--- | :--- | :--- | :--- |
| (a) p95 `<= 16.7 ms` zoom gesture | *e.g. MacBook Air M2 / Chrome 1xx* | — | — | — |
| (b) settle `<= 100 ms` | same machine | — | — | — |
| (c) zero reloads at macro zoom | *e.g. iPhone 15 / iOS 1x.x Safari* | — | — | — |

Do not tick Task 1.5's hardware gates from the headless numbers: they are
recorded above as automated evidence only.

## Reproduce

```bash
python3 -m http.server 4173 --bind 127.0.0.1          # repository root
node openspec/changes/dom-wall-engine/spike/generate-fixtures.mjs

PLAYWRIGHT_MODULE=playwright \
  node openspec/changes/dom-wall-engine/spike/benchmark.mjs --repeats 3 --frames 240
PLAYWRIGHT_MODULE=playwright \
  node openspec/changes/dom-wall-engine/spike/benchmark.mjs --repeats 2 --frames 180 --dpr 2
PLAYWRIGHT_MODULE=playwright \
  node openspec/changes/dom-wall-engine/spike/benchmark.mjs --repeats 2 --frames 180 \
    --width 390 --height 844 --dpr 3
PLAYWRIGHT_MODULE=playwright \
  node openspec/changes/dom-wall-engine/spike/screenshots.mjs
```

`PLAYWRIGHT_MODULE` may point at any `playwright-core/index.js` — Playwright is
not a project dependency.

## Artifacts

| Path | What |
| :--- | :--- |
| `spike/index.html` | the spike page (`?demo=1000`, `?mood=`) |
| `spike/generate-fixtures.mjs` | deterministic 1,000-JPEG generator + manifest (real production geometry) |
| `spike/benchmark.mjs` | Playwright benchmark harness (writes JSON + prints the table) |
| `spike/screenshots.mjs` | evidence screenshots |
| `spike/screenshots/demo1000-row0-entry.png` | row-0 framing, all 1,000 prints mounted |
| `spike/screenshots/demo1000-macro-overview.png` | whole 50-album wall at macro tier |
| `spike/screenshots/demo1000-album-zoom.png` | first island at album zoom (256px LOD upscaled) |
| `spike/.generated/manifest.json` | 50-album geometry, per-photo rects, provenance, byte totals |
| `spike/.generated/benchmark-1000-*.json` | verbatim run data (environment + runs + summary) |
