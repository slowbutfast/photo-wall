# Surgical Patch Handoff: OpenSpec Change 'album-photo-management' [PATCH-01]

## 1. Executive Objective & Diagnostic Feedback
- **Change Name**: album-photo-management. This patch also touches two pages from `admin-route-isolation`, which ship on the same branch.
- **Patch ID**: PATCH-01
- **Working tree**: `/home/node/.local/share/opencode/worktree/c63da2794a700730e3a2cbe71e9e957277cb59ba/disco-salamander`, on branch `feat/multi-20261124-1541` (PR #6). Commit on this branch and push to update PR #6. Do NOT open a new PR. Do NOT merge.
- **Objective**: Fix three defects and three nits:
  - Stop Details saves from erasing free-text date labels.
  - Make filtered wall reorders move only the visible albums.
  - Remove the doubled `/photos` from the server-component redirects.
  - The three one-line nits listed in §2.
- **Feedback & Diagnostic Trace**:
  ```
  [Important] CuratorStudio.tsx:211–217 — Dragging while a filter is active can move the wrong albums.
  The sortable list contains visibleAlbums, but drag-end resolves both indices against
  effectiveWallOrder, which includes filtered-out albums. Reorder using the visible list's indices while
  preserving the relative positions of filtered-out albums; add a regression test for mixed
  published/draft lists. (Same defect in SortableAlbumRow ↑/↓: index/total are full-list values.)

  [Important] AlbumEditor.tsx:144–153, 583–592 — parseCombinedDateLabel() leaves unrecognized legacy
  labels blank, and saveDetails() sends dateLabel: null when those inputs are blank. Editing only the
  title or soundtrack clears a label such as "October 2025" without telling the curator.

  [Important] src/app/admin/login/page.tsx:L22, src/app/admin/page.tsx:L23 — redirect(withBase(...)).
  Next applies addPathPrefix(url, basePath) to every redirect() (app-render.js:5290,
  make-get-server-inserted-html.js:52) and addPathPrefix does not dedupe:
  signed-in GET /photos/admin/login → Location: /photos/photos/admin → 404.

  [Nit] AlbumEditor.tsx:L392 form.append('sortOrder', String(photos.length)) collides with gapped
  sortOrders after deletes. [Nit] next.config.ts:L36-L41 lookahead header rule is redundant with
  '/:path*'. [Nit] proxy.ts:L20 comment says "edge proxy"; Next 16 proxy runs on Node.
  ```
- **Root Cause Analysis**:
  1. **Date label.** `DetailsSnapshot` keeps only the parsed `dateIso`/`time24` and drops the raw stored label whenever it can't be parsed. Save and preview then rebuild it from the empty inputs.
  2. **Filtered reorder.** The move handlers index into the full `effectiveWallOrder`, while the rendered and sortable set is `visibleAlbums`. The two agree only when the filter is `All`.
  3. **Redirects.** `withBase` is for paths that bypass Next's router: `fetch`, `window.location`, `NextResponse.redirect`. `redirect()` from `next/navigation` already prepends the base path.

  The spec delta and `openspec/specs/gallery-hud-and-curator-ui/spec.md` **already contain** the two new scenarios: "Saving other Details never erases an unparseable legacy date label" and "Reordering under a Published or Draft filter moves only the visible albums". Implement against them; don't edit them.

## 2. Strict Target Context Map
| File Path (relative to repo root) | Target Lines | Modification Summary |
|---|---|---|
| `src/components/admin/photoOrderState.ts` | Append after `mergeStaleOrder` | Add two exported pure functions. **(a)** `moveWithinSubset(order: readonly string[], subset: readonly string[], from: number, to: number): string[]`. `from`/`to` index into `subset`. Compute `moved = moveItem(subset, from, to)`, then walk `order`: each slot holding an id that is in `subset` gets the next id from `moved`, and every other slot keeps its id. Out-of-range indices return a copy of `order`. **(b)** `resolveDateLabel(current: { dateIso: string; time24: string; rawDateLabel: string \| null }, saved: { dateIso: string; time24: string }): string \| null`. If `current.dateIso === saved.dateIso && current.time24 === saved.time24`, return `current.rawDateLabel`. Otherwise return `formatCombinedDateLabel(current.dateIso, current.time24) \|\| null`. |
| `src/components/admin/AlbumEditor.tsx` | `L123-L130` (`DetailsSnapshot`), `L144-L154` (`detailsFromAlbum`), `L165-L174` (`sameDetails`) | Add `rawDateLabel: string \| null` to the snapshot, initialised to `album.dateLabel ?? null`, and compare it in `sameDetails`. |
| `src/components/admin/AlbumEditor.tsx` | `L237-L244` (live overlay `onDraftChange`) and `L586` (`saveDetails` body) | Replace both `formatCombinedDateLabel(details.dateIso, details.time24) \|\| null` expressions with `resolveDateLabel(details, savedDetails)`. Add `savedDetails` to the overlay effect's deps. In `saveDetails`, compute the label once, send it, and set `nextDetails.rawDateLabel` to the sent value. |
| `src/components/admin/AlbumEditor.tsx` | `L866-L890` (Date/Time field grid) | When `details.rawDateLabel` is non-empty **and** `details.dateIso === '' && details.time24 === ''`, render one `<p className="admin-note">` above the inputs: `Current: {rawDateLabel}`. Put a `<button type="button">Clear date</button>` beside it that sets `rawDateLabel: null`. Reuse the existing `admin-note` class and the existing button styling. Don't add new CSS. |
| `src/components/admin/AlbumEditor.tsx` | `L392` | Delete `form.append('sortOrder', String(photos.length));`. The route then falls back to `getNextPhotoSortOrder`, which puts the print last. |
| `src/components/admin/CuratorStudio.tsx` | `L198-L204` (`moveAlbum`), `L211-L218` (`handleAlbumDragEnd`), `L589-L599` (row props) | `moveAlbum(from, to)` now takes **visible** indices: `applyWallOrder(moveWithinSubset(effectiveWallOrder, visibleAlbums.map(a => a.id), from, to))`, with deps updated. Drag-end resolves `from`/`to` with `visibleAlbums.findIndex(...)`. Each row gets `index={visibleIndex}` (the map callback's second argument) and `total={visibleAlbums.length}`. `SortableAlbumRow` (L757-L830) stays as is; its `↑`/`↓` disabled logic becomes correct once it receives visible values. |
| `src/app/admin/login/page.tsx` | `L9`, `L22` | `redirect('/admin')`. Remove the now-unused `withBase` import. |
| `src/app/admin/page.tsx` | `L9`, `L23` | `redirect('/admin/login')`. Remove the now-unused `withBase` import. |
| `next.config.ts` | `L36-L41` | Delete the `'/((?!admin(?:/|$)).*)'` rule. Keep `'/:path*'` (public), then `'/admin'` and `'/admin/:path*'` (Studio), in that order, and update the comment to say later rules override earlier ones for the same header key. |
| `src/proxy.ts` | `L18-L21` (doc comment) | Replace the "unavailable on an edge proxy" rationale with: constants are duplicated so the proxy stays free of `auth.ts`'s Node-only imports and rate-limit state. No code change. |
| `src/components/admin/__tests__/photoOrderState.test.ts` | Append two `describe` blocks | Add the tests in §5. |
| `src/lib/__tests__/publicBoundaryAudit.test.ts` | Append one `it(...)` | Add the redirect audit from §5. |
| `openspec/changes/album-photo-management/verification.md` | §2 matrix, deviations, logs | Add rows for both new scenarios and the redirect check. Note in deviations that two `admin-route-isolation` pages were touched. Add the logs. |
| `openspec/changes/album-photo-management/tasks.md` / `patch.md` | `## Patch 01` / PATCH-01 status | Tick P01.1-P01.4 only after each has actually run. Set PATCH-01 to `RESOLVED` with the commit SHA. |

## 3. Blast Radius & Invariant Guardrails
- **STRICT BLAST RADIUS**: Modify ONLY the files and lines in the Target Context Map.
- **FORBIDDEN**:
  - Do NOT refactor surrounding working code: the photo-order flow, the `409 order_stale` merge, the editor tabs, the dnd-kit setup, `GalleryCanvas`, the proxy logic, CSP generation, routes, or the repository.
  - Do NOT change `parseCombinedDateLabel` / `formatCombinedDateLabel` semantics, and do NOT change `FolderDropzone`'s free-text date input. Unifying the two is separate follow-up work.
  - Do NOT modify `.env`, `.env.*`, credentials, `package.json`, the lockfile, `drizzle/`, or `src/db/`.
  - Do NOT touch `playgrounds/`, and never use `git add -A`.
  - Do NOT call Vercel, Turso or Bunny, and do NOT set `ADMIN_ENABLED` anywhere except the inline env of local `next start` runs.
  - Do NOT edit the spec files. They are already amended.
  - Do NOT modify existing passing tests.
- **INVARIANTS TO PRESERVE**:
  - With the `All` filter, wall reorder behaviour is byte-identical to today: `moveWithinSubset(order, order, f, t)` must equal `moveItem(order, f, t)`.
  - A parseable `Mon D, YYYY · h:mm AM` label behaves exactly as before.
  - Editing Date/Time still writes the formatted label.
  - The proxy redirect, the public strict CSP, the Studio YouTube CSP and the `ADMIN_ENABLED` 404 matrix are unchanged.
  - All 381 existing tests still pass.

## 4. Visual & UI Impact (if applicable)
- The only UI addition is the `Current: <label>` note and the **Clear date** button in the Details tab. It reuses the existing `admin-note` class and the existing Studio button styling, from `design.md` / `studio.css`. No new tokens, no new CSS rules, no layout changes.
- The `↑`/`↓` disabled states change only under a filter, now based on visible position.

## 5. Reproduction & Verification Protocol
Run Vitest directly, not through `safe-test`, which runs out of memory on this suite.

**New tests (write these first). Tests 1, 2 and 4 must FAIL before the fix. Test 3 passes before and after, because it guards against regressions.**
1. `describe('resolveDateLabel')`:
   - With `saved = { dateIso: '', time24: '' }` and `current = { dateIso: '', time24: '', rawDateLabel: 'October 2025' }`, expect `'October 2025'`.
   - Changing `current.dateIso` to `'2025-10-05'` returns `'Oct 5, 2025'`.
   - `rawDateLabel: null` with untouched inputs returns `null`. That's the explicit-clear case.
2. `describe('moveWithinSubset')`:
   - Use `order = ['P1','D1','P2','D2','P3']` and `subset = ['P1','P2','P3']`.
   - `moveWithinSubset(order, subset, 0, 2)` must equal `['P2','D1','P3','D2','P1']`, so D1 and D2 stay in their slots.
   - A `↑` from visible index 1 to 0 must equal `['P2','D1','P1','D2','P3']`.
   - An out-of-range index returns a copy of `order`.
3. `describe('moveWithinSubset')`, the `All` filter case: for every `(f, t)` pair on a 5-item list, `moveWithinSubset(order, order, f, t)` equals `moveItem(order, f, t)`.
4. `publicBoundaryAudit.test.ts`, `'never wraps next/navigation redirect() in withBase'`:
   - Walk `src/app` and strip comments with the file's existing `stripComments`.
   - Assert no file matches `/\bredirect\(\s*withBase\(/`.

**Commands**
1. **Reproduce first:**
   ```bash
   npx vitest run src/components/admin/__tests__/photoOrderState.test.ts -t "resolveDateLabel|moveWithinSubset"
   npx vitest run src/lib/__tests__/publicBoundaryAudit.test.ts -t "redirect"
   ```
2. **Apply the minimal fix** in the mapped lines.
3. **Verify the fix:** re-run both commands; all pass.
4. **Full regression:** `npm run typecheck && npm run lint && npx vitest run && npm run build`. Expect zero errors and 385 or more tests passing.
5. **Targeted Playwright on local `next start`:**
   - Run it with `ADMIN_ENABLED=true` and the test `ADMIN_PASSWORD`/`AUTH_SECRET` passed inline, a fresh scratch libSQL file DB and local storage, the same setup as the original §4.2 run. Delete the scratch data afterwards.
   - **(a)** Signed in, `GET /photos/admin/login` returns `307` with `Location: /photos/admin`.
   - **(b)** Create one album with `dateLabel: 'October 2025'`. In the editor, change only the Caption and save. `GET /photos/api/admin/albums/[id]` still returns `dateLabel: 'October 2025'`.
   - **(c)** With 2 published albums and 1 draft between them, filter to Published and press `↓` on the first. Save Wall Order. The draft's position in `GET /photos/api/admin/wall-preview` is unchanged.
   - **(d)** `/photos` still serves the strict CSP (no `www.youtube.com`), and `/photos/admin` serves the Studio CSP.

## 6. Surgical Patch Checklist
- [ ] P01.1 Write the 4 tests in §5, run the two reproduction commands, and confirm tests 1, 2 and 4 fail for the diagnosed reasons. Paste the output into `verification.md`.
- [ ] P01.2 Implement the fixes:
  - `photoOrderState.ts`: the two helpers.
  - `AlbumEditor.tsx`: L123-L174 snapshot, L237-L244 overlay, L586 save, L866-L890 note and Clear, L392 sortOrder.
  - `CuratorStudio.tsx`: L198-L218, L589-L599.
  - Both admin pages: the redirects.
  - `next.config.ts`: L36-L41.
  - `proxy.ts`: L18-L21 comment.
- [ ] P01.3 Re-run the reproduction commands and confirm PASS.
- [ ] P01.4 Run `npm run typecheck && npm run lint && npx vitest run && npm run build` with zero regressions, then Playwright checks §5.5 (a)–(d). Update `verification.md` and mark PATCH-01 `RESOLVED` in `patch.md`.
- [ ] P01.5 Tick `## Patch 01` in `tasks.md`.
  - Run `openspec validate album-photo-management --strict` and `openspec validate admin-route-isolation --strict`.
  - Stage only the mapped paths, by name:
    `git add next.config.ts src/proxy.ts src/app/admin/page.tsx src/app/admin/login/page.tsx src/components/admin/photoOrderState.ts src/components/admin/__tests__/photoOrderState.test.ts src/components/admin/AlbumEditor.tsx src/components/admin/CuratorStudio.tsx src/lib/__tests__/publicBoundaryAudit.test.ts openspec/changes/album-photo-management openspec/specs/gallery-hud-and-curator-ui/spec.md`
  - Commit as `fix(studio): preserve legacy date labels, filtered wall reorder, basePath redirects (PATCH-01)` and run `git push`.

**Out of scope:** enabling `ADMIN_ENABLED` on Vercel, and any check against a preview, which shares production Turso and Bunny. Both are the maintainer's.
