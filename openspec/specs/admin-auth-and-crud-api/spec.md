# admin-auth-and-crud-api Specification

## Purpose
Secures owner-only gallery curation with route-handler authentication, CSRF protection, an explicit multipart upload contract with server-authoritative dimensions and EXIF allowlisting, draft reservation/resume/discard, and immediate cache invalidation.
## Requirements
### Requirement: Hardened route-handler authentication and CSRF protection
Admin authentication (`GET`, `POST`, `DELETE` at `/api/admin/auth`) SHALL live inside route handlers (not middleware), rate-limit login attempts (`429 Too Many Requests`) keyed by a client identifier that trusts `X-Forwarded-For` (N hops from the right) and `X-Real-IP` only when `TRUSTED_PROXY_HOPS` is configured (returning the `'direct'` key otherwise), reject any configured `ADMIN_PASSWORD` shorter than 16 characters so it can never authenticate (returning `false` without throwing per-request), compare passwords via SHA-256 + `timingSafeEqual`, issue an `HttpOnly`, `SameSite=Lax` (`Secure` in production) JWT cookie, reject unauthenticated mutations with `401 Unauthorized`, and reject mismatched `Origin` headers on mutating requests with `403 Forbidden`.

#### Scenario: Session status endpoint reports authentication state
- **WHEN** a client sends `GET /api/admin/auth`
- **THEN** the endpoint SHALL return `{ authenticated: true | false }` without leaking secrets

#### Scenario: Brute-force login attempts are rate-limited
- **WHEN** repeated invalid password attempts exceed the login rate limit
- **THEN** `POST /api/admin/auth` SHALL respond with `429 Too Many Requests`

#### Scenario: Unauthenticated or cross-origin mutation is rejected
- **WHEN** a request mutates `/api/admin/*` without a valid session cookie or with a mismatched `Origin` header
- **THEN** the route SHALL reject with `401 Unauthorized` or `403 Forbidden` respectively

### Requirement: Explicit multipart photo upload contract with Orientation-only EXIF and DB-first idempotency
`POST /api/admin/albums/[id]/photos` SHALL accept `multipart/form-data` fields `file` (required), `photoId` (required UUIDv7), `thumbHash` (optional), `dominantColor` (optional), and `sortOrder` (optional). The server SHALL reject uploads with `409 Conflict` if the target album has `status === 'deleting'`, compute `contentHash` as SHA-256 of the **raw uploaded bytes**, check the database **before** calling storage `PUT` so an identical `(photoId, contentHash)` retry returns `200 OK` without touching storage (`409 Conflict` if `photoId` is reused with different bytes), derive `width`, `height`, and `aspectRatio` directly from the decoded image header *after* EXIF orientation 5–8 rotation, and strip all camera/GPS EXIF and XMP metadata while preserving an Orientation-only EXIF tag.

#### Scenario: Uploaded photo persists no auto-extracted EXIF or GPS fields
- **WHEN** a client uploads a JPEG containing GPS and camera EXIF tags
- **THEN** the persisted photo record and public endpoints SHALL expose zero auto-extracted EXIF or GPS fields

#### Scenario: Upload to an album in deleting state is rejected
- **WHEN** a client sends `POST /api/admin/albums/[id]/photos` for an album whose `status` is `'deleting'`
- **THEN** the server SHALL respond with `409 Conflict` before writing to storage or database

### Requirement: Optional YouTube soundtrack extraction and manual album metadata
The admin API SHALL provide `POST /api/admin/youtube/inspect` to validate a YouTube URL, extract its 11-character `videoId`, construct the oEmbed request strictly from `videoId` (never fetching arbitrary user-supplied URLs to prevent SSRF), and return `{ videoId, artistGuess, titleGuess }` (splitting `title` on `" - "`, stripping suffixes such as `"(Official Video)"`, and falling back to `author_name`). `PATCH /api/admin/albums/[id]` SHALL accept optional owner-entered `cameraName`, `dateLabel`, `locationLabel` (null/empty by default) and soundtrack fields (`youtubeVideoId`, `soundtrackArtist`, `soundtrackTitle`, `soundtrackDurationSec`, where `durationSec` is captured client-side via hidden `YT.Player.getDuration()`).

#### Scenario: Invalid or SSRF-attempt non-YouTube URL is rejected
- **WHEN** an admin submits a non-YouTube URL or private-IP URL to `POST /api/admin/youtube/inspect`
- **THEN** the endpoint SHALL respond with `400 Bad Request` without making any outbound network request

#### Scenario: Retrying the same photoId with identical bytes returns 200 without touching storage
- **WHEN** a client retries `POST /api/admin/albums/[id]/photos` with the same `photoId` and identical raw file bytes
- **THEN** the server SHALL return `200 OK` from the DB pre-check without overwriting or deleting the live storage object

### Requirement: Draft lifecycle, completion rule, and immediate tag revalidation
Albums SHALL be created in `draft` status with `expectedCount` (without reserving wall space), support listing/resuming/discarding drafts and listing/retrying `'deleting'` tombstones in the admin API (`GET /api/admin/albums`, `POST /api/admin/deletions/retry`), and transition to `published` via `PATCH /api/admin/albums/[id]` only when `uploadedCount === expectedCount` (or an explicit `allowPartial: true` override is passed). Publishing, reordering (`sortOrder`), deleting, or changing `gridColumns` SHALL call `revalidateTag('wall', { expire: 0 })` for immediate read-after-write consistency.

#### Scenario: Interrupted upload stays draft and can be resumed or discarded
- **WHEN** an admin uploads 8 of 12 expected photos and does not publish
- **THEN** the album SHALL remain in `draft` status (excluded from `GET /api/wall`), appear in `GET /api/admin/albums`, and reject `PATCH` publish without `allowPartial: true`

