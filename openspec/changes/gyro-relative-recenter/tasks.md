## Target Context Map

| File | Lines (on `main` @ `a912ae5`) | Change |
| :--- | :--- | :--- |
| `src/components/wall/gyroTilt.ts` | `L18-L37` (constants, `TiltVector`, `GyroSample`) | Add `RECENTER_STILL_MS`, `RECENTER_STILL_BAND_DEG`, `RECENTER_GLIDE_TAU_MS`, `GLIDE_SETTLE_EPS`; `GyroSample.alpha?: number \| null`; new `DeviceTilt` type |
| `src/components/wall/gyroTilt.ts` | `L63-L105` (`computeGyroTilt`) | Split into `relativeDeviceTilt` (matrix path when both `alpha` finite, else today's Euler delta) + `screenTiltFromDevice` (existing sign table, clamp, `/44`); `computeGyroTilt` composes them with the same signature (D1, D2) |
| `src/components/wall/gyroTilt.ts` | `[NEW]` after `L105` | `orientationMatrix(alpha, beta, gamma)` (Rz·Rx·Ry), internal 3×3 helpers |
| `src/components/wall/useGyroTilt.ts` | `L47-L51` (`GyroReading`) | Add `alpha?: number \| null` (D5) |
| `src/components/wall/useGyroTilt.ts` | `L58-L72` (`GyroAdapter`) | Add `setTimer(cb, ms)` / `clearTimer(handle)` (D3) |
| `src/components/wall/useGyroTilt.ts` | `L98-L246` (`createGyroController` state, `reset`, `tick`, `handleReading`, `detach`, `destroy`) | `lastReading`, `stillAnchor`, `stillTimer`, `gliding`; stillness check + timer arm in `tick`; recentre callback; glide tau + rAF continuation + settle emit; cancellation in `reset`/`detach`/`destroy`; copy finite `alpha` in `handleReading` (D3) |
| `src/components/wall/useGyroTilt.ts` | `L298-L334` (`createDefaultGyroAdapter`) | Forward `event.alpha`; implement `setTimer`/`clearTimer` with `window.setTimeout`/`clearTimeout` |
| `src/components/wall/__tests__/gyroTilt.test.ts` | append | New maths cases (see `tests.md`) |
| `src/components/wall/__tests__/useGyroTilt.test.ts` | fake adapter (`L38-L104`) + append | Fake gains manual timer queue (`setTimer`/`clearTimer`/`advanceTimers`); new controller cases |
| `openspec/specs/instanced-photo-renderer/spec.md` | `L44-L66` + append | Sync at PR time: replace the gyroscope requirement with the MODIFIED block; append the ADDED recentre requirement |

Out of bounds: `FramedPrint.tsx`, `PrintSharpOverlay.tsx`, `GalleryCanvas.tsx`, `src/styles/wall.css`, any existing test assertion. The only permitted edit to existing test code is adding the timer methods to the fake adapter.

## 1. Test Scaffolding (TDD)

- [x] 1.1 In `gyroTilt.test.ts`, write failing tests for "Coarse-pointer gyroscope rotational glare and physical print-focus tilt" (MODIFIED):
  - single-axis equivalence between the matrix and Euler paths at all four screen angles;
  - gimbal-crossing continuity, `(0,50,80)` → `(180,130,−85)`;
  - equivalent-triple invariance;
  - upright-portrait (`β = 89`) rotation about x;
  - in-plane twist gives zero;
  - null-`alpha` fallback is bit-identical;
  - clamp and `noNegativeZero` on the matrix path.
- [x] 1.2 In `useGyroTilt.test.ts`:
  - extend the fake adapter with a manual timer queue;
  - write failing controller tests for `alpha` forwarding and acceptance of `alpha: null`.
- [x] 1.3 In `useGyroTilt.test.ts`, write failing tests for "Print Focus tilt auto-recentres after 3 seconds of stillness":
  - recentre and glide timeline (monotonic, about 37% at 450 ms, exact settle emit, no snap);
  - motion prevents recentre;
  - the glide completes without events and frames stop;
  - an interrupted glide returns to the tracking tau and re-arms;
  - one recentre per still period;
  - context, orientation and destroy cancellation;
  - a never-streaming device arms no timer;
  - the band is measured in unclamped degrees.
- [x] 1.4 Run both files with `npx vitest run src/components/wall/__tests__/gyroTilt.test.ts src/components/wall/__tests__/useGyroTilt.test.ts`. Confirm the new cases fail for the expected reasons (missing exports and behaviour) and the existing cases still pass. Record the output.

## 2. Relative rotation maths (`gyroTilt.ts`)

- [x] 2.1 Add `GyroSample.alpha`, `DeviceTilt` and the four recentre constants (D4).
- [x] 2.2 Implement `orientationMatrix` and `relativeDeviceTilt`:
  - matrix path only when both `alpha`s are finite;
  - Euler path otherwise, using `wrapAngleDelta` (D1, D2).
- [x] 2.3 Extract `screenTiltFromDevice` from the existing `switch`, with `aboutY` in the `dGamma` role and `aboutX` in the `dBeta` role. Re-express `computeGyroTilt` as their composition.
- [x] 2.4 Make 1.1 pass, with all pre-existing `gyroTilt.test.ts` cases still green unchanged.

## 3. Controller: `alpha` plumbing and stillness recentre (`useGyroTilt.ts`)

- [x] 3.1 Add `GyroReading.alpha`. `handleReading` copies a finite `alpha` and otherwise stores `null`. The production adapter forwards `event.alpha` (D5).
- [x] 3.2 Add `setTimer`/`clearTimer` to `GyroAdapter` and to `createDefaultGyroAdapter` (D3).
- [x] 3.3 Add the controller state: `lastReading`, `stillAnchor`, `stillTimer`, `gliding`. Clear all of it in `reset()`, and clear the timer in `detach()` and `destroy()`.
- [x] 3.4 In `tick`:
  1. compute `relativeDeviceTilt`;
  2. run the unclamped stillness band check and re-arm the timer before smoothing;
  3. smooth with `gliding ? RECENTER_GLIDE_TAU_MS : DEFAULT_GYRO_TAU_MS`;
  4. on settle, emit the exact target and leave glide;
  5. otherwise continue the glide frame with `lastReading`.
- [x] 3.5 Implement the recentre callback. Guard it on `disposed`, `listening` and `lastReading`. It rebases to `lastReading` and sets `stillAnchor = {0,0}`. It does not re-arm the timer, does not touch `current`/`lastEmitted`, and requests a frame.
- [x] 3.6 Make 1.2 and 1.3 pass, with all pre-existing `useGyroTilt.test.ts` cases green. Confirm `printSharpOverlaySync.test.ts`, `touchAudit.test.ts` and `sheenGlareAudit.test.ts` are green unchanged.

## 4. Verification & Empirical Audit

- [x] 4.1 Run the full gates and record the pass counts against the baseline:
  - `npx vitest run` (serialized full suite);
  - `npx tsc --noEmit`;
  - `npx eslint .`;
  - `npm run build`.
- [x] 4.2 Run the desktop parity harness (idle, print, hovered print) against the pre-change build and expect 0 px. Desktop is untouched by construction, so treat any difference as a defect. **PASS — `parity/desktop-parity.mjs` against `a912ae5` and head: 0 differing pixels / 0 computed-style diffs in all three states (`parity/report.json`).**
- [ ] 4.3 Run the `tests.md` manual device checks on a real iPhone (Safari) and a real Android phone (Chrome):
  - log `alpha` availability and event cadence;
  - landscape, upright portrait, recentre feel, active viewing, interruption, and regression.

  Mark any check that couldn't run as `PENDING MANUAL DEVICE VERIFICATION` and don't claim it passed.

  **PENDING MANUAL DEVICE VERIFICATION — no real devices were available in this session; every row is pending and none is claimed as passed.**
- [ ] 4.4 Resolve or carry forward every `research.md` Unverified assumption (`alpha` non-null, event cadence, the 1.5° band against hand sway, the 450 ms feel, the sign convention). Move anything disproved to Superseded claims. **CARRIED — all five assumptions carried forward to the device pass and marked `PENDING MANUAL DEVICE VERIFICATION`; none was disproved by automated work.**
- [x] 4.5 Populate `verification.md`:
  - a Requirement Adherence Matrix covering every scenario in `specs/instanced-photo-renderer/spec.md`;
  - the parity result;
  - device and OS versions;
  - resolved assumptions;
  - a nomenclature audit (entry baseline, Euler delta, relative rotation, device-frame tilt, stillness, recentre, glide, tracking tau);
  - verbatim logs.
