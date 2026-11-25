# Verification Plan: Mobile Gyroscope Rotational Glare

## Automated Tests

- `npx vitest run src/components/wall/__tests__/gyroTilt.test.ts`:
  - Verifies `computeGyroTilt(sample, baseline, 0)` returns `{ nx: 0, ny: 0 }` when `sample === baseline` (even at `beta = 50, gamma = -8`).
  - Verifies `±22°` clamp saturates cleanly at `±0.5` (`beta0 + 30 -> ny = -0.5` or `+0.5` consistently, `gamma0 + 30 -> nx = +0.5`).
  - Verifies `screenAngleDeg = 90` and `270` rotate `(dGamma, dBeta)` axes accurately for landscape orientation.
  - Verifies `180°` wraparound (`gamma` crossing `±180` or `beta` wrapping) produces continuous small deltas without jumps.
  - Verifies `smoothTilt(prev, next, alpha)` converges monotonically and bounds output to `[-0.5, 0.5]`.
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
