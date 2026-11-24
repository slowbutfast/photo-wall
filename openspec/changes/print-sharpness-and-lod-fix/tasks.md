# Tasks: Print Sharpness and LOD Fix

## Target Context Map

| File (repo-relative) | Target Lines | Purpose |
| :--- | :--- | :--- |
| `src/components/wall/__tests__/zoomTier.test.ts` | `L13-L20`, `L88-L96` | Add TDD unit tests for `PRINT_FOCUS_LOD_WIDTH === 2048` and `resolvePrintLodWidth(cellPx, scale, dpr, focused)` (`2048` when `focused = true` on `DPR = 1`, projected bucket when `false`). |
| `src/styles/wall.css` | `L484-L493`, `L955-L966`, `L1109-L1120` | Remove permanent `will-change: transform;` from `.wall-world` (managed dynamically by `GalleryCanvas.tsx` `markGesture`) and `.photo-frame`, and `will-change: transform, opacity;` from `.photo-sheen`. |
| `src/components/wall/zoomTier.ts` | `L14-L55` | Export `PRINT_FOCUS_LOD_WIDTH = LOD_BUCKETS[LOD_BUCKETS.length - 1]` and `resolvePrintLodWidth(cellPx, scale, dpr, focused)`. |
| `src/components/wall/FramedPrint.tsx` | `L14`, `L106-L116` | Use `resolvePrintLodWidth` / `focused ? PRINT_FOCUS_LOD_WIDTH : lodWidth` when calling `lodUrl(photo, ...)` so the focused print always requests `2048px` while siblings keep `lodWidth`. |

---

## 1. Test Scaffolding (TDD)

- [ ] 1.1 Extend `src/components/wall/__tests__/zoomTier.test.ts` with failing tests asserting `PRINT_FOCUS_LOD_WIDTH === 2048`, `resolvePrintLodWidth(CELL_PX, 3.5, 1, true) === 2048`, and `resolvePrintLodWidth(CELL_PX, 3.5, 1, false) === 800`.
- [ ] 1.2 Run `npx vitest run src/components/wall/__tests__/zoomTier.test.ts` and confirm the new tests fail before implementation.

## 2. Compositor Raster-Scale & Print-Focus LOD Fix

- [ ] 2.1 Remove permanent `will-change: transform;` from `.wall-world` (`L490`) and `.photo-frame` (`L962`), and `will-change: transform, opacity;` from `.photo-sheen` (`L1116`) in `src/styles/wall.css`.
- [ ] 2.2 Export `PRINT_FOCUS_LOD_WIDTH` and `resolvePrintLodWidth` from `src/components/wall/zoomTier.ts`, and update `src/components/wall/FramedPrint.tsx` (`L110`) to pass `focused ? PRINT_FOCUS_LOD_WIDTH : lodWidth` into `lodUrl(photo, ...)`.

## 3. Verification & Empirical Audit

- [ ] 3.1 Run `npm run typecheck && npm run lint && npx vitest run && npm run build` and verify 100% pass (including `zoomTier.test.ts` and `cssBoundaryAudit.test.ts`).
- [ ] 3.2 Run Playwright (`--workers=1`, `1440×900`, `DPR = 1`) against `next start` on `/photos?demo=4&mood=chiaroscuro`: enter Print Focus and verify `getComputedStyle(focusedFrame).willChange === 'auto'`, `getComputedStyle(sheen).willChange === 'auto'`, focused `<img class="photo-img">` requests the `2048` bucket while unfocused siblings remain on `800`, and inspect a captured Print Focus screenshot. Populate `openspec/changes/print-sharpness-and-lod-fix/verification.md` with Requirement Adherence Audit Matrix and verbatim execution logs.
