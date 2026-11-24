# Architecture: Print Sharpness and LOD Fix

> [!NOTE]
> This document specifies **technical system architecture only** (compositor layer lifecycle, LOD selection seam, and performance boundaries).
> Visual styling and verification checks are recorded in `design.md` and `tests.md`.

## Context

`GalleryCanvas.tsx` zooms the exhibition wall by applying a CSS `scale(...) translate3d(...)` transform to `.wall-world`, and `markGesture()` already toggles `worldRef.current.style.willChange = 'transform'` during gestures and resets it to `'auto'` after `SETTLE_MS` (140ms) so Chromium re-rasterizes the wall at the settled zoom.

However, two bottlenecks still degrade Print Focus sharpness:
1. `src/styles/wall.css` sets permanent `will-change: transform` on `.wall-world` (before first gesture) and `.photo-frame`, plus `will-change: transform, opacity` on `.photo-sheen`, preventing Chromium from re-rasterizing individual print layers at the higher Print Focus scale.
2. `GalleryCanvas.tsx` computes one `lodWidth = resolveProjectedLodWidth(CELL_SIZE * 100, scale, viewport.dpr)` (`L693`) for all prints. On `DPR = 1` viewports (`~900px` tall), projected cell size stays `<= 800px`, so even the focused print never requests `2048px`.

## Goals / Non-Goals

**Goals:**
- Allow Chromium to re-rasterize settled `.photo-frame` and `.photo-sheen` layers at final zoom scale by removing permanent `will-change` declarations in `src/styles/wall.css`.
- Upgrade only the active `focused` print in Print Focus to `PRINT_FOCUS_LOD_WIDTH` (`2048`) via a pure helper in `zoomTier.ts`, preserving `resolveProjectedLodWidth` for all unfocused prints.

**Non-Goals:**
- Changing camera `ZOOM_MIN` / `ZOOM_MAX` or `PRINT_PADDING`.
- Loading `2048px` images for unfocused sibling prints on the wall.

## Technical Decisions

### D1. Remove Permanent `will-change` in `src/styles/wall.css`
- **Decision:** Delete `will-change: transform;` from `.wall-world` and `.photo-frame`, and `will-change: transform, opacity;` from `.photo-sheen`. Keep `GalleryCanvas.tsx`'s dynamic `markGesture` `willChange` toggle on `.wall-world`.
- **Rationale:** `.photo-frame` already sits on its own 3D context via `transform: translateZ(22px)` and `transform-style: preserve-3d`. Removing permanent `will-change` unlocks full-resolution re-rasterization when motion stops without breaking hover tilt.

### D2. Pure `resolvePrintLodWidth` Helper in `zoomTier.ts`
- **Decision:** Export `PRINT_FOCUS_LOD_WIDTH = LOD_BUCKETS[LOD_BUCKETS.length - 1]` (`2048`) and `resolvePrintLodWidth(cellPx, scale, dpr, focused)` returning `PRINT_FOCUS_LOD_WIDTH` when `focused === true` and `resolveProjectedLodWidth(cellPx, scale, dpr)` otherwise. `FramedPrint.tsx` uses `focused ? PRINT_FOCUS_LOD_WIDTH : lodWidth`.
- **Rationale:** Pure function is trivially unit-testable in `zoomTier.test.ts` and keeps `GalleryCanvas.tsx`'s shared `lodWidth` calculation untouched for all unfocused prints.

## Risks / Trade-offs

- **[Risk] Hover tilt on `.photo-frame` stutters in Chromium without `will-change: transform`.** → **Mitigation:** Verify tilt smoothness in Playwright; if stutter appears, `FramedPrint.tsx` can toggle `willChange = 'transform'` strictly during `onPointerEnter` / `onPointerLeave` (never permanently).

## Migration & Rollback Plan

- Pure 3-file frontend/CSS/LOD fix; rollback is a single `git revert`.
