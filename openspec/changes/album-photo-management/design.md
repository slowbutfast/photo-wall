---
name: Curator Album Editor & Fixed-Height Placard
colors:
  primary: "#2D3B36"
  secondary: "#845241"
  background: "#1D1C1A"
  surface: "#FBFAF7"
  text:
    primary: "#1A1B19"
    muted: "#5C615E"
  border: "#D4D1CA"
  status:
    success: "#0F241D"
    warning: "#92400E"
    error: "#9B2C2C"
typography:
  fontFamily:
    sans: "'Helvetica Neue', Helvetica, 'TeX Gyre Heros', Arial, sans-serif"
    mono: "ui-monospace, SFMono-Regular, Menlo, monospace"
  scale:
    placardCaption: "17px, weight 700, line-height 1.15, tracking -0.02em"
    placardMeta: "12.5px, weight 400, line-height 1.35"
    placardTrack: "11.5px, weight 600, line-height 1.25"
    placardTimecode: "11px, weight 400, tabular-nums"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "32px"
rounded:
  sm: "2px"
  md: "3px"
  lg: "4px"
  full: "9999px"
---

## 1. Visual Reference

Approved interactive prototype: [playgrounds/album_curator_playground.html](../../../playgrounds/album_curator_playground.html).

## 2. Fixed-Height Placard Anatomy (Wall & Studio Preview)

- Placards remain fixed-size (`214×200px` in production, top-aligned beside the photo grid with the matte-black `214×200px` Soundtrack Plaque stacked `12px` beneath—never stretching to photo-grid height).
- **Top-left block:**
  1. Primary bold **Caption** (`albums.title`, `17px`, `700`, `1.15`, `-0.02em`).
  2. Tight optional muted **Metadata line** (`6px` gap, `12.5px`, `400`, `1.35`) joining populated `[Date, Time, Geotag / Location]` with `·` and collapsing cleanly when empty.
- **Bottom pinned soundtrack footer (above the 2 bottom standoff pins, separated by a hairline rule):**
  1. **Song Title — Artist** (single-line truncated if long).
  2. **Live-updating timecode** (`0:42 / 3:25`, `font-variant-numeric: tabular-nums`) that ticks cleanly when playing—**no green dot**.
- **Standoffs:** Keep the 2 brushed-metal cylindrical standoffs tucked at bottom-left and bottom-right (`bottom: 11px; left/right: 12px`).

## 3. Album Editor (`Photos` & `Details` Tabs)

- **Photos Tab (`Photos (N)`):**
  - Wall-matched `gridColumns` thumbnail grid (`256px` LOD) + List view toggle + `+ Add Print` button.
  - Each grid tile has `#N` badge top-left, `×` delete overlay top-right (turning `--danger` on hover/focus), and a 4-column equal-width directional button bar (`⤒`, `←`, `→`, `⤓`) beneath the thumbnail (`min-width: 0`, zero overflow).
  - Sticky footer with explicit **Save Order** / **Discard** buttons when dirty, plus inline warning banner on `409 order_stale` and error + **Retry** on network failure.
- **Details Tab (`Details`):**
  - Required fields marked with a subtle `*` (`--danger` color): **Caption\*** and **Wall Grid Columns\*** (`2 / 3 / 4 / 5` segmented control).
  - Optional fields use clean bare labels with **no `(optional)` parentheticals**: native `<input type="date">` (**Date**), native `<input type="time">` (**Time**), **Geotag / Location**, and a **YouTube Soundtrack** card (**YouTube Video Link** + **Inspect**, **Song Title**, **Artist**, **Clear**).
  - Bottom actions: **Move to Draft / Publish to Wall** toggle and 2-step **Delete Album** confirmation.
