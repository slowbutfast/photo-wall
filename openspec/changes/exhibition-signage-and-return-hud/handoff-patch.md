# Surgical Patch Handoff: OpenSpec Change 'exhibition-signage-and-return-hud' [PATCH-01]

## 1. Executive Objective & Diagnostic Feedback
- **Change Name**: exhibition-signage-and-return-hud
- **Patch ID**: PATCH-01
- **Branch**: `feat/exhibition-signage-and-return-hud` (PR #19). Commit on this branch and push. Do not open a new PR.
- **Objective**: Anchor the `greg's photo wall` banner (and the Overview framing that includes it) to a stable row-0 wall frame. Top/left-align albums inside their grid cells so the banner stays flush with the column-1 placard whatever each album's photo count, rows or columns are.
- **Feedback & Diagnostic Trace**:
  ```
  Desktop Overview (3-per-row): the title banner overlaps the top-right framed photos of
  the first album (`vibes`), and `← home` is hidden by that album's second photo row.
  Mobile (1-per-row) is correct. Anchoring the banner to "the top-left album" keeps
  breaking because album width/height change with photo count, rows and columns.
  Maintainer's proposal: put a box around the albums, offset the banner from the box,
  and let albums move inside it without affecting the banner.
  ```
- **Root Cause Analysis**:
  1. `findTopLeftAlbum` (`src/lib/camera/cameraMath.ts` L174-192) picks the placement with the **highest top edge** and uses leftmost only to break ties within `1e-9`. `computeWallGridPositions` (`src/lib/layout/islandLayout.ts` L236-256) centres each album vertically in its row (`y: rowTop - rowHeight / 2`), so top = `rowTop - rowHeight/2 + ownHeight/2`. The **tallest** row-0 album wins even when it is in column 2 or 3. The banner is placed left of that album, which is on top of column 1.
  2. Albums are also centred horizontally in their column cell (`x: cursor + width / 2`, where `width` is the widest album in the column). Even with the correct album, a narrower column-1 album is inset, so the banner gap drifts with photo counts.
  3. `GalleryCanvas.tsx` `titleSignPosition` (L334-349) and `includeTitleSign` (`cameraMath.ts` L212-233, used at `GalleryCanvas.tsx` L627-649) both derive from that one placement's `position ± bounds/2`, so the sign and the camera framing inherit the bug together.
  4. z-index is not a cause. Do not change stacking.

## 2. Strict Target Context Map
| File Path (relative to repo root) | Target Lines | Modification Summary |
|---|---|---|
| `src/lib/layout/islandLayout.ts` | `L236-256` (`computeWallGridPositions` row loop) | **Top- and left-align** each album in its cell: `x: cursor + entry.bounds.width / 2`, `y: rowTop - entry.bounds.height / 2`. Keep `columnWidths`, `rowHeight`, `rowWidth`, cursor advance and `ISLAND_GAP` exactly as they are, so cells, gaps and row centring are unchanged. Update the doc comment above the function (≈L200-207) to say albums are top-left aligned in their cells. |
| `src/lib/camera/cameraMath.ts` | `L165-233` | Add exported pure `computeRowZeroFrame(placements): { left: number; top: number; right: number } \| null`. Row 0 = placements whose top edge (`y + h/2`) is within `1e-6` of the max top. `left` = min left edge over row 0, `right` = max right edge over row 0, `top` = max top. Re-implement `findTopLeftAlbum` as **the leftmost placement in row 0** (same signature; keep its export and callers). Make `includeTitleSign` compute `signLeft` from `frame.left + ISLAND_PADDING - columnGutter - TITLE_SIGN_WIDTH` and its default `maxX` from `frame.right - ISLAND_PADDING`. Keep the `framing.contentRight` override and the function signature. |
| `src/components/wall/GalleryCanvas.tsx` | `L328-349` | `titleSignPosition`: use `computeRowZeroFrame(placements)` for `placardLeft = frame.left + ISLAND_PADDING` and `placardTop = frame.top - ISLAND_PADDING - PLACARD_TOP_OFFSET`. `titleColumnGutter` keeps using `findTopLeftAlbum` (now the column-1 album). No other GalleryCanvas edits. L627-649 should need no change; touch it only if typecheck requires. |
| `src/lib/layout/__tests__/islandLayout.test.ts` | append to `describe('computeWallGridPositions')` | New cases: mixed heights in row 0 → every row-0 album's top edge is equal; a narrower album in a wider column → its left edge equals the column's left edge. The existing 2×2 identical-album test must still pass unchanged. |
| `src/lib/camera/__tests__/cameraMath.test.ts` | append | `computeRowZeroFrame` cases (empty → `null`, 1-per-row, 3-per-row mixed sizes, short last row ignored). **Regression repro:** row 0 = [short album col 1, tall album col 2, medium col 3]. `findTopLeftAlbum` returns column 1, and `includeTitleSign` `minX` equals `frame.left + ISLAND_PADDING - gutter - TITLE_SIGN_WIDTH`. Assert the banner's right edge is `<=` column 1's placard left edge (no overlap). Keep all existing tests; if one asserted the old "highest top wins" pick, it was asserting the bug. Update it and note it in `verification.md`. |
| `openspec/changes/exhibition-signage-and-return-hud/specs/wall-manifest-and-db/spec.md` | `[NEW]` | `## MODIFIED Requirements` → full copy of `### Requirement: Three-albums-per-row derived non-overlapping wall layout in world units` from `openspec/specs/wall-manifest-and-db/spec.md`, adding: each album SHALL be top- and left-aligned within its grid cell (cell = column max width × row max height). Keep its existing scenarios and add one for mixed-size row 0. Run `openspec validate exhibition-signage-and-return-hud --strict`. |
| `openspec/changes/exhibition-signage-and-return-hud/verification.md` | append PATCH-01 section | Evidence, the deliberate layout-change note, logs. |

## 3. Blast Radius & Invariant Guardrails
- **STRICT BLAST RADIUS**: Modify ONLY the files and lines in the Target Context Map.
- **FORBIDDEN**:
  - Do NOT refactor surrounding working code, rename exports, or change `computeFirstRowBounds`.
  - Do NOT change `ISLAND_GAP`, `ISLAND_PADDING`, `PLACARD_*` constants, `TITLE_SIGN_*` geometry, z-index or any CSS.
  - Do NOT modify `.env` or credential files. Do NOT write to the Turso DB or Bunny storage: verify only on local dev (`STORAGE_DRIVER=local`, `?demo=4&mood=…`).
  - Do NOT modify existing passing tests unless the assertion encoded the bug (see the cameraMath row above).
  - Do NOT touch `playgrounds/`. Do NOT `git add -A`; stage explicit paths.
- **INVARIANTS TO PRESERVE**:
  - Cell sizes, gaps and row centring are unchanged. Wall bounds (`computeWallBounds`) can only shrink or stay equal, never grow.
  - A wall where every album has the same size has a **0 px diff** against the PR head (alignment is a no-op when the album fills its cell).
  - `CuratorStudio` and `manifest.ts` consume `computeWallGridPositions` unchanged. The server and client must keep producing identical placements.
  - Mobile (1-per-row) banner position is unchanged.

## 4. Visual & UI Impact
- **Deliberate layout change:** on walls with mixed album sizes, smaller albums move from the centre of their cell to its top-left. This is the intended fix (one shared top line for row 0 and a fixed left datum). Record before/after screenshots.
- The banner contract in `design.md` is unchanged: `452 × 200px`, top/bottom flush with the adjacent album placard, gap = visible `columnGutter`, `← home` flush-left beneath. The patch makes that contract hold for any album sizes.
- No token, CSS or component-state changes.

## 5. Reproduction & Verification Protocol
1. **Reproduce first**: `npx vitest run src/lib/camera/__tests__/cameraMath.test.ts src/lib/layout/__tests__/islandLayout.test.ts`. The new mixed-row-0 cases must fail on the current code (the banner overlaps column 1, and row-0 tops differ).
2. **Apply the minimal fix** in the mapped files.
3. **Verify the fix**: re-run the command above and confirm PASS.
4. **Full regression**: `safe-test npx vitest run && npx tsc --noEmit && npx eslint . && npm run build`.
5. **Visual check** (Playwright, `--workers=1`, local dev only):
   - desktop `1440×900` and mobile `390×844`, all 3 moods, `?demo=4`;
   - assert the banner rect does not intersect any `.photo-frame` rect;
   - assert the banner's top/bottom have `0 px` delta to the column-1 album placard;
   - assert banner→placard gap == placard→first-photo gutter;
   - assert `← home` intersects no photo;
   - assert the Overview shows equal outer left/right margins and no cropped photo;
   - save screenshots under `openspec/changes/exhibition-signage-and-return-hud/parity/patch-01/`.

## 6. Surgical Patch Checklist
- [ ] P01.1 Run the reproducing tests `npx vitest run src/lib/camera/__tests__/cameraMath.test.ts src/lib/layout/__tests__/islandLayout.test.ts` and confirm the new cases fail.
- [ ] P01.2 Implement the fix in `islandLayout.ts` (L236-256), `cameraMath.ts` (L165-233) and `GalleryCanvas.tsx` (L328-349), and add the `wall-manifest-and-db` delta spec.
- [ ] P01.3 Re-run the reproducing tests and confirm PASS.
- [ ] P01.4 Run the full suite (`safe-test npx vitest run && npx tsc --noEmit && npx eslint . && npm run build`) plus the Playwright check, and confirm zero regressions.
- [ ] P01.5 Update `openspec/changes/exhibition-signage-and-return-hud/tasks.md` (Patch 01) to `- [x]`, append PATCH-01 evidence to `verification.md`, set PATCH-01 to `RESOLVED` in `patch.md`, then commit with explicit paths and push to `feat/exhibition-signage-and-return-hud`.
