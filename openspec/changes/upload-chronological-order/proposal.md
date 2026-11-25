## Why

A new album's print order is whatever order the browser handed back the dropped or picked files. That's the `readEntries()` page order, or the `<input type="file">` order (research: Verified facts rows 1–2). On most systems that roughly follows filenames. Once a folder mixes devices, edited exports or renamed files, the wall starts the album out of sequence, and the curator has to drag every print back into place by hand. Every camera already records when each photo was taken, so the obvious default is to use that.

## What Changes

- Before a new album draft is created, the Upload tab orders each folder's image files by **capture time**, oldest first. Capture time is read from the **original file**'s EXIF, before `prepareUploadFile` compresses or re-encodes it.
  - Ties on the same second are broken by `SubSecTimeOriginal`, then by **natural filename order**.
  - **Undated photos** go after all dated ones, in natural filename order. Nothing is rejected, and a malformed tag never fails the upload.
- The existing 20-photo cap applies **after** sorting, so an oversized folder keeps its 20 earliest photos. The overflow notice no longer depends on the order the files happened to arrive in.
- The resulting order is sent through the existing per-file `sortOrder` form field. The server, DB schema and upload API are unchanged.
- `+ Add Print` in the Album Editor is unchanged. It still appends to the end of an existing album.
- There is no new UI and no new dependency.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `gallery-hud-and-curator-ui`: adds a requirement that a **new album upload** from the Studio's Upload tab starts in chronological capture-time order, with defined tie-break and undated rules.

## Impact

- **Code:**
  - `src/components/admin/captureTime.ts` (new). A pure EXIF capture-time reader for JPEG, PNG `eXIf` and WebP `EXIF`, plus `orderByCaptureTime`.
  - `src/components/admin/FolderDropzone.tsx` (`beginUpload`). Orders each group before `splitAlbumCap`.
  - `src/components/admin/__tests__/captureTime.test.ts` (new).
- **APIs / DB:** none. `POST /api/admin/albums/[id]/photos` already honours `sortOrder` (`route.ts:127-133`).
- **Dependencies:** none (`exifr` was rejected; see research Candidate tech).
- **Performance:** one extra `File.slice(0, 256 KiB).arrayBuffer()` per JPEG or PNG before the draft is created. WebP is read in full, which is bounded by the 20-file cap.
- **Existing albums:** untouched. Nothing re-sorts their stored `sortOrder`.
