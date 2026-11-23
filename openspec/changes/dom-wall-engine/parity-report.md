# Task 4.2 — Component-level parity report (`dom-wall-engine`)

**Subject:** production build (`npm run build` → `next start`), pinned `?demo=4`
fixture (4 albums × 12–16 prints, mixed `4:5` / `3:2` / `2:3`, real JPEGs).
**Viewports:** `1600×1000`, `1920×1080`, `390×844`. **Moods:** `concrete`,
`alabaster`, `chiaroscuro` (all `?mood=` pins). **Focus states:** Row-0 Overview,
Album Focus, Print Focus.
**Baseline:** `../reference/` playground crops (Task 1.1).

Raw evidence: `./parity-results.json` (per-page invariants, console errors, HTTP
failures) and 30 PNGs in this directory (see `README.md` for the inventory).

## Automated diagnostics (all pages)

| Check | Result |
| :--- | :--- |
| Console errors | **0** across 12 pages (9 mood×viewport + 2 brushed-aluminum + macro) |
| HTTP status ≥ 400 | **0** (all demo JPEGs resolve through `/demo/photo-NN.jpg?width=…`) |
| Horizontal document overflow | **0 px** at every viewport |
| Row-0 entry framing | `3/3` albums fully framed at `1600×1000` and `1920×1080`; `1/1` on `390×844` (aspect-aware target, see criterion 5) |
| Print focus dimming | `13` dimmed siblings + `1` focused for a 14-print album (every viewport/mood) |
| Focus bar | present and tracked in every `print` state; absent in overview/album |
| Macro tier (`?demo=1000`, zoomed out) | `tier=macro`, **24 mosaic canvases, 0 print elements** |
| Brushed Aluminum variant | `data-material="brushed-aluminum"` applied at 1600×1000 and 390×844 |

## Verdict per `design.md` criterion

### 1. Stucco relief & warm light pools with ~35–45 % inter-cluster ambient — **PASS**

Evidence: `1600x1000-{concrete,alabaster,chiaroscuro}-row0.png`,
`1920x1080-*-album.png`, `1600x1000-chiaroscuro-demo1000-macro.png`.

- Plaster grain/normal relief is visible at album and print zoom (not at macro,
  where the shader attenuates normal strength by design).
- The baked `RGBA8` lightmap encodes the ambient floor at `R = 0.40` (35–45 %
  target) between clusters and `R = 1.0` at pool peaks — asserted in
  `src/lib/lighting/__tests__/lightmap.test.ts`.
- Measured on the rendered wall (canvas only, `?demo=4&mood=concrete`,
  1600×1000, luminance 0–255): pool peak **≈ 173**, inter-cluster/ambient wall
  **≈ 70** → pool ≈ **2.5×** ambient after the exposure curve, exactly the
  intended "pools carry the image" ratio.
- Panning outside the baked AABB falls to the *same* ambient as the between-
  cluster gaps (the baked floor is subtracted in-shader), so no rectangle/edge
  smear is visible at any zoom.

**Caveat (shape, not value):** penumbrae follow the analytic cone (straight
edges where the cone meets the wall) rather than the playground's radial pool
gradient, so the pool silhouette reads slightly more angular than the reference
crop. Recorded as a visual-fidelity note, not a gate failure: contrast, warmth,
falloff and out-of-bounds behaviour all match the criterion.

### 2. Translucent beveled-glass placard + Brushed Aluminum alternative — **PASS**

Evidence: `1600x1000-concrete-album.png` (glass), 
`1600x1000-concrete-brushed-aluminum.png`, `390x844-concrete-brushed-aluminum.png`.

- Computed style on `.museum-placard[data-material="beveled-glass"]`:
  `backdrop-filter: blur(14px) saturate(1.25)` (verified in-browser, not just in
  CSS) — the plaster wall visibly blurs through the lower glass band while the
  caption block keeps its frosted backing for contrast.
- `214 × 200 px` (`2.14 × 2.00 u`) placards, `>= 4.5:1` ink contrast
  (alabaster uses dark ink, concrete/chiaroscuro light ink).
- Brushed Aluminum: `135°` silver gradient, horizontal grain, `3 px` dark core
  edge, two bottom screws, crisp downward shadow.
- Neither `.world` nor `.album-island` carries `opacity`, `filter`, `mask`,
  `clip-path` or `mix-blend-mode` (grep-verified in `globals.css`).

### 3. Aspect-fitted frames & recessed mats inside the neutral cell — **PASS**

Evidence: every `*-album.png` and `*-print.png`.

- `4:5`, `3:2` and `2:3` prints render at their true ratio (measured frame
  aspect equals the photo aspect to within rounding), centred in their
  `CELL_SIZE × CELL_SIZE` slot with an `11 px` `#F4F4F2`-family cotton mat.
- `<button>` prints are focusable, in `sortOrder`, with `alt` derived from the
  album caption/title (verified by DOM inspection in the capture run).

### 4. Unclipped directional cast shadows & `0.45` print-focus dimming — **PASS**

Evidence: `1600x1000-concrete-print.png`, `1600x1000-alabaster-print.png`,
`390x844-*-print.png`.

- Shadows project **away from the strongest fixture** and now fall *downward*
  (the `--sy` world-unit offset is sign-flipped into CSS y-down; the first
  capture showed shadows above the frames — fixed and re-captured).
- `.album-island { contain: layout }` only, so shadows are never clipped at the
  island edge (`contain: paint` is absent).
- Print focus: focused print at full exposure, siblings `opacity: 0.45` +
  `saturate(0.65)` — 13 dimmed / 1 focused on a 14-print album in every viewport
  and mood.

### 5. Swiss-label HUD & compact centered dock — **PASS**

Evidence: all `*-row0.png`, `*-print.png`.

- Top-right segmented control at `24 px` inset: `11 px / 500 / uppercase /
  0.1em`, white active fill with dark ink; 2 segments (`OVERVIEW` + lock) on `/`.
- Compact centered dock: `max-width: min(760px, calc(100vw - 48px))`,
  `rgba(18,18,18,0.85)`, `backdrop-filter: blur(8px)`, horizontal edge fade
  masks, no `EXHIBITION ROOMS` label; 4 album pills with the active album marked.
- Focus bar: `← PREV` / `NEXT →`, tracked-uppercase caption + camera/date/location
  metadata, `RETURN [ESC]`; measured height feeds `bottomInsetPx` framing.
- **Entry framing deviates deliberately on narrow viewports:** three 9 u albums
  cannot fit `390 px` above the macro threshold (that produced an unreadable
  macro overview), so the entry frames `3` albums ≥ 1024 px, `2` ≥ 768 px and `1`
  below that — always row 0, always horizontally framed, never the whole wall.

## Defects found and fixed during this task

| Defect | Fix |
| :--- | :--- |
| Print/placard shadows pointed **up** (world y-up applied directly to CSS y-down) | `calc(var(--sy) * -100)` in every directional `box-shadow` |
| Frosted placard backing covered the whole card, hiding the glass | backing restricted to the caption block (`height: 66%`), lower band stays glass |
| Light pools invisible: the shader added the baked ambient floor twice, flattening contrast | subtract `LIGHTMAP_AMBIENT_RATIO` from `R` in the wall shader, re-tuned ambient/spot exposure (pool ≈ 2.5× ambient) |
| Wall AABB visible as a hard rectangle at zoom | ambient now continuous across the baked bounds (floor subtraction) + `1.5 u` edge fade |
| Soundtrack plaque never rendered at album tier (visibility keyed to the *navigation* view mode) | plaque visibility follows the zoom **tier**; the state machine keeps the player lifecycle |
| Phone entry zoomed out past the macro threshold to fit 3 albums | aspect-aware entry framing (3/2/1 albums) |
| Pools washed out at macro tier | (existing) mosaic tier; wall keeps ambient + pools |
| Turbopack traced the whole project for the derivative cache dir | statically-scoped default cache path (build warning removed) |
| Demo photos looked like flat colour cards | deterministic SVG scenes rasterised to real JPEGs (grain from the repo's plaster maps) |

## Known limitations (not gate failures)

- Pool silhouette is cone-shaped (see criterion 1 caveat).
- Per-*print* shading uses each album's fixture rig (not the wall lightmap), so a
  print standing at the edge of its pool is not dimmed relative to one at the
  centre; this matches the analytic object-lighting model in `fixtures.ts`.
- Headless Chromium/SwiftShader rendering; hardware GPU rasterisation is out of
  scope here (see the spike hardware gates in `../spike-results.md`).
- Soundtrack thumbnails need network; offline the plaque shows its charcoal
  facade + play glyph (intended fallback).
