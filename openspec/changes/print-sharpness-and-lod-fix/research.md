# Research: Print Sharpness and LOD Fix

## Source material

### 2026-11-24 — Investigation of Blurry Zoomed Prints

> I think the browser is blurring the photos, not the server sending small files. We request the right image sizes, but the photo frames are set up so Chrome draws them once at a low zoom and then just stretches that drawing as you zoom in.
>
> `GalleryCanvas.tsx:693` picks the image size from how large the cell appears on screen: about 158 CSS px, times the zoom scale, times the device pixel ratio (capped at 3). `zoomTier.ts:46` rounds that up to the next size bucket: 256, 800 or 2048 px.
>
> `GalleryCanvas` already handles this for the world div. `markGesture` turns `will-change` on while you're dragging or zooming, and sets it back to `auto` about `SETTLE_MS` after you stop. Chrome then redraws everything at the final zoom.
>
> The photo frames don't get that treatment. `wall.css` gives them a permanent `will-change`:
> - `.photo-frame` at L962: `will-change: transform`
> - `.photo-sheen` at L1116: `will-change: transform, opacity`
>
> Remove the permanent `will-change` from `.photo-frame` and `.photo-sheen`.

> I found why the wall can stay on a lower-resolution image: **the LOD picker is limited by the camera’s zoom floor.** It selects a bucket from `100 × camera scale × devicePixelRatio`, and the scale comes from the camera distance. At a 900px-tall viewport, the closest allowed camera position produces a scale of about 5.45. That means a DPR 1 display tops out around 545 projected pixels, so the picker never requests the 2048px variant; it stops at 800px. On higher-DPR screens, it can reach 2048.
>
> Print focus doesn’t override this calculation. It only changes the visual tier; the image URL still uses the same projected-size bucket. So on a DPR 1 display, you can be in Print Focus and continue seeing the 800px version.
>
> The fix is to make focused-print quality explicit: request the 2048px variant for the selected print in Print Focus, while keeping projected-size selection for other images.

### Raised but not acted on

- **Upgrading all visible sibling prints to `2048px` in Print Focus:** Rejected. Loading `2048px` derivatives for every visible print on the wall wastes bandwidth and decode memory; upgrading only the `focused` print gives crisp inspection at minimal cost.
- **Dynamically toggling `will-change` in `FramedPrint.tsx` on pointer hover:** Deferred unless removing static `will-change` causes measurable hover-tilt stutter in Chromium; removing permanent `will-change` from `.photo-frame` and `.photo-sheen` is the clean baseline because `translateZ(22px)` and `preserve-3d` already promote frames cleanly without locking raster scale across camera zooms.

## Glossary

| Term | Means | Does NOT mean |
| :--- | :--- | :--- |
| **Compositor Raster-Scale Lock** | Chromium caching a GPU-composited layer's bitmap at the CSS scale active when the layer was created (triggered by permanent `will-change: transform`), stretching low-res pixels when `.wall-world` zooms in. | Server-side Bunny Optimizer downscaling or missing image files. |
| **Print-Focus LOD Override (`PRINT_FOCUS_LOD_WIDTH`)** | Explicitly requesting the `2048px` bucket (`LOD_BUCKETS[LOD_BUCKETS.length - 1]`) for the single `focused` print (`focused === true`), bypassing the `DPR = 1` projected-pixel cap. | Changing `resolveProjectedLodWidth` for unfocused sibling prints or overview/album tiers. |

## External research

| Source | What it establishes | Licence | Accessed |
| :--- | :--- | :--- | :--- |
| Chromium compositor layer rasterization behavior | Permanent `will-change: transform` freezes rasterization scale across ancestor CSS `scale()` transforms; `will-change: auto` allows re-rasterization after gesture settle. | Public web platform | 2026-11-24 |

## Candidate tech

| Option | Decision | Reason | Date |
| :--- | :--- | :--- | :--- |
| Remove permanent `will-change` in `wall.css` + `resolvePrintLodWidth` (`2048` when `focused`) | **Adopted** | Fixes both Chromium compositor stretching and `DPR = 1` `800px` LOD ceiling in ~25 lines with zero new dependencies. | 2026-11-24 |
| Lower `ZOOM_MIN` so camera flies closer | **Rejected** | Would break Print Focus framing proportions (`PRINT_PADDING = 0.14`) and still wouldn't help `DPR = 1` viewports under `~900px` height. | 2026-11-24 |

## Patterns adopted

- **Dynamic `will-change` lifecycle (`GalleryCanvas.tsx` `markGesture`):** `.wall-world` already toggles `willChange = 'transform'` during gestures and resets to `'auto'` after `SETTLE_MS`; removing static `will-change` from `wall.css` lets `.wall-world`, `.photo-frame`, and `.photo-sheen` re-rasterize cleanly when settled.

## Verified facts

| Claim | Value | How verified | Date | Volatility |
| :--- | :--- | :--- | :--- | :--- |
| Permanent `will-change` rules in `src/styles/wall.css` | `.wall-world` (`L490: will-change: transform`), `.photo-frame` (`L962: will-change: transform`), `.photo-sheen` (`L1116: will-change: transform, opacity`) | `grep -n "will-change"` + `read_file` on `src/styles/wall.css` | 2026-11-24 | stable |
| `GalleryCanvas.tsx` shared `lodWidth` calculation | `const lodWidth = resolveProjectedLodWidth(CELL_SIZE * 100, scale, viewport.dpr);` (`L693`), passed uniformly to every `FramedPrint` (`L844`) regardless of `focused` | `read_file` on `src/components/wall/GalleryCanvas.tsx:693,844` | 2026-11-24 | stable |
| `FramedPrint.tsx` image request | Calls `lodUrl(photo, lodWidth)` (`L110`) without checking `focused` | `read_file` on `src/components/wall/FramedPrint.tsx:108-115` | 2026-11-24 | stable |
| `LOD_BUCKETS` in `src/components/wall/zoomTier.ts` | `[256, 800, 2048]` (`L15`) | `read_file` on `src/components/wall/zoomTier.ts:15` | 2026-11-24 | stable |

## Unverified assumptions

- Whether any Bunny Optimizer live production CDN URL caps `?width=2048` below 2048px (cannot be fetched in offline sandbox; DevTools `$0.naturalWidth` check in `tests.md` covers live CDN verification).

## Superseded claims

- None yet.

## Links out

- [openspec/specs/instanced-photo-renderer/spec.md](../../specs/instanced-photo-renderer/spec.md)
- [src/components/wall/zoomTier.ts](../../../src/components/wall/zoomTier.ts)
- [src/components/wall/FramedPrint.tsx](../../../src/components/wall/FramedPrint.tsx)
- [src/styles/wall.css](../../../src/styles/wall.css)
