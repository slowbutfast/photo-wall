# Verification Plan: Mobile Gyroscope Rotational Glare

## Automated Tests

- `npx vitest run src/components/wall/__tests__/gyroTilt.test.ts`:
  - Verifies `computeGyroTilt(sample, baseline, 0)` returns `{ nx: 0, ny: 0 }` when `sample === baseline` (even at `beta = 50, gamma = -8`).
  - Verifies `±22°` clamp saturates cleanly at `±0.5` (`beta0 + 30 -> ny = +0.5`, `beta0 - 30 -> ny = -0.5`, `gamma0 + 30 -> nx = +0.5`, `gamma0 - 30 -> nx = -0.5`).
  - Verifies explicit sign vectors for all four `screenAngleDeg` values (`0°`, `90°`, `180°`, `270°`) so tilting screen-right down always yields `nx > 0` and tilting screen-top toward viewer always yields `ny < 0`:
    - `0°`: `(dGamma = +11, dBeta = -11)` → `{ nx: +0.25, ny: -0.25 }`
    - `90°`: `(dGamma = -11, dBeta = -11)` → `{ nx: +0.25, ny: -0.25 }` (`screenX = -dBeta`, `screenY = +dGamma`)
    - `180°`: `(dGamma = -11, dBeta = +11)` → `{ nx: +0.25, ny: -0.25 }` (`screenX = -dGamma`, `screenY = -dBeta`)
    - `270°`: `(dGamma = +11, dBeta = +11)` → `{ nx: +0.25, ny: -0.25 }` (`screenX = +dBeta`, `screenY = -dGamma`)
  - Verifies `180°` wraparound (`gamma` crossing `±180` or `beta` wrapping) produces continuous small deltas without jumps.
  - Verifies time-based `smoothTilt(prev, next, dtMs, tauMs)` converges monotonically, matches across `30Hz` (`dt = 33.3ms`) vs `120Hz` (`dt = 8.3ms`) over equal elapsed time, clamps large `dtMs` gaps (`> 100ms`), and bounds output to `[-0.5, 0.5]`.
- `npx vitest run src/components/wall/__tests__/useGyroTilt.test.ts`:
  - Tests `createGyroController` + `requestGyroPermission` via an injectable `GyroAdapter`:
    - Permission granted, permission denied, and rejected `requestPermission()` promise (memoized once per session, zero unhandled rejections).
    - Unsupported sensors (`DeviceOrientationEvent` missing) and non-iOS browsers (no `requestPermission` -> attaches directly).
    - Capability gating: `(pointer: fine)` and `prefers-reduced-motion: reduce` attach zero listeners.
    - Tier/focus lifecycle: `macro` detaches listeners and emits `{ nx: 0, ny: 0 }`; `album <-> print` and `focusedPhotoId` changes reset baseline; `destroy()` cleans up all listeners and pending rAF.
    - Live `screen.orientation` change while `album` or `print` stays active resets smoother to `{ nx: 0, ny: 0 }` and rebases `(beta0, gamma0)` on the next valid sample with zero jump.
    - Null or non-finite `beta`/`gamma` readings (`null`, `NaN`, `Infinity`) are ignored without corrupting baseline or smoother state.
- `npm run typecheck && npm run lint && npx vitest run && npm run build`:
  - Full typecheck, lint, Vitest suite, and production Next.js build pass with zero regressions.
- **Desktop Fine-Pointer Zero-Diff Check:**
  - Playwright (`1440×900`, default fine pointer) confirms `deviceorientation` is not attached and `0` computed-style / `pixelmatch` diffs vs `main`.

## Manual Verification (Real iPhone Safari & Android Chrome over HTTPS)

- **Print Focus Physical Tilt & Glare:**
  - **WHEN** tapping a print into Print Focus on iPhone Safari (accepting the native motion permission prompt) and tilting the phone forward/backward and left/right
  - **THEN** the focused frame tilts in 3D (`±4°`), its wall cast shadow shifts opposite the tilt, and the 2D radial glare sweeps smoothly across the glass (`PrintSharpOverlay` stays sharp and aligned).
- **Album View Glare-Only:**
  - **WHEN** returning to Album View and tilting the phone
  - **THEN** `.photo-sheen` sweeps gently at `30%` amplitude across the prints while frames and shadows stay stationary.
- **Landscape Orientation & Reduced Motion:**
  - **WHEN** rotating to landscape (`90°`/`270°`) and re-entering Print Focus, and when toggling OS "Reduce Motion"
  - **THEN** landscape axes align with the screen, and Reduce Motion disables gyroscope tilt/glare cleanly.
