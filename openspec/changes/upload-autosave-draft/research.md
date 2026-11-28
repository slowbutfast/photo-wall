## Source material

**Maintainer, 2026-11-28.** They pasted an implementation plan, "Auto-Save Uploaded Albums as Draft (Curator Studio)", and asked to fold it in "with your feedback on it". Its goal, verbatim:

> "Update the Curator Studio Upload flow (FolderDropzone.tsx + CuratorStudio.tsx) so that as soon as all files in an uploaded album finish uploading, it automatically saves as a draft (Instagram-style) — with no new button added — while keeping Publish album and Discard draft available on the card."

The pasted plan's functional points, verbatim:

> "1. Automatic draft persistence on upload completion: When uploadDraftFiles(albumId) finishes with all files in state === 'done' (including after clicking Retry failed uploads), FolderDropzone automatically sends PATCH /api/admin/albums/[id] with status: 'draft' and the current optional metadata (Timestamp, Geotag / Location, YouTube soundtrack fields)."
>
> "2. Immediate Studio preview & Exhibitions sync: Wire an onWallChanged callback from CuratorStudio into FolderDropzone (Promise.all([manifest.refresh(), loadAdminAlbums()])) instead of useWallStore.refreshWall() (which only fetches the public published-only /api/wall)."
>
> "3. Keep Publish album and Discard draft available: After auto-saving, the card status reads Saved as draft and retains both Publish album (which re-sends PATCH with status: 'published' plus any metadata edits made since upload) and Discard draft (which deletes the draft and refreshes the preview wall)."

It also proposed:
- `Draft.draftSaved` and `Draft.saving`;
- `buildAlbumPatchBody(title, settings, status)`;
- `getDraftStatusLabel(...)`;
- a `saveDraftMetadata` helper;
- pure-helper unit tests in `folderDropzoneDraft.test.ts`.

**Review feedback adopted into this change (planning session, 2026-11-28):**
1. The auto-save mustn't send `status: 'draft'`.
2. Publish after an auto-save mustn't overwrite edits made in Exhibitions.
3. Snapshot the settings when the auto-save happens.
4. Guard against races on `draftsRef`, not render state.
5. Refresh the preview after partial uploads too.
6. Reuse the existing refresh pair.
7. Add behavioural tests.
8. Fix the label order.

The reasoning is in proposal.md and architecture.md.

### Raised but not acted on

- **An explicit "Save draft" button.** The maintainer specified no new button.
- **Server-side auto-save,** for example the upload route persisting metadata. The upload route never sees the optional settings form, so this stays a client concern and needs no API change.
- **Snapshotting settings when the draft is created.** Considered, then replaced by a snapshot at auto-save time. Creation time would drop metadata the curator enters while files upload, which is the common flow (YouTube inspection takes a few seconds).

## Glossary

| Term | Means | Does NOT mean |
| :--- | :--- | :--- |
| **draft** (server) | An `albums` row with `status = 'draft'`. Every album is created this way by `POST /api/admin/albums` (`repository.ts:273`). | The client-side `Draft` card object in `FolderDropzone`. |
| **Draft card** | `FolderDropzone`'s local `Draft` record and its `<article className="admin-draft">`. | A server row. |
| **auto-save** | The single metadata `PATCH` that `FolderDropzone` sends, with **no `status` key**, when a Draft card's files are all `done`. | Changing status. The album is already a draft. |
| **saved settings** | The `OptionalSettings` snapshot sent by the last successful auto-save, stored on the Draft card. | The live Upload form (`settingsRef.current`). |
| **Studio refresh** | `Promise.all([manifest.refresh(), loadAdminAlbums()])` in `CuratorStudio`, which reloads the draft-aware preview manifest and the Exhibitions list. | `useWallStore.refreshWall()`, which fetches published albums only from `/api/wall`. |

## External research

None. This is internal app behaviour.

## Candidate tech

| Option | Decision | Reason | Date |
| :--- | :--- | :--- | :--- |
| Auto-save PATCH without `status` | **Adopted** | The album is already a draft. Omitting `status` makes a concurrent or late auto-save unable to demote a published album. | 2026-11-28 |
| Auto-save PATCH with `status: 'draft'` (the pasted plan) | Rejected | A late auto-save after Publish, or after publishing from Exhibitions, would silently unpublish the album. | 2026-11-28 |
| Publish re-sends the whole Upload form (the pasted plan, and today's code) | Rejected | It overwrites metadata the curator edited in Exhibitions → AlbumEditor after the auto-save. | 2026-11-28 |
| Publish sends `status: 'published'` plus only the fields that changed since the saved settings | **Adopted** | It keeps Exhibitions edits and still carries form edits made after the auto-save. | 2026-11-28 |

## Patterns adopted

- **Diff-based PATCH,** sending only changed fields. It lands in the pure `buildAlbumPatchBody`.

## Verified facts

| Claim | Value | How verified | Date | Volatility |
| :--- | :--- | :--- | :--- | :--- |
| New albums are created as `draft` | `repository.ts:273` (`status: 'draft'`) | Read the source on `5188316` | 2026-11-28 | stable |
| PATCH accepts metadata without `status`, and the completion guard runs only when the status becomes `published` | `src/app/api/admin/albums/[id]/route.ts:141-160` | Read the source | 2026-11-28 | stable |
| PATCH revalidates `wall` on every successful update | `route.ts:166` | Read the source | 2026-11-28 | stable |
| `youtubeVideoId: null` clears the soundtrack fields too | `route.ts` (the `youtubeVideoId` block) | Read the source | 2026-11-28 | stable |
| `publishDraft` refreshes only the public wall | `FolderDropzone.tsx:358` (`refreshWall()`); `refreshWall` hits `/api/wall` (published only) | Read the source | 2026-11-28 | stable |
| `discardDraft` doesn't refresh any wall | `FolderDropzone.tsx:367-382` | Read the source | 2026-11-28 | stable |
| `commitDrafts` writes `draftsRef` synchronously | `FolderDropzone.tsx:241-244` | Read the source | 2026-11-28 | stable |
| `settingsRef` is one form shared by every Draft card | `FolderDropzone.tsx:213, 228-230` | Read the source | 2026-11-28 | stable |
| The Studio already has the refresh pair | `CuratorStudio.tsx:358-361` (`handleEditorDeleted`) | Read the source | 2026-11-28 | stable |
| `<FolderDropzone />` takes no props today | `CuratorStudio.tsx:657`, `FolderDropzone.tsx:206` | Read the source | 2026-11-28 | stable |
| There's no existing `FolderDropzone` component test | `src/components/admin/__tests__/` lists only captureTime, folderReader, imageCompressor and photoOrderState | `git ls-tree` | 2026-11-28 | decays |

## Unverified assumptions

- **`nullableString('')` stores `null` for empty strings.** That would make sending an empty optional field harmless. Checking costs reading the helper in `route.ts`. The diff-based body avoids sending unchanged empty fields either way.

## Superseded claims

- *"The auto-save must send `status: 'draft'`"* (pasted plan). Superseded: the album is already a draft, and sending the status risks demotion.
- *"Publish re-sends … plus any metadata edits made since upload"* (pasted plan). Superseded by the diff against the saved settings, because a full re-send also clobbers Exhibitions edits.

## Links out

- `openspec/specs/gallery-hud-and-curator-ui/spec.md`: "Lazy-loaded Curator Drawer with resilient folder upload and soundtrack editor"
- `openspec/specs/admin-auth-and-crud-api/spec.md`: "Draft lifecycle, completion rule, and immediate tag revalidation"
