# Tests: `dom-wall-engine`

## Automated Tests

1. **Baked Lightmap & Pure Lighting CSS-Var Unit Tests (`vitest`)**:
   - Command: `npx vitest run src/lib/lighting/__tests__/lightmap.test.ts src/components/wall/__tests__/useGalleryLighting.test.ts src/lib/lighting/__tests__/fixtures.test.ts src/lib/lighting/__tests__/nyTimeMood.test.ts`
   - Verifies:
     - Lightmap metadata/math covers 50 albums / 250+ fixtures with `RGBA8` `8 texels/u` capped at `2048 × 2048`, encodes 3D light direction `(dirX, dirY)` with reconstructible `dirZ`, maps world `(wx, wy)` to UV accurately, and returns zero irradiance outside `[0, 1]` UV bounds (no wrap/smear).
     - `computeGalleryLightingVars` emits deterministic `--lit`, `--lit-top`, `--lit-bot`, `--lit-l`, `--lit-r`, `--sx`, `--sy` CSS variables using true object depth (`0.14u` placard vs `0.22u` prints) without reading DOM layout.
2. **Camera Scale, Y-Axis Flip, Viewport Culling, Projected-Size LOD & Soundtrack Unit Tests (`vitest`)**:
   - Command: `npx vitest run src/lib/camera/__tests__/cameraMath.test.ts src/components/wall/__tests__/visibleIslands.test.ts src/components/wall/__tests__/zoomTier.test.ts src/components/wall/__tests__/soundtrackState.test.ts`
   - Verifies:
     - `cameraMath.test.ts`: The 11 surviving non-`hitTestWall` camera-math property tests pass unchanged (the 7 `hitTestWall` tests are removed when `hitTestWall` is deleted), plus new tests for `cameraToCssScale(z, viewportHeightCss, fovDeg)` across desktop (`1080px`) and mobile (`738px`) heights, Y-axis flip (`cssTop = -worldY * 100`, asserting row 0 renders above row 1), and `computeFirstRowBounds(placements)` framing row 0 (first 3 albums) horizontally across the viewport even with 50 albums present.
     - `visibleIslands(camera, viewport, placements, margin)` accurately culls off-screen islands from `islandLayout` AABBs with zero DOM reads.
     - `resolveProjectedLodWidth(cellPx, scale, dpr)` snaps `ceil(cellPx * scale * dpr)` to backend buckets `256 / 800 / 2048` (never `128`, never jumping all prints to `800` at `scale = 0.25`), while `resolveZoomTier(scale)` controls styling switches (`macro` / `album` / `print`).
     - `soundtrackState.test.ts`: Transparent capture layer stays active until explicit click into player, wheel/drag starting over the plaque forwards cleanly without killing audio, playback continues across `album` ↔ `print` in the same album, and stops on `overview` or album switch.
3. **Local-Mode Derivative Route Test (`vitest`)**:
   - Command: `npx vitest run src/app/api/__tests__/localUploads.test.ts`
   - Verifies `/api/local-uploads/[...path]?width=256|800|2048` returns resized JPEG/WebP derivatives cached on disk while leaving the sanitized original file untouched.
4. **Full Regression, Typecheck, Lint & Build**:
   - Command: `npx vitest run && npm run typecheck && npm run lint && npm run build`
   - Verifies zero regressions across backend + frontend suites and confirms `three`, `@react-three/fiber`, and `troika-three-text` are absent after cleanup.

## Manual & Visual Acceptance Verification

1. **Blocking Task Group 1 Macro Performance Spike (Maintainer-Run, Real JPEGs)**:
   - Run the spike with a 50-album / `1,000`-photo manifest (`50 × 20` max photos/album, mixed `4:5`, `3:2`, `2:3` aspect ratios) backed by **real JPEGs** (not offline SVGs) over the playground's static plaster background before porting full UI:
     - **Desktop Chrome (named iGPU machine)**: `p95 frame time <= 16.7ms` during zoom gesture; settle hitch `<= 100ms` when `will-change: transform` is removed.
     - **Mobile (named iPhone / iOS Safari version)**: zero tab reloads or OOM crashes at macro zoom.
   - If any gate fails, activate the pre-baked per-island macro mosaic fallback before Section 3.
2. **Pinned Side-by-Side Visual Acceptance Checklist (`1600×1000`, `1920×1080`, `390×844`)**:
   - Capture Playwright screenshots using a **matched 4-album mixed-aspect (`4:5`, `3:2`, `2:3`, 12–16 photos/album) visual fixture** with pinned mood (`?demo=4&mood=concrete`, plus `alabaster` and `chiaroscuro`) alongside `playgrounds/photo_wall_playground.html` at Row-0 Overview, Album Focus, and Print Focus, verifying all 5 criteria in `design.md` (neutral plaster + `35–45%` inter-pool contrast, translucent `backdrop-filter` glass placard + Brushed Aluminum Settings alternative, centered aspect-fitted `#F4F4F2` frames with downward shadows, `0.45` print-focus periphery dimming, and Swiss-label HUD + compact centered dock).
3. **End-to-End Backend, A11y & Soundtrack Flow**:
   - Verify published albums load from `GET /api/wall` (drafts excluded), Curator Drawer publish/edit/delete updates islands + GPU lightmap live, keyboard Tab traverses `.photo-frame` buttons in `sortOrder` with `alt` text, and YouTube iframe plays across `print` focus without swallowing initial wheel/drag.
