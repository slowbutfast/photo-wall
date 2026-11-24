# Design: Gallery Style and Canvas Refactor

## Overview
**Status: Non-visual / Structural Refactor.**
No visual styling, colors, typography, spacing, or interactive UX behavior is intentionally altered by this prerequisite change. All existing rendered surfaces (`/photos` and `/photos/admin`) MUST remain visually identical before and after this refactor, verified objectively against pre-refactor `getComputedStyle` snapshots and screenshots.

Visual design upgrades (elliptical cluster wash, fine-grain plaster, 2D specular glare, 3D frame bevels, light frosted inspection bar, Title Case dock, and 2×2 4-album grid) are intentionally scoped to the follow-up change `openspec/changes/gallery-visual-fidelity/`.

### Complete Stylesheet Domain Map (Enforced by `cssBoundaryAudit.test.ts`)

Every selector in the application belongs to **exactly one** of these five files (no top-level selector may appear in more than one file):

| File | Loaded By | Owned Selectors |
| :--- | :--- | :--- |
| `src/app/globals.css` | `src/app/layout.tsx` (root) | `@import '../styles/tokens.css';`, `*` box-sizing reset, `html`, `body`, base form-control font inheritance, `.gallery-root`, `.sr-only`, shared `:focus-visible` ring. |
| `src/styles/tokens.css` | `@import` in `globals.css` | `@font-face` (`TeX Gyre Heros` via `url('../app/fonts/texgyreheros-*.woff2')`), `:root` design tokens, `[data-mood]` token blocks, `.tabular-nums`. |
| `src/styles/wall.css` | `src/app/(gallery)/` & `src/app/admin/layout.tsx` | `.playground-wall-root`, `.gallery-root-inner`, `.studio-canvas-root.playground-wall-root`, `.gallery-stage`, `.wall-viewport`, `.viewport-chiaroscuro-vignette`, `.wall-world`, `.wings-container`, `.pbr-wall-canvas`, `.album-island`, `.museum-placard*`, `.placard-*`, `.soundtrack-plaque*`, `.soundtrack-*`, `.album-grid`, `.photo-cell`, `.photo-frame*`, `.photo-window`, `.photo-img`, `.photo-paper-grain`, `.photo-sheen`, `.island-mosaic*`. |
| `src/styles/hud.css` | `src/app/(gallery)/` | `.gallery-surface`, `.hud-top-right`, `.hud-button*`, `.hud-directory*`, `.dock-pill`, `.hud-photo-bar`, `.photo-focus-*`, `.hud-label`, `.hud-meta`. |
| `src/styles/studio.css` | `src/app/admin/layout.tsx` (**admin-only**) | Moved via `git mv src/app/admin/studio.css src/styles/studio.css`; owns `.admin-root`, `.admin-login-*`, `.studio-*`, `.album-editor-*`, `.folder-dropzone*`, and all **live** `.admin-*` rules migrated from `globals.css` (`.admin-field*`, `.admin-note`, `.admin-button*`, `.admin-segment*`, `.admin-hidden-player`, `.admin-draft*`, `.admin-progress`, etc.). |
