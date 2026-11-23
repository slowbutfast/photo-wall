import {
  clearedSessionCookie,
  createSessionToken,
  forbiddenResponse,
  getClientKey,
  isAuthenticatedFromRequest,
  isLoginRateLimited,
  isSameOriginRequest,
  jsonResponse,
  recordFailedLogin,
  sessionCookie,
  verifyAdminPassword,
} from '@/lib/auth';

/** Reports session state without leaking credentials. */
export async function GET(request: Request): Promise<Response> {
  return jsonResponse({ authenticated: await isAuthenticatedFromRequest(request) });
}

export async function POST(request: Request): Promise<Response> {
  if (!isSameOriginRequest(request)) return forbiddenResponse();

  const clientKey = getClientKey(request);
  if (isLoginRateLimited(clientKey)) {
    return jsonResponse({ error: 'rate_limited' }, 429);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: 'invalid_body' }, 400);
  }

  const password =
    typeof body === 'object' && body !== null && typeof (body as { password?: unknown }).password === 'string'
      ? (body as { password: string }).password
      : null;

  if (!password) return jsonResponse({ error: 'invalid_body' }, 400);

  if (!verifyAdminPassword(password)) {
    recordFailedLogin(clientKey);
    return jsonResponse({ error: 'invalid_password' }, 401);
  }

  const token = await createSessionToken();
  return jsonResponse({ authenticated: true }, 200, { 'Set-Cookie': sessionCookie(token) });
}

/** Clears the HttpOnly session cookie. */
export async function DELETE(request: Request): Promise<Response> {
  if (!isSameOriginRequest(request)) return forbiddenResponse();
  return jsonResponse({ authenticated: false }, 200, {
    'Set-Cookie': clearedSessionCookie(),
  });
}
