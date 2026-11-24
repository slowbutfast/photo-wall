# Research: Gallery Style and Canvas Refactor

## Source material

### 2026-11-24 — User Design-Drift & Codebase Maintainability Discussion

> why didn't codifying these design elements in `DESIGN.md` not solve these? what does the DESIGN.md cover? and would it make sense to include a codebase refactoring to untangle some of the files, and make the design elements more easily integrateable in the current app? i feel like a >1000 line file would obfuscate some of the design elements, leading to a drifting design style, but what do you think.
>
> do this as a new prerequisite change. fast forward the artifacts for the new prerequesite change.

### Raised but not acted on

- **Changing visual appearance (lighting, plaster UV scale, 2D glare, 3D frame bevels, light frosted focus bar, 2×2 4-album grid):** Deliberately excluded from this prerequisite refactor. Those visual/rendering upgrades belong exclusively to `gallery-visual-fidelity`, which executes immediately after this refactor lands so every visual edit happens in small, single-responsibility files with zero CSS cascade traps.
- **Migrating to Tailwind utility classes or CSS-in-JS:** Rejected. The gallery uses handcrafted CSS custom properties, `@font-face` (`TeX Gyre Heros`), `backdrop-filter`, and WebGL-coupled CSS variables (`--lit*`, `--sx`, `--sy`). Splitting into modular plain CSS files preserves zero runtime overhead and 100% compatibility with existing class contracts.

## Glossary

| Term | Means | Does NOT mean |
| :--- | :--- | :--- |
| **CSS Domain Ownership** | Strict, non-overlapping partition of selectors across `src/app/globals.css`, `src/styles/tokens.css`, `src/styles/wall.css`, `src/styles/hud.css`, and `src/styles/studio.css`, enforced by a static Vitest audit (`cssBoundaryAudit.test.ts`) including a cross-file duplicate-selector check. | Appending override blocks to the bottom of `globals.css` or duplicating selectors across two stylesheets. |
| **Prerequisite Refactor** | A behavior-preserving structural untangling scheduled **after** PR #6 (`admin-route-isolation` + `album-photo-management` + PATCH-01) merges to `main`, and **before** `gallery-visual-fidelity`. | Changing lighting math, shader uniforms, or HUD colors in this change. |
| **Wall Shader Config (`WALL_SHADER_CFG`)** | A single exported typed config object (`{ tileUnits, normalStrength, aoStrength }`) in `src/lib/lighting/playgroundLighting.ts` consumed by `PlaygroundPbrWall.tsx` and asserted verbatim in Vitest. | Hardcoded numeric literals buried inside `PlaygroundPbrWall.tsx`'s `paint()` function, or three disconnected ungrouped constants. |

## External research

| Source | What it establishes | Licence | Accessed |
| :--- | :--- | :--- | :--- |
| Repo `src/lib/__tests__/rawUrlAudit.test.ts` & `publicBoundaryAudit.test.ts` | Established static-analysis Vitest guardrail pattern for enforcing architectural boundaries in CI without browser flakiness. | Repo-internal | 2026-11-24 |

## Candidate tech

| Option | Decision | Reason | Date |
| :--- | :--- | :--- | :--- |
| 4 modular plain CSS files (`tokens.css`, `wall.css`, `hud.css`, `studio.css`) + minimal `globals.css` + static Vitest CSS boundary & duplicate-selector audit | **Adopted** | Zero new dependencies, eliminates the `globals.css` + `playground-wall.css` cascade collisions, moves live `.admin-*` rules into `studio.css`, and keeps `0 KB` studio CSS on public `/photos`. | 2026-11-24 |
| CSS Modules (`*.module.css`) | **Rejected** | Would rename every `.museum-placard`, `.photo-frame`, `.hud-*` class relied upon by Playwright tests, `GalleryCanvas` DOM queries (`.closest(...)`), and `gallery-visual-fidelity` specs. | 2026-11-24 |
| Styled-components / Emotion | **Rejected** | Adds runtime JS overhead on the public gallery and conflicts with Next 16 Server Components / CSP. | 2026-11-24 |

## Patterns adopted

- **Route-scoped stylesheet loading (`src/app/layout.tsx`, `src/app/(gallery)/`, `src/app/admin/layout.tsx`):** Public `/photos` loads only `globals.css` (reset + `tokens.css`), `wall.css`, and `hud.css`; `/photos/admin` additionally loads `studio.css`.
- **Static CSS Boundary & Duplicate-Selector Audit (`src/lib/__tests__/cssBoundaryAudit.test.ts`):** Mirrors `rawUrlAudit.test.ts` by scanning all 5 stylesheets with deterministic checks so forbidden cross-domain selectors AND cross-file duplicate selectors fail CI immediately.
- **Pre/Post Computed-Style & Screenshot Golden Diff:** Capturing `getComputedStyle` snapshots + screenshots *before* moving any CSS makes "visually identical" an objective, machine-verified assertion.

## Verified facts

| Claim | Value | How verified | Date | Volatility |
| :--- | :--- | :--- | :--- | :--- |
| `src/app/globals.css` on PR #6 branch | `1,413` lines; contains `51` `.admin-*` rules — only `.admin-drawer*` (`-body`, `-header`, `-sub`, `-title`) is dead, while `.admin-field`, `.admin-field-grid`, `.admin-note`, `.admin-button(-primary)`, `.admin-segment(ed)`, `.admin-hidden-player`, `.admin-draft*`, `.admin-progress` are **live** Studio rules used by `FolderDropzone` & `AlbumEditor`; also contains duplicate `.hud-*`/`.photo-focus-*` overrides (`L1295–L1413`) and dead R3F rules | Peer review against PR #6 branch + `read_file` on `src/app/globals.css` | 2026-11-24 | re-measure on merged `main` after PR #6 + PATCH-01 |
| `src/app/playground-wall.css` on PR #6 branch | `981` lines (`924` pre-PR #6); `113` rules scoped under `.playground-wall-root` | Peer review against PR #6 branch | 2026-11-24 | re-measure on merged `main` after PR #6 + PATCH-01 |
| `src/app/admin/studio.css` on PR #6 branch | Already exists and is imported exclusively by `src/app/admin/layout.tsx` (defines `.admin-login-*`, `.admin-root`, `.album-editor-*`, `.studio-*`, while relying on `globals.css` for the rest of `.admin-*`); `0 KB` studio CSS on `/photos` is already true for that file | Peer review against PR #6 branch | 2026-11-24 | re-measure on merged `main` after PR #6 + PATCH-01 |
| `GalleryCanvas.tsx` on PR #6 branch | `1,094` lines (`989` in pre-PR #6 `PlaygroundGallery.tsx`); `macroMosaic.ts` already exists as a separate module | Peer review against PR #6 branch | 2026-11-24 | re-measure on merged `main` after PR #6 + PATCH-01 |
| `rawUrlAudit.test.ts` font URL assertion | `src/lib/__tests__/rawUrlAudit.test.ts:L66-L70` asserts `globals.css` contains `url(./fonts/` (so moving `@font-face` to `src/styles/tokens.css` requires updating both the relative URL to `../app/fonts/` and this test assertion) | Peer review against PR #6 branch | 2026-11-24 | stable |
| `PlaygroundPbrWall.tsx` hardcoded shader constants | `WALL_TILE_UNITS = 5.2` (`L31`), `uNormalStrength = 1.4` (`L367–L369` on PR #6 branch), `uAoStrength = 0.75` | `read_file` + peer review against PR #6 branch | 2026-11-24 | re-measure on merged `main` after PR #6 + PATCH-01 |
| `DESIGN.md` staleness | Still documents PR #1 R3F `troika-three-text` (`L113`), `matrix3d` soundtrack overlay (`L139`), `Lazy-Loaded Curator Drawer` (`L142`), and old lighting/HUD defaults | `read_file` on `DESIGN.md` | 2026-11-24 | stable |

## Unverified assumptions

- Final merged line numbers on `main` after PR #6 (including PATCH-01) merges: **Task 0** gates implementation on PR #6 + PATCH-01 merging to `main` and re-derives exact line ranges before editing.

## Superseded claims

- **Superseded (2026-11-24):** Earlier draft claimed `studio.css` was `[NEW]` and that all `.admin-*` rules in `globals.css` were obsolete drawer leftovers. **Corrected:** On PR #6, `src/app/admin/studio.css` already exists (loaded only by `admin/layout.tsx`) and depends on live `.admin-*` rules still sitting in `globals.css`; only `.admin-drawer*` and unreferenced selectors are dead. This change moves `src/app/admin/studio.css` → `src/styles/studio.css` via `git mv` and migrates all live `.admin-*` rules into it.
- **Superseded (2026-11-24):** Earlier draft used `safe-test` for Vitest runs. **Corrected:** `safe-test` runs out of memory on this suite; run `npx vitest run` directly (matching PR #6 PATCH-01).

## Links out

- [DESIGN.md](../../../DESIGN.md)
- [openspec/changes/admin-route-isolation/proposal.md](../admin-route-isolation/proposal.md)
- [openspec/changes/album-photo-management/proposal.md](../album-photo-management/proposal.md)
- [openspec/changes/gallery-visual-fidelity/proposal.md](../gallery-visual-fidelity/proposal.md)
