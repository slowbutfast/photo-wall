# Verification Report: `frontend-gallery-wall`

**Date:** 2026-11-23
**Verifier:** OpenCode orchestration agent (`openspec-verify-change` pass)
**Scope:** Implementation vs. `proposal.md`, `tasks.md`, `architecture.md`, `tests.md`, `design.md`, `DESIGN.md`, and the four delta specs.

## Summary

| Dimension    | Status |
| ------------ | ------ |
| Completeness | 21/21 tasks complete (1.1–5.2) |
| Correctness  | 13/13 requirements implemented and covered by automated tests and/or headless visual checks |
| Coherence    | Follows VSA boundaries, shared backend geometry, DESIGN.md tokens, and the Chiaroscuro lighting model; one visual/demo gap repaired in the single allowed pass |

**Final assessment:** No CRITICAL issues remain. Ready for Stage C (spec sync, PR).

## Empirical execution log

| Command | Result |
| ------- | ------ |
| `npx vitest run` | **13 files, 165/165 tests passed**, 0 failed (camera 18, fixtures 8, nyTimeMood 14, TexturePool 12, SoundtrackOverlay 9, folderReader 10, plus backend suites) |
| `npx tsc --noEmit` | exit 0, 0 errors |
| `npm run lint` | exit 0, 0 errors, 0 warnings |
| `npm run build` | success; `/` Partial Prerender, `/icon.svg` static, admin/upload routes dynamic; `AdminDrawer` emitted in a separate chunk (~20.8 KB) |
| `openspec validate --changes --strict --json` | 2/2 changes valid |

### Headless visual acceptance (Chromium 1255 aarch64, SwiftShader, production build)

| Check | Result |
| ----- | ------ |
| `/?demo=2000` at 1920×1080 | Canvas 1920×1080; 50 albums / 2,000 prints; all 50 albums fit at `z = 140` (overview bounds 45.1 × 87.28 world units vs 96.41 visible) |
| Macro Overview | Every exhibition lit by its local instanced spotlight pool; Exhibition Room Directory lists all 50 rooms; zero console errors, zero failed requests |
| Album Focus | Clicking a room flies in van Wijk–Nuij; full 10-column / 4-row grid + left glass placard framed together |
| Print Focus | Print lifts to `z = 0.54`, dimming clears, glass glare visible; bottom bar shows album caption + `LEICA M6 • OCTOBER 2025`; `Prev`/`Next`/`Return (Esc)` work |
| Lighting Preview (admin) | `Chiaroscuro` preview turns the wall `#2D2C29` with warm pools, light placard ink, and `Curate` visible after login |
| Curator Drawer | Lazy-loaded; login succeeds against `POST /api/admin/auth`; upload dropzone, camera/date/location, YouTube inspect, Artist/Song, Lighting Preview, Pending Deletions render |
| Mobile 390×844 | Canvas 682×1477 device px (341×738 CSS), directory scrolls, 44px touch targets, `bottomInsetPx` framing |
| Demo thumbnails | All 8 soundtrack IDs return `200`; failed-thumbnail fallback renders a charcoal plaque with a warm play glyph (no black square) |
| Browser console/page errors | None |

Frame timing sampled under software rendering was `p95 ≈ 667 ms`; SwiftShader is not representative of the required integrated-GPU target. The hard `p95 ≤ 16.7 ms` / `< 256 MB` benchmark is explicitly deferred to manual maintainer review (task 3.6).

## Requirement Adherence Audit Matrix

### `3d-pbr-wall-and-lighting`

| Requirement | Evidence | Status |
| ----------- | -------- | ------ |
| Continuous PBR plaster wall + instanced per-album spotlight quads | `InfiniteWallShader.tsx` uses `wall_albedo/normal/ao/roughness.webp` at `z=0` and one additive instanced pool per album (no global light cap); macro screenshot shows all 50 rooms lit | PASS |
| Analytic spotlight model at true world Z | `fixtures.ts` (1 head / 2 columns, 28% aim, `0.98/0.72`, 16°/32°, `#FFF5E3`), `buildWorldFixtures` at `z=0.14/0.22`, CPU `lit*` + `(sx,sy)` shadows; 8 tests incl. top-row > bottom-row | PASS |
| Beveled glass placards + DOM-overlay YouTube plaque | `WallInstancedLayer.tsx` (2.14×2.00u, `z=0.14`, Fresnel/backing shader, troika TeX Gyre Heros, `<8px` LOD), `SoundtrackPlaque.tsx` + `SoundtrackOverlay.tsx` (`matrix3d`, unmount on pan/drag/wheel, stop on viewMode exit); state-machine tests | PASS |
| Offline suncalc NYC moods + per-mood tokens | `nyTimeMood.ts` (40.7128/-74.0060, exact windows, 60s poll/crossfade), DST tests, `MOOD_TOKENS`; chiaroscuro preview verified in-browser | PASS |

### `instanced-photo-renderer`

| Requirement | Evidence | Status |
| ----------- | -------- | ------ |
| O(1) hybrid renderer with unified mat+print lift, ThumbHash atlas | `WallInstancedLayer.tsx` (instanced shadows/mats/atlas, `aVisible`), `VisiblePrintPool.tsx` (≤40 pooled rigid mat+print+glare, `aVisible=0` via `wallRuntime`), LOD-culled placards | PASS |
| Priority-ordered actual-byte VRAM pool | `TexturePool.ts` (`w*h*4*1.33`, 256 MB / 96 MB, eviction order, focus max 3, ≤2 uploads/frame, `bitmap.close()` + `dispose()`), `textureRuntime.ts` shared pool; 12 tests | PASS |
| Broad-phase AABB + O(1) cell hit-testing | `cameraMath.hitTestWall` + `CameraRig` hover/click; property tests include round-trip accuracy | PASS |

### `spatial-camera-navigation`

| Requirement | Evidence | Status |
| ----------- | -------- | ------ |
| Clamped cursor-anchored zoom + damped pan | `cameraMath.zoomToCursor` (z 2.4–140, world-point invariance), `CameraRig` damping; 18 property tests | PASS |
| Van Wijk–Nuij fly-to + bottom-inset framing | `interpolateZoom`, `fitBoundsToViewport` with `bottomInsetPx`; print focus on mobile above the focus bar | PASS |
| Input conventions + editable-element guard | wheel/pinch/`gesturechange`, drag, `touch-action:none`, Esc/0/arrows/WASD with editable guard | PASS |

### `gallery-hud-and-curator-ui`

| Requirement | Evidence | Status |
| ----------- | -------- | ------ |
| Quiet HUD + lock-gated Curator | `GalleryHud.tsx`: `Overview`, lock icon until `GET /api/admin/auth`, `Curate` authenticated, bottom directory | PASS |
| Photo Focus bar with album caption + optional manual metadata | `PhotoFocusBar.tsx`: caption primary line, renders only populated `Camera • Date • Location`, Prev/Next/Return, no blur; verified in-browser | PASS |
| Lazy Curator Drawer + resilient folder upload/soundtrack editor | `next/dynamic({ssr:false})` split chunk, `folderReader` paging tests, XHR progress, draft retry/discard, YouTube inspect + Artist/Song, Lighting Preview, Pending Deletions | PASS |

## Issues

### CRITICAL

None.

### WARNING

1. **Hardware 60fps/GPU benchmark deferred** — headless SwiftShader cannot validate the integrated-GPU `p95 ≤ 16.7 ms` / `< 256 MB` target. The 2,000-print scene mounts and renders all 50 rooms without exceptions. Recommendation: run the documented `?demo=2000` Performance-panel check on representative hardware.
2. **Live YouTube playback not exercised end-to-end** — the `matrix3d` iframe path needs a real browser session with third-party playback; `SoundtrackOverlay.test.ts` covers the unmount/stop/select transitions, and thumbnails are verified. Recommendation: one manual playback tap-through on desktop and iOS Safari.
3. **Real ThumbHash atlas path not visually exercised in the demo** — demo photos use `thumbHash: null` (dominant-colour fallback). Atlas decode/pack is implemented in `WallInstancedLayer.tsx`; a production upload with a real ThumbHash is the remaining check.
4. **Curator folder drop not automated in-browser** — the `>110`-file paging loop is unit-tested and the multipart API is covered by the backend E2E smoke. Recommendation: one manual 120-photo folder drop against the live app.

### SUGGESTION

- At the 2,000-photo macro overview the last album row can sit close to the Exhibition Room Directory bar; panning or directory navigation reveals it fully.

## Repaired during verification

- **Macro demo fit:** demo albums were 8–10 rows tall, so 17 album rows exceeded the `z = 140` view. Raised the shared `MAX_GRID_COLUMNS` from 8 to 12, let admin grid validation accept 12, set demo albums to 10 columns (40 photos → 4 rows), and aligned `hitTestWall`’s cap. All 50 albums now fit at overview.
- **Demo soundtrack IDs:** replaced 404 YouTube IDs with 8 verified-valid public IDs (all thumbnails `200`).
- **Thumbnail fallback:** unavailable thumbnails now render a charcoal plaque with a warm play glyph instead of a black square.
- **Favicon:** added `src/app/icon.svg`; browser console is clean (no 404).

## Resolved assumptions

- SSR mood is computed with offline `suncalc` after `connection()`; the browser polls every 60s and crossfades tokens over 60s.
- Public visitors never get a manual mood control; the Lighting Preview is client-local inside the authenticated Curator Drawer only.
- `?demo=2000` is detected client-side, so the server page stays cache-compatible while the demo swaps in an offline SVG manifest.
