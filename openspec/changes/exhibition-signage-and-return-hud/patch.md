# Patch Log: exhibition-signage-and-return-hud

### [PATCH-01] Anchor the title banner to a stable wall frame, not a per-album pick
- **Date**: 2026-11-27 01:45:05 UTC
- **Feedback Source**: Manual Playtest (desktop Overview on the PR #19 preview) + Code Review
- **Feedback Summary**:
  - **Overview:** On desktop (3-per-row grid), the `greg's photo wall` banner renders on top of the top-right framed photos of the first album (`vibes`), and `← home` is hidden by that album's second row of photos. Mobile (one album per row) looks correct. The Overview framing (`includeTitleSign`) is off by the same amount, because it uses the same anchor.
  - **Itemized:**
    1. *Logic bug (Critical):* `findTopLeftAlbum` ranks by highest top edge first and uses leftmost only to break ties within `1e-9`. `computeWallGridPositions` centres each album vertically in its row cell (`y = rowTop - rowHeight/2`), so the tallest row-0 album wins even when it is in column 2 or 3. The banner then sits "left of" that album, which puts it directly on top of column 1.
    2. *Layout invariant gap (Important):* albums are also centred horizontally in their column cell (column width is the widest album in that column). A narrower column-1 album is inset, so even with the correct album the banner→placard gutter changes with photo counts. That is the "placement always changes" symptom.
    3. *Not a cause:* z-index. The banner being on top only makes the overlap visible; changing the stacking order would just hide the banner behind the photos.
  - **Category & Severity:** Logic Bug + Spec/Invariant Mismatch. Critical: it blocks the PR #19 merge.
- **Reported Issue / Raw Trace**:
  > So after implementing the fix on PR-19, trying to make sure that the title placard is aligned at the same space at every time, the title placard ended up breaking. And the goal of what I was trying to do here was to anchor the placard, the title placard on PR-19 to the same place. Or instead of making the title placard relative to the first album, it was relative to the first, like the farthest left placard in the first column. But I think what was breaking was because the placard width and his set based on the amount of photos and how many rows there are and how many columns there are, I think it was breaking because the placement of the placard always changes. So he's thinking, what if instead of doing it relative to the other pass, we make it so that there's a box more or less around the existing albums on the left and the right, and then we offset it relative to that box. And then the actual albums themselves can sort of like move around in that box. But then that doesn't affect the placement of the title placker, if that makes sense.

  > In this desktop layout, the `greg's photo wall` title placard is colliding with and overlapping the top-right framed photos of the first album cluster (`vibes`), while the `← home` link beneath it is obscured by the second row of photos.
- **Root Cause**:
  - `cameraMath.ts` `findTopLeftAlbum` (L174-192) selects by top edge, which is a function of each album's own height under `computeWallGridPositions`' vertical centring (`islandLayout.ts` L236-256).
  - `GalleryCanvas.tsx` `titleSignPosition` (L334-349) and `includeTitleSign` (`cameraMath.ts` L212-233) both derive the banner from that one album's `position ± bounds/2`, so any per-album size change moves the banner.
- **Target Files**: `src/lib/layout/islandLayout.ts`, `src/lib/camera/cameraMath.ts`, `src/components/wall/GalleryCanvas.tsx`, `src/lib/layout/__tests__/islandLayout.test.ts`, `src/lib/camera/__tests__/cameraMath.test.ts`, `openspec/changes/exhibition-signage-and-return-hud/specs/wall-manifest-and-db/spec.md` [NEW delta], `openspec/changes/exhibition-signage-and-return-hud/verification.md`
- **Resolution Strategy**:
  - Introduce a **wall frame**, the row-0 grid box (`left`, `top`, `right`), derived from placements by a pure `computeRowZeroFrame(placements)`. Anchor the banner and the Overview framing to it.
  - **Top-align and left-align** each album within its grid cell in `computeWallGridPositions`. Row-0 placards then sit on `frame.top`, and column 1's placard sits on `frame.left`. The banner stays flush with the adjacent placard by construction, and albums can resize inside their cells without moving the banner.
  - This is a deliberate desktop layout change: albums that differ in size within a row or column shift. Record it in `verification.md` and in a `wall-manifest-and-db` delta.
- **Status**: RESOLVED
- **Resolution Evidence**: `verification.md` → PATCH-01. Reproduction tests pass, full suite `645` tests, typecheck/lint/build clean, Playwright shows `0` banner/photo and home/photo overlaps, `0 px` top/bottom delta, matching gutters, equal outer margins. Before/after screenshots + metrics in `parity/patch-01/`.
