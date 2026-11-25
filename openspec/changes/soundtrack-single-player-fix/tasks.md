## 1. Test Scaffolding (TDD)

- [ ] 1.1 Add failing tests in `src/components/wall/__tests__/soundtrackState.test.ts`:
  - `showsIframeFor` is true for A and false for B after `enter-album A` + `play A`;
  - only B is true after the A→B handover;
  - false at overview and before play;
  - the exclusivity property over the randomised event-sequence test (≤ 1 of `['A','B','C']`, equal to `activeAlbumId`).
- [ ] 1.2 Run `npx vitest run src/components/wall/__tests__/soundtrackState.test.ts` and confirm it fails because `showsIframeFor` isn't exported.

## 2. Fix

- [ ] 2.1 Export `showsIframeFor(state, albumId)` from `src/components/wall/soundtrackState.ts` (architecture D1). Leave `showsIframe` unchanged.
- [ ] 2.2 In `src/components/wall/SoundtrackPlaque.tsx`, derive `iframeVisible`, `facade`, `armed` and `data-state` from `showsIframeFor(state, album.id)` (D2). Change nothing else.
- [ ] 2.3 Grep `src` to confirm `showsIframe` has no other non-test consumer. Re-run the narrow test file and confirm it passes.

## 3. Verification & Empirical Audit

- [ ] 3.1 Run `npx vitest run` (full suite), `npx tsc --noEmit`, `npx eslint .` and `npm run build`. Confirm all are clean, and record pass counts against the baseline.
- [ ] 3.2 Run the `tests.md` manual checks on local dev (single player, handover, capture layer), including the DOM iframe count.
- [ ] 3.3 Populate `verification.md`:
  - the Requirement Adherence Matrix (all 3 scenarios);
  - resolution of the unverified grep assumption;
  - a nomenclature audit;
  - verbatim logs.
