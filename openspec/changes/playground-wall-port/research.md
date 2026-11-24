# Research: `playground-wall-port`

## Source Material

- **Pinned Playground Reference**: `playgrounds/photo_wall_playground.html` at commit **`dcc7a0484e0b1cb11a5a7c13120a9bf7c8e15edc`**.
- **2026-11-23 — User Request**:
  > "it still looks like ass lol. what is stopping us from just reusing the visual playground, and then the existing frontend/backend into it?"
- **2026-11-23 — Verified Facts from `playgrounds/photo_wall_playground.html` (`dcc7a048`)**:
  - **Filmic Tone Curve (`L1592`)**: The WebGL2 PBR wall shader applies `color = color / (color + vec3(0.88)) * 1.34;` once after summing all spots. Because that curve is nonlinear (`f(A) + f(B) != f(A + B)`), additive multi-pass chunking would over-brighten pixels lit by pass 2+. A **single-pass** shader reading culled fixtures from an `RGBA32F` data texture (up to 128 visible spots) preserves the exact filmic curve.
  - **Spot Collection (`L1469`)**: The playground collects only the first 24 fixtures in album order without viewport culling; production must cull to visible fixtures via `selectVisibleSpots` before packing the `RGBA32F` texture.
  - **Exact Placard Classes (`L1074–L1090`, `L1373`)**: The playground defines `data-placard="acrylic" | "aluminum" | "foamcore"` with CSS classes `.mat-acrylic` (default — the translucent green-tinted beveled glass look), `.mat-aluminum`, and `.mat-foamcore`. There is no `.mat-glass`, `.mat-rag`, or `.theme-*` class; moods are applied via `applyTheme()`.
  - **Exact `LIGHT_CFG` (`L1383`, `L1389–L1397`, `L1485`)**: `fixturePerCols: 2`, `hotspotFrac: 0.28`, `heightFrac: 0.98`, `innerDeg: 16`, `outerDeg: 32`, `ambientObj: 0.42`, `objDepth: 9` (overridden at `L1485` to `14` for `.museum-placard` and `22` for `.photo-frame`), plus `state.throwFrac = 0.72`.
  - **Flex Layout & `preserve-3d` (`L185–L191`, `L1442`)**: The playground uses `display: flex; gap: 44px; padding: 20px` + `preserve-3d` + world `rotateX/rotateY` sway. In production, `islandLayout.ts` absolute positioning is required for culling/camera, and dropping world `preserve-3d`/sway avoids Chrome `backdrop-filter` breakage (keeping local `perspective` + `preserve-3d` only on `.photo-frame` for hover tilt).
- **2026-11-23 — Verified Reusable Foundation on `feat/dom-wall-engine` (`f43f0dc`)**:
  - R3F / Three.js is already deleted on `feat/dom-wall-engine` (`f43f0dc`), and the following modules are implemented and tested: `macroMosaic.ts` (brought 1,000-print settle hitch from `233ms` down to `49.7ms`), `visibleIslands.ts`, `zoomTier.ts`, `cameraMath.ts` (Y-flip, `cameraToCssScale`, aspect-aware `computeFirstRowBounds`), `soundtrackState.ts`, `local-uploads` `sharp` `?width=`, `PLACARD_GAP = 0.44` / `ISLAND_GAP = 2.2`, `MAX_PHOTOS_PER_ALBUM = 20`, and PATCH-01 pointer-capture + `overviewNonce` fixes.

## Glossary

| Term | Meaning in this Change | Does NOT mean |
| :--- | :--- | :--- |
| **Single-Pass Spot Data Texture** | Packing culled visible fixtures (`<= 128`) into a row-major `RGBA32F` texture (Row 0 = `pos`, Row 1 = `axis`) read in one WebGL2 fragment pass so the playground's nonlinear filmic curve runs once. | Additive multi-pass chunking (which double-applies the filmic curve) or a low-res baked lightmap. |
| **Placard Class Mapping** | Mapping UI labels to the playground's actual CSS classes: **Beveled Glass** → `.mat-acrylic` (default), **Brushed Aluminum** → `.mat-aluminum`, **Archival Foamcore** → `.mat-foamcore`. | Inventing new `.mat-glass` or `.mat-rag` CSS from scratch. |

## Links Out

- [playgrounds/photo_wall_playground.html](../../../playgrounds/photo_wall_playground.html) (pinned at `dcc7a0484e0b1cb11a5a7c13120a9bf7c8e15edc`)
- [admin-route-isolation/proposal.md](../admin-route-isolation/proposal.md)
