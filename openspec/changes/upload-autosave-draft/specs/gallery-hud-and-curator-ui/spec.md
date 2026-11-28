## ADDED Requirements

### Requirement: Upload auto-saves completed albums as drafts and syncs the Studio preview
**Auto-save.** When an upload run (initial or retry) of a Draft card ends without cancellation and every file is `done`, `FolderDropzone` SHALL send exactly one `PATCH /api/admin/albums/[id]`, with these properties:
- **body:** the album title and the optional settings (camera, date, location, soundtrack artist, title and duration, and `youtubeVideoId` when present) from the Upload form at that moment;
- **no `status` key;**
- **not sent again** for that card unless a later run completes after new files were retried.

**Card state during the auto-save.**
- While the request is in flight, the card SHALL show `Saving…`, and Publish SHALL be a no-op. That guard SHALL read the synchronously updated `draftsRef`.
- On success, the card SHALL show `Saved as draft`, the notice SHALL read `Saved <title> as draft`, and the sent settings SHALL be stored on the card as its **saved settings**.
- On failure, the card SHALL show the error and keep Publish and Discard available.

**Publish.** Publish SHALL send:
- `status: 'published'`;
- the title, if it changed;
- only the optional fields whose current Upload-form value differs from the saved settings.

Before any successful auto-save, Publish SHALL send all the optional fields, as it does today.

**Studio refresh.** `FolderDropzone` SHALL accept an optional `onWallChanged` prop and call it after each of these:
- every auto-save attempt;
- a successful Publish;
- every Discard;
- the end of every upload run that wasn't cancelled.

`CuratorStudio` SHALL pass a callback running `manifest.refresh()` and `loadAdminAlbums()` concurrently. Without the prop, `FolderDropzone` SHALL call `useWallStore.refreshWall()`.

**Discard.** A card that's being discarded SHALL ignore any later auto-save result.

**Status label precedence:**
1. `Published`
2. `Saving…`
3. `<n> failed`
4. `Saved as draft`
5. `Ready to publish`
6. `<done>/<total>`

**No new buttons.** The card SHALL show no new buttons. Retry failed uploads, Publish album and Discard draft keep their current visibility rules.

#### Scenario: Completed upload appears on the Studio preview as a draft with its metadata
- **WHEN** a curator fills in Location `Kyoto` on the Upload tab, drops a 6-photo folder, and all 6 uploads succeed
- **THEN** exactly one PATCH SHALL be sent with `locationLabel: 'Kyoto'` and no `status` key, the card SHALL read `Saved as draft`, and after `onWallChanged` resolves, the album SHALL appear on the Studio preview wall with a dashed mat and `Draft` badge and in Exhibitions under drafts

#### Scenario: Partial upload still shows on the preview without auto-saving metadata
- **WHEN** 5 of 6 uploads succeed and 1 fails
- **THEN** no metadata PATCH SHALL be sent, `onWallChanged` SHALL be called once at the end of the run, and the card SHALL read `1 failed` with Retry failed uploads and Discard draft visible

#### Scenario: Retry completes the album and triggers the auto-save
- **WHEN** the curator clicks Retry failed uploads and the remaining file succeeds
- **THEN** exactly one metadata PATCH without `status` SHALL be sent, and the card SHALL read `Saved as draft`

#### Scenario: Publishing during an auto-save is ignored
- **WHEN** Publish is triggered while the auto-save PATCH is still pending
- **THEN** no publish PATCH SHALL be sent until the auto-save settles, and the album SHALL never be sent `status: 'draft'`

#### Scenario: Publish keeps edits made in Exhibitions
- **WHEN** after the auto-save the curator changes the album's location to `Osaka` in Exhibitions → AlbumEditor, leaves the Upload form unchanged, and clicks Publish album on the upload card
- **THEN** the publish PATCH SHALL contain `status: 'published'` and SHALL NOT contain `locationLabel`, so `Osaka` is kept

#### Scenario: Publish carries Upload-form edits made after the auto-save
- **WHEN** after the auto-save the curator changes the Upload form's Date to `Spring 2026` and clicks Publish album
- **THEN** the publish PATCH SHALL contain `status: 'published'` and `dateLabel: 'Spring 2026'`, and no other unchanged optional field

#### Scenario: Discard removes the draft from the preview
- **WHEN** the curator clicks Discard draft on an auto-saved card
- **THEN** `DELETE /api/admin/albums/[id]` SHALL be sent, the card SHALL be removed, `onWallChanged` SHALL be called, and the album SHALL disappear from the Studio preview and Exhibitions

#### Scenario: Discard during an auto-save stays quiet
- **WHEN** Discard draft is clicked while the auto-save PATCH is pending, and that PATCH later fails because the album is tombstoned
- **THEN** no error SHALL be shown, and no card SHALL reappear
