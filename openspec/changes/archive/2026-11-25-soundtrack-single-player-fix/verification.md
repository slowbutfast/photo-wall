# Verification — `soundtrack-single-player-fix`

## Executive Summary & Environment

| Field | Value |
| :--- | :--- |
| **Status** | Automated verification **PASS**. Live-browser manual check (task 3.2) **PASS** (orchestrator Playwright pass, see below). |
| **Date** | 2026-11-24 |
| **Branch** | `feat/multi-20261125-0407` (no commits made by this session) |
| **OS** | Linux 5.15.0-1081-oracle |
| **Node** | v22.23.2 (no project virtualenv; repo is npm/Next) |
| **Test runner** | Vitest 5.1.1, `environment: 'node'`, `fileParallelism: false`, `maxWorkers: 1` |
| **Commands** | `npx vitest run`, `npx tsc --noEmit`, `npx eslint .`, `npm run build` |

Files changed (exactly the Target Context Map, nothing else):

- `src/components/wall/soundtrackState.ts` — new `showsIframeFor(state, albumId)`; `showsIframe` untouched.
- `src/components/wall/SoundtrackPlaque.tsx` — import swap; `iframeVisible` / `facade` / `armed` (and therefore `data-state`) derived from the per-album predicate. Reducer, play handler, unmount cleanup, markup and CSS unchanged.
- `src/components/wall/__tests__/soundtrackState.test.ts` — new `describe` + extended exclusivity assertions. No existing assertion changed.

---

## Requirement Adherence Audit Matrix

Requirement: **Only the active album's plaque mounts a soundtrack player** (`specs/3d-pbr-wall-and-lighting/spec.md`).

| # | Scenario | Verifying test(s) | Status |
| :-- | :--- | :--- | :--- |
| 1 | **Clicking one plaque plays only that album** — after `enter-album A` + `play A`, A true, B false | `showsIframeFor — per-album player projection > is true for the album that plays and false for any other` | **PASS** |
| 2 | **Switching to another plaque hands over the single player** — after A→B handover only B true | `showsIframeFor — per-album player projection > hands the single player over from A to B` | **PASS** |
| 3 | **Predicate is exclusive across any set of albums** — ≤ 1 of `['A','B','C']` true, and it equals `activeAlbumId` | `soundtrack state machine — invariants > never reports more than one mounted iframe across a long event walk` (assertions added at every step of the walk) | **PASS** |
| 4 | Supporting: **false at overview and before play** | `showsIframeFor — per-album player projection > is false for every album at overview and before the first play` | **PASS** |
| 5 | Requirement clause "at most one `youtube-nocookie.com` iframe exists in the DOM" | `PASS (audit)` — see *DOM-count audit* below; the live DOM count is the deferred half of task 3.2 | **PASS (audit)** |

### DOM-count audit (why scenario 1/2's DOM clause holds)

`SoundtrackPlaque.tsx` is now the only non-test consumer of the predicate:

- `iframeVisible = showsIframeFor(state, album.id)` — the sole gate on the `<iframe className="soundtrack-iframe">` render branch;
- `armed = iframeVisible && captureLayerActive(state)` — so the capture layer cannot appear on a plaque that has no player;
- `data-state={iframeVisible ? 'playing' : 'resting'}` — consistent with what is rendered;
- the `facade` branch is `!iframeVisible`, so every non-active plaque keeps its resting thumbnail.

Therefore `document.querySelectorAll('.soundtrack-iframe').length === Σ_plaques showsIframeFor(state, id) ≤ 1`, which scenarios 1 and 3 prove. Reducer unchanged ⇒ the state machine's existing `mountedIframeCount ≤ 1` invariant still holds.

---

## Resolved Assumptions (from `research.md`)

| Assumption | Resolution |
| :--- | :--- |
| **"No other component renders an iframe from `showsIframe`. Only `SoundtrackPlaque.tsx` imports it outside tests (by grep)."** | **RESOLVED — confirmed.** `grep -rn showsIframe src` (28 matches) shows non-test references only in `soundtrackState.ts` (definition, `showsFacade`, `showsIframeFor`, comments) and one import in `SoundtrackPlaque.tsx`. That import is now `showsIframeFor`; `showsIframe` has **no** consumer outside its own module. |

---

## Nomenclature & Code Symbol Audit

| Glossary term (`research.md`) | Code symbol | Match |
| :--- | :--- | :--- |
| **Active album** — `soundtrack.activeAlbumId`, the one album whose player is mounted | `SoundtrackState.activeAlbumId` | ✅ |
| **Per-album predicate** — a function of `(state, albumId)` answering for one plaque | `showsIframeFor(state: SoundtrackState, albumId: string): boolean` | ✅ (wall-level `showsIframe(state)` retained, per D1) |
| **Mounted plaque** — a `<SoundtrackPlaque>` rendered per visible island | `SoundtrackPlaque` / `SoundtrackPlaqueProps.album` | ✅ (`album.id` is the predicate argument) |

Design/architecture decisions:

- **D1** ✅ implemented verbatim: `return showsIframe(state) && state.activeAlbumId === albumId;` — `showsIframe` byte-identical to before.
- **D2** ✅ all four derivations match; `play` handler, `useEffect` cleanup, JSX structure and CSS classes untouched.
- **D3** ✅ direct A/B case, A→B handover, overview/before-play falsity, exclusivity over `['A','B','C']`.
- No reducer, `playsinline`, CSS/markup, dependency or API change.

---

## Empirical Execution Logs

### TDD red step (task 1.2) — before the fix

```
TypeError: showsIframeFor is not a function
 ❯ src/components/wall/__tests__/soundtrackState.test.ts:190:12

FAIL  src/components/wall/__tests__/soundtrackState.test.ts > soundtrack state machine — invariants > never reports more than one mounted iframe across a long event walk
TypeError: showsIframeFor is not a function

 Test Files  1 failed (1)
      Tests  4 failed | 19 passed (23)
```

(4 failures = 3 new cases + the extended walk; all the same missing export.)

### Green step — narrow file

```
 RUN  v5.1.1 /home/node/global-sandbox/projects/photo-wall

 Test Files  1 passed (1)
      Tests  23 passed (23)
```

### Full suite — baseline vs. after

| | Test files | Tests |
| :--- | :--- | :--- |
| Baseline (before any edit) | 29 passed | 409 passed |
| After | 29 passed | **412 passed** |

`+3` tests, `0` removed or skipped: the three new `showsIframeFor` cases. The fourth new case is the extended walk test (same test, more assertions), so it adds no count while strengthening the existing invariant. No test file disappeared.

```
 RUN  v5.1.1 /home/node/global-sandbox/projects/photo-wall

 Test Files  29 passed (29)
      Tests  412 passed (412)
   Duration  8.94s (tests 70%, import 23%, transform 3%)
```

### Typecheck

```
$ npx tsc --noEmit
tsc exit=0
```

> Note: the first `tsc`/`build` attempt failed inside `.next/dev/types/validator.ts` (`Cannot find module '../../../src/app/page.js'`) and `.next/types/validator.ts`. This was a **pre-existing stale generated artifact** (mtime 2026-11-24 15:06, from a dev run before `src/app/page.tsx` was moved into `src/app/(gallery)/page.tsx`; the file it imports is not in `HEAD`). It touches no file in this change. Removing the stale gitignored `.next/` and rebuilding made both `tsc` and `build` pass; `tsc` was then re-run after the fresh build to confirm `.next/types` regenerates clean.

### Lint

```
$ npx eslint .
eslint exit=0
```

### Production build

```
$ npm run build
▲ Next.js 16.4.6 (Turbopack)
✓ Compiled successfully
✓ Generating static pages using 2 workers (13/13)
build exit=0
```

(Turbopack prints a pre-existing `cacheComponents`/`partialPrefetching` informational warning; it is unrelated to this change and not an error.)

---

## Orchestrator Browser Verification (task 3.2)

Local-only harness (never preview/production): a copied local DB at `data/photo-wall-verify.db` seeded with two adjacent published albums, both carrying soundtracks — `bolt` ("Take Me Home, Country Roads" — John Denver) and `Bay` ("Never Gonna Give You Up" — Rick Astley). Dev server: `DATABASE_URL=file:./data/photo-wall-verify.db STORAGE_DRIVER=local LOCAL_UPLOAD_DIR=./data/uploads-verify npx next dev -p 3210`. Headless Chromium via Playwright, `--no-sandbox`, 1440×900, `--workers=1` equivalent (single page).

Observed DOM state (`data-state`, iframe/facade/capture presence per plaque):

```text
initial  {"iframes":0,"captureLayers":0,"plaques":[
  {"album":"bolt","state":"resting","iframe":false,"facade":true,"capture":false},
  {"album":"Bay","state":"resting","iframe":false,"facade":true,"capture":false}]}

afterA (click A's facade) {"iframes":1,"captureLayers":1,"plaques":[
  {"album":"bolt","state":"playing","iframe":true,"facade":false,"capture":true},
  {"album":"Bay","state":"resting","iframe":false,"facade":true,"capture":false}]}

afterB (click B's facade) {"iframes":1,"captureLayers":1,"plaques":[
  {"album":"bolt","state":"resting","iframe":false,"facade":true,"capture":false},
  {"album":"Bay","state":"playing","iframe":true,"facade":false,"capture":true}]}
```

Capture-layer scenario — wheel over B's facade while A plays:

```json
{
  "iframesWhileAPlays": 1,
  "captureLayersOnB": 0,
  "wallMoved": true,
  "before": "matrix(1.02857, 0, 0, 1.02857, 0, -302.811)",
  "after": "matrix(1.43932, 0, 0, 1.43932, -97.0389, -442.106)"
}
```

Result: **PASS**, all three `tests.md` manual checks. `document.querySelectorAll('.soundtrack-iframe').length === 1` after clicking A, and still `1` after the A→B handover, with A restored to its facade. B has no capture layer while A plays, and the wheel over B pans/zooms the wall.

---

## Quick Re-Verification (60-second audit)

```bash
npx vitest run src/components/wall/__tests__/soundtrackState.test.ts && \
npx vitest run && npx tsc --noEmit && npx eslint .
```

Expected:

```
Test Files  1 passed (1)
     Tests  23 passed (23)
Test Files  29 passed (29)
     Tests  412 passed (412)
tsc exit=0
eslint exit=0
```

Deterministic scope check — should list only the three source files plus this change dir:

```bash
git status --short
```
