import { describe, expect, it } from 'vitest';

import { buildContentSecurityPolicy, cdnOriginFrom } from '@/lib/security/csp';

function directives(policy: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const part of policy.split(';')) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const [name, ...values] = trimmed.split(/\s+/);
    map.set(name, values.join(' '));
  }
  return map;
}

describe('cdnOriginFrom', () => {
  it('returns scheme + host only, stripping any path', () => {
    expect(cdnOriginFrom('https://zone.b-cdn.net/albums/')).toBe('https://zone.b-cdn.net');
    expect(cdnOriginFrom('https://cdn.gregory-lazatin.com')).toBe('https://cdn.gregory-lazatin.com');
  });

  it('returns null for undefined, empty, root-relative or invalid input', () => {
    expect(cdnOriginFrom(undefined)).toBeNull();
    expect(cdnOriginFrom('')).toBeNull();
    expect(cdnOriginFrom('/api/local-uploads')).toBeNull();
    expect(cdnOriginFrom('not a url')).toBeNull();
  });
});

describe('buildContentSecurityPolicy (production)', () => {
  const policy = buildContentSecurityPolicy({ cdnOrigin: 'https://cdn.gregory-lazatin.com', isDev: false });
  const d = directives(policy);

  it('contains every required directive', () => {
    expect(d.get('default-src')).toBe("'self'");
    expect(d.get('script-src')).toBe("'self' 'unsafe-inline'");
    expect(d.get('style-src')).toBe("'self' 'unsafe-inline'");
    expect(d.get('font-src')).toBe("'self'");
    expect(d.get('connect-src')).toBe("'self'");
    expect(d.get('object-src')).toBe("'none'");
    expect(d.get('base-uri')).toBe("'self'");
    expect(d.get('form-action')).toBe("'self'");
    expect(d.get('frame-ancestors')).toBe("'none'");
  });

  it('allows the CDN origin in img-src', () => {
    expect(d.get('img-src')).toBe("'self' data: blob: https://cdn.gregory-lazatin.com");
  });

  it('allows only youtube-nocookie in frame-src', () => {
    expect(d.get('frame-src')).toBe('https://www.youtube-nocookie.com');
  });

  it('has no unsafe-eval, ws: or www.youtube.com anywhere', () => {
    expect(policy).not.toContain("'unsafe-eval'");
    expect(policy).not.toContain('ws:');
    expect(policy).not.toMatch(/https:\/\/www\.youtube\.com(?!-)/);
  });
});

describe('buildContentSecurityPolicy allowYoutubeApi', () => {
  const publicPolicy = buildContentSecurityPolicy({
    cdnOrigin: 'https://cdn.gregory-lazatin.com',
    isDev: false,
    allowYoutubeApi: false,
  });
  const studioPolicy = buildContentSecurityPolicy({
    cdnOrigin: 'https://cdn.gregory-lazatin.com',
    isDev: false,
    allowYoutubeApi: true,
  });

  it('keeps www.youtube.com out of the public policy', () => {
    const d = directives(publicPolicy);
    expect(d.get('script-src')).toBe("'self' 'unsafe-inline'");
    expect(d.get('frame-src')).toBe('https://www.youtube-nocookie.com');
    expect(publicPolicy).not.toMatch(/https:\/\/www\.youtube\.com(?!-)/);
  });

  it('adds www.youtube.com to script-src and frame-src in the studio policy', () => {
    const d = directives(studioPolicy);
    expect(d.get('script-src')).toBe("'self' 'unsafe-inline' https://www.youtube.com");
    expect(d.get('frame-src')).toBe(
      'https://www.youtube-nocookie.com https://www.youtube.com',
    );
    expect(d.get('frame-ancestors')).toBe("'none'");
  });
});

describe('buildContentSecurityPolicy (dev / no CDN)', () => {
  const policy = buildContentSecurityPolicy({ cdnOrigin: null, isDev: true });
  const d = directives(policy);

  it('img-src is exactly self, data: and blob: when no CDN origin is configured', () => {
    expect(d.get('img-src')).toBe("'self' data: blob:");
  });

  it('adds unsafe-eval and ws: in dev only', () => {
    expect(d.get('script-src')).toContain("'unsafe-eval'");
    expect(d.get('connect-src')).toContain('ws:');
  });

  it('still forbids framing', () => {
    expect(d.get('frame-ancestors')).toBe("'none'");
  });
});
