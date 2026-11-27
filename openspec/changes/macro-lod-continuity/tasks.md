## Target Context Map

All line numbers are on `b616dbc` (`origin/main`). Re-read each file before editing.

| File | Lines | Change |
|---|---|---|
| `src/components/wall/zoomTier.ts` | L25, L88-91 | Add `MACRO_PROMOTE_SCALE = 0.25` (keep `MACRO_SCALE_THRESHOLD` as an alias) and `MACRO_DEMOTE_SCALE = 0.22`. `resolveZoomTier(scale, printFocused = false, previous?: ZoomTier)` with hysteresis (architecture D1). `TIER_STYLES` untouched. |
| `src/components/wall/GalleryCanvas.tsx` | L280 area (refs), L358, L433-436 | Add `committedTierRef`. The rAF loop reads, computes and writes it; the render path only reads it (D2). Optionally extract a pure `commitZoomTier` helper for testability. |
| `src/components/wall/GalleryCanvas.tsx` | L263, L290, L1010-1017 | `useMemo` the palette from `theme`, `placardMaterial` and `coarsePointer` (D5), and pass `palette` to `<MacroIsland>`. |
| `src/components/wall/macroMosaic.ts` | L61-69 (`MosaicPlan`), L76-125 (`planMacroMosaic`) | Add `soundtrack: MosaicRect \| null` and `placardLines: MosaicRect[]` (D3; bar rects from design.md §3). Add the pure `resolveMacroMosaicPalette(theme, material, coarse)` and the `MacroMosaicPalette` type with `key` (D4). |
| `src/components/wall/MacroIsland.tsx` | L39-47 (`mosaicSignature`), L65-78 (`paintPlaceholder`), L94-140 (`mosaicFor`), L161-167 (props) | Add the `palette` prop. The signature includes `palette.key` and whether a description exists. The painter draws the plate, edges, bars and slot per design.md, with a solid fallback when `createLinearGradient` is missing. Remove the pale fill and stroke. |
| `src/lib/lighting/playgroundTheme.ts` | L9-26 (interface), L28-83 (themes) | Add `macroPlate: { fine: [s, s, s]; coarse: [s, s, s] }` per mood, with values from design.md §2. |
| `src/components/wall/__tests__/zoomTier.test.ts` | L152-166 + new | Hysteresis table, jitter fold and can-fail guard. Existing assertions unchanged. |
| `src/components/wall/__tests__/snapshotKey.test.ts` (or `[NEW]` `galleryTierCommit.test.ts`) | new | The tier commit helper and the call-site audit. |
| `src/components/wall/__tests__/macroMosaic.test.ts` | new cases | Soundtrack rect and placard lines. |
| `src/components/wall/__tests__/MacroIsland.test.tsx` | L27, L95 (fake ctx) + new | Extend the fake; paint assertions; no `fillText`; palette signature replacement. |
| `src/lib/__tests__/macroPaletteAudit.test.ts` | `[NEW]` | Theme stops against `wall.css`, plus a can-fail guard. |
| `openspec/changes/macro-lod-continuity/parity/macro-parity.mjs` | `[NEW]` | Overview scale measurement, resting parity, confined macro diff, hysteresis probe, island count. |

**Out of bounds:**
- `wall.css`, `tokens.css` and `hud.css` (no CSS changes in this change);
- `AlbumTier` / `AlbumPlacard` / `SoundtrackPlaque` / `FramedPrint`;
- `PrintSharpOverlay`, `useGyroTilt`, `PlaygroundPbrWall`, `islandLayout.ts`;
- camera maths and flights;
- `PhotoWallApp.tsx`, `CuratorStudio.tsx`, `PlaygroundGallery.tsx`;
- `playgrounds/`.

## 1. Test Scaffolding (TDD)

- [x] 1.1 Measure first. Run `macro-parity.mjs --measure-only` against base `b616dbc`. Record the Overview-settled CSS scale for `?demo=4` (1440×900, 393×852 coarse) and `?demo=1000` (1440×900) in `logs/1.1-overview-scale.log`. Note in research.md (Verified facts) whether any value falls in `[0.22, 0.25)`. If one does, continue but flag it in verification.md; don't change the Overview framing.
- [x] 1.2 Write failing tests for hysteresis in `zoomTier.test.ts`: the constants, the `previous` table, the jitter fold with exactly 1 change, and the can-fail guard showing at least 4 changes without `previous`.
- [x] 1.3 Write failing tests for the tier commit: the `commitZoomTier` helper (or an equivalent) and the `GalleryCanvas.tsx` call-site audit (three-argument calls at both sites, with the ref written only in the rAF loop).
- [x] 1.4 Write failing tests for footprint geometry in `macroMosaic.test.ts`: `plan.soundtrack` against `grid.soundtrack`, `null` without a soundtrack, `placardLines` count by description, and the bars inside the plate.
- [x] 1.5 Write failing tests for footprint paint in `MacroIsland.test.tsx`: extend the fake context, then assert the plate stops, slot fill, bar rects, zero `fillText`, no pale fill, no extra `Image.src`, the gradient fallback and palette-signature replacement.
- [x] 1.6 Write a failing `src/lib/__tests__/macroPaletteAudit.test.ts`: theme stops against `wall.css` rules, the material fills, key equality and inequality, and the can-fail mutation guard.
- [x] 1.7 Run the new and extended files. Confirm every new test fails for the intended reason and every pre-existing assertion still passes. Save the output to `logs/1.7-tdd-red.log`.

## 2. Slice 1: Tier hysteresis (commit 1)

- [x] 2.1 Implement `MACRO_PROMOTE_SCALE`, `MACRO_DEMOTE_SCALE` and the `previous` parameter in `zoomTier.ts` (D1). Update the module doc comment.
- [x] 2.2 Add `committedTierRef` in `GalleryCanvas.tsx`: read, compute and write at L433, read-only at L358 (D2). The snapshot key logic is otherwise unchanged.
- [x] 2.3 Run `zoomTier.test.ts`, the tier-commit test and `snapshotKey.test.ts` until green. Commit with explicit paths: `feat(wall): hysteresis on the macro tier boundary`.

## 3. Slice 2: Macro mosaic footprint parity (commit 2)

- [ ] 3.1 Add `macroPlate` to `PlaygroundTheme` and all three themes (design.md §2).
- [ ] 3.2 Add `soundtrack` and `placardLines` to `planMacroMosaic`, plus `resolveMacroMosaicPalette` and its type (D3, D4).
- [ ] 3.3 Update `MacroIsland.tsx`: the `palette` prop, the signature with `palette.key` and description presence, and the new `paintPlaceholder` with its paint order (D6). Remove the pale fill and stroke.
- [ ] 3.4 Pass the `useMemo` palette from `GalleryCanvas.tsx` to `<MacroIsland>` (D5).
- [ ] 3.5 Run `macroMosaic.test.ts`, `MacroIsland.test.tsx` and `macroPaletteAudit.test.ts` until green. Commit with explicit paths: `feat(wall): macro mosaic reserves placard and soundtrack footprint`.

## 4. Verification & Empirical Audit

- [ ] 4.1 Run the guard group and the full gates (`npx vitest run`, `npx tsc --noEmit`, `npx eslint .`, `npm run build`). Record the pass counts in `logs/4.1-*.log`. For the full suite, try `safe-test` first and record the WebAssembly failure if it occurs.
- [ ] 4.2 Run `macro-parity.mjs` in full against base and head:
  - Album and Print rest: 0 px and 0 style diffs.
  - Overview: differences confined to the plate and slot rects.
  - The hysteresis probe: 1 transition against at least 4.
  - The island-count ratio at `0.221` against `0.25`.
  - Save crops and `report.json` under `parity/`. Inspect the crops visually: the plate tone should match the up-close placard.
- [ ] 4.3 Populate `verification.md`:
  - an executive summary and the environment;
  - a Requirement Adherence Audit Matrix, mapping every scenario in `specs/instanced-photo-renderer/spec.md` to its test or harness check;
  - resolved assumptions (Overview scale, island ratio, the band against jitter), with numbers;
  - a nomenclature audit against the research.md glossary;
  - verbatim logs.
  - Mark the iPhone checks in tests.md (Manual Verification) as `PENDING MANUAL DEVICE VERIFICATION`.
