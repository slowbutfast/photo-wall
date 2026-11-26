# Architecture: Exhibition Title Signage & Persistent Return HUD

> [!NOTE]
> This document specifies **technical system architecture only** (HUD state/transition ownership, `inert` accessibility, world-space coordinate placement, Row-0 framing bounds, and pointer-event isolation).
> Visual tokens, acrylic material styling, and animation curves are specified in `design.md`.

## Context

`GalleryHud.tsx` currently mounts a top-right `Overview` button, while `PhotoFocusBar.tsx` mounts `← PREV`, `NEXT →`, caption/metadata, and `RETURN [ESC]` and hard-unmounts when leaving `print` mode (`if (!visible) return null`). `useWallStore.returnOneLevel()` already implements the exact `print → album → overview` state machine. Inside `.wall-world`, albums are positioned via `worldXToCssLeft` / `worldYToCssTop` (`100px = 1 world unit`), and `computeFirstRowBounds` frames the initial Row-0 view.

## System Architecture Diagram

```mermaid
flowchart LR
  Store["useWallStore\n(viewMode, returnOneLevel)"] --> Hud["GalleryHud.tsx\n(.hud-return-persistent: RETURN)"]
  Store --> Bar["PhotoFocusBar.tsx\n(.photo-focus-bar: PREV, NEXT, info, spacer)"]
  Hud -->|print -> album -> overview| Store
  Bar -->|opacity/transform 0.22s + inert| Trans["Smooth exit while RETURN stays pinned"]
  World[".wall-world (GalleryCanvas)"] --> Sign["ExhibitionTitleSign.tsx\n(.mat-acrylic + <a href=gregory-lazatin.com>)"]
  Sign -->|onPointerDown stopPropagation| Nav["Clean portfolio navigation (no wall drag)"]
  Bounds["computeFirstRowBounds()"] -->|includes left sign column| Entry["Row-0 Entry Framing"]
```

## Goals / Non-Goals

**Goals:**
- Single persistent `RETURN` button with zero pixel jump between `print` and `album` modes, smooth slide/fade transitions, and full keyboard/a11y safety (`inert` / `aria-hidden` when hidden).
- World-space `ExhibitionTitleSign` reusing existing `.mat-acrylic` + `.placard-standoff` CSS and mobile coarse-pointer frosted fallback (zero live `backdrop-filter` regression on mobile).
- Zero ungated `:hover` rules (keeping `touchAudit.test.ts` and `cssBoundaryAudit.test.ts` green).

**Non-Goals:**
- Changing `/photos/admin` Curator Studio chrome or `/admin/*` tab titles (which intentionally remain `"Chiaroscuro Gallery"`).
- Removing `Escape` or `0` keyboard shortcuts (they remain active in `GalleryCanvas.tsx`).
- Adding a dedicated WebGL spotlight for the title placard (beveled acrylic + mood-adaptive ink stays legible in the ambient left margin).

## Technical Decisions

### D1. Single Persistent `RETURN` in `GalleryHud.tsx` + Latched `PhotoFocusBar.tsx`
- **Decision:** Replace the top-right `Overview` button in `GalleryHud.tsx` with `.hud-return-persistent` (`RETURN`, plain label everywhere — reversing `mobile-print-transitions`'s `hud-key-hint` `[ESC]`), rendered in the DOM with `is-hidden` + `aria-hidden` + `disabled` + `tabIndex={-1}` when `viewMode === 'overview'`, calling `returnOneLevel()` on click. In `PhotoFocusBar.tsx`, remove `RETURN` and arrow glyphs (`←`/`→`), keep the bar mounted with `is-hidden` + boolean `inert` when `viewMode !== 'print'`, **latch the last visible `{ album, photo }` in a ref** so the `0.22s` exit fade never animates a blank bar, and place a matching `.photo-focus-return-spacer` on the right so `.photo-focus-info` stays centered while `.hud-return-persistent` sits at `z-index: 70` directly over the exact bottom-right slot.
- **Rationale:** One persistent button guarantees `0 px` shift when `.photo-focus-bar` slides/fades away on `Print Focus → Album View`, and ref-latching prevents an empty white bar during exit.

### D2. Pure `includeTitleSign(bounds, placements)` Wrapper (`ExhibitionTitleSign.tsx`, `cameraMath.ts`)
- **Decision:** Keep `computeFirstRowBounds` **pure and unchanged** (preserving `cameraMath.test.ts:325-419`). Export `TITLE_SIGN_WIDTH = 1.52` and `TITLE_SIGN_GAP = 0.64` (world units: `152px` wide, `64px` left of the top-left album) plus a pure helper `findTopLeftAlbum(placements)` (selecting the album with highest `y` / leftmost `x`, not blindly assuming `placements[0]`) and `includeTitleSign(bounds, placements)`:
  - Computes `signLeft = firstLeft - TITLE_SIGN_GAP - TITLE_SIGN_WIDTH`.
  - Sets `newMinX = Math.min(bounds.x - bounds.width / 2, signLeft)`, keeps `maxX = bounds.x + bounds.width / 2`, and recomputes **both** `width = maxX - newMinX` and `x = (newMinX + maxX) / 2` so the union truly fits the sign rather than shifting without widening.
  - Called in `GalleryCanvas.tsx` when computing the entry Row-0 target; `<ExhibitionTitleSign />` mounts inside `.wall-world` at `(signLeft, firstTop)`.
- **Rationale:** Preserves every existing `cameraMath.test.ts` assertion and guarantees the sign fits on entry.

### D3. Native `GalleryCanvas` `onPointerDown` + `onClick` Isolation on `.exhibition-sign-column`
- **Decision:** Because `GalleryCanvas` attaches native `pointerdown`/`pointermove`/`pointerup` listeners directly to the wall element (running **before** React root delegation), add an explicit early return at the top of the **native** `onPointerDown` listener: `if ((event.target as HTMLElement | null)?.closest('.exhibition-sign-column')) return;`. Also add `.exhibition-sign-column` to `onClick`'s ignore list. Keep React `onPointerDown={(e) => e.stopPropagation()}` on `.exhibition-home-link` as belt-and-suspenders only.
- **Rationale:** Guarantees a click or drag starting on `← home` never enters `beginPointer`/`markGesture`, never pans the wall, and never triggers background `goOverview()`.

### D4. `:is(.museum-placard, .exhibition-title-placard).mat-acrylic` Selector Widening (`wall.css`, `hud.css`)
- **Decision:** On `origin/main` (`cdeda3b`), every `.mat-acrylic` rule in `wall.css` (`L614`, `L638-639` PR #17 Alabaster dark plate, `L648-657`, `L685` standoffs, `L1170-1181` coarse frosted fallback) is scoped to `.museum-placard.mat-acrylic`. Widen those selectors to `:is(.museum-placard, .exhibition-title-placard).mat-acrylic` (same `0,3,0` specificity — zero desktop diff on album placards; **do NOT** add `.museum-placard` class to the title sign, which would pull in soundtrack/marquee/sizing rules). Wrap `.exhibition-home-link:hover` inside `@media (hover: hover) and (pointer: fine)` (arrow shifts `-3px` left, subtle contrast shift, **no underline**). Add `@media (prefers-reduced-motion: reduce)` disabling transitions on `.photo-focus-bar`, `.hud-return-persistent`, and `.exhibition-home-link .home-arrow`.
- **Rationale:** Guarantees 1:1 visual parity with album placards (including PR #17's 5.60:1 Alabaster dark plate and `mobile-render-profile`'s touch fallback) with zero side-effects.

## Risks / Trade-offs

- **[Risk] Including `TITLE_SIGN_WIDTH + TITLE_SIGN_GAP` (`2.16u`) in `computeFirstRowBounds` slightly zooms out Row-0 entry.** → **Mitigation:** Row 0 is ~3 albums wide (~30–35u), so `2.16u` is ~6% additional width — minimal on desktop and cleanly frames the sign on mobile without cropping.
- **[Risk] `PhotoFocusBar` staying mounted while hidden could interfere with `bottomInsetPx` measurement.** → **Mitigation:** Keep `useEffect` setting `setBottomInset(0)` whenever `!visible` (`viewMode !== 'print'`), measuring height only when `visible === true`.

## Migration & Rollback Plan

- Pure frontend UI/signage addition; rollback is a single `git revert`.
