# Revisions: Gallery Visual Fidelity

### Revision: 2026-11-24 20:20 UTC
- **Feedback Source**: Peer Review (`openspec-review-change`)
- **Key Changes**:
  - `architecture.md`, `specs/instanced-photo-renderer/spec.md`, `tests.md`, `tasks.md`: Derived entry Overview first-row count from `entryFirstRowCount(albums.length, aspect) = Math.min(aspectPerRow, albumsPerRowForCount(albums.length))` so wide desktop viewports (`aspect >= 1.4`) never include Row 1's 3rd album when framing a 4-album `2×2` wall; added TDD test requirement for wide-desktop 4-album entry framing.
  - `specs/gallery-hud-and-curator-ui/spec.md`, `design.md`: Restored **Camera** alongside **Date** and **Location** in the Photo Focus bar optional manual metadata contract so this visual-styling change does not silently drop an existing spec field.
  - `specs/3d-pbr-wall-and-lighting/spec.md`, `tests.md`: Clarified that `placard.lit >= 0.72` refers to the normalized `0..1` irradiance value (`PlaygroundShadedObject.lit` emitted to `--lit`) before CSS `.is-lit::after` compositing.
  - `tests.md`: Replaced subjective manual checks with a concrete capture matrix (`1440×900` desktop + `390×844` mobile), measurable DOM/pixel checks (interstitial wall RGB floor `>= 48`, computed style assertions, zero neighbor dimming, zero toast), and side-by-side baseline comparison against `research.md` screenshots.
