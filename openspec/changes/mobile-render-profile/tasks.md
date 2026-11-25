# Tasks: Mobile Render Profile

## Target Context Map

| File (repo-relative) | Target Lines | Purpose |
| :--- | :--- | :--- |
| `src/components/wall/__tests__/useGyroTilt.test.ts` | `L210-L360` | Update lifecycle tests to assert `deviceorientation` attaches ONLY in `print` focus (`tier === 'print' && focusedPhotoId !== null`) and detaches in `album` tier. |
| `src/components/wall/__tests__/zoomTier.test.ts` | `L1-L80` | Add TDD unit tests for `maxDpr = 2` non-focused thumbnail cap vs. `2048` Print Focus. |
| `src/lib/__tests__/touchAudit.test.ts` | `L1-L120` | Extend static audit to verify mobile render-profile rules live strictly inside `@media (pointer: coarse)` with zero ungated `:hover` rules. |
| `src/components/wall/useGyroTilt.ts` | `L196-L214` | Attach gyroscope listeners only when `capable && tier === 'print' && focusedPhotoId !== null`. |
| `src/components/wall/FramedPrint.tsx` | `L94-L140` | Subscribe to `gyroSubscribe` only when `tier === 'print' && focused` (remove Album View per-print sheen updates) and add `is-focused-cell` class on `.photo-cell` when `focused` is true. |
| `src/styles/wall.css` | `L234-L270`, `L710-L725`, `L964-L1185` | Under `@media (pointer: coarse)`: hide non-focused `.photo-sheen`, set Print Focus `.photo-sheen` to `mix-blend-mode: normal`, hide `.photo-paper-grain`, clear `.photo-frame` SVG `feTurbulence` mat background, flatten non-focused `.photo-cell`/`.photo-frame` 3D contexts with `scale(1.0195)`, collapse shadows to 1 directional layer (preserving `--tilt-sx`/`--tilt-sy` in Print Focus), and replace placard `backdrop-filter` with tuned frosted gradients across all 3 moods. |
| `src/components/wall/zoomTier.ts` & `src/components/wall/GalleryCanvas.tsx` | `zoomTier.ts:L48-L72`; `GalleryCanvas.tsx:L332-L345` | Cap non-focused thumbnail LOD DPR at `2` on coarse pointers while keeping `PRINT_FOCUS_LOD_WIDTH = 2048`. |
| `src/components/wall/PlaygroundPbrWall.tsx` | `L310-L326` | Export and wire `resolveWallCanvasDpr(viewportDpr, coarsePointer)` capping coarse-pointer wall canvas DPR (`1.0`, tunable to `1.25` / `1.5` from device check) while keeping fine-pointer desktop at `2.0`. |

---

## 1. Baseline Capture & Test Scaffolding (TDD)

- [ ] 1.0 Confirm PR #13 (`PATCH-01` `133dd21` + `PATCH-02` `b86d113`) and `render-loop-efficiency` are merged into `main`, then branch `feat/mobile-render-profile` from `main`.
- [ ] 1.0b Capture the post-`render-loop-efficiency` baseline on iPhone 16 Pro preview: Safari **Layers-tab counts** in Album View and Print Focus, `S2` style recalcs / composite ms, `S3` post-zoom paint spikes, and `S2` / `S4` **Energy Impact**, and record them in `research.md` / `verification.md`.
- [ ] 1.1 Update `src/components/wall/__tests__/useGyroTilt.test.ts` to expect print-only listener attachment (`album` tier attaches `0` listeners; `print` with `focusedPhotoId` attaches `1`).
- [ ] 1.2 Add failing unit tests in `src/components/wall/__tests__/zoomTier.test.ts` (`maxDpr = 2` non-focused vs. `2048` Print Focus) and a unit test for `resolveWallCanvasDpr(dpr, coarsePointer)` (`1.0` coarse, `2.0` fine).
- [ ] 1.3 Extend `src/lib/__tests__/touchAudit.test.ts` to parse **all** `@media (pointer: coarse)` blocks in `wall.css`, confirming `:hover` gating and `touch-action` invariants survive alongside the new mobile render-profile rules (no `backdrop-filter` on mobile beveled-glass/`.mat-acrylic`, `.mat-aluminum` untouched, no `.photo-paper-grain`, no `mix-blend-mode: screen` on Print Focus sheen).
- [ ] 1.4 Run targeted Vitest files and confirm new assertions fail before implementation.

## 2. Print-Only Gyro Scope & Hydration-Safe Runtime Caps

- [ ] 2.1 Update `src/components/wall/useGyroTilt.ts` (`setContext`) and `src/components/wall/FramedPrint.tsx` (subscribe only when `tier === 'print' && focused`, add `is-focused-cell` class on `.photo-cell`) until `useGyroTilt.test.ts` passes.
- [ ] 2.2 Update `src/components/wall/zoomTier.ts` and `src/components/wall/GalleryCanvas.tsx` (using `useSyncExternalStore` with server snapshot `false` for hydration safety) to cap non-focused coarse-pointer thumbnail LOD DPR at `2` while keeping `PRINT_FOCUS_LOD_WIDTH = 2048`.
- [ ] 2.3 Update `src/components/wall/PlaygroundPbrWall.tsx` with `resolveWallCanvasDpr(viewportDpr, coarsePointer)` (`MOBILE_WALL_MAX_DPR = 1.0` coarse cap, `2.0` desktop cap — isolated heat/GPU experiment).

## 3. Coarse-Pointer CSS Render Profile

- [ ] 3.1 Verify live placard material selectors in `src/components/wall/AlbumPlacard.tsx` (`mat-acrylic`, `mat-aluminum`, beveled-glass selector), then add the `@media (pointer: coarse)` mobile render profile rules in `src/styles/wall.css`: Album View sheen hidden, Print Focus sheen `mix-blend-mode: normal`, `.photo-paper-grain` hidden, `.photo-frame` SVG `feTurbulence` cleared, `.photo-cell:not(.is-focused-cell)` / `.photo-frame:not(.focused)` flattened with `scale(1.0195)`, 1-layer directional shadows with `.playground-wall-root .photo-frame.is-lit.focused` preserving `--tilt-sx`/`--tilt-sy`, and material-scoped static frosted gradients (`backdrop-filter: none`) on beveled-glass and `.mat-acrylic` only.
- [ ] 3.2 Run `touchAudit.test.ts` and `cssBoundaryAudit.test.ts` and confirm 100% pass.

## 4. Verification & Empirical Audit

- [ ] 4.1 Run `npx vitest run && npx tsc --noEmit && npx eslint src && npm run build` and verify 100% pass.
- [ ] 4.2 Run Playwright desktop (`1440×900`, fine pointer) parity check confirming **0** `pixelmatch` and computed-style diffs vs. `main`, PLUS a Playwright coarse-emulation assertion confirming `--tilt-sx` shifts `.photo-frame.is-lit.focused`'s computed `box-shadow` offsets and `.mat-aluminum` keeps its metallic background.
- [ ] 4.3 Record automated + Playwright evidence in `openspec/changes/mobile-render-profile/verification.md` (with real-device checks marked `PENDING MANUAL DEVICE VERIFICATION`).
- [ ] 4.4 Run real iPhone 16 Pro & Android Chrome preview verification against Task `1.0b` baseline (`S2`/`S3` composite ms & missed vsyncs `< 5%`, Layers-tab `≥ 30%` reduction, `S3` paint spikes `< 8 ms`, `S2`/`S4` Energy Impact, wall DPR `1.0` visual/thermal check, and all 3 lighting moods) and record before/after deltas in `verification.md`.
