# Tasks: Mobile Gyroscope Rotational Glare

## Target Context Map

| File (repo-relative) | Target Lines | Purpose |
| :--- | :--- | :--- |
| `src/components/wall/__tests__/gyroTilt.test.ts` | `[NEW]` | TDD unit tests for `computeGyroTilt`, `wrapAngleDelta`, time-based `smoothTilt`, explicit `0°/90°/180°/270°` orientation sign vectors, and `±22°` clamping. |
| `src/components/wall/__tests__/useGyroTilt.test.ts` | `[NEW]` | TDD lifecycle tests for `createGyroController` & `requestGyroPermission` (granted/denied/rejected, unsupported sensors, fine-pointer & reduced-motion gating, tier/focus attach/detach, live orientation-change rebase, null/non-finite readings). |
| `src/components/wall/gyroTilt.ts` | `[NEW]` | Pure sensor math (`computeGyroTilt`, time-based `smoothTilt`, `DEFAULT_GYRO_MAX_DEG = 22`, `DEFAULT_GYRO_TAU_MS = 85`) — zero DOM, zero React. |
| `src/components/wall/useGyroTilt.ts` | `[NEW]` | Injectable `GyroAdapter` + `createGyroController` + React `useGyroTilt` hook (`pointer: coarse` && `!prefers-reduced-motion`), live `screen.orientation` rebase, rAF-throttled subscription, and session-memoized iOS `requestPermission()` helper. |
| `src/components/wall/GalleryCanvas.tsx` | `L740-L855` | Wire `useGyroTilt` (`tier`, `focusedPhotoId`) and pass `gyroSubscription` / `requestGyroPermission` to `AlbumTier` → `FramedPrint` without 60Hz React re-renders. |
| `src/components/wall/FramedPrint.tsx` | `L53-L105` | Subscribe focused/album prints imperatively to smoothed `(nx, ny)` (full tilt + shadow + glare on focused print in `print` tier; `30%` glare-only `.photo-sheen` in `album` tier) and call `requestGyroPermission()` synchronously in `onClick` when entering Print Focus on iOS. |
| `src/styles/wall.css` | `L955-L985`, `L1109-L1126` | Ensure smooth, jitter-free `.photo-frame.focused` and `.photo-sheen` updates under continuous gyroscope input. |

---

## 1. Test Scaffolding (TDD)

- [x] 1.0 Confirm `mobile-touch-compatibility` is merged into `main`, then branch `feat/mobile-gyroscope-glare` from `main`. *(Orchestrator-provided branch `feat/multi-20261125-0558`; prerequisite committed at `0adbbb5`.)*
- [x] 1.1 Write failing `src/components/wall/__tests__/gyroTilt.test.ts` covering neutral relative baseline (`beta0 = 50, gamma0 = -8` → `{ nx: 0, ny: 0 }`), `±22°` clamp (`±0.5`), explicit `0°/90°/180°/270°` screen-orientation sign vectors, `180°` wraparound, and time-based `smoothTilt` (`30Hz` vs `120Hz` parity and `dt` cap).
- [x] 1.2 Write failing `src/components/wall/__tests__/useGyroTilt.test.ts` covering `createGyroController` & `requestGyroPermission` via an injectable `GyroAdapter`: granted/denied/rejected permission, unsupported sensors, `(pointer: fine)` and `prefers-reduced-motion` gating, attach/detach across `macro`/`album`/`print` and `focusedPhotoId` changes, live `screen.orientation` rebase with smoother reset, and ignoring `null`/non-finite `beta`/`gamma` readings.
- [x] 1.3 Run `npx vitest run src/components/wall/__tests__/gyroTilt.test.ts src/components/wall/__tests__/useGyroTilt.test.ts` and confirm the tests fail before implementation. *(Red: `Cannot find module '../gyroTilt'` / `'../useGyroTilt'`, 2 failed suites, 0 tests collected.)*

## 2. Pure Sensor Math & Capability-Gated Hook

- [x] 2.1 Implement `src/components/wall/gyroTilt.ts` (`DEFAULT_GYRO_MAX_DEG = 22`, `DEFAULT_GYRO_TAU_MS = 85`, `wrapAngleDelta`, `computeGyroTilt` with explicit `0°/90°/180°/270°` sign table, time-based `smoothTilt`) until `gyroTilt.test.ts` passes. *(19/19 green.)*
- [x] 2.2 Implement `src/components/wall/useGyroTilt.ts` (`GyroAdapter`, `createGyroController`, React `useGyroTilt` wrapper, `pointer: coarse` && `!prefers-reduced-motion` gating, `tier !== 'macro'` listener lifecycle, relative baseline reset on `tier`/`focusedPhotoId`/`screen.orientation` change, `null`/non-finite reading guard, rAF-throttled subscriber callback, and session-memoized `requestGyroPermission()`) until `useGyroTilt.test.ts` passes. *(19/19 green.)*

## 3. Gallery & FramedPrint Integration

- [x] 3.1 Wire `useGyroTilt` in `src/components/wall/GalleryCanvas.tsx` and pass subscriber + `requestGyroPermission` to `FramedPrint.tsx` without triggering React state re-renders per sensor frame. *(Canvas-level hook; `gyroSubscribe` + `requestGyroPermission` threaded through `AlbumTier`; emissions go through the imperative callback only — no `setState`.)*
- [x] 3.2 Update `src/components/wall/FramedPrint.tsx` (and `src/styles/wall.css` if transition tuning is needed) so `print` tier (`focused`) applies full `±4°` `rotateX`/`rotateY` + `--tilt-sx`/`--tilt-sy` + 2D `.photo-sheen`, `album` tier applies `30%` glare-only `.photo-sheen` (`0°` frame tilt), and tapping a print calls `requestGyroPermission()` synchronously on iOS. *(`@media (pointer: coarse)` drops the transform/box-shadow transitions so the frame and sheen track the wrist; desktop fine-pointer CSS is byte-identical.)*

## 4. Verification & Empirical Audit

- [x] 4.1 Run `npx tsc --noEmit && npx eslint . && npx vitest run && npm run build` and verify 100% pass. *(tsc exit 0; eslint exit 0; vitest 35 files / 520 tests passed; build ✓ Compiled successfully.)*
- [x] 4.2 Run Playwright fine-pointer desktop parity check confirming `0` diffs vs `main`, and verify `prefers-reduced-motion: reduce` disables sensor listeners. *(Orchestrator: 11 states at 1440×900 DPR 1 vs the change-1 baseline `0adbbb5`; pixelmatch 0 pixels in every state, computed styles identical apart from the reproduced `PrintSharpOverlay` settle jitter with 0 changed pixels. Probe: 0 `deviceorientation` listeners on a fine pointer and 0 under coarse + Reduce Motion; desktop sheen stays untouched. Evidence in `verification.md` §9.)*
- [x] 4.3 Record automated + Playwright evidence (and real iPhone Safari / Android Chrome HTTPS check results) in `openspec/changes/mobile-gyroscope-glare/verification.md`. *(Automated, Playwright and coarse synthetic-sensor evidence recorded in §5 and §9; real iPhone Safari / Android Chrome items are explicitly `PENDING MANUAL DEVICE VERIFICATION` with exact maintainer steps in §8 — not marked passed.)*
