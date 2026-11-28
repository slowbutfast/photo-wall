## Why

Today, after an upload finishes in Curator Studio, the album exists server-side as a draft, but the curator's optional metadata (date, location, soundtrack) is only written when they click **Publish album**. The Studio preview and Exhibitions list don't update from the Upload tab at all: `publishDraft` refreshes only the public, published-only wall, and `discardDraft` refreshes nothing (research.md, Verified facts). The curator should see the draft, with its metadata, the moment the upload completes, Instagram-style, without a new button.

## What Changes

- **Auto-save.** When every file on a Draft card is `done`, after the first run or after **Retry failed uploads**, `FolderDropzone` sends one metadata `PATCH /api/admin/albums/[id]`. It carries the title and optional settings, and **no `status` key**: the album is already a draft, and omitting the status means a late auto-save can never unpublish it.
  - The card shows `Saving…` and then `Saved as draft`.
  - The notice reads `Saved <title> as draft`.
- **Saved settings.** The settings sent by the auto-save are snapshotted on the card.
- **Publish** sends `status: 'published'` plus only the fields whose Upload-form value differs from the saved settings. Edits made in Exhibitions → AlbumEditor after the auto-save are preserved.
- **Studio refresh.** `CuratorStudio` passes `onWallChanged` (the existing `manifest.refresh()` plus `loadAdminAlbums()` pair, extracted once as `refreshStudio`). `FolderDropzone` calls it:
  - after the auto-save, whether it succeeded or failed;
  - after Publish;
  - after Discard;
  - at the end of every upload run, partial runs included, because partially uploaded drafts already exist server-side.
  - Without the prop, it falls back to `refreshWall()`, so behaviour outside the Studio is unchanged.
- **Races.** Publish is a no-op while an auto-save is in flight. The check reads `draftsRef`, not render state. A card being discarded ignores a late auto-save result.
- **Status label order:** Published, Saving…, N failed, Saved as draft, Ready to publish, progress.
- **No new buttons.** Retry, Publish and Discard stay as they are.
- **No API changes.**

## Capabilities

### New Capabilities
- None.

### Modified Capabilities
- `gallery-hud-and-curator-ui`: adds the requirement "Upload auto-saves completed albums as drafts and syncs the Studio preview".

## Impact

- **Code:** `src/components/admin/FolderDropzone.tsx` and `src/components/admin/CuratorStudio.tsx`.
- **Tests:**
  - `src/components/admin/__tests__/folderDropzoneDraft.test.ts` `[NEW]`: the pure helpers;
  - `src/components/admin/__tests__/FolderDropzone.autosave.test.tsx` `[NEW]`: behaviour with mocked `fetch`.
- **APIs, DB, dependencies:** none.
- **Isolated** from the other two changes in this batch.
