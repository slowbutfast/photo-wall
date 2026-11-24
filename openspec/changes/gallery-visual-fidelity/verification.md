# Verification Report: Gallery Visual Fidelity

## Executive Summary & Environment
- **Change:** `gallery-visual-fidelity`
- **Branch:** `feat/gallery-visual-fidelity` (worktree `/home/node/global-sandbox/projects/photo-wall-visual-fidelity`, branched from `main` `9ee3bb7`)
- **Automated Gate:** `npm run typecheck`, `npm run lint`, `npx vitest run` (**27/27 files, 399/399 tests passed**), and `npm run build` all exited `0`.
- **Visual Verification:** Playwright (`1440×900` desktop `DPR = 1` + `390×844` mobile) against `next start` confirmed all visual, lighting, proportion, 2D glare, 3D frame bevel, and HUD fixes side-by-side against `research.md` baseline captures.

---

## Requirement Adherence Audit Matrix

| Spec Requirement / Scenario | Verifying Artifact / Test | Outcome |
| :--- | :--- | :--- |
| **Fine-grain plaster & warm charcoal-taupe chiaroscuro ambient** (`3d-pbr-wall-and-lighting`) | `playgroundLighting.test.ts` (`WALL_SHADER_CFG` = `{ tileUnits: 2.2, normalStrength: 0.4, aoStrength: 0.55 }`) + `after-overview-chiaroscuro.png`, `after-photo-focus.png` | **PASS** |
| **Single wide elliptical cluster wash covering placard + grid** (`3d-pbr-wall-and-lighting`) | `playgroundLighting.test.ts` (`1` fixture/album, `ellipseX >= 1` in `packFixtureDataTexture` Row 1 `.w`, `placard.lit >= 0.72`, top-row `lit >=` bottom-row `lit`) + `after-overview-chiaroscuro.png` | **PASS** |
| **Soundtrack fallback poster & quiet zoom-out** (`3d-pbr-wall-and-lighting`) | `after-album-focus.png` (`Tokyo Midnight / Lofi Girl` styled poster + circular play button) + Playwright `toastCount === 0` | **PASS** |
| **`PLACARD_GAP = 0.94u`, balanced `2×2` for 4 albums, Row-0 entry framing** (`instanced-photo-renderer`) | `islandLayout.test.ts` (`PLACARD_GAP / WORLD_SCALE === 94`, `albumsPerRowForCount(4) === 2`, `entryFirstRowCount(4, 1.6) === 2`) + `fakeManifest.test.ts` + `after-overview-chiaroscuro.png` | **PASS** |
| **Full-fidelity neighbors (zero `.dimmed`), 2D opposite specular glare, 3D frame bevel, tilt-reactive cast shadow** (`instanced-photo-renderer`) | Playwright eval (`dimmedCount: 0`, `sheen1: translate3d(10.6%, -9.9%, 0px)` vs `sheen2: translate3d(-10.5%, 9.8%, 0px)`, `tilt1: { sx: "5.04px", sy: "-4.68px" }` vs `tilt2: { sx: "-4.99px", sy: "4.63px" }`, `placardOverlapsPrint: false`) + `after-photo-focus.png` | **PASS** |
| **Title Case Helvetica dock & flush sharp-edged top-right switcher** (`gallery-hud-and-curator-ui`) | Playwright eval (`fontLoaded: true`, `dockTextTransform: "none"`, `topBtnBorderRadius: "0px"`) + `cssBoundaryAudit.test.ts` | **PASS** |
| **Bright light-frosted Photo Focus bar with Camera/Date/Location preserved** (`gallery-hud-and-curator-ui`) | Playwright eval (`barBg: "rgba(244, 244, 242, 0.92)"`, `titleColor: "rgb(17, 17, 17)"`, `titleTransform: "none"`) + `after-photo-focus.png` | **PASS** |

---

## Side-by-Side Visual Verification

| State | Baseline (`existing-*.png`) | Post-Fix (`after-*.png`) | Verified Improvements |
| :--- | :--- | :--- | :--- |
| **Overview (`chiaroscuro`)** | [existing-overview-chiaroscuro.png](./assets/existing-overview-chiaroscuro.png) | [after-overview-chiaroscuro.png](./assets/after-overview-chiaroscuro.png) | Balanced `2×2` grid, single soft elliptical wash per album covering smoky glass placards and prints, warm plaster ambient, sharp `OVERVIEW` button, Title Case dock, styled `Tokyo Midnight` poster. |
| **Overview (`concrete`)** | [existing-overview-concrete.png](./assets/existing-overview-concrete.png) | [after-overview-concrete.png](./assets/after-overview-concrete.png) | Even single-wash illumination, zero scalloped hotspots, balanced `2×2` layout. |
| **Album Focus** | [existing-album-focus.png](./assets/existing-album-focus.png) | [after-album-focus.png](./assets/after-album-focus.png) | Crisp white placard ink over smoky beveled glass, `94px` placard gap, styled soundtrack poster, fine architectural plaster. |
| **Single-Photo Inspection** | [existing-photo-focus.png](./assets/existing-photo-focus.png) | [after-photo-focus.png](./assets/after-photo-focus.png) | Fine plaster grain (no craters), no placard overlap (`placardRight: 71.7px` vs `focusedLeft: 478.3px`), `dimmedCount: 0` full-fidelity neighbor, 3D right/bottom frame bevels, 2D X+Y opposite glare, dynamic `--tilt-sx`/`--tilt-sy` shadow, bright frosted `rgba(244, 244, 242, 0.92)` focus bar. |
| **Mobile (`390×844`)** | — | [after-mobile-photo-focus.png](./assets/after-mobile-photo-focus.png) | Clean mobile Single-Photo Inspection (`PREV`: `44px`, `NEXT`: `44px`, `RETURN [ESC]`: `50.6px` touch targets in `hud.css`) with light frosted inspection bar. |

---

## Verbatim Execution Logs

```text
> npm run typecheck && npm run lint && npx vitest run && npm run build
tsc --noEmit -> exit 0
eslint .     -> exit 0
Test Files  27 passed (27)
Tests       399 passed (399)
next build   -> Compiled successfully, 13/13 static pages, exit 0
```
