# Verification: upload-autosave-draft

## 1. Executive summary

A completed upload now saves itself as a draft in Curator Studio, with no new button.

- **Auto-save:** when every file of an album is `done`, `FolderDropzone` sends one metadata `PATCH` with the title and the optional settings and **no `status` key**. Every album is already a draft, so a late save can never unpublish one.
- **Studio sync:** `CuratorStudio` extracts one `refreshStudio` (the existing `manifest.refresh()` plus `loadAdminAlbums()` pair) and passes it as `onWallChanged`. It runs after each upload run (partial runs included), after Publish, and after Discard. Without the prop, `FolderDropzone` falls back to `refreshWall()`.
- **Publish:** it sends `status: 'published'` plus only the fields that differ from the auto-saved settings, so edits made in Exhibitions survive.
- **Races:** Publish and Discard guard on the synchronously updated draft ref, and a discarded card ignores late save results.
- **Unchanged:** no API, DB or dependency change. `git diff 5188316 -- src/app src/db` is empty.

**Result:** full suite 818/818 across 57 files; tsc, eslint and the production build exit 0. On local dev, the real Studio passed all 14 end-to-end checks (§4), including the draft badge appearing on the preview wall straight after the upload.

**Not verified:** the Exhibitions-tab edit that Publish must preserve was not driven in a browser. It's covered by the diff-body unit tests (§3). Nothing here needs a device.

## 2. Environment

- **Base:** `origin/main` @ `5188316`. **Branch:** `feat/multi-20261128-0606`. **Implementation commit:** `925e82b`.
- **Node:** v22.23.2. **Next.js:** 16.4.6 (Turbopack). **Vitest:** 5.1.1.
- **Local dev only:** `next dev -p 3217` with `ADMIN_ENABLED=true`, `STORAGE_DRIVER=local`, and a throwaway SQLite file and upload directory **outside the repo** (`$CLAUDE_JOB_DIR/tmp/studio2/`). Nothing ran against preview or production, which share the production Turso DB and Bunny storage. The harness refuses any `BASE_URL` that isn't localhost.
- **Browser:** Playwright Chromium (headless), 1440×900. The folder inputs use the committed `public/demo` photos.
- **Note:** the first runs kept the DB inside the repo and Turbopack hot-reloaded the page on every database write, so it moved out. A `drizzle-kit push` onto a DB the app then also initialised caused a `table already exists` error; the final run used a fresh file the app created itself.

## 3. Requirement Adherence Audit Matrix

All scenarios are from `specs/gallery-hud-and-curator-ui/spec.md`, requirement "Upload auto-saves completed albums as drafts and syncs the Studio preview".

| Scenario | Verified by | Result |
| :--- | :--- | :--- |
| Completed upload appears on the Studio preview as a draft with its metadata | `FolderDropzone.autosave.test.tsx` › sends one metadata PATCH without status, then refreshes the Studio (one PATCH, `locationLabel: 'Kyoto'`, no `status`, `onWallChanged` once, notice `Saved Untitled Album as draft`); Playwright flow 1: one save PATCH, the preview and album list refetched about 1.2 s after it, `.album-island.is-draft` count 0 → 1, screenshot `parity/studio-after-autosave.png` shows the placard with `DRAFT` badge and `Kyoto`; the Exhibitions list is refetched (`GET /api/admin/albums`) | PASS (the Exhibitions list is checked by its refetch, not visually) |
| Partial upload still shows on the preview without auto-saving metadata | `FolderDropzone.autosave.test.tsx` › refreshes the preview but sends no metadata while a file has failed (0 PATCHes, `onWallChanged` once, `1 failed`, Retry and Discard visible) | PASS |
| Retry completes the album and triggers the auto-save | `FolderDropzone.autosave.test.tsx` › auto-saves once the retry completes the album (exactly one PATCH, no `status`, `Saved as draft`) | PASS |
| Publishing during an auto-save is ignored | `FolderDropzone.autosave.test.tsx` › ignores Publish while the auto-save is in flight (button disabled, a click leaves the PATCH count at 1 until the gate opens and after it) | PASS. The ref guard in `publishDraft` can't be reached from the DOM while the button is disabled, so the test proves the observable contract |
| Publish keeps edits made in Exhibitions | `folderDropzoneDraft.test.ts` › with the same settings as the last save, sends nothing but the status; `FolderDropzone.autosave.test.tsx` › sends only the status when the form is unchanged; Playwright: the publish PATCH body is exactly `{"status":"published"}` | PASS. The Exhibitions edit itself wasn't clicked through, and the route maps `''` to `null` (§4), so the old full re-send would have cleared such a value |
| Publish carries Upload-form edits made after the auto-save | `FolderDropzone.autosave.test.tsx` › carries only the Upload-form edits made after the auto-save (`{ status, dateLabel }` only); `folderDropzoneDraft.test.ts` › sends only the fields that changed | PASS |
| Discard removes the draft from the preview | `FolderDropzone.autosave.test.tsx` › removes a saved draft from the preview when discarded (one DELETE, `onWallChanged` called once more); Playwright flow 2: one `DELETE`, cards 2 → 1, draft islands 1 → 0, refetch after | PASS |
| Discard during an auto-save stays quiet | `FolderDropzone.autosave.test.tsx` › stays quiet when Discard lands during a failing auto-save (the PATCH answers 404 after the card is gone: no `.admin-error`, no card, `onWallChanged` called) | PASS |

Also covered, from the requirement text:
- **Status label precedence:** `folderDropzoneDraft.test.ts` › follows the documented precedence, and › does not keep claiming a save after a later failure.
- **No new buttons:** the autosave test asserts only `Publish album` and `Discard draft` on a saved card; Playwright confirms the same.
- **No `status: 'draft'` ever:** the autosave test (every request) and the Playwright log (all three PATCHes).
- **`refreshWall` fallback** without the prop: the autosave test.

## 4. Resolved assumptions and empirical proof

| Assumption / finding | Outcome | Evidence |
| :--- | :--- | :--- |
| `nullableString('')` stores `null` for empty strings (research.md) | **Verified.** `route.ts:41-47` trims and returns `null` for an empty string. So an unchanged-empty field sent by the old publish would have cleared an Exhibitions-edited value, which is why Publish now diffs. | `src/app/api/admin/albums/[id]/route.ts:41-47` |
| Metadata `PATCH` without `status` is accepted | **Verified live.** `PATCH` with `{"title", "cameraName":"", …, "soundtrackDurationSec":null}` returned 200 and the draft appeared. | `logs/3.2-studio-autosave.log` |
| The real flow sends exactly one save per album | **Verified.** Requests in order: `POST` album → `PATCH` (no status) → preview and list refetch; `PATCH {"status":"published"}` → refetch; second album `POST` → `PATCH` → refetch → `DELETE` → refetch. | `logs/3.2-studio-autosave.log` |
| `@testing-library/react` is available | **No.** The component test drives `react-dom/client` with `act`, as `MacroIsland.test.tsx` does. No dependency was added. | `package.json` unchanged |

**Edited existing assertions:** none. `routes.test.ts` and every pre-existing test are unedited and green.

**Verdict block from the live run** (all `true`): one save PATCH per album, one publish PATCH, the notice names the draft, the save PATCH has no `status` and carries the location, the card reads `Saved as draft`, no extra buttons, the preview refetched after the save, the draft badge appears, publish sends only `status`, publishing removes the draft island, no `status: 'draft'` anywhere, discard sends one `DELETE`, and discard removes the card and the draft island.

## 5. Nomenclature audit (research.md glossary)

| Term | Where used | Consistent? |
| :--- | :--- | :--- |
| **draft** (server) vs **Draft card** (client) | `Draft` stays the client card type; comments say "album is already a draft" for the server row | Yes |
| **auto-save** | `saveDraftMetadata`, the `'Draft save'` error verb, the `Saving…` and `Saved as draft` labels; always the status-less metadata `PATCH` | Yes |
| **saved settings** | `Draft.savedSettings`: the snapshot the last successful auto-save sent | Yes |
| **Studio refresh** | `refreshStudio` in `CuratorStudio`, passed as `onWallChanged`; never confused with `useWallStore.refreshWall` (the published-only fallback) | Yes |

## 6. Pending manual checks

None blocking. Optional, in a browser on local dev:
- Edit the album's location in Exhibitions → editor, then click Publish album on the Upload card: the edited value should survive (covered by unit tests, not clicked through).
- The mobile Studio layout (< 1024 px): the card behaves the same, but wasn't exercised.

## 7. Verbatim logs

All under `logs/` (screenshots and the harness under `parity/`):
- `1.3-tdd-red.log`: the red run (23 failed) before implementation.
- `3.1-safe-test.log`: `safe-test` aborting with `RangeError: WebAssembly.instantiate(): Out of memory`.
- `3.1-vitest-full.log`: 57 files, 818 tests passed.
- `3.1-tsc.log`, `3.1-eslint.log`, `3.1-build.log`: all exit 0.
- `3.2-studio-autosave.log`: the live Studio run with its request log and verdict block.
