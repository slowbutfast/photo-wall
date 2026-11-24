import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { getCdnBase, resetStorageAdapterForTesting } from '@/lib/storage';

describe('getCdnBase', () => {
  beforeEach(() => {
    resetStorageAdapterForTesting();
    vi.stubEnv('STORAGE_DRIVER', 'bunny');
    vi.stubEnv('BUNNY_PULL_ZONE_URL', 'https://zone.b-cdn.net');
    vi.stubEnv('CDN_BASE_URL', '');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('prefers CDN_BASE_URL over BUNNY_PULL_ZONE_URL when both are set', () => {
    vi.stubEnv('CDN_BASE_URL', 'https://cdn.gregory-lazatin.com/');

    expect(getCdnBase()).toBe('https://cdn.gregory-lazatin.com');
  });

  it('falls back to BUNNY_PULL_ZONE_URL when CDN_BASE_URL is empty', () => {
    expect(getCdnBase()).toBe('https://zone.b-cdn.net');
  });

  it('falls back to BUNNY_PULL_ZONE_URL when CDN_BASE_URL is unset', () => {
    vi.unstubAllEnvs();
    vi.stubEnv('STORAGE_DRIVER', 'bunny');
    vi.stubEnv('BUNNY_PULL_ZONE_URL', 'https://zone.b-cdn.net');
    delete process.env.CDN_BASE_URL;

    expect(getCdnBase()).toBe('https://zone.b-cdn.net');
  });

  it('throws when neither is set', () => {
    vi.stubEnv('BUNNY_PULL_ZONE_URL', '');
    vi.stubEnv('CDN_BASE_URL', '');

    expect(() => getCdnBase()).toThrow(/CDN_BASE_URL/);
  });

  it('returns the base-path-prefixed local route for the local driver', () => {
    vi.stubEnv('STORAGE_DRIVER', 'local');

    expect(getCdnBase()).toBe('/photos/api/local-uploads');
  });
});
