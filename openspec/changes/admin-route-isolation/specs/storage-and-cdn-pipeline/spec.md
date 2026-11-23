## ADDED Requirements

### Requirement: Payload-level JPEG APP0/APP14 validation and strict animation/arithmetic rejection
`sanitizeImage.ts` SHALL validate the payloads of retained JPEG `APP0` and `APP14` segments rather than checking marker IDs alone: retain `APP0` only when starting with `JFIF\0`, zero out `Xthumbnail`/`Ythumbnail` and truncate the `JFIF` payload to 14 bytes (dropping `JFXX` and any other `APP0` segments), and validate/reconstruct only the recognized 12-byte Adobe `APP14` structure (stripping unrecognized trailing bytes). The sanitizer SHALL reject arithmetic-coded JPEGs (`SOF` `0xC9`–`0xCF`) and animated WebP (`ANMF`) with `415 Unsupported Media Type`, and SHALL document that APNG uploads are flattened to their first frame.

#### Scenario: JPEG with JFIF thumbnail or trailing APP0/APP14 sentinel is sanitized cleanly
- **WHEN** a JPEG containing a JFIF `APP0` embedded RGB thumbnail (or `JFXX` extension) and a trailing sentinel appended to `APP14` is uploaded
- **THEN** the stored JPEG SHALL contain a 14-byte thumbnail-free `JFIF` segment (with `Xthumbnail = 0, Ythumbnail = 0`), drop `JFXX`, and strip all trailing sentinel bytes from `APP0` and `APP14`

#### Scenario: Arithmetic-coded JPEG and animated WebP are rejected with 415
- **WHEN** a client uploads an arithmetic-coded JPEG (`SOF9`–`SOF15`) or an animated WebP containing an `ANMF` chunk
- **THEN** `sanitizeImage` SHALL reject the upload with `415 Unsupported Media Type`
