# Revisions: Gallery Visual Fidelity

### Revision: 2026-11-24 22:37 UTC
- **Feedback Source**: Post-PR #7 (`gallery-style-and-canvas-refactor`) Task 5.3 re-targeting
- **Key Changes**:
  - `proposal.md`, `specs/`, `architecture.md`, `design.md`, `tasks.md`: Re-targeted all references from deleted `src/app/playground-wall.css` and monolithic `PlaygroundGallery.tsx` to merged PR #7 files: `src/styles/wall.css`, `src/styles/hud.css`, `src/components/wall/GalleryCanvas.tsx`, `src/components/wall/FramedPrint.tsx`, and `WALL_SHADER_CFG` in `src/lib/lighting/playgroundLighting.ts`.
  - `tasks.md` (`4.1`): Folded in the `src/styles/hud.css` deduplication pass (collapsing the 3 legacy HUD blocks preserved during PR #7 into one clean, non-overlapping set of rules compliant with `cssBoundaryAudit.test.ts`).
  - `tasks.md` (`5.1`): Updated full test gate to run `npx vitest run` directly (matching PR #6/PR #7) and include `cssBoundaryAudit.test.ts`.

### Revision: 2026-11-24 20:20 UTC
- **Feedback Source**: Peer Review (`openspec-review-change`)
- **Key Changes**:
  - `architecture.md`, `specs/instanced-photo-renderer/spec.md`, `tests.md`, `tasks.md`: Derived entry Overview first-row count from `entryFirstRowCount(albums.length, aspect) = Math.min(aspectPerRow, albumsPerRowForCount(albums.length))` so wide desktop viewports (`aspect >= 1.4`) never include Row 1's 3rd album when framing a 4-album `2×2` wall; added TDD test requirement for wide-desktop 4-album entry framing.
  - `specs/gallery-hud-and-curator-ui/spec.md`, `design.md`: Restored **Camera** alongside **Date** and **Location** in the Photo Focus bar optional manual metadata contract so this visual-styling change does not silently drop an existing spec field.
  - `specs/3d-pbr-wall-and-lighting/spec.md`, `tests.md`: Clarified that `placard.lit >= 0.72` refers to the normalized `0..1` irradiance value (`PlaygroundShadedObject.lit` emitted to `--lit`) before CSS `.is-lit::after` compositing.
  - `tests.md`: Replaced subjective manual checks with a concrete capture matrix (`1440×900` desktop + `390×844` mobile), measurable DOM/pixel checks (interstitial wall RGB floor `>= 48`, computed style assertions, zero neighbor dimming, zero toast), and side-by-side baseline comparison against `research.md` screenshots.
