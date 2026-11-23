import { normalizeCdnBase } from '@/lib/cdn/lodUrl';

import { BunnyStorageAdapter } from './bunny';
import { LocalStorageAdapter } from './local';
import type { StorageAdapter } from './types';

export const LOCAL_CDN_BASE = '/api/local-uploads';

let adapter: StorageAdapter | null = null;
let adapterForTesting: StorageAdapter | null = null;

export function getLocalUploadDir(): string {
  return process.env.LOCAL_UPLOAD_DIR ?? './data/uploads';
}

function createStorageAdapter(): StorageAdapter {
  const driver = process.env.STORAGE_DRIVER ?? 'local';

  if (driver === 'bunny') {
    const storageZone = process.env.BUNNY_STORAGE_ZONE;
    const storageApiKey = process.env.BUNNY_STORAGE_API_KEY;
    const pullZoneUrl = process.env.BUNNY_PULL_ZONE_URL;
    const pullZoneApiKey = process.env.BUNNY_PULL_ZONE_API_KEY;

    if (!storageZone || !storageApiKey || !pullZoneUrl || !pullZoneApiKey) {
      throw new Error(
        'STORAGE_DRIVER=bunny requires BUNNY_STORAGE_ZONE, BUNNY_STORAGE_API_KEY, BUNNY_PULL_ZONE_URL and BUNNY_PULL_ZONE_API_KEY',
      );
    }

    return new BunnyStorageAdapter({
      storageZone,
      storageHost: process.env.BUNNY_STORAGE_HOST ?? 'storage.bunnycdn.com',
      storageApiKey,
      pullZoneUrl,
      pullZoneApiKey,
    });
  }

  return new LocalStorageAdapter(getLocalUploadDir());
}

export function getStorageAdapter(): StorageAdapter {
  if (adapterForTesting) return adapterForTesting;
  if (!adapter) adapter = createStorageAdapter();
  return adapter;
}

/** CDN base used by the wall manifest: env Pull Zone for Bunny, local route otherwise. */
export function getCdnBase(): string {
  if ((process.env.STORAGE_DRIVER ?? 'local') === 'bunny') {
    const base = process.env.BUNNY_PULL_ZONE_URL ?? process.env.CDN_BASE_URL;
    if (!base) {
      throw new Error('STORAGE_DRIVER=bunny requires BUNNY_PULL_ZONE_URL or CDN_BASE_URL');
    }
    return normalizeCdnBase(base);
  }
  return LOCAL_CDN_BASE;
}

export function setStorageAdapterForTesting(next: StorageAdapter | null): void {
  adapterForTesting = next;
}

export function resetStorageAdapterForTesting(): void {
  adapterForTesting = null;
  adapter = null;
}

export type { StorageAdapter } from './types';
export { BunnyStorageAdapter } from './bunny';
export { LocalStorageAdapter } from './local';
