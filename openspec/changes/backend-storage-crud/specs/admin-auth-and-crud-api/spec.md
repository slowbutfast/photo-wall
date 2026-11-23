## Purpose

Secures owner-only gallery curation with route-handler authentication, CSRF protection, an explicit multipart upload contract with server-authoritative dimensions and EXIF allowlisting, draft reservation/resume/discard, and immediate cache invalidation.

## ADDED Requirements

### Requirement: Hardened route-handler authentication and CSRF protection
Admin authentication (`GET`, `POST`, `DELETE` at `/api/admin/auth`) SHALL live inside route handlers (not middleware), rate-limit login attempts (`429 Too Many Requests`), compare passwords via SHA-256 + `timingSafeEqual`, issue an `HttpOnly`, `SameSite=Lax` (`Secure` in production) JWT cookie, reject unauthenticated mutations with `401 Unauthorized`, and reject mismatched `Origin` headers on mutating requests with `403 Forbidden`.

#### Scenario: Session status endpoint reports authentication state
- **WHEN** a client sends `GET /api/admin/auth`
- **THEN** the endpoint SHALL return `{ authenticated: true | false }` without leaking secrets

#### Scenario: Brute-force login attempts are rate-limited
- **WHEN** repeated invalid password attempts exceed the login rate limit
- **THEN** `POST /api/admin/auth` SHALL respond with `429 Too Many Requests`

#### Scenario: Unauthenticated or cross-origin mutation is rejected
- **WHEN** a request mutates `/api/admin/*` without a valid session cookie or with a mismatched `Origin` header
- **THEN** the route SHALL reject with `401 Unauthorized` or `403 Forbidden` respectively

### Requirement: Explicit multipart photo upload contract without auto-EXIF
`POST /api/admin/albums/[id]/photos` SHALL accept `multipart/form-data` fields `file` (required), `photoId` (required UUIDv7), `thumbHash` (optional), `dominantColor` (optional), and `sortOrder` (optional). The server SHALL derive `width`, `height`, and `aspectRatio` directly from the decoded image header (ignoring client dimensions), strip GPS/camera EXIF and XMP metadata from the stored file, and enforce idempotency on `photoId` + `contentHash` (`409 Conflict` if `photoId` is reused with different bytes).

#### Scenario: Uploaded photo persists no auto-extracted EXIF or GPS fields
- **WHEN** a client uploads a JPEG containing GPS and camera EXIF tags
- **THEN** the persisted photo record and public endpoints SHALL expose zero auto-extracted EXIF or GPS fields

### Requirement: Optional YouTube soundtrack extraction and manual album metadata
The admin API SHALL provide `POST /api/admin/youtube/inspect` to validate a YouTube URL, extract its 11-character `videoId`, and fetch minimal oEmbed metadata (`artist`, `title`, `durationSec`), and `PATCH /api/admin/albums/[id]` SHALL accept optional owner-entered `cameraName`, `dateLabel`, `locationLabel` (null/empty by default) and soundtrack fields (`youtubeVideoId`, `soundtrackArtist`, `soundtrackTitle`, `soundtrackDurationSec`).

#### Scenario: Invalid non-YouTube URL is rejected
- **WHEN** an admin submits a non-YouTube URL to `POST /api/admin/youtube/inspect`
- **THEN** the endpoint SHALL respond with `400 Bad Request`

#### Scenario: Retrying the same photoId with identical bytes is idempotent
- **WHEN** a client retries `POST /api/admin/albums/[id]/photos` with the same `photoId` and identical file bytes
- **THEN** the server SHALL return `200 OK` without inserting a duplicate photo row

### Requirement: Draft reservation, completion rule, and publish-time re-pack
Albums SHALL be created in `draft` status with `expectedCount` (reserving wall space), support listing/resuming/discarding drafts in the admin API, and transition to `published` via `PATCH /api/admin/albums/[id]` only when `uploadedCount === expectedCount` (or an explicit `allowPartial: true` override is passed). Publishing or changing `gridColumns` SHALL re-check neighbor bounds (auto-nudging if overlapping) and call `updateTag('wall')` for immediate read-after-write consistency.

#### Scenario: Interrupted upload stays draft and can be resumed or discarded
- **WHEN** an admin uploads 8 of 12 expected photos and does not publish
- **THEN** the album SHALL remain in `draft` status (excluded from `GET /api/wall`), appear in `GET /api/admin/albums`, and reject `PATCH` publish without `allowPartial: true`
