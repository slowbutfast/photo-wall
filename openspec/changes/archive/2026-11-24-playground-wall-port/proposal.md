## Why

Two clean-room renderer rewrites (R3F in PR #1 and the baked-lightmap rewrite in PR #2) failed to match the visual richness, dramatic chiaroscuro lighting contrast, translucent beveled glass placards, and top-to-bottom mat falloff of [playgrounds/photo_wall_playground.html](../../../playgrounds/photo_wall_playground.html) (pinned at `dcc7a0484e0b1cb11a5a7c13120a9bf7c8e15edc`). Instead of rewriting the renderer from prose again, this change branches from `feat/dom-wall-engine` (`f43f0dc`)—reusing all non-renderer infrastructure (culling, LOD, macro mosaic, `sharp` local derivatives, camera math, soundtrack state, and backend)—and swaps only the wall/DOM renderer to the playground's exact CSS, single-pass WebGL2 PBR shader, and `rawIrradiance` lighting math.

**Base Branch & Ordering:** Branch from **`feat/dom-wall-engine` (`f43f0dc`)** (superseding `dom-wall-engine`; remove/archive `openspec/changes/dom-wall-engine` when PR #2 closes). **`admin-route-isolation`** applies cleanly immediately after `playground-wall-port` (this change only restyles the HUD and leaves auth behavior to `admin-route-isolation`).

## What Changes

- **Reuse from `feat/dom-wall-engine` (`f43f0dc`)**: Keep `macroMosaic.ts` (macro tier `scale < 0.25` mosaic fallback), `visibleIslands.ts`, `zoomTier.ts`, `cameraMath.ts` (aspect-aware Row-0 framing, `bottomInsetPx`, Y-flip), `soundtrackState.ts`, `local-uploads` `sharp` `?width=256|800|2048`, `PLACARD_GAP = 0.44` / `ISLAND_GAP = 2.2`, `MAX_PHOTOS_PER_ALBUM = 20`, pointer-capture deferral, and `overviewNonce`. Delete only `PbrWallCanvas.tsx`, `CssGalleryWorld.tsx`, and `lightmap.ts`.
- **Single-Pass Verbatim Playground WebGL2 Shader (`PlaygroundPbrWall.tsx`)**: Port `playgrounds/photo_wall_playground.html`'s exact PBR plaster shader (`N·L * cone / r² + roughness specular` + single filmic curve `color / (color + 0.88) * 1.34`) reading culled visible spots (`<= 128`) from a unit-tested row-major `RGBA32F` data texture (`packFixtureDataTexture` + `selectVisibleSpots`), with an **idle-stop rAF loop** (renders only when camera/mood/viewport changes).
- **Exact Playground CSS & Material Classes (`src/app/playground-wall.css`)**: Extract the playground's exact CSS (converting `#wallViewport`/`#wallWorld` IDs to classes under `.playground-wall-root`), using its real placard classes: **`.mat-acrylic`** (default, labeled *Beveled Glass*), **`.mat-aluminum`** (*Brushed Aluminum*), and **`.mat-foamcore`** (*Archival Foamcore*), plus exact `.photo-frame.is-lit` / `.is-lit::after` directional mat falloff, shadows, and `applyTheme()` mood variables. Drop world `preserve-3d` & sway (keeping `translate3d(...) scale(s)` on `.world` for `backdrop-filter` safety and local `perspective` + `preserve-3d` on `.photo-frame` for hover tilt).
- **Exact `LIGHT_CFG` & Layout Golden Parity (`playgroundLighting.ts`)**: Port `LIGHT_CFG` (`fixturePerCols: 2`, `hotspotFrac: 0.28`, `heightFrac: 0.98`, `innerDeg: 16`, `outerDeg: 32`, `ambientObj: 0.42`, `objDepth: 9` overridden to `14` placard / `22` print, `throwFrac: 0.72`) computed from `islandLayout.ts` absolute coordinates, verified by a 1px golden test against the playground's 4 demo albums.
- **Close Open PR #2 Quality Items**: Fix idle rAF loop, zoom-relative snapshot threshold, prevent entry framing re-fire on resize/manifest refresh, prevent Tab focus scrolling `overflow: hidden` viewport, fix `FolderDropzone` stuck state on >20 files, atomic temp-file rename for `local-uploads` derivative cache, and note client-local placard material persistence (DB persistence deferred).
- **Measurable Parity Gate**: Make `?demo=4` reproduce the playground's exact 4 albums (12/15/12/16 counts, same titles, same `PALETTES` sample art) and gate parity with `pixelmatch` on the wall-canvas region + side-by-side PNG composites.

## Capabilities

### Modified Capabilities
- `3d-pbr-wall-and-lighting`: Single-pass playground WebGL2 PBR shader with `RGBA32F` spot data texture (`<= 128` culled spots), exact `LIGHT_CFG` (`ambientObj: 0.42`, `14`/`22` depths, `throwFrac: 0.72`), and real playground placard classes (`.mat-acrylic` default, `.mat-aluminum`, `.mat-foamcore`).
- `instanced-photo-renderer`: Remove R3F requirements; keep viewport culling (`visibleIslands`), projected-size `256/800/2048` LOD + atomic disk-cached `local-uploads`, `macroMosaic` macro tier (`scale < 0.25`), `?demo=2000` → `1000` fallback, and real desktop clicks.
- `spatial-camera-navigation`: Aspect-aware Row-0 framing (`3 / 2 / 1` albums + `bottomInsetPx`), `overviewNonce` reset, idle-stop rAF, and no resize/refresh framing reset.
- `gallery-hud-and-curator-ui`: Visual restyling only (Swiss segmented control, compact centered dock with edge fade masks, tracked uppercase Focus Bar, Settings placard selector, >20-file dropzone guard); auth behavior remains owned by `admin-route-isolation`.

## Impact

- **Dependencies**: `sharp` (already on `feat/dom-wall-engine`), `pixelmatch` (devDependency for parity check); R3F / `three` / `troika-three-text` already removed on `feat/dom-wall-engine`.

### Revision: 2026-11-24 04:45 UTC
- **Feedback Source**: Two-Agent Peer Review Audit
- **Key Changes**:
  - Replaced nonlinear-breaking additive 24-spot chunks with a **single-pass `RGBA32F` spot data texture** (`<= 128` culled spots) so the playground's filmic curve runs once.
  - Declared base branch `feat/dom-wall-engine` (`f43f0dc`), keeping `macroMosaic.ts` and all tested non-renderer modules; added open PR #2 review fixes to `tasks.md` §3.
  - Corrected placard classes to the playground's real `.mat-acrylic` (default) / `.mat-aluminum` / `.mat-foamcore`, documented `applyTheme()` and exact `LIGHT_CFG` (`ambientObj: 0.42`, `throwFrac: 0.72`, `14`/`22` depths), explicitly dropped world `preserve-3d`/sway, and pinned playground SHA `dcc7a048`.
  - Removed HUD auth edits to eliminate conflict with `admin-route-isolation`, added aspect-aware Row-0 framing, concrete culling/LOD/macro/`?demo` scenarios, matched 4-album `?demo=4` + `pixelmatch` gate.
