# Verification: Exhibition Title Signage & Persistent Return HUD

## 1. Executive Summary & Environment

**Status:** PASS — all automated, static-audit, production-build, and browser checks are green after the follow-up banner redesign.

| Item | Value |
| :--- | :--- |
| Change | `exhibition-signage-and-return-hud` |
| Branch | `feat/exhibition-signage-and-return-hud` (from `main` `6e56645`) |
| Base revision | `6e56645` (`origin/main` `cdeda3b` + PR #17 `alabaster-glass-legibility` + handoff commit) |
| Environment | Linux, Node 24.x, Next.js 16.4.6, Chromium (Playwright, `--no-sandbox`), viewport `1440×900` and `390×844` |
| Automated suite | `43` files / `638` tests passing (`npx vitest run`) |
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
| Exiting Print Focus fades the bar with latched content while RETURN persists | `PhotoFocusBar` stays mounted; `focusedAlbumId` is retained by `enterAlbum` so caption/metadata stay painted through `0.22s`; `.hud-return-persistent` is a separate DOM node | `GalleryHud.test.tsx` latch test; Playwright mid-fade probe (`barClass: photo-focus-bar is-hidden`, caption retained) |
| Hidden bar and hidden RETURN are not focusable | `inert`, `aria-hidden`, `disabled`, `tabIndex={-1}` in overview/album | `GalleryHud.test.tsx` DOM attribute assertions |
| Reduced motion disables HUD transitions | `@media (prefers-reduced-motion: reduce) { transition: none }` | Playwright: bar/`RETURN` `transitionDuration === "0s"` |
| Safe-area-aware HUD | `right: max(22px, env(safe-area-inset-right))`, `bottom: calc(11px + env(safe-area-inset-bottom))`; `14px` / `10px` at `≤767px` | Playwright mobile: `right: 14px`, `bottom: 10px`, `RETURN` rect `294.89 → 376 × 796 → 840` |
| Coarse-pointer targets ≥ `44×44` | Existing `.hud-button::before` overlay plus mobile `min-height: 44px`; `position: absolute` restored inside coarse media | Playwright mobile: `RETURN` renders `81.11 × 44` at `(pointer: coarse)`; `touchAudit.test.ts` |

### `3d-pbr-wall-and-lighting` (ADDED)

| Scenario | Implementation evidence | Verifying test |
| :--- | :--- | :--- |
| 2 × 1 Brushed Aluminum banner flush with the top-left album placard | `ExhibitionTitleSign.tsx` + `TITLE_SIGN_WIDTH = 2 × PLACARD_WIDTH + GUTTER` (`4.52u`), `TITLE_SIGN_HEIGHT = 2.0u`, `TITLE_SIGN_GAP = PLACARD_GAP` (`0.94u`); `GalleryCanvas` anchors the top edge to `islandTop − ISLAND_PADDING − PLACARD_TOP_OFFSET` | `ExhibitionTitleSign.test.tsx` (markup, `452 × 200px`, world position), `cameraMath.test.ts` |
| Opaque light brushed-silver face / dark matte backing core | `.exhibition-title-placard.mat-aluminum`; widened `:is(.museum-placard, .exhibition-title-placard).mat-aluminum` base/text rules; no standoffs, no `backdrop-filter` | `ExhibitionTitleSign.test.tsx`; Playwright computed material; `touchAudit.test.ts` |
| Bold 32px flush-left `greg's` / `photo wall` | `wall.css .exhibition-title-line` (`32px`, `700`, `1.05`, `-0.015em`) | Playwright computed typography |
| `← home` flush-left beneath, understated, no underline, `-3px` hover | `wall.css` mood variables + fine-pointer gated hover; `text-decoration: none` | Playwright all 3 moods: `matrix(1,0,0,1,-3,0)`, `textDecorationLine: none` |
| Native pointer isolation | `GalleryCanvas` native `pointerdown`/`click` return on `.exhibition-sign-column` | `ExhibitionTitleSign.test.tsx` integration test; Playwright pan probe |
| Browser tab title `"greg's photo wall"` | `src/app/layout.tsx` | `src/app/__tests__/layout.test.ts`; Playwright `document.title` |
| Row-0 framing includes the banner | `includeTitleSign` expands `minX` from the album placard's left edge, recomputes `width` + centre `x` | `cameraMath.test.ts` (grid constants, expansion, true top-left, `390×844` fit, purity) |

## 3. Resolved Assumptions & Empirical Proof

| Assumption | Result |
| :--- | :--- |
| Banner width is exactly 2 album placards + one grid gutter | **PASS** — computed width ratio `452 / 214 = 2.112`; expected/actual `188.9px` at desktop scale `0.417942` |
| Top and bottom edges are flush with the adjacent album placard | **PASS** — both deltas `0 px` on desktop (all moods) and in mobile Album View |
| Horizontal gap equals the album placard → first photo column gap | **PASS** — sign gap `39.29px` = photo-column gap `39.29px` on desktop; `45.83px = 45.83px` in mobile Album View |
| Title is 2× the album title scale and flush-left | **PASS** — `32px / 700 / 33.6px` line-height (album title token is `16px`), `text-align: left`, lines `greg's` / `photo wall` |
| `← home` is flush-left beneath the banner | **PASS** — left delta `0 px`; `13.5px / 500`; `text-decoration-line: none` |
| Brushed aluminum is opaque with a dark core | **PASS** — aluminium gradient face, right border `rgb(22,22,22)` `3px`, bottom `rgb(20,20,20)` `3.5px`, box shadow; `backdrop-filter: none` |
| Native pointer events on the banner never pan the wall | **PASS** — `.wall-world` transform unchanged after 10-pointer-move drag from `← home` |
| `RETURN` has `0 px` shift between `print` and `album` | **PASS** — identical rect `top 858.703125`, `left 1336.890625`, `width 81.109375`, `height 30.296875`; delta `{0,0,0,0}` |
| Reduced motion | **PASS** — bar/`RETURN` `transitionDuration: "0s"` |
| Chromium test harness | System Chrome launched with `--no-sandbox` because the sandboxed MCP browser cannot start in this container |
| Mobile entry after doubling the banner | **Resolved** — at `390×844` the full banner + Row 0 requires scale `~0.2175`, so entry renders at macro tier (Row-0 album width `58.7%` of viewport). The banner stays fully framed; entering an album restores the album tier and the `0 px` flush alignment above. This is the direct, documented consequence of the 2 × 1 size. |
| Exit-fade content latch | The planning template specified a render-time ref read; React Compiler lint (`react-hooks/refs`) rejects that. `returnOneLevel()` keeps `focusedAlbumId` when stepping `print → album`, so `PhotoFocusBar` reads the retained album and paints the same caption through the `0.22s` fade. Behavior is identical. |

## 4. Nomenclature & Code Symbol Audit

| Symbol / selector | Location | Contract |
| :--- | :--- | :--- |
| `TITLE_SIGN_WIDTH` | `src/lib/camera/cameraMath.ts` | `2 × PLACARD_WIDTH + GUTTER` = `4.52u` (`452px`) |
| `TITLE_SIGN_HEIGHT` | `src/lib/camera/cameraMath.ts` | `PLACARD_HEIGHT` = `2.0u` (`200px`) |
| `TITLE_SIGN_GAP` | `src/lib/camera/cameraMath.ts` | `PLACARD_GAP` = `0.94u` (`94px`) |
| `findTopLeftAlbum(placements)` | `src/lib/camera/cameraMath.ts` | Highest top edge, then leftmost; never assumes index 0 |
| `includeTitleSign(bounds, placements)` | `src/lib/camera/cameraMath.ts` | Pure wrapper; uses the album placard's left edge and recomputes union `width` and `x` |
| `.exhibition-sign-column` | `ExhibitionTitleSign.tsx`, `wall.css`, `GalleryCanvas.tsx` | World-space sign container; native pointer exclusion |
| `.exhibition-title-placard.mat-aluminum` | `ExhibitionTitleSign.tsx`, `wall.css` | Grid-locked 2 × 1 banner; no `.museum-placard` |
| `.exhibition-title-line` | `ExhibitionTitleSign.tsx`, `wall.css` | `greg's` / `photo wall`, 32px bold flush-left |
| `.exhibition-home-link` / `.home-arrow` | `ExhibitionTitleSign.tsx`, `wall.css` | Painted portfolio wayfinding; flush-left, fine-pointer hover only |
| `.hud-return-persistent` | `GalleryHud.tsx`, `hud.css` | Single persistent bottom-right `RETURN` |
| `.photo-focus-return-spacer` | `PhotoFocusBar.tsx`, `hud.css` | Invisible mirror reserving the `RETURN` slot |

No stale `.hud-top-right`, `Overview`, `hud-key-hint`, arrow glyphs, acrylic title classes, or standoffs remain in the public HUD/sign path.

## 5. Verbatim Execution Logs

### Automated suite

```text
$ npx vitest run

 Test Files  43 passed (43)
      Tests  638 passed (638)
   Duration  20.04s
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
  "widthRatio": "2.112",
  "expectedW": "188.9",
  "actualW": "188.9",
  "signGap": "39.29",
  "photoGap": "39.29",
  "homeLeft": 0,
  "material": { "silverFace": true, "right": "rgb(22, 22, 22)", "bottom": "rgb(20, 20, 20)", "filter": "none", "align": "left", "padding": "20px 24px 30px", "color": "rgb(17, 17, 17)" },
  "type": { "fontSize": "32px", "fontWeight": "700", "lineHeight": "33.6px" },
  "home": { "href": "https://gregory-lazatin.com", "size": "13.5px", "weight": "500", "underline": "none" },
  "hover": { "arrowTransform": "matrix(1, 0, 0, 1, -3, 0)", "underline": "none" },
  "class": "exhibition-title-placard mat-aluminum",
  "standoffs": 0
}
DESKTOP concrete    (identical material + geometry; home hover #ffffff)
DESKTOP alabaster   (identical material + geometry; home ink #111111, hover #000000)

MOBILE chiaroscuro overview {
  "tier": "macro",
  "albumWidthRatio": "0.587",
  "returnRect": { "top": 796, "left": 294.890625, "width": 81.109375, "height": 44 }
}
MOBILE chiaroscuro album {
  "tier": "album",
  "topDelta": 0,
  "bottomDelta": 0,
  "signGap": "45.83",
  "photoGap": "45.83",
  "homeLeft": 0,
  "backdrop": "none"
}
MOBILE concrete / alabaster — same geometry; alabaster keeps the opaque aluminium face.

PAN        { "unchanged": true, "before": "scale(0.417942) translate3d(263px, -359.68px, 0px)", "after": same }
RETURN     album = print = { "top": 858.703125, "left": 1336.890625, "width": 81.109375, "height": 30.296875 }; delta {0,0,0,0}
PRINT      prev ["PREV", "NEXT"], barHasReturnButton false, transition "opacity 0.22s, transform 0.22s"
REDUCED    bar "0s", returnButton "0s"
```

### TDD evidence

The targeted suite was run before implementation and failed as expected: missing `findTopLeftAlbum` / `includeTitleSign` / `TITLE_SIGN_*`, the removed `Overview` control, and the missing `ExhibitionTitleSign`. The banner redesign then updated those assertions first (`452 × 200px`, flush-left lines, aluminium material) before the implementation was adjusted to pass.
