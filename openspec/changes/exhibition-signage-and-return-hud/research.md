## Source material

- **2026-11-26 — User Request & Visual Playground Approval (`playgrounds/exhibition_signage_playground.html`):**
  - Remove the top-right `Overview` button in `GalleryHud.tsx` (redundant with the bottom-right `RETURN` control).
  - Change the bottom-right return button label from `RETURN [ESC]` to `RETURN` (all caps).
  - Remove the arrow glyphs (`←` / `→`) from `PREV` and `NEXT` in `PhotoFocusBar.tsx`.
  - Make `RETURN` persist in the bottom-right corner across focus levels:
    - In **Print Focus** (`viewMode === 'print'`): `RETURN` sits in the bottom-right; clicking it calls `returnOneLevel()` to zoom out to **Album View**, while the rest of the bottom bar (`PREV`, `NEXT`, album caption/metadata) slides/fades away and **`RETURN` persists** in the exact same bottom-right slot.
    - In **Album View** (`viewMode === 'album'`): `RETURN` persists in the bottom-right; clicking it calls `returnOneLevel()` → `goOverview()` (full gallery overview, identical to the former `Overview` button).
    - In **Overview** (`viewMode === 'overview'`): `RETURN` hides cleanly with a smooth slide/fade transition.
  - Codify the playground's bottom menu bar (`.photo-focus-bar`: `opacity 0.22s ease, transform 0.22s ease`) and persistent `RETURN` button (`opacity 0.2s ease, transform 0.2s ease`) slide/fade animations (honoring `prefers-reduced-motion: reduce`).
  - Add an in-world **Exhibition Title Placard (`greg's photo wall`)** using the verbatim **Beveled Acrylic Glass (`.mat-acrylic`)** placard design (translucent tinted bevel glass with cylindrical brushed-metal bottom standoffs, plus coarse-pointer static frosted gradient fallback), mounted in the upper-left margin of `.wall-world` top-aligned with the first row of album clusters and offset left of the top-left album's placard.
  - Add a painted **Wayfinding Home Link (`← home`)** centered `14px` beneath the title placard, linking via `<a href="https://gregory-lazatin.com">` directly to the portfolio site; on pointer hover, the arrow shifts `-3px` left (`transform: translateX(-3px)`) with a subtle contrast shift and **no underline**.
  - Rename the browser tab (`metadata.title` in `src/app/layout.tsx`) from `'Chiaroscuro Gallery'` to `"greg's photo wall"`.

### Raised but not acted on

- **Brushed Aluminum / Matte Black / Framed Silver title placard variants:** Explored in `playgrounds/exhibition_signage_playground.html`; user locked **Beveled Acrylic Glass (`.mat-acrylic`)** for production.
- **Underline on `← home` hover:** Explicitly removed per user feedback (arrow `-3px` slide + subtle contrast shift only).
- **Keeping `Overview` button alongside `RETURN`:** Explicitly removed as redundant.
- **Keeping desktop `[ESC]` hint (`hud-key-hint` from `mobile-print-transitions`):** Deliberate reversal — user requested plain `RETURN` everywhere (keyboard `Escape` and `0` shortcuts remain active). `printHandoffAudit.test.ts`'s `hud-key-hint` assertion will be removed when this change lands after `mobile-print-transitions`.
- **Renaming `/admin/*` Curator Studio tab titles:** Intentionally left as `"Chiaroscuro Gallery"` (public wall only).
- **Pre-existing `Camera • Location` vs. `dateLabel`/`locationLabel` metadata drift in `PhotoFocusBar`:** Predates this change; noted without expanding scope.

## Glossary

| Term | Means | Does NOT mean |
| :--- | :--- | :--- |
| **Persistent `RETURN` button** | A single bottom-right `.hud-return-persistent` button (`RETURN`) that stays anchored in the exact same viewport slot across `print` and `album` modes, calling `returnOneLevel()` (`print` → `album` → `overview`), and hides in `overview`. | Two separate buttons that swap/jump between `PhotoFocusBar` and `GalleryHud`, or a button visible in `overview`. |
| **Exhibition Title Placard** | An in-world `greg's photo wall` sign rendered inside `.wall-world` using verbatim `.mat-acrylic` beveled acrylic glass + cylindrical bottom standoffs, positioned left of the top-left Row-0 album. | A fixed screen-space HUD overlay that floats over photos during zoom. |
| **Wayfinding Home Link** | A painted-on-wall `<a href="https://gregory-lazatin.com">` link (`← home`) directly beneath the title placard with mood-adaptive ink and `-3px` hover arrow shift (no box, no underline). | A boxed HUD button or an internal Next.js `<Link>` staying inside `/photos`. |

## External research

| Source | What it establishes | Licence | Accessed |
| :--- | :--- | :--- | :--- |
| `playgrounds/exhibition_signage_playground.html` | User-approved prototype for `.mat-acrylic` title placard, underline-free `← home` hover, and `.photo-focus-bar` / `.hud-return-persistent` slide/fade transitions. | Repo-internal | 2026-11-26 |

## Candidate tech

| Option | Decision | Reason | Date |
| :--- | :--- | :--- | :--- |
| CSS `opacity` + `transform` transitions with `inert` / `aria-hidden` | Adopted | Zero dependencies; matches playground `0.22s` / `0.2s` curves while keeping hidden buttons unfocusable for keyboard/screen-reader users. | 2026-11-26 |
| `react-transition-group` / Framer Motion | Rejected | Unnecessary dependency for two simple CSS transitions. | 2026-11-26 |

## Patterns adopted

- **Shared bottom-right coordinate system for `.photo-focus-bar` and `.hud-return-persistent`:** Both use the exact same `max(22px, env(safe-area-inset-right, 0px))` (`14px` on `≤ 767px`) and bottom safe-area offset so `RETURN` never shifts by even 1 px when `.photo-focus-bar` fades out on `Print Focus → Album View`.
- **Coarse-pointer frosted fallback:** Reuses `mobile-render-profile`'s `@media (pointer: coarse)` `backdrop-filter: none` + frosted gradient rule on `.mat-acrylic` so the new title placard introduces zero live mobile blur regression.

## Verified facts

| Claim | Value | How verified | Date | Volatility |
| :--- | :--- | :--- | :--- | :--- |
| `useWallStore.returnOneLevel()` steps `print → album → overview` | `print && focusedAlbumId` → `enterAlbum(focusedAlbumId)`; else `goOverview()` | Read `src/store/useWallStore.ts` (`L193-L199`) | 2026-11-26 | stable |
| `GalleryHud.tsx` currently renders only the top-right `Overview` button | `hud-top-right` with `Overview` button | Read `src/components/hud/GalleryHud.tsx` (`L1-L30`) | 2026-11-26 | stable |
| `PhotoFocusBar.tsx` currently renders `← PREV`, `NEXT →`, and `RETURN [ESC]` | Hard-unmounts when `!visible` (`if (!visible) return null`) | Read `src/components/hud/PhotoFocusBar.tsx` (`L46-L72`) | 2026-11-26 | stable |
| `src/app/layout.tsx` sets browser tab title | `title: 'Chiaroscuro Gallery'` (`L5-L9`) | Read `src/app/layout.tsx` (`L1-L35`) | 2026-11-26 | stable |
| `computeFirstRowBounds` frames the union AABB of Row-0 albums | `src/lib/camera/cameraMath.ts` (`L129-L150`) | Read `src/lib/camera/cameraMath.ts` | 2026-11-26 | stable |
| `wall.css` scopes all `.mat-acrylic` rules to `.museum-placard.mat-acrylic` and uses PR #17's dark plate in Alabaster | `L614`, `L638-639` (`rgba(30,36,33,0.78)` + `#F4F6F4` ink, 5.60:1), `L648-657`, `L685`, `L1170-1181` (on `origin/main` `cdeda3b`) | Read `src/styles/wall.css` on `cdeda3b` | 2026-11-26 | stable |
| `GalleryCanvas` attaches native `pointerdown`/`pointermove`/`pointerup` listeners directly to the wall element | Native listeners fire before React root delegation; `.museum-placard` is only excluded in `onClick` | Read `src/components/wall/GalleryCanvas.tsx` | 2026-11-26 | stable |
| Vitest defaults to `environment: 'node'`; `jsdom` 31 is installed | DOM/pointer/`inert` tests require `// @vitest-environment jsdom` | Read `vitest.config.ts` & `package.json` | 2026-11-26 | stable |

## Unverified assumptions

- **Portrait phone Row-0 album width at `390×844`:** On narrow portrait phones `entryFirstRowCount` can frame a single album, so adding `2.16u` (`TITLE_SIGN_WIDTH + TITLE_SIGN_GAP`) is a larger share than on a 3-album desktop row. Measure on-screen album width at `390×844` in Playwright (pass bar: album grid stays `>= 60%` of viewport width, and persistent `RETURN` does not cover album photos).

## Superseded claims

- **"The title placard is a compact `152px` Beveled Acrylic plaque":** Superseded by the 2026-11-26 follow-up banner redesign — it is now a grid-locked `452 × 200px` (2 × 1) Beveled Glass banner (two album placards + one grid gutter), flush with the adjacent album placard top/bottom and separated by the `94px` photo gutter. The glass material itself is **reused verbatim** from the album placards (no bespoke glass treatment).
- **"`.exhibition-title-placard.mat-acrylic` automatically inherits `.mat-acrylic` and touch fallback from `wall.css L708-767`":** Superseded — the album rules are scoped to `.museum-placard.mat-acrylic`, so those selectors must be widened to `:is(.museum-placard, .exhibition-title-placard).mat-acrylic` (including the coarse frosted fallback and PR #17 Alabaster plate).
- **"Alabaster acrylic uses light translucent glass with `#161614` ink":** Superseded by PR #17 (`alabaster-glass-legibility`, `cdeda3b`), which locked Alabaster acrylic to a dark plate (`rgba(30,36,33,0.78)`/`0.74`/`0.78`) with `#F4F6F4` ink (5.60:1 contrast).
- **"React `onPointerDown` `stopPropagation()` blocks `GalleryCanvas` wall panning":** Superseded — `GalleryCanvas` uses native `addEventListener('pointerdown', ...)` on the wall element, which fires before React root delegation; isolation must return early in the native `onPointerDown` handler when `target.closest('.exhibition-sign-column')`.

## Links out

- Approved visual playground: `playgrounds/exhibition_signage_playground.html` (commit alongside or prior to implementation if needed)
- Prerequisite PR: `mobile-print-transitions` (merge into `origin/main` before implementing this change)
