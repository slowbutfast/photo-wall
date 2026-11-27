## 1. Test Scaffolding (TDD)

- [x] 1.1 Write failing `src/lib/__tests__/previewRedirects.test.ts` for "Preview deployments redirect the root into the base path": three `307` entries with `basePath: false`, `/`, `/admin` and `/admin/:path*`, destinations derived from `BASE_PATH`.
- [x] 1.2 Add failing cases for "Non-preview builds register no root redirects": `'production'`, `'development'` and `undefined` return `[]`.
- [x] 1.3 Run `npx vitest run src/lib/__tests__/previewRedirects.test.ts` and confirm it fails (module missing).

## 2. Preview Root Redirects

- [x] 2.1 Create `src/lib/previewRedirects.ts`, dependency-free with a relative import of `./basePath`, exporting `previewRootRedirects(vercelEnv: string | undefined)`.
- [x] 2.2 Wire `redirects: async () => previewRootRedirects(process.env.VERCEL_ENV)` into `next.config.ts` via a relative import. Do not touch `basePath`, `headers()` or `src/proxy.ts`.
- [x] 2.3 Re-run the targeted test and confirm it passes.

## 3. Verification & Empirical Audit

- [x] 3.1 Run the full regression suite (`npx vitest run`, `npx tsc --noEmit`, `npx eslint .`, `npm run build`) and record pass counts.
- [ ] 3.2 Local build check per `tests.md`, with `VERCEL_ENV=preview` and `STORAGE_DRIVER=local`: curl `/`, `/admin`, `/admin/login?next=x` and `/photos/admin`, then repeat without `VERCEL_ENV` and confirm `404`s. Save the output to `logs/`.
- [ ] 3.3 On the PR's Vercel preview, read-only: confirm `/` returns `307` to `/photos` and `/admin` returns `307` to `/photos/admin` (curl `-I`). This proves `VERCEL_ENV` is visible at build. Mark as pending manual if no preview is available.
- [ ] 3.4 Populate `verification.md` with the Requirement Adherence Matrix, the resolved assumptions (`VERCEL_ENV` at build, redirect-before-proxy order) and verbatim logs.
