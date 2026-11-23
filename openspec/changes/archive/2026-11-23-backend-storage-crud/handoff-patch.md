# Surgical Patch Handoff: OpenSpec Change 'backend-storage-crud' [PATCH-02]

## 1. Executive Objective & Diagnostic Feedback
- **Change Name**: `backend-storage-crud` (`openspec/changes/archive/2026-11-23-backend-storage-crud`)
- **Patch ID**: `PATCH-02`
- **Objective**: Replace metadata denylists with strict allowlists in `sanitizeImage.ts`, stop trusting `x-real-ip` without a configured proxy + enforce `ADMIN_PASSWORD >= 16` chars in `auth.ts`, and align Curator upload format filters (`JPEG`/`PNG`/`WebP` only).
- **Feedback & Diagnostic Trace**:
  ```
  1. [src/lib/upload/sanitizeImage.ts:L304-L328, L383-L408, L432-L490] JPEG filter is a denylist and keeps APP11 (JUMBF/C2PA) which can carry GPS assertions; PNG/WebP use denylists too, and WebP VP8X leaves EXIF (0x08) / XMP (0x04) flag bits set.
     Fix:
     - JPEG allowlist: keep APP0 (0xe0), APP2 (0xe2) ONLY when ICC, APP14 (0xee), plus DQT (0xdb), DHT (0xc4), DRI (0xdd), SOS (0xda), SOFn (0xc0..0xcf excl c4/c8/cc). Drop all other APPn & COM. Add test planting APP11.
     - PNG allowlist: keep critical chunks (IHDR, PLTE, IDAT, IEND) + ancillary allowlist (iCCP, sRGB, gAMA, cHRM, pHYs, tRNS, cICP), dropping caBX and metadata chunks.
     - WebP allowlist: keep only VP8 , VP8L, VP8X, ALPH, ANIM, ANMF, ICCP, and clear EXIF (0x08) + XMP (0x04) bits in VP8X flags.
  2. [src/lib/auth.ts:L35-L39, L54-L66] x-real-ip is still trusted when TRUSTED_PROXY_HOPS is unset, and ADMIN_PASSWORD has no minimum length check.
     Fix:
     - Read x-real-ip ONLY when trustedProxyHops() !== null; return 'direct' otherwise.
     - Require ADMIN_PASSWORD.length >= 16 in verifyAdminPassword (returning false / throwing in config check if shorter).
  3. [src/components/admin/folderReader.ts:L45-L57, FolderDropzone.tsx:L437-L438] Curator accepts GIF, AVIF, HEIC/HEIF, BMP, TIFF while server rejects them with 415.
     Fix: Restrict IMAGE_EXTENSIONS and handleFileInput filter to JPEG, PNG, and WebP so unsupported formats are cleanly reported as skipped.
  ```
- **Root Cause Analysis**: Denylist metadata filtering left `APP11`/`caBX` open, `getClientKey` fell back to `x-real-ip` without proxy trust, and client dropzone filters were not updated after AVIF was switched to `415`.

## 2. Strict Target Context Map
| File Path (relative to repo root) | Target Lines | Modification Summary |
|---|---|---|
| `src/lib/upload/sanitizeImage.ts` | `L304-L328`, `L383-L408`, `L432-L490` | Switch JPEG, PNG, and WebP to strict allowlists and clear WebP `VP8X` EXIF/XMP flags (`& ~0x0c`). |
| `src/lib/auth.ts` | `L35-L39`, `L54-L66` | Enforce `ADMIN_PASSWORD.length >= 16`; read `x-real-ip` only when `TRUSTED_PROXY_HOPS` is set. |
| `src/components/admin/folderReader.ts` | `L45-L57` | Restrict `IMAGE_EXTENSIONS` to `jpg`, `jpeg`, `png`, `webp`. |
| `src/components/admin/FolderDropzone.tsx` | `L437-L439` | Restrict `handleFileInput` filter (and file input `accept` if present) to `jpeg`, `png`, `webp`. |
| `src/lib/upload/__tests__/sanitizeImage.test.ts`, `src/lib/__tests__/auth.test.ts`, `src/components/admin/__tests__/folderReader.test.ts` | Test suites | Add reproducing tests for `APP11` stripping, `caBX` stripping, WebP `VP8X` flag clearing, `x-real-ip` untrusted fallback, `< 16` char `ADMIN_PASSWORD` rejection, and `folderReader` skipping `.heic`/`.avif`/`.gif`. |

## 3. Blast Radius & Invariant Guardrails
- **STRICT BLAST RADIUS**: Modify ONLY the lines and files specified in the Target Context Map. Do NOT touch R3F wall files (`InfiniteWallShader.tsx`, `SoundtrackOverlay.tsx`, etc.) — `dom-wall-engine` replaces them after PR #1 merges.
- **FORBIDDEN**:
  - Do NOT refactor surrounding working code.
  - Do NOT modify `.env` or credential files.
  - Note: Check existing `auth.test.ts` / `routes.test.ts` test fixtures — if any test uses a short dummy `ADMIN_PASSWORD` (`< 16` chars), update that test fixture's password to `>= 16` chars.
- **INVARIANTS TO PRESERVE**: All 182 existing tests MUST continue to pass.

## 4. Visual & UI Impact
Minimal Curator UI alignment only: unsupported image types (`.heic`, `.avif`, `.gif`, `.bmp`, `.tiff`) are reported in the existing skipped-files notice instead of failing at upload.

## 5. Reproduction & Verification Protocol
1. **Reproduce First**: Run `npx vitest run src/lib/upload/__tests__/sanitizeImage.test.ts src/lib/__tests__/auth.test.ts src/components/admin/__tests__/folderReader.test.ts`. Confirm newly added reproducing tests fail.
2. **Apply Minimal Fix**: Make targeted edits in mapped files.
3. **Verify Fix**: Re-run `npx vitest run src/lib/upload/__tests__/sanitizeImage.test.ts src/lib/__tests__/auth.test.ts src/components/admin/__tests__/folderReader.test.ts`. Confirm PASS.
4. **Full Regression Suite**: Run `npx vitest run && npm run typecheck && npm run lint`. Confirm 100% clean passes.

## 6. Surgical Patch Checklist
- [ ] P02.1 Add and run reproducing tests for `APP11`, `caBX`, WebP `VP8X` flags, `x-real-ip`, `ADMIN_PASSWORD >= 16`, and `folderReader` `jpg/png/webp` filter.
- [ ] P02.2 Implement minimal fixes in `sanitizeImage.ts`, `auth.ts`, `folderReader.ts`, and `FolderDropzone.tsx`.
- [ ] P02.3 Re-run targeted tests and confirm PASS.
- [ ] P02.4 Run full regression suite (`npx vitest run && npm run typecheck && npm run lint`) and confirm zero regressions.
- [ ] P02.5 Update `openspec/changes/archive/2026-11-23-backend-storage-crud/tasks.md` checkboxes to `- [x]`, update `verification.md`, and mark `PATCH-02` `RESOLVED` in `patch.md`.
