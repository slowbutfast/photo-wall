import { createHash, timingSafeEqual } from 'node:crypto';

import { SignJWT, jwtVerify } from 'jose';

export const SESSION_COOKIE_NAME = 'pw_admin_session';
export const SESSION_MAX_AGE_SEC = 60 * 60 * 24 * 7;
export const LOGIN_RATE_LIMIT = 5;
export const LOGIN_RATE_WINDOW_MS = 60_000;
/** Global failed-login ceiling so spoofed per-client keys cannot bypass limits. */
export const GLOBAL_LOGIN_RATE_LIMIT = 50;

const SESSION_ISSUER = 'photo-wall';
const SESSION_AUDIENCE = 'photo-wall-admin';

interface RateLimitBucket {
  count: number;
  resetAt: number;
}

const loginAttempts = new Map<string, RateLimitBucket>();
const globalLoginAttempts: RateLimitBucket = { count: 0, resetAt: 0 };

export function hashPassword(password: string): string {
  return createHash('sha256').update(password, 'utf8').digest('hex');
}

/** Constant-time comparison that never throws on length mismatches. */
export function constantTimeEquals(left: string, right: string): boolean {
  const leftBytes = Buffer.from(left, 'utf8');
  const rightBytes = Buffer.from(right, 'utf8');
  if (leftBytes.length !== rightBytes.length) return false;
  return timingSafeEqual(leftBytes, rightBytes);
}

export function verifyAdminPassword(candidate: string): boolean {
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected || candidate.length === 0) return false;
  return constantTimeEquals(hashPassword(candidate), hashPassword(expected));
}

export function resetLoginRateLimits(): void {
  loginAttempts.clear();
  globalLoginAttempts.count = 0;
  globalLoginAttempts.resetAt = 0;
}

function trustedProxyHops(): number | null {
  const raw = process.env.TRUSTED_PROXY_HOPS;
  if (!raw) return null;
  const hops = Number(raw);
  return Number.isInteger(hops) && hops > 0 ? hops : null;
}

export function getClientKey(request: Request): string {
  const hops = trustedProxyHops();
  if (hops !== null) {
    const forwarded = request.headers.get('x-forwarded-for');
    if (forwarded) {
      const parts = forwarded.split(',').map((part) => part.trim());
      const candidate = parts[parts.length - hops];
      if (candidate) return candidate;
    }
  }
  const realIp = request.headers.get('x-real-ip');
  return realIp && realIp.trim().length > 0 ? realIp.trim() : 'unknown';
}

function globalCeilingReached(now: number): boolean {
  if (globalLoginAttempts.resetAt <= now) return false;
  return globalLoginAttempts.count >= GLOBAL_LOGIN_RATE_LIMIT;
}

export function isLoginRateLimited(key: string, now = Date.now()): boolean {
  if (globalCeilingReached(now)) return true;

  const bucket = loginAttempts.get(key);
  if (!bucket) return false;
  if (bucket.resetAt <= now) {
    loginAttempts.delete(key);
    return false;
  }
  return bucket.count >= LOGIN_RATE_LIMIT;
}

export function recordFailedLogin(key: string, now = Date.now()): void {
  if (globalLoginAttempts.resetAt <= now) {
    globalLoginAttempts.count = 1;
    globalLoginAttempts.resetAt = now + LOGIN_RATE_WINDOW_MS;
  } else {
    globalLoginAttempts.count += 1;
  }

  const bucket = loginAttempts.get(key);
  if (!bucket || bucket.resetAt <= now) {
    loginAttempts.set(key, { count: 1, resetAt: now + LOGIN_RATE_WINDOW_MS });
    return;
  }
  bucket.count += 1;
}

function getAuthSecret(): Uint8Array {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error('AUTH_SECRET must be configured with at least 16 characters');
  }
  return new TextEncoder().encode(secret);
}

export async function createSessionToken(): Promise<string> {
  return new SignJWT({ role: 'admin' })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setIssuer(SESSION_ISSUER)
    .setAudience(SESSION_AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE_SEC}s`)
    .sign(getAuthSecret());
}

export async function verifySessionToken(token: string): Promise<boolean> {
  if (!token) return false;
  try {
    const { payload } = await jwtVerify(token, getAuthSecret(), {
      issuer: SESSION_ISSUER,
      audience: SESSION_AUDIENCE,
    });
    return payload.role === 'admin';
  } catch {
    return false;
  }
}

export function readCookie(request: Request, name: string): string | null {
  const header = request.headers.get('cookie');
  if (!header) return null;
  for (const part of header.split(';')) {
    const separator = part.indexOf('=');
    if (separator === -1) continue;
    if (part.slice(0, separator).trim() !== name) continue;
    return decodeURIComponent(part.slice(separator + 1).trim());
  }
  return null;
}

export async function isAuthenticatedFromRequest(request: Request): Promise<boolean> {
  const token = readCookie(request, SESSION_COOKIE_NAME);
  if (!token) return false;
  return verifySessionToken(token);
}

function allowedHosts(request: Request): string[] {
  const hosts = new Set<string>();
  const forwarded = request.headers.get('x-forwarded-host');
  if (forwarded) {
    for (const host of forwarded.split(',')) {
      const trimmed = host.trim();
      if (trimmed) hosts.add(trimmed.toLowerCase());
    }
  }
  const host = request.headers.get('host');
  if (host) hosts.add(host.toLowerCase());
  try {
    hosts.add(new URL(request.url).host.toLowerCase());
  } catch {
    // Ignore malformed request URLs.
  }
  return [...hosts];
}

/**
 * CSRF guard: a present `Origin` must match the request Host (or the
 * `x-forwarded-host` set by a reverse proxy). Requests without `Origin`
 * (same-origin navigations, curl, tests) are allowed.
 */
export function isSameOriginRequest(request: Request): boolean {
  const origin = request.headers.get('origin');
  if (!origin) return true;
  let originHost: string;
  try {
    originHost = new URL(origin).host.toLowerCase();
  } catch {
    return false;
  }
  return allowedHosts(request).includes(originHost);
}

export function sessionCookie(token: string): string {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  return `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_MAX_AGE_SEC}${secure}`;
}

export function clearedSessionCookie(): string {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  return `${SESSION_COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT${secure}`;
}

export function jsonResponse(body: unknown, status = 200, headers?: HeadersInit): Response {
  return Response.json(body, { status, headers });
}

export function unauthorizedResponse(): Response {
  return jsonResponse({ error: 'unauthorized' }, 401);
}

export function forbiddenResponse(): Response {
  return jsonResponse({ error: 'forbidden' }, 403);
}

/** Returns a 401 response when the session cookie is missing/invalid. */
export async function requireAdmin(request: Request): Promise<Response | null> {
  if (await isAuthenticatedFromRequest(request)) return null;
  return unauthorizedResponse();
}

/** Auth + Origin CSRF guard for mutating admin routes. */
export async function guardAdminMutation(request: Request): Promise<Response | null> {
  if (!isSameOriginRequest(request)) return forbiddenResponse();
  return requireAdmin(request);
}
