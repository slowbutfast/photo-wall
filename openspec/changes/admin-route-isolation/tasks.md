## 1. Test Scaffolding (TDD)

- [ ] 1.1 Scaffold failing Vitest unit tests in `src/__tests__/proxy.test.ts` (fail-closed `ADMIN_ENABLED !== 'true'` → `404` across `/admin` and all `/api/admin/*` GET/POST/PATCH/DELETE routes; pass-through on `'true'`).
- [ ] 1.2 Scaffold failing Vitest tests in `src/app/api/__tests__/wallPreview.test.ts` (`401` unauthenticated; published + draft albums excluding `'deleting'` when authenticated) and `src/app/admin/__tests__/adminPage.test.tsx` / `src/components/hud/__tests__/GalleryHud.test.tsx` (`/admin` `notFound()` when disabled, server login vs Curator shell, `robots: noindex`, zero lock icon on public `/`).
- [ ] 1.3 Run `npx vitest run` on the newly scaffolded tests to confirm they fail before implementation.

## 2. Fail-Closed Proxy Gate & Admin Wall-Preview Endpoint

- [ ] 2.1 Implement `src/proxy.ts` matching `['/admin', '/admin/:path*', '/api/admin/:path*']` with strict `process.env.ADMIN_ENABLED === 'true'` check returning `404 Not Found` otherwise, until `proxy.test.ts` passes.
- [ ] 2.2 Implement `getAdminWallPreview()` in `src/lib/manifest.ts` and `src/app/api/admin/wall-preview/route.ts` (`requireAdmin`, returning published + draft albums via `computeWallGridPositions`) until `wallPreview.test.ts` passes.

## 3. Read-Only Public `/` & Dynamic Server-Gated `/admin` Route

- [ ] 3.1 Update `src/components/hud/GalleryHud.tsx`, `src/components/PhotoWallApp.tsx`, `src/components/wall/useWallManifest.ts`, and `src/app/page.tsx` so `/` accepts `initialManifest` + `manifestUrl="/api/wall"`, removes the lock icon, `GET /api/admin/auth` mount call, and `AdminDrawer` import completely.
- [ ] 3.2 Implement `src/components/admin/AdminLoginForm.tsx`, `src/components/admin/AdminWallApp.tsx` (passing `manifestUrl="/api/admin/wall-preview"`, `onOpenCurator`, `AdminDrawer`, and client-local Lighting Preview), and `src/app/admin/page.tsx` (`export const dynamic = 'force-dynamic'`, `robots: { index: false, follow: false }`, server `ADMIN_ENABLED` + session cookie check) until `adminPage.test.tsx` and `GalleryHud.test.tsx` pass.

## 4. Verification & Empirical Audit

- [ ] 4.1 Run full regression suite (`npx vitest run`, `npm run typecheck`, `npm run lint`, `npm run build`) and confirm `/` has zero `AdminDrawer` chunks and `/admin` is marked dynamic (`ƒ`).
- [ ] 4.2 Execute manual verification (clean `/` network trace, `ADMIN_ENABLED=false` `404` checks, `/admin` login → live draft preview) and populate `openspec/changes/admin-route-isolation/verification.md`.
