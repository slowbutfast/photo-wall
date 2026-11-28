## Automated Tests

Runner: `npx vitest run`. Try `safe-test` first, and fall back to the direct serialized command if it aborts on WebAssembly.

- **`npx vitest run src/components/admin/__tests__/folderDropzoneDraft.test.ts` `[NEW]`:** pure helpers.
  - **`buildAlbumPatchBody`:**
    - `publish: false` never contains `status`.
    - `publish: true` contains `status: 'published'`.
    - `since: null` emits every optional field, and `youtubeVideoId` only when `videoId` is truthy.
    - With `since` equal to the current settings, it emits no optional fields.
    - A changed `dateLabel` alone emits only `dateLabel`.
    - `videoId` going from `'abcdefghijk'` to `null` emits `youtubeVideoId: null`.
    - `title` is emitted only when `titleSince` is null or different.
  - **`getDraftStatusLabel`:** the precedence table from the spec, one case per row. It includes a failed-after-saved case, which must give `1 failed`.
- **`npx vitest run src/components/admin/__tests__/FolderDropzone.autosave.test.tsx` `[NEW]`:** behaviour.
  - **Setup:** jsdom with `@testing-library/react` (check that it's already a dev dependency; if not, drive the component with `react-dom/client` and `act`, and **don't** add a dependency).
  - **Mocks:**
    - `fetch` for `POST /api/admin/albums`, the photo uploads and `PATCH` / `DELETE`;
    - the upload helper module (`prepareUploadFile` / XHR), so files complete deterministically;
    - `onWallChanged` as a spy.
  - **Cases:**
    - All files succeed: exactly one PATCH with no `status`, then `onWallChanged`, and the label `Saved as draft`.
    - One file fails: no PATCH, `onWallChanged` called once, label `1 failed`. Retry succeeds: one PATCH, label `Saved as draft`.
    - Publish clicked while the auto-save PATCH is pending (a deferred promise): no second PATCH until it resolves, and no request ever has `status: 'draft'`.
    - After an auto-save, the form's date is edited, then Publish: the body is `{ status: 'published', dateLabel: … }` only.
    - After an auto-save, Publish with an unchanged form: the body is `{ status: 'published' }` only.
    - Discard while the auto-save is pending, and the PATCH then rejects: no error text, the card is gone, `onWallChanged` is called.
    - Without the `onWallChanged` prop: the `useWallStore.refreshWall` spy is called instead.
- **API regression:** `npx vitest run src/app/api/__tests__/routes.test.ts` stays green, with no edits.
- **Full gates:** `npx vitest run`, `npx tsc --noEmit`, `npx eslint .`, `npm run build`.

## Manual Verification

Use local dev only: `ADMIN_ENABLED=true`, `STORAGE_DRIVER=local`, local DB. **Never** use preview or production, which share the production Turso DB and Bunny storage.

- **Auto-save:**
  - **WHEN** you open `/photos/admin`, go to Upload, enter Location `Kyoto`, and drop a small folder.
  - **THEN** after the last file finishes, the card reads `Saving…` and then `Saved as draft`, and the notice reads `Saved <title> as draft`. No new button appears.
  - Within a second, the album shows on the Wall Preview with a dashed mat and the `Draft` badge, and under drafts in Exhibitions with Location `Kyoto`.
- **Exhibitions edit survives Publish:**
  - **WHEN** you change the location to `Osaka` in Exhibitions → editor and save, then click Publish album on the Upload card.
  - **THEN** the album publishes with `Osaka`.
- **Discard:**
  - **WHEN** you click Discard draft on an auto-saved card.
  - **THEN** the card disappears, and the album disappears from the Wall Preview and Exhibitions.
- **Partial:**
  - **WHEN** an upload has a failure (simulate one by stopping the dev server mid-upload, or by dropping an unsupported file that passes the reader).
  - **THEN** the partial draft appears on the preview, the card shows `n failed`, and Retry completes it and auto-saves.
