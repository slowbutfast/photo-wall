# Tasks: Mobile Gyroscope Rotational Glare

## Target Context Map

| File (repo-relative) | Target Lines | Purpose |
| :--- | :--- | :--- |
| `src/components/wall/__tests__/gyroTilt.test.ts` | `[NEW]` | TDD unit tests for `computeGyroTilt`, `wrapAngleDelta`, `smoothTilt`, `0°/90°/180°/270°` screen orientation mapping, and `±22°` clamping. |
| `src/components/wall/gyroTilt.ts` | `[NEW]` | Pure sensor math (`computeGyroTilt`, `smoothTilt`, `DEFAULT_GYRO_MAX_DEG = 22`) — zero DOM, zero React. |
| `src/components/wall/useGyroTilt.ts` | `[NEW]` | Capability-gated (`pointer: coarse` && `!prefers-reduced-motion`) `DeviceOrientationEvent` hook with relative-to-entry baseline capture, rAF-throttled subscription, and session-memoized iOS `requestPermission()` helper. |
| `src/components/wall/GalleryCanvas.tsx` | `L740-L855` | Wire `useGyroTilt` (`tier`, `focusedPhotoId`) and pass `gyroSubscription` / `requestGyroPermission` to `AlbumTier` → `FramedPrint` without 60Hz React re-renders. |
| `src/components/wall/FramedPrint.tsx` | `L53-L105` | Subscribe focused/album prints imperatively to smoothed `(nx, ny)` (full tilt + shadow + glare on focused print in `print` tier; `30%` glare-only `.photo-sheen` in `album` tier) and call `requestGyroPermission()` synchronously in `onClick` when entering Print Focus on iOS. |
| `src/styles/wall.css` | `L955-L985`, `L1109-L1126` | Ensure smooth, jitter-free `.photo-frame.focused` and `.photo-sheen` updates under continuous gyroscope input. |

---

## 1. Test Scaffolding (TDD)

- [ ] 1.0 Confirm `mobile-touch-compatibility` is merged into `main`, then branch `feat/mobile-gyroscope-glare` from `main`.
- [ ] 1.1 Write failing `src/components/wall/__tests__/gyroTilt.test.ts` covering neutral relative baseline (`beta0 = 50, gamma0 = -8` → `{ nx: 0, ny: 0 }`), `±22°` clamp (`±0.5`), `0°/90°/180°/270°` screen-orientation rotation, `180°` wraparound, and `smoothTilt`.
- [ ] 1.2 Run `npx vitest run src/components/wall/__tests__/gyroTilt.test.ts` and confirm the tests fail before implementation.

## 2. Pure Sensor Math & Capability-Gated Hook

- [ ] 2.1 Implement `src/components/wall/gyroTilt.ts` (`DEFAULT_GYRO_MAX_DEG = 22`, `wrapAngleDelta`, `computeGyroTilt`, `smoothTilt`) until `gyroTilt.test.ts` passes.
- [ ] 2.2 Implement `src/components/wall/useGyroTilt.ts` (`pointer: coarse` && `!prefers-reduced-motion` gating, `tier !== 'macro'` listener lifecycle, relative baseline reset on `tier`/`focusedPhotoId` change, rAF-throttled subscriber callback, and session-memoized `requestGyroPermission()`).

## 3. Gallery & FramedPrint Integration

- [ ] 3.1 Wire `useGyroTilt` in `src/components/wall/GalleryCanvas.tsx` and pass subscriber + `requestGyroPermission` to `FramedPrint.tsx` without triggering React state re-renders per sensor frame.
- [ ] 3.2 Update `src/components/wall/FramedPrint.tsx` (and `src/styles/wall.css` if transition tuning is needed) so `print` tier (`focused`) applies full `±4°` `rotateX`/`rotateY` + `--tilt-sx`/`--tilt-sy` + 2D `.photo-sheen`, `album` tier applies `30%` glare-only `.photo-sheen` (`0°` frame tilt), and tapping a print calls `requestGyroPermission()` synchronously on iOS.

## 4. Verification & Empirical Audit

- [ ] 4.1 Run `npx tsc --noEmit && npx eslint . && npx vitest run && npm run build` and verify 100% pass.
- [ ] 4.2 Run Playwright fine-pointer desktop parity check confirming `0` diffs vs `main`, and verify `prefers-reduced-motion: reduce` disables sensor listeners.
- [ ] 4.3 Record automated + Playwright evidence (and real iPhone Safari / Android Chrome HTTPS check results) in `openspec/changes/mobile-gyroscope-glare/verification.md`.
