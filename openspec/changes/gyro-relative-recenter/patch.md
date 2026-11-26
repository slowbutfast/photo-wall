# Patch Ledger: gyro-relative-recenter

## Patch Ledger

| Patch ID | Date | Trigger / Feedback Source | Target Files | Status |
| :--- | :--- | :--- | :--- | :--- |
| `PATCH-01` | 2026-11-26 | Code Review — PR #16 | `src/components/wall/useGyroTilt.ts`, `src/components/wall/__tests__/useGyroTilt.test.ts`, `tasks.md`, `verification.md` | RESOLVED |

---

### [PATCH-01] Suppress the synthetic settle emit on a phone that never emitted

- **Date**: 2026-11-26
- **Feedback Source**: Code Review, PR #16 (REQUEST CHANGES)
- **Reported Issue**:
  ```text
  A still phone that never emitted gets a synthetic emit after 3 s, and the
  glare jumps in brightness.
  ```
  A phone resting on a table or in a stand produced only sensor noise below `MIN_EMIT_DELTA`, so `onTilt` never fired and `.photo-sheen` stayed at its CSS rest opacity. After this change, the first reading armed the stillness timer; after 3 s `recentre()` started a glide that settled immediately and emitted unconditionally. `FramedPrint` then wrote the active inline opacity and transform, roughly doubling the glare brightness for no visible reason.
- **Root Cause**: `recentre()` started the glide unconditionally. When nothing had reached `onTilt` since the last reset, `current` was already `{ 0, 0 }`; the first glide frame settled instantly and the final-settle branch emitted `{ 0, 0 }` past `MIN_EMIT_DELTA`. The controller already has the correct principle in `reset()`: a device that never streamed has no pose to unwind.
- **Target Files**:
  - `src/components/wall/useGyroTilt.ts`
  - `src/components/wall/__tests__/useGyroTilt.test.ts`
  - `openspec/changes/gyro-relative-recenter/tasks.md`
  - `openspec/changes/gyro-relative-recenter/verification.md`
- **Resolution Strategy**:
  - In `recentre()`, rebase `baseline` and reset `stillAnchor` as before, then return before `gliding = true` when `!hasEmittedSinceReset`. No frame is requested and no settle emit can occur.
  - Collapse near-zero (`< 1e-9`) settle components to literal `0`, so the exact-rest emit cannot carry `atan2` round-off such as `-2.26e-18`.
  - Add a regression test that drives 200 frames of ±0.03° / ±0.02° sensor noise through Print Focus, confirms zero emits, fires the 3 s timer, and confirms zero emits and zero frames.
- **Verification Proof**:
  - Red before the guard: `expected [ { nx: +0, ny: +0 } ] to deeply equal []` (`logs/patch-01-red.log`).
  - Green after the guard: targeted test `1 passed | 41 skipped` (`logs/patch-01-green.log`); narrow `78 passed (78)` (`logs/patch-01-narrow.log`); full suite `610 passed (610)` (`logs/patch-01-full-vitest.log`).
  - `npx tsc --noEmit` exit 0; `npx eslint .` exit 0; `STORAGE_DRIVER=local npm run build` exit 0 (`logs/patch-01-build.log`).
- **Status**: RESOLVED.
