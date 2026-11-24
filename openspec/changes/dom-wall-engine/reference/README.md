# Task 1.1 — Playground Visual Acceptance Baseline

Component-level reference crops captured from the approved visual prototype
[`playgrounds/photo_wall_playground.html`](../../../playgrounds/photo_wall_playground.html).
These are the acceptance baseline that Task 4.2 compares the `dom-wall-engine`
rendering layer against (see the 5 criteria in
[`../design.md`](../design.md)).

## Capture conditions

| Item | Value |
| :--- | :--- |
| Capture date | 2026-11-23 |
| Prototype | `playgrounds/photo_wall_playground.html` @ `feat/dom-wall-engine` (unmodified) |
| Server | `python3 -m http.server 4173 --bind 127.0.0.1` from the **repository root** (the prototype loads `../public/textures/wall/*.webp`, so `file://` and a `playgrounds/` cwd both break the PBR wall) |
| URL | `http://127.0.0.1:4173/playgrounds/photo_wall_playground.html` |
| Viewport | `1600 × 1000`, `deviceScaleFactor: 1`, `prefers-color-scheme: dark` |
| Browser | Headless Chromium (Playwright), SwiftShader WebGL2 (`--enable-unsafe-swiftshader`); the script aborts if the prototype falls back from WebGL2 |
| Album | `tokyo` ("Tokyo Nocturnes", 14 prints, soundtrack attached) |
| Zoom | Album Focus (`flyToAlbum('tokyo')`), camera settled to `state.scale === state.targetScale` before capture |
| Mood | Forced through the prototype's own `#adminMoodPreview` control (dispatched `change` event), verified via `state.theme` |
| Chrome hidden | `.hud-top-right`, `#albumDock`, `#photoFocusBar`, `#minimapBox`, `#adminDrawer`, `#playgroundToast`, `.playground-section` — capture-only, so crops isolate the wall |
| Frame style | Prototype default: `mat` (11px cotton mat) |
| Placard material | Prototype default: `acrylic` = Beveled Glass Standoff |

## Files

One crop set per mood (`alabaster` = day, `concrete` = twilight,
`chiaroscuro` = night):

| File | What it is the baseline for |
| :--- | :--- |
| `album-island-album-zoom-<mood>.png` | Criterion 1 + 3: desaturated plaster relief, warm `3500K` pool with `~35–45%` ambient between clusters, aspect-fitted frames centered in their cells, placard + soundtrack stack |
| `placard-beveled-glass-<mood>.png` | Criterion 2: translucent green-tinted beveled glass, corner standoffs, frosted text backing, plaster visible through the glass, placard ink flipping with mood |
| `print-frame-<mood>.png` | Criterion 3 + 4: cotton mat, top recessed inner shadow, true aspect ratio, downward cast shadow onto the wall |
| `island-edge-shadows-<mood>.png` | Criterion 4: last print row's umbra/penumbra falling onto open plaster **outside** the island's box — the exact thing `contain: paint` would clip; `contain: layout` must not |
| `viewport-album-zoom-<mood>.png` | Full `1600×1000` frame of the same view for whole-scene comparison |

## Reproduce

```bash
# 1. Serve the repository root (required for ../public/textures/wall/*.webp)
python3 -m http.server 4173 --bind 127.0.0.1

# 2. Capture (Playwright is not a project dependency)
PLAYWRIGHT_MODULE=playwright node openspec/changes/dom-wall-engine/reference/capture.mjs
#    or, with an existing install:
PLAYWRIGHT_MODULE=/path/to/node_modules/playwright-core/index.js \
  node openspec/changes/dom-wall-engine/reference/capture.mjs
```

`PLAYGROUND_ORIGIN` and `REFERENCE_ALBUM_ID` override the defaults.

## Known limitations of the reference

- **YouTube soundtrack thumbnails are unavailable offline.** The prototype
  fetches `i.ytimg.com` directly, so the soundtrack plaque renders its grey
  loading facade with the play glyph. `dom-wall-engine` proxies the thumbnail
  through `/api/youtube/thumb/[id]`; the plaque *geometry* (`214 × 200px`,
  12px below the placard) is what this crop is the baseline for.
- **`concrete` vs `alabaster` wall bases are close in these crops** because the
  overlay light pool dominates the island crop. Mood differences are clearest in
  the placard ink (`#1D1E1C` alabaster vs `#F4F6F4` concrete/chiaroscuro) and in
  the `viewport-album-zoom-*` frames.
- **Print content is the prototype's synthetic sample art**, not photographs.
  Only wall/light/frame/placard/shadow rendering is under comparison.
- Crops are captured with SwiftShader (software WebGL2), not an iGPU. They are
  valid for *visual* comparison only; performance numbers come from Task 1.5.
