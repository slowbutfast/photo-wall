## Target Context Map

| File | Lines (on `main` @ `b3cceff`) | Change |
| :--- | :--- | :--- |
| `src/lib/lighting/playgroundTheme.ts` | `L72-L74` (`alabaster.glassInk/glassCap/glassShadow`) | `'#F4F6F4'`, `'rgba(240, 244, 241, 1)'`, `'none'` (D1) |
| `src/styles/wall.css` | `[NEW]` after `L727` (end of `.playground-wall-root .museum-placard.mat-acrylic`) | Unconditional dual-selector Alabaster `.mat-acrylic` rule, `background` only, stops `0.78 / 0.74 / 0.78` (D2) |
| `src/styles/wall.css` | `L1271-L1279` (coarse Alabaster `.mat-acrylic` rule inside `@media (pointer: coarse)`) | Delete it. Keep the coarse generic (`L1251`) and Concrete (`L1261`) rules (D2) |
| `src/styles/wall.css` | `L229-L322` (`/* Beveled Glass Standoff (default)…` through the `[data-material='rag-paper']` rule) | Delete the dead `[data-material]` block. Keep `L194-L226` and `L324-L332` (D3) |
| `src/lib/__tests__/placardGlassLegibility.test.ts` | `[NEW]` | The source-text contrast and selector audit (D4, `tests.md`) |
| `openspec/specs/3d-pbr-wall-and-lighting/spec.md` | `L52-L60` + append | Sync at PR time: replace the solar-mood requirement with the MODIFIED block, and append the ADDED legibility requirement |

**Out of bounds:**
- the Chiaroscuro/Concrete theme values;
- every `.mat-aluminum` and `.mat-foamcore` rule;
- `.placard-soundtrack`/`.placard-track*`/`.placard-timecode` rules;
- `AlbumPlacard.tsx`, `placardMaterial.ts`, `nyTimeMood.ts`, `moodBlend.ts`, `tokens.css`;
- any existing test file;
- `playgrounds/`.

Do the edits in the order listed. Deleting `L229-L322` first shifts the other line numbers, so apply bottom-up (`L1271` → `L727` → `L229`), or re-locate each target by its selector.

## 1. Test Scaffolding (TDD)

- [x] 1.1 Create `src/lib/__tests__/placardGlassLegibility.test.ts`. Add a CSS-rule extractor that strips comments and records each rule's selector, body and whether it sits inside `@media (pointer: coarse)`; follow `touchAudit.test.ts`'s approach. Add an `rgba()`/hex parser and the WCAG composite-contrast helper.
- [x] 1.2 Write failing tests for "Beveled Glass placard text is legible in every lighting mood":
  - the Alabaster glass ink values;
  - Chiaroscuro/Concrete unchanged;
  - exactly one unconditional Alabaster `.mat-acrylic` plate rule with stops `0.78/0.74/0.78`;
  - no coarse Alabaster `.mat-acrylic` rule;
  - the coarse generic rule still has `backdrop-filter: none`;
  - the ≥ 4.5:1 floor for every mood × stop × line, with opacities parsed from `wall.css`;
  - the pre-change Alabaster inputs measure below 4.5 (a can-fail guard);
  - no `[data-material` in `wall.css`;
  - the soundtrack footer kept.
- [x] 1.3 Run `npx vitest run src/lib/__tests__/placardGlassLegibility.test.ts`. Confirm that the Alabaster-ink, plate, contrast and dead-selector cases fail for the expected reasons, and that the "unchanged", "footer kept" and can-fail guard cases pass. Record the output in `logs/`.
  - Result: 5 failed / 6 passed as expected (`logs/1.3-tdd-red.log`); green run 11/11.

## 2. Theme and CSS (`playgroundTheme.ts`, `wall.css`)

- [x] 2.1 Set the Alabaster `glassInk`, `glassCap` and `glassShadow` in `PLAYGROUND_THEMES` (D1).
- [x] 2.2 Delete the coarse Alabaster `.mat-acrylic` rule inside `@media (pointer: coarse)` (D2).
- [x] 2.3 Add the unconditional dual-selector Alabaster `.mat-acrylic` `background` rule directly after the `.playground-wall-root .museum-placard.mat-acrylic` base rule (D2).
- [x] 2.4 Delete the dead `[data-material=…]` block, keeping the live `.museum-placard` base, the `.placard-*` text rules and the `[data-tier='macro']` rules (D3).
- [x] 2.5 Make 1.2 pass. Confirm `touchAudit.test.ts`, `nyTimeMood.test.ts` and `playgroundLighting.test.ts` are green and unchanged.
  - Result: new audit 11/11; guard group 45/45.

## 3. Verification & Empirical Audit

- [x] 3.1 Run the full gates and record the pass counts against the baseline: `npx vitest run` (the serialized full suite), `npx tsc --noEmit`, `npx eslint .` and `npm run build`.
  - Result: 41 files / 621 tests passed; `tsc` and `eslint` exit 0; `next build` exit 0 (`logs/3.1-*`).
  - `safe-test` applies `ulimit -v` and cannot instantiate the suite's WebAssembly at 4/8/16 GB caps; the direct run is recorded (`logs/3.1-safe-test-wrapper-failure.log`).
- [x] 3.2 Run the desktop parity matrix from `tests.md` against `b3cceff` and head, and save the script under `parity/`:
  - every combination other than Alabaster × `acrylic` must show 0 differing pixels and identical computed styles;
  - for Alabaster × `acrylic` (fine and coarse emulation), record the computed `color`, `text-shadow`, `background-image` and `backdrop-filter`, plus before/after crops.
  - Result: 12/12 non-target combinations 0 px / 0 style diffs; target 43,152 px, all inside placards; coarse gradient identical with `backdrop-filter: none` (`logs/3.2-parity.log`, `parity/report.json`).
- [x] 3.3 Sample the composited plate pixel next to the timecode in the Alabaster desktop screenshot. Record the measured contrast, and resolve or carry forward the research.md spot-lit-wall and `backdrop-filter` assumptions.
  - Result: plate `#40433e`, wall `#b3ada6`, timecode contrast **5.60:1**; `backdrop-filter: blur(2.5px)` measured.
- [ ] 3.4 Run the `tests.md` manual checks on a real iPhone (Safari) and a desktop browser. Mark any check that couldn't run as `PENDING MANUAL DEVICE VERIFICATION`, and don't claim it passed. Record the footer-crowding observation as a follow-up only.
  - Desktop checks passed from the head production-build parity crops (legibility, footer kept, other moods/materials identical).
  - **PENDING MANUAL DEVICE VERIFICATION:** real iPhone Safari legibility/marquee motion; footer-crowding observation is a follow-up only.
- [x] 3.5 Populate `verification.md`:
  - a Requirement Adherence Matrix covering every scenario in `specs/3d-pbr-wall-and-lighting/spec.md`;
  - the parity result;
  - the measured contrast table;
  - resolved assumptions;
  - a nomenclature audit (Beveled Glass, glass ink, Alabaster plate, coarse profile, composited plate colour, dead `[data-material]` rules);
  - verbatim logs.
