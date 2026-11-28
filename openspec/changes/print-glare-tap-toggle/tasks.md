## Target Context Map

All line numbers are on `5188316` (`origin/main`). Re-read each file before editing.

| File | Lines | Change |
|---|---|---|
| `src/store/useWallStore.ts` | interface (about L60-100), initial state (about L121), new action | `glareOff`, `glareToggleCount`, `toggleGlare()`. The reset path (about L135) doesn't touch them (D1). Touch only these keys. `soundtrack-playback-sync` edits other keys in this file. |
| `src/components/wall/FramedPrint.tsx` | L171-183 (`onClick`) | The coarse focused-print branch, with `toggleGlare` from the store (D2). Nothing else in the file changes. |
| `src/components/wall/GalleryCanvas.tsx` | L1019-1023 (viewport div), after L1092 (sibling) | `data-glare` attribute; `.glare-hint` live region; hint state and effect (D3, D4). Optionally a pure `glareHintText` helper, exported from a small module. |
| `src/styles/wall.css` | inside the coarse `@media` block after L1211-1215 | `[data-glare='off'] .photo-sheen { --sheen-strength: 0 }` and the coarse-gated `.glare-hint` rules (design.md §4, §6). |
| `src/lib/__tests__/sheenGlareAudit.test.ts` | new cases | Coarse-gating audit plus a can-fail guard. |
| `src/store/__tests__/glareToggle.test.ts` | `[NEW]` | Store toggle and persistence tests. |
| `src/components/wall/__tests__/FramedPrintGlareTap.test.tsx` | `[NEW]` | Tap routing. |

**Out of bounds:**
- `PrintSharpOverlay.tsx` and `printSharpOverlaySync.ts`;
- `useGyroTilt.ts` and `gyroTilt.ts`;
- `FramedPrint`'s gyro effect (L93-158) and its pointer handlers;
- every fine-pointer CSS rule;
- `PhotoFocusBar.tsx` (the exhibition-signage change owns it);
- `playgrounds/`.

## 1. Test Scaffolding (TDD)

- [ ] 1.1 Extend `sheenGlareAudit.test.ts` with the coarse-gated rule assertions and the can-fail guard. Confirm they fail.
- [ ] 1.2 Write a failing `glareToggle.test.ts`.
- [ ] 1.3 Write a failing `FramedPrintGlareTap.test.tsx`, plus the `glareHintText` table test if that helper is extracted.
- [ ] 1.4 Run the new and extended files. Confirm the intended failures and that the pre-existing assertions pass. Save to `logs/1.4-tdd-red.log`.

## 2. Glare toggle

- [ ] 2.1 Add the store fields and `toggleGlare` (D1).
- [ ] 2.2 Add the `FramedPrint.onClick` branch (D2).
- [ ] 2.3 Add the `data-glare` attribute and the `.glare-hint` live region with its timer in `GalleryCanvas` (D3, D4).
- [ ] 2.4 Add the coarse-gated CSS (design.md).
- [ ] 2.5 Run the narrow tests until green. Commit with explicit paths: `feat(wall): tap the focused print to toggle glare on touch devices`.

## 3. Verification & Empirical Audit

- [ ] 3.1 Run the guard group and the full gates, recording counts in `logs/3.1-*.log`. Use `safe-test` first.
- [ ] 3.2 Run the Playwright checks in tests.md against base `5188316` and head:
  - coarse toggle computed styles;
  - fine-pointer computed-style identity.

  Save to `logs/3.2-glare-toggle.log` and screenshots to `parity/`. Inspect the coarse screenshots with the glare on and off.
- [ ] 3.3 Populate `verification.md`:
  - a summary and environment;
  - an audit matrix covering every scenario;
  - resolved assumptions;
  - a nomenclature audit (glare / sheen, glare off, focused print tap, session);
  - verbatim logs.

  Mark the iPhone checks `PENDING MANUAL DEVICE VERIFICATION`.
