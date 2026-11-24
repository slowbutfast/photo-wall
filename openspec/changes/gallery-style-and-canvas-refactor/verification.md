# Verification: Gallery Style and Canvas Refactor

**Status:** Implementation verified — behavior-preserving structural refactor with zero tracked computed-style diffs and pixel-identical screenshots.

## Executive Summary

| Check | Result |
| :--- | :--- |
| Pre-refactor Playwright baseline | Captured from `next start` at `1440×900`, `DPR = 1`, animations/transitions disabled |
| Public + Studio states compared | 7 captures (3 public, 4 Studio) |
| `getComputedStyle` diffs (12 properties × 10 public + 5 Studio selectors) | **0** |
| Screenshot `pixelmatch` (threshold `0.1`, tolerance `<= 0.5%`) | **0 changed pixels / 0.0000%** in every state |
| `document.fonts.check('16px "TeX Gyre Heros"')` | `true` in every state |
| Public route CSS isolation | **0** `.admin-*`, `.studio-*`, `.album-editor-*` rules on `/photos`; wall + HUD present |
| Studio route CSS isolation | 57 `.admin-*` + 58 `.studio-*` rules, wall present, zero HUD rules |
| `npm run typecheck` | Pass |
| `npm run lint` | Pass |
| `npx vitest run` | **398 passed / 398** across 27 files |
| `npm run build` | Pass |

### Environment

- Repo: `photo-wall`, branch `feat/gallery-style-and-canvas-refactor`
- Base: `main` @ `075f563` merged with PR #6 merge commit `3a51153`
- Node `v22.23.2`, npm `10.9.8`, Next.js `16.4.6`, React `19.3.1`
- Browser: Chromium via Playwright Core `1.65.1` (`--no-sandbox`, SwiftShader for headless WebGL2)
- Viewport `1440×900`, `devicePixelRatio = 1`, `prefers-reduced-motion: reduce`, injected `transition: none !important; animation: none !important`

### Merge Gate (Task 0.1)

PR #6 merge commit `3a51153` is present on `origin/main`; `GalleryCanvas.tsx`, `src/app/admin/studio.css`, the `(gallery)` route tree, and `publicBoundaryAudit.test.ts` were confirmed before editing. Baseline line counts re-verified on the merged tree: `globals.css` 1,413; `playground-wall.css` 981; `admin/studio.css` 765; `GalleryCanvas.tsx` 1,094; `PlaygroundPbrWall.tsx` 521 (`WALL_TILE_UNITS` at 31, uniforms at 367–369); `rawUrlAudit.test.ts` 71 (font assertion at 66–70).

## Requirement Adherence Audit Matrix

| Spec requirement / scenario | Verifying evidence |
| :--- | :--- |
| Five non-overlapping stylesheets exist; `playground-wall.css` deleted | `src/lib/__tests__/cssBoundaryAudit.test.ts` — file existence + deletion cases |
| `globals.css` has zero `.hud-*`, `.photo-focus-*`, `.admin-*`, `.soundtrack-overlay`, `.gallery-canvas` selectors | `cssBoundaryAudit.test.ts` — forbidden-prefix cases |
| `wall.css` zero `.hud-*`/`.admin-*`; `hud.css` zero `.admin-*` | `cssBoundaryAudit.test.ts` — forbidden-prefix cases |
| `studio.css` imported exclusively under `src/app/admin/` | `cssBoundaryAudit.test.ts` — importer walk; runtime scan shows **0** Studio/Admin rules on `/photos` |
| Zero normalized cross-file duplicate selectors across all 5 stylesheets | `cssBoundaryAudit.test.ts` — parser normalizes grouped/nested selectors and fails on cross-file ownership collisions |
| Pre/post computed styles match exactly; font loads; screenshots ≤ 0.5% | Baseline vs post capture matrix below: **0 style diffs**, `fonts.check === true`, **0.0000%** pixel diff |
| `GalleryCanvas` decomposition preserves DOM classes, refs, gestures, keymap | `AlbumPlacard.tsx`, `FramedPrint.tsx`, `MacroIsland.tsx` extracted; DOM counts identical pre/post; keymap exercised (`0`, `Escape`, `ArrowLeft`, `ArrowRight`, `+`, `-`) with unchanged tier/focus transitions |
| `WALL_SHADER_CFG` exact value + consumed by `PlaygroundPbrWall` | `src/lib/lighting/__tests__/playgroundLighting.test.ts` — exact `toEqual`; `PlaygroundPbrWall` reads all three uniforms from the constant |
| `DESIGN.md` has zero stale R3F/`AdminDrawer` references and documents live architecture + 5-file map | `cssBoundaryAudit.test.ts` — stale-string absence + required live-string presence |

## Pre/Post Capture Matrix

Baseline: pre-refactor production build served on `:3003`. Post: refactored production build served on `:3004`. The same capture script, browser build, viewport, DPR, fixture data and freeze CSS were reused.

| State | URL / interaction | Computed-style diffs | Pixel diff | Font check | DOM parity |
| :--- | :--- | ---: | ---: | :---: | :---: |
| Public Overview — chiaroscuro | `/photos?demo=4&mood=chiaroscuro` | 0 | 0.0000% | true | 4 albums / 55 frames / 3 plaques |
| Public Overview — concrete | `/photos?demo=4&mood=concrete` | 0 | 0.0000% | true | 4 albums / 55 frames / 3 plaques |
| Public Photo Focus | click first placard → first print | 0 | 0.0000% | true | 1 album / 12 frames / 1 focused / focus bar |
| Studio — Exhibitions | authenticated `/photos/admin` | 0 | 0.0000% | true | sidebar + album list |
| Studio — Upload | Upload tab | 0 | 0.0000% | true | dropzone + 5 `.admin-field` |
| Studio — Settings | Settings tab | 0 | 0.0000% | true | lighting/material segments |
| Studio — Details | open first album → Details tab | 0 | 0.0000% | true | 2 `.album-editor-tab` / 13 `.admin-field` |

Tracked properties per selector: `color`, `backgroundColor`, `fontFamily`, `fontSize`, `fontWeight`, `letterSpacing`, `textTransform`, `borderRadius`, `padding`, `borderTopColor`, `borderBottomColor`, `opacity`.

Public selectors: `.hud-button`, `.hud-directory`, `.hud-directory-item`, `.photo-focus-bar`, `.photo-focus-title`, `.museum-placard`, `.photo-frame`, `.photo-sheen`, `.soundtrack-plaque`, `.island-mosaic-host` (absent at album tier in both captures).
Studio selectors: `.studio-sidebar`, `.admin-field`, `.admin-button-primary`, `.admin-note`, `.album-editor-tab`.

## `/photos` CSS Isolation

Runtime `document.styleSheets` rule scan on `/photos?demo=4&mood=chiaroscuro`:

```text
total rules: 178
.admin-*:     0
.studio-*:    0
.album-editor-*: 0
.playground-wall-root: present
.hud-button:  present
```

Studio scan after authentication: `.admin-*` 57, `.studio-*` 58, wall present, `.hud-button` absent (Studio renders no public HUD).

## `.admin-*` Classification Audit (Task 2.1)

Grepped every class against non-test `src/**/*.tsx|ts` with exact class-token boundaries.

### Live — migrated verbatim into `src/styles/studio.css`

`admin-badge`, `admin-button`, `admin-button-primary`, `admin-draft`, `admin-draft-actions`, `admin-draft-header`, `admin-draft-list`, `admin-draft-status`, `admin-error`, `admin-failed-list`, `admin-field`, `admin-field-grid`, `admin-field-wide`, `admin-hidden-player`, `admin-inline`, `admin-list`, `admin-list-item`, `admin-note`, `admin-progress`, `admin-section`, `admin-section-header`, `admin-segment`, `admin-segmented`, `admin-segmented-wrap`, `admin-text-button`, `folder-dropzone`, `folder-dropzone-sub`, `folder-dropzone-title`.

The shared `:focus-visible` ring was split into its HUD half (`hud.css`) and Studio half (`studio.css`) so each domain owns its selectors.

### Dead — deleted

`admin-drawer`, `admin-drawer-header`, `admin-drawer-title`, `admin-drawer-sub`, `admin-drawer-body`, `admin-icon-button`, `admin-login`, `admin-subhead` (zero `src/` references). Dead R3F rules `.gallery-canvas` and `.soundtrack-overlay*` were also removed; `.gallery-canvas-loading` is retained in `wall.css` because the gallery Suspense fallback still uses it.

## Verbatim Execution Logs

### Focused suite

```text
$ npx vitest run src/lib/__tests__/cssBoundaryAudit.test.ts src/lib/lighting/__tests__/playgroundLighting.test.ts src/lib/__tests__/rawUrlAudit.test.ts

 Test Files  3 passed (3)
      Tests  25 passed (25)
```

### Full regression gate

```text
$ npm run typecheck
> tsc --noEmit

$ npm run lint
> eslint .
(clean)

$ npx vitest run

 Test Files  27 passed (27)
      Tests  398 passed (398)

$ npm run build
✓ Compiled successfully
✓ Generating static pages using 2 workers (13/13)
```

### Computed-style comparison

```text
$ node test-results/gallery-refactor/compare.mjs
total style diffs: 0
```

### Screenshot comparison

```text
$ node test-results/gallery-refactor/pixel-diff.mjs
overview-chiaroscuro changed 0 ratio 0.0000% PASS
overview-concrete   changed 0 ratio 0.0000% PASS
photo-focus         changed 0 ratio 0.0000% PASS
studio-exhibitions  changed 0 ratio 0.0000% PASS
studio-upload       changed 0 ratio 0.0000% PASS
studio-settings     changed 0 ratio 0.0000% PASS
studio-details      changed 0 ratio 0.0000% PASS
```

## Expected External-Resource Console Noise

The authenticated Studio fixture references local-upload files that are not present in this verification checkout, and the YouTube thumbnail proxy is unreachable from the sandbox. Both the pre-refactor and post-refactor runs therefore report the same external resource failures (HTTP `404` for `/photos/api/local-uploads/...` and `502` for `/photos/api/youtube/thumb/...`). They are data/network fixtures, identical on both sides of the refactor, and are not application runtime errors. The public demo states render inline SVG fixtures and report no application errors.

## Follow-Up

Task `5.3` remains open until this change merges: run `openspec-revise-change gallery-visual-fidelity` to retarget its `playground-wall.css` / `PlaygroundGallery` references to `src/styles/{tokens,wall,hud}.css`, `FramedPrint.tsx`, `AlbumPlacard.tsx`, and `WALL_SHADER_CFG`.
