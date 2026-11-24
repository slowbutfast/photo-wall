# Verification Report — `playground-wall-port`

## Executive Summary

The wall/DOM renderer was replaced with a verbatim port of
`playgrounds/photo_wall_playground.html` (`dcc7a0484e0b1cb11a5a7c13120a9bf7c8e15edc`),
while keeping the merged infrastructure from `main` (camera math, culling, LOD,
macro mosaic, soundtrack state, manifest API, `sharp` local derivatives, and the
backend).

- **Wall-canvas parity:** `pixelmatch` reported **0 mismatched pixels out of
  1,296,000** for each of `chiaroscuro`, `concrete`, and `alabaster`
  (`threshold = 0.1`, `includeAA = false`, 1440 × 900).
- **Real input:** a real `page.mouse.click` opens Album Focus from a placard and
  Print Focus from a print; `Overview` / `0` restores the Row-0 camera; 25 Tab
  presses leave the `overflow: hidden` viewport at scroll `(0, 0)`; resizing the
  window keeps the world camera position.
- **Macro tier:** `?demo=1000` at `scale < 0.25` mounts **18 mosaic canvases, 0
  photo frames, 0 iframes, and 0 `backdrop-filter` passes**. The physical
  iGPU/iPhone settle-hitch gate remains a maintainer check (headless SwiftShader
  long-task samples are not a hardware performance signal).
- **Fixtures:** `?demo=4` reproduces the playground's exact albums
  (12/15/12/16 counts, 4/5/4/4 columns, same titles/captions/positions/
  soundtracks/aspects/`PALETTES` SVG art); `?demo=2000` falls back to the
  50 × 20 `1000` fixture and the `?mood=` pins are effective.
- **Regression:** 18 Vitest files / 258 tests pass; `tsc --noEmit`, ESLint, and
  `next build` all exit `0`.

## Requirement Adherence Audit Matrix

| Capability | Requirement | Implementation | Evidence | Status |
| :--- | :--- | :--- | :--- | :---: |
| `3d-pbr-wall-and-lighting` | Verbatim playground single-pass WebGL2 PBR plaster wall | `PlaygroundPbrWall.tsx` (one draw, 128-texel spot data texture, single filmic curve, idle-stop scheduler), `playgroundLighting.ts` | `playgroundLighting.test.ts`; `parity/metrics.json` (0 px × 3 moods); `parity/side-by-side-*.png` | Pass |
| `3d-pbr-wall-and-lighting` | Analytic spotlight model shared between wall and objects at true world Z | `LIGHT_CFG` (`ambientObj 0.42`, `throwFrac 0.72`, `objDepth 9`, `14`/`22` overrides), `rawIrradiance`, `computePlaygroundLighting`, CSS vars `--lit*`/`--sx`/`--sy` | `playgroundLighting.test.ts` (top > bottom, floor, depths, shadow direction); `islandLayout` golden | Pass |
| `3d-pbr-wall-and-lighting` | Verbatim playground acrylic standoff placards + soundtrack plaques | `playground-wall.css` (`.mat-acrylic` default, `.mat-aluminum`, `.mat-foamcore`, `.soundtrack-plaque`, `.is-lit::after`), `PlaygroundGallery`/`SoundtrackPlaque` | `full-side-by-side-*.png`; `soundtrackState.test.ts`; 20-photo cap test | Pass |
| `3d-pbr-wall-and-lighting` | Offline `suncalc` NYC mood + 60s crossfade | Unchanged `nyTimeMood.ts` / store integration through `PLAYGROUND_THEMES` | `nyTimeMood.test.ts`; `?mood=` pins in `metrics.json` | Pass |
| `instanced-photo-renderer` | Viewport-culled playground DOM islands, macro mosaics, projected LOD | `PlaygroundGallery.tsx`, updated `islandLayout.ts` (158px cells, 20px padding, 44px placard gap), `visibleIslands`, `zoomTier`, `macroMosaic` | `visibleIslands`/`zoomTier`/`macroMosaic` tests; Playwright macro gate | Pass |
| `instanced-photo-renderer` | Atomic derivative cache + `?demo=2000` → `1000` | `local-uploads` temp-file + `rename`; `PhotoWallApp.resolveDemoFixture` | `localUploads.test.ts` (no `.tmp`, concurrent requests); `metrics.json` `demoFallback2000` = 50 albums | Pass |
| `spatial-camera-navigation` | Clamped cursor zoom, `cameraToCssScale`, Row-0 framing, no resize re-fire, Tab guard | `PlaygroundGallery` camera loop, `cameraMath.ts`, `overviewNonce` | `cameraMath.test.ts`; Playwright interactions (`overviewReset`, `resizeKeptCamera`, `tabKeptScrollZero`) | Pass |
| `spatial-camera-navigation` | Arced fly-to + `bottomInsetPx` | `interpolateZoom` + `fitBoundsToViewport` in `PlaygroundGallery`, `PhotoFocusBar` inset | `cameraMath.test.ts`; print focus bar in Playwright | Pass |
| `spatial-camera-navigation` | Input conventions and editable guard | `PlaygroundGallery` wheel/pointer/pinch/keyboard handlers | Playwright wheel/pan/reset; keyboard `0`/Tab | Pass |
| `gallery-hud-and-curator-ui` | Swiss HUD, compact dock, Focus Bar, 3 placard materials, >20-file drop recovery | `playground-wall.css` + `placardMaterial.ts` + `AdminDrawer` + `splitAlbumCap` | `full-side-by-side-*.png`; `folderReader.test.ts`; Playwright dropzone not network-driven | Pass |
| `gallery-hud-and-curator-ui` | Photo Focus bar / lazy Curator Drawer (existing) | `PhotoFocusBar.tsx`, `AdminDrawer.tsx` | Existing tests + Playwright print focus | Pass |

## Pixelmatch Parity

Harness: `openspec/changes/playground-wall-port/parity/run.mjs`
(production build, 1440 × 900, DPR 1, host Playwright + project `pixelmatch`).

| Mood | Mismatched px | Total px | Ratio | Threshold |
| :--- | ---: | ---: | ---: | ---: |
| `chiaroscuro` | 0 | 1,296,000 | 0.000% | 0.1 |
| `concrete` | 0 | 1,296,000 | 0.000% | 0.1 |
| `alabaster` | 0 | 1,296,000 | 0.000% | 0.1 |

The app and playground were opened at the same viewport and the exact same
camera (`scale = 0.376919`, `x = 0`, `y = 3.6132`). The playground was put into
the same theme with `applyTheme(mood)`; the app used the `?mood=` pin. Both
wall-only captures hide every DOM layer, so the `0 px` result is the PBR canvas,
not the photo/placard DOM.

Side-by-side composites (playground right, Next.js left):

- `parity/side-by-side-chiaroscuro.png`
- `parity/side-by-side-concrete.png`
- `parity/side-by-side-alabaster.png`
- `parity/full-side-by-side-chiaroscuro.png`
- `parity/full-side-by-side-concrete.png`
- `parity/full-side-by-side-alabaster.png`
- `parity/macro-1000.png`
- `parity/metrics.json`

## Interaction & Macro Evidence

From `parity/metrics.json`:

```text
placardOpenedAlbum     true
frameOpenedPrint       true
overviewFromPrintExact true
slowDragPanned         true
willChangeCleared      true
containmentClamped     true
mobileAlbumZoomedIn    true  (0.342515 -> 0.4875 at 390x844)
overviewReset          true
resizeKeptCamera       true
tabKeptScrollZero      true
macro.tier             macro
macro.islands          18
macro.mosaics          18
macro.frames           0
macro.iframes          0
macro.backdropFilters  0
demoFallback2000       { mood: "concrete", albumDockItems: 50 }
```

The macro `maxLongTaskMs` sample under headless Chromium/SwiftShader is **not**
reported as a pass: it ranged from ~66 ms in an isolated run to >1 s under
software rasterisation with multiple prior pages. The spec's `<= 100ms`
settle-hitch and iPhone/Safari memory gates are explicitly left to maintainer
hardware, as the handoff permits.

## Nomenclature Audit

- Placard classes are the playground's real `.mat-acrylic` (default),
  `.mat-aluminum`, and `.mat-foamcore`. There is no `.mat-glass`, `.mat-rag`, or
  `.theme-*` class anywhere in `src/`.
- Settings labels map exactly: **Beveled Glass** → `acrylic`, **Brushed
  Aluminum** → `aluminum`, **Archival Foamcore** → `foamcore`.
- The wall shader lives in `src/components/wall/PlaygroundPbrWall.tsx`; lighting
  math in `src/lib/lighting/playgroundLighting.ts`; scoped CSS in
  `src/app/playground-wall.css`; the camera/DOM controller in
  `src/components/wall/PlaygroundGallery.tsx`.
- Deleted superseded renderer modules: `PbrWallCanvas.tsx`,
  `CssGalleryWorld.tsx`, `GalleryViewport.tsx`, `lightmap.ts`, `fixtures.ts`,
  `useGalleryLighting.ts`, and their obsolete tests.
- Geometry constants: `CELL_SIZE = 1.58u` (158px), `ISLAND_PADDING = 0.20u`
  (20px), `PLACARD_TOP_OFFSET = 0.08u` (8px), `PLACARD_GAP = 0.44u` (44px),
  `ISLAND_GAP = 2.2u`, `MAX_PHOTOS_PER_ALBUM = 20`.

## Verbatim Execution Logs

Saved under `parity/logs/`:

| Command | Log | Result |
| :--- | :--- | :--- |
| `npx vitest run` | `parity/logs/vitest.log` | 18 files, 263 tests, exit 0 |
| `npm run typecheck` | `parity/logs/typecheck.log` | exit 0 |
| `npm run lint` | `parity/logs/lint.log` | exit 0 |
| `npm run build` | `parity/logs/build.log` | exit 0 |
| `node openspec/changes/playground-wall-port/parity/run.mjs` | `parity/logs/parity.log` | exit 0, 0 px mismatch × 3 moods |

Build tail:

```text
✓ Compiled successfully
Finished TypeScript
✓ Generating static pages (9/9)
```

Vitest tail:

```text
Test Files  18 passed (18)
Tests       263 passed (263)
```

## Patch 01 Verification (`PATCH-01`)

- **30% Viewport Containment & Camera/Input Fixes:** `18` Vitest files / `263` tests pass (`cameraMath.test.ts` + `playgroundLighting.test.ts` cover `computeWallBounds`, `computeMaxZoom`, `clampCameraToBounds`, custom `maxZ` in `zoomToCursor`, `MAX_SPOTS = 256`, 50-album / 150-fixture lighting, and nearest-spot prioritization).
- **Balanced Glare & Global Helvetica (`31938e1`):** `.photo-sheen` uses a `135deg` diagonal band + radial specular hotspot across `inset: -65%` driven in both X and Y (`translate3d(${nx * 45}%, ${ny * 45}%, 0)`). Chromium `getComputedStyle` and `src/` grep confirm `body`, `.hud-button`, `.placard-title`, `.placard-caption`, `.photo-focus-title`, and `.photo-focus-meta` all resolve to `"Helvetica Neue", Helvetica, "TeX Gyre Heros", Arial, sans-serif`.

## Known Maintainer Checks

1. **Physical iGPU / iPhone:** measure the `?demo=1000` macro settle hitch
   (`<= 100ms`) and iPhone/Safari tab-memory behaviour on real hardware. Headless
   software WebGL is not representative.
2. **YouTube network:** the sandbox blocks `i.ytimg.com`, so the soundtrack
   thumbnail proxy logged a 502 in local screenshots; the facade/fallback and
   state machine still work, and the API path is unchanged.
3. **Placard material persistence:** remains client-local (`localStorage`), as
   specified; DB persistence is deferred.
