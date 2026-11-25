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
