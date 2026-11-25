# Proposal: Print Sharpness and LOD Fix

## Why

Zoomed-in prints in Single-Photo Inspection can appear soft or blurry for two compounding reasons: (1) permanent `will-change: transform` / `will-change: transform, opacity` rules on `.photo-frame`, `.photo-sheen`, and initial `.wall-world` in `src/styles/wall.css` lock Chromium's compositor layer rasterization to the low overview/album scale so pixels are stretched instead of re-drawn after zoom settles, and (2) `GalleryCanvas.tsx` passes a single projected-size `lodWidth` to all prints, which tops out at the `800px` bucket on `DPR = 1` displays even when a print is focused in Print Focus. Removing the permanent `will-change` raster locks and explicitly requesting the `2048px` bucket for the focused print restores full-resolution sharpness on inspection without loading `2048px` images for unfocused neighbors.

## What Changes

- **Remove Permanent `will-change` Raster-Scale Locks (`src/styles/wall.css`):**
  - Remove static `will-change: transform;` from `.playground-wall-root .wall-world` (`L490`, already managed dynamically by `GalleryCanvas.tsx` `markGesture`), `.playground-wall-root .photo-frame` (`L962`), and `will-change: transform, opacity;` from `.playground-wall-root .photo-sheen` (`L1116`).
- **Explicit `2048px` LOD for Focused Prints (`src/components/wall/zoomTier.ts`, `src/components/wall/FramedPrint.tsx`):**
  - Export `PRINT_FOCUS_LOD_WIDTH = 2048` and `resolvePrintLodWidth(cellPx, scale, dpr, focused)` from `zoomTier.ts`.
  - Use `resolvePrintLodWidth` (or `focused ? PRINT_FOCUS_LOD_WIDTH : lodWidth`) in `FramedPrint.tsx` so the `focused` print always requests `2048px` while unfocused siblings keep their projected-size LOD bucket.

## Capabilities

### New Capabilities

- (None — refines existing renderer LOD and compositor behavior.)

### Modified Capabilities

- `instanced-photo-renderer`: Remove permanent `will-change` raster locks from `.wall-world`, `.photo-frame`, and `.photo-sheen` so Chromium re-rasterizes settled zoomed prints, and explicitly select the `2048px` LOD bucket (`PRINT_FOCUS_LOD_WIDTH`) for the `focused` print in Print Focus while keeping projected-size buckets (`256 / 800 / 2048`) for all other prints.

## Impact

- **Stylesheets:** `src/styles/wall.css` (`L490`, `L962`, `L1116`).
- **Wall Components & LOD:** `src/components/wall/zoomTier.ts`, `src/components/wall/FramedPrint.tsx`.
- **Tests:** `src/components/wall/__tests__/zoomTier.test.ts` + Playwright computed `willChange`, `?width=2048` / `height=2048` network/src check, and visual inspection.
- **Dependencies / DB / APIs:** Zero new packages, zero DB changes, zero API changes.
