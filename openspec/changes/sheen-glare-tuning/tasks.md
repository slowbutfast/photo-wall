## Target Context Map

| File | Lines (on `main` @ `2b14783`) | Change |
| :--- | :--- | :--- |
| `src/styles/wall.css` | `L437` (`.playground-wall-root` variables) | Add `--sheen-strength: 0.5;` next to `--sheen-intensity` |
| `src/styles/wall.css` | `L1147-L1163` (base `.photo-sheen`) | Gradient position `at var(--sheen-anchor, 50% 50%)`; stops `calc(0.38 * var(--sheen-strength))` / `calc(0.14 * var(--sheen-strength))` |
| `src/styles/wall.css` | `L1197-L1199` (coarse focused + overlay sheen rule) | Add `--sheen-anchor: 65% 35%;` |
| `src/lib/__tests__/sheenGlareAudit.test.ts` | `[NEW]` | Static CSS audit (see `tests.md`) |

No other files change. In particular `FramedPrint.tsx`, `PrintSharpOverlay.tsx`, `useGyroTilt.ts`, `gyroTilt.ts`, and `touchAudit.test.ts` are out of bounds.

## 1. Test Scaffolding (TDD)

- [x] 1.1 Write failing `src/lib/__tests__/sheenGlareAudit.test.ts` for "Glare intensity is halved on every pointer through a single strength multiplier":
  - a single `--sheen-strength: 0.5` declared on `.playground-wall-root`;
  - the base gradient's `calc(… * var(--sheen-strength))` stops;
  - `ellipse 46% 42%` and `--sheen-intensity: 0.44` unchanged.
- [x] 1.2 Add failing cases to the same file for "Coarse-pointer glare rests in the top-right corner of the photo":
  - the base gradient is positioned `at var(--sheen-anchor, 50% 50%)`;
  - the coarse rule containing both `.photo-frame.focused .photo-sheen` and `.print-sharp-overlay .photo-sheen` declares `--sheen-anchor: 65% 35%`;
  - no rule outside `(pointer: coarse)` declares `--sheen-anchor`.
- [x] 1.3 Run `npx vitest run src/lib/__tests__/sheenGlareAudit.test.ts`, confirm it fails for the expected reasons (missing variables), and record the output.
- [x] 1.4 Capture the pre-change fine-pointer parity baseline (desktop harness states listed in `tests.md`) and the coarse emulated Print Focus screenshot from the current `main` build.

## 2. Glare intensity and anchor (`wall.css`)

- [x] 2.1 Add `--sheen-strength: 0.5;` to the `.playground-wall-root` variable block next to `--sheen-intensity` (D1).
- [x] 2.2 Rewrite the base `.photo-sheen` `background` to `radial-gradient(ellipse 46% 42% at var(--sheen-anchor, 50% 50%), rgba(255, 255, 255, calc(0.38 * var(--sheen-strength))) 0%, rgba(255, 253, 246, calc(0.14 * var(--sheen-strength))) 44%, rgba(255, 253, 246, 0) 74%)`. Change nothing else in the rule (D1, D2).
- [x] 2.3 Add `--sheen-anchor: 65% 35%;` to the existing `@media (pointer: coarse)` rule for `.photo-frame.focused .photo-sheen, .print-sharp-overlay .photo-sheen`, keeping `mix-blend-mode: normal` (D2, D3).
- [x] 2.4 Make 1.1 and 1.2 pass, and confirm `touchAudit.test.ts`, `useGyroTilt.test.ts` and `printSharpOverlaySync.test.ts` stay green unchanged.

## 3. Verification & Empirical Audit

- [x] 3.1 Run the full gates: `npx vitest run` (serialized full suite), `npx tsc --noEmit`, `npx eslint .`, `npm run build`. Record pass counts against the baseline.
- [x] 3.2 Run the desktop scoped-parity harness. Pass when:
  - computed-style diffs are only the `.photo-sheen` `background-image`;
  - pixel diffs are confined to sheen-covered regions;
  - a temporary `--sheen-strength: 1` override yields 0 px.
  Remove the override afterwards.
- [x] 3.3 Run the coarse emulated Print Focus check:
  - the focused and overlay sheens resolve the `65% 35%` position;
  - overlay alignment is ≤ 0.1 px;
  - save screenshots before and after for all three moods.
- [ ] 3.4 **PENDING MANUAL DEVICE VERIFICATION** (needs a real iPhone / Android phone and a human judgement of strength and anchor; not run by the implementing agent). Run the `tests.md` manual device checks on a real iPhone (Safari) and a real Android phone (Chrome), plus the desktop hover check. Mark any check that couldn't run as `PENDING MANUAL DEVICE VERIFICATION`, and don't claim it passed.
- [x] 3.5 Resolve or carry forward every `research.md` Unverified assumption (strength `0.5`, anchor `65% 35%`, perf neutral). Move anything disproved to Superseded claims.
- [x] 3.6 Populate `verification.md`:
  - a Requirement Adherence Matrix covering every scenario in `specs/instanced-photo-renderer/spec.md`;
  - the parity results;
  - device and OS versions;
  - resolved assumptions;
  - a nomenclature audit (glare/sheen, sheen strength vs sheen intensity, sheen anchor, resting position, coarse/fine pointer);
  - verbatim logs.
