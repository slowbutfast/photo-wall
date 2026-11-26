# Verification Plan: Universal Render Loop & Memory Efficiency

## Automated Tests

- `npx vitest run src/components/wall/__tests__/printSharpOverlaySync.test.ts`:
  - Verifies `createOverlaySyncScheduler` parks at `0` pending rAFs after a single clean sync (`wake(0)` → 1 sync → idle).
  - Verifies `wake(300)` keeps syncing for the full `300 ms` fixed transition tail (no early `transitionend` truncation) and stops once elapsed.
  - Verifies multiple `wake()` calls within one frame coalesce to a single rAF callback.
  - Verifies `destroy()` cancels pending rAFs and ignores subsequent wakes.
- `npx vitest run src/components/wall/__tests__/printImagePrefetch.test.ts` (or existing prefetch test):
  - Verifies `MAX_HELD = 3` (calling `prefetchPrintImage` with 5 unique URLs retains at most 3 held images, evicting oldest first).
- `npx vitest run src/components/wall/__tests__/macroMosaic.test.ts` (and `MacroIsland` incremental draw + LRU disposal test):
  - Verifies `N` thumbnails resolving across separate frames execute at most `N` `drawImage` calls (incremental per-cell draw, zero `clearRect` after initial draw).
  - Verifies `mosaicCache` refreshes recency on hit, zeroes evicted and signature-replaced canvases when `!canvas.isConnected`, and does NOT blank a connected canvas until unmount cleanup.
- `npx vitest run src/components/wall/__tests__/snapshotKey.test.ts` (pure snapshot-key helper test):
  - Verifies crossing `scale = 0.52` changes the snapshot key even when visible island IDs, `ZoomTier`, and `lodWidth` bucket remain unchanged.
- `npx vitest run && npx tsc --noEmit && npx eslint src && npm run build`:
  - Full unit test suite, typecheck, lint, and production Next.js build pass with zero regressions.
- **Desktop Fine-Pointer Zero-Diff Check:**
  - Playwright (`1440×900`, fine pointer) confirms **0** `pixelmatch` and computed-style diffs across idle, album, print, hovered, and mouse-leave ease-back states vs. post-PR-#13 `main`.

## Manual Verification (Real iPhone 16 Pro Preview — Post-PR-#13 Comparison)

Run on the preview deployment branched from post-PR-#13 `main` (reloading between `S6` runs and skipping YouTube in `S6` to match baseline runs 04–06):

- **S4 (Print Focus Idle):**
  - **WHEN** entering Print Focus on iPhone 16 Pro and holding the phone still for `> 1 s`
  - **THEN** Safari Web Inspector Timelines SHALL drop from `~60` commits/sec to **`~0` composites/sec and `~0` rAF/sec** (plus lower Energy Impact).
- **S5 (Print Focus Active):**
  - **WHEN** tilting and inspecting a focused print
  - **THEN** forced layouts per run SHALL drop sharply from the `~240`/run baseline while `PrintSharpOverlay` stays aligned and crisp.
- **S6 (10-Album Browse Memory — Runs 04–06 Route, No YouTube, Reload Between Runs):**
  - **WHEN** browsing the standardized 10-album route
  - **THEN** per-run memory growth SHALL drop below the `+85 MB/run` baseline.
- **S1 (Startup):**
  - **WHEN** loading `/photos` cold
  - **THEN** `MacroIsland` `drawImage`/`clearRect` startup time SHALL drop below the `24–37 ms` baseline.
