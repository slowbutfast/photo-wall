## Status: PATCH-01 Resolved

### [PATCH-01] PR #3 Review Fixes, 30% Containment Box, Glare, Metadata Cleanup, Top-Left Placard & Global Helvetica
- **Date**: 2026-11-24 06:34:00 UTC
- **Feedback Source**: Code Review (PR #3 multi-agent visual & code audit) + User Playtest Feedback
- **Resolution Summary**:
  - **Slow drag (`PlaygroundGallery.tsx`)**: Tracked `startX`/`startY` from `pointerdown` so cumulative displacement > `5px` triggers pan even for slow `2.5px`/event drags (`slowDragPanned: true`).
  - **`will-change` settle (`PlaygroundGallery.tsx`)**: Added a `SETTLE_MS + 16` timeout in `markGesture()` so `.wall-world` resets `will-change: auto` after gestures settle (`willChangeCleared: true`).
  - **256-spot lighting budget (`playgroundLighting.ts`, `PlaygroundPbrWall.tsx`)**: Raised `MAX_SPOTS` and shader loop bound to `256` and sorted visible spots by squared distance to the camera, keeping all `150` spots lit on the 50-album `?demo=1000` fixture.
  - **Mobile Album Focus (`PlaygroundGallery.tsx`)**: On portrait viewports (`aspect < 0.9`), Album Focus frames the photo grid (excluding placard) with `0.06` padding (`scale 0.3425 -> 0.4875`, `mobileAlbumZoomedIn: true`).
  - **Stale `bottomInsetPx` (`PlaygroundGallery.tsx`)**: Gated `bottomInsetPx` to Print Focus (`useBottomInset = true` only for `viewMode === 'print'`), making `0` / Overview from Print Focus land at exact `y = 3.6132` (`overviewFromPrintExact: true`).
  - **30% Viewport Containment Box (`cameraMath.ts`, `PlaygroundGallery.tsx`)**: Added `computeWallBounds`, `computeMaxZoom`, and `clampCameraToBounds` (15% per side = 30% horizontal margin) so small walls stay framed (`z <= 43.59u`, `|x| <= 21.85u`) while 50-album walls still reach macro tier (`scale < 0.25`).
  - **Glass tilt glare (`playground-wall.css`, `PlaygroundGallery.tsx`)**: Made `.photo-window`/`.photo-sheen` `display: block` and translated the `115deg` diagonal glazing highlight via GPU `translate3d` on `onPointerMove`.
  - **Focus Bar metadata (`PhotoFocusBar.tsx`, `fakeManifest.ts`, `FolderDropzone.tsx`)**: Removed hardcoded camera gear strings (`cameraName`) in favor of optional `[dateLabel, locationLabel]` joined by `' • '` (collapsing cleanly when empty).
  - **Top-left Swiss placard (`playground-wall.css`, `PlaygroundGallery.tsx`)**: Added flex top-left anchoring (`padding: 20px 24px 30px 24px`), tightened `17px` bold `1.15` title + `6px` gap + `13px` regular `1.35` caption, and removed redundant `.placard-track`.
  - **Global Helvetica (`globals.css`, `playground-wall.css`)**: Unified `--font-family-base` to `'Helvetica Neue', Helvetica, 'TeX Gyre Heros', Arial, sans-serif` across `:root, html, body, button, input, textarea, select`.
- **Status**: RESOLVED
