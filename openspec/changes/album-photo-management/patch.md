# Patch Log — album-photo-management

### [PATCH-01] Legacy date-label preservation, filtered wall reorder, basePath-doubled redirects
- **Date**: 2026-11-24 21:10:00 UTC
- **Feedback Source**: Code Review (two independent PR #6 reviews)
- **Feedback Summary**:
  PR #6 holds up on the security boundary: the proxy gate, the CSP split, the reorder endpoints and public-bundle isolation all check out. Three Important defects surfaced, all on the Studio's client and render side. One was found by both reviews.
  1. **Saving Details erases free-text date labels (Data loss, Important; found by both reviews).** The Upload tab (`FolderDropzone`) still writes free-text timestamps such as `"October 2025"`. `parseCombinedDateLabel` only accepts `Mon D, YYYY · h:mm AM`, so for those labels the editor opens with empty Date/Time inputs. `saveDetails` then sends `dateLabel: null`, so fixing a caption typo silently deletes the date. The live preview also drops the date the moment the editor opens.
  2. **Reordering under a filter moves the wrong albums (Logic Bug, Important).** The sortable list renders `visibleAlbums`, but every move resolves indices against `effectiveWallOrder`, the full list including filtered-out albums.
     - **Drag:** `moveItem(full, from, to)` shifts hidden albums between the two rows.
     - **`↑` / `↓`:** these get the full-list `index`/`total`. Pressing `↑` can swap the row with a *hidden* neighbour, which looks like a no-op, and the disabled states are wrong at the visible edges.
  3. **`redirect(withBase(...))` doubles the base path (Regression, Important).** Next's render path applies `addPathPrefix(url, basePath)` to every `redirect()` (`app-render.js:5290`, `make-get-server-inserted-html.js:52`), and `addPathPrefix` doesn't check for an existing prefix. A signed-in curator who opens `/photos/admin/login` is sent to `/photos/photos/admin` and gets a 404. The proxy builds its own absolute URL, so its redirect is correct; Playwright only exercised that path. The pages belong to `admin-route-isolation`, but they ship on the same PR #6 branch.
  4. **Nits folded in, each a one-line change:**
     - `+ Add Print` sends `sortOrder = photos.length`, which collides with gapped `sortOrder` values after deletes.
     - The negative-lookahead public header rule is redundant with the `/:path*` fallback.
     - A stale comment in `proxy.ts` says "edge proxy"; Next 16's proxy runs on Node.
- **Reported Issue / Raw Trace**:
  ```
  Review A (Important): CuratorStudio.tsx:211–217 — Dragging while a filter is active can move the wrong
  albums. The sortable list contains visibleAlbums, but drag-end resolves both indices against
  effectiveWallOrder, which includes filtered-out albums. Reorder using the visible list's indices while
  preserving the relative positions of filtered-out albums, and add a regression test for mixed
  published/draft lists.

  Review A + B (Important): AlbumEditor.tsx:144–153, 583–592 — parseCombinedDateLabel() leaves
  unrecognized legacy labels blank, and saveDetails() sends dateLabel: null when those inputs are blank.
  A curator who edits only the title or soundtrack can clear a label such as "October 2025" without
  being told. Preserve the original label unless the date/time fields are intentionally edited, or show
  it and require an explicit conversion/clear action.

  Review B (Important): src/app/admin/login/page.tsx:L22, src/app/admin/page.tsx:L23 —
  redirect(withBase('/admin')) → Location: /photos/photos/admin (Next adds basePath to redirect()).

  Review B (Nits): AlbumEditor + Add Print sortOrder = photos.length collides after deletes;
  next.config.ts redundant lookahead header rule; proxy.ts stale "edge proxy" comment.
  ```
- **Root Cause**:
  1. `DetailsSnapshot` only has the parsed `dateIso`/`time24`. The stored label that couldn't be parsed is discarded on load, so save and preview can only rebuild it from the inputs, which are empty.
  2. The move handlers (`moveAlbum`, `handleAlbumDragEnd`, `SortableAlbumRow`'s `index`/`total`) are written against the full order, while the rendered and sortable set is the filtered subset. The two are the same only when the filter is `All`.
  3. `withBase` belongs only at the call sites that bypass Next's router: `fetch`, `window.location`, `NextResponse.redirect`. `redirect()` from `next/navigation` already adds the base path.
- **Target Files**:
  - `src/components/admin/photoOrderState.ts`
  - `src/components/admin/__tests__/photoOrderState.test.ts`
  - `src/components/admin/AlbumEditor.tsx`
  - `src/components/admin/CuratorStudio.tsx`
  - `src/app/admin/page.tsx`
  - `src/app/admin/login/page.tsx`
  - `src/lib/__tests__/publicBoundaryAudit.test.ts`
  - `next.config.ts`
  - `src/proxy.ts`
  - `openspec/changes/album-photo-management/{verification.md,tasks.md,patch.md}`
  - Two scenarios were added at planning time to the delta spec and to `openspec/specs/gallery-hud-and-curator-ui/spec.md`.
- **Resolution Strategy**:
  1. **Pure helper `resolveDateLabel(current, saved)` in `photoOrderState.ts`.** If the current `dateIso`/`time24` equal the saved ones, it returns `current.rawDateLabel` untouched. Otherwise it returns `formatCombinedDateLabel(...) || null`.
     - `DetailsSnapshot` gains `rawDateLabel: string | null`, set from `album.dateLabel`. `sameDetails` compares it.
     - `saveDetails` and the live-overlay effect both call the helper, and on save `rawDateLabel` becomes whatever was sent.
     - When `rawDateLabel` is non-empty and the inputs are empty, show `Current: <label>` with a **Clear date** button that sets `rawDateLabel: null`.
  2. **Pure helper `moveWithinSubset(order, visibleIds, from, to)` in `photoOrderState.ts`.** It applies `moveItem` to the visible ids, then writes them back into the slots the visible ids occupied in `order`, so hidden ids keep their exact slots.
     - The drag handler resolves `from`/`to` against `visibleAlbums`.
     - Rows get their visible index and total, and `onMove` routes through the helper.
     - With the `All` filter, the result is identical to `moveItem`.
  3. **Redirects:** `redirect('/admin')` and `redirect('/admin/login')`, with the now-unused `withBase` import removed. A static audit test fails on any `redirect(withBase(` under `src/app`.
  4. **Nits:**
     - Drop `form.append('sortOrder', …)`, so the route's `getNextPhotoSortOrder` puts the print last.
     - Delete the lookahead header rule.
     - Correct the proxy comment.
- **Status**: RESOLVED — commit `54dd82e` (planning artifacts `43b37eb`); unit `389/389`, build clean, browser checks 15/15 (orchestrator) + 22/22 (implementation pass).
