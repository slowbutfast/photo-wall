# Proposal: Exhibition Title Signage & Persistent Return HUD

## Why

1. **Redundant HUD Chrome:** The public gallery currently shows both a top-right `Overview` button and a bottom-right `RETURN [ESC]` button (plus redundant `←` / `→` arrows on `PREV` / `NEXT`), even though `useWallStore.returnOneLevel()` already steps cleanly from `Print Focus → Album View → Overview`. Consolidating into a single persistent bottom-right `RETURN` button with smooth slide/fade transitions removes clutter and makes stepping back consistent across every focus level.
2. **Gallery Identity & Portfolio Wayfinding:** Visitors arriving at `/photos` have no physical title placard identifying the exhibition (`greg's photo wall`), no direct wayfinding link back to the main portfolio (`https://gregory-lazatin.com`), and a generic browser tab title (`Chiaroscuro Gallery`). Mounting a verbatim **Beveled Acrylic Glass (`.mat-acrylic`)** title placard and painted `← home` wall link in the upper-left wall margin grounds the gallery physically in the same architectural material language as the album placards.

## What Changes

- **Browser Tab Title (`src/app/layout.tsx`):**
  - Rename `metadata.title` from `'Chiaroscuro Gallery'` to `"greg's photo wall"`.
- **Simplified HUD & Persistent `RETURN` with Smooth Transitions (`GalleryHud.tsx`, `PhotoFocusBar.tsx`, `hud.css`):**
  - Remove the top-right `Overview` button (`.hud-top-right`).
  - Remove arrow glyphs from `PREV` and `NEXT` in `PhotoFocusBar.tsx`.
  - Rename `RETURN [ESC]` (and `mobile-print-transitions`'s `hud-key-hint` `[ESC]`) → plain `RETURN` (all caps) everywhere and render it as a single persistent bottom-right control (`.hud-return-persistent`) anchored to the exact bottom-right slot across `print` and `album` modes (`returnOneLevel()`: `print → album`, `album → overview`), hiding smoothly in `overview`.
  - Codify the approved playground animations: `.photo-focus-bar` slides/fades via `opacity 0.22s ease, transform 0.22s ease` (`translateY(10px)` + `inert` / `aria-hidden` when hidden, latching the last visible `album`/`photo` in a ref so the bar never fades out blank) and `.hud-return-persistent` slides/fades via `opacity 0.2s ease, transform 0.2s ease` (`translateY(6px)` when hidden), collapsing to instant transitions under `@media (prefers-reduced-motion: reduce)`.
- **In-World Exhibition Title Placard & Wayfinding Home Link (`ExhibitionTitleSign.tsx` `[NEW]`, `GalleryCanvas.tsx`, `cameraMath.ts`, `wall.css`):**
  - Render `<ExhibitionTitleSign />` inside `.wall-world` in the upper-left margin, top-aligned with the true top-left Row-0 album and offset cleanly to its left.
  - Widen `wall.css`'s `.museum-placard.mat-acrylic` rules (`L614`, `L638-639`, `L648-657`, `L685`, `L1170-1181`) to `:is(.museum-placard, .exhibition-title-placard).mat-acrylic` so the `greg's photo wall` placard (`~152px` wide, two-line centered `"greg's photo"` / `"wall"`) inherits verbatim **Beveled Acrylic Glass** styling across all 3 moods (including PR #17's dark Alabaster plate with `#F4F6F4` ink, cylindrical bottom standoffs, and mobile `@media (pointer: coarse)` frosted gradient fallback) without adding `.museum-placard` class side-effects.
  - Render the `← home` link centered `14px` beneath the placard as painted gallery signage (`<a href="https://gregory-lazatin.com">`) with mood-adaptive ink (`#111111` on `alabaster`, warm light `#e5e3dc` / `#d6d4cd` on `concrete` / `chiaroscuro`), fine-pointer hover shifting the arrow `-3px` left + subtle contrast shift (**no underline**), and native `GalleryCanvas` `onPointerDown` + `onClick` exclusion for `.exhibition-sign-column` so clicking or dragging on the link never starts a wall pan.
  - Keep `computeFirstRowBounds` pure (preserving existing tests) and add a separate pure wrapper `includeTitleSign(bounds, placements)` called in `GalleryCanvas.tsx` so initial Row-0 framing includes the title placard cleanly.

## Capabilities

### New Capabilities

- (None — extends existing HUD and wall signage capabilities.)

### Modified Capabilities

- `gallery-hud-and-curator-ui`: MODIFIED `Quiet gallery ephemera HUD with lock-gated Curator trigger`, `Unobtrusive Photo Focus bar with album caption and optional manual metadata`, `Safe-area-aware HUD under a viewport-fit=cover viewport`, and `Coarse-pointer touch targets of at least 44 by 44 CSS pixels` (replacing `.hud-top-right` with `.hud-return-persistent`, removing `hud-key-hint` `[ESC]` and `PREV`/`NEXT` arrows, latching last visible bar content during exit fade, and adding reduced-motion + non-focusability scenarios).
- `3d-pbr-wall-and-lighting`: ADDED requirement for the in-world Beveled Acrylic Glass Exhibition Title Placard (`greg's photo wall`, inheriting PR #17's Alabaster dark plate), mood-adaptive painted `← home` link (`https://gregory-lazatin.com`, `-3px` hover arrow shift, no underline, native `pointerdown` exclusion), and `"greg's photo wall"` document title.

## Impact

- **Sequencing:** Hold implementation until **`mobile-print-transitions`** merges into `origin/main` (`cdeda3b` + `mobile-print-transitions`), then rebase the `Unobtrusive Photo Focus bar` delta onto the merged spec and remove `printHandoffAudit.test.ts`'s `hud-key-hint` `[ESC]` assertion.
- **Code:** `src/app/layout.tsx`, `src/components/hud/GalleryHud.tsx`, `src/components/hud/PhotoFocusBar.tsx`, `src/styles/hud.css`, `src/components/wall/ExhibitionTitleSign.tsx` (`[NEW]`), `src/components/wall/GalleryCanvas.tsx`, `src/lib/camera/cameraMath.ts`, `src/styles/wall.css`.
- **Tests:** Updated `src/components/hud/__tests__/GalleryHud.test.tsx`, new `src/components/wall/__tests__/ExhibitionTitleSign.test.tsx` (`// @vitest-environment jsdom`), updated `touchAudit.test.ts`, `cameraMath.test.ts`, and `printHandoffAudit.test.ts`.
- **Dependencies / DB / APIs:** Zero new packages, zero DB changes, zero API changes.

### Revision: 2026-11-26 22:01 UTC
- **Feedback Source**: Two-Agent Peer Review (`exhibition-signage-and-return-hud` — NEEDS REVISION)
- **Key Changes**:
  - `research.md`, `proposal.md`, `architecture.md`, `design.md`: Synced against `origin/main` (`cdeda3b` / PR #17 `alabaster-glass-legibility`), widened `.mat-acrylic` selectors via `:is(.museum-placard, .exhibition-title-placard).mat-acrylic` (inheriting PR #17's Alabaster dark plate + `#F4F6F4` ink), and sequenced after `mobile-print-transitions` (reversing `hud-key-hint` `[ESC]`).
  - `architecture.md` (D1, D2, D3) & `specs/`: Moved `.exhibition-sign-column` exclusion into `GalleryCanvas`'s **native** `onPointerDown` handler; kept `computeFirstRowBounds` pure via new `includeTitleSign(bounds, placements)` wrapper (recomputing union width and center `x` from the true top-left album); specified last-visible `album`/`photo` ref latching in `PhotoFocusBar`; added `MODIFIED` deltas for `Safe-area-aware HUD` and `Coarse-pointer touch targets`, plus explicit `prefers-reduced-motion` and non-focusability scenarios.
  - `tests.md` & `tasks.md`: Specified `// @vitest-environment jsdom` for DOM/pointer/`inert` tests, native `pointerdown`+`pointermove` integration test, narrow portrait `390×844` album-width check, measurable `RETURN` `0 px` shift & reduced-motion Playwright assertions, and desktop resting parity check on `.museum-placard.mat-acrylic`.
