## Source material

**Maintainer, 2026-11-26 (verbatim):**

> Can you now propose a new feature where instead of having the tilt of the photo absolute to a certain position, it's relative to when the user first focuses into the photo view, and then the tilt is relative around that, so that if the user's holding their phone sideways, that the tilt feature isn't messed up. And then also too, can we make it so that after 3 seconds, it auto resets the tilt position as well?

**Two decisions taken in the follow-up proposal discussion, maintainer, 2026-11-26 (verbatim):**

> both decisions sound good to me. ff the artifacts

The two proposals that reply accepted:

1. **Recentre trigger:** the recentre fires after 3 s of the phone being held still. It does not fire 3 s after entering focus regardless of motion, and it does not repeat every 3 s.
2. **Glide feel:** after a recentre, the tilt eases home over about 1.3 s, using a recentre time constant of about 450 ms. It does not snap back over about 0.5 s.

### Raised but not acted on

- **"Absolute to a certain position":** the maintainer described today's tilt as absolute. Reading the code shows it is already relative to the first sample after entering Print Focus (see Verified facts). The real defect is how the relative delta is computed, which is Euler-angle subtraction. So this change replaces the delta maths rather than adding a baseline. The baseline already exists.
- **A literal fixed-period reset**, either 3 s after entry or every 3 s: rejected in the proposal discussion. It would pull the glare back while the visitor is deliberately tilting to look at it.
- **A leaky or high-pass baseline** that always drifts toward the current pose: considered and rejected. It fights a held tilt all the time instead of resetting once after a real pause, and it doesn't match "after 3 seconds".
- **Desktop mouse hover:** out of scope, because there is no sensor and no baseline.
- **Album View gyro:** stays off. `mobile-render-profile` already scoped the gyro to Print Focus only.

## Glossary

| Term | Means | Does NOT mean |
| :--- | :--- | :--- |
| **Entry baseline** | The device orientation captured from the first valid reading after entering Print Focus, or after any reset or recentre. All tilt is measured relative to it. | A fixed "flat phone" or Earth-vertical reference. It also isn't the `65% 35%` sheen anchor. |
| **Euler delta** | Today's maths: `wrapAngleDelta(beta − beta0)` and `wrapAngleDelta(gamma − gamma0)`. | A true relative rotation. It is only correct well away from `gamma = ±90°` and `beta = ±90°`. |
| **Relative rotation** | `R_rel = R_baseᵀ · R_cur`, where each `R = Rz(α)·Rx(β)·Ry(γ)` (W3C intrinsic Z‑X′‑Y″). It is the current device frame expressed in the baseline device frame. | A difference of angles. |
| **Device-frame tilt** | Two unclamped angles in degrees, read from `R_rel · (0,0,1)`: `aboutY = atan2(v.x, v.z)` and `aboutX = atan2(−v.y, v.z)`. They play the roles `dGamma` and `dBeta` played before. | Screen-space `nx`/`ny`. Those come after the screen-angle sign table and the ±22° clamp. |
| **Gimbal crossing** | The browser switching to the equivalent Euler triple `(α+180, 180−β, γ+180)` when `γ` leaves `[−90, 90)`. It is the same physical pose with different numbers. | Real device motion. |
| **Stillness** | For a continuous `RECENTER_STILL_MS = 3000`, both device-frame tilt angles stay within `RECENTER_STILL_BAND_DEG = 1.5°` of where they were at the start of the window. | Zero tilt. A phone held still at a 15° offset is "still". |
| **Recentre** | Replacing the entry baseline with the latest reading after stillness, then easing the tilt home. | A full `reset()`. A recentre doesn't zero the smoother instantly, doesn't announce `{0,0}`, and doesn't detach anything. |
| **Glide** | The ease home after a recentre. `smoothTilt` runs with `RECENTER_GLIDE_TAU_MS = 450` until the tilt settles, and frames are driven by rAF even if no sensor events arrive. | A CSS transition. All writes stay imperative through `onTilt`. |
| **Tracking tau** | The existing `DEFAULT_GYRO_TAU_MS = 85` used while following the hand. | The glide tau. |

## External research

| Source | What it establishes | Licence | Accessed |
| :--- | :--- | :--- | :--- |
| W3C DeviceOrientation Event Specification, Candidate Recommendation Draft dated 18 Nov 2026, https://www.w3.org/TR/orientation-event/ | **§3.1:** `alpha ∈ [0, 360)`, `beta ∈ [-180, 180)`, `gamma ∈ [-90, 90)`; "intrinsic Tait-Bryan angles of type Z - X' - Y''", right-hand convention. **§6.1:** `alpha` is `double?`, which is "null if the implementation cannot provide an angle value". **§3.1.1:** for `deviceorientation`, the reference frame is "arbitrary" (relative). **§6.1:** events fire on a "significant change in orientation", with a recommended "maximum threshold for change of 1 degree", and aren't dispatched while the document isn't visible. | W3C document licence, used for reference only, no code copied | 2026-11-26 (the fetch was truncated mid-§6.1; Appendix A matrices were not read verbatim) |

## Candidate tech

| Option | Decision | Reason | Date |
| :--- | :--- | :--- | :--- |
| Rotation matrices built from `alpha`/`beta`/`gamma` in plain TS, inside `gyroTilt.ts` | **Adopted** | About 60 flops per tick. Pure, so unit-testable with synthetic poses. No dependency. It doesn't care which equivalent Euler triple the browser reports. | 2026-11-26 |
| Quaternions | Rejected | The same result with more code. We only need one rotated vector, not interpolation. | 2026-11-26 |
| `devicemotion` `accelerationIncludingGravity` (gravity-vector tilt) | Rejected | Noisy under hand acceleration. Blind to rotation about the vertical axis, which matters for a phone held upright. A second iOS permission path (`DeviceMotionEvent.requestPermission`). | 2026-11-26 |
| Generic Sensor API `RelativeOrientationSensor` (quaternion) | Rejected | Not available in Safari, which is the primary target device. | 2026-11-26 |
| `gl-matrix` / any math package | Rejected | One 3×3 product doesn't justify a dependency. | 2026-11-26 |

## Patterns adopted

- **Relative rotation from a reference pose** (`R_refᵀ · R`) is the standard technique in head-tracking and AR "recentre view" features. It's a general pattern, implemented from first principles in `gyroTilt.ts`, with no code taken from anywhere.
- **Stillness-gated recentre** is the same idea as VR "auto-recentre when the headset is at rest". Here it uses an injectable timer, so tests stay deterministic.

## Verified facts

| Claim | Value | How verified | Date | Volatility |
| :--- | :--- | :--- | :--- | :--- |
| The tilt is already relative to an entry baseline | The first finite reading after `reset()` becomes `baseline` (`useGyroTilt.ts:167`, `if (baseline === null) baseline = reading;`). | Read `src/components/wall/useGyroTilt.ts` at `a912ae5` | 2026-11-26 | stable until this change |
| Today's delta is Euler subtraction | `dBeta = wrapAngleDelta(sample.beta - baseline.beta)` and `dGamma = wrapAngleDelta(sample.gamma - baseline.gamma)` (`gyroTilt.ts:75-76`). | Read `src/components/wall/gyroTilt.ts` | 2026-11-26 | stable until this change |
| `alpha` is never read today | `GyroReading` is `{ beta, gamma }` (`useGyroTilt.ts:48-51`). The adapter forwards only `event.beta`/`event.gamma` (`useGyroTilt.ts:305-307`). | Read the source | 2026-11-26 | stable until this change |
| Euler subtraction breaks at a gimbal crossing | Baseline `(0, 50, 80)` followed by a physical +15° about device y. The browser must report the equivalent `(180, 130, −85)`. Euler deltas come out as `dBeta = 80` and `dGamma = −165`, so both clamp and the glare slams to a corner. Matrix tilt gives `aboutY = 15.000`, `aboutX ≈ 0`. | Numerical check, `node` script `euler-check.js` in the session scratchpad | 2026-11-26 | stable (maths) |
| The equivalent Euler triple gives the same matrix | `max |R(30,40,70) − R(210,140,250)| = 5e-16` | Same script | 2026-11-26 | stable |
| Matrix tilt equals the old Euler delta for single-axis motion | Pure β +10° from `(0,45,0)` gives `aboutX = 10`, `aboutY = 0`. Pure γ +10° at β 45° gives `aboutY = 10`, `aboutX = 0`. | Same script | 2026-11-26 | stable |
| An in-plane twist gives no tilt | `R_cur = R_base · Rz(25°)` gives `aboutX`, `aboutY` ≈ 1e-15 | Same script | 2026-11-26 | stable |
| Forcing `alpha = 0` on the matrix path is **worse** than the Euler path at a crossing | The same crossing with `alpha` forced to 0 gives `aboutY ≈ −169`, `aboutX ≈ 175` | Same script | 2026-11-26 | stable |
| Existing pipeline tests feed readings with no `alpha` | Every `GyroReading` literal in `useGyroTilt.test.ts` is `{ beta, gamma }` | Read `src/components/wall/__tests__/useGyroTilt.test.ts` | 2026-11-26 | decays with test edits |
| The spec doesn't guarantee events while stationary | Firing is on "significant change" (≤ 1° threshold recommended) | W3C §6.1, fetched | 2026-11-26 | stable |
| Gyro writes are imperative and one-way | `FramedPrint` maps `{nx, ny}` to `rotateY(nx·8)`/`rotateX(−ny·8)`, `--tilt-sx/sy` and sheen `translate3d(−nx·38%, −ny·38%)`. `PrintSharpOverlay` wakes on each emit. | Read `FramedPrint.tsx:93-158` and `PrintSharpOverlay.tsx:200` | 2026-11-26 | stable |
| The main spec still describes Album-tier gyro | `instanced-photo-renderer` "Coarse-pointer gyroscope…" mentions `album` baseline capture and a 30% album sweep. The later "Coarse-pointer mobile render profile" requirement says print-only. | Read `openspec/specs/instanced-photo-renderer/spec.md:44-66, 99` | 2026-11-26 | fixed by this change's MODIFIED block |

## Unverified assumptions

- **iOS Safari and Android Chrome report non-null `alpha` on `deviceorientation`.** Without it we fall back to the Euler path, which keeps today's behaviour. To check: log `event.alpha` on both devices during the device pass.
- **`deviceorientation` keeps firing on a phone held in the hand.** The `MIN_EMIT_DELTA` comment says it does, at 60 Hz, but the W3C spec doesn't promise it. The design doesn't depend on this: the recentre uses a timer, and the glide uses rAF. To check: log event timestamps on the device.
- **1.5° is above natural hand sway over 3 s.** If a typical hold drifts by more than 1.5°, the recentre would rarely fire. To check: on the device, log the device-frame tilt range over 3 s holds and tune `RECENTER_STILL_BAND_DEG`.
- **A 450 ms glide tau reads as a calm settle and isn't laggy.** This is subjective and needs a device pass.
- **Both devices report the spec's Z‑X′‑Y″ convention with the spec's signs.** The single-axis equivalence keeps the existing sign table valid as long as β and γ keep their current meanings. The device pass confirms the direction of the glare's motion.

## Superseded claims

- **"Tilt is absolute to a certain position"** (the maintainer's framing, 2026-11-26). The code already uses a relative-to-entry baseline. What actually breaks sideways holds is Euler-angle subtraction near `γ = ±90°` (landscape) and `β = ±90°` (upright portrait). That's replaced here by a true relative rotation.

## Links out

- `openspec/specs/instanced-photo-renderer/spec.md`: "Coarse-pointer gyroscope rotational glare and physical print-focus tilt" and "Coarse-pointer mobile render profile…".
- `openspec/changes/archive/2026-11-26-sheen-glare-tuning/`: the sheen anchor this tilt returns to.
- `src/components/wall/gyroTilt.ts`, `src/components/wall/useGyroTilt.ts`.
