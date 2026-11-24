# Research: `playground-wall-port`

## Source Material

- **2026-11-23 — User Request**:
  > "it still looks like ass lol. what is stopping us from just reusing the visual playground, and then the existing frontend/backend into it?"
  > `/openspec-ff-change`
- **2026-11-23 — Lessons Learned from PR #1 (R3F) & PR #2 (`dom-wall-engine`)**:
  - Every attempt to *re-invent* the gallery wall, lighting shader, glass placard, and recessed frame CSS from prose specs drifted visually from [playgrounds/photo_wall_playground.html](../../../playgrounds/photo_wall_playground.html):
    - PR #1 (R3F) produced flat oval lights, opaque placards, square prints, and 40-print pool starvation.
    - PR #2 (`dom-wall-engine`) initially produced diagonal lightmap wedges (from an interleaved `fixtureData` bug) and, even after patching to a Gaussian lightmap, produced washed-out flat mid-gray lighting contrast, a flat gray glass placard with centered text, and uniformly bright mats with no top-to-bottom spotlight falloff.
  - Meanwhile, `playgrounds/photo_wall_playground.html` already implements the exact approved visual look:
    - Real WebGL2 PBR plaster shader (`wall_albedo.webp`, `wall_normal.webp`, `wall_ao.webp`, `wall_roughness.webp`) with multi-head overhead cone + inverse-square + `N·L` + roughness micro-specular and `alabaster` / `concrete` / `chiaroscuro` palettes.
    - Exact `.museum-placard.mat-glass` (translucent green-tinted beveled glass with corner standoffs and top-left Swiss typography) plus `.mat-aluminum`, `.mat-acrylic`, `.mat-rag`.
    - Exact `.photo-frame.is-lit`, `.is-lit::after` directional top-to-bottom mat falloff, recessed cotton mat top inner shadow, directional `--sx`/`--sy` umbra+penumbra cast shadows, hover tilt + diagonal glass glare, and native YouTube embed.
    - Exact Swiss HUD segmented control, compact centered dock, and unobstructed Focus Bar.

## Glossary

| Term | Meaning in this Change | Does NOT mean |
| :--- | :--- | :--- |
| **Verbatim Playground Engine Port** | Lifting the exact CSS rules, exact WebGL2 PBR plaster shader (`pbrWallCanvas`), exact `LIGHT_CFG` / `rawIrradiance` math, and exact DOM structure from `playgrounds/photo_wall_playground.html` directly into Next.js components (removing only the playground debug sidebar, top demo banner, and hardcoded sample albums). | Re-inventing new shader curves, new lightmap approximations, or new CSS gradients from prose descriptions. |
| **Chunked Multi-Pass Spotlight Draw** | Preserving the playground's exact 24-spot WebGL2 fragment shader math verbatim and running additive passes in chunks of 24 visible fixtures when more than 24 fixtures are on screen (so visual output for 1–8 visible albums is bit-for-bit identical to the playground, while 50 albums still light up with zero cap). | Replacing the playground's per-pixel cone+normal+specular shader with a low-res baked lightmap that washes out contrast. |

## Candidate Tech

| Candidate | Status | Rationale & Date |
| :--- | :--- | :--- |
| **Verbatim Port of `photo_wall_playground.html` (CSS + WebGL2 PBR Shader + DOM) wired to `/api/wall` & `AdminDrawer`** | Adopted | Guarantees 1:1 visual fidelity with the approved playground by reusing its exact shader constants, CSS gradients, shadows, and lighting math rather than re-deriving them from prose (2026-11-23). |
| **Clean-room R3F (`frontend-gallery-wall`) or Clean-room Baked Lightmap (`dom-wall-engine`)** | Superseded | Repeatedly drifted into flat/washed-out lighting, dull placards, and missing top-to-bottom mat falloff (2026-11-23). |

## Links Out

- [playgrounds/photo_wall_playground.html](../../../playgrounds/photo_wall_playground.html)
- [DESIGN.md](../../../DESIGN.md)
- [admin-route-isolation/proposal.md](../admin-route-isolation/proposal.md)
