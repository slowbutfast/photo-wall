import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  GLOBAL_LOGIN_RATE_LIMIT,
  LOGIN_RATE_LIMIT,
  MIN_ADMIN_PASSWORD_LENGTH,
  SESSION_COOKIE_NAME,
  clearedSessionCookie,
  constantTimeEquals,
  createSessionToken,
  getClientKey,
  hashPassword,
  isLoginRateLimited,
  isSameOriginRequest,
  recordFailedLogin,
  resetLoginRateLimits,
  sessionCookie,
  verifyAdminPassword,
  verifySessionToken,
} from '@/lib/auth';

const ADMIN_PASSWORD_FIXTURE = 'test-password-1234';

describe('password hashing', () => {
  it('computes a deterministic SHA-256 hex digest', () => {
    expect(hashPassword('test-password')).toBe(
      'c638833f69bbfb3c267afa0a74434812436b8f08a81fd263c6be6871de4f1265',
    );
  });
});

describe('constantTimeEquals', () => {
  it('returns true for equal digests', () => {
    expect(constantTimeEquals('abc123', 'abc123')).toBe(true);
  });

  it('returns false for different digests of equal length', () => {
    expect(constantTimeEquals('abc123', 'abc124')).toBe(false);
  });

  it('returns false instead of throwing for length mismatches', () => {
    expect(constantTimeEquals('short', 'a-much-longer-value')).toBe(false);
    expect(constantTimeEquals('', 'value')).toBe(false);
  });
});

describe('verifyAdminPassword', () => {
  function withAdminPassword(value: string | undefined, fn: () => void): void {
    const previous = process.env.ADMIN_PASSWORD;
    if (value === undefined) delete process.env.ADMIN_PASSWORD;
    else process.env.ADMIN_PASSWORD = value;
    try {
      fn();
    } finally {
      if (previous === undefined) delete process.env.ADMIN_PASSWORD;
      else process.env.ADMIN_PASSWORD = previous;
    }
  }

  it('requires a minimum configured password length of 16 characters', () => {
    expect(MIN_ADMIN_PASSWORD_LENGTH).toBe(16);
    expect(ADMIN_PASSWORD_FIXTURE.length).toBeGreaterThanOrEqual(MIN_ADMIN_PASSWORD_LENGTH);
  });

  it('accepts the configured ADMIN_PASSWORD', () => {
    expect(verifyAdminPassword(ADMIN_PASSWORD_FIXTURE)).toBe(true);
  });

  it('rejects any other password', () => {
    expect(verifyAdminPassword('wrong-password')).toBe(false);
    expect(verifyAdminPassword('')).toBe(false);
  });

  it('rejects a configured password shorter than the minimum without throwing', () => {
    withAdminPassword('short-password', () => {
      expect(verifyAdminPassword('short-password')).toBe(false);
    });
  });

  it('rejects any candidate when ADMIN_PASSWORD is unset', () => {
    withAdminPassword(undefined, () => {
      expect(verifyAdminPassword(ADMIN_PASSWORD_FIXTURE)).toBe(false);
    });
  });
});

describe('login rate limiting', () => {
  beforeEach(() => {
    resetLoginRateLimits();
  });

  it(`blocks an address after ${LOGIN_RATE_LIMIT} failed attempts`, () => {
    const key = '203.0.113.7';

    expect(isLoginRateLimited(key)).toBe(false);
    for (let attempt = 0; attempt < LOGIN_RATE_LIMIT; attempt += 1) {
      recordFailedLogin(key);
    }

    expect(isLoginRateLimited(key)).toBe(true);
    expect(isLoginRateLimited('203.0.113.8')).toBe(false);
  });

  it(`enforces a global ceiling of ${GLOBAL_LOGIN_RATE_LIMIT} failures across distinct keys`, () => {
    for (let attempt = 0; attempt < GLOBAL_LOGIN_RATE_LIMIT - 1; attempt += 1) {
      recordFailedLogin(`spoofed-key-${attempt}`);
    }
    expect(isLoginRateLimited('spoofed-key-fresh')).toBe(false);

    recordFailedLogin('spoofed-key-last');
    // A brand-new (spoofed) key is still blocked by the global ceiling.
    expect(isLoginRateLimited('spoofed-key-after-ceiling')).toBe(true);
  });
});

describe('client key extraction', () => {
  function withTrustedProxyHops(value: string | undefined, fn: () => void): void {
    const previous = process.env.TRUSTED_PROXY_HOPS;
    if (value === undefined) delete process.env.TRUSTED_PROXY_HOPS;
    else process.env.TRUSTED_PROXY_HOPS = value;
    try {
      fn();
    } finally {
      if (previous === undefined) delete process.env.TRUSTED_PROXY_HOPS;
      else process.env.TRUSTED_PROXY_HOPS = previous;
    }
  }

  function request(headers: Record<string, string>): Request {
    return new Request('https://gallery.test/api/admin/auth', {
      method: 'POST',
      headers,
    });
  }

  it('ignores client-supplied headers when TRUSTED_PROXY_HOPS is unset', () => {
    withTrustedProxyHops(undefined, () => {
      expect(
        getClientKey(
          request({
            'x-forwarded-for': '203.0.113.9, 10.0.0.1',
            'x-real-ip': '10.0.0.5',
          }),
        ),
      ).toBe('direct');

      expect(getClientKey(request({ 'x-real-ip': '10.0.0.5' }))).toBe('direct');
      expect(getClientKey(request({ 'x-forwarded-for': '203.0.113.9' }))).toBe('direct');
      expect(getClientKey(request({}))).toBe('direct');
    });
  });

  it('uses x-real-ip only when proxy hops are configured and XFF is missing/too short', () => {
    withTrustedProxyHops('2', () => {
      expect(getClientKey(request({ 'x-real-ip': '10.0.0.9' }))).toBe('10.0.0.9');
      expect(
        getClientKey(
          request({
            'x-forwarded-for': '198.51.100.23',
            'x-real-ip': '10.0.0.9',
          }),
        ),
      ).toBe('10.0.0.9');
      expect(getClientKey(request({}))).toBe('direct');
    });
  });

  it('takes the entry N hops from the right when TRUSTED_PROXY_HOPS is valid', () => {
    const headers = { 'x-forwarded-for': '198.51.100.23, 10.1.1.1, 10.1.1.2' };

    withTrustedProxyHops('2', () => {
      expect(getClientKey(request(headers))).toBe('10.1.1.1');
    });

    withTrustedProxyHops('1', () => {
      expect(getClientKey(request(headers))).toBe('10.1.1.2');
    });
  });

  it('falls back to the socket address when the header has too few hops', () => {
    withTrustedProxyHops('5', () => {
      expect(
        getClientKey(
          request({
            'x-forwarded-for': '198.51.100.23',
            'x-real-ip': '10.0.0.9',
          }),
        ),
      ).toBe('10.0.0.9');
    });
  });

  it('ignores malformed TRUSTED_PROXY_HOPS values', () => {
    for (const value of ['0', '-1', 'abc', '2.5']) {
      withTrustedProxyHops(value, () => {
        expect(
          getClientKey(request({ 'x-forwarded-for': '203.0.113.9', 'x-real-ip': '10.0.0.5' })),
        ).toBe('direct');
      });
    }
  });
});

describe('Origin CSRF protection', () => {
  it('allows requests without an Origin header (same-origin navigations)', () => {
    const request = new Request('https://gallery.test/api/admin/albums', {
      method: 'POST',
      headers: { host: 'gallery.test' },
    });

    expect(isSameOriginRequest(request)).toBe(true);
  });

  it('allows a matching Origin header', () => {
    const request = new Request('https://gallery.test/api/admin/albums', {
      method: 'POST',
      headers: { origin: 'https://gallery.test', host: 'gallery.test' },
    });

    expect(isSameOriginRequest(request)).toBe(true);
  });

  it('rejects a mismatched Origin header', () => {
    const request = new Request('https://gallery.test/api/admin/albums', {
      method: 'POST',
      headers: { origin: 'https://evil.test', host: 'gallery.test' },
    });

    expect(isSameOriginRequest(request)).toBe(false);
  });

  it('honours x-forwarded-host behind a reverse proxy', () => {
    const request = new Request('http://localhost:3000/api/admin/albums', {
      method: 'POST',
      headers: {
        origin: 'https://gallery.example.com',
        host: 'localhost:3000',
        'x-forwarded-host': 'gallery.example.com',
      },
    });

    expect(isSameOriginRequest(request)).toBe(true);
  });

  it('rejects malformed Origin headers', () => {
    const request = new Request('https://gallery.test/api/admin/albums', {
      method: 'POST',
      headers: { origin: 'not a url', host: 'gallery.test' },
    });

    expect(isSameOriginRequest(request)).toBe(false);
  });
});

describe('TRUSTED_ORIGIN_HOSTS allow-list', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  const proxied = (origin: string) =>
    new Request('https://photo-wall.vercel.app/photos/api/admin/albums', {
      method: 'POST',
      headers: { origin, host: 'photo-wall.vercel.app' },
    });

  it('accepts a listed proxy origin (whitespace and case normalised)', () => {
    vi.stubEnv('TRUSTED_ORIGIN_HOSTS', ' Gregory-Lazatin.com , www.gregory-lazatin.com ,, ');

    expect(isSameOriginRequest(proxied('https://gregory-lazatin.com'))).toBe(true);
    expect(isSameOriginRequest(proxied('https://www.gregory-lazatin.com'))).toBe(true);
  });

  it('still rejects an unlisted origin when the list is set', () => {
    vi.stubEnv('TRUSTED_ORIGIN_HOSTS', 'gregory-lazatin.com');

    expect(isSameOriginRequest(proxied('https://evil.example'))).toBe(false);
  });

  it('behaves exactly as before when unset or empty', () => {
    vi.stubEnv('TRUSTED_ORIGIN_HOSTS', '');
    expect(isSameOriginRequest(proxied('https://gregory-lazatin.com'))).toBe(false);
    expect(isSameOriginRequest(proxied('https://photo-wall.vercel.app'))).toBe(true);
  });
});

describe('session cookie scope', () => {
  it('uses the photowall_session name', () => {
    expect(SESSION_COOKIE_NAME).toBe('photowall_session');
  });

  it('sets and clears the cookie with the same name and Path=/photos', () => {
    const set = sessionCookie('tok');
    const cleared = clearedSessionCookie();

    for (const header of [set, cleared]) {
      expect(header.startsWith('photowall_session=')).toBe(true);
      expect(header).toContain('Path=/photos;');
      expect(header).not.toContain('Path=/;');
      expect(header).toContain('HttpOnly');
      expect(header).toContain('SameSite=Lax');
    }
    expect(cleared).toContain('Max-Age=0');
  });
});

describe('session tokens', () => {
  it('round-trips a signed JWT', async () => {
    const token = await createSessionToken();

    expect(typeof token).toBe('string');
    expect(token.split('.')).toHaveLength(3);
    await expect(verifySessionToken(token)).resolves.toBe(true);
  });

  it('rejects a tampered token', async () => {
    const token = await createSessionToken();
    const tampered = `${token.slice(0, -2)}xx`;

    await expect(verifySessionToken(tampered)).resolves.toBe(false);
  });

  it('rejects an empty token', async () => {
    await expect(verifySessionToken('')).resolves.toBe(false);
  });
});
