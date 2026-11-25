# Revisions: Mobile Touch Compatibility

### Revision: 2026-11-25 04:38 UTC
- **Feedback Source**: Peer Review (`openspec-review-change`)
- **Key Changes**:
  - `specs/gallery-hud-and-curator-ui/spec.md`, `architecture.md` (D4), `design.md`, `tasks.md` (`3.2`): Added landscape horizontal safe-area padding `max(22px, env(safe-area-inset-left/right))` (and `max(14px, ...)` at `<= 767px`) on `.photo-focus-bar` and `max(...)` on `.hud-top-right` so landscape iPhones clear the Dynamic Island without doubling spacing.
  - `specs/spatial-camera-navigation/spec.md`, `architecture.md` (D2), `tests.md`, `tasks.md` (`1.1`, `2.1`, `2.2`): Fixed `GalleryCanvas.tsx` `onPointerDown`/`endPointer` one-finger → two-finger → one-finger hand-off (`draggedRef` reset only on `0 -> 1`, rebased `startX`/`startY` on `2 -> 1`), added unit test for the hand-off sequence, and scoped the pinch invariant to "while the camera is unclamped".
  - `specs/3d-pbr-wall-and-lighting/spec.md`, `specs/gallery-hud-and-curator-ui/spec.md`, `architecture.md` (D5), `tests.md`, `tasks.md` (`3.3`, `5.2`): Split HUD hover gating into `gallery-hud-and-curator-ui`, required wrapping each `:hover` rule **in place** inside `@media (hover: hover) and (pointer: fine)` to preserve cascade order, and added `:hover` desktop captures to `tests.md`.
  - `proposal.md`, `specs/gallery-hud-and-curator-ui/spec.md`, `architecture.md` (D6), `design.md`, `tasks.md` (`3.5`): Removed scaled-world `.soundtrack-plaque` / capture layer from the `44×44px` screen-pixel requirement.
  - `specs/gallery-hud-and-curator-ui/spec.md`, `architecture.md` (D7), `design.md`, `tests.md`, `tasks.md` (`1.2`, `4.2`, `5.3`): Added `-webkit-touch-callout: none` and `user-select: none` on `.album-editor-photo-media` (and list-row variant) + manual check, and documented unconditional `gesturestart`/`gesturechange` in `proposal.md`.
