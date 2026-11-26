# OpenCode Orchestration Handoff: OpenSpec Change 'alabaster-glass-legibility'

You are the orchestration agent for OpenSpec change 'alabaster-glass-legibility', running in OpenCode.
Your primary directive is to execute this change using the **`openspec-apply-sub`** skill, which delegates task implementation to the `spec-coder-sub` subagent.

## 1. Orchestration Directive
- **Change name:** `alabaster-glass-legibility`
- **Change directory:** `openspec/changes/alabaster-glass-legibility/`
- **Target skill:** `openspec-apply-sub` (or `/opsx:apply-sub alabaster-glass-legibility`)
- **Branch:** `feat/alabaster-glass-legibility`. It already exists, is based on `main` @ `b3cceff`, and has the planning commit `679af2b` on top. Do not branch again and do not work on `main`.
- **Architecture paradigm:** Vertical Slice Architecture (VSA). This change lives entirely in the placard theme/CSS slice, so don't add shared helpers outside the new test file.
- **Read first:** `research.md` (glossary and verified contrast facts), `architecture.md` (D1–D4), `specs/3d-pbr-wall-and-lighting/spec.md`, `design.md`, `tests.md`, `tasks.md`.

## 2. Target Context Map
Line numbers are on `main` @ `b3cceff`. Apply the `wall.css` edits **bottom-up** (`L1271` → `L727` → `L229`), or re-locate each target by its selector, because the earlier deletions shift the later lines.

| File Path (relative to repo root) | Target Lines | Modification Summary |
|---|---|---|
| `src/lib/lighting/playgroundTheme.ts` | `L72-L74` | In `PLAYGROUND_THEMES.alabaster`, set `glassInk: '#F4F6F4'`, `glassCap: 'rgba(240, 244, 241, 1)'` and `glassShadow: 'none'`. Touch nothing else (D1). |
| `src/styles/wall.css` | `L1271-L1279` | Delete the coarse Alabaster rule (`[data-mood='alabaster'] .playground-wall-root .museum-placard.mat-acrylic, .playground-wall-root[data-mood='alabaster'] .museum-placard.mat-acrylic { background: … 0.7 … }`) inside `@media (pointer: coarse)`. Keep the coarse generic rule (`L1251`, with `backdrop-filter: none`) and the coarse Concrete rule (`L1261`) (D2). |
| `src/styles/wall.css` | `[NEW]` after `L727` | Directly after the `.playground-wall-root .museum-placard.mat-acrylic { … }` base rule, add an unconditional rule with the same dual selector. It sets `background` only: `linear-gradient(138deg, rgba(30, 36, 33, 0.78) 0%, rgba(22, 27, 24, 0.74) 55%, rgba(34, 40, 36, 0.78) 100%)`. No `backdrop-filter` and no other properties (D2). |
| `src/styles/wall.css` | `L229-L322` | Delete the dead `[data-material=…]` block, from the `/* Beveled Glass Standoff (default): …` comment through the closing `}` of `.museum-placard[data-material='rag-paper']`. Keep `L194-L226` (the `.museum-placard` base and `.placard-*` rules) and `L324-L332` (`[data-tier='macro']`) (D3). |
| `src/lib/__tests__/placardGlassLegibility.test.ts` | `[NEW]` | The source-text contrast and selector audit described in `tests.md` and `architecture.md` D4. Model it on `src/lib/__tests__/touchAudit.test.ts` (`readFileSync` plus rule extraction). |
| `openspec/specs/3d-pbr-wall-and-lighting/spec.md` | `L52-L60` + append | **Only at sync time** (§8): replace the "Offline suncalc NYC solar circadian…" requirement with the MODIFIED block and append the ADDED "Beveled Glass placard text is legible in every lighting mood" requirement. |

## 3. Technical & Architectural Boundaries
- **In-scope decisions:**
  - **D1: ink lives in the theme data.** Alabaster glass ink changes only through `PLAYGROUND_THEMES.alabaster`, which `playgroundThemeStyle()` already maps to `--glass-ink`, `--glass-cap` and `--glass-text-shadow`. `'none'` is a valid `text-shadow`, so the `var(…, fallback)` in `wall.css:729-741` resolves to `none`. Don't hard-code Alabaster text colours in CSS.
  - **D2: one Alabaster plate.**
    - The unconditional rule has specificity (0,4,0). It therefore beats the desktop base (0,3,0) and the coarse generic rule (0,3,0) whatever the source order, so desktop and phone compute the same gradient.
    - It sets `background` only, so desktop keeps `backdrop-filter: blur(2.5px)` from the base rule and coarse keeps `none` from the coarse generic rule.
    - Use the dual selector form, because `data-mood` can sit on the root or on an ancestor (`PhotoWallApp.tsx:139`).
  - **D3: the dead `[data-material]` CSS goes.** No element sets `data-material` (see research.md Verified facts). The deletion is pixel-neutral by construction, and parity proves it.
  - **D4: a browser-free contrast gate.** The test parses `rgba()` stops and line opacities from `wall.css` and computes WCAG ratios (`(L1+0.05)/(L2+0.05)`, sRGB-linearised luminance). Each line's ink is composited at its opacity over the plate stop, and the stop over the mood's `wallBase`. Read `wallBase` from `PLAYGROUND_THEMES`.
- **Hard exclusions / no-go:**
  - Do NOT modify `.env`, `.env.*` or credential files.
  - Do NOT introduce any dependency, including a colour or contrast package.
  - Do NOT modify code outside the Target Context Map. In particular, don't touch:
    - the Chiaroscuro/Concrete theme values;
    - any `.mat-aluminum` or `.mat-foamcore` rule;
    - `.placard-soundtrack`, `.placard-track*` or `.placard-timecode` rules;
    - `AlbumPlacard.tsx`, `placardMaterial.ts`, `nyTimeMood.ts`, `moodBlend.ts` or `tokens.css`;
    - `DEFAULT_PLACARD_MATERIAL`;
    - anything under `playgrounds/`.
  - Do NOT edit any existing test file. `touchAudit.test.ts`, `nyTimeMood.test.ts` and `playgroundLighting.test.ts` must pass unchanged.
  - Do NOT remove or restyle the soundtrack divider, track name, marquee or timecode, or add text-shadow, strokes or halos to Alabaster glass text.
  - **Shared infrastructure:**
    - Preview and production share the production Turso DB and Bunny storage. Verify only on local dev (`STORAGE_DRIVER=local`) with `?demo=4&mood=<m>`, and never write against preview or production.
    - Another agent session shares the main checkout. Work in this worktree only.
    - Never `git add -A`; stage explicit paths.
    - Never use a bare `git stash`/`git stash pop`.
    - Stop only the processes you started (by PID). Never `pkill -f next-server`.
    - Keep Playwright profile exports and any cookie JSON out of the repo.

## 4. Visual & UI Design Specifications & Vision Verification
- **Theme:** Alabaster Beveled Glass Legibility. The plate is dark smoked glass with light lettering in every mood.
- **Key tokens:**
  - Ink: title `#F4F6F4`; cap `rgba(240, 244, 241, 1)`, rendered at opacity 0.72 for meta/timecode and 0.92 for the track name; text-shadow `none`.
  - Background: Alabaster `wallBase` `#CBC6BC` (unchanged).
  - Surface: the Alabaster plate `rgba(30,36,33,.78) / rgba(22,27,24,.74) / rgba(34,40,36,.78)`, composited middle stop about `#454743`.
  - Divider: `rgba(255, 255, 255, 0.18)` (unchanged).
- **Expected contrast,** worst stop over `#CBC6BC`:

  | Line | Ratio |
  | :--- | :--- |
  | Title | 8.21 |
  | Caption | 8.03 |
  | Track name | 7.10 |
  | Meta/timecode | 5.09 |
  | Before: title | 1.81 coarse / 3.08 desktop |

  Chiaroscuro and Concrete already pass and must not change.
- **Component anatomy and states:** the 214×200 geometry, typography (`wall.css:561-657`), bevel borders, inset highlight, standoff pins, `.is-lit::after` falloff, hover lift and focus all stay as they are. Only Alabaster `.mat-acrylic` ink and plate change.
- **Responsive layout:**
  - **Phone `(pointer: coarse)`:** the same plate as desktop, with `backdrop-filter: none`.
  - **Desktop `(pointer: fine)`:** the same plate, with `backdrop-filter: blur(2.5px)`.
  - No layout or touch-target change.
- **Multi-modal vision verification:**
  - `deepseek-flash` natively supports vision inputs. For the parity task, capture screenshots with Playwright (`?demo=4&mood=alabaster|concrete|chiaroscuro`, material set via `localStorage['photo-wall:placard-material']` = `acrylic`/`aluminum`/`foamcore`) and inspect the before/after Alabaster placard crops directly. Confirm the light lettering, the lack of any halo, and that the soundtrack footer is present.
  - The real-iPhone check and the "footer crowding" judgement are subjective hardware checks. Mark them `PENDING MANUAL DEVICE VERIFICATION` for maintainer review, and complete every automated code, test and parity task.

## 5. Test Scaffolding & Verification Commands
- **Primary test runner:** Vitest 5 (`npm test` = `vitest run`, Node environment).
  - Narrow loop: `npx vitest run src/lib/__tests__/placardGlassLegibility.test.ts`
  - Guard files: `npx vitest run src/lib/__tests__/touchAudit.test.ts src/lib/lighting/__tests__/nyTimeMood.test.ts src/lib/lighting/__tests__/playgroundLighting.test.ts`
  - Full gates: `safe-test npx vitest run`, `npx tsc --noEmit`, `npx eslint .`, `npm run build`
- **TDD requirement:** task group 1 MUST scaffold the failing audit before `playgroundTheme.ts` or `wall.css` is touched. Confirm the Alabaster-ink, plate, contrast and dead-selector cases fail, and the "unchanged", "footer kept" and can-fail guard cases pass. Save the run to `openspec/changes/alabaster-glass-legibility/logs/`.
- **Parity harness:**
  - Adapt `openspec/changes/gyro-relative-recenter/parity/desktop-parity.mjs` into `openspec/changes/alabaster-glass-legibility/parity/placard-parity.mjs`. Add the mood × material matrix plus a coarse-emulation Alabaster × `acrylic` capture (393×852, `hasTouch`, `isMobile`).
  - Build `b3cceff` (base) and head into separate directories, then serve each with `next start` on free ports. Record the PIDs and stop only those PIDs afterwards.
  - Write the screenshots and `report.json` under the change's `parity/`, keeping only the small placard crops and the report in git.
- **Resource and concurrency rules:**
  - During task implementation, run ONLY the narrowest test file for the modified code. Do NOT run full discovery or headless browser suites on every checkbox.
  - Wrap full regression runs with `safe-test` (for example `safe-test npx vitest run`), and run Playwright with a single worker.

## 6. Implementation Task Checklist
- [ ] 1.1 Create `src/lib/__tests__/placardGlassLegibility.test.ts`. Add a CSS-rule extractor that strips comments and records each rule's selector, body and whether it sits inside `@media (pointer: coarse)`; follow `touchAudit.test.ts`'s approach. Add an `rgba()`/hex parser and the WCAG composite-contrast helper.
- [ ] 1.2 Write failing tests for "Beveled Glass placard text is legible in every lighting mood":
  - the Alabaster glass ink values;
  - Chiaroscuro/Concrete unchanged;
  - exactly one unconditional Alabaster `.mat-acrylic` plate rule with stops `0.78/0.74/0.78`;
  - no coarse Alabaster `.mat-acrylic` rule;
  - the coarse generic rule still has `backdrop-filter: none`;
  - the ≥ 4.5:1 floor for every mood × stop × line, with opacities parsed from `wall.css`;
  - the pre-change Alabaster inputs measure below 4.5 (a can-fail guard);
  - no `[data-material` in `wall.css`;
  - the soundtrack footer kept.
- [ ] 1.3 Run `npx vitest run src/lib/__tests__/placardGlassLegibility.test.ts`. Confirm that the Alabaster-ink, plate, contrast and dead-selector cases fail for the expected reasons, and that the "unchanged", "footer kept" and can-fail guard cases pass. Record the output in `logs/`.
- [ ] 2.1 Set the Alabaster `glassInk`, `glassCap` and `glassShadow` in `PLAYGROUND_THEMES` (D1).
- [ ] 2.2 Delete the coarse Alabaster `.mat-acrylic` rule inside `@media (pointer: coarse)` (D2).
- [ ] 2.3 Add the unconditional dual-selector Alabaster `.mat-acrylic` `background` rule directly after the `.playground-wall-root .museum-placard.mat-acrylic` base rule (D2).
- [ ] 2.4 Delete the dead `[data-material=…]` block, keeping the live `.museum-placard` base, the `.placard-*` text rules and the `[data-tier='macro']` rules (D3).
- [ ] 2.5 Make 1.2 pass. Confirm `touchAudit.test.ts`, `nyTimeMood.test.ts` and `playgroundLighting.test.ts` are green and unchanged.
- [ ] 3.1 Run the full gates and record the pass counts against the baseline: `npx vitest run` (the serialized full suite), `npx tsc --noEmit`, `npx eslint .` and `npm run build`.
- [ ] 3.2 Run the desktop parity matrix from `tests.md` against `b3cceff` and head, and save the script under `parity/`:
  - every combination other than Alabaster × `acrylic` must show 0 differing pixels and identical computed styles;
  - for Alabaster × `acrylic` (fine and coarse emulation), record the computed `color`, `text-shadow`, `background-image` and `backdrop-filter`, plus before/after crops.
- [ ] 3.3 Sample the composited plate pixel next to the timecode in the Alabaster desktop screenshot. Record the measured contrast, and resolve or carry forward the research.md spot-lit-wall and `backdrop-filter` assumptions.
- [ ] 3.4 Run the `tests.md` manual checks on a real iPhone (Safari) and a desktop browser. Mark any check that couldn't run as `PENDING MANUAL DEVICE VERIFICATION`, and don't claim it passed. Record the footer-crowding observation as a follow-up only.
- [ ] 3.5 Populate `verification.md`:
  - a Requirement Adherence Matrix covering every scenario in `specs/3d-pbr-wall-and-lighting/spec.md`;
  - the parity result;
  - the measured contrast table;
  - resolved assumptions;
  - a nomenclature audit (Beveled Glass, glass ink, Alabaster plate, coarse profile, composited plate colour, dead `[data-material]` rules);
  - verbatim logs.

## 7. Post-Implementation & Verification Obligations
When `spec-coder-sub` finishes:
1. Verify that every checkbox in `tasks.md` that genuinely ran and passed is marked `- [x]`. Task 3.4 stays unchecked unless a human actually ran the device check. Never tick a box for work that didn't run.
2. **Data preservation:** not applicable. No data model, DB or storage is touched. Confirm that no local or remote data was written.
3. Ensure `openspec/changes/alabaster-glass-legibility/verification.md` is populated with:
   - Executive Summary & Environment (commit SHAs, Node/Vitest/Next versions, browser engine);
   - a Requirement Adherence Audit Matrix mapping every spec scenario (MODIFIED and ADDED) to its verifying test or parity artifact;
   - Resolved Assumptions & Empirical Proof (the spot-lit pixel sample, `backdrop-filter`, and the device check status);
   - a Nomenclature & Code Symbol Audit;
   - Verbatim Execution Logs.
4. Run verification automatically via `openspec-verify-change`.

## 8. Verification Review & Single-Pass Automated Repair (Max Retries = 1)
- **If verification succeeds with zero critical issues:**
  1. Sync the delta specs with the `openspec-sync-specs` skill for `alabaster-glass-legibility`. Then confirm `openspec validate --specs --strict` passes.
  2. **Open a pull request:**
     - Stay on `feat/alabaster-glass-legibility`.
     - Stage explicit paths only:
       ```bash
       git add openspec/changes/alabaster-glass-legibility openspec/specs/3d-pbr-wall-and-lighting/spec.md src/lib/lighting/playgroundTheme.ts src/styles/wall.css src/lib/__tests__/placardGlassLegibility.test.ts
       ```
     - Commit, then `git push -u origin HEAD`.
     - Open the PR with `gh pr create`. Use the title `fix(placard): legible Beveled Glass ink in Alabaster`, and a body summarizing `proposal.md` and `verification.md`, including the before/after contrast table and the parity result. Report the PR URL.
     - Don't merge.
- **If CRITICAL issues or failed test verification errors are detected on the initial pass:**
  1. Announce: "Verification failed on initial pass. Attempting a single bounded repair pass via subagent..."
  2. Delegate a single-pass repair task to `spec-coder-sub` with the verification failure context:
     > "Fix the specific verification failures and test errors reported for change 'alabaster-glass-legibility'. Refer to the error log, make minimal targeted patches to resolve the failures, run verification commands, and update tasks.md."
  3. Re-run verification via `openspec-verify-change`.
  4. **If verification passes after repair:** sync the delta specs via `openspec-sync-specs`, then stage the explicit paths above, commit, push the branch and open the PR.
  5. **If verification STILL fails after the single repair pass:** **HALT**. Do NOT loop or re-run. Present the Verification Report and remaining blockers to the user for manual guidance.
