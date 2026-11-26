# OpenCode Orchestration Handoff: OpenSpec Change 'sheen-glare-tuning'

You are the orchestration agent for OpenSpec change `sheen-glare-tuning`, running in OpenCode. Execute this change with the **`openspec-apply-sub`** skill, which hands task implementation to the `spec-coder-sub` subagent.

## 1. Orchestration Directive
- **Change Name:** `sheen-glare-tuning`
- **Target Skill:** `openspec-apply-sub` (or `/opsx:apply-sub sheen-glare-tuning`)
- **Architecture Paradigm:** Vertical Slice Architecture (VSA). This change is a single CSS slice plus one static audit test. Don't add abstractions, helpers, or JS.
- **Branch:** create `feat/sheen-glare-tuning` from `main` (at or after `8a5e2d2`) before touching code. Don't commit on `main`.
- **Goal (from `proposal.md`):**
  - Halve `.photo-sheen` glare intensity on **every** device through one `--sheen-strength: 0.5` multiplier.
  - On `(pointer: coarse)` only, rest the glare in the **top-right** of the photo through `--sheen-anchor: 65% 35%`.
  - Desktop keeps the centred resting position and the mouse sweep.

## 2. Target Context Map
Line numbers are on `main` @ `2b14783`. Re-read the file before editing; the lines may have shifted by a few.

| File Path (relative to repo root) | Target Lines | Modification Summary |
|---|---|---|
| `src/styles/wall.css` | `L437` (the `.playground-wall-root` variable block, next to `--sheen-intensity: 0.44;`) | Add `--sheen-strength: 0.5;`. Declare it exactly once in the whole file. |
| `src/styles/wall.css` | `L1147-L1163` (base `.playground-wall-root .photo-sheen` rule) | Replace only the `background` declaration with: `radial-gradient(ellipse 46% 42% at var(--sheen-anchor, 50% 50%), rgba(255, 255, 255, calc(0.38 * var(--sheen-strength))) 0%, rgba(255, 253, 246, calc(0.14 * var(--sheen-strength))) 44%, rgba(255, 253, 246, 0) 74%)`. Leave `inset`, `opacity: var(--sheen-intensity)`, `mix-blend-mode: screen`, `transition`, and everything else exactly as they are. |
| `src/styles/wall.css` | `L1197-L1199` (inside the existing `@media (pointer: coarse)` block: `.playground-wall-root .photo-frame.focused .photo-sheen, .playground-wall-root .print-sharp-overlay .photo-sheen { mix-blend-mode: normal; }`) | Add `--sheen-anchor: 65% 35%;` to **this same rule**. Keep `mix-blend-mode: normal`. Don't declare `--sheen-anchor` anywhere else. |
| `src/lib/__tests__/sheenGlareAudit.test.ts` | `[NEW]` | A static CSS audit of `src/styles/wall.css`, following the rule-parsing approach in `src/lib/__tests__/touchAudit.test.ts` (see §5). |

## 3. Technical & Architectural Boundaries
- **In-Scope Decisions** (`architecture.md`):
  - **D1:** scale the gradient's alpha stops through `calc(a * var(--sheen-strength))`, not opacity. Both the `screen` and `normal` blends are linear in source alpha, so this equals halving opacity at rest (`0.44`) and when active (`0.92`) while keeping the falloff shape.
  - **D2:** the anchor is a custom property with a centred fallback, `at var(--sheen-anchor, 50% 50%)`. Fine pointers never set it, so desktop resolves exactly `50% 50%`. The inline `translate3d(-nx*38%, -ny*38%, 0)` written by the mouse and gyro keeps working as an offset from the anchor.
  - **D3:** put the anchor on the existing coarse rule that pairs `.photo-frame.focused .photo-sheen` with `.print-sharp-overlay .photo-sheen`, so the frame and the `PrintSharpOverlay` sheen can't diverge. The overlay copies only the inline `transform` and `opacity`; it gets the gradient, blend and anchor from CSS.
  - **D4:** guard the change with the new static audit. `touchAudit.test.ts` stays unchanged.
- **Hard Exclusions / No-Go:**
  - Don't modify `.env`, `.env.*`, or credential files.
  - Don't introduce any external dependency.
  - Don't modify anything outside the Target Context Map. In particular, leave these alone:
    - `src/components/wall/FramedPrint.tsx`: the inline `'0.92'` opacity writes, and the mouse and gyro translation maths;
    - `src/components/wall/PrintSharpOverlay.tsx` and `printSharpOverlaySync.ts`;
    - `src/components/wall/useGyroTilt.ts` and `gyroTilt.ts`;
    - `src/lib/__tests__/touchAudit.test.ts`;
    - `playgrounds/`.
  - Don't change the desktop resting position, the ellipse size (`46% 42%`), `--sheen-intensity`, any `transition`, or the blend modes. Don't reintroduce `mix-blend-mode: screen` on coarse pointers, and don't add per-mood sheen overrides.
  - Don't add `--sheen-size`. It's a deferred device-tuning knob, and you only record it in `verification.md`.
  - **Data safety:** preview and production share the production Turso database and Bunny storage. Verify only on local dev with a local DB and `STORAGE_DRIVER=local`. Never write against preview or production. Viewing the preview read-only is fine.

## 4. Visual & UI Design Specifications & Vision Verification
- **Theme:** Chiaroscuro Gallery: Softer, Corner-Resting Glare (`design.md`).
- **Key Tokens:**
  - `--sheen-strength: 0.5`, on all pointers (`1` is the previous look).
  - `--sheen-intensity: 0.44` rest opacity, unchanged. Inline hover/gyro opacity `0.92`, unchanged.
  - Gradient stops: core `rgba(255,255,255, calc(0.38 * var(--sheen-strength)))`, mid `rgba(255,253,246, calc(0.14 * var(--sheen-strength)))` at 44%, edge `rgba(255,253,246,0)` at 74%. Ellipse `46% 42%`.
  - Anchor: fine `50% 50%` (the fallback); coarse `65% 35%`, which is about 84% across and 16% down the photo, because the sheen box is `inset: -65%`, i.e. 230% of the photo.
  - Peak veil when active is about `0.17` (was about `0.35`).
- **Component States (`.photo-sheen`, frame and overlay):**
  - **Fine pointer, idle:** centred, rest opacity, half the previous peak.
  - **Fine pointer, hover (mouse):** same sweep as before (`±38%` of the box), opacity `0.92`, half the previous peak.
  - **Coarse pointer, Print Focus idle:** rests top-right. This is also the permanent state under Reduce Motion, with motion permission denied, or with no sensor.
  - **Coarse pointer, gyro tilting:** sweeps from the top-right anchor with unchanged sign and amplitude.
  - **Coarse Album View:** still hidden.
- **Responsive:** gate on `@media (pointer: coarse)` capability, never on width. No touch targets change.
- **Multi-Modal Vision Verification:**
  - `deepseek-flash` natively supports vision inputs. Capture screenshots with Playwright, before and after, in all three moods (`chiaroscuro`, `concrete`, `alabaster`):
    - fine-pointer desktop: idle, album, print, hovered print, hovered placard, Studio;
    - coarse-emulated (`hasTouch` + `isMobile`) Print Focus at rest.
  - Inspect the image files directly. Confirm that the coarse glare sits top-right and the centre of the photo is unveiled, and that the desktop glare is centred and visibly softer.
  - The real iPhone, Android and strength/anchor judgement checks need physical hardware. Leave them as `PENDING MANUAL DEVICE VERIFICATION` and never claim they passed.

## 5. Test Scaffolding & Verification Commands
- **Primary Test Runner:** `npx vitest run` (Vitest, Node environment).
- **Narrow loop:** `npx vitest run src/lib/__tests__/sheenGlareAudit.test.ts`
- **New audit (`sheenGlareAudit.test.ts`) asserts:**
  - `.playground-wall-root` declares `--sheen-strength: 0.5` exactly once, and no other rule declares it;
  - the base `.playground-wall-root .photo-sheen` `background` is a `radial-gradient` that contains `ellipse 46% 42%` and `at var(--sheen-anchor, 50% 50%)`, with stops `calc(0.38 * var(--sheen-strength))` and `calc(0.14 * var(--sheen-strength))` and an outer stop alpha of `0`;
  - `--sheen-intensity: 0.44` is unchanged;
  - inside an `@media (pointer: coarse)` block, the rule whose selector list contains both `.photo-frame.focused .photo-sheen` and `.print-sharp-overlay .photo-sheen` declares `--sheen-anchor: 65% 35%`;
  - no rule outside `(pointer: coarse)` declares `--sheen-anchor`.
- **Must stay green unchanged:** `src/lib/__tests__/touchAudit.test.ts`, `src/components/wall/__tests__/useGyroTilt.test.ts`, `src/components/wall/__tests__/printSharpOverlaySync.test.ts`.
- **Full gates:** `npx vitest run` (full suite), `npx tsc --noEmit`, `npx eslint .`, `npm run build`.
- **Desktop scoped parity** (fine pointer): compare against the pre-change `main` build, using the computed-style and pixelmatch approach from `render-loop-efficiency` and `mobile-render-profile`. Pass when all three hold:
  1. the only computed-style difference is the `.photo-sheen` `background-image`;
  2. every pixel difference falls inside `.photo-sheen`-covered regions;
  3. with a temporary `--sheen-strength: 1` override, the result is **0 px**. Remove the override afterwards and never commit it.
- **Coarse emulated check:** the focused and overlay sheens' computed `background-image` contains the `65% 35%` position, and overlay alignment is ≤ 0.1 px.
- **TDD requirement:** task group 1 writes the failing audit first. Run it, confirm it fails for the missing variables, and record the output before editing `wall.css`.
- **Resource and concurrency rules:**
  - During tasks, run only the narrow test file.
  - For full-suite and browser runs, wrap with `safe-test` or use `--workers=1`. If `safe-test` hits the container's 4 GB Wasm cap, run the same serialized `npx vitest run` directly and record that in `verification.md`, as the previous batch did.
  - Run Playwright with one worker. Stop any temporary dev or parity servers you start.

## 6. Implementation Task Checklist
- [ ] 1.1 Write failing `src/lib/__tests__/sheenGlareAudit.test.ts` for "Glare intensity is halved on every pointer through a single strength multiplier":
  - a single `--sheen-strength: 0.5` declared on `.playground-wall-root`;
  - the base gradient's `calc(… * var(--sheen-strength))` stops;
  - `ellipse 46% 42%` and `--sheen-intensity: 0.44` unchanged.
- [ ] 1.2 Add failing cases to the same file for "Coarse-pointer glare rests in the top-right corner of the photo":
  - the base gradient is positioned `at var(--sheen-anchor, 50% 50%)`;
  - the coarse rule containing both `.photo-frame.focused .photo-sheen` and `.print-sharp-overlay .photo-sheen` declares `--sheen-anchor: 65% 35%`;
  - no rule outside `(pointer: coarse)` declares `--sheen-anchor`.
- [ ] 1.3 Run `npx vitest run src/lib/__tests__/sheenGlareAudit.test.ts`, confirm it fails for the expected reasons (missing variables), and record the output.
- [ ] 1.4 Capture the pre-change fine-pointer parity baseline (desktop harness states listed in `tests.md`) and the coarse emulated Print Focus screenshot from the current `main` build.
- [ ] 2.1 Add `--sheen-strength: 0.5;` to the `.playground-wall-root` variable block next to `--sheen-intensity` (D1).
- [ ] 2.2 Rewrite the base `.photo-sheen` `background` to `radial-gradient(ellipse 46% 42% at var(--sheen-anchor, 50% 50%), rgba(255, 255, 255, calc(0.38 * var(--sheen-strength))) 0%, rgba(255, 253, 246, calc(0.14 * var(--sheen-strength))) 44%, rgba(255, 253, 246, 0) 74%)`. Change nothing else in the rule (D1, D2).
- [ ] 2.3 Add `--sheen-anchor: 65% 35%;` to the existing `@media (pointer: coarse)` rule for `.photo-frame.focused .photo-sheen, .print-sharp-overlay .photo-sheen`, keeping `mix-blend-mode: normal` (D2, D3).
- [ ] 2.4 Make 1.1 and 1.2 pass, and confirm `touchAudit.test.ts`, `useGyroTilt.test.ts` and `printSharpOverlaySync.test.ts` stay green unchanged.
- [ ] 3.1 Run the full gates: `npx vitest run` (serialized full suite), `npx tsc --noEmit`, `npx eslint .`, `npm run build`. Record pass counts against the baseline.
- [ ] 3.2 Run the desktop scoped-parity harness. Pass when:
  - computed-style diffs are only the `.photo-sheen` `background-image`;
  - pixel diffs are confined to sheen-covered regions;
  - a temporary `--sheen-strength: 1` override yields 0 px.
  Remove the override afterwards.
- [ ] 3.3 Run the coarse emulated Print Focus check:
  - the focused and overlay sheens resolve the `65% 35%` position;
  - overlay alignment is ≤ 0.1 px;
  - save screenshots before and after for all three moods.
- [ ] 3.4 Run the `tests.md` manual device checks on a real iPhone (Safari) and a real Android phone (Chrome), plus the desktop hover check. Mark any check that couldn't run as `PENDING MANUAL DEVICE VERIFICATION`, and don't claim it passed.
- [ ] 3.5 Resolve or carry forward every `research.md` Unverified assumption (strength `0.5`, anchor `65% 35%`, perf neutral). Move anything disproved to Superseded claims.
- [ ] 3.6 Populate `verification.md`:
  - a Requirement Adherence Matrix covering every scenario in `specs/instanced-photo-renderer/spec.md`;
  - the parity results;
  - device and OS versions;
  - resolved assumptions;
  - a nomenclature audit (glare/sheen, sheen strength vs sheen intensity, sheen anchor, resting position, coarse/fine pointer);
  - verbatim logs.

## 7. Post-Implementation & Verification Obligations
When `spec-coder-sub` finishes:
1. Verify that every checkbox in `openspec/changes/sheen-glare-tuning/tasks.md` that genuinely ran and passed is marked `- [x]`. Device-only task 3.4 stays unchecked, or is marked partial with `PENDING MANUAL DEVICE VERIFICATION`.
2. Confirm the diff touches only `src/styles/wall.css` (three hunks), the new `src/lib/__tests__/sheenGlareAudit.test.ts`, and files in `openspec/`. Data preservation is not applicable, since there are no data model changes.
3. Make sure `openspec/changes/sheen-glare-tuning/verification.md` contains:
   - an executive summary and environment;
   - the Requirement Adherence Audit Matrix (all six scenarios mapped to their verifying test or check);
   - resolved assumptions and empirical proof (parity numbers, screenshots);
   - a nomenclature and code-symbol audit;
   - verbatim execution logs.
4. Run verification through `openspec-verify-change`.

## 8. Verification Review & Single-Pass Automated Repair (Max Retries = 1)
- **If verification succeeds with zero critical issues:**
  1. Sync the delta specs through the `openspec-sync-specs` skill for `sheen-glare-tuning`, then run `openspec validate --strict` on the change and the synced specs.
  2. **Open a Pull Request:**
     - Work on `feat/sheen-glare-tuning`. Create or switch to it if you're on `main`.
     - Stage explicit paths only, never `git add -A`: `git add openspec/changes/sheen-glare-tuning openspec/specs/instanced-photo-renderer/spec.md src/styles/wall.css src/lib/__tests__/sheenGlareAudit.test.ts`.
     - Commit, then push with `git push -u origin HEAD`.
     - Open the PR with `gh pr create`. Use a concise title (`feat(wall): halve print glare and rest it top-right on mobile`) and a body summarizing `proposal.md` and `verification.md`. List the pending device checks explicitly, and report the PR URL.
     - Don't merge the PR.
- **If CRITICAL issues or failing tests are found on the initial pass:**
  1. Announce: "Verification failed on initial pass. Attempting a single bounded repair pass via subagent..."
  2. Delegate a single-pass repair to `spec-coder-sub` with the failure context:
     > "Fix the specific verification failures and test errors reported for change 'sheen-glare-tuning'. Refer to the error log, make minimal targeted patches to resolve the failures, run verification commands, and update tasks.md."
  3. Re-run verification through `openspec-verify-change`.
  4. **If verification passes after the repair:** sync the specs, then stage explicit paths, commit, push the branch and open the PR as above.
  5. **If verification still fails after the single repair pass:** **HALT**. Don't loop or re-run. Present the Verification Report and the remaining blockers to the user for manual guidance.
