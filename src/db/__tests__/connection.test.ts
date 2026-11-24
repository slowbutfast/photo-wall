import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  migrate: vi.fn(),
}));

vi.mock('@libsql/client', () => ({ createClient: mocks.createClient }));
vi.mock('drizzle-orm/libsql', () => ({ drizzle: vi.fn(() => ({ fake: true })) }));
vi.mock('drizzle-orm/libsql/migrator', () => ({ migrate: mocks.migrate }));

async function loadDb() {
  vi.resetModules();
  return import('@/db/index');
}

beforeEach(() => {
  mocks.createClient.mockReset();
  mocks.migrate.mockReset();
  mocks.createClient.mockReturnValue({ execute: vi.fn(async () => ({})) });
  mocks.migrate.mockResolvedValue(undefined);
  vi.unstubAllEnvs();
  for (const key of ['DATABASE_URL', 'DATABASE_AUTH_TOKEN', 'TURSO_DATABASE_URL', 'TURSO_AUTH_TOKEN']) {
    vi.stubEnv(key, '');
  }
});

describe('resolveDatabaseConfig', () => {
  it('uses the Turso integration env when DATABASE_* is unset', async () => {
    const { resolveDatabaseConfig } = await loadDb();

    expect(
      resolveDatabaseConfig({
        TURSO_DATABASE_URL: 'libsql://photo-wall-x.turso.io',
        TURSO_AUTH_TOKEN: 't0k',
      }),
    ).toEqual({ url: 'libsql://photo-wall-x.turso.io', authToken: 't0k' });
  });

  it('lets explicit DATABASE_* override the integration', async () => {
    const { resolveDatabaseConfig } = await loadDb();

    expect(
      resolveDatabaseConfig({
        DATABASE_URL: 'libsql://other.turso.io',
        DATABASE_AUTH_TOKEN: 'a',
        TURSO_DATABASE_URL: 'libsql://photo-wall-x.turso.io',
        TURSO_AUTH_TOKEN: 'b',
      }),
    ).toEqual({ url: 'libsql://other.turso.io', authToken: 'a' });
  });

  it('falls back to the local file with no token, treating empty strings as unset', async () => {
    const { resolveDatabaseConfig } = await loadDb();

    const resolved = resolveDatabaseConfig({
      DATABASE_URL: '',
      DATABASE_AUTH_TOKEN: '',
      TURSO_DATABASE_URL: '',
      TURSO_AUTH_TOKEN: '',
    });
    expect(resolved.url).toBe('file:./data/photo-wall.db');
    expect(resolved.authToken).toBeUndefined();
  });
});

describe('createDatabase', () => {
  it('passes url and authToken to createClient', async () => {
    const { createDatabase } = await loadDb();

    await createDatabase({ url: 'libsql://x.turso.io', authToken: 'secret' });

    expect(mocks.createClient).toHaveBeenCalledWith({ url: 'libsql://x.turso.io', authToken: 'secret' });
  });
});

describe('getDb', () => {
  it('retries after a rejected init instead of caching the failure', async () => {
    vi.stubEnv('DATABASE_URL', 'libsql://x.turso.io');
    mocks.migrate.mockRejectedValueOnce(new Error('transient'));
    const { getDb } = await loadDb();

    await expect(getDb()).rejects.toThrow('transient');
    await expect(getDb()).resolves.toBeDefined();
    expect(mocks.createClient).toHaveBeenCalledTimes(2);
  });

  it('shares one in-flight attempt between concurrent callers', async () => {
    vi.stubEnv('DATABASE_URL', 'libsql://x.turso.io');
    let release!: () => void;
    mocks.migrate.mockReturnValue(new Promise<void>((resolve) => (release = resolve)));
    const { getDb } = await loadDb();

    const calls = [getDb(), getDb(), getDb()];
    release();
    await Promise.all(calls);

    expect(mocks.createClient).toHaveBeenCalledTimes(1);
  });
});
