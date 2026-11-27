## Automated Tests
- `npx vitest run src/lib/__tests__/previewRedirects.test.ts`:
  - with `'preview'`, it returns exactly three `307` redirects with `basePath: false`, covering `/`, `/admin` and `/admin/:path*`, whose destinations start with `BASE_PATH`;
  - with `'production'`, `'development'` and `undefined`, it returns `[]`;
  - no destination hard-codes `/photos`; destinations are built from `BASE_PATH`.
- `npx vitest run`, `npx tsc --noEmit`, `npx eslint .` and `npm run build`: full regression. Includes the existing literal-`/photos` search test, if present.
- **Local build check** with `VERCEL_ENV=preview npm run build && npm start`, using `STORAGE_DRIVER=local` (no remote DB or storage), plus curl:
  - `curl -sI /` returns `307` to `/photos`;
  - `curl -sI /admin` returns `307` to `/photos/admin`;
  - `curl -sI '/admin/login?next=x'` returns `307` to `/photos/admin/login?next=x`;
  - `curl -sI /photos/admin` still returns the proxy's response.
- **The same build without `VERCEL_ENV`:** `/` and `/admin` return `404`.

## Manual Verification
1. Open the PR's Vercel preview URL with no path. The wall loads, and the address bar ends in `/photos`.
2. Open `<preview>/admin` while signed out. It lands on `/photos/admin/login`. After signing in, `/admin` lands on the Studio. This is read-only viewing: preview shares the production DB, so do not create, edit or delete anything.
3. Confirm the production site (`gregory-lazatin.com/photos`) is unchanged.
