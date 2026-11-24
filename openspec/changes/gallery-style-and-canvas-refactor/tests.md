# Verification Plan: Gallery Style and Canvas Refactor

## Automated Tests

- `npx vitest run src/lib/__tests__/cssBoundaryAudit.test.ts`:
  - Verifies `src/styles/{tokens,wall,hud,studio}.css` exist and `src/app/playground-wall.css` is deleted.
  - Verifies `src/app/globals.css` contains zero `.hud-`, `.photo-focus-`, `.admin-`, `.soundtrack-overlay`, or `.gallery-canvas` selectors.
  - Verifies `src/styles/wall.css` contains zero `.hud-` or `.admin-` selectors, and `src/styles/hud.css` contains zero `.admin-` selectors.
  - Verifies `src/styles/studio.css` is imported exclusively under `src/app/admin/` (zero public `/photos` imports).
  - Verifies **zero cross-file duplicate top-level selectors** across all 5 stylesheets (`globals.css`, `tokens.css`, `wall.css`, `hud.css`, `studio.css`).
  - Verifies `DESIGN.md` contains zero stale references to `troika-three-text`, `matrix3d`, or `AdminDrawer`.
- `npx vitest run src/lib/lighting/__tests__/playgroundLighting.test.ts`:
  - Verifies `WALL_SHADER_CFG` equals `{ tileUnits: 5.2, normalStrength: 1.4, aoStrength: 0.75 }` verbatim (exact behavior preservation).
- `npx vitest run src/lib/__tests__/rawUrlAudit.test.ts src/lib/__tests__/publicBoundaryAudit.test.ts`:
  - Verifies `src/styles/tokens.css` uses relative `url('../app/fonts/...')` (zero absolute `/fonts/` URLs), `0 KB` admin/studio leakage on `/photos`, and all fetches wrapped in `withBase()`.
- `npm run typecheck && npm run lint && npx vitest run && npm run build`:
  - Full typecheck, lint, unit suite (run directly with `npx vitest run` rather than `safe-test`, which OOMs on this suite), and production Next.js build pass with zero regressions.

## Manual Verification (Deterministic Pre/Post Golden Comparison)

Before modifying any CSS (Task `1.1`) and again after completing the refactor (Task `5.2`), run Playwright (`--workers=1`, `1440×900`, `DPR = 1`, CSS transitions/animations disabled) against `next start` across the following matrix:

| Capture State | URL / Interaction | Checks |
| :--- | :--- | :--- |
| **1. Public Overview (`chiaroscuro`)** | `/photos?demo=4&mood=chiaroscuro` | `getComputedStyle` JSON diff (`0` diffs), `document.fonts.check('16px "TeX Gyre Heros"') === true`, screenshot `pixelmatch <= 0.5%`, `0` `studio.css` rules loaded. |
| **2. Public Overview (`concrete`)** | `/photos?demo=4&mood=concrete` | `getComputedStyle` JSON diff (`0` diffs), screenshot `pixelmatch <= 0.5%`. |
| **3. Public Photo Focus** | Click first album → click first print on `/photos?demo=4&mood=chiaroscuro` | `getComputedStyle` diff on `.photo-focus-bar`, `.photo-frame.focused`, `.photo-sheen`, `.museum-placard`, `.soundtrack-plaque`; verify keymap (`ArrowRight`, `ArrowLeft`, `Escape`, `0`, `+`, `=`, `-`, `_`). |
| **4. Curator Studio (`/photos/admin`)** | Authenticated `/photos/admin` (Exhibitions, Upload, and Details tabs) | `getComputedStyle` diff on `.studio-sidebar`, `.admin-field`, `.admin-button-primary`, `.album-editor-tab`, `.admin-note`; screenshot `pixelmatch <= 0.5%`, `0` unstyled Studio controls, `0` console errors. |

Tracked `getComputedStyle` selector list (before vs. after must match **exactly** on `color`, `backgroundColor`, `fontFamily`, `fontSize`, `fontWeight`, `letterSpacing`, `textTransform`, `borderRadius`, `padding`, `borderTopColor`, `borderBottomColor`, `opacity`):
- Public: `.hud-button`, `.hud-directory`, `.hud-directory-item`, `.photo-focus-bar`, `.photo-focus-title`, `.museum-placard`, `.photo-frame`, `.photo-sheen`, `.soundtrack-plaque`, `.island-mosaic-host` (macro zoom).
- Studio: `.studio-sidebar`, `.admin-field`, `.admin-button-primary`, `.admin-note`, `.album-editor-tab`.
