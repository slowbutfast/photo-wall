# Tests: `dom-wall-engine`

## Automated Tests

1. **Baked Lightmap & Pure Lighting CSS-Var Unit Tests (`vitest`)**:
   - Command: `npx vitest run src/lib/lighting/__tests__/lightmap.test.ts src/components/wall/__tests__/useGalleryLighting.test.ts src/lib/lighting/__tests__/fixtures.test.ts src/lib/lighting/__tests__/nyTimeMood.test.ts`
   - Verifies:
     - `bakeWallLightmap(albums, fixtures)` handles 50 albums / 250+ fixtures with zero 24-spot truncation, maps world coordinates `(wx, wy)` to lightmap UV accurately, and produces higher irradiance at top-row hotspots than unlit outer margins.
     - `computeGalleryLightingVars` emits deterministic `--lit`, `--lit-top`, `--lit-bot`, `--lit-l`, `--lit-r`, `--sx`, `--sy` CSS variables using true object depth (`0.14u` placard vs `0.22u` prints) without reading DOM layout.
2. **Zoom-Tier LOD & Soundtrack Gesture State Unit Tests (`vitest`)**:
   - Command: `npx vitest run src/components/wall/__tests__/zoomTier.test.ts src/components/wall/__tests__/soundtrackState.test.ts src/lib/camera/__tests__/cameraMath.test.ts`
   - Verifies:
     - `resolveZoomTier(scale, focusedPhotoId)` switches cleanly across `macro` (`scale < 0.25` → `?width=128`, no blur, flat shadow), `album` (`?width=800`, full shadows, blur), and `print` (`?width=2048` for focused print only).
     - Soundtrack reducer sets `pointerEventsDisabled: true` during drag/wheel gestures (only after drag threshold), keeps playback alive across `album` ↔ `print` within the same album, and stops on `overview` or switching albums.
     - Existing 18 `cameraMath.ts` property tests continue to pass unchanged.
3. **Full Regression, Typecheck, Lint & Build**:
   - Command: `npx vitest run && npm run typecheck && npm run lint && npm run build`
   - Verifies zero regressions across backend + frontend suites and confirms `three`, `@react-three/fiber`, and `troika-three-text` are absent from the bundle once cleanup completes.

## Manual & Visual Parity Verification

1. **Task Group 1 Performance Spike (Executed Before Full Port)**:
   - Open `http://localhost:3000/?demo=2000` (50 albums / 2,000 macro-tier `<img>`s + baked lightmap `PbrWallCanvas`) in Chrome (iGPU) and iOS Safari.
   - Measure pan/zoom gesture frame time and compositor memory; confirm smooth ~60fps or trigger the pre-baked per-island macro mosaic fallback.
2. **Side-by-Side Visual Parity Against Playground Reference Screenshots**:
   - Capture Playwright reference screenshots of `playgrounds/photo_wall_playground.html` at desktop (`1920×1080`) and mobile (`390×844`) for **Macro Overview**, **Album Focus**, and **Print Focus** in `alabaster`, `concrete`, and `chiaroscuro`.
   - Capture matching screenshots of the new `dom-wall-engine` and inspect side-by-side: confirm normal-mapped stucco relief, overhead multi-head lighting, translucent `backdrop-filter` beveled glass placards, true aspect-ratio recessed cotton mats, directional cast shadows, and crisp text after zoom settle.
3. **End-to-End Backend & Soundtrack Flow**:
   - Verify published albums load from `GET /api/wall` (drafts excluded), Curator Drawer publish/edit/delete updates the CSS islands live, and YouTube iframe plays across `print` focus without swallowing drag/wheel gestures.
