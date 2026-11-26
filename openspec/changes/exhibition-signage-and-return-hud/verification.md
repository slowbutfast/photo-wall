# Verification: Exhibition Title Signage & Persistent Return HUD

## 1. Executive Summary & Environment

**Status:** PASS — all automated, static-audit, production-build, and Playwright checks are green.

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
| Hidden bar and hidden RETURN are not focusable | `inert`, `aria-hidden`, `disabled`, `tabIndex={-1}` in overview/album | `GalleryHud.test.tsx` SSR/DOM attribute assertions |
| Reduced motion disables HUD transitions | `@media (prefers-reduced-motion: reduce) { transition: none }` | Playwright: bar/`RETURN`/home-arrow `transitionDuration === "0s"` |
| Safe-area-aware HUD | `right: max(22px, env(safe-area-inset-right))`, `bottom: calc(11px + env(safe-area-inset-bottom))`; `14px` / `10px` at `≤767px` | Playwright mobile: `right: 14px`, `bottom: 10px`, `RETURN` rect `294.89 → 376 × 796 → 840` |
| Coarse-pointer targets ≥ `44×44` | Existing `.hud-button::before` overlay plus mobile `min-height: 44px`; `position: absolute` restored inside coarse media | Playwright mobile: `RETURN` renders `81.11 × 44` at `(pointer: coarse)`; `touchAudit.test.ts` |

### `3d-pbr-wall-and-lighting` (ADDED)

| Scenario | Implementation evidence | Verifying test |
| :--- | :--- | :--- |
| Title placard + home link render upper-left and navigate without dragging | `ExhibitionTitleSign.tsx`; `GalleryCanvas` native pointer handlers return on `.exhibition-sign-column`; `includeTitleSign` wraps Row-0 entry bounds | `ExhibitionTitleSign.test.tsx` (markup, native pointerdown/move no-pan, background click ignored, world position), `cameraMath.test.ts` |
| Verbatim `.mat-acrylic` including PR #17 Alabaster dark plate | `wall.css` widened to `:is(.museum-placard, .exhibition-title-placard).mat-acrylic` (specificity preserved); title sign does **not** carry `.museum-placard` | `placardGlassLegibility.test.ts`; Playwright material parity assertions |
| `← home` link, mood ink, `-3px` hover, no underline | `wall.css` mood variables + fine-pointer gated hover; `text-decoration: none` | Playwright all 3 moods: `matrix(1,0,0,1,-3,0)`, `textDecorationLine: none` |
| Browser tab title `"greg's photo wall"` | `src/app/layout.tsx` | `src/app/__tests__/layout.test.ts`; Playwright `document.title` |
| Row-0 framing includes the sign | `includeTitleSign` expands `minX`, recomputes `width` + centre `x` | `cameraMath.test.ts` (expansion, true top-left, `390×844` fit, purity) |

## 3. Resolved Assumptions & Empirical Proof

| Assumption | Result |
| :--- | :--- |
| Narrow portrait `390×844` Row-0 album stays `>= 60%` of viewport | **PASS** — album island width `284.74px / 390px = 73.01%` in all three moods |
| Persistent `RETURN` does not cover Album View photos on mobile | **PASS** — `overlapAlbum: false`; rect `(294.89, 796) → (376, 840)`, 14px right / 10px bottom |
| `RETURN` has `0 px` shift between `print` and `album` | **PASS** — identical rect `top 858.703125`, `left 1336.890625`, `width 81.109375`, `height 30.296875`; delta `{0,0,0,0}` |
| Title sign top-aligns with the true top-left album | **PASS** — sign `top 282.554565`, album `top 282.554565`; sign left `86.4`, album left `186.96` (152px + 64px gap at world scale) |
| Desktop material parity with album placards | **PASS** — title and album `backgroundImage`, `borderTopColor`, `borderTopWidth`, `borderBottomWidth`, `borderRadius`, and `backdropFilter` are identical in every mood; title ink `rgb(244,246,244)` matches album title ink |
| PR #17 Alabaster dark plate inherited | **PASS** — `linear-gradient(138deg, rgba(30,36,33,0.78), rgba(22,27,24,0.74), rgba(34,40,36,0.78))` |
| Coarse-pointer acrylic fallback | **PASS** — mobile `backdropFilter: none` with the mood-specific frosted gradient |
| Home-link hover | **PASS** — arrow translates `-3px`; link colour `#ffffff` (chiaroscuro/concrete) / `#000000` (alabaster); `text-decoration-line: none` |
| Chromium test harness | System Chrome launched with `--no-sandbox` because the sandboxed MCP browser cannot start in this container |
| Exit-fade content latch | The template literally specified a render-time ref read; React Compiler lint (`react-hooks/refs`) rejects that. `returnOneLevel()` keeps `focusedAlbumId` when stepping `print → album`, so `PhotoFocusBar` reads the retained album and paints the same caption through the `0.22s` fade with no ref read. Behavior is identical; `verification.md` records the deviation. |

## 4. Nomenclature & Code Symbol Audit

| Symbol / selector | Location | Contract |
| :--- | :--- | :--- |
| `TITLE_SIGN_WIDTH = 1.52` | `src/lib/camera/cameraMath.ts` | 152px sign in world units |
| `TITLE_SIGN_GAP = 0.64` | `src/lib/camera/cameraMath.ts` | 64px gap to the top-left album |
| `findTopLeftAlbum(placements)` | `src/lib/camera/cameraMath.ts` | Highest top edge, then leftmost; never assumes index 0 |
| `includeTitleSign(bounds, placements)` | `src/lib/camera/cameraMath.ts` | Pure wrapper; recomputes union `width` and `x` |
| `.exhibition-sign-column` | `ExhibitionTitleSign.tsx`, `wall.css`, `GalleryCanvas.tsx` | World-space sign container; native pointer exclusion |
| `.exhibition-title-placard.mat-acrylic` | `ExhibitionTitleSign.tsx`, `wall.css` | Verbatim acrylic material; no `.museum-placard` |
| `.exhibition-home-link` / `.home-arrow` | `ExhibitionTitleSign.tsx`, `wall.css` | Painted portfolio wayfinding; fine-pointer hover only |
| `.hud-return-persistent` | `GalleryHud.tsx`, `hud.css` | Single persistent bottom-right `RETURN` |
| `.photo-focus-return-spacer` | `PhotoFocusBar.tsx`, `hud.css` | Invisible mirror reserving the `RETURN` slot |

No stale `.hud-top-right`, `Overview`, `hud-key-hint`, or arrow glyphs remain in the public HUD path.

## 5. Verbatim Execution Logs

### Automated suite

```text
$ npx vitest run

 Test Files  43 passed (43)
      Tests  638 passed (638)
   Duration  17.43s
```

### Typecheck, lint, build

```text
$ npx tsc --noEmit
(no output)

$ npx eslint src
(no output)

$ npm run build
✓ Compiled successfully in 14.6s
  Finished TypeScript in 16.3s
✓ Generating static pages (13/13)
```

### Playwright (system Chromium, production `next start`)

```text
MOOD chiaroscuro title= greg's photo wall materialParity= true hover= matrix(1, 0, 0, 1, -3, 0) none panUnchanged= true
MOOD concrete   title= greg's photo wall materialParity= true hover= matrix(1, 0, 0, 1, -3, 0) none panUnchanged= true
MOOD alabaster  title= greg's photo wall materialParity= true hover= matrix(1, 0, 0, 1, -3, 0) none panUnchanged= true

MOBILE chiaroscuro ratio= 0.730 coarse= true returnRect={"top":796,"left":294.890625,"width":81.109375,"height":44,"bottom":840,"right":376} backdrop= none overlap= false
MOBILE concrete   ratio= 0.730 coarse= true returnRect={"top":796,"left":294.890625,"width":81.109375,"height":44,"bottom":840,"right":376} backdrop= none overlap= false
MOBILE alabaster  ratio= 0.730 coarse= true returnRect={"top":796,"left":294.890625,"width":81.109375,"height":44,"bottom":840,"right":376} backdrop= none overlap= false

RETURN album  {"top":858.703125,"left":1336.890625,"width":81.109375,"height":30.296875}
RETURN print  {"top":858.703125,"left":1336.890625,"width":81.109375,"height":30.296875}
delta         {"top":0,"left":0,"width":0,"height":0}

PRINT     prevText="PREV" nextText="NEXT" barHasReturnButton=false barTransition="opacity 0.22s, transform 0.22s"
MIDFADE   barClass="photo-focus-bar is-hidden" barCaption retains "35mm autumn studies, 2025. October 2025 • Shibuya, Tokyo"
OVERVIEW  className="hud-button hud-return-persistent is-hidden" disabled=true tabIndex=-1 ariaHidden="true" hasInert=true opacity="0"
REDUCED   bar="0s" returnButton="0s" homeArrow="0s"
```

### Week-1 TDD evidence

The targeted suite was run before implementation and failed as expected: missing `findTopLeftAlbum` / `includeTitleSign` / `TITLE_SIGN_*`, missing `Overview` removal, and missing `ExhibitionTitleSign`. Implementation was then added until the same files passed.
