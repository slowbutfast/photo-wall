# Verification: mobile-print-transitions

## Executive summary

The change is implemented and every automated gate is green: 666/666 Vitest
tests, `tsc --noEmit`, `eslint .`, and a production build. The desktop parity
harness compared 7 resting states × 3 moods against `cdeda3b` and found **0
differing pixels and 0 computed-style diffs in all 21 state/mood pairs**. The
coarse-emulation pass confirms the 58 px rest lift, the 0.38 neighbour veil, a
device-pixel-snapped world translation, and constant `box-shadow` strings across
a NEXT flight.

Everything that needs a real iPhone in Safari is marked **PENDING MANUAL DEVICE
VERIFICATION** and was not run here (no WebKit and no device in this
environment). That is the only open work.

## Environment

| Item | Value |
| :--- | :--- |
| Worktree | `feat/mobile-print-transitions` @ `0741db0` + the implementation |
| Base | `cdeda3b` (`main`), separate git worktree, production build |
| Node | v22.23.2 |
| Next.js | 16.4.6 (Turbopack build) |
| Tests | Vitest 5.1.1, Node environment |
| Browser | Playwright Chromium via `playwright-core` (npx cache); no WebKit |
| Parity servers | `next start` on `127.0.0.1:3131` (base) and `:3132` (head) |
| Data | local copy of `data/photo-wall.db`; `STORAGE_DRIVER=local`; `?demo=4` fixture; no preview/production write |
| Viewports | desktop 1440×900 dpr 1, fine pointer; coarse 393×852 dpr 3, touch + mobile |
| Moods | `chiaroscuro`, `concrete`, `alabaster` |

## Gate results

| Gate | Result | Log |
| :--- | :--- | :--- |
| `npx vitest run --maxWorkers=1` | **666 / 666 passed**, 44 files | `logs/5.1-vitest.log` |
| `npx tsc --noEmit` | **0 errors** | `logs/5.1-tsc.log` |
| `npx eslint .` | **0 errors, 0 warnings** | `logs/5.1-eslint.log` |
| `npm run build` | **success** | `logs/5.1-build.log` |
| `safe-test npx vitest run` | aborts: `WebAssembly.instantiate(): Out of memory` (known `ulimit -v` issue) | `logs/5.1-safe-test.log` |
| `openspec validate mobile-print-transitions --strict` | valid | — |
| `openspec validate --specs` | 10 / 10 passed | — |

The change adds 45 test cases: 15 `flightPlan`, 9 `focusHandoff`, 3 gyro-hold,
16 `printHandoffAudit`, and 2 `snapToDevicePixel`. At TDD time the first red
run had 17 failing / 80 passing across the five files, with every pre-existing
gyro case green (see `logs/1.5-tdd-red.log`).

## Requirement adherence matrix

`PASS` means an automated test or the parity harness exercised it. `PENDING
MANUAL DEVICE VERIFICATION` means it needs the maintainer's iPhone/Safari and
was **not** claimed as passed.

### `print-focus-handoff`

| Scenario | Status | Evidence |
| :--- | :--- | :--- |
| NEXT hands the focused look across during the flight | PASS | `focusHandoff.test.ts` — print→print at 0.5 writes 0.5/0.5 to exactly `a`/`b`; parity coarse samples the same two participants |
| The outgoing print keeps its focused look at the tap | PASS | `focusHandoff.test.ts` — outgoing starts at `w₀ = 1`; the coarse lift/shadow values at `w = 1` are the resting focused values (CSS audit) |
| The incoming print arrives fully focused when the camera lands | PASS | `focusHandoff.test.ts` `tick(1)` clears both weights and fires `onEnd` once; `sampleFlight(…, 1)` equals the target exactly |
| Resting desktop states are pixel-identical to main | PASS | Parity: 21/21 states, 0 px, 0 computed-style diffs (incl. `.wall-world` transform) |
| Dragging mid-flight completes the hand-off smoothly | PASS (logic) / PENDING MANUAL DEVICE VERIFICATION (feel) | `focusHandoff.test.ts` cancel case: 160 ms ± 1 frame, no step > 0.25; gesture cancel wiring in `zoomBy`/`panByPixels` |
| Rapid double NEXT re-targets without a jump | PASS | `focusHandoff.test.ts` re-begin at `e = 0.6`: `b` continues from 0.6, `a` releases from 0.4, `c` starts at 0 |
| Outgoing print stays sharp while it leaves | PASS (logic) / PENDING MANUAL DEVICE VERIFICATION (visual) | `PrintSharpOverlay` looks the frame up by id and keeps one instance per participant until `onEnd`; the 300 ms tail is unchanged |
| RETURN fades the crisp overlay with the zoom-out | PASS (logic) / PENDING MANUAL DEVICE VERIFICATION (visual) | Print→album shape is outgoing-only; the overlay instance retains its `src` in participant state |
| Outgoing print sinks back during the flight on touch | PASS (computed) / PENDING MANUAL DEVICE VERIFICATION | Coarse audit asserts `translateZ(calc(22px + 36px * var(--focus-w, 1)))` + `--gyro-r* · w`; rest computes `m43 = 58` |
| Hand-off frames repaint no box shadows | PASS | Coarse samples: every frame and shadow element keeps one `box-shadow` string across 6 frames |
| Neighbours dim on entering Print Focus and stay dim through NEXT | PASS (rest + weights) / PENDING MANUAL DEVICE VERIFICATION (ramp feel) | Coarse rest: neighbour `.photo-dim` opacity `0.38`, `--print-w: 1.0000` |
| Desktop has no dimming veil | PASS | CSS audit: `.photo-dim` is `display: none` outside the coarse block; parity sees no paint |

### `spatial-camera-navigation`

| Scenario | Status | Evidence |
| :--- | :--- | :--- |
| Landscape print fits above bottom focus bar on portrait mobile screen | PENDING MANUAL DEVICE VERIFICATION | Existing framing rule retained; automated fill check below |
| Flight duration scales with path length | PASS | `flightPlan.test.ts`: 455 / 746 / 849 ms fixtures ±1; clamps 450/1100; real adjacent step 455 |
| Adjacent same-zoom step pans without zooming | PASS | `flightPlan.test.ts`: 0.92 vw → `pan`; `sampleFlight` keeps `z` within 1e-9 and lerps x/y by `flightEase` |
| Row wrap keeps the arc | PASS | `flightPlan.test.ts`: 3.81 vw → `arc`; samples equal `interpolateZoom(..., flightEase(t))` |
| Portrait touch Print Focus fills 84% of the width | PASS | Coarse 393×852: focused landscape frame = **0.833–0.844** of the viewport (varies with print aspect); 0 neighbour frames in the side margins |
| Touch world translation lands on device pixels at rest | PASS | `snapToDevicePixel` unit cases (dpr 3, dpr 1); coarse rest transform `translate3d(1305.67px, -194.667px, …)` at dpr 3 is within 0.02 px of whole device pixels (Chromium serialises to 6 significant digits) |

### `instanced-photo-renderer`

| Scenario | Status | Evidence |
| :--- | :--- | :--- |
| Print Focus physically tilts frame, shadow, and glare with phone orientation | PENDING MANUAL DEVICE VERIFICATION | Gyro maths unchanged; existing `useGyroTilt`/`gyroTilt` suites stay green |
| Single-axis tilt matches the previous Euler-delta mapping | PASS | Existing `gyroTilt.test.ts` unchanged |
| Landscape hold through a gimbal crossing stays continuous | PASS | Existing `gyroTilt.test.ts` unchanged |
| Equivalent Euler triples produce identical tilt | PASS | Existing `gyroTilt.test.ts` unchanged |
| In-plane twist does not register as tilt | PASS | Existing `gyroTilt.test.ts` unchanged |
| Missing alpha falls back to Euler deltas without dropping the reading | PASS | Existing `gyroTilt.test.ts` unchanged |
| Screen orientation change rebases baseline without jumping | PASS | Existing `useGyroTilt.test.ts` unchanged |
| Reduced motion and desktop fine-pointer browsers stay unaffected | PASS | Existing suites; desktop parity 0/0 |
| Gyro is held during a Print Focus flight and baselines after settle | PASS | New hold cases: no emit/baseline while held, silent focus reset, post-release baseline, recentre cancelled |
| Focused print rests at the gyro lift height on coarse pointers | PASS | Coarse computed transform: `m43 = 58`, `m13 = 0` (zero rotation) |

### `gallery-hud-and-curator-ui`

| Scenario | Status | Evidence |
| :--- | :--- | :--- |
| Stepping through prints shows album caption and only populated manual fields | PASS | Unchanged; desktop parity across NEXT/PREV/RETURN |
| Touch visitors see RETURN without the keyboard hint | PASS (CSS) / PENDING MANUAL DEVICE VERIFICATION (visual) | `printHandoffAudit.test.ts`: coarse `.hud-key-hint { display: none }`; `RETURN<span class="hud-key-hint"> [ESC]</span>`; desktop label is pixel-identical to base |

### `3d-pbr-wall-and-lighting`

| Scenario | Status | Evidence |
| :--- | :--- | :--- |
| Coarse wall output is dithered, desktop is untouched | PASS (source) / PENDING MANUAL DEVICE VERIFICATION (banding) | `uDither` audited; desktop parity has 0 differing wall pixels |
| Dither amplitude stays below one 8-bit step | PASS | `(ign - 0.5) / 255`, `ign ∈ [0,1)` → `±0.5/255`; constants audited |

## Empirical proof

- **Durations (research fixtures, `S` from the exact `zoomPathParams`):** `S = 0.409 → 455 ms`; `S = 1.173 → 746 ms`; `S = 1.446 → 849 ms`. A real adjacent step at `z = 6.2`, step `1.82` gives `S ≈ 0.408` → 455 ms ±1. The 3.81-viewport 5-column wrap gives `S = 1.4461` → 850 ms, within ±1 of 849.
- **Peak speed (can-fail guard):** old fixed 720 ms smoothstep arc = **9.34 vw/s**, new path-scaled plan = **7.91 vw/s** on the sampled centre-of-camera metric. The research note's absolute figures (13.5 → 5.7) used a different apparent-speed metric; the relative drop and the fixed bounds are what the guard asserts.
- **Portrait fill:** 393×852, coarse: focused landscape frame = **0.833** (parity sample) and **0.844** (4:3 sample) of viewport width; **0** dimmed neighbours in the 8% side margins.
- **Touch rest:** `translateZ = 58 px`, rotation 0, neighbour veil `0.38`, `--print-w = 1.0000`.
- **Settle snap:** world translation `1305.67 / -194.667` at dpr 3 (`×3 = 3917.01 / -584.001`); 0.02 px tolerance covers Chromium's 6-significant-digit `transform` serialisation. `snapToDevicePixel` is directly unit-tested.
- **No box-shadow repaint:** 6 mid-NEXT frames × 2 participants; each frame/shadow element has exactly one computed `box-shadow` string.
- **Desktop parity:** 21/21 states (7 states × 3 moods) at 0 px and 0 computed-style diffs; `.wall-world` transform strings identical.
- **Hydration markup:** `RETURN [ESC]` remains one text run on fine pointers (`.hud-key-hint { display: contents }`), which is what keeps the 0-px parity. On coarse it is hidden by CSS only.

## Resolved assumptions and remaining ones

| Assumption | Status |
| :--- | :--- |
| `.is-lit` outranks `.focused` on desktop, so the shadow does not change on focus | **Confirmed** (`wall.css` source order); desktop hand-off moves only the falloff, crisp overlay and z-order |
| Desktop focused prints rest at 22 px | **Confirmed**; the 58 px rest is coarse-only, as chosen |
| Device-pixel snap must stay coarse-only | **Confirmed**; rounding the fine-pointer string would break zero-pixel desktop parity |
| The end-of-flight pop had three candidate causes | **Partly resolved**: gyro hold, 58 px rest and the overlay crossfade are implemented and automated. Which candidate still lands (if any) needs the `?debugHandoff=1` iPhone pass — **PENDING MANUAL DEVICE VERIFICATION** |
| Span-based shadow layers can differ from `box-shadow` by ≤ 1 LSB | Accepted on coarse only; desktop/parity unaffected |
| `--print-w` on the grid recalcs ~20 frames during album↔print only | Accepted; per-frame writes to non-participants still never happen |

## Nomenclature and code-symbol audit

| Term (research glossary) | Code |
| :--- | :--- |
| flight | `flightRef`, `planFlight`, `sampleFlight`, `flightDurationMs` |
| pan flight / arc flight | `FlightKind = 'pan' \| 'arc'`, `PAN_MAX_LOG_ZOOM_RATIO`, `PAN_MAX_SCREEN_WIDTHS` |
| path length `S` | `zoomPathParams(...).S`, `zoomPathLength` |
| focus hand-off | `createFocusHandoff`, `focusHandoff.ts`, `.is-handoff` |
| focus weight `w` | `--focus-w`, `FocusHandoffParticipant.w` |
| Print Focus weight `p` | `--print-w`, `PrintWeight` |
| participants | `participants()`, `setWeight(photoId, w)`, `.is-handoff-cell` |
| semantic focus | `focusedPhotoId`, `.focused`, `focusStateRef` (unchanged flip) |
| gyro hold | `GyroController.setHold`, `GyroTiltHandle.setHold`, `held` |
| device-pixel settle snap | `snapToDevicePixel`, `applyCamera(settled)` |
| neighbour dimming | `.photo-dim`, `zoomTierStyle('print').focusDimming` |

No horizontal “animation” abstraction was added; the two slices
(`flightPlan.ts`, `focusHandoff.ts`) stay pure and `GalleryCanvas` is the only
integrator.

## PATCH-01 verification

Triggered by code review of PR #18 and an iPhone run on the Versailles preview.
The original verification measured computed frame styles and never where the
crisp overlay sat during a flight, which is how the frozen-overlay bug got
through. `parity/overlay-follow.mjs` measures exactly that.

Coarse emulation, 393×852 @ dpr 3, alabaster, `?demo=4`, local storage driver.
Both builds were served side by side: the PR head `425323b` and this patch.

| Metric | PR head `425323b` | PATCH-01 |
| :--- | :--- | :--- |
| Worst overlay-to-window IoU through a NEXT (visible overlays) | 0.151 (0.20 in the first run), at opacity 1 | 0.997 |
| Frames with an overlay below 0.9 IoU | 9 of 66 | 0 of 68 |
| Overlays mounted at once during NEXT | 2 | 2 |
| `--print-w` left on the grid after Overview | `1.0000` | cleared |
| Lit neighbour veils after Overview | 12 | 0 |
| Overlays still mounted after Overview | 1 | 0 |

Evidence: `parity/overlay-follow-report.json`.

| Gate | Result |
| :--- | :--- |
| `npx vitest run --maxWorkers=1` | 677 / 677 passed, 45 files |
| `npx tsc --noEmit` | clean |
| `npx eslint .` | clean |
| `npm run build` | success |

New tests: `printSharpOverlayWake.test.tsx` (3, jsdom; fails when the registry is
mutated back to a single slot), three controller cases in `focusHandoff.test.ts`
(the print-weight release and re-begin cases fail on the pre-patch controller),
and four source audits in `printHandoffAudit.test.ts`.

Not verified here, and not claimed: the horizontal tearing while tilting (the
change is a candidate fix on a WebKit compositing behaviour that Chromium cannot
reproduce), the glare moving after landing on a real gyro, and Safari
Timelines/Layers. All are **PENDING MANUAL DEVICE VERIFICATION**.

## Logs

- `logs/1.5-tdd-red.log` — 17 failing / 80 passing at TDD start (missing modules, CSS, source text).
- `logs/5.1-safe-test.log` — `safe-test` WebAssembly OOM.
- `logs/5.1-vitest.log` — 666 passed.
- `logs/5.1-tsc.log`, `logs/5.1-eslint.log` — empty (clean).
- `logs/5.1-build.log` — successful production build.
- `logs/5.2-parity.log` — 21/21 desktop states 0/0, coarse all pass.
- `parity/report.json` — full matrix and coarse samples.
