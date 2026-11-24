# Surgical Patch Handoff: OpenSpec Change 'dom-wall-engine' [PATCH-01]

## 1. Executive Objective & Diagnostic Feedback
- **Change Name**: `dom-wall-engine` (`openspec/changes/dom-wall-engine`, branch `feat/dom-wall-engine`)
- **Patch ID**: `PATCH-01`
- **Objective**: Fix the lightmap texture-packing & cone-wedge bugs, decouple `PLACARD_GAP` from `ISLAND_GAP`, fix dead desktop clicks & `Overview`/`0` reset, restore single-pane beveled glass placards & crisp print framing/shadows, map `?demo=2000`, and emit side-by-side visual parity composites.
- **Feedback & Diagnostic Trace**:
  ```
  1. [CRITICAL] src/lib/lighting/lightmap.ts:L453-L599 — Interleaved fixtureData (stride 8) uploaded as width=N, height=2 while shader fetches ivec2(i,0)=fpos & ivec2(i,1)=faxis -> corrupts positions/axes into giant razor-sharp diagonal pixelated wedges. Furthermore, grazing physical cones + hard clamp(0,1) + sharp AABB cutoff produce angular wedges and a visible lit rectangle.
     Fix: Fix row-major packing (Row 0 = pos, Row 1 = axis) AND bake soft elliptical Gaussian per-album pools (centered slightly above cluster centroid, radii ~0.65w x 0.70h) with exponential tone curve `1 - exp(-k * e)` fading to ambient well inside the AABB margin, while keeping fixture direction in GB for stucco relief & shadows. Also break up macro plaster tiling in PbrWallCanvas.tsx (dual-scale blend or hashed UV tile offset).
  2. [CRITICAL] src/lib/layout/islandLayout.ts:L24, L86-L135 — ISLAND_GAP = 2.2 (220px) is used between a placard and its own grid, detaching placards ~330px from their prints.
     Fix: Split into PLACARD_GAP = 0.44 (placard-to-grid) and ISLAND_GAP = 2.2 (island-to-island only).
  3. [CRITICAL] src/components/wall/GalleryViewport.tsx & src/store/useWallStore.ts — Eager setPointerCapture on pointerdown breaks real desktop mouse clicks on placards/prints; goOverview / pressing '0' is a no-op when viewMode is already 'overview' after panning/zooming away.
     Fix: Only call setPointerCapture after drag threshold (moved) is crossed (and release on pointerup/cancel); add an overviewNonce counter in useWallStore so goOverview() always triggers Row-0 fly-to; bias Row-0 framing slightly into the upper third so the top 35% isn't empty dark wall.
  4. [IMPORTANT] CssGalleryWorld.tsx, macroMosaic.ts, SoundtrackPlaque.tsx, globals.css:
     - Glass placard: replace two nested opaque gray boxes with a single translucent green-tinted frosted glass pane (text directly on pane, crisp 1px top/left glass bevel, two bottom metallic standoff pins).
     - Frames & shadows: tighten FRAME_INSET / mat padding (~0.06–0.08u) so prints fill their cells tightly like a salon hang; shorten/soften print-focus drop shadow.
     - Print-focus periphery dimming: use `filter: brightness(0.45) saturate(0.6)` on non-focused `.photo-frame` (instead of `opacity: 0.45`, which turns frames milky gray over dark plaster).
     - Soundtrack plaque: render 16:9 thumbnail cleanly letterboxed in matte-black `#141414` with a clear centered play glyph.
  5. [IMPORTANT] src/components/PhotoWallApp.tsx:L42-L64 — `?demo=2000` silently renders an empty wall; map unknown numeric `?demo=` values to `1000` (nearest supported fixture).
  6. [IMPORTANT] Verification & Task 1.5 honesty: Keep Task 1.5's physical iGPU / iPhone Safari measurements clearly documented as pending maintainer hardware run, and update capture-parity.mjs to output side-by-side PNG composites (reference left, PR capture right) for human visual sign-off.
  ```

## 2. Strict Target Context Map
| File Path (relative to repo root) | Target Lines | Modification Summary |
|---|---|---|
| `src/lib/lighting/lightmap.ts` | `L453-L615` | Fix row-major `fixtureData` packing (Row 0 = `pos`, Row 1 = `axis`); bake soft elliptical Gaussian per-album pools (`~0.65w × 0.70h`, centered slightly above cluster centroid) with `1 - exp(-k * e)` tone curve and smooth in-margin fade to ambient; keep dominant 3D fixture direction in `GB`. |
| `src/components/wall/PbrWallCanvas.tsx` | `L92-L148` | Break up macro plaster UV tiling (dual-scale blend or hashed tile offset) and verify smooth ambient plaster outside pools with no visible AABB rectangle. |
| `src/lib/layout/islandLayout.ts` | `L20-L135` | Add `PLACARD_GAP = 0.44` for placard-to-grid spacing inside `computeAlbumGrid`, keeping `ISLAND_GAP = 2.2` strictly for inter-island spacing in `computeWallGridPositions`. |
| `src/components/wall/GalleryViewport.tsx` | `L173-L440` | Defer `setPointerCapture` until drag threshold is crossed (fixing dead desktop clicks); subscribe to `overviewNonce` so `Overview`/`0` always re-frames Row 0; bias Row-0 framing slightly toward upper third. |
| `src/store/useWallStore.ts` | `L80-L210` | Add `overviewNonce: number` incremented by `goOverview()` even when `viewMode === 'overview'`. |
| `src/components/wall/CssGalleryWorld.tsx`, `src/components/wall/macroMosaic.ts`, `src/components/wall/SoundtrackPlaque.tsx`, `src/app/globals.css` | Placard, frame, shadow, soundtrack CSS | Single-pane translucent green-tinted glass placard + 2 bottom standoff pins (no nested opaque box); tighter `FRAME_INSET` / `0.06–0.08u` mat; shorter/softer print-focus drop shadow; `filter: brightness(0.45) saturate(0.6)` on non-focused `.photo-frame`s; letterboxed 16:9 soundtrack thumbnail + play glyph. |
| `src/components/PhotoWallApp.tsx` | `L42-L65` | Map unknown numeric `?demo=` values (including `?demo=2000`) to `'thousand'` (`1000`) instead of silently rendering empty wall. |
| `src/lib/lighting/__tests__/lightmap.test.ts`, `src/lib/layout/__tests__/islandLayout.test.ts`, `src/components/wall/__tests__/GalleryViewport.test.tsx` | Test suites | Add reproducing tests for row-major `fixtureData` + soft Gaussian pool / smooth margin fade, `PLACARD_GAP = 0.44` vs `ISLAND_GAP = 2.2`, real desktop click + `goOverview` reset, and `?demo=2000` fallback. |
| `openspec/changes/dom-wall-engine/parity/capture-parity.mjs`, `tasks.md`, `verification.md`, `patch.md` | Parity & audit | Emit side-by-side reference-vs-capture PNGs, inspect visually, document Task 1.5 physical hardware gate status honestly, and mark `PATCH-01` resolved. |

## 3. Blast Radius & Invariant Guardrails
- **STRICT BLAST RADIUS**: Modify ONLY the files listed in the Target Context Map.
- **FORBIDDEN**:
  - Do NOT touch backend routes, DB schema, or `.env*` files.
  - Do NOT re-introduce `preserve-3d` on `.world`, `contain: paint` on `.album-island`, or backdrop-root-breaking properties on `.world`/`.album-island`.
- **INVARIANTS TO PRESERVE**: All existing 277 Vitest tests (updating only the `islandLayout` assertion that tested `ISLAND_GAP` between placard and grid), `cameraMath` property tests, `visibleIslands`, `zoomTier`, and `soundtrackState` MUST pass.

## 4. Visual & UI Impact
- Direct visual parity restoration against `openspec/changes/dom-wall-engine/reference/` (`viewport-album-zoom-*.png`, `placard-beveled-glass-*.png`, `print-frame-*.png`).
- **Mandatory Visual Gate**: Visually inspect the newly generated side-by-side PNGs (reference left, PR capture right) in `alabaster`, `concrete`, and `chiaroscuro` across Row-0, Album, and Print before declaring `PATCH-01` complete. Confirm: zero diagonal wedges, zero staircase edges, zero visible AABB rectangle, tight placard-to-grid gap (`44px`), single-pane frosted glass with 2 standoff pins, tight salon-hang mats, and working real desktop `page.mouse.click`.

## 5. Reproduction & Verification Protocol
1. **Reproduce First**: Run `npx vitest run src/lib/lighting/__tests__/lightmap.test.ts src/lib/layout/__tests__/islandLayout.test.ts` with the new assertions; confirm failure.
2. **Apply Minimal Fix**: Apply targeted edits across the Target Context Map.
3. **Verify Fix & Visuals**: Re-run targeted tests, rebuild (`npm run build`), run `capture-parity.mjs` + real `page.mouse.click` check, and visually inspect the side-by-side composites.
4. **Full Regression Suite**: Run `npx vitest run && npm run typecheck && npm run lint && npm run build`. Confirm 100% clean passes, then commit and push to `feat/dom-wall-engine`.

## 6. Surgical Patch Checklist
- [ ] P01.1 Add and run reproducing tests for lightmap packing/Gaussian pools, `PLACARD_GAP` vs `ISLAND_GAP`, desktop click + `goOverview` reset, and `?demo=2000` fallback.
- [ ] P01.2 Implement surgical fixes across `lightmap.ts`, `PbrWallCanvas.tsx`, `islandLayout.ts`, `GalleryViewport.tsx`, `useWallStore.ts`, `CssGalleryWorld.tsx`, `macroMosaic.ts`, `SoundtrackPlaque.tsx`, `PhotoWallApp.tsx`, and `globals.css`.
- [ ] P01.3 Run `npm run build`, re-run parity captures with side-by-side composites + real `page.mouse.click` test, and inspect composites visually.
- [ ] P01.4 Run full regression suite (`npx vitest run && npm run typecheck && npm run lint && npm run build`) and confirm zero regressions.
- [ ] P01.5 Update `tasks.md`, `verification.md`, and mark `PATCH-01` `RESOLVED` in `patch.md`, then commit and push `feat/dom-wall-engine`.
