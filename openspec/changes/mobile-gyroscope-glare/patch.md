# Patch Audit Trail: `mobile-gyroscope-glare`

### [PATCH-01] Merge Conflict Resolution, Silent Gyro Fallback Guard, Nits, & Task Tracking Alignment
- **Date**: 2026-11-25 15:22:00 UTC
- **Feedback Source**: Code Review (PR #13 — `feat(mobile): touch compatibility and gyroscope glare`, Verdict: `REQUEST CHANGES`)
- **Feedback Summary**:
  - **1. [Critical — Merge Conflict]** `openspec/specs/gallery-hud-and-curator-ui/spec.md` conflicts with `origin/main` (`daa6ad0`, PR #12 marquee fix), which appended `#### Scenario: Measurement disagreement never oscillates` at the end of the marquee requirement where PR #13 appends four new HUD/Studio requirements.
  - **2. [Important — Logic Bug / Silent Fallback Violation]** `src/components/wall/useGyroTilt.ts` (`reset(hadContext)` inside `setContext`) unconditionally emits `{ nx: 0, ny: 0 }` on context changes even when no real sensor reading has ever arrived. `FramedPrint.tsx`'s `tier === 'print'` gyro subscriber writes inline `translateZ(58px)` + `sheen.style.opacity = '0.92'` on any emitted vector, leaving devices with denied motion permission or no gyroscope permanently stuck in the lifted hover pose instead of falling back silently to the CSS rest pose (`54px`).
  - **3. [Important — OpenSpec Task/Evidence Alignment]** `openspec/changes/mobile-gyroscope-glare/tasks.md` marks task `4.3` `[x]` even though its wording bundles real iPhone Safari / Android Chrome HTTPS checks alongside automated/Playwright evidence, whereas `verification.md` explicitly records device checks as `PENDING MANUAL DEVICE VERIFICATION` (and `mobile-touch-compatibility/tasks.md` keeps `5.3`/`5.4` unchecked).
  - **4. [Minor — Nits]**
    - `src/components/wall/FramedPrint.tsx`: Cache the `.photo-sheen` element once per `useEffect` subscription instead of running `querySelector('.photo-sheen')` on every 60–120 Hz sensor tick across 12–20 mounted prints.
    - `src/components/wall/GalleryCanvas.tsx`: Add a one-line comment at `L570-L573` clarifying that skipping `setPointerCapture` after a `2 -> 1` pinch hand-off is intentional because touch pointers are implicitly captured to their target and bubble to the container.
- **Reported Issue / Raw Trace**:
  - GitHub PR #13 reports `CONFLICTING` on `openspec/specs/gallery-hud-and-curator-ui/spec.md` vs `origin/main` (`daa6ad0`).
  - `createGyroController.setContext` calls `reset(hadContext)` → `emit({ nx: 0, ny: 0 })` with zero readings → `FramedPrint` writes `translateZ(58px) rotateY(0.00deg) rotateX(-0.00deg)` and `sheen.style.opacity = '0.92'`.
  - `mobile-gyroscope-glare/tasks.md:38` checked `[x]` while device checks are pending; `mobile-touch-compatibility/tasks.md:55-66` unchecked `[ ]`.
- **Root Cause**:
  1. `feat/multi-20261125-0558` branched from `main` prior to PR #12 (`daa6ad0`) merging into `origin/main`.
  2. `createGyroController` lacked a `hasEmittedSinceReset` guard distinguishing "re-center an actively tilting print" from "context changed on a device that never streamed sensor data".
  3. Task `4.3` combined automated evidence recording and physical-device verification in a single checkbox.
- **Target Files**: `openspec/specs/gallery-hud-and-curator-ui/spec.md`, `src/components/wall/useGyroTilt.ts`, `src/components/wall/__tests__/useGyroTilt.test.ts`, `src/components/wall/FramedPrint.tsx`, `src/components/wall/GalleryCanvas.tsx`, `openspec/changes/mobile-gyroscope-glare/tasks.md`, `openspec/changes/mobile-touch-compatibility/tasks.md`, `openspec/changes/mobile-gyroscope-glare/verification.md`, `openspec/changes/mobile-gyroscope-glare/patch.md`
- **Resolution Strategy**:
  1. Merge `origin/main` into `feat/multi-20261125-0558`, resolving `openspec/specs/gallery-hud-and-curator-ui/spec.md` by keeping `#### Scenario: Measurement disagreement never oscillates` under the marquee requirement followed by the four new HUD/Studio `### Requirement:` blocks, and run `openspec validate --specs --strict`.
  2. Add `hasEmittedSinceReset` in `createGyroController` (`useGyroTilt.ts`), set it in `tick()` when emitting, and gate `reset(announce)` so it only emits `{ nx: 0, ny: 0 }` when `announce && hasEmittedSinceReset` (then clears the flag). Add a TDD test in `useGyroTilt.test.ts` proving entering `print` focus with zero sensor samples produces zero `onTilt` calls while post-sample resets still emit `{ nx: 0, ny: 0 }`.
  3. Cache `.photo-sheen` inside `FramedPrint.tsx`'s gyro `useEffect` and add the clarifying one-line comment at `GalleryCanvas.tsx:570-573`.
  4. Split `mobile-gyroscope-glare/tasks.md` `4.3` into `[x] 4.3` (automated/Playwright evidence) and `[ ] 4.4` (real iPhone Safari / Android Chrome HTTPS verification, deferred to maintainer LAN check), and clarify merge-gate vs post-merge maintainer hardware verification consistently in both `tasks.md` files and `verification.md`.
- **Resolution Evidence**:
  - Merge `origin/main` → `f4bdb21`; HUD spec conflict resolved with PR #12's marquee scenario followed by PR #13's four requirements; `openspec validate --specs --strict` → 9/9.
  - TDD guard: `album → print` with zero readings failed before the fix (`expected [ { nx: 0, ny: 0 } ] to deeply equal []`); `useGyroTilt.test.ts` now 21/21.
  - Full suite 35 files / 536 tests; `tsc --noEmit`, `eslint .`, `npm run build` clean.
  - Coarse browser probe: no sensor events ⇒ no inline transform/tilt vars, sheen opacity 0.44 (CSS rest); synthetic samples ⇒ `translateZ(58px) rotateY(3.27°) rotateX(-3.99°)`, sheen 38%, opacity 0.92.
  - Task tracking aligned (`4.3`/`4.4`; touch `5.3`/`5.4` deferred-hardware notes).
  - Full evidence: `verification.md` §10.
- **Status**: RESOLVED

### [PATCH-02] Gyro Dead-Band, No-Op DOM Write Skip, & Gesture-Scoped Pan/Pinch Loop
- **Date**: 2026-11-25 20:47:00 UTC
- **Feedback Source**: Real-Device Safari Web Inspector Profiling (iPhone 16 Pro `S2` & `S4` + Reduce Motion A/B on PR #13 preview `133dd21`)
- **Feedback Summary**:
  - **1. [Important — Idle & Browse Gyro Noise Commits]** `src/components/wall/useGyroTilt.ts` (`L34`) sets `MIN_EMIT_DELTA = 1e-3` (~0.04° combined movement). Sensor jitter on a resting phone exceeds that threshold every frame, causing `createGyroController` (`M:26051`) to emit at 60 Hz and `FramedPrint.tsx` (`L106-L129`) to write inline `transform` / `--tilt-sx` / `--tilt-sy` / sheen styles every frame (producing 60 commits/s at idle in `S4` and ~459–513 style recalcs/run in `S2`).
  - **2. [Critical — Event-Driven Pan Regression Without Gyro Heartbeat (Cross-Referenced to `mobile-touch-compatibility`)]** Turning Reduce Motion ON removed `createGyroController`'s rAF tick and exposed a pan-rate drop in `S2` from ~60 fps to **36–39 fps (36–43% missed vsyncs)** with ~110 ms gaps after frames without an rAF. The same regression affects every user with denied motion permission, production today, and every user once the gyro dead-band suppresses idle ticks — so the dead-band and the pan-loop fix MUST ship together.
- **Reported Issue / Raw Trace**:
  - `S4` (Print Focus Idle): baseline 2 rAF loops (`M:26051` + `i:19074`), 60 orientation events/s, 60 commits/s; Reduce Motion ON drops `M:26051` (confirming `createGyroController` as the second loop, not `PlaygroundPbrWall`).
  - `S2` (Pan) Reduce Motion ON: drops to `36–39 fps`, `36–43%` missed vsyncs, ~110 ms holes after frames with no rAF queued.
- **Root Cause**:
  1. `MIN_EMIT_DELTA = 1e-3` is smaller than resting MEMS gyroscope noise, and `FramedPrint.tsx` re-writes identical formatted CSS strings without comparing against the previous write.
  2. In `GalleryCanvas.tsx` (`L224-L319`, `L539-L593`), `onPointerMove` calls `panByPixels()` (setting `cameraRef` and `targetRef` to the same point) and `requestFrame()`, which renders one frame and stops (`settled === true`). Without a pending rAF while fingers are down, WebKit either stalls `pointermove` delivery between frames and/or fires `markGesture`'s `156 ms` settle timer during a brief finger pause, flipping `will-change: transform` → `auto` while `gestureRef.current.pointers.length > 0` and forcing full-world re-rasterization.
- **Target Files**: `src/components/wall/useGyroTilt.ts`, `src/components/wall/__tests__/useGyroTilt.test.ts`, `src/components/wall/FramedPrint.tsx`, `src/components/wall/GalleryCanvas.tsx`, `openspec/changes/mobile-gyroscope-glare/tasks.md`, `openspec/changes/mobile-gyroscope-glare/verification.md`, `openspec/changes/mobile-gyroscope-glare/patch.md`
- **Resolution Strategy**:
  1. Raise `MIN_EMIT_DELTA` in `src/components/wall/useGyroTilt.ts` from `1e-3` to `0.004` (~0.2°) and add a unit test in `useGyroTilt.test.ts` verifying sub-dead-band jitter is suppressed while intentional tilts still emit smoothly.
  2. Cache the last written `transform`, `--tilt-sx`, `--tilt-sy`, and sheen `transform`/`opacity` strings inside `FramedPrint.tsx`'s gyro `useEffect` and skip identical inline DOM writes.
  3. In `src/components/wall/GalleryCanvas.tsx`, switch panning/pinching to a **gesture-scoped rAF loop**: start rAF on `pointerdown`, keep it ticking every vsync while `gestureRef.current.pointers.length > 0`, accumulate/record pointer pan/pinch deltas in `onPointerMove` and apply them once per frame inside the rAF loop (coalescing multi-event bursts), stop only after the last `pointerup` once the camera settles, and guard both `will-change` teardown checks (`frame()` at `L283` and `markGesture` timer at `L314`) with `gestureRef.current.pointers.length === 0`.
- **Resolution Evidence**:
  - Dead-band: TDD red at `1e-3` (converged `0.1°` emitted `ny 0.00157…`); `MIN_EMIT_DELTA = 0.004`; `useGyroTilt.test.ts` 22/22.
  - `FramedPrint` skips identical formatted `transform` / `--tilt-sx` / `--tilt-sy` / sheen `transform` / `opacity` writes; Album View never writes opacity.
  - `GalleryCanvas`: `pendingPanRef` / `pendingPinchRef` + `flushPendingInputRef`; flush at frame start; `pointerdown` starts the loop; `settled` and both `will-change` teardown checks require `pointers.length === 0`; `endPointer` re-arms `markGesture()`.
  - Gates: targeted 31/31; full 35 files / 537 tests; `tsc --noEmit`, `eslint .`, `npm run build`, strict OpenSpec validation clean.
  - Headless probes: stationary hold keeps the loop alive with `will-change: transform`; post-release loop stops and `will-change` returns to `auto`; pan changes the camera transform; sub-dead-band gyro jitter leaves the DOM at rest while a real tilt writes the full pose.
  - Full evidence and the pending 3-way `S2` device protocol: `verification.md` §11.
- **Status**: RESOLVED
