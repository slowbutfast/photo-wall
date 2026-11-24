## Automated Tests

- `npx vitest run src/lib/__tests__/basePath.test.ts`: `withBase` prefixes `/api/wall`, `/textures/wall/x.webp` and `/demo`. It passes through `https://`, `http://`, `//`, `data:`, `blob:` and relative inputs unchanged. It is idempotent on `/photos`, `/photos/…` and `/photos?…`. `BASE_PATH === '/photos'`.
- `npx vitest run src/lib/__tests__/rawUrlAudit.test.ts`: a comment-stripped source scan of `src/app` (excluding `src/app/api/**`), `src/components`, `src/store` and `src/lib/dev` (excluding `__tests__`) finds zero `'…'`, `"…"` or `` `…` `` literals that start with `/api/`, `/textures/`, `/demo` or `/fonts/` and aren't the argument of `withBase(`. A second scan finds no `'/photos'` or `"/photos"` literal outside `src/lib/basePath.ts`. `src/app/globals.css` has no `url('/fonts/` and no `url("/fonts/`.
- `npx vitest run src/lib/security/__tests__/csp.test.ts`: `cdnOriginFrom` returns origin only (path stripped), and returns `null` for undefined, empty, root-relative or invalid input. The production policy contains every required directive (including `frame-ancestors 'none'`), contains no `https://www.youtube.com`, includes the CDN origin in `img-src`, has exactly youtube-nocookie in `frame-src`, and contains no `'unsafe-eval'` and no `ws:`. The dev policy adds `'unsafe-eval'` and `ws:`. With a null CDN origin, `img-src` is exactly `'self' data: blob:`.
- `npx vitest run src/lib/__tests__/auth.test.ts`: `sessionCookie` and `clearedSessionCookie` both use `photowall_session` and `Path=/photos`, never `Path=/;`. `isSameOriginRequest` accepts `Origin: https://gregory-lazatin.com` with `Host: photo-wall.vercel.app` when `TRUSTED_ORIGIN_HOSTS` lists it (with whitespace and mixed case). It rejects `https://evil.example`. Behaviour with `TRUSTED_ORIGIN_HOSTS` unset is unchanged. The existing rate-limit, `'direct'` and short-password tests still pass.
- `npx vitest run src/lib/storage/__tests__`: `getCdnBase()` returns `CDN_BASE_URL` over `BUNNY_PULL_ZONE_URL` when both are set. It falls back when `CDN_BASE_URL` is unset or `''`, and throws when neither is set. The local driver returns `/photos/api/local-uploads`. The Bunny purge URL still targets the pull zone when `CDN_BASE_URL` differs.
- `npx vitest run src/db/__tests__/connection.test.ts` (with `@libsql/client` `createClient` mocked):
  - `resolveDatabaseConfig` precedence: `DATABASE_*` beats `TURSO_*`, which beats the file default. Empty strings count as unset. With no token, `authToken` is undefined.
  - `createClient` receives `{ url, authToken }`.
  - `getDb()` clears its cache after a rejected init: on reject-then-succeed, `createClient` is called twice and the second call resolves.
  - Three concurrent `getDb()` calls before the first settles produce one `createClient` call.
  - The existing `file::memory:` test DBs still migrate.
- `npx vitest run src/lib/dev`: the fake manifest's `cdnBase` is `/photos/demo`.
- `npm run typecheck && npm run lint && npm run build`: `next.config.ts` imports `BASE_PATH` and `csp.ts` cleanly, and the build emits font assets under `.next/static/media/`. The `.nft.json` traces for `app/api/wall/route` and `app/page` list `drizzle/meta/_journal.json` and `drizzle/0000_init.sql`.
- `npx vitest run`: the full suite stays green, including the existing manifest and wall tests that assert `cdnBase` values (update those expectations to the prefixed form).

## Manual Verification

- **Subpath serving (production build)**:
  - **WHEN** you run `npm run build && npx next start -p 3111` and open `http://localhost:3111/photos?demo=4`
  - **THEN** the wall renders identically to pre-change `/?demo=4`, with textured plaster, the demo prints, placards, soundtrack thumbs and the same Helvetica/TeX Gyre Heros typography. In the network panel, every app-origin request is under `/photos/`, with none at `/api/…`, `/textures/…`, `/fonts/…` or `/demo/…`. `http://localhost:3111/` returns `404`.
- **CSP**:
  - **WHEN** you load `/photos?demo=4` on the production build, focus a print, then click a soundtrack plaque to start the YouTube iframe
  - **THEN** the response headers include `Content-Security-Policy`, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff` and `Referrer-Policy: strict-origin-when-cross-origin`, the console shows zero `Refused to …` CSP violations, and the iframe plays
- **Curator YouTube inspect under CSP**:
  - **WHEN** you sign in on the production build, open the Curator Drawer and inspect a valid YouTube URL
  - **THEN** the artist and title guesses populate, the duration field stays empty and editable, and the only console CSP violation is for `https://www.youtube.com/iframe_api`
- **Bunny images under CSP** (needs real Bunny env locally, run against `next start`):
  - **WHEN** `STORAGE_DRIVER=bunny` with the real Pull Zone values is set and `/photos` loads the real manifest
  - **THEN** photos load from the CDN origin with no CSP violations, and with `CDN_BASE_URL` set to a different host, image URLs switch to that host after a rebuild
- **Admin through a foreign Origin**:
  - **WHEN** `TRUSTED_ORIGIN_HOSTS=gregory-lazatin.com` is set and `curl -i -X POST http://localhost:3111/photos/api/admin/auth -H 'Origin: https://gregory-lazatin.com' -H 'Content-Type: application/json' -d '{"password":"<wrong>"}'` is sent
  - **THEN** the response is `401` (auth failure), not `403`. The same request with `Origin: https://evil.example` returns `403`.
- **Cookie scope**:
  - **WHEN** you log in at `/photos` on the dev server, inspect cookies, then log out
  - **THEN** `photowall_session` exists with `Path=/photos` and `HttpOnly`, and after logout it's gone
- **Vercel preview of this PR (maintainer session via the Vercel MCP, recorded in verification.md)**:
  - **WHEN** the PR preview build is `READY` and `/photos/api/wall` is fetched through the MCP (`web_fetch_vercel_url`, which handles Deployment Protection)
  - **THEN** the response is `200` with an `albums` array, the response carries CSP, X-Frame-Options, nosniff and Referrer-Policy, and `get_runtime_logs` for the deployment shows no `getDb`/migration/`_journal.json` errors
- **Production after merge (maintainer session + maintainer)**:
  - **WHEN** `https://photo-wall-phi.vercel.app/photos` loads after the merge deploy, the maintainer logs in, creates a draft album, uploads one photo under 4 MB, then deletes the album
  - **THEN** each step succeeds, the photo row is gone after the delete, and the runtime logs are clean. Then insert a photo row against a non-existent `albumId` through the Turso shell: it must be rejected if `foreign_keys` is effective remotely. Record the result either way.
- **Deployment Protection on the production alias**:
  - **WHEN** `https://photo-wall-phi.vercel.app/photos` (the rewrite destination) is requested with no Vercel session
  - **THEN** the app loads, not a Vercel login page. If a login page appears, apply the D14 fix before opening the portfolio PR.
- **Portfolio preview (post-merge infra, recorded in verification.md)**:
  - **WHEN** the portfolio PR preview proxies `/photos`
  - **THEN** `/photos`, a hard refresh on `/photos?demo=4`, textures, Bunny images, soundtrack playback and login all work, and the logged `x-forwarded-for` shape and chosen `TRUSTED_PROXY_HOPS` value are recorded
