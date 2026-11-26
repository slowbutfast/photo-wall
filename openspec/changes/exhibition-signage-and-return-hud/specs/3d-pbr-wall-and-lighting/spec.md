## ADDED Requirements

### Requirement: In-world Beveled Acrylic Glass exhibition title placard, painted home wayfinding link, and page title
The public gallery wall SHALL render an in-world exhibition title column (`ExhibitionTitleSign`) inside `.wall-world` in the upper-left margin, top-aligned with the true top-left Row-0 album and offset cleanly to its left, included in initial Row-0 framing via `includeTitleSign(bounds, placements)`:
- **Exhibition Title Placard (`greg's photo wall`):** Compact horizontal rectangle (`~152px` wide) styled via `:is(.museum-placard, .exhibition-title-placard).mat-acrylic` so it inherits verbatim **Beveled Acrylic Glass** styling across every mood (including PR #17's dark Alabaster plate `rgba(30,36,33,0.78)` with `#F4F6F4` ink, cylindrical brushed-metal bottom standoffs `.placard-standoff.left`/`.right`, and coarse-pointer static frosted gradient fallback with `backdrop-filter: none`), displaying centered two-line Helvetica (`15.5px`, `font-weight: 700`, `line-height: 1.2`) text: `greg's photo` / `wall`.
- **Wayfinding Home Link (`← home`):** Centered `14px` beneath the title placard directly on the plaster wall surface (no box or button chrome), wrapped in `<a href="https://gregory-lazatin.com">` using mood-adaptive painted ink (`#111111` on `alabaster`, `#e5e3dc` on `concrete`, `#d6d4cd` on `chiaroscuro`). Under `@media (hover: hover) and (pointer: fine)`, hovering SHALL shift the `←` arrow `3px` left (`transform: translateX(-3px)`) with a subtle contrast shift and **no underline**. `GalleryCanvas`'s native `onPointerDown` and `onClick` handlers SHALL ignore targets inside `.exhibition-sign-column` so clicking or dragging starting on `← home` never initiates a wall pan or background overview click.
- **Browser Tab Title:** The root layout (`src/app/layout.tsx`) SHALL set `metadata.title` to `"greg's photo wall"`.

#### Scenario: Title placard and home link render in the upper-left wall margin and navigate without dragging
- **WHEN** the gallery loads on Row 0 with at least one album, and a visitor clicks or drags starting on `← home`
- **THEN** `greg's photo wall` SHALL render in `.wall-world` with verbatim `.mat-acrylic` styling (including PR #17's Alabaster dark plate) and cylindrical standoffs to the left of the top-left album, `← home` SHALL link directly to `https://gregory-lazatin.com` with no underline on hover, and the native `pointerdown`/`pointermove` sequence on `.exhibition-sign-column` SHALL NOT pan the wall

#### Scenario: Browser tab displays greg's photo wall
- **WHEN** the root layout metadata is evaluated
- **THEN** `metadata.title` SHALL equal `"greg's photo wall"`
