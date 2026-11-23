import { normalizeCdnBase } from '@/lib/cdn/lodUrl';

import type { StorageAdapter } from './types';

export interface BunnyStorageOptions {
  storageZone: string;
  storageHost: string;
  storageApiKey: string;
  pullZoneUrl: string;
  pullZoneApiKey: string;
  fetchImpl?: typeof fetch;
}

export function buildStorageUrl(
  storageHost: string,
  storageZone: string,
  path: string,
): string {
  const host = storageHost.replace(/^https?:\/\//, '').replace(/\/+$/, '');
  const normalizedPath = `/${path.replace(/^\/+/, '')}`;
  return `https://${host}/${storageZone}${normalizedPath}`;
}

/** Bunny Pull Zone purge endpoint; wildcards (`*`) must reach the API raw. */
export function buildPurgeUrl(pullZoneUrl: string, path: string): string {
  const target = `${normalizeCdnBase(pullZoneUrl)}/${path.replace(/^\/+/, '')}`;
  return `https://api.bunny.net/purge?url=${encodeURIComponent(target)}&async=false`;
}

export class BunnyStorageAdapter implements StorageAdapter {
  private readonly options: BunnyStorageOptions;
  private readonly fetchImpl: typeof fetch;

  constructor(options: BunnyStorageOptions) {
    this.options = options;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  private storageUrl(path: string): string {
    return buildStorageUrl(this.options.storageHost, this.options.storageZone, path);
  }

  async putObject(path: string, body: Uint8Array, contentType: string): Promise<void> {
    const response = await this.fetchImpl(this.storageUrl(path), {
      method: 'PUT',
      headers: {
        AccessKey: this.options.storageApiKey,
        'Content-Type': contentType,
      },
      body: body as unknown as BodyInit,
    });
    if (!response.ok) {
      throw new Error(`Bunny storage PUT failed with status ${response.status}`);
    }
  }

  async deleteObject(path: string): Promise<void> {
    const response = await this.fetchImpl(this.storageUrl(path), {
      method: 'DELETE',
      headers: { AccessKey: this.options.storageApiKey },
    });
    // 404 means the object is already gone; deletion is idempotent.
    if (!response.ok && response.status !== 404) {
      throw new Error(`Bunny storage DELETE failed with status ${response.status}`);
    }
  }

  async deletePrefix(path: string): Promise<void> {
    // Bunny deletes a directory recursively only when the trailing slash is kept.
    const normalized = `/${path.replace(/^\/+/, '').replace(/\/*$/, '/')}`;
    const response = await this.fetchImpl(this.storageUrl(normalized), {
      method: 'DELETE',
      headers: { AccessKey: this.options.storageApiKey },
    });
    if (!response.ok && response.status !== 404) {
      throw new Error(`Bunny storage directory DELETE failed with status ${response.status}`);
    }
  }

  async purgeWildcard(path: string): Promise<void> {
    const response = await this.fetchImpl(buildPurgeUrl(this.options.pullZoneUrl, path), {
      method: 'POST',
      headers: { AccessKey: this.options.pullZoneApiKey },
    });
    if (!response.ok) {
      throw new Error(`Bunny Pull Zone purge failed with status ${response.status}`);
    }
  }

  publicUrl(path: string): string {
    return `${normalizeCdnBase(this.options.pullZoneUrl)}/${path.replace(/^\/+/, '')}`;
  }
}
