# Verification — gyro-relative-recenter

## 1. Executive Summary & Environment

**Status:** Automated implementation, desktop parity and PATCH-01 complete. Every automated gate passes (78/78 narrow, 610/610 full suite, 0 px desktop parity, `tsc`, `eslint`, `next build`, `openspec validate --strict`). PATCH-01 suppresses the synthetic settle emit on a phone that never emitted. The maintainer has visually verified the change on Safari on an iPhone 16 Pro (§4). Android Chrome and the instrumented device rows (`alpha` availability, event cadence) remain `PENDING MANUAL DEVICE VERIFICATION`.

**What shipped:** two source files in the gyro slice.

- `src/components/wall/gyroTilt.ts`: relative rotation (`R_rel = R_baseᵀ · R_cur`) from `orientationMatrix`, split into `relativeDeviceTilt` + `screenTiltFromDevice`, with the Euler-delta fallback; the four recentre constants.
- `src/components/wall/useGyroTilt.ts`: `alpha` plumbing, adapter timers, stillness window, recentre and rAF-driven glide.

No data, schema or storage touched, so data preservation is not applicable. Desktop, reduced-motion, tier gating, the permission flow and every `onTilt` write path are unchanged.

| Item | Value |
| :--- | :--- |
| Date | 2026-11-26 |
| OS | Linux 5.15.0-1081-oracle, `linux-arm64` |
| Node | `v22.23.2` |
| Vitest | `5.1.1` |
| Next.js | `16.4.6` |
| TypeScript | `5.9.3` |
| Worktree commit | Implementation `fb70dc1` on `feat/gyro-relative-recenter`, based on `origin/main` `a912ae5`; PATCH-01 applied on top; planning docs `04b4a99` |
| Runner config | `vitest.config.ts` already sets `fileParallelism: false`, `maxWorkers: 1`, `environment: 'node'` |
| Test environment vars (from config) | `DATABASE_URL=file::memory:`, `STORAGE_DRIVER=local`, `LOCAL_UPLOAD_DIR=./data/test-uploads` |

## 2. Requirement Adherence Audit Matrix

Source: `openspec/changes/gyro-relative-recenter/specs/instanced-photo-renderer/spec.md`.

Status legend: **PASS** = automated test passed in this run; **PASS (audit)** = no code on that path changed and the pre-existing test that pins it still passes; **PENDING MANUAL DEVICE VERIFICATION** = needs a real phone.

### 2.1 MODIFIED — "Coarse-pointer gyroscope rotational glare and physical print-focus tilt"

| # | Scenario | Verifying test(s) | Status |
| :--- | :--- | :--- | :--- |
| M1 | Print Focus physically tilts frame, shadow and glare with phone orientation | `useGyroTilt.test.ts` › `tilt pipeline` › "emits wrapped, clamped and smoothed screen-space tilt"; `printSharpOverlaySync.test.ts`; `sheenGlareAudit.test.ts`. `FramedPrint.tsx` / `PrintSharpOverlay.tsx` are outside the change. | PASS (audit) |
| M2 | Single-axis tilt matches the previous Euler-delta mapping | `gyroTilt.test.ts` › `relativeDeviceTilt` › "matches the Euler delta for single-axis motion at screen angle 0°/90°/180°/270°"; › "reads a pure +10° beta rotation from (0,45,0)…"; › "reads a pure +10° gamma rotation…" | PASS |
| M3 | Landscape hold through a gimbal crossing stays continuous | `gyroTilt.test.ts` › `relativeDeviceTilt` › "stays continuous through the (0,50,80) → (180,130,-85) gimbal crossing"; › `computeGyroTilt relative-rotation path` › "lands the gimbal-crossing tilt off the clamp…" (the Euler path saturates to ±0.5 in the same test) | PASS (maths); landscape *feel* PENDING MANUAL DEVICE VERIFICATION |
| M4 | Equivalent Euler triples produce identical tilt | `gyroTilt.test.ts` › `relativeDeviceTilt` › "gives the same relative rotation for the equivalent Euler triple" (2 samples × 3 baselines) | PASS |
| M5 | In-plane twist does not register as tilt | `gyroTilt.test.ts` › `relativeDeviceTilt` › "does not register an in-plane twist about the screen normal as tilt" (`θ ∈ {±30°, ±90°}`) | PASS |
| M6 | Missing `alpha` falls back to Euler deltas without dropping the reading | `gyroTilt.test.ts` › `missing alpha` › "falls back to the Euler delta bit-identically when either side has no alpha"; › "treats a null alpha alone as a valid reading…". `useGyroTilt.test.ts` › `alpha reading plumbing` › "accepts a reading with alpha: null…"; › "falls back to the Euler delta for a mixed pair with alpha on one side only" | PASS |
| M7 | Screen-orientation change rebases baseline without jumping | `useGyroTilt.test.ts` › `live screen-orientation change` › "resets the smoother, emits zero, and rebases on the next sample"; › "rebases even if the orientation event never arrives"; › `stillness recentre and glide` › "cancels the pending stillness timer when rotating the screen" | PASS |
| M8 | Reduced motion and desktop fine-pointer stay unaffected | `useGyroTilt.test.ts` › `capability gating` › "attaches zero listeners on a (pointer: fine) desktop browser"; › "attaches zero listeners under prefers-reduced-motion: reduce" | PASS (audit) |

### 2.2 ADDED — "Print Focus tilt auto-recentres after 3 seconds of stillness"

| # | Scenario | Verifying test(s) | Status |
| :--- | :--- | :--- | :--- |
| A9 | Holding still at an offset glides the print back to rest | `useGyroTilt.test.ts` › `stillness recentre and glide` › "recentres after 3000 ms of stillness and glides the print home" (monotonic, ≈37% at ≈450 ms, exact settle emit, no snap, baseline rebased afterwards) | PASS (maths/timeline); *feel* PENDING MANUAL DEVICE VERIFICATION |
| A10 | Continuous motion never recentres | › "never recentres while the hand keeps breaking the 1.5° band" (5 × 2 s windows; timer restarts, no rAF loop) | PASS |
| A11 | Glide completes without further sensor events | › "completes the glide without further sensor events and then stops requesting frames" | PASS |
| A12 | Moving during a glide hands control straight back to the hand | › "hands control straight back to the hand when a reading breaks the band mid-glide" (compares against `smoothTilt(..., DEFAULT_GYRO_TAU_MS)` and asserts the timer re-arms) | PASS |
| A13 | A still period recentres only once | › "recentres once per still period and only re-arms after the band is broken" (9000 ms inside the band → timer stays disarmed; band break + 3000 ms → second recentre glides) | PASS |
| A14 | Context changes cancel pending recentres | › "cancels the pending stillness timer when leaving Print Focus / focusing another photo / rotating the screen / destroy()"; › "stops an in-flight glide when the visitor leaves Print Focus" | PASS |
| A15 | Devices that never stream a reading never arm the timer | › "arms no stillness timer when no reading ever arrives" | PASS |

### 2.3 Requirement clauses without their own scenario

| Clause | Verifying test(s) | Status |
| :--- | :--- | :--- |
| Entry baseline = first finite reading after Print Focus; cleared on tier/focus/orientation change | `useGyroTilt.test.ts` › `tilt pipeline` › "captures the first valid sample as the relative baseline"; › `tier and focus lifecycle` (all six cases) | PASS |
| `R = Rz(alpha)·Rx(beta)·Ry(gamma)`, `v = R_rel·(0,0,1)`, `aboutY = atan2(v.x, v.z)`, `aboutX = atan2(−v.y, v.z)` | `gyroTilt.test.ts` › `orientationMatrix` › "builds Rz(alpha)·Rx(beta)·Ry(gamma)…"; › `relativeDeviceTilt` (pure-axis and upright cases); independent numeric pre-check matched to `2e-16` | PASS |
| Sign table, `±22°` clamp, `[-0.5, +0.5]`, `noNegativeZero` | `gyroTilt.test.ts` › `screenTiltFromDevice` › "clamps device-frame tilt to ±0.5 and collapses -0"; pre-existing `computeGyroTilt` sign/clamp tests | PASS |
| Stillness measured on **unclamped** degrees | › "treats a pose held beyond the ±22° clamp as still and recentres"; › "treats a saturated 25°↔40° sweep as motion, not stillness" | PASS |
| Emitted values pass through `MIN_EMIT_DELTA` except the final settle | Pre-existing `tilt pipeline` › "ignores sub-dead-band jitter…"; A9 asserts the exact `{ nx: 0, ny: 0 }` settle emit | PASS |
| iOS permission flow unchanged | `requestGyroPermission` › all five cases | PASS (audit) |
| Album/macro tiers attach nothing | `capability gating` › "attaches zero listeners in album tier…"; `tier and focus lifecycle` › "detaches every listener and emits an explicit zero in macro tier" | PASS (audit) |

## 3. Desktop Parity (task 4.2) — PASS

Method: production builds (`STORAGE_DRIVER=local next start`) of the pre-change commit `a912ae5` (isolated worktree, port `3131`) and the head build (port `3132`). Chromium `1440×900`, DPR 1, fine pointer. Pinned `?demo=4&mood=chiaroscuro` fixture; camera settled (stable `.wall-world` transform) before every capture; CSS transitions and animations frozen. States: `idle` (entry framing, pointer never moved), `print` (second placard → third print, pointer parked at `8,8`), `print-hover` (pointer at 72% / 30% of the focused frame). Each state compares a full computed-style dump of 12 selectors plus a `pixelmatch` at threshold `0` over the whole `1440×900` viewport. Harness: `parity/desktop-parity.mjs`; raw summary: `parity/report.json`.

| State | Pre-change build | Head build | Differing px (threshold 0) | Computed-style diffs | Status |
| :--- | :--- | :--- | ---: | ---: | :--- |
| idle | `a912ae5` :3131 | head :3132 | **0** / 1 296 000 | **0** | PASS |
| print | `a912ae5` :3131 | head :3132 | **0** / 1 296 000 | **0** | PASS |
| print-hover | `a912ae5` :3131 | head :3132 | **0** / 1 296 000 | **0** | PASS |

Both sides emit the same single non-blocking diagnostic (the YouTube thumbnail proxy answers `502` offline, as in earlier changes). It is identical on the baseline and the head, so it is not a parity difference. This is expected by construction: `createGyroController` sets `capable = false` on `(pointer: fine)`, so no new branch is reachable and no new DOM, CSS or write path exists.

## 4. Manual Device Checks (task 4.3): iPhone visually verified, Android pending

### 4.1 iPhone 16 Pro, Safari: visually verified by the maintainer

Maintainer report, 2026-11-26: "visually verified on safari on iphone 16 pro". That covers the visible tilt, glare and recentre behaviour on iOS Safari. It does not cover the instrumented rows (`alpha` logging, event cadence), which were not recorded. Android Chrome has not been checked.

### 4.2 Original pending table, as of the implementation pass

No real iPhone or Android device was available to this session. Nothing in this table is claimed as passed.

| Check (`tests.md`) | What to record | Status |
| :--- | :--- | :--- |
| `alpha` availability on entry | finite on every event, both devices | PENDING MANUAL DEVICE VERIFICATION |
| Event cadence while held still | timestamps / Hz while stationary | PENDING MANUAL DEVICE VERIFICATION |
| Landscape hold (50–70°, ±20° tilts) | smooth and proportional, no corner slam, same directions | PENDING MANUAL DEVICE VERIFICATION |
| Upright portrait / lying down | tilt moves, in-plane twist does not, no jitter | PENDING MANUAL DEVICE VERIFICATION |
| Recentre feel (≈10° then hold) | eases home over ≈1.3 s, no snap; whether 1.5° / 3 s fire in a natural hold | PENDING MANUAL DEVICE VERIFICATION |
| Active viewing (15 s of gentle motion) | no recentre | PENDING MANUAL DEVICE VERIFICATION |
| Interruption (move during glide) | print follows the hand immediately | PENDING MANUAL DEVICE VERIFICATION |
| Regression (rotate screen, Reduce Motion, deny permission, desktop hover) | matches the current production build | PENDING MANUAL DEVICE VERIFICATION |

Device / OS versions: iPhone 16 Pro, Safari (iOS version not recorded). Android: not yet checked.

## 5. Automated Gate Results

| Gate | Command | Result | Log |
| :--- | :--- | :--- | :--- |
| Failing-first (task 1.4, pre-PATCH-01) | `npx vitest run src/components/wall/__tests__/gyroTilt.test.ts src/components/wall/__tests__/useGyroTilt.test.ts` | **28 failed / 49 passed (77)** — the 43 pre-existing cases pass; the 34 new cases split 28 fail / 6 pass (the 6 assert fallback behaviour that already existed) | `logs/tdd-red.log` |
| Narrow green (pre-PATCH-01) | same command | **77 passed (2 files)** | `logs/tdd-green-narrow.log` |
| PATCH-01 red | `npx vitest run src/components/wall/__tests__/useGyroTilt.test.ts -t "does not emit after a still phone"` | **1 failed** — `expected [ { nx: +0, ny: +0 } ] to deeply equal []` | `logs/patch-01-red.log` |
| PATCH-01 green | same targeted command | **1 passed** | `logs/patch-01-green.log` |
| Narrow green (post-PATCH-01) | `npx vitest run src/components/wall/__tests__/gyroTilt.test.ts src/components/wall/__tests__/useGyroTilt.test.ts` | **78 passed (2 files)** | `logs/patch-01-narrow.log` |
| Stay-green trio | `npx vitest run src/components/wall/__tests__/printSharpOverlaySync.test.ts src/lib/__tests__/touchAudit.test.ts src/lib/__tests__/sheenGlareAudit.test.ts` | **29 passed (3 files)** | `logs/stay-green.log` |
| Full suite (pre-PATCH-01) | `SAFE_TEST_MAX_MEM_KB=1073741824 safe-test npx vitest run` | **609 passed (40 files)** — baseline 575 + 34 new; no test lost or skipped | `logs/full-vitest.log` |
| Full suite (post-PATCH-01) | `npx vitest run` | **610 passed (40 files)** — baseline 575 + 35 new | `logs/patch-01-full-vitest.log` |
| Types | `npx tsc --noEmit` | exit 0, no diagnostics | `logs/tsc.log` (empty) |
| Lint | `npx eslint .` | exit 0, no diagnostics | `logs/eslint.log` (empty) |
| Build | `STORAGE_DRIVER=local npm run build` | exit 0, 13/13 static pages generated | `logs/build.log`; post-PATCH-01 `logs/patch-01-build.log` |
| Desktop parity (task 4.2) | `node parity/desktop-parity.mjs` against `a912ae5` :3131 and head :3132 | **0 px / 0 computed-style diffs** in `idle`, `print`, `print-hover` | `parity/report.json` |
| Spec sanity | `openspec validate gyro-relative-recenter --strict` | "Change 'gyro-relative-recenter' is valid" | `logs/openspec-validate.log` |

Test-count delta, explicitly: **575 → 610 (+35)**. PATCH-01 adds the idle-phone regression test; the 34 implementation cases plus that one are the delta. Every pre-existing assertion in the two narrow files is unchanged (the only edits to existing test code are the fake adapter's timer queue and the widened import line). No records, fixtures or assertions were deleted.

### 5.1 Verbatim — failing-first run (task 1.4, abridged from `logs/tdd-red.log`)

```text
 RUN  v5.1.1 /home/node/global-sandbox/projects/photo-wall/.claude/worktrees/agent-a70f2aaccd4a6173d

 ❯ src/components/wall/__tests__/useGyroTilt.test.ts (41 tests | 13 failed) 55ms
   ❯ alpha reading plumbing (4)
     × forwards alpha, so a landscape gimbal crossing stays off the clamp 11ms
   ❯ stillness recentre and glide (13)
     × recentres after 3000 ms of stillness and glides the print home 4ms
     × completes the glide without further sensor events and then stops requesting frames 1ms
     × never recentres while the hand keeps breaking the 1.5° band 1ms
     × recentres once per still period and only re-arms after the band is broken 1ms
     × hands control straight back to the hand when a reading breaks the band mid-glide 3ms
     × cancels the pending stillness timer when leaving Print Focus 1ms
     × cancels the pending stillness timer when focusing another photo 1ms
     × cancels the pending stillness timer when rotating the screen 1ms
     × cancels the pending stillness timer when destroy() 1ms
     × stops an in-flight glide when the visitor leaves Print Focus 1ms
     × treats a pose held beyond the ±22° clamp as still and recentres 1ms
     × treats a saturated 25°↔40° sweep as motion, not stillness 1ms
 ❯ src/components/wall/__tests__/gyroTilt.test.ts (36 tests | 15 failed) 32ms
   ❯ recentre constants (1)
     × pins the documented stillness window, band, glide tau and settle threshold 7ms
   ❯ orientationMatrix (1)
     × builds Rz(alpha)·Rx(beta)·Ry(gamma), the W3C intrinsic Z-X′-Y″ rotation 1ms
   ❯ relativeDeviceTilt (10)
     × reads a pure +10° beta rotation from (0,45,0) as aboutX = +10°, aboutY = 0° 0ms
     × reads a pure +10° gamma rotation as aboutY = +10°, aboutX = 0° 1ms
     × matches the Euler delta for single-axis motion at screen angle 0° 1ms
     × matches the Euler delta for single-axis motion at screen angle 90° 0ms
     × matches the Euler delta for single-axis motion at screen angle 180° 0ms
     × matches the Euler delta for single-axis motion at screen angle 270° 0ms
     × stays continuous through the (0,50,80) → (180,130,-85) gimbal crossing 1ms
     × gives the same relative rotation for the equivalent Euler triple 0ms
     × reads a 10° device-x rotation from an upright β = 89° hold as aboutX ≈ 10° 1ms
     × does not register an in-plane twist about the screen normal as tilt 0ms
   ❯ screenTiltFromDevice (1)
     × clamps device-frame tilt to ±0.5 and collapses -0 0ms
   ❯ computeGyroTilt relative-rotation path (2)
     × lands the gimbal-crossing tilt off the clamp where the Euler delta saturates 1ms
   ❯ missing alpha (2)
     × falls back to the Euler delta bit-identically when either side has no alpha 0ms

 FAIL  src/components/wall/__tests__/gyroTilt.test.ts > recentre constants > pins the documented stillness window, band, glide tau and settle threshold
AssertionError: expected undefined to be 3000 // Object.is equality

- Expected:
3000

+ Received:
undefined

 FAIL  src/components/wall/__tests__/gyroTilt.test.ts > orientationMatrix > builds Rz(alpha)·Rx(beta)·Ry(gamma), the W3C intrinsic Z-X′-Y″ rotation
TypeError: orientationMatrix is not a function
 ❯ src/components/wall/__tests__/gyroTilt.test.ts:286:25

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 28 ⎯⎯⎯⎯⎯⎯⎯
 Test Files  2 failed (2)
      Tests  28 failed | 49 passed (77)
```

Failure reasons are exactly the intended ones: missing exports (`undefined` constants, `TypeError: … is not a function`) and no timer behaviour (`expected 0 to be 1` on `pendingTimerCount`, no glide frames). Pre-existing cases: 43/43 pass.

### 5.2 Verbatim — narrow green

```text
 Test Files  2 passed (2)
      Tests  77 passed (77)
```

### 5.3 Verbatim — full suite

```text
 Test Files  40 passed (40)
      Tests  609 passed (609)
   Start at  11:08:13
   Duration  12.55s (tests 53%, import 22%, environment 18%, transform 3%, worker 3%)
```

### 5.4 Verbatim — build

```text
✓ Generating static pages using 2 workers (13/13) in 467ms
  Finalizing page optimization ...
```

### 5.5 `safe-test` deviation (recorded for reproducibility)

The brief's exact command `safe-test npx vitest run` aborts before executing Vitest:

```text
[safe-test 11:07:26] Lock acquired (10575MB RAM free | limit: 4096MB). Executing: npx vitest run
node:internal/process/promises:394
    triggerUncaughtException(err, true /* fromPromise */);
    ^

[RangeError: WebAssembly.instantiate(): Out of memory: Cannot allocate Wasm memory for new instance]
```

`safe-test` applies `ulimit -v 4194304` (4 GiB address space). Vitest 5's oxc Wasm needs a larger virtual reservation; `16 GiB` still failed, and `unlimited` is rejected by the wrapper's `set -u` arithmetic. The full suite above was therefore run **through `safe-test` with its address-space cap raised** (`SAFE_TEST_MAX_MEM_KB=1073741824`), which keeps the cross-session lock and the serialized runner. A direct `npx vitest run` (also passing, `logs/full-vitest-direct.log`) confirms the result.

### 5.6 Verbatim — PATCH-01 red → green and final gates

The regression test drives 200 frames of ±0.03° / ±0.02° sensor noise through Print Focus. Nothing reaches `onTilt` (all deltas are below `MIN_EMIT_DELTA`), then the 3 s timer fires:

```text
# before the guard
AssertionError: expected [ { nx: +0, ny: +0 } ] to deeply equal []
 Test Files  1 failed (1)
      Tests  1 failed | 41 skipped (42)
```

```text
# after the guard
 Test Files  1 passed (1)
      Tests  1 passed | 41 skipped (42)
```

Final post-patch gates: narrow **78 passed (78)**; full suite **610 passed (610)**; `tsc` and `eslint` exit 0; `STORAGE_DRIVER=local npm run build` exit 0. Logs: `logs/patch-01-red.log`, `logs/patch-01-green.log`, `logs/patch-01-narrow.log`, `logs/patch-01-full-vitest.log`, `logs/patch-01-build.log`.

## 6. Resolved & Carried Assumptions

All five `research.md` unverified assumptions remain **carried forward** because they are device-observable. Automated work de-risked each one but disproved none, so nothing moves to Superseded claims.

| Assumption | Automated evidence this run | Status |
| :--- | :--- | :--- |
| iOS Safari and Android Chrome report non-null `alpha` | The null / undefined / mixed-pair fallbacks are proven safe and bit-identical to the old maths; the pad path is exercised by the crossing test. Availability itself is unobservable in CI. | CARRIED — PENDING MANUAL DEVICE VERIFICATION |
| `deviceorientation` keeps firing while the phone is held | The design does not depend on it: the still window is an adapter timer and the glide is driven by rAF. "Glide completes without further sensor events" proves the zero-event case. Real cadence is device-only. | CARRIED — PENDING MANUAL DEVICE VERIFICATION |
| 1.5° is above natural hand sway over 3 s | The band is applied in unclamped degrees and is exported for tuning; no real-hand data exists. | CARRIED — PENDING MANUAL DEVICE VERIFICATION |
| A 450 ms glide tau reads as calm and not laggy | The timeline test pins the maths: ≈37% of the start value after 28 × 16 ms ≈ 448 ms (`e^{-448/450} = 0.370`), exact settle at `{0,0}`. Subjective feel is device-only. | CARRIED — PENDING MANUAL DEVICE VERIFICATION |
| Both devices use the spec's Z-X′-Y″ convention and signs | `orientationMatrix` matches an independently-built `Rz·Rx·Ry` to `2.2e-16`; single-axis equivalence is pinned at all four screen angles; in-plane twist is zero. The real-world direction of motion is device-only. | CARRIED — PENDING MANUAL DEVICE VERIFICATION |

Superseded claims added: none. The pre-existing superseded claim ("tilt is absolute") stands.

## 7. Nomenclature & Code-Symbol Audit

| Glossary term | Code symbol(s) | Test names using the term |
| :--- | :--- | :--- |
| **entry baseline** | `baseline: GyroSample \| null`; doc comments in both files | "captures the first valid sample as the relative baseline"; "the entry baseline is now the held pose" |
| **Euler delta** | `wrapAngleDelta(...)` fallback in `relativeDeviceTilt` (comment: "Euler delta") | "falls back to the Euler delta bit-identically…"; "documents the Euler delta saturating…" |
| **relative rotation** | `relativeDeviceTilt` (doc: "relative rotation `R_rel = R_baseᵀ · R_cur`") | "gives the same relative rotation for the equivalent Euler triple"; "computeGyroTilt relative-rotation path" |
| **device-frame tilt** | `DeviceTilt { aboutX, aboutY }`; local `deviceTilt` | "clamps device-frame tilt to ±0.5…"; "stillness … on unclamped device-frame degrees" (comment) |
| **gimbal crossing** | doc comment on `relativeDeviceTilt` | "stays continuous through the … gimbal crossing"; "lands the gimbal-crossing tilt off the clamp…" |
| **stillness** | `stillAnchor`, `stillTimer`, `armStillTimer`, `RECENTER_STILL_MS`, `RECENTER_STILL_BAND_DEG` | "stillness recentre and glide"; "never recentres while the hand keeps breaking the 1.5° band" |
| **recentre** | `recentre()`, `RECENTER_*`; doc comment in `useGyroTilt.ts` | "recentres after 3000 ms of stillness…"; "recentres once per still period…" |
| **glide** | `gliding`, `RECENTER_GLIDE_TAU_MS`, `GLIDE_SETTLE_EPS` | "glides the print home"; "completes the glide without further sensor events"; "stops an in-flight glide…" |
| **tracking tau** | `DEFAULT_GYRO_TAU_MS` selected when `!gliding`; comment "tracking tau" | "…uses the 85 ms tracking tau, not the 450 ms glide tau" (test comment) |

The spec's numbers are the code's numbers: `RECENTER_STILL_MS = 3000`, `RECENTER_STILL_BAND_DEG = 1.5`, `RECENTER_GLIDE_TAU_MS = 450`, `GLIDE_SETTLE_EPS = 0.002`, `DEFAULT_GYRO_MAX_DEG = 22`, tracking tau `85`. `design.md`'s `tilt.recenter.*` tokens match the exported constants one-to-one.

## 8. Deviations & Open Items

1. **`safe-test` default cap is incompatible with this repo's Vitest.** Documented verbatim in §5.5; the full-suite run used a raised `SAFE_TEST_MAX_MEM_KB`. No test was skipped.
2. **Single-axis Δβ equivalence uses a gamma-free baseline.** The matrix and Euler mappings coincide exactly for a pure `Δβ` only when `gamma0 = 0` (a pure device-x rotation from a portrait hold); for other `gamma0` the correct relative rotation intentionally differs from the Euler delta. The test therefore uses `(alpha, 45, 0) → (alpha, 55, 0)` for `Δβ`, matching the brief's verified expectation, and arbitrary `gamma` for `Δγ` where the matrix result is exactly `Ry(Δγ)`.
3. **Task 4.2 run by the orchestrator** — `parity/desktop-parity.mjs` compared the `a912ae5` build and the head build: 0 px and 0 computed-style diffs in `idle`, `print` and `print-hover` (§3).
4. **Task 4.3 partly run**: the maintainer visually verified it on Safari on an iPhone 16 Pro. Android Chrome and the instrumented rows are still `PENDING MANUAL DEVICE VERIFICATION`.
5. **Task 4.4** — all five assumptions carried forward and marked `PENDING MANUAL DEVICE VERIFICATION`; none disproved.
6. **Completed by the orchestrator** — spec sync into `openspec/specs/instanced-photo-renderer/spec.md`, `openspec-verify-change`, commit, push and PR #16.
7. **Files touched:** production files `src/components/wall/gyroTilt.ts`, `src/components/wall/useGyroTilt.ts` and their two test files; artifacts `tasks.md`, `verification.md`, `patch.md`, `logs/`, `parity/`, and the synced `openspec/specs/instanced-photo-renderer/spec.md`. No production file outside the Target Context Map was modified.

## 9. Quick Re-Verification (60-Second Audit)

```bash
npx vitest run src/components/wall/__tests__/gyroTilt.test.ts src/components/wall/__tests__/useGyroTilt.test.ts
# expect: Test Files 2 passed (2) | Tests 78 passed (78)

npx vitest run src/components/wall/__tests__/printSharpOverlaySync.test.ts src/lib/__tests__/touchAudit.test.ts src/lib/__tests__/sheenGlareAudit.test.ts
# expect: Test Files 3 passed (3) | Tests 29 passed (29)
```

For the full gate:

```bash
npx vitest run   # 40 files, 610 tests
npx tsc --noEmit && npx eslint .
STORAGE_DRIVER=local npm run build
```

## 10. `openspec-verify-change` Report (orchestrator)

### Summary

| Dimension | Status |
| :--- | :--- |
| Completeness | 17/19 tasks checked; 2 deliberate device-only pending (4.3 and 4.4). 2 requirements (1 MODIFIED, 1 ADDED), 15 scenarios, all mapped in §2. |
| Correctness | 15/15 scenarios mapped to a verifying test or an unchanged-path audit; 78/78 narrow, 610/610 full, 0 px desktop parity, `tsc`/`eslint`/`build` clean; PATCH-01 resolved. |
| Coherence | D1–D5 followed; changes confined to the gyro slice + its tests; no pre-existing assertion edited; glossary terms used in code, tests and docs. |

### Issues by priority

**CRITICAL:** none.

**WARNING:** Tasks 4.3 (real iPhone Safari / Android Chrome) and 4.4 (the five device-observable assumptions) are `PENDING MANUAL DEVICE VERIFICATION`. This was not an implementation gap: no physical devices were available, and the orchestration directive requires the checks to stay pending rather than be claimed. Recommendation: run the `tests.md` device pass before archiving, then tune only `RECENTER_STILL_BAND_DEG` if the 1.5° band does not fire in a natural hold.

**SUGGESTION:** `safe-test`'s default 4 GiB address-space cap aborts Vitest 5 (oxc Wasm). The recorded full-suite run used `SAFE_TEST_MAX_MEM_KB=1073741824`; a direct `npx vitest run` also passes. Recommendation: raise the wrapper's default for this repo in a future housekeeping change (outside this slice).

### Final assessment

No critical issues. PATCH-01 resolved the idle-phone synthetic emit; ready for the device pass and archive, with the real-device checks recorded as pending.

PATCH-01 re-ran the gates after the guard and regression test: `npx vitest run` **40 files / 610 tests passed**, `npx tsc --noEmit` exit 0, `npx eslint .` exit 0, `STORAGE_DRIVER=local npm run build` exit 0. Delta spec remains synced into `openspec/specs/instanced-photo-renderer/spec.md`; `openspec validate --specs --strict` **9 passed, 0 failed**.
