# Surgical Patch Handoff: OpenSpec Change 'mobile-gyroscope-glare' [PATCH-01]

## 1. Executive Objective & Diagnostic Feedback
- **Change Name**: `mobile-gyroscope-glare` (on PR #13 batch branch `feat/multi-20261125-0558`, worktree `/home/node/.local/share/opencode/worktree/c63da2794a700730e3a2cbe71e9e957277cb59ba/happy-condor`)
- **Patch ID**: `PATCH-01`
- **Objective**: Resolve the PR #13 merge conflict with `origin/main` (`daa6ad0`), guard `createGyroController.reset()` so devices without motion samples never receive a synthetic `{0, 0}` hover pose in Print Focus, address two small code-review nits in `FramedPrint.tsx` and `GalleryCanvas.tsx`, and align `tasks.md` checkboxes with pending physical-device checks.
- **Feedback & Diagnostic Trace**:
  ```
  PR #13 (feat/multi-20261125-0558) — Verdict: REQUEST CHANGES

  [Critical] openspec/specs/gallery-hud-and-curator-ui/spec.md: merge conflict with PR #12 (origin/main @ daa6ad0).
  PR #12 added "#### Scenario: Measurement disagreement never oscillates" at the end of the marquee requirement,
  the exact boundary where PR #13 appends four new HUD and Studio requirements. Keep both sides (marquee scenario
  first, then the four new ### Requirement: blocks) and confirm `openspec validate --specs --strict` passes.

  [Important] src/components/wall/useGyroTilt.ts (reset(hadContext) inside setContext) + FramedPrint.tsx:
  Entering Print Focus calls reset(true), which emits { nx: 0, ny: 0 } even if no sensor reading ever arrived.
  FramedPrint's print branch writes translateZ(58px) rotateY(0) rotateX(0) and sheen opacity 0.92, leaving a phone
  with denied motion permission or a coarse-pointer tablet without a gyro permanently stuck in the lifted hover pose
  (and mirrored by PrintSharpOverlay). Fix: track `hasEmittedSinceReset`, set it when tick() emits, and only emit
  { nx: 0, ny: 0 } inside reset(announce) when `announce && hasEmittedSinceReset`. Add a test in useGyroTilt.test.ts
  entering print with zero readings and asserting zero onTilt calls.

  [Important] OpenSpec task tracking alignment:
  - openspec/changes/mobile-gyroscope-glare/tasks.md:38 has task 4.3 checked [x] while its text includes real iPhone
    Safari / Android Chrome results that verification.md marks PENDING MANUAL DEVICE VERIFICATION. Split 4.3 into
    [x] 4.3 (automated + Playwright evidence) and [ ] 4.4 (real-device HTTPS checks, deferred to maintainer LAN pass).
  - openspec/changes/mobile-touch-compatibility/tasks.md:55-66 keeps 5.3 and 5.4 unchecked; explicitly note that
    physical-device verification is deferred to the maintainer's local LAN check (not falsely marked passed, distinct
    from automated CI/parity completion).

  [Nits]
  - src/components/wall/FramedPrint.tsx (gyro subscriber): cache `.photo-sheen` element once in the useEffect
    rather than running querySelector('.photo-sheen') on every 60-120 Hz sensor tick.
  - src/components/wall/GalleryCanvas.tsx (L570-573, onPointerMove): add a one-line comment explaining why
    setPointerCapture is intentionally skipped after a 2->1 pinch hand-off (touch pointers are implicitly captured
    to their hit target and bubble to the container).
  ```
- **Root Cause Analysis**:
  1. `origin/main` advanced with PR #12 (`daa6ad0`) editing the tail of `openspec/specs/gallery-hud-and-curator-ui/spec.md` after `feat/multi-20261125-0558` branched.
  2. `createGyroController` treated every post-initialization `setContext` transition as needing an explicit `{ nx: 0, ny: 0 }` emission, without checking whether any real tilt had been emitted since the previous reset. `FramedPrint`'s `print` branch unconditionally applies the active `58px` / `opacity: 0.92` pose on any callback invocation.
  3. Task `4.3` in `mobile-gyroscope-glare/tasks.md` combined completed automated evidence and pending physical-device checks in a single checked item.

## 2. Strict Target Context Map

| File Path (relative to repo root) | Target Lines | Modification Summary |
|---|---|---|
| `openspec/specs/gallery-hud-and-curator-ui/spec.md` | `L168-L215` (merge conflict region) | Merge `origin/main` into `feat/multi-20261125-0558` and keep both sides: PR #12's `#### Scenario: Measurement disagreement never oscillates` under the marquee requirement, followed by PR #13's four new `### Requirement:` blocks. |
| `src/components/wall/__tests__/useGyroTilt.test.ts` | `L299-L360` | Add a test inside `describe('tier and focus lifecycle', ...)` verifying that entering `print` focus (from `album` or directly) with zero sensor readings produces zero `onTilt` calls (and confirm all existing post-sample reset tests remain green). |
| `src/components/wall/useGyroTilt.ts` | `L103-L158` | Add `let hasEmittedSinceReset = false;`; set `hasEmittedSinceReset = true` inside `tick()` when calling `emit(current)` (or inside `emit` only when non-reset); in `reset(announce)`, compute `const shouldAnnounce = announce && hasEmittedSinceReset;`, reset `hasEmittedSinceReset = false`, clear state, and only call `emit({ nx: 0, ny: 0 })` when `shouldAnnounce` is `true`. |
| `src/components/wall/FramedPrint.tsx` | `L94-L125` | Cache `const sheen = frameRef.current?.querySelector<HTMLElement>('.photo-sheen') ?? null;` once when setting up the `useEffect` subscription so the per-tick callback avoids repeated `querySelector('.photo-sheen')` DOM lookups. |
| `src/components/wall/GalleryCanvas.tsx` | `L569-L575` | Add a one-line comment noting that after a `2 -> 1` pinch hand-off `wasDragged` is already `true` so `setPointerCapture` is skipped intentionally (touch pointers remain implicitly captured to their target and bubble to the container). |
| `openspec/changes/mobile-gyroscope-glare/tasks.md` | `L36-L46` | Split `4.3` into `[x] 4.3` (automated + Playwright + synthetic-sensor evidence in `verification.md`) and `[ ] 4.4` (real iPhone Safari & Android Chrome HTTPS verification — deferred to maintainer LAN check), and check off `P01.1`–`P01.6` as completed. |
| `openspec/changes/mobile-touch-compatibility/tasks.md` | `L55-L67` | Clarify in comments on unchecked `5.3`/`5.4` that physical-device verification is deferred to the maintainer's local LAN run (kept unchecked and distinct from automated merge-gate completion). |
| `openspec/changes/mobile-gyroscope-glare/verification.md` & `patch.md` | End of file / `Status:` line | Append `PATCH-01` verification evidence (test output, `openspec validate --specs --strict`, merge commit SHA) in `verification.md`, and mark `PATCH-01` `RESOLVED` in `patch.md`. |

## 3. Blast Radius & Invariant Guardrails
- **STRICT BLAST RADIUS**: Modify ONLY the files and line regions specified in the Target Context Map above (plus standard git merge commit metadata from merging `origin/main`).
- **FORBIDDEN**:
  - Do NOT rebase/force-push history — use a normal `git merge origin/main` on `feat/multi-20261125-0558` so existing commit SHAs referenced in `verification.md` stay intact.
  - Do NOT modify `wall.css`, `hud.css`, `studio.css`, `pinchGesture.ts`, `gyroTilt.ts`, `.env`, or credential files.
  - Do NOT modify existing passing test assertions in `useGyroTilt.test.ts` (all existing reset tests already feed samples before resetting and must continue passing verbatim).
- **INVARIANTS TO PRESERVE**:
  - All 520+ existing Vitest tests (including `touchAudit.test.ts`, `cssBoundaryAudit.test.ts`, `pinchGesture.test.ts`, `gyroTilt.test.ts`, `useGyroTilt.test.ts`) MUST pass.
  - Fine-pointer desktop behavior remains 100% untouched.
  - `openspec validate --specs --strict` and `openspec validate "mobile-gyroscope-glare" --strict` MUST pass with 0 issues.

## 4. Visual & UI Impact
- **Coarse-pointer devices without sensor readings (denied iOS permission or no gyroscope):** Focused print in `print` tier now stays at its CSS rest pose (`translateZ(54px)`, default resting sheen) instead of jumping to the active hover pose (`translateZ(58px)`, `opacity: 0.92`).
- **Coarse-pointer devices streaming gyroscope readings:** Identical `±4°` tilt, `--tilt-sx`/`--tilt-sy` shadow, `30%` Album View sheen, and `100%` Print Focus sheen; rotations, photo switches, and tier exits still re-center to `{ nx: 0, ny: 0 }` cleanly.
- **Fine-pointer desktop browsers:** Zero change.

## 5. Reproduction & Verification Protocol
1. **Merge & Resolve Spec Conflict**:
   - In `/home/node/.local/share/opencode/worktree/c63da2794a700730e3a2cbe71e9e957277cb59ba/happy-condor` on `feat/multi-20261125-0558`:
     ```bash
     git fetch origin && git merge origin/main
     ```
   - Resolve `openspec/specs/gallery-hud-and-curator-ui/spec.md` keeping both PR #12's marquee scenario and PR #13's four new requirements.
   - Verify: `openspec validate --specs --strict`
2. **Reproduce First (TDD Red)**:
   - Add the zero-reading Print Focus test to `src/components/wall/__tests__/useGyroTilt.test.ts`.
   - Run:
     ```bash
     npx vitest run src/components/wall/__tests__/useGyroTilt.test.ts -t "does not emit"
     ```
   - Confirm failure (`expected [ { nx: 0, ny: 0 } ] to deeply equal []`).
3. **Apply Minimal Fixes**:
   - Add `hasEmittedSinceReset` guard in `src/components/wall/useGyroTilt.ts` (`L103-L158`).
   - Cache `.photo-sheen` in `src/components/wall/FramedPrint.tsx` (`L94-L125`).
   - Add the clarifying one-line comment in `src/components/wall/GalleryCanvas.tsx` (`L569-L575`).
   - Align task tracking in `openspec/changes/mobile-gyroscope-glare/tasks.md` and `openspec/changes/mobile-touch-compatibility/tasks.md`.
4. **Verify Fix (TDD Green)**:
   - Re-run:
     ```bash
     npx vitest run src/components/wall/__tests__/useGyroTilt.test.ts
     ```
   - Confirm 100% pass (new test + all 19 existing lifecycle tests, including live orientation change & focus change).
5. **Full Regression Suite & Strict Spec Validation**:
   - Run:
     ```bash
     npx vitest run && npx tsc --noEmit && npx eslint src && npm run build && openspec validate --specs --strict
     ```
   - Confirm zero errors and record verbatim summary in `openspec/changes/mobile-gyroscope-glare/verification.md`.

## 6. Surgical Patch Checklist
- [ ] P01.1 Merge `origin/main` into `feat/multi-20261125-0558`, resolve `openspec/specs/gallery-hud-and-curator-ui/spec.md` keeping both sides, and verify `openspec validate --specs --strict` passes.
- [ ] P01.2 Add reproducing test in `src/components/wall/__tests__/useGyroTilt.test.ts` and confirm it fails before the code change.
- [ ] P01.3 Implement `hasEmittedSinceReset` in `src/components/wall/useGyroTilt.ts`, cache `.photo-sheen` in `src/components/wall/FramedPrint.tsx`, and add the one-line hand-off capture comment in `src/components/wall/GalleryCanvas.tsx`.
- [ ] P01.4 Align `openspec/changes/mobile-gyroscope-glare/tasks.md` (split `4.3` + unchecked `4.4`) and `openspec/changes/mobile-touch-compatibility/tasks.md` (`5.3`/`5.4` deferred-hardware clarification).
- [ ] P01.5 Re-run `npx vitest run src/components/wall/__tests__/useGyroTilt.test.ts` and full suite (`npx vitest run && npx tsc --noEmit && npx eslint src && npm run build && openspec validate --specs --strict`) and confirm 100% pass.
- [ ] P01.6 Update `openspec/changes/mobile-gyroscope-glare/tasks.md` (`P01.1`–`P01.6` to `- [x]`), append `PATCH-01` evidence to `verification.md`, mark `PATCH-01` `RESOLVED` in `patch.md`, commit, and push to `origin/feat/multi-20261125-0558`.
