# Verification: Exhibition Title Signage & Persistent Return HUD

## 1. Executive Summary & Environment

**Status:** PASS — all automated, static-audit, production-build, and browser checks are green.

| Item | Value |
| :--- | :--- |
| Change | `exhibition-signage-and-return-hud` |
| Branch | `feat/exhibition-signage-and-return-hud` (from `main` `6e56645`) |
| Base revision | `6e56645` (`origin/main` `cdeda3b` + PR #17 `alabaster-glass-legibility` + handoff commit) |
| Environment | Linux, Node 24.x, Next.js 16.4.6, Chromium (Playwright, `--no-sandbox`), viewport `1440×900` and `390×844` |
| Automated suite | `43` files / `639` tests passing (`npx vitest run`) |
| Static gates | `npx tsc --noEmit` clean; `npx eslint src` clean |
| Production build | `npm run build` succeeded |
| Parallel-branch note | `mobile-print-transitions` is **not** merged on this branch. `src/lib/__tests__/printHandoffAudit.test.ts` does not exist here, so its `hud-key-hint` `[ESC]` assertion could not be edited. **Post-merge action:** after `mobile-print-transitions` lands, merge `origin/main` and remove that assertion. |

## 2. Requirement Adherence Audit Matrix

### `gallery-hud-and-curator-ui` (MODIFIED)

| Scenario | Implementation evidence | Verifying test |
| :--- | :--- | :--- |
| Public gallery loads zero admin UI or auth calls | Unchanged public module graph; no admin import added | `src/lib/__tests__/publicBoundaryAudit.test.ts` |
| No album directory / top-right `Overview`; persistent `RETURN` steps focus levels | `GalleryHud.tsx` renders only `.hud-return-persistent`; `returnOneLevel()` drives `print → album → overview` | `GalleryHud.test.tsx` (hidden in overview; enabled in album/print; click steps both levels) |
| Stepping prints shows plain `PREV`/`NEXT`, caption, manual metadata only | `PhotoFocusBar.tsx` plain labels; arrow glyphs removed; duplicate `RETURN` removed | `GalleryHud.test.tsx` (`PREV`, `NEXT`, no `←`/`→`, no `RETURN` button, spacer present) |
| Exiting Print Focus fades the bar with latched content while RETURN persists | `PhotoFocusBar` stays mounted; `focusedAlbumId` is retained by `enterAlbum` so caption/metadata stay painted through `0.22s`; `.hud-return-persistent` is a separate DOM node | `GalleryHud.test.tsx` latch test; Playwright mid-fade probe |
| Hidden bar and hidden RETURN are not focusable | `inert`, `aria-hidden`, `disabled`, `tabIndex={-1}` in overview/album | `GalleryHud.test.tsx` DOM attribute assertions |
| Reduced motion disables HUD transitions | `@media (prefers-reduced-motion: reduce) { transition: none }` | Playwright: bar/`RETURN` `transitionDuration === "0s"` |
| Safe-area-aware HUD | `right: max(22px, env(safe-area-inset-right))`, `bottom: calc(11px + env(safe-area-inset-bottom))`; `14px` / `10px` at `≤767px` | Playwright mobile: `RETURN` rect `294.89 → 376 × 796 → 840` |
| Coarse-pointer targets ≥ `44×44` | Existing `.hud-button::before` overlay plus mobile `min-height: 44px`; `position: absolute` restored inside coarse media | Playwright mobile: `RETURN` renders `81.11 × 44` at `(pointer: coarse)`; `touchAudit.test.ts` |

### `3d-pbr-wall-and-lighting` (ADDED)

| Scenario | Implementation evidence | Verifying test |
| :--- | :--- | :--- |
| 2 × 1 Beveled Glass banner flush with the top-left album placard | `ExhibitionTitleSign.tsx` + `TITLE_SIGN_WIDTH = 2 × PLACARD_WIDTH + GUTTER` (`4.52u`), `TITLE_SIGN_HEIGHT = 2.0u`; `GalleryCanvas` derives the visible `columnGutter` and anchors the top edge to `islandTop − ISLAND_PADDING − PLACARD_TOP_OFFSET` | `ExhibitionTitleSign.test.tsx`, `cameraMath.test.ts` |
| Existing Beveled Glass reused verbatim (no bespoke material) | Widened `:is(.museum-placard, .exhibition-title-placard).mat-acrylic` rules: same smoked gradient, bevels, glass ink, standoffs, Alabaster plate, coarse frosted fallback | `placardGlassLegibility.test.ts`, `touchAudit.test.ts`; Playwright computed-style parity |
| Bold 32px flush-left `greg's` / `photo wall` | `.exhibition-title-line` (`32px`, `700`, `1.05`, `-0.015em`) | Playwright computed typography |
| `← home` flush-left beneath, understated, no underline, `-3px` hover | `wall.css` mood variables + fine-pointer gated hover; `text-decoration: none` | Playwright all 3 moods: `matrix(1,0,0,1,-3,0)`, `textDecorationLine: none` |
| Native pointer isolation | `GalleryCanvas` native `pointerdown`/`click` return on `.exhibition-sign-column` | `ExhibitionTitleSign.test.tsx` integration test; Playwright pan probe |
| Browser tab title `"greg's photo wall"` | `src/app/layout.tsx` | `src/app/__tests__/layout.test.ts`; Playwright `document.title` |
| Row-0 framing includes the banner + symmetric outer margins | `GalleryCanvas` derives the visible `columnGutter` (placard → first framed photo) and `contentRight` (rightmost framed photo); `includeTitleSign` spans `titlePlacard.x` → `contentRight` | `cameraMath.test.ts`; Playwright gutter/margin probe |

## 3. Resolved Assumptions & Empirical Proof

| Assumption | Result |
| :--- | :--- |
| Banner width is exactly 2 album placards + one grid gutter | **PASS** — computed width ratio `452 / 214 = 2.112` |
| Top and bottom edges are flush with the adjacent album placard | **PASS** — both deltas `0 px` on desktop (all moods) and mobile Album View |
| Horizontal gutter is the visible album placard → first framed-photo gutter | **PASS** — banner→placard `46.646px` vs placard→first framed photo `46.145px` (delta `0.5px`). The structural cell gutter is `39.292px`; the banner is pushed left by the same frame mat inset (`7.354px`) that visually separates the placard from the framed print, so both gaps read identically. |
| Outer left and right wall margins match | **PASS** — left `86.40px`, right (to rightmost framed print) `86.59px`, delta `0.19px` (~`6%` each side) |
| Title is roughly 1.8×–2× the album title scale and flush-left | **PASS** — `32px / 700 / 33.6px` line-height (album token `16px`), `text-align: left`, lines `greg's` / `photo wall` |
| `← home` is flush-left beneath the banner | **PASS** — left delta `0 px`; `13.5px / 500`; `text-decoration-line: none` |
| Existing glass material parity (no new design) | **PASS** — title and album placard share the identical `backgroundImage`, `borderTop` (`1px rgba(242,255,248,0.72)`), glass ink `rgb(244,246,244)`, box-shadow rule and `backdrop-filter`; alabaster shares PR #17's dark plate |
| Bottom corner standoffs | **PASS** — two `.placard-standoff` elements, computed `display: block`, bottom-left/bottom-right on the banner |
| Native pointer events on the banner never pan the wall | **PASS** — `.wall-world` transform unchanged after a drag from `← home` |
| `RETURN` has `0 px` shift between `print` and `album` | **PASS** — identical rect `top 858.703125`, `left 1336.890625`, `width 81.109375`, `height 30.296875`; delta `{0,0,0,0}` |
| Reduced motion | **PASS** — bar/`RETURN` `transitionDuration: "0s"` |
| Chromium test harness | System Chrome launched with `--no-sandbox` because the sandboxed MCP browser cannot start in this container |
| Mobile entry after doubling the banner | **Resolved** — at `390×844` the full banner + Row 0 renders at macro tier. The Overview fit still spans `titlePlacard.x` → rightmost framed photo with `6%` padding; in Album View the visible framed photos span `22.65 → 367.35px` inside the `390px` viewport (equal `22.65px` margins, `0` cropped frames). |
| Exit-fade content latch | The planning template specified a render-time ref read; React Compiler lint (`react-hooks/refs`) rejects that. `returnOneLevel()` keeps `focusedAlbumId` when stepping `print → album`, so `PhotoFocusBar` reads the retained album and paints the same caption through the `0.22s` fade. Behavior is identical. |

## 4. Nomenclature & Code Symbol Audit

| Symbol / selector | Location | Contract |
| :--- | :--- | :--- |
| `TITLE_SIGN_WIDTH` | `src/lib/camera/cameraMath.ts` | `2 × PLACARD_WIDTH + GUTTER` = `4.52u` (`452px`) |
| `TITLE_SIGN_HEIGHT` | `src/lib/camera/cameraMath.ts` | `PLACARD_HEIGHT` = `2.0u` (`200px`) |
| `TITLE_SIGN_GAP` | `src/lib/camera/cameraMath.ts` | Fallback `PLACARD_GAP` = `0.94u` (`94px`) when no album photos |
| `columnGutter` | `GalleryCanvas.tsx` (`albumColumnGutter`) | Visible album placard → first framed-photo gutter (`PLACARD_GAP +` first-frame mat inset) |
| `contentRight` | `GalleryCanvas.tsx` (`albumPhotoFrameRight`) | Rightmost framed-photo edge across the Row-0 albums |
| `findTopLeftAlbum(placements)` | `src/lib/camera/cameraMath.ts` | Highest top edge, then leftmost; never assumes index 0 |
| `includeTitleSign(bounds, placements)` | `src/lib/camera/cameraMath.ts` | Pure wrapper; expands from the album placard left, trims to the photo-grid right, recomputes union `width`/`x` |
| `.exhibition-sign-column` | `ExhibitionTitleSign.tsx`, `wall.css`, `GalleryCanvas.tsx` | World-space sign container; native pointer exclusion |
| `.exhibition-title-placard.mat-acrylic` | `ExhibitionTitleSign.tsx`, `wall.css` | Grid-locked 2 × 1 banner reusing the album glass; no `.museum-placard` |
| `.exhibition-title-line` | `ExhibitionTitleSign.tsx`, `wall.css` | `greg's` / `photo wall`, 32px bold flush-left, `var(--glass-ink)` |
| `.exhibition-home-link` / `.home-arrow` | `ExhibitionTitleSign.tsx`, `wall.css` | Painted portfolio wayfinding; flush-left, fine-pointer hover only |
| `.hud-return-persistent` | `GalleryHud.tsx`, `hud.css` | Single persistent bottom-right `RETURN` |
| `.photo-focus-return-spacer` | `PhotoFocusBar.tsx`, `hud.css` | Invisible mirror reserving the `RETURN` slot |

No stale `.hud-top-right`, `Overview`, `hud-key-hint`, arrow glyphs, bespoke banner material, or misplaced standoffs remain in the public HUD/sign path.

## 5. Verbatim Execution Logs

### Automated suite

```text
$ npx vitest run

 Test Files  43 passed (43)
      Tests  639 passed (639)
   Duration  19.45s
```

### Typecheck, lint, build

```text
$ npx tsc --noEmit
(no output)

$ npx eslint src
(no output)

$ npm run build
✓ Compiled successfully
  Finished TypeScript
✓ Generating static pages (13/13)
```

### Playwright (system Chromium, production `next start`)

```text
DESKTOP chiaroscuro {
  "lines": ["greg's", "photo wall"],
  "topDelta": 0,
  "bottomDelta": 0,
  "widthRatio": 2.112,
  "signGap": 46.646,
  "photoCellGap": 39.292,
  "photoFrameGap": 46.145,
  "leftMargin": 86.40,
  "rightMargin": 86.59,
  "marginDelta": 0.19,
  "homeLeft": 0,
  "materialSameAsAlbum": { "background": true, "borderTop": "1px rgba(242,255,248,0.72)", "glassInk": "rgb(244,246,244)", "backdrop": "blur(2.5px)" },
  "standoffs": 2,
  "type": { "fontSize": "32px", "fontWeight": "700", "lineHeight": "33.6px", "textAlign": "left" },
  "home": { "size": "13.5px", "weight": "500", "underline": "none" },
  "hover": { "arrowTransform": "matrix(1, 0, 0, 1, -3, 0)", "underline": "none" },
  "class": "exhibition-title-placard mat-acrylic"
}
DESKTOP concrete    (identical geometry/material; home hover #ffffff)
DESKTOP alabaster   (identical geometry; PR #17 dark plate; home ink #111111, hover #000000)

MOBILE chiaroscuro overview { "tier": "macro", "albumWidthRatio": 0.587, "return": { "top": 796, "left": 294.89, "width": 81.11, "height": 44 } }
MOBILE chiaroscuro album {
  "tier": "album", "homeLeft": 0,
  "signToAlbumGap": 54.402, "frameGap": 53.818,
  "backdrop": "none", "background": "dark coarse frosted fallback", "standoffs": 2
}
MOBILE concrete / alabaster — same geometry; alabaster keeps the PR #17 dark plate.

PAN        { "unchanged": true }
RETURN     album = print = { "top": 858.703125, "left": 1336.890625, "width": 81.109375, "height": 30.296875 }; delta {0,0,0,0}
PRINT      prev ["PREV", "NEXT"], barHasReturnButton false
REDUCED    bar "0s", returnButton "0s"
```

### TDD evidence

The targeted suite was run before implementation and failed as expected: missing `findTopLeftAlbum` / `includeTitleSign` / `TITLE_SIGN_*`, the removed `Overview` control, and the missing `ExhibitionTitleSign`. The banner redesign then updated those assertions first (`452 × 200px`, flush-left lines, reused glass material) before the implementation was adjusted to pass.

## PATCH-01 — Anchor the title banner to a stable Row-0 wall frame

### What changed
- Added pure `computeRowZeroFrame(placements)` returning the first row's `left`, `top` and `right` edges. `findTopLeftAlbum` is now the **leftmost Row-0 album**, not the tallest.
- `includeTitleSign` derives `signLeft` from `frame.left + ISLAND_PADDING - columnGutter - TITLE_SIGN_WIDTH` and its default right edge from `frame.right - ISLAND_PADDING`; `GalleryCanvas` anchors both the banner position and the Overview framing to the same frame.
- `computeWallGridPositions` now top- and left-aligns each album inside its grid cell (`x = cursor + ownWidth / 2`, `y = rowTop - ownHeight / 2`). Cell widths, row heights, `ISLAND_GAP` and row centring are unchanged.
- New `wall-manifest-and-db` delta spec records the alignment rule.

### Deliberate layout change
On walls where albums in a row/column differ in size, the smaller album now sits at its cell's top-left instead of being centred. Walls where every album is the same size have a `0 px` diff. Mobile (1 album per row) is unchanged: the banner stayed at `top 349.844 / left 23.401 / width 98.331` before and after.

The two existing tests that asserted row albums share the same **centre** `position.y` (the 7-album wrap test and the `?demo=4` 2×2 fixture) encoded the old centring and were updated to assert the shared **top edge** (`position.y + bounds.height / 2`). This is the only test-assertion change; no functional coverage was removed.

### Reproduction (TDD)
`npx vitest run src/lib/camera/__tests__/cameraMath.test.ts src/lib/layout/__tests__/islandLayout.test.ts`
- **Before:** mixed Row 0 = [short col 1, tall col 2, medium col 3] failed — `findTopLeftAlbum` returned `tall-col-2`, banner overlapped column 1, row tops differed, and the narrow column-1 album was inset.
- **After:** `64` tests pass. The regression case asserts `findTopLeftAlbum === short-col-1` and banner right edge `<=` column-1 placard left edge.

### Browser evidence
`npm run build` (production) + Playwright on desktop `1440×900` and mobile `390×844`, all three moods, `?demo=4`:

| Check | Result |
| :--- | :--- |
| Banner × any `.photo-frame` intersection | `0` (all moods) |
| `← home` × any `.photo-frame` intersection | `0` (all moods) |
| Banner top/bottom delta vs column-1 album placard | `0 / 0 px` |
| Banner→placard vs placard→first framed photo | `46.65px` vs `46.15px` |
| Outer Overview margins | left `86.40px`, right `86.59px` |
| Cropped `.photo-frame` rects | `0` |
| Row-0 album top offsets vs banner | `-11.7px`, `-11.7px` (shared line) |
| Mobile banner (macro entry) | unchanged `349.844 / 23.401 / 98.331` |
| Mobile tier | macro (unchanged) |

Screenshots and raw metrics: `openspec/changes/exhibition-signage-and-return-hud/parity/patch-01/` (`before-*`, `desktop-*`, `mobile-*`, `metrics.json`, `before-metrics.json`). Note: `?demo=4` has 2 albums in Row 0, so the 3-album overlap itself is proven by the unit regression fixture; the screenshots record the before/after desktop/mobile surface.

### Full regression
- `npx vitest run` — **43 files / 645 tests passing**
- `npx tsc --noEmit` — clean
- `npx eslint .` — clean
- `npm run build` — succeeded
- `openspec validate exhibition-signage-and-return-hud --strict` — valid
