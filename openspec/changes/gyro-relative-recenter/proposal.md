## Why

Print Focus tilt already uses an **entry baseline**. The problem is that each **Euler delta** subtracts the raw `beta`/`gamma` values. That breaks whenever the phone is held near the Euler singularities, and those poses are common.

- **Landscape at a natural 50–70°:** `gamma` crosses ±90°. The browser then reports the equivalent triple `(α+180, 180−β, γ+180)`, and today's maths turns a real 15° tilt into `dBeta = 80`, `dGamma = −165`. The frame and the glare slam into a corner. This was checked numerically; see research.md, Verified facts.
- **Portrait held upright:** at `β ≈ 90°`, small wrist movements produce large, noisy changes in `gamma`.

There's a second problem. A visitor who settles into a new grip ends up with a permanently offset tilt. The entry baseline is also often captured mid-gesture, while the tap and zoom are still under way. Then the glare never sits at its `65% 35%` rest.

## What Changes

- **True relative rotation:** `computeGyroTilt` measures the **relative rotation** `R_baseᵀ · R_cur`, built from `alpha`/`beta`/`gamma`, and reads two **device-frame tilt** angles from it. Those angles go through the existing screen-angle sign table, the ±22° clamp and the smoother.
  - Results are identical for single-axis motion away from the singularities.
  - Results stay continuous through **gimbal crossings**.
  - An in-plane twist gives no tilt.
- **`alpha` is read:**
  - `GyroReading` and `GyroSample` gain `alpha`, and the production adapter forwards `event.alpha`.
  - When either the baseline or the sample has no finite `alpha`, the tilt falls back to today's Euler delta. Forcing `alpha = 0` would be worse than the fallback (research.md).
- **Stillness recentre:**
  1. In Print Focus, if both device-frame tilt angles stay within 1.5° for 3 s, the controller **recentres**: the latest reading becomes the new entry baseline.
  2. The tilt then **glides** home with a 450 ms smoothing time constant, so it settles in about 1.3 s instead of the 85 ms tracking tau.
  3. Any movement outside the band restarts the 3 s window and cancels a glide in progress, so the hand always wins.
  4. One still period gives one recentre.
- **Timers and frames:** the recentre runs from an injected timer and the glide from rAF, so neither depends on `deviceorientation` firing while the phone is stationary.
- **Unchanged:**
  - tier and focus gating, orientation-change resets, the iOS permission flow, `MIN_EMIT_DELTA`;
  - all of `FramedPrint`, `PrintSharpOverlay` and the CSS;
  - desktop (`pointer: fine`) and reduced-motion behaviour.
- **Spec cleanup:** the stale Album-tier gyro wording (baseline capture in `album`, the 30% album sweep) is removed from the modified requirement. That aligns it with the print-only scope that is already specified.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `instanced-photo-renderer`:
  - **MODIFIED:** "Coarse-pointer gyroscope rotational glare and physical print-focus tilt". The baseline becomes a full orientation, the delta becomes a relative rotation with an Euler fallback when `alpha` is null, and the scope is Print Focus only.
  - **ADDED:** "Print Focus tilt auto-recentres after 3 seconds of stillness".

## Impact

- **Code:**
  - `src/components/wall/gyroTilt.ts`: relative-rotation maths and constants.
  - `src/components/wall/useGyroTilt.ts`: the reading shape, the stillness timer, glide state, and adapter timer methods.
  - Tests: `src/components/wall/__tests__/gyroTilt.test.ts` and `useGyroTilt.test.ts`. New cases are added, and the fake adapter gains timer methods.
- **No change:** `FramedPrint.tsx`, `PrintSharpOverlay.tsx`, `GalleryCanvas.tsx`, `wall.css`.
- **Dependencies:** none added.
- **Performance:** about 60 extra flops per rAF tick while in Print Focus, plus one timer. During a glide, rAF runs for about 1.3 s even without sensor events, then stops.
- **Verification:**
  - Unit tests cover synthetic poses, crossings and the stillness timeline.
  - The gate that matters is a real-device pass on iPhone and Android in landscape and upright portrait.
