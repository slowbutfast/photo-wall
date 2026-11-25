# design-system-guardrails Specification

## Purpose
Enforces complete, non-overlapping CSS domain ownership across five stylesheets, single-responsibility wall presentation components, an exact centralized wall shader configuration, a pre/post computed-style and screenshot parity gate, and an accurate live-architecture `DESIGN.md`.

## Requirements

### Requirement: Modular CSS domain ownership with static CI boundary and duplicate-selector audit
The application SHALL partition all gallery and studio styles into five complete, non-overlapping stylesheets — `src/app/globals.css` (base resets, `.gallery-root`, `.sr-only`, `@import '../styles/tokens.css'`), `src/styles/tokens.css` (`@font-face` with `url('../app/fonts/texgyreheros-*.woff2')` and `:root` / `[data-mood]` design tokens), `src/styles/wall.css` (`.playground-wall-root`, `.gallery-root-inner`, `.studio-canvas-root.playground-wall-root`, wall canvas, islands, placards, soundtrack plaques, print frames, macro mosaics), `src/styles/hud.css` (`.hud-top-right`, `.hud-button`, `.photo-focus-*`), and `src/styles/studio.css` (moved from `src/app/admin/studio.css` via `git mv`, consolidating all live `.admin-*`, `.studio-*`, and `.album-editor-*` rules and imported exclusively under `src/app/admin/`) — while deleting `src/app/playground-wall.css`, dead R3F rules (`.gallery-canvas`, `.soundtrack-overlay`), and dead `.admin-drawer*` rules (only after verifying zero `src/` references via grep). A static Vitest audit (`src/lib/__tests__/cssBoundaryAudit.test.ts`) SHALL enforce both forbidden-prefix rules and zero cross-file duplicate top-level selectors across all five stylesheets on every test run.

#### Scenario: Static CSS audit enforces domain boundaries and zero cross-file duplicate selectors
- **WHEN** `src/lib/__tests__/cssBoundaryAudit.test.ts` scans `src/app/globals.css`, `src/styles/{tokens,wall,hud,studio}.css`, and layout imports
- **THEN** it SHALL verify that `src/app/globals.css` contains zero `.hud-*`, `.photo-focus-*`, `.admin-*`, `.soundtrack-overlay`, or `.gallery-canvas` selectors; `src/styles/wall.css` contains zero `.hud-*` or `.admin-*` selectors; `src/styles/hud.css` contains zero `.admin-*` selectors; `src/styles/studio.css` is imported exclusively inside `src/app/admin/`; `src/app/playground-wall.css` does not exist; and no normalized top-level selector is defined in more than one of the five stylesheets

#### Scenario: Refactored pages match pre-refactor computed styles, font loading, and screenshots within tolerance
- **WHEN** Playwright captures deterministic `1440×900` (`DPR = 1`, animations disabled) baselines before and after the refactor on `/photos?demo=4&mood=chiaroscuro`, `/photos?demo=4&mood=concrete`, and `/photos/admin`
- **THEN** every tracked selector's `getComputedStyle` snapshot SHALL match the pre-refactor baseline exactly, `document.fonts.check('16px "TeX Gyre Heros"')` SHALL return `true`, screenshots SHALL match within `<= 0.5%` `pixelmatch` tolerance (accounting for WebGL antialiasing jitter), and `/photos` SHALL bundle zero `studio.css` rules

### Requirement: Single-responsibility GalleryCanvas decomposition
`src/components/wall/GalleryCanvas.tsx` SHALL delegate island presentation concerns to three focused sibling components — `src/components/wall/AlbumPlacard.tsx` (pure presentational fixed-height placard anatomy, draft badge, standoffs), `src/components/wall/FramedPrint.tsx` (recessed mat, print frame, local pointer hover tilt & `.photo-sheen` glare), and `src/components/wall/MacroIsland.tsx` (thin wrapper around existing `src/components/wall/macroMosaic.ts` for `scale < 0.25`) — while `GalleryCanvas.tsx` retains ownership of camera physics, viewport/world DOM refs, gesture/keyboard handling, and island culling without altering any public props, DOM class names, or keyboard/pointer behavior.

#### Scenario: Decomposed wall components preserve all DOM contracts, refs, and existing keymap
- **WHEN** `GalleryCanvas` renders in both `mode="public"` (`/photos`) and `mode="preview"` (`/photos/admin`)
- **THEN** `.museum-placard`, `.photo-frame`, `.photo-sheen`, `.soundtrack-plaque`, and `.island-mosaic` SHALL preserve their exact class names, data attributes, click/drag behavior, and the existing keymap unchanged (`0`, `Escape`, `ArrowLeft`, `ArrowRight`, `+`, `=`, `-`, `_`)

### Requirement: Centralized exported wall shader configuration
`src/lib/lighting/playgroundLighting.ts` SHALL export a typed `WALL_SHADER_CFG` constant preserving the exact current values (`{ tileUnits: 5.2, normalStrength: 1.4, aoStrength: 0.75 }`) and consumed by `src/components/wall/PlaygroundPbrWall.tsx`, eliminating hardcoded shader surface literals inside `paint()` so subsequent visual changes and unit tests reference one shared source of truth.

#### Scenario: PlaygroundPbrWall reads surface uniforms from WALL_SHADER_CFG with exact value preservation
- **WHEN** `PlaygroundPbrWall` uploads `uTileSize`, `uNormalStrength`, and `uAoStrength` and Vitest inspects `WALL_SHADER_CFG`
- **THEN** `WALL_SHADER_CFG` SHALL equal `{ tileUnits: 5.2, normalStrength: 1.4, aoStrength: 0.75 }` verbatim and `PlaygroundPbrWall` SHALL read all three uniforms from `WALL_SHADER_CFG`

### Requirement: Accurate DESIGN.md reflecting live DOM + WebGL2 + Studio architecture
`DESIGN.md` SHALL document the live DOM + single-pass WebGL2 PBR wall architecture, Curator Studio route isolation (`/photos` vs `/photos/admin`), and the 5-stylesheet module map (`globals.css`, `tokens.css`, `wall.css`, `hud.css`, `studio.css`), with zero stale references to Three.js / R3F (`troika-three-text`, `matrix3d` overlay) or the deleted floating `AdminDrawer`.

#### Scenario: DESIGN.md contains zero stale R3F or AdminDrawer references
- **WHEN** `DESIGN.md` is audited
- **THEN** it SHALL reference the modular stylesheet map and live DOM + WebGL2 + Curator Studio architecture and contain zero references to `troika-three-text`, `matrix3d`, or `AdminDrawer`
