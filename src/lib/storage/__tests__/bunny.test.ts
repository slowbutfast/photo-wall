import { describe, expect, it, vi } from 'vitest';

import {
  BunnyStorageAdapter,
  buildPurgeUrl,
  buildStorageUrl,
} from '@/lib/storage/bunny';

type FetchCall = { url: string; method: string; headers: Headers; body?: unknown };

function createFetchMock() {
  const calls: FetchCall[] = [];
  const fetchImpl = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    calls.push({
      url: String(input),
      method: init?.method ?? 'GET',
      headers: new Headers(init?.headers),
      body: init?.body,
    });
    return new Response(null, { status: 200 });
  });
  return { calls, fetchImpl };
}

function createAdapter() {
  const { calls, fetchImpl } = createFetchMock();
  const adapter = new BunnyStorageAdapter({
    storageZone: 'wall-zone',
    storageHost: 'storage.bunnycdn.com',
    storageApiKey: 'storage-key',
    pullZoneUrl: 'https://wall.b-cdn.net',
    pullZoneApiKey: 'pull-zone-key',
    fetchImpl,
  });
  return { adapter, calls };
}

describe('buildStorageUrl', () => {
  it('builds storage API URLs under the zone and album path', () => {
    expect(buildStorageUrl('storage.bunnycdn.com', 'wall-zone', '/albums/a1/p1.jpg')).toBe(
      'https://storage.bunnycdn.com/wall-zone/albums/a1/p1.jpg',
    );
  });

  it('preserves the trailing slash that makes a directory delete recursive', () => {
    expect(buildStorageUrl('storage.bunnycdn.com', 'wall-zone', '/albums/a1/')).toBe(
      'https://storage.bunnycdn.com/wall-zone/albums/a1/',
    );
  });
});

describe('buildPurgeUrl', () => {
  it('builds wildcard Pull Zone purge URLs', () => {
    expect(buildPurgeUrl('https://wall.b-cdn.net', '/albums/a1/*')).toBe(
      'https://api.bunny.net/purge?url=https%3A%2F%2Fwall.b-cdn.net%2Falbums%2Fa1%2F*&async=false',
    );
  });

  it('keeps the photo wildcard suffix intact', () => {
    expect(buildPurgeUrl('https://wall.b-cdn.net', '/albums/a1/p1.*')).toContain(
      '%2Falbums%2Fa1%2Fp1.*',
    );
  });
});

describe('BunnyStorageAdapter.putObject', () => {
  it('PUTs bytes to /albums/{albumId}/{photoId}.{ext} with the storage API key', async () => {
    const { adapter, calls } = createAdapter();

    await adapter.putObject('/albums/a1/p1.jpg', new Uint8Array([1, 2, 3]), 'image/jpeg');

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe('https://storage.bunnycdn.com/wall-zone/albums/a1/p1.jpg');
    expect(calls[0].method).toBe('PUT');
    expect(calls[0].headers.get('AccessKey')).toBe('storage-key');
    expect(calls[0].headers.get('Content-Type')).toBe('image/jpeg');
  });

  it('throws when Bunny returns an error status', async () => {
    const fetchImpl = vi.fn(async () => new Response('nope', { status: 401 }));
    const adapter = new BunnyStorageAdapter({
      storageZone: 'wall-zone',
      storageHost: 'storage.bunnycdn.com',
      storageApiKey: 'storage-key',
      pullZoneUrl: 'https://wall.b-cdn.net',
      pullZoneApiKey: 'pull-zone-key',
      fetchImpl,
    });

    await expect(
      adapter.putObject('/albums/a1/p1.jpg', new Uint8Array([1]), 'image/jpeg'),
    ).rejects.toThrow(/401/);
  });
});

describe('BunnyStorageAdapter deletes and purges', () => {
  it('recursively DELETEs /albums/{albumId}/ from storage (trailing slash preserved)', async () => {
    const { adapter, calls } = createAdapter();

    await adapter.deletePrefix('/albums/a1/');

    expect(calls[0].url).toBe('https://storage.bunnycdn.com/wall-zone/albums/a1/');
    expect(calls[0].method).toBe('DELETE');
    expect(calls[0].headers.get('AccessKey')).toBe('storage-key');
  });

  it('DELETEs a single photo object', async () => {
    const { adapter, calls } = createAdapter();

    await adapter.deleteObject('/albums/a1/p1.jpg');

    expect(calls[0].url).toBe('https://storage.bunnycdn.com/wall-zone/albums/a1/p1.jpg');
    expect(calls[0].method).toBe('DELETE');
  });

  it('purges the album wildcard /albums/{albumId}/* on the Pull Zone', async () => {
    const { adapter, calls } = createAdapter();

    await adapter.purgeWildcard('/albums/a1/*');

    expect(calls[0].url).toBe(buildPurgeUrl('https://wall.b-cdn.net', '/albums/a1/*'));
    expect(calls[0].method).toBe('POST');
    expect(calls[0].headers.get('AccessKey')).toBe('pull-zone-key');
  });

  it('purges all Optimizer variants of a single photo with /albums/{albumId}/{photoId}.*', async () => {
    const { adapter, calls } = createAdapter();

    await adapter.purgeWildcard('/albums/a1/p1.*');

    expect(calls[0].url).toContain('%2Falbums%2Fa1%2Fp1.*');
  });
});

describe('purge target is independent of CDN_BASE_URL', () => {
  it('keeps purging the pull zone even when a custom public hostname is configured', async () => {
    vi.stubEnv('CDN_BASE_URL', 'https://cdn.gregory-lazatin.com');
    try {
      const { adapter, calls } = createAdapter();

      await adapter.purgeWildcard('/albums/a1/*');

      expect(calls[0].url).toBe(buildPurgeUrl('https://wall.b-cdn.net', '/albums/a1/*'));
      expect(calls[0].url).not.toContain('gregory-lazatin');
    } finally {
      vi.unstubAllEnvs();
    }
  });
});

describe('BunnyStorageAdapter.publicUrl', () => {
  it('keeps stable albumId-keyed CDN paths when the album is renamed', () => {
    const { adapter } = createAdapter();

    expect(adapter.publicUrl('/albums/a1/p1.jpg')).toBe(
      'https://wall.b-cdn.net/albums/a1/p1.jpg',
    );
  });
});
