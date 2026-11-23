import { beforeEach, describe, expect, it } from 'vitest';

import {
  LOGIN_RATE_LIMIT,
  constantTimeEquals,
  createSessionToken,
  hashPassword,
  isLoginRateLimited,
  isSameOriginRequest,
  recordFailedLogin,
  resetLoginRateLimits,
  verifyAdminPassword,
  verifySessionToken,
} from '@/lib/auth';

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
  it('accepts the configured ADMIN_PASSWORD', () => {
    expect(verifyAdminPassword('test-password')).toBe(true);
  });

  it('rejects any other password', () => {
    expect(verifyAdminPassword('wrong-password')).toBe(false);
    expect(verifyAdminPassword('')).toBe(false);
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
