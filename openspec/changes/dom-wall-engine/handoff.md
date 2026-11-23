# OpenCode Orchestration Handoff: OpenSpec Change 'dom-wall-engine'

You are the orchestration agent for OpenSpec change 'dom-wall-engine' running in OpenCode.
Your primary directive is to execute this change using the **`openspec-apply-sub`** skill, which delegates task implementation to the `spec-coder-sub` subagent.

## 1. Orchestration Directive
- **Change Name**: `dom-wall-engine`
- **Target Skill**: `openspec-apply-sub` (or `/opsx:apply-sub dom-wall-engine`)
- **Architecture Paradigm**: Vertical Slice Architecture (VSA). Maintain strict isolation between feature compartments and avoid horizontal abstractions.
- **Branching**: Create and switch to `feat/dom-wall-engine` from `main` before making implementation edits.

## 2. Target Context Map
| File Path (relative to repo root) | Target Lines | Modification Summary |
|---|---|---|
| `src/app/api/local-uploads/[...path]/route.ts` | Full file | Add disk-cached `?width=256\|800\|2048` (and `?height=`) on-demand resizing via `sharp` into `.cache/` while keeping the sanitized original canonical. |
| `src/lib/layout/islandLayout.ts` | Constants & layout | Enforce `MAX_PHOTOS_PER_ALBUM = 20` (`4–5` cols) and raise `ISLAND_GAP = 2.2` (`220px`). |
| `src/lib/camera/cameraMath.ts` | Exports | Add `cameraToCssScale(z, viewportHeightCss, fovDeg)`, Y-axis world-to-CSS helpers (`cssTop = -worldY * 100`), and `computeFirstRowBounds(placements)` (row 0 first-3-albums horizontal default framing); remove `hitTestWall` in Task 4.3. |
| `src/lib/lighting/lightmap.ts` | `[NEW]` | GPU offscreen WebGL2 framebuffer bake of `3500K` `#FFF5E6` additive fixture quads into `RGBA8` (`8 texels/u`, max `2048×2048`, `R` = normalized irradiance with `~35–45%` inter-cluster ambient ratio, `GB` = 3D `(dirX, dirY)` with `dirZ` reconstructed, `6u` margin + `CLAMP_TO_EDGE`). |
| `src/components/wall/PbrWallCanvas.tsx` | `[NEW]` | Full-viewport WebGL2 `<canvas>` loading `wall_{albedo,normal,ao,roughness}.webp` with desaturated albedo, playground exposure curve, macro normal-map attenuation, `?mood=` query pin, out-of-bounds ambient clamp, and `cameraToCssScale` + DPR lockstep. |
| `src/components/wall/{visibleIslands,useGalleryLighting,zoomTier,soundtrackState}.ts` | `[NEW]` | Pure AABB viewport culling (`visibleIslands`), pure memoized `--lit*`/`--sx`/`--sy` CSS vars (`useGalleryLighting`), projected-size `ceil(cellPx * scale * dpr)` snapped to `256/800/2048` + zoom-tier styling (`zoomTier`), and transparent-capture-layer soundtrack state (`soundtrackState`). |
| `src/components/wall/CssGalleryWorld.tsx` | `[NEW]` | 2D-transformed `.world` (no `preserve-3d`, `contain: layout` — NOT `contain: paint`, no backdrop-root-breaking CSS on `.world`/`.album-island`, gesture-only `will-change: transform`), aspect-fitted `#F4F4F2` frames+mats centered in each `CELL_SIZE` slot with downward shadows & `0.45` print-focus periphery dimming, `thumbHash`/`dominantColor` placeholders, focusable `<button>` prints in `sortOrder` with `alt`, Beveled Glass default + Brushed Aluminum/Matte Black/Rag Paper Settings variants, and `SoundtrackPlaque` hidden at `macro` tier using `/api/youtube/thumb/[id]` + native `<iframe>` + transparent gesture capture layer + zoom-out pause toast. |
| `src/components/wall/{GalleryViewport,useWallManifest}.tsx(ts)` | `[NEW]` | Single `cameraMath.ts` controller driving `.world` and `PbrWallCanvas` in lockstep; manifest adapter wired to `GET /api/wall` + `lodUrl.ts`. |
| `src/components/hud/{GalleryHud,PhotoFocusBar}.tsx`, `src/app/globals.css`, `src/components/admin/AdminDrawer.tsx` | HUD/Settings | Swiss-label HUD (`11px`, `500`, `uppercase`, `0.1em`, `24px`-inset 1-or-2 segment control), compact centered dock (`max-width: min(760px, calc(100vw - 48px))`, `blur(8px)`, edge fade masks, no `EXHIBITION ROOMS` label), tracked uppercase Focus Bar, and Curator Settings placard-material selector + `20`-photo cap. |
| `src/components/PhotoWallApp.tsx`, `src/app/page.tsx`, `src/lib/dev/fakeManifest.ts` | Integration & fixtures | Wire `dom-wall-engine` components; add matched 4-album mixed-aspect (`4:5`/`3:2`/`2:3`, 12–16 photos/album) `?demo=4` fixture and `50 × 20 = 1,000` stress fixture. |
| `WallInstancedLayer.tsx`, `VisiblePrintPool.tsx`, `TexturePool.ts`, `textureRuntime.ts`, `wallRuntime.ts`, `SoundtrackOverlay.tsx`, `InfiniteWallShader.tsx`, `CameraRig.tsx`, `PhotoWallCanvas.tsx`, `package.json` | `[DELETE]` / Cleanup | Remove superseded R3F files, `hitTestWall` (+ its 7 tests), and `three`, `@types/three`, `@react-three/fiber`, `troika-three-text` after Task 4.2 parity verification (retain `thumbhash`). |

## 3. Technical & Architectural Boundaries
- **In-Scope Decisions**:
  - Single camera store (`cameraMath.ts`) + `cameraToCssScale` + Y-axis flip (`cssTop = -worldY * 100`) driving both `.world` and `PbrWallCanvas`.
  - Default entry view (`Overview` / `0` / initial load) frames **Row 0 (first 3 albums horizontally)** via `computeFirstRowBounds`.
  - GPU-baked `RGBA8` lightmap (`8 texels/u`, max `2048×2048`) with `CLAMP_TO_EDGE` + `6u` margin + out-of-bounds zero irradiance.
  - `contain: layout` (never `contain: paint`) and zero `opacity < 1` / `filter` / `mask` / `clip-path` / `mix-blend-mode` on `.world` or `.album-island`.
  - Keep existing backend API contracts (`GET /api/wall`, `/api/admin/*`) unchanged (aside from `?width=` derivative caching in `local-uploads` and `MAX_PHOTOS_PER_ALBUM = 20`).
- **Hard Exclusions / No-Go**:
  - Do NOT modify `.env`, `.env.*`, or credential files.
  - Do NOT introduce unapproved external dependencies (only `sharp` is approved for read-time `local-uploads` derivative caching).
  - Do NOT perform code modifications outside the Target Context Map without prior task coverage.

## 4. Visual & UI Design Specifications & Vision Verification
- **Theme**: Chiaroscuro Gallery (`DESIGN.md`, `100px = 1 world unit`).
- **Key Tokens**:
  - Wall Base: `#2B2B2A` (`chiaroscuro`) / `#6B6861` (`concrete`) / `#ECE9E2` (`alabaster`) | Ambient: `#141412` | Mat Cotton: `#F4F4F2`
  - HUD Surface: `rgba(18, 18, 18, 0.85)` | Primary: `#ECEAE4` | Secondary: `#9E9C95` | HUD Typography: `TeX Gyre Heros 500 11px uppercase (0.1em)`
  - Placard Default: Beveled Glass Standoff (`rgba(226,242,234,0.22)` + frosted backing `rgba(244,246,244,0.72)` / `rgba(20,22,20,0.74)`, `>= 4.5:1` contrast); Settings Alternatives: Brushed Aluminum (`#E2E4E6 → #B8BCC0`, `#141414` core, 2 bottom screws), Matte Black Acrylic, Archival Rag Paper.
- **Component Anatomy & States**: `ISLAND_GAP = 2.2u` (`220px`), `MAX_PHOTOS_PER_ALBUM = 20`, aspect-fitted frame+mat centered inside `CELL_SIZE`, downward drop shadow, `0.45` print-focus periphery dimming, compact centered dock (`max-width: min(760px, calc(100vw - 48px))`, `blur(8px)`, edge fade masks).
- **Responsive Layout**: 3 albums per row, Row-0 default framing, desktop `>= 768px`, mobile `< 768px` (`touch-action: none`, `bottomInsetPx`-aware framing, touch targets `>= 44px`).
- **Multi-Modal Vision Verification**:
  - Capture Playwright screenshots at `1600×1000`, `1920×1080`, and `390×844` with `?demo=4&mood=concrete` (plus `alabaster` and `chiaroscuro`) across Row-0 Overview, Album Focus, and Print Focus, and inspect directly against Task 1.1 playground reference crops.
  - Leave hardware-specific iGPU / iPhone Safari 60fps calibration in Task 1.5 marked for manual maintainer review where headless Linux cannot measure real hardware, while completing all automated code, test, layout, and headless Playwright checks.

## 5. Test Scaffolding & Verification Commands
- **Primary Test Runner**: `npx vitest run` (wrap full runs with `safe-test npx vitest run` or `--workers=1` to avoid memory thrashing)
- **Typecheck / Lint / Build**: `npm run typecheck && npm run lint && npm run build`
- **TDD Requirement**: Task Group `## 1` MUST scaffold failing unit tests and verify they fail before touching implementation code.
- **Resource & Concurrency Rules**: During task implementation, run ONLY the narrowest test file corresponding to the modified code.

## 6. Implementation Task Checklist
- [ ] 1.1 Capture Playwright component-level reference crops of `playgrounds/photo_wall_playground.html` (one album island at album zoom, one beveled glass placard, one print frame, and edge shadows) across `alabaster`, `concrete`, and `chiaroscuro` as the visual acceptance baseline.
- [ ] 1.2 Scaffold failing Vitest unit tests in `src/lib/lighting/__tests__/lightmap.test.ts` (`RGBA8` `8 texels/u` capped at `2048x2048`, 50 albums / 250+ fixtures, 3D direction `(dirX, dirY)` encoding, out-of-bounds `[0, 1]` UV zero-irradiance fallback) and `src/components/wall/__tests__/useGalleryLighting.test.ts` (pure `--lit*`, `--sx`, `--sy` CSS variables at `0.14u` / `0.22u`).
- [ ] 1.3 Scaffold failing Vitest unit tests in `src/components/wall/__tests__/visibleIslands.test.ts` (pure AABB culling), `src/components/wall/__tests__/zoomTier.test.ts` (projected-size `ceil(cellPx * scale * dpr)` snapped to `256/800/2048`, styling tier switches), `src/components/wall/__tests__/soundtrackState.test.ts` (transparent capture layer lifting on explicit click, wheel/drag forwarding, keep playing in `print`, stop on `overview`/album switch), `src/lib/camera/__tests__/cameraMath.test.ts` (`cameraToCssScale` desktop/mobile, Y-axis flip `cssTop_row0 < cssTop_row1`, and `computeFirstRowBounds` framing row 0 horizontally), and `src/app/api/__tests__/localUploads.test.ts` (`?width=256|800|2048` disk-cached derivatives).
- [ ] 1.4 Run `npx vitest run` on the newly scaffolded tests to confirm they fail before implementation.
- [ ] 1.5 **Blocking Spike (Decoupled from Section 2)**: Build a standalone `?demo=1000` (`50 × 20` max photos/album, mixed `4:5`/`3:2`/`2:3` aspect ratios) DOM/compositor spike using **real JPEGs** (not offline SVGs) over the playground's static plaster wall background, and benchmark (marking physical iGPU/iPhone hardware metrics for maintainer sign-off if headless).
- [ ] 2.1 Implement disk-cached `?width=256|800|2048` (and `?height=`) on-demand resizing in `src/app/api/local-uploads/[...path]/route.ts` (preserving the sanitized original file as canonical) until `localUploads.test.ts` passes, and enforce `MAX_PHOTOS_PER_ALBUM = 20` + `ISLAND_GAP = 2.2` (`220px`) in `src/lib/layout/islandLayout.ts` and upload validation.
- [ ] 2.2 Add `cameraToCssScale(z, viewportHeightCss, fovDeg)`, Y-axis world-to-CSS helpers (`cssTop = -worldY * 100`), and `computeFirstRowBounds(placements)` (row 0 first-3-albums horizontal default framing) to `src/lib/camera/cameraMath.ts` until `cameraMath.test.ts` passes.
- [ ] 2.3 Implement `src/lib/lighting/lightmap.ts` (GPU offscreen WebGL2 framebuffer bake of `3500K` `#FFF5E6` additive fixture quads into `RGBA8` at `8 texels/u`, max `2048x2048`, `R` = irradiance with `~35–45%` inter-cluster ambient ratio, `GB` = 3D `(dirX, dirY)` with `dirZ` reconstructed, `6u` margin + `CLAMP_TO_EDGE`) until `lightmap.test.ts` passes.
- [ ] 2.4 Implement `src/components/wall/PbrWallCanvas.tsx` (full-viewport WebGL2 `<canvas>` loading `wall_{albedo,normal,ao,roughness}.webp` with desaturated albedo, playground exposure curve, macro normal-map attenuation, managed GPU disposal, `?mood=` query pin support, sampling the GPU-baked lightmap with out-of-bounds ambient clamp + `nyTimeMood` uniforms, synchronized to `cameraToCssScale` & DPR).
- [ ] 3.1 Implement `src/components/wall/visibleIslands.ts`, `src/components/wall/useGalleryLighting.ts`, `src/components/wall/zoomTier.ts`, and `src/components/wall/soundtrackState.ts` until `visibleIslands.test.ts`, `useGalleryLighting.test.ts`, `zoomTier.test.ts`, and `soundtrackState.test.ts` pass.
- [ ] 3.2 Implement `src/components/wall/CssGalleryWorld.tsx` (viewport-culled islands positioned via `cssLeft = worldX * 100`, `cssTop = -worldY * 100`, 2D `translate/scale` with no `preserve-3d` on `.world`, `contain: layout` — NOT `contain: paint`, no backdrop-root-breaking properties on `.world`/`.album-island`, gesture-only `will-change: transform`, aspect-fitted `#F4F4F2` frame+mat with top inner shadow & downward drop shadow centered inside each `CELL_SIZE × CELL_SIZE` slot, `0.45`-opacity + desaturated periphery dimming on non-focused sibling `.photo-frame`s in `print` focus, `thumbHash`/`dominantColor` placeholder, projected-size `256/800/2048` `<img>` URLs, accessible focusable `<button>` prints in `sortOrder` with `alt`, **Beveled Glass Standoff** default placard + **Brushed Aluminum / Matte Black / Rag Paper** Settings variants reusing self-hosted `TeX Gyre Heros`, and `SoundtrackPlaque` hidden at `macro` tier using `/api/youtube/thumb/[id]` + native `<iframe>` + transparent gesture capture layer + zoom-out pause toast).
- [ ] 3.3 Implement `src/components/wall/GalleryViewport.tsx`, `src/components/wall/useWallManifest.ts`, and update `GalleryHud.tsx` / `PhotoFocusBar.tsx` / `globals.css` to the Swiss-label HUD (`11px` uppercase `0.1em` tracking, `24px`-inset 1-or-2 segment control, compact centered translucent dock `max-width: min(760px, calc(100vw - 48px))` with edge fade masks, tracked uppercase Focus Bar) and Curator Settings placard-material selector.
- [ ] 4.1 Wire `GalleryViewport`, `PbrWallCanvas`, `CssGalleryWorld`, `GalleryHud`, `PhotoFocusBar`, and lazy `AdminDrawer` in `src/components/PhotoWallApp.tsx` and `src/app/page.tsx`, and add the matched 4-album mixed-aspect (`4:5`, `3:2`, `2:3`, 12–16 photos/album) `?demo=4` visual fixture.
- [ ] 4.2 Capture Playwright screenshots of `dom-wall-engine` at `1600x1000`, `1920x1080`, and `390x844` with `?demo=4&mood=concrete` (plus `alabaster` and `chiaroscuro`) across Row-0 Overview, Album Focus, and Print Focus and verify all 5 criteria in `design.md`.
- [ ] 4.3 Delete superseded R3F files (`WallInstancedLayer.tsx`, `VisiblePrintPool.tsx`, `TexturePool.ts`, `textureRuntime.ts`, `wallRuntime.ts`, `SoundtrackOverlay.tsx`, `InfiniteWallShader.tsx`, `CameraRig.tsx`, `PhotoWallCanvas.tsx`, `hitTestWall` and its 7 tests in `cameraMath.test.ts`) and remove `three`, `@types/three`, `@react-three/fiber`, and `troika-three-text` from `package.json` (retaining `thumbhash`).
- [ ] 5.1 Run full regression suite (`npx vitest run`, `npm run typecheck`, `npm run lint`, `npm run build`) and confirm zero errors and clean bundle.
- [ ] 5.2 Populate `openspec/changes/dom-wall-engine/verification.md` with Requirement Adherence Audit Matrix, Task 1.5 spike metrics, component-level parity audit, and verbatim execution logs.

## 7. Post-Implementation & Verification Obligations
When `spec-coder-sub` finishes:
1. Verify all checkboxes in `tasks.md` are marked `- [x]`. Only tick boxes that genuinely ran and passed.
2. Ensure `openspec/changes/dom-wall-engine/verification.md` is populated with Executive Summary, Requirement Adherence Audit Matrix, Resolved Assumptions, Nomenclature Audit, and Verbatim Execution Logs.
3. Automatically run verification via `openspec-verify-change`.

## 8. Verification Review & Single-Pass Automated Repair (Max Retries = 1)
- **If verification succeeds with zero critical issues**:
  1. Sync specs: `openspec specs apply --change "dom-wall-engine"`.
  2. Ensure work is on branch `feat/dom-wall-engine`, commit all implementation code and change artifacts, push (`git push -u origin HEAD`), and open a Pull Request via `gh pr create --fill` reporting the PR URL.
- **If CRITICAL issues or failed test verification errors are detected on initial pass**:
  1. Delegate **1 bounded repair pass** to `spec-coder-sub` with the exact failure logs, then re-run `openspec-verify-change`.
  2. If verification passes after repair: sync specs, commit, push, and open PR via `gh pr create --fill`.
  3. If verification STILL fails after the single repair pass: **HALT** and present the Verification Report and remaining blockers.
