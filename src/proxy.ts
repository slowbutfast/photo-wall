import { jwtVerify } from 'jose';
import { NextResponse, type NextRequest } from 'next/server';

import { BASE_PATH, withBase } from '@/lib/basePath';

/**
 * Single fail-closed gate for the curator surface.
 *
 * Matches `/admin/:path*` and `/api/admin/:path*` (Next prepends `basePath`, so
 * these are `/photos/admin*` and `/photos/api/admin*` at request time).
 *
 * - `ADMIN_ENABLED !== 'true'` → `404` for every matched request.
 * - `/admin/login` and `/api/admin/auth` always pass through so login works.
 * - Unauthenticated `/admin*` → redirect to `/photos/admin/login`.
 * - Unauthenticated `/api/admin/*` → `401`.
 * - Every response carries `X-Robots-Tag: noindex, nofollow`.
 *
 * `requireAdmin` / `guardAdminMutation` stay in each route handler as defense in
 * depth. The JWT constants mirror `src/lib/auth.ts`; this file must not import
 * that module because it pulls in `node:crypto` (unavailable on an edge proxy).
 */

const SESSION_COOKIE_NAME = 'photowall_session';
const SESSION_ISSUER = 'photo-wall';
const SESSION_AUDIENCE = 'photo-wall-admin';

function noindex(response: NextResponse): NextResponse {
  response.headers.set('X-Robots-Tag', 'noindex, nofollow');
  return response;
}

function relativePath(pathname: string): string {
  if (pathname === BASE_PATH) return '/';
  return pathname.startsWith(`${BASE_PATH}/`) ? pathname.slice(BASE_PATH.length) : pathname;
}

function isUnder(path: string, base: string): boolean {
  return path === base || path.startsWith(`${base}/`);
}

async function hasValidSession(token: string | undefined): Promise<boolean> {
  if (!token) return false;
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 16) return false;
  try {
    const { payload } = await jwtVerify(token, new TextEncoder().encode(secret), {
      issuer: SESSION_ISSUER,
      audience: SESSION_AUDIENCE,
    });
    return payload.role === 'admin';
  } catch {
    return false;
  }
}

function notFound(): NextResponse {
  return noindex(
    new NextResponse('Not found', {
      status: 404,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    }),
  );
}

export async function proxy(request: NextRequest): Promise<NextResponse> {
  if (process.env.ADMIN_ENABLED !== 'true') return notFound();

  const path = relativePath(request.nextUrl.pathname);

  // Login must stay reachable while signed out.
  if (isUnder(path, '/admin/login') || isUnder(path, '/api/admin/auth')) {
    return noindex(NextResponse.next());
  }

  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (await hasValidSession(token)) return noindex(NextResponse.next());

  if (isUnder(path, '/api/admin')) {
    return noindex(
      NextResponse.json({ error: 'unauthorized' }, { status: 401 }),
    );
  }

  return noindex(NextResponse.redirect(new URL(withBase('/admin/login'), request.url)));
}

export const config = {
  matcher: ['/admin/:path*', '/api/admin/:path*'],
};
