## Automated Tests

Runner: `npx vitest run` (Vitest). For narrow loops, run the single file. Known issue from earlier changes: `safe-test` can't instantiate this suite's WebAssembly under its `ulimit -v` cap. Try it first; if it aborts for that reason, record the failure log and run the serialized direct command.

- `npx vitest run src/components/wall/__tests__/zoomTier.test.ts` (extended) covers the MODIFIED macro tier requirement.
  - **Constants:** `MACRO_PROMOTE_SCALE === 0.25 === MACRO_SCALE_THRESHOLD` and `MACRO_DEMOTE_SCALE === 0.22`.
  - **Table test over `previous ∈ {undefined, 'macro', 'album', 'print'}`:**
    - Without `previous`: today's results, with the existing assertions unchanged.
    - `previous = 'macro'`: `0.23` and `0.249` give `macro`; `0.25` gives `album`.
    - `previous = 'album'`: `0.24` and `0.221` give `album`; `0.2199` gives `macro`.
    - `previous = 'print'` with `printFocused = true`: `0.23` gives `print`.
    - A non-finite scale gives `macro` for every `previous`.
  - **Jitter sequence:** feed `[0.20, 0.251, 0.235, 0.26, 0.225, 0.249, 0.23]` through a fold that passes each result as the next `previous`. The output changes tier exactly once, at `0.251`. A can-fail guard runs the same sequence without `previous` and shows at least 4 changes, which proves the test catches today's oscillation.

- `npx vitest run src/components/wall/__tests__/snapshotKey.test.ts`, plus a new `committedTier` case in the same file or a sibling `galleryTierCommit.test.ts`. Covers the scenario "Render path and camera loop agree on the tier".
  - If `GalleryCanvas` can't be driven headlessly, extract a tiny pure helper, `commitZoomTier(ref, scale, focused)`, that does the read-compute-write.
  - Assert that it writes the ref, and that a second read-only call with the same scale returns the same tier without writing.
  - A source audit asserts that `GalleryCanvas.tsx` calls `resolveZoomTier` with three arguments at both call sites, and writes `committedTierRef.current` only inside the rAF callback.

- `npx vitest run src/components/wall/__tests__/macroMosaic.test.ts` (extended) covers the ADDED footprint requirement (geometry).
  - **Soundtrack slot:** `plan.soundtrack` equals `computeAlbumGrid(...).soundtrack` mapped with the same `toBuffer` maths, within 1 buffer px. It's `null` when `album.soundtrack === null`.
  - **Greeked lines:** `plan.placardLines` has 1 bar without a description (including `''` and whitespace-only) and 3 with one. Every bar lies inside `plan.placard`, and the title bar's buffer rect equals the design.md `(24, 24, 104, 10)` placard-px rect, scaled.
  - **Regression:** the existing plan assertions (cells, placard, buffer cap) are unchanged.

- `npx vitest run src/components/wall/__tests__/MacroIsland.test.tsx` (extended) covers the ADDED footprint requirement (paint).
  - **Fake context:** extend it with `fillText`, `strokeRect`, `createLinearGradient` (recording `addColorStop` calls) and a `fillStyle` setter log.
  - **Album with soundtrack and description:** paints a `#161616` fill at the slot rect, the three acrylic stops in order, and the three bar rects. It makes zero `fillText` calls, never sets `fillStyle` to `rgba(226, 242, 234, 0.18)`, and sets no `Image.src` other than the `256` LOD photo URLs.
  - **Without `createLinearGradient`:** a solid fill of the 55% stop, with no throw.
  - **Palette change:** the mosaic signature changes, a connected old canvas isn't zeroed until detached, and a detached one is zeroed immediately. This reuses the existing disposal assertions.
  - **Regression:** the incremental-paint scenario holds: at most `N` `drawImage` calls and zero `clearRect` after the first paint.

- `npx vitest run src/lib/__tests__/macroPaletteAudit.test.ts` `[NEW]` is a source-text audit in the style of `touchAudit.test.ts`.
  - For each mood, `PLAYGROUND_THEMES[mood].macroPlate.fine` / `.coarse` stops appear verbatim (whitespace-normalised) in the matching `wall.css` rule:
    - base `.mat-acrylic`;
    - `[data-mood='alabaster'] … .mat-acrylic`;
    - the coarse `.mat-acrylic` rule;
    - the coarse `[data-mood='concrete'] … .mat-acrylic` rule.
  - The fixed aluminum (`#d2d5d9`) and foamcore (`#161616`) fills appear in their base rules.
  - `resolveMacroMosaicPalette` returns distinct `key`s for chiaroscuro and alabaster, and equal keys for chiaroscuro and concrete on fine pointers.
  - **Can-fail guard:** mutate one stop in memory and confirm the matcher rejects it.

- **Guard group** (must stay green):
  - `src/components/wall/__tests__/wallCanvasDpr.test.ts`
  - `src/lib/__tests__/touchAudit.test.ts`
  - `src/lib/__tests__/cssBoundaryAudit.test.ts`
  - `src/lib/__tests__/sheenGlareAudit.test.ts`
  - `src/lib/camera/__tests__/cameraMath.test.ts`
  - `src/lib/layout/__tests__/islandLayout.test.ts`

  Any edited existing assertion must be justified in `verification.md`.

- **Full gates:** `npx vitest run`, `npx tsc --noEmit`, `npx eslint .`, `npm run build`.

- **Parity and measurement harness** (`openspec/changes/macro-lod-continuity/parity/macro-parity.mjs` `[NEW]`, adapted from `openspec/changes/alabaster-glass-legibility/parity/placard-parity.mjs`):
  - **Setup:** build and serve `b616dbc` (base) and head locally (`STORAGE_DRIVER=local`). Playwright Chromium, fine pointer, 1440×900, `?demo=4&mood=<chiaroscuro|concrete|alabaster>`.
  - **Measure first (task 1.1):** `cameraToCssScale` after the Overview settle, for `?demo=4` at 1440×900 and at 393×852 (`hasTouch`, `isMobile`), and for `?demo=1000` at 1440×900. Record whether any lands in `[0.22, 0.25)`.
  - **Album Focus and Print Focus at rest:** 0 differing pixels and identical computed styles for `.museum-placard`, `.soundtrack-plaque` and `.photo-frame`.
  - **Overview (macro) at rest:** differing pixels are confined to the placard-plate and soundtrack-slot rects of each island, checked per pixel, not by bounding box. Save the crops for visual review.
  - **Coarse emulation** (393×852, alabaster and chiaroscuro): save the Overview crops. The plates should be darker than the old pale squares, with a slot under each placard whose album has a soundtrack.
  - **Hysteresis probe:** drive the camera `z` through the scale sequence from the zoomTier jitter test, using the harness's existing camera hook, or wheel steps calibrated against `cameraToCssScale`. Count `.island-mosaic` mount and unmount transitions: expect exactly 1, against at least 4 on base.
  - **Island count at the demote point** (`?demo=1000`, 1440×900): count mounted detail islands at scale `0.221` (head) against `0.25` (base) and record the ratio. The expected ratio is about 1.29.

## Manual Verification

> **Status: PENDING MANUAL DEVICE VERIFICATION.** No physical iPhone is available in this environment. Everything below was executed only as far as Chromium/coarse emulation allows; the device-feel checks remain open (see `verification.md` §6).

Run local dev on the LAN (`next dev -H 0.0.0.0`, local DB, `STORAGE_DRIVER=local`, `?demo=4`) or a read-only preview. Use a real iPhone (Safari, portrait) and a desktop browser. Anything not run is marked `PENDING MANUAL DEVICE VERIFICATION` in verification.md.

- **Threshold oscillation** (`PENDING MANUAL DEVICE VERIFICATION`) (the maintainer's recording, 3.25–6.5 s):
  - **WHEN** you pinch in from Overview until placards show text, then hold and jiggle the pinch slightly.
  - **THEN** placards don't toggle back to the mosaic. They swap back only after a clear zoom-out.
- **Footprint** (`PENDING MANUAL DEVICE VERIFICATION`):
  - **WHEN** you pinch slowly across the promote point on an album that has a soundtrack.
  - **THEN** the dark plate and the dark plaque square are already present before the swap. At the swap, text and the cover appear inside existing shapes, and the left column's height doesn't change.
- **Moods and materials** (`PENDING MANUAL DEVICE VERIFICATION`):
  - **WHEN** you switch mood (chiaroscuro, concrete, alabaster), and switch placard material in Curator Studio.
  - **THEN** the Overview plates match the up-close placard tone for each. There's no pale square anywhere.
- **Performance** (`PENDING MANUAL DEVICE VERIFICATION`) (iPhone, Safari Web Inspector, Timelines):
  - **WHEN** you record a slow zoom-out from Album Focus on `?demo=1000` through the demote point.
  - **THEN** the demote-frame hitch is no worse than `main`'s at 0.25. Record both.
