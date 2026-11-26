# Surgical Patch Handoff: OpenSpec Change 'mobile-render-profile' [PATCH-01]

## 1. Executive Objective & Diagnostic Feedback
- **Change Name**: `mobile-render-profile` (with matching doc sync in `render-loop-efficiency` on PR #14 batch branch `feat/multi-20261125-2103`, worktree `/home/node/.local/share/opencode/worktree/c63da2794a700730e3a2cbe71e9e957277cb59ba/daring-ferret`, HEAD `847ddcf`)
- **Patch ID**: `PATCH-01`
- **Objective**: Documentation-only surgical patch reconciling the stale Executive Summary in both `verification.md` files with the recorded Playwright PASS results, formally classifying real-device hardware checks (`1.0b`, `4.4`) as deferred post-merge performance acceptance, and adding the coarse focus-entry pop check to Task `4.4`. **Zero production code changes.**
- **Feedback & Diagnostic Trace**:
  ```
  PR #14 (feat/multi-20261125-2103) — Documentation & Tracking Findings:

  1. [Important] openspec/changes/mobile-render-profile/verification.md (L8-L16, L30, L34) conflicts with its own
     Playwright PASS results at L203-L230 and checked Task 4.2: the top summary still says Playwright was not run
     and parity is PENDING, while §8 records 8 desktop states + macro at 0 px diff and 28/28 coarse assertions.
     (Same stale top summary at openspec/changes/render-loop-efficiency/verification.md L8, L13.)

  2. [Important] openspec/changes/render-loop-efficiency/tasks.md (4.4) and
     openspec/changes/mobile-render-profile/tasks.md (1.0b, 4.4) leave real iPhone/Android checks unchecked.
     Formally reclassify these checks as deferred post-merge maintainer performance acceptance and describe both
     changes as implementation-complete with automated + Playwright merge gates passed and hardware acceptance
     deferred.

  3. [Device Check Note] Add the coarse focus-entry pop check (wall.css L1201-L1216: perspective jumping from none
     to 1150px while transform animates from scale(1.0195) to translateZ(58px)) to mobile-render-profile Task 4.4 /
     verification.md maintainer device checklist.
  ```
- **Root Cause Analysis**:
  - `spec-coder-sub` wrote the top Executive Summary before the orchestrator executed Playwright Task `4.2` and appended §8, leaving the top status table contradictory.
  - Real-device performance acceptance checks were left unchecked without formally distinguishing merge-gate completion from deferred post-merge maintainer hardware verification.

## 2. Strict Target Context Map

| File Path (relative to repo root) | Target Lines | Modification Summary |
|---|---|---|
| `openspec/changes/mobile-render-profile/verification.md` | `L8`, `L15-L18`, `L30`, `L34`, plus maintainer device checklist | Update Executive Summary (`Status`, `Browser`, `Device`) and Audit Matrix (`L30`, `L34`) to reflect **PASS** for Task `4.2` Playwright desktop 0-diff parity (8 states + macro, 0 px) and 28/28 coarse-emulation assertions (§8); formally label real-device checks (`1.0b`, `4.4`) as **deferred post-merge maintainer performance acceptance**; add the coarse focus-entry pop check (`wall.css` `L1201-L1216`) to the device checklist. |
| `openspec/changes/render-loop-efficiency/verification.md` | `L8`, `L13` | Update Executive Summary (`Implementation status`, `Browser / WebGL`) to match the appended Playwright 0-diff desktop parity PASS results, and explicitly state that Task `4.4` physical-device acceptance is **formally deferred to the maintainer's post-merge pass**. |
| `openspec/changes/mobile-render-profile/tasks.md` | `L21`, `L43`, `Patch 01` block | Clarify on unchecked `1.0b` and `4.4` that physical-device performance acceptance is formally deferred post-merge (distinct from automated + Playwright merge-gate completion), include the coarse focus-entry pop check (`wall.css` `L1201-L1216`) in `4.4`, and check off `P01.1`–`P01.4`. |
| `openspec/changes/render-loop-efficiency/tasks.md` | `L43` | Clarify on unchecked `4.4` that physical-device performance acceptance is formally deferred post-merge (implementation-complete, automated + Playwright merge-gate passed). |
| `openspec/changes/mobile-render-profile/patch.md` | `Status:` line | Mark `PATCH-01` `RESOLVED` with strict validation evidence. |

## 3. Blast Radius & Invariant Guardrails
- **STRICT BLAST RADIUS**: Documentation-only patch. Modify ONLY the 5 markdown files listed in the Target Context Map above.
- **FORBIDDEN**:
  - Do NOT modify any file under `src/`, `openspec/specs/`, `package.json`, `.env`, or any test file.
  - Do NOT check off `1.0b` or `4.4` (they require physical iPhone/Android hardware and MUST stay `- [ ]` as deferred post-merge acceptance).
  - Do NOT alter the recorded Playwright numbers or verbatim logs in §8.
- **INVARIANTS TO PRESERVE**:
  - `git diff --stat HEAD -- src/ openspec/specs/` MUST be empty.
  - `openspec validate "render-loop-efficiency" --strict --json`, `openspec validate "mobile-render-profile" --strict --json`, and `openspec validate --specs --strict` MUST all pass with `0` issues.

## 4. Visual & UI Impact
- Status: Non-visual documentation patch. Zero code, CSS, or layout modifications permitted.

## 5. Reproduction & Verification Protocol
1. **Confirm Contradiction**: Read `openspec/changes/mobile-render-profile/verification.md` (`L8-L16`, `L30`, `L34`, `L203-L230`) and `openspec/changes/render-loop-efficiency/verification.md` (`L8`, `L13`).
2. **Apply Minimal Doc Edits**: Update the 5 markdown files in the Target Context Map.
3. **Verify Strict Validation & Zero Code Diff**:
   ```bash
   openspec validate "render-loop-efficiency" --strict --json && openspec validate "mobile-render-profile" --strict --json && openspec validate --specs --strict && git diff --stat -- src/ openspec/specs/
   ```
   Confirm all validations pass with `0` issues and `src/` + `openspec/specs/` have zero diff.

## 6. Surgical Patch Checklist
- [ ] P01.1 Reconcile Executive Summary and Audit Matrix in `openspec/changes/mobile-render-profile/verification.md` and `openspec/changes/render-loop-efficiency/verification.md` with the recorded Playwright PASS results.
- [ ] P01.2 Update unchecked hardware tasks (`render-loop-efficiency/tasks.md` `4.4`; `mobile-render-profile/tasks.md` `1.0b`, `4.4`) with explicit deferred post-merge performance acceptance classification and add the coarse focus-entry pop check (`wall.css` `L1201-L1216`) to `4.4` / `verification.md`.
- [ ] P01.3 Run `openspec validate "render-loop-efficiency" --strict --json && openspec validate "mobile-render-profile" --strict --json && openspec validate --specs --strict` and verify zero diff outside the 5 target markdown files.
- [ ] P01.4 Check off `P01.1`–`P01.4`, mark `PATCH-01` `RESOLVED` in `openspec/changes/mobile-render-profile/patch.md`, commit, and push to `origin/feat/multi-20261125-2103`.
