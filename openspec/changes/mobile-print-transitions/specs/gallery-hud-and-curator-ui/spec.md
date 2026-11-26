## MODIFIED Requirements

### Requirement: Unobtrusive Photo Focus bar with album caption and optional manual metadata
Inspecting a single print SHALL anchor `← PREV`, `NEXT →`, the **album's caption** and a return control to a full-width bottom bar:
- The caption is a single-line, centred, **Title Case** Helvetica primary line (`text-transform: none`).
- An optional subtle subtitle contains only owner-entered fields (**Camera**, **Date**, **Location**), all off or empty by default, with zero auto-extracted EXIF.
- The return control reads `RETURN [ESC]` on fine pointers and `RETURN` on `(pointer: coarse)`. The `[ESC]` keyboard hint is a separate element hidden by CSS on coarse pointers, so server and client markup stay identical.
- The bar is bright, spacious and light-frosted:
  - `rgba(244, 244, 242, 0.92)` background;
  - `#111111` primary ink;
  - `rgba(17, 17, 17, 0.62)` secondary ink;
  - a subtle `1px solid rgba(17, 17, 17, 0.12)` top hairline;
  - `backdrop-filter: blur(12px)`.
- It doesn't blur the gallery background.
- On `< 768px` viewports the caption stacks cleanly above the `>= 44px` touch controls.

#### Scenario: Stepping through prints shows album caption and only populated manual fields
- **WHEN** a visitor inspects a print in an album where only `Camera` and `Location` were entered by the owner (and `Date` was left empty)
- **THEN** the bottom bar SHALL display the album caption in Title Case on a light frosted `rgba(244, 244, 242, 0.92)` surface with `#111111` ink and `Camera • Location` underneath, omitting `Date` and any auto-extracted lens/shutter EXIF

#### Scenario: Touch visitors see RETURN without the keyboard hint
- **WHEN** the Photo Focus bar renders on a `(pointer: coarse)` device versus a `(pointer: fine)` desktop
- **THEN** the coarse device SHALL show the visible label `RETURN` (the `[ESC]` element has `display: none`), the desktop SHALL show `RETURN [ESC]`, and the server-rendered markup SHALL be identical for both
