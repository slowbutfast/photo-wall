# Task 1.5 — `?demo=1000` macro-tier DOM/compositor spike

Standalone, **decoupled from Sections 2–3** (no `PbrWallCanvas`, no
`CssGalleryWorld`, no R3F/Three.js, no production components). It exists to
answer one question before the full port: *can 1,000 real-JPEG `<img>`
elements on a 2D-transformed `.world` layer hold 60fps at macro zoom?*

Results live in [`../spike-results.md`](../spike-results.md).

## What it renders

| Piece | Implementation (spike-local) |
| :--- | :--- |
| Fixture | `?demo=1000` → **50 albums × 20 prints = 1,000** mixed `4:5` / `3:2` / `2:3` |
| Images | **real baseline JPEGs**, generated from this repo's plaster maps (`public/textures/wall/*.webp`) with `sharp`; 256px long edge (the macro-tier LOD bucket) |
| Geometry | the production contract — `src/lib/layout/islandLayout.ts` imported through Node's TypeScript type stripping (no re-implemented layout math) |
| Wall | static plaster backdrop: tiled `wall_albedo.webp`, mood tint (`background-blend-mode: multiply`), the playground's chiaroscuro vignette, one radial gradient light pool per cluster |
| World | `#world` with **2D** `translate() scale()` only, `transform-origin: 0 0`, `contain: layout` (never `paint`), no `preserve-3d`, no `opacity`/`filter`/`mask` |
| Islands | `contain: layout`, absolutely positioned from `worldUnit * 100px`, flat macro-tier placards (no `backdrop-filter`, no text) |
| Prints | aspect-fitted frame + cotton mat, `translate(-50%, -50%)`, **one flat** `box-shadow` (macro tier) |
| `?mosaic=1` | mirrors the shipped macro fallback: one 512px-capped canvas per island with the prints painted in |
| Gestures | wheel zoom anchored at the cursor + pointer drag, `will-change: transform` toggled **only during** gestures and dropped ~180ms after the last one |

Deliberate deviations from the eventual engine (all conservative for the gate):

- **No viewport culling.** All 1,000 images stay in the DOM at every scale, so
  the numbers are a worst case. `visibleIslands` (Task 3.1/3.2) will mount far
  fewer prints at macro zoom.
- **Current `ISLAND_GAP = 0.44u`.** Task 2.1 raises it to `2.2u`; a wider gap
  spreads the wall sideways but does not change the printed-element count, and
  the narrower current wall is the denser (harder) case on screen.
- **Static wall, not the WebGL2 PBR shader.** A fragment shader would confound
  the DOM/compositor measurement.

## Run it

```bash
# 1. Serve the repository root (the page loads ../../../../public/textures/...)
python3 -m http.server 4173 --bind 127.0.0.1

# 2. Generate the 1,000 JPEGs + manifest (git-ignored: spike/.generated/)
node openspec/changes/dom-wall-engine/spike/generate-fixtures.mjs

# 3. Benchmark (Playwright is not a project dependency)
PLAYWRIGHT_MODULE=playwright \
  node openspec/changes/dom-wall-engine/spike/benchmark.mjs --repeats 3 --frames 240

# 4. Evidence screenshots (row-0 entry, macro overview, album zoom)
PLAYWRIGHT_MODULE=playwright \
  node openspec/changes/dom-wall-engine/spike/screenshots.mjs
```

`PLAYWRIGHT_MODULE` may point at an existing
`node_modules/playwright-core/index.js` (the harness only needs
`chromium.launch`). Manual inspection: open
`http://127.0.0.1:4173/openspec/changes/dom-wall-engine/spike/index.html?demo=1000&mood=chiaroscuro`.

`benchmark.mjs` flags: `--repeats`, `--frames`, `--demo`, `--mood`, `--width`,
`--height`, `--dpr`, `--mosaic`. `--mosaic` renders the page the way
`CssGalleryWorld` does at macro tier — **one pre-baked canvas per island, zero
print elements** — which is the fallback activated in Task 3.2 after gate (b)
failed. It writes
`spike/.generated/benchmark-<demo>[-mosaic]-<w>x<h>-<ts>.json` with every run, the
environment block, the mounted element counts and the summary.

## Fixture provenance

The 1,000 JPEGs are **derived at generation time from repository assets** —
`public/textures/wall/wall_{albedo,normal,ao,roughness}.webp` resized, colour
shaded and re-encoded as baseline JPEG (`sharp`, `quality: 88`, `mozjpeg`).
Nothing is downloaded and no SVG is used: the files carry photographic
frequency detail so JPEG decode cost stays in the same order of magnitude as a
real photograph. The generated directory is disposable (`.gitignore`) and the
manifest records `provenance`, per-file bytes and the total.

Regeneration is deterministic: same inputs → same 50-album geometry (the seed is
the album index), same aspect-ratio cycle, same byte sizes.
