# Tasks: Universal Render Loop & Memory Efficiency

## Target Context Map

| File (repo-relative) | Target Symbol / Lines | Purpose |
| :--- | :--- | :--- |
| `src/components/wall/__tests__/printSharpOverlaySync.test.ts` | `[NEW]` | TDD unit tests for `createOverlaySyncScheduler` (single wake → idle, fixed `300 ms` tail, coalesced wakes, `destroy()`). |
| `src/components/wall/printSharpOverlaySync.ts` | `[NEW]` | Pure, framework-free rAF scheduler with dirty flag + fixed `300 ms` settling tail — zero React, zero DOM. |
| `src/components/wall/PrintSharpOverlay.tsx` | `PrintSharpOverlay` effect & `tick` (`L34-L109`) | Wire `createOverlaySyncScheduler`, cache DOM refs, diff-guard inline style writes (`width`, `height`, `transformOrigin`, `transform`, sheen), and wake on camera motion, `ResizeObserver`, focus/hover (`wake(300)`), and gyro tilt. |
| `src/components/wall/printImagePrefetch.ts` | `MAX_HELD` & `prefetchPrintImage` (`L9-L33`) | Lower `MAX_HELD` from `8` to `3` (current ± 1 neighbor) and update any pinned unit test. |
| `src/components/wall/MacroIsland.tsx` | `mosaicFor` & `MacroIsland` `useEffect` (`L32-L115`) | Paint placeholder once and draw each thumbnail incrementally into its own cell on `onload` (`O(N)` draws), refresh LRU recency on hit, and zero evicted/signature-replaced canvases only when `!canvas.isConnected` (deferring connected canvases to unmount cleanup). |
| `src/components/wall/GalleryCanvas.tsx` | `requestFrame` rAF callback (after `flushPendingInputRef.current()`) | Audit all `snapshot`/`scale` readers; compute imperative snapshot key (`tier`, `lodBucket`, `scale < 0.52`, visible island IDs) before calling `setSnapshot`; pass camera-motion wake callback to `PrintSharpOverlay`. |
| `src/components/wall/PlaygroundPbrWall.tsx` | `createSpotTexture` & `paint` (`L266-L285`, `L328-L346`) | Allocate `spotTexture` once at `MAX_SPOTS × 2` (`256 × 2`) and upload active `[0, count)` sub-range via `gl.texSubImage2D`. |

---

## 1. Test Scaffolding (TDD)

- [ ] 1.0 Confirm PR #13 (`mobile-touch-compatibility` + `mobile-gyroscope-glare` + `PATCH-01` `133dd21` + `PATCH-02` `b86d113`) is merged into `main`, then branch `feat/render-loop-efficiency` from `main`.
- [ ] 1.1 Write failing `src/components/wall/__tests__/printSharpOverlaySync.test.ts` covering idle-stop after clean sync, fixed `300 ms` transition tail (no early `transitionend` stop), same-frame wake coalescing, and `destroy()` cleanup.
- [ ] 1.2 Add/update failing unit tests for `printImagePrefetch` (`MAX_HELD = 3` eviction), `MacroIsland` (incremental per-cell `O(N)` draw count across frames, LRU hit recency, connected-canvas protection + detached/unmount disposal + signature-mismatch disposal), and the imperative snapshot key (`scale < 0.52` crossing).
- [ ] 1.3 Run targeted Vitest files and confirm they fail before implementation.

## 2. Overlay Scheduler, Prefetch Bound, & Incremental Mosaic

- [ ] 2.1 Implement `src/components/wall/printSharpOverlaySync.ts` (fixed `300 ms` tail, no `endTransition()`) until `printSharpOverlaySync.test.ts` passes.
- [ ] 2.2 Refactor `src/components/wall/PrintSharpOverlay.tsx` to use `createOverlaySyncScheduler`, cache DOM refs, diff-guard inline style writes, and wake on camera/resize/hover/gyro/focus (with `300 ms` tail on focus/hover/tilt).
- [ ] 2.3 Update `src/components/wall/printImagePrefetch.ts` (`MAX_HELD = 3`) and `src/components/wall/MacroIsland.tsx` (incremental per-cell draw, true-LRU hit recency, `!canvas.isConnected` disposal guard + unmount cleanup + signature-mismatch disposal) until tests pass.

## 3. Imperative rAF Snapshot Check & Spot Texture Reuse

- [ ] 3.1 Audit every reader of `snapshot` and `scale` in `GalleryCanvas.tsx` / `FramedPrint.tsx`, then update `GalleryCanvas.tsx`'s `requestFrame` callback (after `flushPendingInputRef.current()`) to check visible island IDs, `ZoomTier`, projected `lodWidth` bucket, and `scale < 0.52` imperatively before calling `setSnapshot` (plus once on settle), and pass the camera-motion wake callback to `PrintSharpOverlay`.
- [ ] 3.2 Update `src/components/wall/PlaygroundPbrWall.tsx` to allocate `spotTexture` once at `MAX_SPOTS × 2` (`256 × 2`) and update active rows via `gl.texSubImage2D`.

## 4. Verification & Empirical Audit

- [ ] 4.1 Run `npx vitest run && npx tsc --noEmit && npx eslint src && npm run build` and verify 100% pass.
- [ ] 4.2 Run Playwright desktop (`1440×900`, fine pointer) parity check (including focus entry `transform 0.24s` + `padding 0.25s` and mouse-leave settle) confirming **0** pixelmatch / computed-style diffs vs. `main`.
- [ ] 4.3 Record automated + Playwright evidence in `openspec/changes/render-loop-efficiency/verification.md` (with `S1`, `S4`, `S5`, `S6` `<= +40 MB/run` pass bar and maintainer preview checklist marked `PENDING MANUAL DEVICE VERIFICATION`).
- [ ] 4.4 Run real iPhone 16 Pro preview verification (`S1`, `S4`, `S5`, `S6` no-YouTube reload-between-runs; pass bar `S6 <= +40 MB/run`, noting `PrintSharpOverlay` duplicate `<img>` fallback if WebKit retains bitmaps independently) and record before/after deltas in `verification.md`.
