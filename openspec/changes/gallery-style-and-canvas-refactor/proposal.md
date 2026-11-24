# Proposal: Gallery Style and Canvas Refactor

## Why

Design elements in `photo-wall` have repeatedly drifted because styling is split across competing monolithic stylesheets (`src/app/globals.css` at ~1,413 lines — which mixes tokens, live `.admin-*` Studio rules, dead `.admin-drawer*` / R3F rules, and a duplicate `.hud-*` override block — alongside `src/app/playground-wall.css` at ~981 lines and `src/app/admin/studio.css`), `GalleryCanvas.tsx` (~1,094 lines on PR #6) combines camera physics, gestures, placards, framed prints, and macro mosaic hosting in one file, shader surface constants are hardcoded inline, and `DESIGN.md` still describes PR #1's superseded R3F architecture. Untangling these files into non-overlapping, single-responsibility modules backed by a pre/post computed-style & screenshot baseline and a static CSS boundary/duplicate-selector audit as a prerequisite change makes `gallery-visual-fidelity` (and every future UI change) surgical, verifiable, and drift-resistant.

## What Changes

- **Merge Gate & Pre-Refactor Visual Baseline:**
  - Gate implementation on PR #6 (`admin-route-isolation` + `album-photo-management` + PATCH-01) merging into `main`, then capture a deterministic pre-refactor Playwright `getComputedStyle` JSON snapshot + screenshots across `/photos?demo=4&mood=chiaroscuro`, `/photos?demo=4&mood=concrete`, and `/photos/admin` (`1440×900`) before moving any CSS.
- **Modularize All Stylesheets into 5 Non-Overlapping Files:**
  - Create `src/styles/tokens.css` (`@font-face` using `url('../app/fonts/texgyreheros-*.woff2')` + `:root` / `[data-mood]` design tokens) and update `src/lib/__tests__/rawUrlAudit.test.ts` to assert the font path in `tokens.css` while preserving the no-absolute-`/fonts/` rule.
  - Create `src/styles/wall.css` (`.playground-wall-root`, `.gallery-root-inner`, `.studio-canvas-root.playground-wall-root`, PBR wall canvas, `.album-island`, `.museum-placard`, `.soundtrack-plaque`, `.photo-frame`, `.photo-sheen`, `.island-mosaic-*`).
  - Create `src/styles/hud.css` (`.hud-top-right`, `.hud-button`, `.hud-directory*`, `.photo-focus-*` — single source of truth with zero duplicate override blocks).
  - Move `src/app/admin/studio.css` → `src/styles/studio.css` via `git mv` (imported **only** by `src/app/admin/layout.tsx`), classify every `.admin-*` selector in `globals.css` by grepping `src/`, **migrate all live `.admin-*` rules** (`.admin-field*`, `.admin-note`, `.admin-button*`, `.admin-segment*`, `.admin-hidden-player`, `.admin-draft*`, `.admin-progress`, etc.) into `src/styles/studio.css`, and delete only dead `.admin-drawer*` and unreferenced selectors.
  - Reduce `src/app/globals.css` to base resets (box-sizing, `html`/`body`, `.gallery-root`, `.sr-only`) + `@import '../styles/tokens.css';` and remove `src/app/playground-wall.css` and dead R3F rules (`.gallery-canvas`, `.soundtrack-overlay`).
- **Decompose `GalleryCanvas.tsx` (~1,094 lines) into 4 Focused Modules:**
  - `src/components/wall/GalleryCanvas.tsx`: owns camera loop, viewport/world DOM refs, gesture/keyboard controller, and island culling.
  - `src/components/wall/AlbumPlacard.tsx`: pure presentational fixed `214×200px` placard anatomy (Caption, `[Date · Time · Location]`, bottom-pinned Soundtrack + live timecode, draft badge, standoffs).
  - `src/components/wall/FramedPrint.tsx`: recessed mat, print frame, and local pointer hover tilt / `.photo-sheen` glare (reading `wasDragged()` from `GalleryCanvas`).
  - `src/components/wall/MacroIsland.tsx`: thin wrapper around existing `src/components/wall/macroMosaic.ts` (`scale < 0.25`).
- **Centralize Wall Shader Constants:**
  - Export `WALL_SHADER_CFG = { tileUnits: 5.2, normalStrength: 1.4, aoStrength: 0.75 } as const` from `src/lib/lighting/playgroundLighting.ts` and consume it in `src/components/wall/PlaygroundPbrWall.tsx`.
- **Add Static CSS Boundary & Duplicate-Selector Audit (`src/lib/__tests__/cssBoundaryAudit.test.ts`):**
  - Enforce domain prefix rules, `studio.css` admin-only import isolation, and **zero duplicate top-level selectors across all 5 stylesheets**.
- **Refresh `DESIGN.md` & Re-Target `gallery-visual-fidelity`:**
  - Remove stale R3F (`troika-three-text`, `matrix3d` overlay, `AdminDrawer`) documentation from `DESIGN.md` and document the live DOM + WebGL2 + Curator Studio architecture and 5-file CSS map.
  - Follow up with `openspec-revise-change gallery-visual-fidelity` once this refactor merges so its Target Context Map points at the new modular files.

## Capabilities

### New Capabilities

- `design-system-guardrails`: Enforces complete, non-overlapping CSS domain ownership (`globals.css`, `tokens.css`, `wall.css`, `hud.css`, `studio.css`) with a static boundary + duplicate-selector CI audit, `GalleryCanvas` component decomposition (`AlbumPlacard`, `FramedPrint`, `MacroIsland`), exact-value `WALL_SHADER_CFG` export, pre/post computed-style & screenshot parity verification, and an up-to-date `DESIGN.md`.

### Modified Capabilities

- (None — behavior-preserving prerequisite refactor scheduled after PR #6 + PATCH-01 merges and before `gallery-visual-fidelity`.)

## Impact

- **Sequencing:** Executes **after** PR #6 (`admin-route-isolation` + `album-photo-management` + PATCH-01) merges to `main`, and **before** `gallery-visual-fidelity`.
- **Stylesheets & Audits:** `src/app/globals.css`, `src/app/playground-wall.css` (deleted), `src/app/admin/studio.css` (moved via `git mv` → `src/styles/studio.css`), `src/styles/{tokens,wall,hud}.css` (new), `src/app/layout.tsx`, `src/app/(gallery)/`, `src/app/admin/layout.tsx`, `src/lib/__tests__/rawUrlAudit.test.ts`, `src/lib/__tests__/cssBoundaryAudit.test.ts`.
- **Wall Renderer & Lighting:** `src/components/wall/{GalleryCanvas,AlbumPlacard,FramedPrint,MacroIsland,PlaygroundPbrWall}.tsx`, `src/lib/lighting/playgroundLighting.ts`.
- **Docs:** `DESIGN.md`.
- **Dependencies / DB / APIs:** Zero new npm packages. Zero DB migrations. Zero API changes. Zero visual or behavioral regressions.
