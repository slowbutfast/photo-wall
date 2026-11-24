---
name: Chiaroscuro Gallery (Verbatim Playground Port)
tokensRef: ../../../DESIGN.md
sourceReference: ../../../playgrounds/photo_wall_playground.html
---

## Visual Contract: Verbatim Match to `photo_wall_playground.html`

Every visual surface in the gallery MUST match [photo_wall_playground.html](../../../playgrounds/photo_wall_playground.html) directly (using its exact extracted CSS and WebGL2 PBR shader, not re-approximated values):

1. **WebGL2 PBR Plaster Wall (`PlaygroundPbrWall`)**:
   - Exact `wall_albedo.webp`, `wall_normal.webp`, `wall_ao.webp`, `wall_roughness.webp` shading with bright warm overhead halogen cones (`3500K`), crisp normal-mapped stucco micro-relief inside the beam, and deep velvety dark plaster between clusters in `chiaroscuro` / balanced twilight in `concrete` / bright warm gallery alabaster in `alabaster`.
2. **Beveled Glass Standoff Placard (Default) + Playground Settings Alternatives**:
   - Exact `.museum-placard.mat-glass` CSS from `photo_wall_playground.html`: single translucent green-tinted beveled glass pane (`backdrop-filter: blur()`), crisp top/left glass edge highlight, two metallic bottom standoff pins, top-left aligned `TeX Gyre Heros` Swiss typography (`title`, `caption`, optional `Artist - Song (0:00/3:25)`), sitting `44px` (`0.44u`) left of the photo grid.
   - Settings selector inside `AdminDrawer` switches live between **Beveled Glass** (`mat-glass`, default), **Brushed Aluminum** (`mat-aluminum`), **Matte Black Acrylic** (`mat-acrylic`), and **Archival Rag Paper** (`mat-rag`) using the playground's exact CSS classes.
3. **Framed Prints & Directional Mat Falloff**:
   - Exact `.photo-frame.is-lit` + `.is-lit::after` directional top-to-bottom shading overlay (top row prints bright under the spotlight, bottom row prints subtly shaded, clearing to `opacity: 0` in Print Focus), recessed cotton mat top inner shadow, directional `--sx`/`--sy` umbra + penumbra `box-shadow`, true `aspectRatio` sizing inside each cell (`<= 20` photos/album, `4–5` columns), hover tilt (`<= 5°`) + diagonal glass glare, and dimmed neighboring prints in Print Focus.
4. **Soundtrack Plaque**:
   - Exact `214px × 200px` matte-black plaque `12px` beneath the placard, `/api/youtube/thumb/[id]` resting thumbnail cleanly framed with centered play glyph, single native `youtube-nocookie.com` `<iframe>` on click with transparent gesture capture layer, and `Paused soundtrack on zoom out` toast.
5. **Swiss HUD, Compact Dock & Focus Bar**:
   - Top-right `24px`-inset sharp segmented control (`11px` uppercase `0.1em` tracking, `#FFFFFF` active fill + `#111111` ink), compact centered translucent dock (`max-width: min(760px, calc(100vw - 48px))`, `rgba(18,18,18,0.85)`, `blur(8px)`, horizontal edge fade masks), and tracked uppercase `← PREV` / `NEXT →` / `RETURN [ESC]` Focus Bar.
