# OpenCode Orchestration Handoff: OpenSpec Change 'gyro-relative-recenter'

You are the orchestration agent for OpenSpec change 'gyro-relative-recenter' running in OpenCode. Run this change through the **`openspec-apply-sub`** skill, which hands task implementation to the `spec-coder-sub` subagent.

## 1. Orchestration Directive

- **Change Name:** gyro-relative-recenter
- **Target Skill:** `openspec-apply-sub` (or `/opsx:apply-sub gyro-relative-recenter`)
- **Architecture Paradigm:** Vertical Slice Architecture (VSA). The whole change lives in the gyro slice: the pure maths in `gyroTilt.ts` and the lifecycle in `useGyroTilt.ts`. Keep it there, and don't add shared helpers or modules outside that slice.
- **Branch:** `feat/gyro-relative-recenter`, already checked out, based on `origin/main` at `a912ae5`. The planning artifacts are committed as `8baa455`.
- **Goal in one line:**
  1. Replace the Euler-angle subtraction in the gyro tilt with a true relative rotation (3×3 matrices built from `alpha`/`beta`/`gamma`), so landscape and upright-portrait holds no longer slam the glare into a corner.
  2. Add a recentre after 3 s of stillness: the tilt glides home with a 450 ms time constant, driven by a timer and rAF rather than by sensor events.

Read these before starting:

- `openspec/changes/gyro-relative-recenter/research.md` for the glossary and verified facts, including the numeric gimbal-crossing proof;
- `architecture.md` for decisions D1–D5;
- `specs/instanced-photo-renderer/spec.md` for the MODIFIED requirement, the ADDED requirement and every scenario.

Use the glossary's terms exactly in code comments, test names and `verification.md`: entry baseline, Euler delta, relative rotation, device-frame tilt, gimbal crossing, stillness, recentre, glide, tracking tau.

## 2. Target Context Map

| File Path (relative to repo root) | Target Lines (`a912ae5`) | Modification Summary |
|---|---|---|
| `src/components/wall/gyroTilt.ts` | `L18-L37` | Add exported constants: `RECENTER_STILL_MS = 3000`, `RECENTER_STILL_BAND_DEG = 1.5`, `RECENTER_GLIDE_TAU_MS = 450`, `GLIDE_SETTLE_EPS = 0.002`. Add `alpha?: number \| null` to `GyroSample`. Add a new `DeviceTilt { aboutX; aboutY }` type, in degrees, unclamped. |
| `src/components/wall/gyroTilt.ts` | `L63-L105` | Split `computeGyroTilt` into two functions and re-express `computeGyroTilt(sample, baseline, screenAngleDeg)` as their composition, keeping the signature unchanged. **`relativeDeviceTilt(sample, baseline): DeviceTilt`:** when both `alpha`s are finite, compute `R_rel = R_baseᵀ·R_cur`, take `v = R_rel·(0,0,1)`, and return `aboutY = atan2(v.x, v.z)` and `aboutX = atan2(−v.y, v.z)` in degrees. Otherwise return today's `wrapAngleDelta(Δgamma)` / `wrapAngleDelta(Δbeta)`. **`screenTiltFromDevice(tilt, screenAngleDeg): TiltVector`:** the existing `switch`, with `aboutY` in the `dGamma` role and `aboutX` in the `dBeta` role, plus the clamp to ±22, `/44` and `noNegativeZero`. |
| `src/components/wall/gyroTilt.ts` | `[NEW]` after `L105` | `orientationMatrix(alpha, beta, gamma)`, defined as `Rz(α)·Rx(β)·Ry(γ)` with right-handed matrices (W3C intrinsic Z‑X′‑Y″), plus small internal 3×3 helpers. |
| `src/components/wall/useGyroTilt.ts` | `L47-L51` | `GyroReading` gains `alpha?: number \| null`. `isFiniteReading` still checks only `beta`/`gamma`. |
| `src/components/wall/useGyroTilt.ts` | `L58-L72` | `GyroAdapter` gains `setTimer(callback, ms): number` and `clearTimer(handle): void`. |
| `src/components/wall/useGyroTilt.ts` | `L98-L246` | **New controller state:** `lastReading`, `stillAnchor: DeviceTilt \| null`, `stillTimer`, `gliding`. **`handleReading`:** copies a finite `alpha`, otherwise stores `null`. **`tick`:** stillness band check and timer re-arm happen *before* smoothing; tau is `gliding ? RECENTER_GLIDE_TAU_MS : DEFAULT_GYRO_TAU_MS`; on settle, emit the exact target (bypassing `MIN_EMIT_DELTA`) and leave the glide; otherwise continue the glide with `pending = lastReading` and `requestFrame`. **Recentre callback:** see D3. **Cleanup:** `reset()` clears the timer and all new state; `detach()` and `destroy()` clear the timer. |
| `src/components/wall/useGyroTilt.ts` | `L298-L334` | Production adapter: forward `event.alpha`, and implement `setTimer`/`clearTimer` with `window.setTimeout` and `window.clearTimeout`. |
| `src/components/wall/__tests__/gyroTilt.test.ts` | append | New maths cases from `tests.md`. |
| `src/components/wall/__tests__/useGyroTilt.test.ts` | fake adapter (`L38-L104`), then append | The fake gains a manual timer queue (`setTimer`, `clearTimer`, an `advanceTimers(ms)` helper). Then add the new controller cases from `tests.md`. |
| `openspec/specs/instanced-photo-renderer/spec.md` | `L44-L66`, and append | At sync time: replace the gyroscope requirement block with the MODIFIED block, and append the ADDED recentre requirement. `openspec` 1.7.0 has no `specs apply`, so edit by hand. |

## 3. Technical & Architectural Boundaries

**In-scope decisions** (`architecture.md`):

- **D1, relative rotation via 3×3 matrices.** Compute per tick and don't cache `R_base`. `computeGyroTilt` keeps its signature.
- **D2, `alpha` fallback is per pair.** Use the matrix path only when **both** the baseline and the sample have a finite `alpha`; otherwise use the Euler delta, which is byte-identical to today's maths. **Never substitute `alpha = 0` on the matrix path.** At a gimbal crossing that yields about −169°, which is worse than the bug being fixed.
- **D3, stillness timer goes through the adapter, never through event arrival.** The W3C spec fires `deviceorientation` only on a "significant change", so a still phone may stop ticking.
  - **Band:** measured in **unclamped** device-frame degrees, per axis, against `stillAnchor`. A band break sets `stillAnchor = deg`, restarts the 3000 ms timer, and sets `gliding = false`.
  - **When the timer fires** (guard on `!disposed && listening && lastReading`):
    1. set `baseline = lastReading`;
    2. set `stillAnchor = {0,0}`;
    3. clear `stillTimer` and do **not** re-arm it;
    4. set `gliding = true`;
    5. set `pending = lastReading`, then call `requestFrame(tick)` if no frame is queued.
  - Do **not** touch `current` or `lastEmitted`. There must be no snap and no `{0,0}` announcement.
  - One still period gives at most one recentre.
- **D4:** the constants are exported from `gyroTilt.ts` only.
- **D5:** reading shape, adapter, and fake-adapter timer queue. Those timer methods are the only permitted edit to existing test helper code.

**Invariants to preserve:**

- Every pre-existing test in `gyroTilt.test.ts` and `useGyroTilt.test.ts` passes **with no assertion edits**. They pass no `alpha`, so they run the Euler fallback. If one fails, the implementation is wrong; don't change the test.
- All writes still flow through `onTilt` only, with no React state at sensor rate.
- Tier and focus gating, orientation-change resets, the iOS permission flow, and `MIN_EMIT_DELTA` stay unchanged.
- Desktop (`pointer: fine`) and reduced-motion behaviour stay unchanged.

**Hard exclusions / no-go:**

- Do NOT modify `.env`, `.env.*`, or credential files. Don't print or decrypt any secret.
- Do NOT add dependencies (no `gl-matrix`, no quaternion library).
- Do NOT modify these files: `FramedPrint.tsx`, `PrintSharpOverlay.tsx`, `GalleryCanvas.tsx`, `src/styles/wall.css`, `playgrounds/`, or anything outside the Target Context Map.
- Do NOT add a CSS `transition` for the glide. Don't change the ±4°, ±38% or ±22° amplitudes, or the sheen anchor or strength.
- Do NOT run anything against preview or production Turso or Bunny. They share the production database and storage. Verify only on local dev with `STORAGE_DRIVER=local`; read-only viewing of preview is fine.
- Do NOT kill processes you didn't start (no `pkill -f next-server`). Another session runs a dev server on this machine. Start any temporary server on a free, unique port and stop it by its own PID.
- Do NOT use bare `git stash` or `git stash pop`, because the stash is shared across worktrees. Never `git add -A`; stage explicit paths.

## 4. Visual & UI Design Specifications & Vision Verification

- **Theme:** Chiaroscuro Gallery, "Pose-Independent Tilt with Settling Recentre" (`design.md`). There are **no colour, typography or layout changes**; all tokens are inherited.
- **Key tokens** (`design.md` frontmatter `tilt`):
  - `maxDeg 22`, `frameRotation ±4°`, `sheenSweep ±38%`, `trackingTauMs 85`;
  - `recenter.stillMs 3000`, `stillBandDeg 1.5`, `glideTauMs 450` (about 1.3 s to 95%), `settleEps 0.002`.
- **Component states:**
  - **Rest:** frame at `rotate 0`, shadow offsets `0px`, glare at the `65% 35%` anchor.
  - **Tracking:** follows the hand relative to the entry baseline, identical in any hold pose.
  - **Settling (glide):** frame, shadow and glare ease home together with an exponential ease-out, no overshoot.
  - **Interrupted glide:** the hand wins immediately.
  - **Unavailable:** CSS rest pose, unchanged.
- **Responsive layout:** gated by capability (`pointer: coarse`), never by width. No touch-target changes.
- **Multi-modal vision verification:**
  - Screenshots can't show sensor-driven motion. Emulated desktop parity can be captured with Playwright CLI (`npx playwright screenshot <url> <output.png>`) and inspected directly.
  - The recentre feel, landscape behaviour and `alpha` availability need real phones. Leave tasks 4.3 and 4.4's device items marked `PENDING MANUAL DEVICE VERIFICATION` for maintainer review, while completing every automated task.

## 5. Test Scaffolding & Verification Commands

- **Primary test runner:** `npx vitest run` (Vitest, Node environment).
- **Narrow loop:** `npx vitest run src/components/wall/__tests__/gyroTilt.test.ts src/components/wall/__tests__/useGyroTilt.test.ts`
- **Stay-green checks:** `npx vitest run src/components/wall/__tests__/printSharpOverlaySync.test.ts src/lib/__tests__/touchAudit.test.ts src/lib/__tests__/sheenGlareAudit.test.ts`
- **Full gates (task 4.1 only):** `safe-test npx vitest run` (serialized), `npx tsc --noEmit`, `npx eslint .`, `npm run build`. The baseline on `main` is 575 tests passing.
- **TDD requirement:** task group 1 MUST scaffold the failing tests before any implementation code changes. Run them, confirm they fail for the expected reasons (missing exports or behaviour) while the pre-existing cases still pass, and record that output in `verification.md`.
- **Resource and concurrency rules:**
  - During task work, run only the narrow files above. Don't run full discovery or headless browser suites on every checkbox.
  - Wrap heavy runs with `safe-test`, or force a single worker (`--workers=1` for browser and E2E runs).
- **Test-writing hints:**
  - **Building physical poses:** construct the matrix (for example `R_base · Rx(10°)`), then convert back to a W3C triple with a test-local matrix-to-ZXY helper. Don't hand-write the Euler numbers, except for the documented crossing pair `(0,50,80)` → `(180,130,−85)`.
  - **Driving the glide:** use the fake adapter's frame queue and `now`, at about 16 ms per frame.

## 6. Implementation Task Checklist

### 1. Test Scaffolding (TDD)

- [ ] 1.1 In `gyroTilt.test.ts`, write failing tests for "Coarse-pointer gyroscope rotational glare and physical print-focus tilt" (MODIFIED):
  - single-axis equivalence between the matrix and Euler paths at all four screen angles;
  - gimbal-crossing continuity, `(0,50,80)` → `(180,130,−85)`;
  - equivalent-triple invariance;
  - upright-portrait (`β = 89`) rotation about x;
  - in-plane twist gives zero;
  - the null-`alpha` fallback is bit-identical;
  - clamp and `noNegativeZero` on the matrix path.
- [ ] 1.2 In `useGyroTilt.test.ts`:
  - extend the fake adapter with a manual timer queue;
  - write failing controller tests for `alpha` forwarding and acceptance of `alpha: null`.
- [ ] 1.3 In `useGyroTilt.test.ts`, write failing tests for "Print Focus tilt auto-recentres after 3 seconds of stillness":
  - the recentre and glide timeline (monotonic, about 37% at 450 ms, an exact settle emit, no snap);
  - motion prevents a recentre;
  - the glide completes without events and frames stop;
  - an interrupted glide returns to the tracking tau and re-arms;
  - one recentre per still period;
  - context, orientation and destroy cancellation;
  - a never-streaming device arms no timer;
  - the band is measured in unclamped degrees.
- [ ] 1.4 Run both files with `npx vitest run src/components/wall/__tests__/gyroTilt.test.ts src/components/wall/__tests__/useGyroTilt.test.ts`. Confirm the new cases fail for the expected reasons (missing exports and behaviour) and the existing cases still pass. Record the output.

### 2. Relative rotation maths (`gyroTilt.ts`)

- [ ] 2.1 Add `GyroSample.alpha`, `DeviceTilt` and the four recentre constants (D4).
- [ ] 2.2 Implement `orientationMatrix` and `relativeDeviceTilt`:
  - the matrix path only when both `alpha`s are finite;
  - the Euler path otherwise, via `wrapAngleDelta` (D1, D2).
- [ ] 2.3 Extract `screenTiltFromDevice` from the existing `switch`, with `aboutY` in the `dGamma` role and `aboutX` in the `dBeta` role. Re-express `computeGyroTilt` as their composition.
- [ ] 2.4 Make 1.1 pass, with all pre-existing `gyroTilt.test.ts` cases green unchanged.

### 3. Controller: `alpha` plumbing and stillness recentre (`useGyroTilt.ts`)

- [ ] 3.1 Add `GyroReading.alpha`. `handleReading` copies a finite `alpha` and otherwise stores `null`. The production adapter forwards `event.alpha` (D5).
- [ ] 3.2 Add `setTimer`/`clearTimer` to `GyroAdapter` and to `createDefaultGyroAdapter` (D3).
- [ ] 3.3 Add the controller state: `lastReading`, `stillAnchor`, `stillTimer`, `gliding`. Clear it all in `reset()`, and clear the timer in `detach()` and `destroy()`.
- [ ] 3.4 In `tick`:
  1. compute `relativeDeviceTilt`;
  2. run the unclamped stillness band check and re-arm the timer, before smoothing;
  3. smooth with `gliding ? RECENTER_GLIDE_TAU_MS : DEFAULT_GYRO_TAU_MS`;
  4. on settle, emit the exact target and leave the glide;
  5. otherwise continue the glide frame with `lastReading`.
- [ ] 3.5 Implement the recentre callback:
  - guard it on `disposed`, `listening` and `lastReading`;
  - rebase to `lastReading` and set `stillAnchor = {0,0}`;
  - don't re-arm the timer, and don't touch `current`/`lastEmitted`;
  - request a frame.
- [ ] 3.6 Make 1.2 and 1.3 pass, with all pre-existing `useGyroTilt.test.ts` cases green. Confirm `printSharpOverlaySync.test.ts`, `touchAudit.test.ts` and `sheenGlareAudit.test.ts` stay green unchanged.

### 4. Verification & Empirical Audit

- [ ] 4.1 Run the full gates and record the pass counts against the baseline:
  - `npx vitest run` (serialized full suite);
  - `npx tsc --noEmit`;
  - `npx eslint .`;
  - `npm run build`.
- [ ] 4.2 Run the desktop parity harness (idle, print, hovered print) against the pre-change build and expect 0 px. Desktop is untouched by construction, so any diff is a defect.
- [ ] 4.3 Run the `tests.md` manual device checks on a real iPhone (Safari) and a real Android phone (Chrome):
  - `alpha` availability and event cadence logging;
  - landscape;
  - upright portrait;
  - recentre feel;
  - active viewing;
  - interruption;
  - regression.

  Mark any check that couldn't run as `PENDING MANUAL DEVICE VERIFICATION`. Don't claim it passed.
- [ ] 4.4 Resolve or carry forward every `research.md` unverified assumption:
  - `alpha` is non-null;
  - event cadence;
  - the 1.5° band against hand sway;
  - the 450 ms feel;
  - the sign convention.

  Move anything disproved to Superseded claims.
- [ ] 4.5 Populate `verification.md`:
  - a Requirement Adherence Matrix covering every scenario in `specs/instanced-photo-renderer/spec.md`;
  - the parity result;
  - device and OS versions;
  - resolved assumptions;
  - a nomenclature audit (entry baseline, Euler delta, relative rotation, device-frame tilt, stillness, recentre, glide, tracking tau);
  - verbatim logs.

## 7. Post-Implementation & Verification Obligations

When `spec-coder-sub` finishes:

1. Check that every checkbox in `tasks.md` is marked `- [x]`, but only for tasks that genuinely ran and passed. Device checks that couldn't run stay unchecked or marked `PENDING MANUAL DEVICE VERIFICATION`.
2. **Data preservation:** not applicable. This change is client-only and never touches the database, storage or data models. Confirm `git diff --stat origin/main` lists only files from the Target Context Map plus the change directory.
3. Make sure `openspec/changes/gyro-relative-recenter/verification.md` contains:
   - an executive summary and environment (Node, Vitest and Next versions, and commit SHA);
   - a Requirement Adherence Audit Matrix that maps every spec scenario to its verifying test;
   - resolved assumptions and empirical proof;
   - a nomenclature and code symbol audit;
   - verbatim execution logs, including the failing-first TDD run from task 1.4.
4. Automatically run verification with `openspec-verify-change`.

## 8. Verification Review & Single-Pass Automated Repair (Max Retries = 1)

- **If verification succeeds with zero critical issues:**
  1. Sync delta specs with the `openspec-sync-specs` skill for `gyro-relative-recenter`. Since there's no `specs apply`, hand-edit `openspec/specs/instanced-photo-renderer/spec.md`: replace the gyroscope requirement block and append the ADDED requirement. Then run `openspec validate --specs --strict`.
  2. **Open a pull request:**
     - Stay on `feat/gyro-relative-recenter`.
     - Stage explicit paths only: `git add openspec/changes/gyro-relative-recenter openspec/specs/instanced-photo-renderer/spec.md src/components/wall/gyroTilt.ts src/components/wall/useGyroTilt.ts src/components/wall/__tests__/gyroTilt.test.ts src/components/wall/__tests__/useGyroTilt.test.ts`
     - Commit, push with `git push -u origin HEAD`, then open the pull request with `gh pr create`. Give it a concise title and a body that summarises `proposal.md` and `verification.md` and lists the pending device checks. Report the PR URL.
- **If CRITICAL issues or failed test verification errors are detected on the initial pass:**
  1. Announce: "Verification failed on initial pass. Attempting a single bounded repair pass via subagent..."
  2. Hand a single-pass repair task to `spec-coder-sub` with the verification failure context:
     > "Fix the specific verification failures and test errors reported for change 'gyro-relative-recenter'. Refer to the error log, make minimal targeted patches to resolve the failures, run verification commands, and update tasks.md."
  3. Re-run verification with `openspec-verify-change`.
  4. **If verification passes after the repair:** sync the delta specs, then stage explicit paths, commit, push the branch, and open the pull request as above.
  5. **If verification STILL fails after the single repair pass:** **HALT**. Don't loop or re-run. Present the verification report and the remaining blockers to the user for manual guidance.
