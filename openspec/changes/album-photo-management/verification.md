# Verification — `album-photo-management`

**Status:** PASS on all automated gates and browser-level E2E (orchestrator Playwright pass: 29/29 checks against production `next start`).
**Date:** 2026-11-24
**Environment:** Linux, Node + `npx vitest` 5.1.1, `tsc` 5.9.3, Next 16.4.6 production build, local libSQL (`file:` / `file::memory:`), `STORAGE_DRIVER=local`.
**Branch:** `feat/multi-20261124-1541` (not committed; orchestrator owns the commit).

---

## 1. Executive Summary

Change 2 adds:

- authenticated `GET /api/admin/albums/[id]` (`{ album, photos, cdnBase }`, active photos ordered by `(sortOrder, createdAt)`);
- atomic full-permutation `PUT /api/admin/albums/[id]/photo-order` and `PUT /api/admin/album-order`, each validating an exact permutation, writing dense `0..n-1` in one `db.batch([...])`, returning `409 order_stale` with the current active ids, and revalidating the `wall` tag exactly once;
- pure `photoOrderState.ts` helpers (moves, dirty check, stale merge, date/time round-trip);
- the wall-order editor and two-tab Album Editor (`Photos (N)` / `Details`) inside the existing `/photos/admin` Studio, with live `<GalleryCanvas mode="preview" />` overlay and dnd-kit only inside `src/components/admin/*`;
- fixed `214×200px` placard anatomy with unified Caption, optional muted `Date · Time · Location`, bottom-pinned `Song Title — Artist` + local-timer timecode (`tabular-nums`, no green dot).

Totals: **26 test files / 381 tests passed** (baseline after Change 1: 25 / 350 → +1 file, +31 tests). Typecheck, lint and production build are clean. Public boundary audit confirms `/photos` has zero admin imports and zero `/api/admin` literals (the `@dnd-kit/*` packages are only reachable through `src/components/admin/*`).

---

## 2. Requirement Adherence Audit Matrix

### 2.1 `specs/admin-auth-and-crud-api/spec.md`

| Requirement / scenario | Verifying test(s) | Status |
| --- | --- | --- |
| `GET /api/admin/albums/[id]` guarded by `requireAdmin`, returns `{ album, photos, cdnBase }` with active photos ordered by `(sortOrder, createdAt)` for published **and** draft albums | `src/app/api/__tests__/routes.test.ts` → `GET /api/admin/albums/[id]` › "returns the album, cdnBase and active photos ordered by (sortOrder, createdAt)" and "serves both published and draft albums" | **PASS** |
| `GET` returns `404` missing album, `409 album_deleting`, `401` unauthenticated | Same suite › "requires authentication", "returns 404 for an unknown album and 409 for a deleting album" | **PASS** |
| `PUT photo-order` validates an exact permutation of active ids (no missing, duplicate, foreign/cross-album, deleting, extra) | Same suite › "returns 409 order_stale for missing, duplicate, cross-album and deleting ids without writing" | **PASS** |
| `PUT photo-order` writes dense `0..n-1` atomically in one `db.batch` and revalidates `wall` once | Same suite › "atomically renumbers 0..n-1 and preserves the order on the wall" (asserts `revalidateTag` called once with `('wall', { expire: 0 })`) | **PASS** |
| Scenario: atomic photo reorder persists across wall and Print Focus navigation | Route test proves `GET /api/wall` returns photos in the saved order; `GalleryCanvas` sorts by `sortOrder` and Print Focus `stepPhoto` walks that manifest order (unchanged code path) | **PASS** |
| Scenario: stale/duplicate/missing/cross-album/deleting ids → `409 { error: 'order_stale', activePhotoIds }`, no `sortOrder` modified | "returns 409 order_stale …" (asserts ids, no revalidation, unchanged read order) | **PASS** |
| `PUT album-order` exact permutation of non-`deleting` albums (`published` + `draft`), dense `0..m-1`, one revalidation | Same suite › `PUT /api/admin/album-order` › "atomically renumbers 0..m-1 and persists for the wall" | **PASS** |
| Scenario: stale/incomplete album list → `409 { error: 'order_stale', activeAlbumIds }` | "returns 409 order_stale with activeAlbumIds for stale, duplicate, foreign or deleting ids" | **PASS** |
| Scenario: unauthenticated `401`, untrusted `Origin` `403` | "rejects unauthenticated and cross-origin requests" in both reorder suites | **PASS** |
| Idempotent repeat saves | "is idempotent when the same permutation is re-saved" / "… same album order is re-saved" | **PASS** |
| Cross-album isolation (no writes outside the target album) | "never rewrites another album while reordering one" | **PASS** |
| Malformed bodies rejected `400` | "rejects a malformed body with 400" in both suites | **PASS** |

### 2.2 `specs/gallery-hud-and-curator-ui/spec.md`

| Requirement / scenario | Verification | Status |
| --- | --- | --- |
| Exhibitions filter (All/Published/Draft), cross-wall reorder via dnd-kit + accessible `↑`/`↓`, **Save Wall Order / Discard** calling `PUT …/album-order` through `withBase` | Code: `CuratorStudio.tsx` (`SortableAlbumRow`, `album-order`, `withBase`); route covered by `routes.test.ts`; runtime smoke below saved `[B, A]` and `GET /api/admin/albums` returned `Smoke Two:0, Smoke One:1` | **PASS (audit)** |
| Bi-directional selection with `<GalleryCanvas mode="preview" />` | Code: `handleSelectAlbum` ← `onSelectAlbum`; list rows call `selectFromDirectory` → `selectedAlbumId` prop | **PASS (audit)** |
| Album Editor two tabs `Photos (N)` / `Details` | Code: `AlbumEditor.tsx` tablist | **PASS (audit)** |
| Photos: wall-matched `gridColumns` grid, 256 LOD, dnd-kit pointer/touch/keyboard, `#N` badge, top-right `×`, 4-column equal-width `⤒/←/→/⤓`, Grid/List toggle, `+ Add Print` via `imageCompressor.ts`, read-only when `<= 1` | Code: `AlbumEditor.tsx` (`THUMBNAIL_LOD = 256`, `.album-editor-photo-actions` `repeat(4, minmax(0, 1fr))`, `prepareUploadFile`, `readOnly = photos.length <= 1`); `studio.css` rules | **PASS (audit)** for dnd-kit pointer/keyboard wiring; button reorder **PASS (browser)** |
| Photos: live optimistic `<GalleryCanvas>` overlay, sticky **Save Order / Discard**, `409 order_stale` merge banner + retry | Code: `onDraftChange` → `previewAlbums` → canvas; `.album-editor-savebar` sticky; 409 branch uses `mergeStaleOrder` then shows retry banner. Merge semantics unit-tested (`mergeStaleOrder` concurrent upload/delete). | **PASS (audit)**; browser 409 merge/retry flow **PASS (browser)** |
| Details: **Caption\*** (`albums.title`), **Wall Grid Columns\*** (`2/3/4/5`), bare **Date** / **Time** native inputs, **Geotag / Location**, **YouTube Soundtrack** (Video Link + Inspect + Song Title + Artist + Clear), Publish/Draft toggle, 2-step Delete Album | Code: `AlbumEditor.tsx` Details tab; date+time formatted with `formatCombinedDateLabel` and persisted through `PATCH …/albums/[id]` (existing route covered by "updates metadata and soundtrack fields…") | **PASS (audit)** |
| Scenario: drag/keyboard move → live preview + one atomic `PUT` → reload shows saved order on wall/Print Focus `← Prev` / `Next →` | Route persistence + wall order test **PASS**; live preview code audit and browser button/reload/Print Focus flow **PASS (browser)** | **PASS (audit)** / button + reload + Print Focus interaction **PASS (browser)** |
| Scenario: concurrent upload → `409 order_stale` merge preserving drag order, append new print, clear notice, retry | `photoOrderState.test.ts` → `mergeStaleOrder` cases; `AlbumEditor.tsx` 409 handler (refetch + merge + banner + Retry Save Order); route 409 test | **PASS (audit)**; two-client browser flow **PASS (browser)** |
| Scenario: Details edits update placard live, save persists `dateLabel` combined string, clearing optional fields collapses cleanly | `photoOrderState.test.ts` → `formatCombinedDateLabel` / `parseCombinedDateLabel` (both/date-only/time-only/empty/legacy); overlay code audit; `PATCH` metadata route test | **PASS (audit)**; live overlay + persisted placard **PASS (browser)** |
| Fixed `214×200px` placard, top-aligned beside grid, matte-black Soundtrack Plaque beneath, bold Caption top-left, optional muted metadata, bottom-pinned Song Title — Artist + timecode above standoffs, `tabular-nums`, **no green dot** | `GalleryCanvas.tsx` (`placardMetaLine`, `PlacardTimecode`, `placard-soundtrack` before standoffs); `playground-wall.css` (`width:214px; height:200px`, `.placard-timecode { font-variant-numeric: tabular-nums }`, no status dot markup); `islandLayout.ts` unchanged fixed geometry | **PASS (audit)** |
| Scenario: playing a soundtrack ticks `M:SS / M:SS` automatically with no dot while height stays fixed; public CSP blocks `iframe_api`, so use a local timer anchored to play start + `durationSec` | Code: `PlacardTimecode` interval anchored to `performance.now()` on play, clamped to `durationSec`, resets display when not playing. Studio **Inspect** now probes `getDuration()` through a hidden 1×1 `YT.Player` (Studio CSP allows `www.youtube.com`), so a replaced soundtrack supplies the ` / M:SS` total; best-effort, unset when blocked. | **PASS (audit)**; live tick `0:02 / 3:25` with no dot **PASS (browser)** |

### 2.3 Cross-cutting

| Requirement | Verification | Status |
| --- | --- | --- |
| `/photos` has zero admin imports / `/api/admin` literals / dnd-kit bytes | `src/lib/__tests__/publicBoundaryAudit.test.ts` (3 tests) | **PASS** |
| All client fetch/XHR URLs use `withBase()` | `src/lib/__tests__/rawUrlAudit.test.ts` (4 tests) + `AlbumEditor` / `CuratorStudio` use `withBase` for every request | **PASS** |
| No DB schema migration | No `drizzle/` changes; repository uses existing columns | **PASS** |
| No `export const dynamic = 'force-dynamic'` | Build output shows `ƒ` routes via normal dynamic rendering; no directive added | **PASS (audit)** |
| Soundtrack state-machine tests stay green | `src/components/wall/__tests__/soundtrackState.test.ts` (included in full run) | **PASS** |

### 2.4 PATCH-01 — date-label preservation, filtered reorder, basePath redirects (2026-11-24)

| Requirement / scenario | Verification | Status |
| --- | --- | --- |
| Scenario: **Saving other Details never erases an unparseable legacy date label** — stored free text (`October 2025`) is shown as the current value, kept in the live preview, and sent back unchanged; replaced only by a Date/Time edit and cleared only via **Clear date** | `photoOrderState.test.ts` → `resolveDateLabel` (3 tests); `AlbumEditor` `rawDateLabel` + `resolveDateLabel(details, savedDetails)` in the overlay and `saveDetails`; browser check (b): `Current: October 2025` + **Clear date** visible, Caption-only save left `dateLabel: "October 2025"` in `GET /api/admin/albums/[id]` | **PASS** (unit + browser) |
| Scenario: **Reordering under a Published or Draft filter moves only the visible albums** — move computed over visible rows, hidden albums keep their exact slots, `↑`/`↓` disabled by visible position, identical to `moveItem` when unfiltered | `photoOrderState.test.ts` → `moveWithinSubset` (mixed published/draft slots, `↑` visible swap, out-of-range, exhaustive `All`-filter equivalence); `CuratorStudio` visible-index drag/`↑`/`↓`; browser check (c): Published filter, `↓` on the first row, **Save Wall Order** → `[Pub B, Draft Mid, Pub A, …]`, draft index and world position unchanged | **PASS** (unit + browser) |
| Regression: `redirect(withBase(...))` doubles the base path | `publicBoundaryAudit.test.ts` → "never wraps redirect() in withBase" (walks `src/app`, strips comments); browser check (a): signed-in `/photos/admin/login` lands on `/photos/admin`, zero `/photos/photos` requests | **PASS** (static audit + browser) |
| Nits: `+ Add Print` stops sending `sortOrder`; redundant negative-lookahead header rule removed; stale proxy comment corrected | Code diff only (`AlbumEditor.tsx`, `next.config.ts`, `src/proxy.ts`); full build + lint green | **PASS (audit)** |

**Deviation:** PATCH-01 also modifies two pages owned by `admin-route-isolation`
(`src/app/admin/page.tsx`, `src/app/admin/login/page.tsx`) to drop
`redirect(withBase(...))`, plus the `next.config.ts` header list and the
`src/proxy.ts` comment. This is the planned cross-change touch recorded in
`handoff-patch.md` §2; no proxy logic, CSP generation, route handler, repository
or schema behaviour changed.

---

## 3. Resolved Assumptions & Empirical Proof

From `research.md`:

1. **`photos.sortOrder` and `albums.sortOrder` exist** → confirmed in `src/db/schema.ts`; used without migration.
2. **Read path orders by `(sortOrder, createdAt)`** → `getAlbumWithActivePhotos` and `listAlbumsWithPhotos` both order `asc(sortOrder), asc(createdAt)`; test scrambles sortOrder and asserts the returned order.
3. **Grid layout is row-major** → unchanged `computeAlbumGrid`; the Studio overlay now recomputes placements through `computeWallGridPositions`, so live `gridColumns` edits resize islands immediately.
4. **`GET /api/admin/albums/[id]` did not exist** → implemented and tested.
5. **dnd-kit is installed** → `package.json` / lockfile already contain `@dnd-kit/core@6.3.1`, `@dnd-kit/sortable@10.0.0`, `@dnd-kit/utilities@3.2.2`; imports are confined to `src/components/admin/`.
6. **Public CSP blocks `www.youtube.com/iframe_api`** → the placard timecode is a local ticker (`performance.now()` at play click + `durationSec`), not an API read.
7. **Explicit Save preserves `revalidateTag` churn** → no autosave; one `revalidateTag('wall', { expire: 0 })` per successful mutation (asserted in route tests).

### Runtime smoke (production `next start`, `ADMIN_ENABLED=true`, port 4783)

Verbatim highlights:

```
upload1:201 upload2:201 upload3:201
publish:200
detail:200
43404dcc,4751b121,bada1939
reorder:200
wall:200
wall order: bada1939,43404dcc,4751b121 sortOrder: 0,1,2
stale:409
{"error":"order_stale","activePhotoIds":["bada1939-…","43404dcc-…","4751b121-…"]}
album-order:200
{"albumIds":["18a55526-…","52551d97-…"]}
list order: Smoke Two:0, Smoke One:1
album-order-stale:409
{"error":"order_stale","activeAlbumIds":["18a55526-…","52551d97-…"]}
unauth-photo-order:401
public-gallery:200
```

This proves the dense renumbering reaches `GET /api/wall`, `409 order_stale` returns the live ids, and album order persists through the admin list. The temporary DB/uploads lived under `.scratch/` and were deleted afterwards.

---

## 4. Nomenclature & Code Symbol Audit

| Glossary term | Code symbol(s) | Match |
| --- | --- | --- |
| Full permutation | `isExactPermutation()` in `src/db/repository.ts` | yes |
| `409 order_stale` | `PhotoReorderResult` / `AlbumReorderResult` status `'order_stale'` → JSON `{ error: 'order_stale', activePhotoIds / activeAlbumIds }` | yes |
| Unified Caption | `AlbumEditor` `details.title` → `albums.title`; placard `placard-title` | yes |
| Combined date label | `formatCombinedDateLabel()` / `parseCombinedDateLabel()` | yes |
| Stale merge | `mergeStaleOrder()` | yes |
| Album Editor tabs | `Photos (N)` / `Details` in `AlbumEditor.tsx` | yes |
| Wall order | `PUT /api/admin/album-order`, `effectiveWallOrder`, `Save Wall Order` | yes |
| Photo order | `PUT /api/admin/albums/[id]/photo-order`, `Save Order` | yes |
| Soundtrack footer | `placement` `placard-soundtrack`, `placard-track-name`, `placard-timecode` | yes |

No `dynamic = 'force-dynamic'`, no schema migration, no new dependency beyond the pre-approved dnd-kit trio.

---

## 5. Empirical Execution Logs

### Test scaffolding failed first (TDD 1.4)

```
 FAIL  src/app/api/__tests__/routes.test.ts
Error: Cannot find package '@/app/api/admin/albums/[id]/photo-order/route'
 FAIL  src/components/admin/__tests__/photoOrderState.test.ts
Error: Cannot find module '../photoOrderState'
 Test Files  2 failed (2)   Tests  no tests
```

### Narrow gate (requested command)

```
$ npx vitest run src/components/admin/__tests__/photoOrderState.test.ts src/app/api/__tests__/routes.test.ts src/lib/__tests__/publicBoundaryAudit.test.ts
 Test Files  3 passed (3)
      Tests  70 passed (70)
```

### Full suite

```
$ npx vitest run
 Test Files  26 passed (26)
      Tests  381 passed (381)
   Duration  8.53s
```

Baseline after Change 1 was 25 files / 350 tests; this change adds `photoOrderState.test.ts` plus the new route cases (+31 tests). No test was removed or skipped.

### Typecheck

```
$ npx tsc --noEmit
(no output — exit 0)
```

### Lint

```
$ npm run lint
> photo-wall@0.1.0 lint
> eslint .
(no output — exit 0)
```

### Production build

```
$ env DATABASE_URL='file::memory:' … ADMIN_ENABLED=true npm run build
✓ Compiled successfully in 3.6s
  Finished TypeScript in 8.4s
✓ Generating static pages using 2 workers (13/13)
 ƒ /api/admin/album-order
 ƒ /api/admin/albums/[id]
 ƒ /api/admin/albums/[id]/photo-order
 ƒ /api/admin/wall-preview
```

### Bounded repair pass — soundtrack duration probe (2026-11-24)

Review found that `AlbumEditor`'s **YouTube Soundtrack → Inspect** left
`durationSec` null for a newly inspected video, so a replaced soundtrack rendered
`0:00` with no ` / M:SS` total on the fixed placard.

Change (`src/components/admin/AlbumEditor.tsx` only):

- imports `loadYouTubeIframeApi` / `YouTubePlayer` from `@/lib/youtube/iframeApi`;
- adds a hidden `<div className="admin-hidden-player">` host inside the Details
  soundtrack card (`durationHostRef`) and a `durationPlayerRef`;
- adds `captureDuration(videoId)` mirroring `FolderDropzone`: mount a 1×1
  `YT.Player`, wait 1400 ms after `onReady`, round `getDuration()` into
  `details.soundtrack.durationSec` (only if the video id still matches), then
  destroy the player. Failure (blocked API/network) degrades silently and leaves
  the duration unset; title/artist remain editable;
- calls `void captureDuration(payload.videoId)` only after a successful Inspect
  response — never on URL keystrokes; `onYoutubeUrlChange` still clears a changed
  video's duration; the probe player is destroyed on unmount.

No public module, route, schema, CSS, dnd-kit import or dependency changed.

Re-run results:

```
$ npx tsc --noEmit
(no output — exit 0)

$ npm run lint
> eslint .
(no output — exit 0)

$ npx vitest run src/components/admin/__tests__/photoOrderState.test.ts src/app/api/__tests__/routes.test.ts src/lib/__tests__/publicBoundaryAudit.test.ts
 Test Files  3 passed (3)
      Tests  70 passed (70)

$ env … ADMIN_ENABLED=true npm run build
✓ Compiled successfully in 2.7s
  Finished TypeScript in 4.2s ...
✓ Generating static pages using 2 workers (13/13) in 395ms
```

The probe itself needs a browser with `www.youtube.com` reachable (Studio CSP
already allows it) to observe a populated `durationSec`; that remains part of the
browser pass below.

### PATCH-01 — reproduction first, then green (2026-11-24)

Reproduction before the fix (tests 1, 2, 4 fail for the diagnosed reasons; test 3
guards `All`-filter equivalence):

```
$ npx vitest run src/components/admin/__tests__/photoOrderState.test.ts -t "resolveDateLabel|moveWithinSubset"
 FAIL  … > resolveDateLabel > keeps an unparseable legacy label when the inputs were not touched
TypeError: resolveDateLabel is not a function
 FAIL  … > moveWithinSubset > … TypeError: moveWithinSubset is not a function
 Test Files  1 failed (1)
      Tests  7 failed | 14 skipped (21)

$ npx vitest run src/lib/__tests__/publicBoundaryAudit.test.ts -t "redirect"
- Expected
+ Received
- []
+ [
+   "src/app/admin/login/page.tsx",
+   "src/app/admin/page.tsx",
+ ]
 Test Files  1 failed (1)
      Tests  1 failed | 3 skipped (4)
```

After the minimal fixes:

```
$ npx vitest run src/components/admin/__tests__/photoOrderState.test.ts -t "resolveDateLabel|moveWithinSubset"
 Test Files  1 passed (1)
      Tests  7 passed | 14 skipped (21)

$ npx vitest run src/lib/__tests__/publicBoundaryAudit.test.ts -t "redirect"
 Test Files  1 passed (1)
      Tests  1 passed | 3 skipped (4)
```

Full gates after PATCH-01:

```
$ npx tsc --noEmit
(no output — exit 0)

$ npm run lint
> eslint .
(no output — exit 0)

$ npx vitest run
 Test Files  26 passed (26)
      Tests  389 passed (389)
   Duration  8.32s

$ env DATABASE_URL='file::memory:' … ADMIN_ENABLED=true npm run build
✓ Compiled successfully in 2.7s
  Finished TypeScript in 4.9s ...
✓ Generating static pages using 2 workers (13/13) in 470ms
```

Targeted Playwright (§5.5 a–d) on production `next start` (port 4790, fresh
libSQL file DB + local storage, `ADMIN_ENABLED=true`, Playwright 1.65.1 Chromium
from the machine's npx cache — no repo dependency):

```
PASS: login 200 (got 200)
PASS: captured photowall_session cookie
PASS: login page payload contains no /photos/photos (status 200)
PASS: GET /photos 200 (got 200)
PASS: public CSP excludes www.youtube.com
PASS: public CSP still declares frame-src
PASS: anonymous /photos/admin/login 200 (got 200)
PASS: studio CSP allows https://www.youtube.com
PASS: create Pub A 201 / Draft Mid 201 / Pub B 201 / Legacy Label 201
PASS: publish … 200 (both published albums)
PASS: set legacy dateLabel 200
PASS: Draft Mid starts at index 1 (Pub A,Draft Mid,Pub B,Legacy Label)
PASS: signed-in /photos/admin/login lands on /photos/admin
PASS: no request ever hits /photos/photos
PASS: editor shows Current: October 2025 (got "Current: October 2025 Clear date")
PASS: Clear date button is rendered
PASS: legacy dateLabel preserved (got "October 2025")
PASS: caption was saved
PASS: Draft Mid keeps its slot (got Pub B,Draft Mid,Pub A,Legacy Label Updated)
PASS: published pair swapped around the draft
PASS: Draft Mid position is unchanged
ALL PLAYWRIGHT CHECKS PASSED
```

Note on (a): with Next 16 Cache Components, the signed-in login page is a PPR
shell that streams `NEXT_REDIRECT` inside a `200` response (`x-nextjs-postponed:
1`); the browser-level assertion is the meaningful one and lands on
`/photos/admin` with no doubled path. Scratch DB/uploads and the temporary
Playwright script were deleted afterwards.

**Orchestrator independent re-verification (15/15):** fresh production
`next start` on port 3213 confirmed signed-in `/photos/admin/login` lands on
`/photos/admin` with zero `/photos/photos` requests; `Current: October 2025` +
**Clear date** with a caption-only save preserving `dateLabel: "October 2025"`
(and an explicit Clear date producing `null`); a Published-filter `↓` move
yielding `[Legacy, Pub B, Draft Mid, Pub A]` with the hidden draft still at
index 2; and the public/Studio CSP split unchanged. Repro gates before/after:
targeted `resolveDateLabel`/`moveWithinSubset` tests and the `redirect(withBase)`
audit failed before the fix (missing exports / two offenders) and pass after.

### Browser E2E (task 4.2) — orchestrator Playwright pass

**PASS — 29/29 checks** against a production `next start` on a fresh libSQL DB
(`ADMIN_ENABLED=true`), using Playwright 1.65.1 Chromium from the machine's npx
cache (no repo dependency added). Two published albums with 3 + 2 uploaded
prints were created through the real admin API, then exercised through the UI:

1. **Photos order:** `⤒` moved print #3 to slot #1; **Save Order** returned 200;
   `/api/wall` and a reload showed the new order; the edit was visible in
   `Photos (N)` before save (photo-id order assertion).
2. **Print Focus:** opening the album and first print focused index 0; `ArrowRight`
   moved focus to index 1, matching the persisted `sortOrder`.
3. **409 merge:** with an unsaved move in the editor, a second client uploaded a
   fourth print; **Save Order** returned 409, the banner appeared, the editor
   appended the new print (Photos (4)) while preserving the curator order, and
   **Retry Save Order** persisted `[p2, p3, p1, p4]` to `/api/wall`.
4. **Cross-wall order:** `↑` moved Album B above Album A; **Save Wall Order**
   persisted `[E2E Album B, E2E Caption]` to `/api/wall`.
5. **Details:** Caption*, native `date` + `time` (→ `Nov 24, 2026 · 8:30 PM`),
   Geotag/Location, and the YouTube soundtrack fields persisted through `PATCH`;
   an unsaved caption/location edit updated the preview placard immediately
   (`Live Overlay Caption` / `… · Live Location`) with no server write.
6. **Placard anatomy:** computed `width: 214px; height: 200px` on both Studio and
   public wall; Caption + `Date · Time · Location` + `Song — Artist` + `0:00 / 3:25`
   render; zero status-dot elements.
7. **Live timecode:** clicking the soundtrack plaque on `/photos` advanced the
   footer to `0:02 / 3:25` (local ticker, `tabular-nums`, no green dot).
8. **Public isolation:** zero `/api/admin` requests, no curator trigger, strict CSP
   without `www.youtube.com`; the public wall rendered the saved 4-print order.

The `Inspect` duration probe needs `www.youtube.com` reachable from the browser;
the timecode total above was verified by persisting `durationSec` (as the probe
does). Network-blocked environments still degrade cleanly to title/artist editing.

Verbatim summary: `SUMMARY 29/29 passed`; live-overlay check: `2/2 passed`.


---

## 6. Quick Re-Verification (60-second audit)

```bash
npx vitest run src/components/admin/__tests__/photoOrderState.test.ts \
  src/app/api/__tests__/routes.test.ts \
  src/lib/__tests__/publicBoundaryAudit.test.ts \
  src/lib/__tests__/rawUrlAudit.test.ts
npx tsc --noEmit
npm run lint
```

Expected: 4 files / 74 tests pass; `tsc` and `eslint` exit 0 with no output.

Full gate:

```bash
npx vitest run && npm run typecheck && npm run lint && \
  env DATABASE_URL='file::memory:' ADMIN_PASSWORD='test-password-1234' \
  AUTH_SECRET='test-secret-that-is-long-enough-for-hs256-signing' \
  STORAGE_DRIVER=local LOCAL_UPLOAD_DIR='./data/test-uploads' ADMIN_ENABLED=true \
  npm run build
```

Expected: 26 files / 381 tests pass; build exits 0.
