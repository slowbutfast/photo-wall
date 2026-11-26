## ADDED Requirements

### Requirement: Coarse-pointer static frosted placards and mobile WebGL wall DPR cap
On `(pointer: coarse)` devices, the wall and placard layer SHALL reduce per-frame blur and fragment fill work without altering desktop `(pointer: fine)` appearance:
- **Material-scoped static frosted placards:** Under `@media (pointer: coarse)`, beveled-glass and acrylic (`.museum-placard.mat-acrylic`) placards SHALL disable live `backdrop-filter` (`backdrop-filter: none`) and apply material-scoped translucent frosted gradients that retain glass tint, bevel borders, and standoff pins across all three lighting moods (`chiaroscuro`, `concrete`, `alabaster`), WITHOUT altering brushed aluminum (`.mat-aluminum`) or matte black placards.
- **Coarse-pointer WebGL wall DPR cap:** `PlaygroundPbrWall` SHALL cap its WebGL2 canvas backing DPR on `(pointer: coarse)` devices at `1.0` (`MOBILE_WALL_MAX_DPR = 1.0`), keeping DOM photo elements at native device sharpness and desktop `(pointer: fine)` capped at `2.0`.

#### Scenario: Coarse-pointer placards disable live backdrop-filter without altering brushed aluminum
- **WHEN** a coarse-pointer device renders beveled-glass, acrylic (`.mat-acrylic`), and brushed-aluminum (`.mat-aluminum`) placards
- **THEN** computed `backdrop-filter` on beveled-glass and acrylic placards SHALL be `none` with legible frosted gradients, while `.mat-aluminum` placards SHALL retain their metallic brushed-aluminum background untouched

#### Scenario: Coarse-pointer WebGL wall renders at DPR 1.0 while desktop stays at 2.0
- **WHEN** `PlaygroundPbrWall` computes its canvas backing dimensions on a `dpr = 3` coarse-pointer phone vs. a `dpr = 2` fine-pointer desktop
- **THEN** the coarse-pointer canvas SHALL clamp its DPR to `1.0` while the fine-pointer desktop canvas SHALL remain at `2.0`
