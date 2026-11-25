# Proposal: Mobile Gyroscope Rotational Glare

## Why

On desktop, hovering over a print tilts the physical frame in 3D, shifts its wall cast shadow, and sweeps a 2D specular reflection across the glass. On mobile touchscreens (where hover is absent and disabled by `mobile-touch-compatibility`), prints sit static. Using the device's gyroscope (`DeviceOrientationEvent`) lets mobile visitors tilt their phone forward/backward and left/right to sweep light across glazed prints in Album View and physically handle the focused photograph — tilt, cast shadow, and 2D glare — in Print Focus.

## What Changes

- **Pure Gyroscope Math & Calibration (`src/components/wall/gyroTilt.ts`):**
  - Relative-to-entry baseline calibration (`(beta0, gamma0)` captured on focus entry so any comfortable hand-holding angle is neutral `0, 0`).
  - Wrap-safe angular delta + `screen.orientation.angle` (`0° / 90° / 180° / 270°`) axis mapping + `±22°` clamp → normalized `(nx, ny)` in `[-0.5, +0.5]` + low-pass smoothing (`alpha = 0.18`).
- **Capability-Gated Sensor Hook (`src/components/wall/useGyroTilt.ts`):**
  - Active **only** on `(pointer: coarse)` devices when `tier !== 'macro'` and `prefers-reduced-motion` is not `reduce` (desktop fine-pointer browsers stay 100% untouched).
  - Requests `DeviceOrientationEvent.requestPermission()` inside the user's tap into Print Focus on iOS 13+ (once per session), falling back silently if denied or unsupported.
- **Tiered Visual Behavior (`GalleryCanvas.tsx`, `FramedPrint.tsx`, `src/styles/wall.css`):**
  - **Macro tier (`scale < 0.25`):** Off.
  - **Album tier (`album`):** Subtle glare-only `.photo-sheen` sweep (`~30%` amplitude, zero 3D frame tilt or shadow shift).
  - **Print Focus (`print`):** Full physical handling on the `focused` frame (`±4°` `rotateX`/`rotateY` + `translateZ(58px)`, dynamic `--tilt-sx`/`--tilt-sy` wall shadow, and full 2D `.photo-sheen` specular sweep — automatically mirrored at full sharpness by `PrintSharpOverlay`).

## Capabilities

### New Capabilities

- (None — extends `instanced-photo-renderer`.)

### Modified Capabilities

- `instanced-photo-renderer`: ADDED requirement for mobile gyroscope rotational glare in Album View (glare-only `~30%` sweep) and full physical tilt/shadow/glare on the focused print in Print Focus (`prefers-reduced-motion` respected, desktop untouched).

## Impact

- **Sequencing:** Designed to land **after** `mobile-touch-compatibility` merges to `main`.
- **Wall Components & Math:** `src/components/wall/gyroTilt.ts` (`[NEW]`), `src/components/wall/useGyroTilt.ts` (`[NEW]`), `src/components/wall/GalleryCanvas.tsx`, `src/components/wall/FramedPrint.tsx`, `src/styles/wall.css`.
- **Tests:** `src/components/wall/__tests__/gyroTilt.test.ts` (`[NEW]`) + desktop zero-diff check + real-device iPhone Safari / Android Chrome verification.
- **Dependencies / DB / APIs:** Zero new npm packages, zero DB changes, zero API changes.
