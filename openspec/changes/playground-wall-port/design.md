---
name: Chiaroscuro Gallery (Verbatim Playground Port)
tokensRef: ../../../DESIGN.md
sourceReference: ../../../playgrounds/photo_wall_playground.html
pinnedCommit: dcc7a0484e0b1cb11a5a7c13120a9bf7c8e15edc
---

## Visual Contract: Verbatim Match to `photo_wall_playground.html` (`dcc7a048`)

All visual surfaces reuse the exact CSS classes, `applyTheme()` mood palettes, and single-pass WebGL2 PBR shader from `playgrounds/photo_wall_playground.html` (`dcc7a048`):

### Placard Material Mapping (Real Playground Classes)
| Settings Label | Playground `data-placard` | Playground CSS Class | Default? |
| :--- | :--- | :--- | :---: |
| **Beveled Glass** | `acrylic` | `.mat-acrylic` | **Yes (Default)** |
| **Brushed Aluminum** | `aluminum` | `.mat-aluminum` | Optional |
| **Archival Foamcore** | `foamcore` | `.mat-foamcore` | Optional |

*(Do NOT invent `.mat-glass`, `.mat-rag`, or `.theme-*` classes; apply moods via `applyTheme()` CSS variables + WebGL2 uniforms.)*

### Visual Surface Checklist
1. **Single-Pass WebGL2 PBR Plaster Wall (`PlaygroundPbrWall`)**: Exact `wall_{albedo,normal,ao,roughness}.webp` shader with `N·L * cone / r² + roughness specular` and single filmic curve `color / (color + 0.88) * 1.34`, verified within a `pixelmatch` threshold against `photo_wall_playground.html` for `alabaster`, `concrete`, and `chiaroscuro`.
2. **Placard & Soundtrack Stack**: `.museum-placard.mat-acrylic` (`214px × 200px`, translucent beveled glass + bottom metallic standoff pins + top-left `TeX Gyre Heros` Swiss typography) `44px` (`PLACARD_GAP = 0.44u`) left of the photo grid, with `214px × 200px` matte-black `.soundtrack-plaque` `12px` beneath it (`/api/youtube/thumb/[id]` + play glyph + native `<iframe>` + transparent gesture capture layer).
3. **Framed Prints & Directional Mat Falloff**: Exact `.photo-frame.is-lit` + `.is-lit::after` directional top-to-bottom shading overlay (`ambientObj: 0.42`, clearing to `opacity: 0` in Print Focus), recessed cotton mat top inner shadow, directional `--sx`/`--sy` cast shadows (`objDepth = 14` placard / `22` print), local 3D hover tilt (`<= 5°`) + diagonal glass glare, and `filter: brightness(0.45) saturate(0.6)` on non-focused sibling prints in Print Focus.
4. **Swiss HUD, Compact Dock & Focus Bar**: `24px`-inset sharp segmented control (`11px` uppercase `0.1em` tracking, `#FFFFFF` active fill + `#111111` ink), compact centered translucent dock (`max-width: min(760px, calc(100vw - 48px))`, `rgba(18,18,18,0.85)`, `blur(8px)`, horizontal edge fade masks), and tracked uppercase `← PREV` / `NEXT →` / `RETURN [ESC]` Focus Bar.
