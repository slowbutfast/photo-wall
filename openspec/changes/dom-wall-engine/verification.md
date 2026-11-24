# Verification — `dom-wall-engine`

**Status:** Sections 1–5 complete · automated gates green · **named-iGPU / iPhone
hardware performance gates remain PENDING MAINTAINER SIGN-OFF** (they cannot be
measured in this headless Linux container — see §5).
**Date:** 2026-11-23 · **Branch:** `feat/dom-wall-engine`.

## 1. Executive summary & environment

The React Three Fiber renderer was replaced by a hybrid WebGL2 PBR wall
(`PbrWallCanvas` + GPU-baked `RGBA8` lightmap) over a 2D-transformed, viewport-
culled CSS DOM world (`CssGalleryWorld`), driven by one camera store
(`cameraMath.ts`). The blocking Task 1.5 spike showed the as-built macro tier
could not meet the settle-hitch gate, so the documented **pre-baked per-island
mosaic fallback is now the shipped macro tier** and re-measured (49.7 ms, see §5).

| Item | Value |
| :--- | :--- |
| Node | v22.23.2 |
| Next.js | 16.4.6 (Turbopack) |
| Browser (tests/captures) | Headless Chrome 159.0.8154.6 via Playwright 1.65 (SwiftShader WebGL2) |
| Host | Linux ARM64 container, 3 vCPU, no GPU |
| Test suite | **20 files / 277 tests passed** |
| Typecheck / lint / build | clean / clean / success (0 warnings) |
| Dependencies | `sharp` added (approved, local derivatives); `three`, `@types/three`, `@react-three/fiber`, `troika-three-text` removed; `thumbhash` retained |

## 2. Requirement adherence audit

Legend: **PASS** = automated test and/or captured evidence; **PASS (audit)** =
verified by reading code + captured screenshot; **DEFERRED** = cannot be verified
in this environment.

### 2.1 `3d-pbr-wall-and-lighting` (modified / renamed)

| Requirement / scenario | Implementation | Verification | Status |
| :--- | :--- | :--- | :--- |
| **RENAMED** Continuous PBR plaster wall with baked wall-space lightmap | `PbrWallCanvas.tsx`, `lightmap.ts` | `lightmap.test.ts` (19) + wall captures | PASS |
| Macro view with 50 albums illuminated via baked lightmap | `planLightmapGrid` at 8 texels/u ≤ 2048², 250 fixtures for 50×10-col wall | `lightmap.test.ts` "covers 50 albums / 250+ fixtures", "stays inside the 2048x2048 budget"; macro capture `parity/1600x1000-chiaroscuro-demo1000-macro.png` | PASS |
| Panning outside baked bounds → zero irradiance (no wrap/smear) | `sampleLightmap` returns 0 outside `[0,1]`; shader skips sampling outside and subtracts the baked ambient floor so ambient is continuous | `lightmap.test.ts` "returns zero irradiance outside [0, 1] UV", "clamps to edge texels"; wall-only luminance probe (ambient 70 vs pool 173, no AABB rectangle) | PASS |
| **RENAMED** CSS beveled glass standoff placards + native YouTube plaques | `CssGalleryWorld.tsx` `.museum-placard[data-material]`, `SoundtrackPlaque.tsx` | `parity/1600x1000-concrete-album.png`, `1600x1000-concrete-brushed-aluminum.png`; computed `backdrop-filter: blur(14px) saturate(1.25)` | PASS |
| Glass placard reveals plaster through frosted glass, ≥4.5:1, `214×200` | glass + caption-only frosted backing; ink per mood | captured at all 3 moods × 3 viewports; placard measured 214×200 CSS px | PASS |
| Wheel/drag over an active YouTube plaque navigates without killing audio | transparent capture layer + `soundtrackState` machine | `soundtrackState.test.ts` (20) | PASS |
| Analytic spotlight model shared wall ↔ objects at true Z | `fixtures.ts` (unchanged) drives both lightmap and CSS vars | `fixtures.test.ts` (8) + `useGalleryLighting.test.ts` (9) | PASS |
| Wall lightmap, frames, placards agree on light direction | `--sx/--sy` from the same fixture rig; shadows fall away from the light | `useGalleryLighting.test.ts` "derives every variable from the shared world shading"; `parity/*-print.png` | PASS |
| Focused print clears surface dimming | focused frame at full exposure, siblings dimmed | `parity/*-print.png`; `parity-results.json` dimmed=13/focused=1 | PASS |

### 2.2 `instanced-photo-renderer` (removed / added)

| Requirement / scenario | Implementation | Verification | Status |
| :--- | :--- | :--- | :--- |
| **REMOVED** O(1) instanced renderer | deleted `WallInstancedLayer`, `VisiblePrintPool`, `TexturePool`, `textureRuntime`, `wallRuntime`, `PhotoWallCanvas`, `InfiniteWallShader`, `CameraRig` | `grep` for stale imports → none; `three`/R3F/troika removed from `package.json` + lockfile | PASS |
| **REMOVED** VRAM texture pool | native `<img>` + `decoding="async"` + `thumbHash`/`dominantColor` placeholders | `CssGalleryWorld.test`-by-capture: placeholders set as `background-image`/`backgroundColor` | PASS (audit) |
| **REMOVED** broad-phase hit-testing | native DOM buttons; `hitTestWall` + `HitCell`/`gridMetrics` deleted | `cameraMath.test.ts` 28 survivors green; `grep hitTest` → none | PASS |
| **ADDED** viewport-culled, projected-size LOD DOM world | `visibleIslands`, `resolveProjectedLodWidth`, `CssGalleryWorld` | `visibleIslands.test.ts` (12), `zoomTier.test.ts` (13) | PASS |
| Aspect-fitted frame/mat centred in the cell | `fitFrameInCell` + `islandRectStyle` | `macroMosaic.test.ts` (8), `islandPlacement.test.ts` (4); `parity/*-album.png` | PASS |
| Projected-size LOD + culling, `?width=` derivatives | 256/800/2048 snap; `/api/local-uploads` disk cache | `localUploads.test.ts` (8), `zoomTier.test.ts` | PASS |
| Macro zoom frame-time / settle / mobile targets | mosaic fallback at macro | §5 (automated PASS; hardware PENDING) | PASS (automated) / PENDING (hardware) |
| Keyboard & screen-reader traversal in `sortOrder` | `<button class="photo-frame">` with `aria-label` in sortOrder | `parity-results.json`: **55/55** print buttons labelled, e.g. `"Autumn studies in available light. — Tokyo Nocturnes, print 1"` | PASS |

### 2.3 `spatial-camera-navigation`

| Requirement / scenario | Implementation | Verification | Status |
| :--- | :--- | :--- | :--- |
| Clamped cursor-anchored zoom, `cameraToCssScale`, Y-flip, lockstep | `cameraMath.ts` + `GalleryViewport` rAF loop | `cameraMath.test.ts` (28) incl. `zoomToCursor` property test and `cssTop_row0 < cssTop_row1` | PASS |
| Row 0 renders above row 1; wall and DOM stay locked | one camera → `.world` transform + `PbrWallCanvas.render` | `cameraMath.test.ts` Y-flip tests; captures show no drift | PASS |
| **ADDED** default entry frames row 0 horizontally | `computeFirstRowBounds` + `fitBoundsToViewport` | `parity-results.json` row-0 framing `3/3` (desktop) `1/1` (phone, aspect-aware — see note) | PASS |

> **Deviation (documented):** three 9-world-unit albums cannot fit a `390 px`
> viewport above the macro threshold, so entry framing is aspect-aware
> (`3` albums ≥ 1024 px, `2` ≥ 768 px, `1` below). Always row 0, always
> horizontal, never the whole wall.

### 2.4 `gallery-hud-and-curator-ui`

| Requirement / scenario | Implementation | Verification | Status |
| :--- | :--- | :--- | :--- |
| Lock icon until authenticated, Swiss-label control, compact dock, tracked Focus Bar, placard-material Settings | `GalleryHud.tsx`, `PhotoFocusBar.tsx`, `AdminDrawer.tsx`, `globals.css` | captures at 3 viewports; `parity-results.json` HUD segments=2, dock items=4, focus bar text present | PASS |
| Publishing/deleting updates the wall + re-bakes the lightmap live | `useWallManifest` ← store `refreshWall` ← `AdminDrawer`/`FolderDropzone`; `PbrWallCanvas` re-bakes on album signature change | `bakeSignature` effect in `PbrWallCanvas.tsx`; `useWallManifest` re-derives albums from the store | PASS (audit) |
| Curator placard materials | `placardMaterial.ts` + Settings selector + localStorage | `parity/*-brushed-aluminum.png` (both viewports) | PASS |

## 3. Resolved assumptions (from `research.md`)

| Assumption | Resolution |
| :--- | :--- |
| "2,000 macro-tier `<img>` elements hold ~60 fps on iGPU Chrome & iOS Safari" | **Falsified for the as-built macro tier** in the headless proxy: 1,000 prints → 232.9 ms settle hitch (gate ≤100 ms). The documented pre-baked mosaic fallback is now shipped and re-measured at **49.7 ms**, p95 16.7 ms, 0 dropped frames. Hardware gates still pending (§5). |
| Baked lightmap covers 50 albums within the GPU budget | Verified: 50 albums / 250 fixtures → 8 texels/u, texture inside 2048² (`lightmap.test.ts`). |
| GPU bake produces the same layout as the CPU reference | Verified by `readPixels` on the baked `RGBA8` texture: `minR 0, maxR 255, meanR 53` on the 4-album wall — pools present, margin zeroed. |
| Print/placard shadows project away from the light in CSS | Resolved a sign bug: world is y-up, CSS is y-down → the vertical shadow component is negated (`calc(var(--sy) * -100)`). |
| Vendor prefixes for `backdrop-filter` are harmless | Falsified: a manual `-webkit-backdrop-filter` twin made the bundler emit only the prefixed declaration, which Chromium ignored. Standard property only; documented in `globals.css`. |

## 4. Nomenclature & code symbol audit

| Glossary term (`research.md`) | Code symbol(s) | Match |
| :--- | :--- | :--- |
| Hybrid WebGL2 PBR wall + CSS DOM world | `PbrWallCanvas`, `CssGalleryWorld`, `GalleryViewport` | ✓ |
| Baked Wall-Space Lightmap | `bakeLightmap` (CPU reference), `bakeLightmapOnGpu`, `LightmapGrid`, `LIGHTMAP_TEXELS_PER_UNIT` | ✓ |
| Zoom-Tiered LOD (`macro`/`album`/`print`) | `resolveZoomTier`, `zoomTierStyle`, `resolveProjectedLodWidth`, `LOD_BUCKETS` | ✓ |
| World Scale (`100px = 1 world unit`) | `WORLD_PX_PER_UNIT`, `worldXToCssLeft`, `worldYToCssTop`, `islandRectStyle` | ✓ |
| Macro mosaic fallback | `planMacroMosaic`, `MOSAIC_MAX_EDGE_PX`, `mosaicFor` | ✓ |
| Transparent gesture capture layer | `soundtrackState.captureLayerActive`, `.soundtrack-capture-layer` | ✓ |
| Projected-size LOD buckets | `LOD_BUCKETS = [256, 800, 2048]` (no `128`) | ✓ |
| Salon cap | `MAX_PHOTOS_PER_ALBUM = 20`, `ISLAND_GAP = 2.2` | ✓ |

No legacy identifiers remain: `grep -rn "WallInstancedLayer\|VisiblePrintPool\|TexturePool\|textureRuntime\|wallRuntime\|SoundtrackOverlay\|InfiniteWallShader\|CameraRig\|PhotoWallCanvas\|soundtrackOverlay\|soundtrackText\|viewportState\|troika\|@react-three\|from 'three'" src` → no matches.

## 5. Task 1.5 spike metrics (macro tier)

Fixture: `?demo=1000` = 50 albums × 20 = **1,000 real JPEGs** (256 px long edge),
`50` islands, mixed `4:5`/`3:2`/`2:3`, over the playground's static plaster
backdrop. Harness: `spike/benchmark.mjs` (Playwright). Environment: headless
Chromium 159 + SwiftShader, 3 vCPU, no GPU.

**As-built (1,000 mounted print elements) — the gate that failed:**

| Config | p95 | max frame | >25 ms frames | settle hitch | control |
| :--- | ---: | ---: | ---: | ---: | ---: |
| 1600×1000 @1x | 16.7 ms | 266.6 ms | 1 | **232.9 ms** | 16.7 ms |
| 1600×1000 @2x | 16.8 ms | 266.7 ms | 1 | **233.0 ms** | 16.7 ms |
| 390×844 @3x | 16.7 ms | 83.4 ms | 1 | 82.9 ms | 16.7 ms |

**Shipped macro mosaic (50 canvases, 0 print elements) — re-measured:**

| Config | p95 | max frame | >25 ms frames | settle hitch | control |
| :--- | ---: | ---: | ---: | ---: | ---: |
| 1600×1000 @1x (3 runs) | 16.7 ms | 16.8 ms | 0 | **49.7 ms** | 16.8 ms |
| 1600×1000 @2x (2 runs) | 16.8 ms | 33.4 ms | 1 | **49.6 ms** | 16.8 ms |
| 390×844 @3x (2 runs) | 16.7 ms | 16.8 ms | 0 | **16.8 ms** | 16.7 ms |

Gates: (a) p95 ≤ 16.7 ms at macro zoom → **PASS (automated, vsync-locked)**;
(b) settle hitch ≤ 100 ms → **PASS with the mosaic fallback (49.7 ms)**;
(c) zero iOS/Safari tab reloads → **not measurable headless**.

| Hardware gate | Machine (name it) | Result | Date | Signed |
| :--- | :--- | :--- | :--- | :--- |
| (a) p95 ≤ 16.7 ms zoom gesture | *PENDING* | — | — | — |
| (b) settle ≤ 100 ms | *PENDING* | — | — | — |
| (c) zero reloads at macro zoom | *PENDING* | — | — | — |

**Do not claim the hardware gates passed.** Raw data:
`spike/.generated/benchmark-1000*.json` (git-ignored) and `spike-results.md`.

## 6. Component-level parity audit (Task 4.2)

Evidence root: `parity/` (30 PNGs) + `parity-results.json` + `parity-report.md`.
Viewports `1600×1000`, `1920×1080`, `390×844`; moods `concrete`, `alabaster`,
`chiaroscuro`; states Row-0 Overview / Album Focus / Print Focus.

| Criterion (`design.md`) | Evidence | Status |
| :--- | :--- | :--- |
| 1. Stucco relief + `3500K` pools, 35–45 % inter-cluster ambient, clean out-of-bounds falloff | `parity/*-row0.png`, `*-album.png`; luminance probe pool 173 vs ambient 70 (≈2.5×) | **PASS** (pool *shape* caveat: analytic cone edges vs playground radial — documented) |
| 2. Translucent `backdrop-filter` glass placard + Brushed Aluminum Settings alternative | `parity/1600x1000-concrete-album.png`, `parity/*-brushed-aluminum.png`; computed `blur(14px) saturate(1.25)` | **PASS** |
| 3. Aspect-fitted frames + recessed `#F4F4F2` mats centred in the cell | every `*-album.png`; `fitFrameInCell`/`islandRectStyle` tests | **PASS** |
| 4. Unclipped directional shadows + `0.45` print-focus dimming | `parity/*-print.png`; dimmed 13 / focused 1 of 14 | **PASS** |
| 5. Swiss-label HUD + compact centered dock + tracked Focus Bar | `parity/*-row0.png`, `*-print.png`; HUD 2 segments, dock 4 items | **PASS** |
| No console errors / broken images / HTTP ≥ 400 | `parity-results.json`: 12 pages, **0 console errors, 0 HTTP failures** | **PASS** |
| Macro tier mounts zero prints | `parity/1600x1000-chiaroscuro-demo1000-macro.png`: 24 islands, 24 mosaics, **0 prints** | **PASS** |

## 7. Verbatim execution logs

Full logs: `logs/vitest.log`, `logs/typecheck.log`, `logs/lint.log`,
`logs/build.log`, `logs/playwright-parity.log`.

```
$ npx vitest run
 Test Files  20 passed (20)
      Tests  277 passed (277)
   Start at  17:53:19
   Duration  6.42s (tests 59%, import 35%, transform 3%, worker 3%)
```

```
$ npm run typecheck
> photo-wall@0.1.0 typecheck
> tsc --noEmit
(no output — clean)
```

```
$ npm run lint
> photo-wall@0.1.0 lint
> eslint .
(no output — clean)
```

```
$ npm run build
✓ Compiled successfully
Route (app)                        Revalidate  Expire
┌ ◐ /
├ ○ /_not-found
├ ƒ /api/admin/albums
├ ƒ /api/admin/albums/[id]
├ ƒ /api/admin/albums/[id]/photos
├ ƒ /api/admin/auth
├ ƒ /api/admin/deletions/retry
├ ƒ /api/admin/photos/[id]
├ ƒ /api/admin/youtube/inspect
├ ƒ /api/local-uploads/[...path]
├ ○ /api/wall                             15m      1y
├ ƒ /api/youtube/thumb/[id]
└ ○ /icon.svg
```

```
$ PLAYWRIGHT_MODULE=… node openspec/changes/dom-wall-engine/parity/capture-parity.mjs
1600x1000-concrete: row0 islands=4 framed=3/3 | album prints=55 | print dimmed=13 focused=1 bar=yes | errors=0 http>=400=0
1600x1000-alabaster: row0 islands=4 framed=3/3 | album prints=55 | print dimmed=13 focused=1 bar=yes | errors=0 http>=400=0
1600x1000-chiaroscuro: row0 islands=4 framed=3/3 | album prints=55 | print dimmed=13 focused=1 bar=yes | errors=0 http>=400=0
1920x1080-concrete: row0 islands=4 framed=3/3 | album prints=55 | print dimmed=13 focused=1 bar=yes | errors=0 http>=400=0
1920x1080-alabaster: row0 islands=4 framed=3/3 | album prints=55 | print dimmed=13 focused=1 bar=yes | errors=0 http>=400=0
1920x1080-chiaroscuro: row0 islands=4 framed=3/3 | album prints=55 | print dimmed=13 focused=1 bar=yes | errors=0 http>=400=0
390x844-concrete: row0 islands=3 framed=1/1 | album prints=55 | print dimmed=13 focused=1 bar=yes | errors=0 http>=400=0
390x844-alabaster: row0 islands=3 framed=1/1 | album prints=55 | print dimmed=13 focused=1 bar=yes | errors=0 http>=400=0
390x844-chiaroscuro: row0 islands=3 framed=1/1 | album prints=55 | print dimmed=13 focused=1 bar=yes | errors=0 http>=400=0
1600x1000 brushed-aluminum: material=brushed-aluminum errors=0
390x844 brushed-aluminum: material=brushed-aluminum errors=0
macro: tier=macro islands=24 mosaics=24 prints=0 errors=0

wrote 30 screenshots + parity-results.json
```

Runtime route check (`/?demo=4`, `/?demo=4&mood=concrete`, `/?demo=1000`, `/`):
0 console errors, 0 HTTP ≥ 400, 0 broken images; `?demo=1000` at album tier
mounts 180 prints for 9 culled islands and 0 at macro tier.

## 8. Quick re-verification (≈60 s)

```bash
npx vitest run src/lib/lighting/__tests__/lightmap.test.ts \
  src/lib/camera/__tests__/cameraMath.test.ts \
  src/components/wall/__tests__ src/lib/dev/__tests__/fakeManifest.test.ts
# expect: 9 files / 120 tests passed

grep -rn "from 'three'\|@react-three\|troika" src package.json   # expect: no matches
grep -n "hitTestWall" src/lib/camera/cameraMath.ts               # expect: no matches
```

For the visual pass: `npm run build`, `next start -p 3111` with the env block from
`parity/README.md`, open `http://127.0.0.1:3111/?demo=4&mood=concrete`, and
compare against `reference/album-island-album-zoom-concrete.png`.

## 9. Residual warnings & open items

1. **Hardware performance gates (a)/(b)/(c)** — pending maintainer sign-off on a
   named iGPU Chrome machine and a named iPhone/Safari version (§5).
2. **Light-pool silhouette** — analytic cone edges vs the playground's radial
   pool gradient; contrast/target ratios are met, shape differs slightly
   (`parity-report.md`, criterion 1 caveat).
3. **Per-print shading** uses the album fixture rig rather than the wall
   lightmap (by design, matches `fixtures.ts`), so prints are not dimmed by
   their position within the wall pool.
4. **Soundtrack thumbnails** require network; offline the plaque shows the
   charcoal facade + play glyph (intended fallback).
5. Next prints a `cacheComponents`/`partialPrefetching` configuration advisory on
   every build (pre-existing, not introduced here); no build warnings remain.
6. Committed on `feat/dom-wall-engine` after orchestrator sign-off (§10).

## 10. Orchestrator verification sign-off (independent re-run)

**Pull request:** https://github.com/slowbutfast/photo-wall/pull/2

Run after the implementation pass by the orchestration agent on 2026-11-23:

| Check | Result |
| :--- | :--- |
| `openspec validate dom-wall-engine --strict` | **valid** |
| `openspec validate --specs` for all four synced capabilities | **valid** |
| `npx vitest run` | **20 files / 277 tests passed** |
| `npm run typecheck` | **clean** |
| `npm run lint` | **clean** |
| `npm run build` | **success** (Next.js 16.4.6, 0 warnings) |
| `npm ls three @react-three/fiber troika-three-text @types/three` | **empty** |
| Production server routes `/`, `/?demo=4`, `/?demo=1000`, `/?mood=alabaster` | **HTTP 200** |
| Stale legacy identifiers in `src/` | none (one stale `globals.css` comment corrected during sign-off) |

### Verification dimensions

- **Completeness — PASS.** 17/17 task boxes ticked. Every renamed, modified, added, and removed requirement in the four delta specs maps to implementation evidence in §2 and §6.
- **Correctness — PASS.** All automated suites pass; Playwright parity evidence covers 3 viewports × 3 moods × 3 focus states plus macro and Brushed Aluminum (30 captures, 0 console errors, 0 HTTP failures). Scenario coverage is recorded per requirement in §2.
- **Coherence — PASS.** The implementation follows the architectural decisions: one `cameraMath.ts` coordinate source, 2D `.world` without `preserve-3d`, `contain: layout`, gesture-only `will-change`, GPU-baked `RGBA8` lightmap, projected-size 256/800/2048 LOD, and the macro mosaic fallback mandated by the failed Task 1.5 gate.

### Final assessment

**No CRITICAL issues.** Ready to commit, push, and open the PR. Two non-blocking items remain:

1. Named-iGPU Chrome and named-iPhone/Safari performance gates are **PENDING MAINTAINER SIGN-OFF** (not measurable headlessly).
2. Light-pool penumbra silhouette is analytic-cone-shaped rather than the playground's radial ellipse (documented visual caveat; contrast/falloff targets met).

Spec deltas for `3d-pbr-wall-and-lighting`, `instanced-photo-renderer`, `spatial-camera-navigation`, and `gallery-hud-and-curator-ui` were synced into `openspec/specs/` as part of this sign-off.

## 11. PATCH-01 Verification (Lighting, Material, Framing & Interaction Fixes)

All `PATCH-01` fixes in `openspec/changes/dom-wall-engine/patch.md` are implemented and verified:

| Check | Result |
| :--- | :--- |
| `npx vitest run` | **20 files / 277 tests passed** |
| `npm run typecheck` | **clean** |
| `npm run lint` | **clean** |
| `npm run build` | **success** (Next.js 16.4.6) |
| `capture-parity.mjs` (`1600x1000`, `1920x1080`, `390x844` × `concrete`, `alabaster`, `chiaroscuro`, plus `brushed-aluminum` & `macro`) | **30 screenshots + `parity-results.json`**, `errors=0`, `http>=400=0` |
| Desktop interaction checks | Real `page.mouse.click` focuses island (`Tokyo Nocturnes`), `0` key resets overview (`scale(0.103722)` -> `scale(0.535361)`), `?demo=2000` resolves to `1000`-album fixture (`9` visible islands) |
| Visual parity inspection (`1600x1000-chiaroscuro-row0.png`, `1600x1000-concrete-row0.png`, `1600x1000-alabaster-album.png`, `1600x1000-concrete-print.png`, `1600x1000-concrete-brushed-aluminum.png`) | Soft elliptical Gaussian pools without diagonal wedges or horizontal fade line above Row 0; dual-scale plaster UV eliminates macro grid tiling; single-pane frosted beveled-glass placards with 2 bottom pins at `PLACARD_GAP = 0.44` (`44px`); tight `7px` mat and contact shadows; `brightness(0.45) saturate(0.6)` periphery dimming |

**Hardware gate status (unchanged):** Named-iGPU Chrome and named-iPhone/Safari measurements for Task 1.5 remain **PENDING MAINTAINER SIGN-OFF** (cannot be measured inside this headless Linux container).
