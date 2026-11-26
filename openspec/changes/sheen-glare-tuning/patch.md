### [PATCH-01] Raise glare strength from 50% to 80%
- **Date**: 2026-11-26
- **Feedback Source**: Manual review of PR #15 (maintainer)
- **Feedback Summary**: At `--sheen-strength: 0.5` the glare read as too faint. The maintainer asked to restore it to about 80% of the original strength on every device. The mobile top-right anchor (`--sheen-anchor: 65% 35%`) is unchanged.
- **Reported Issue / Raw Trace**: "can you restore the glare intensity to about 80% the original strength?"
- **Root Cause**: The tuning value only. D1's single-multiplier design means no structural change is needed.
- **Target Files**: `src/styles/wall.css` (`--sheen-strength`), `src/lib/__tests__/sheenGlareAudit.test.ts`, the delta spec and the synced `openspec/specs/instanced-photo-renderer/spec.md`, `proposal.md`, `design.md`
- **Resolution Strategy**: Set `--sheen-strength: 0.8`. Peak active alpha goes from ≈ 0.17 to ≈ 0.28 (the original was ≈ 0.35). Update the audit expectation and the requirement wording from "halved" to "80%".
- **Status**: RESOLVED. Audit and full gates re-run, see `verification.md` § PATCH-01. Device judgement is still pending (task 3.4).
