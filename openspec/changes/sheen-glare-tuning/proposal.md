## Why

On phones the print glare sits dead centre over the photo: the `.photo-sheen` gradient is centred at `50% 50%`, and with Reduce Motion or no motion permission it never moves off it. It's also stronger than it needs to be on every device. The user wants the glare halved everywhere and, on mobile only, resting in the top-right corner so it stops covering the picture.

## What Changes

- **Glare intensity halved on every device.** The `.photo-sheen` gradient's alpha stops are scaled by a new `--sheen-strength` multiplier set to `0.5`. Rest opacity (`--sheen-intensity: 0.44`) and the inline `opacity: 0.92` hover/gyro writes are untouched, so the effective peak drops from ~`0.35` to ~`0.17` alpha with the same falloff shape.
- **Mobile resting position moves to the top-right.** The gradient position becomes `var(--sheen-anchor, 50% 50%)`. Under `@media (pointer: coarse)`, the focused print's sheen and the `PrintSharpOverlay` sheen set `--sheen-anchor: 65% 35%` (≈ `84%` across / `16%` down the photo). Gyro tilt keeps sweeping the glare relative to that anchor; the static no-gyro case also rests there.
- **Desktop position unchanged.** `(pointer: fine)` keeps the centred anchor and the mouse sweep. **BREAKING (visual baseline only):** desktop sheen pixels change by design, so the fine-pointer parity baseline is recaptured with the diff limited to `.photo-sheen`.
- No JS, gyro math, overlay scheduler, or dependency changes.

## Capabilities

### New Capabilities

- None.

### Modified Capabilities

- `instanced-photo-renderer`: ADDED requirements for halved glare intensity on all pointers, and a top-right resting anchor for the glare on coarse pointers (with the desktop byte-identical guarantee from `mobile-render-profile` explicitly narrowed to exclude `.photo-sheen` intensity).

## Impact

- `src/styles/wall.css`: the `.playground-wall-root` variable block (`L437`), the base `.photo-sheen` rule (`L1147-L1163`), and the existing `@media (pointer: coarse)` sheen rules (`L1193-L1199`).
- `src/lib/__tests__/`: a new static CSS audit for the two variables; `touchAudit.test.ts` stays green unchanged.
- Desktop fine-pointer parity baseline: recaptured; every non-sheen computed style and pixel must still match.
- iPhone and Android device pass for strength and anchor tuning.
