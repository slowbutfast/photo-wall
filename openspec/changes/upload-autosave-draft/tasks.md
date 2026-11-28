## Target Context Map

All line numbers are on `5188316` (`origin/main`). Re-read each file before editing.

| File | Lines | Change |
|---|---|---|
| `src/components/admin/FolderDropzone.tsx` | L54-62 (`Draft`) | Add `saving`, `savedSettings` and `discarding` (D2). |
| `src/components/admin/FolderDropzone.tsx` | L171-205 (`patchAlbum`) | Extract the exported pure `buildAlbumPatchBody(title, settings, { publish, since, titleSince })`. `patchAlbum(albumId, body, verb)` sends a prebuilt body (D1). |
| `src/components/admin/FolderDropzone.tsx` | L206-219 | `FolderDropzoneProps { onWallChanged?: () => void \| Promise<void> }`; a `notifyWallChanged` wrapper with try/catch (D3). |
| `src/components/admin/FolderDropzone.tsx` | L342-382 | End-of-run auto-save plus refresh; `saveDraftMetadata`; guarded `publishDraft` with the diff body; `discardDraft` with `discarding` and a refresh (D3). |
| `src/components/admin/FolderDropzone.tsx` | L414-431 | Initialise the new `Draft` fields. |
| `src/components/admin/FolderDropzone.tsx` | L676-746 (card UI) | `getDraftStatusLabel` (exported, pure; D5); `disabled` on Publish while `busy \|\| saving` and on Discard while `discarding`. No new buttons. |
| `src/components/admin/CuratorStudio.tsx` | L358-361, L657 | Extract `refreshStudio`, reuse it in `handleEditorDeleted`, and pass `onWallChanged={refreshStudio}` (D4). |
| `src/components/admin/__tests__/folderDropzoneDraft.test.ts` | `[NEW]` | Pure helper tests. |
| `src/components/admin/__tests__/FolderDropzone.autosave.test.tsx` | `[NEW]` | Behavioural tests with mocked `fetch` and upload helpers. |

**Out of bounds:**
- every file under `src/app/api/`;
- `src/db/`;
- the upload loop's preparation, retry and abort internals (L264-341), except the new code after the loop;
- `AlbumEditor.tsx`;
- every wall file (`src/components/wall/**`, `src/styles/**`);
- `playgrounds/`;
- no new dependencies.

## 1. Test Scaffolding (TDD)

- [x] 1.1 Write a failing `folderDropzoneDraft.test.ts` for `buildAlbumPatchBody` and `getDraftStatusLabel`.
- [x] 1.2 Write a failing `FolderDropzone.autosave.test.tsx`. First check whether `@testing-library/react` is a dev dependency; if it isn't, use `react-dom/client` and `act`, and don't add one.
- [x] 1.3 Run both. Confirm they fail for the intended reasons. Save to `logs/1.3-tdd-red.log`.

## 2. Auto-save and Studio sync

- [x] 2.1 Implement `buildAlbumPatchBody`, `getDraftStatusLabel` and the `patchAlbum` refactor (D1, D5).
- [x] 2.2 Add the `Draft` fields and their initialisation (D2).
- [x] 2.3 Implement the end-of-run auto-save and refresh, `saveDraftMetadata`, the guarded diff-based `publishDraft` and the quiet `discardDraft` (D3).
- [x] 2.4 Add the `onWallChanged` prop and the fallback; update the card label and the `disabled` rules.
- [x] 2.5 In `CuratorStudio`: `refreshStudio`, reused in `handleEditorDeleted`, passed to `FolderDropzone` (D4).
- [x] 2.6 Run the narrow tests until green. Commit with explicit paths: `feat(studio): auto-save completed uploads as drafts and sync the preview`.

## 3. Verification & Empirical Audit

- [x] 3.1 Run the full gates (`npx vitest run`, `npx tsc --noEmit`, `npx eslint .`, `npm run build`), with `safe-test` first. Save the counts to `logs/3.1-*.log`. Confirm `routes.test.ts` is unchanged and green.
- [x] 3.2 Local dev only (`ADMIN_ENABLED=true`, `STORAGE_DRIVER=local`, local DB). Drive `/photos/admin` with Playwright:
  - Upload a 3-image fixture folder with Location set, and capture the network log. Expect one PATCH with no `status`, then the preview and album-list refetches.
  - Assert that the preview shows a `Draft` badge for the album.
  - Publish, and assert the PATCH body contains only `status`.
  - Repeat with Discard.
  - Save to `logs/3.2-studio-autosave.log` with screenshots. **Never** point this at preview or production.
- [x] 3.3 Populate `verification.md`:
  - a summary and environment;
  - an audit matrix covering every scenario;
  - resolved assumptions (including `nullableString('')`);
  - a nomenclature audit (draft against Draft card, auto-save, saved settings, Studio refresh);
  - verbatim logs.
