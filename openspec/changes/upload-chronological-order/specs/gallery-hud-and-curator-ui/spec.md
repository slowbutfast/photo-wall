## ADDED Requirements

### Requirement: New album uploads default to chronological capture-time order
When the Studio **Upload** tab (`FolderDropzone`) creates a new draft album from a folder drop or a file pick, it SHALL order that album's image files by capture time, oldest first, before applying the `MAX_PHOTOS_PER_ALBUM` cap and before creating the draft.

Capture time SHALL be read from the original `File` bytes, before `prepareUploadFile` compresses or re-encodes them, using these tags in this order of preference:
1. the Exif sub-IFD's `DateTimeOriginal` (`0x9003`);
2. otherwise `DateTimeDigitized` (`0x9004`);
3. otherwise IFD0 `DateTime` (`0x0132`).

The reader SHALL support EXIF in JPEG `APP1`, PNG `eXIf`, and WebP `EXIF` chunks. Capture times SHALL be compared as local wall-clock values, ignoring `OffsetTimeOriginal`.

Ties SHALL be broken by `SubSecTimeOriginal` (`0x9291`), compared as a decimal fraction (`"5"` is `.5`, `"20"` is `.20`; a missing value counts as `.0`), then by natural filename order (numeric-aware, case-insensitive). Photos with no valid capture time SHALL follow every dated photo, in natural filename order. A malformed, truncated or all-zero (`0000:00:00 00:00:00`) timestamp SHALL count as no capture time and SHALL NOT reject or fail the upload.

Each file's position in the resulting order SHALL be the `sortOrder` sent with its upload. That position SHALL stay fixed across retries.

`+ Add Print` in the Album Editor SHALL keep appending to the end of the existing album unchanged.

#### Scenario: Folder drop uploads prints oldest-first regardless of pick order
- **WHEN** a curator drops a folder whose files arrive as `C.jpg` (`DateTimeOriginal` `2025:10:05 18:00:00`), `A.jpg` (`2025:10:05 09:00:00`) and `B.jpg` (`2025:10:05 12:30:00`)
- **THEN** the draft SHALL list `A.jpg`, `B.jpg`, `C.jpg`, the uploads SHALL send `sortOrder` `0`, `1`, `2` respectively, and the saved album SHALL render prints in that order

#### Scenario: Same-second burst shots break ties by sub-seconds, then filename
- **WHEN** three files share `DateTimeOriginal` `2025:10:05 12:00:00`: `IMG_10.jpg` with `SubSecTimeOriginal` `20`, `IMG_2.jpg` with `SubSecTimeOriginal` `50`, and `IMG_3.jpg` with no sub-seconds
- **THEN** the order SHALL be `IMG_3.jpg` (`.0`), then `IMG_10.jpg` (`.20`), then `IMG_2.jpg` (`.50`)
- **AND WHEN** two files share the same timestamp and both lack sub-seconds
- **THEN** they SHALL be ordered by natural filename order, so `IMG_2.jpg` comes before `IMG_10.jpg`

#### Scenario: Photos without a capture time follow dated photos
- **WHEN** a folder contains two dated JPEGs, plus a PNG screenshot and a JPEG with EXIF stripped (neither has a capture time)
- **THEN** the two dated JPEGs SHALL come first in capture-time order, followed by the two undated files in natural filename order, and all four SHALL upload successfully

#### Scenario: Missing DateTimeOriginal falls back to DateTimeDigitized, then DateTime
- **WHEN** a file has no `DateTimeOriginal` but has `DateTimeDigitized`, or has neither but has IFD0 `DateTime`
- **THEN** the first available tag in that order SHALL be used as its capture time

#### Scenario: Malformed EXIF degrades to undated instead of failing
- **WHEN** a file's EXIF is truncated, has an IFD offset past the end of the buffer, has a non-ASCII or wrongly shaped timestamp, or holds the all-zero placeholder
- **THEN** the reader SHALL return no capture time without throwing, and the file SHALL be ordered as undated and uploaded normally

#### Scenario: Cap keeps the earliest photos of an oversized folder
- **WHEN** a curator drops a folder of 25 dated photos in arbitrary order
- **THEN** the draft SHALL contain the 20 earliest by capture time in chronological order, and the existing overflow notice SHALL report 5 photos skipped

#### Scenario: Compressed uploads keep their chronological position
- **WHEN** a dated photo larger than 4.0 MiB is compressed by `prepareUploadFile` (which discards EXIF)
- **THEN** its `sortOrder` SHALL still reflect the capture time read from the original file

#### Scenario: Retry keeps the original position
- **WHEN** the second-oldest photo's upload fails and the curator clicks **Retry failed**
- **THEN** the retried upload SHALL send the same `sortOrder` `1`, and the album SHALL keep its chronological order

#### Scenario: Add Print still appends
- **WHEN** a curator uses `+ Add Print` in an existing album's Photos tab with a photo older than every existing print
- **THEN** the new print SHALL be appended at the end, not sorted into position
