## ADDED Requirements

### Requirement: Glare intensity is halved on every pointer through a single strength multiplier
`.photo-sheen` SHALL scale every alpha stop of its `radial-gradient` by a `--sheen-strength` custom property declared once on `.playground-wall-root` with value `0.5`, so the glare's visible intensity is half of the previous look on both `(pointer: fine)` and `(pointer: coarse)` devices while keeping the same gradient shape, ellipse size, blend mode per pointer, rest opacity (`--sheen-intensity: 0.44`), and hover/gyro inline opacity (`0.92`). This requirement supersedes the "byte-identical desktop" guarantee of the coarse-pointer mobile render profile for `.photo-sheen` only; every other desktop computed style and pixel SHALL remain identical.

#### Scenario: Sheen gradient alpha stops use the strength multiplier
- **WHEN** `wall.css` is parsed
- **THEN** the base `.playground-wall-root .photo-sheen` rule's `background` SHALL be a `radial-gradient` whose non-zero alpha stops are `calc(0.38 * var(--sheen-strength))` and `calc(0.14 * var(--sheen-strength))` (outer stop `0`), AND `.playground-wall-root` SHALL declare `--sheen-strength: 0.5` exactly once

#### Scenario: Desktop hover glare is half as strong but moves the same way
- **WHEN** a `(pointer: fine)` visitor hovers a focused print and moves the mouse across it
- **THEN** `.photo-sheen` SHALL translate exactly as before (`translate3d(-nx * 38%, -ny * 38%, 0)`, inline `opacity: 0.92`), its gradient centre SHALL stay at `50% 50%`, and the highlight's peak alpha SHALL be half of the previous baseline

#### Scenario: Only sheen pixels differ on desktop
- **WHEN** the fine-pointer computed-style and pixelmatch harness runs against the pre-change baseline (idle, album, print, hovered print, Studio)
- **THEN** the only computed-style differences SHALL be the `.photo-sheen` `background-image`, and pixel differences SHALL be confined to regions covered by `.photo-sheen`

### Requirement: Coarse-pointer glare rests in the top-right corner of the photo
On `(pointer: coarse)` devices, the focused print's `.photo-sheen` and the `.print-sharp-overlay .photo-sheen` SHALL set `--sheen-anchor: 65% 35%`, and the base `.photo-sheen` gradient SHALL position its centre at `var(--sheen-anchor, 50% 50%)`, so that with zero tilt the glare centre sits at ≈ `84%` across and ≈ `16%` down the photo window. Gyroscope tilt SHALL continue to translate the sheen relative to this anchor with unchanged sign and amplitude. `(pointer: fine)` devices SHALL NOT set `--sheen-anchor` and SHALL keep the centred `50% 50%` resting position.

#### Scenario: Coarse focused and overlay sheens declare the top-right anchor
- **WHEN** `wall.css` is parsed
- **THEN** inside an `@media (pointer: coarse)` block, a rule targeting both `.photo-frame.focused .photo-sheen` and `.print-sharp-overlay .photo-sheen` SHALL declare `--sheen-anchor: 65% 35%`, no rule outside a `(pointer: coarse)` block SHALL declare `--sheen-anchor`, and the base `.photo-sheen` gradient SHALL contain `at var(--sheen-anchor, 50% 50%)`

#### Scenario: Static glare rests top-right without gyroscope input
- **WHEN** a coarse-pointer visitor opens Print Focus with Reduce Motion enabled, or with motion permission denied, and holds the phone still
- **THEN** the glare SHALL sit in the top-right corner of the photo (sharp overlay included) at rest opacity, leaving the centre of the photo unobscured

#### Scenario: Gyroscope sweeps the glare from the top-right anchor
- **WHEN** a coarse-pointer visitor enters Print Focus with motion permission granted and tilts the phone from the entry angle
- **THEN** the glare SHALL start at the top-right anchor and move opposite the tilt with the same `±38%` sheen-box amplitude as before, and the `PrintSharpOverlay` sheen SHALL stay aligned with the frame's sheen
