import {
  deleteAlbumRows,
  deletePhotoRow,
  listDeletingAlbums,
  listDeletingPhotos,
} from '@/db/repository';
import type { Photo } from '@/db/schema';

import { getStorageAdapter } from './index';

export interface SweepResult {
  retried: number;
  failed: number;
}

/** Finishes an album tombstone: storage delete → wildcard purge → row delete. */
export async function purgeAlbumTombstone(albumId: string): Promise<void> {
  const storage = getStorageAdapter();
  await storage.deletePrefix(`/albums/${albumId}/`);
  await storage.purgeWildcard(`/albums/${albumId}/*`);
  await deleteAlbumRows(albumId);
}

/** Finishes a photo tombstone: object delete → wildcard purge → row delete. */
export async function purgePhotoTombstone(photo: Photo): Promise<void> {
  const storage = getStorageAdapter();
  await storage.deleteObject(photo.storagePath);
  await storage.purgeWildcard(`/albums/${photo.albumId}/${photo.id}.*`);
  await deletePhotoRow(photo.id);
}

/**
 * Resumes every lingering `'deleting'` tombstone (server boot and the Pending
 * Deletions retry endpoint). Failures leave the tombstone in place for a later
 * retry and are reported in the result.
 */
export async function sweepPendingDeletions(): Promise<SweepResult> {
  let retried = 0;
  let failed = 0;

  for (const album of await listDeletingAlbums()) {
    try {
      await purgeAlbumTombstone(album.id);
      retried += 1;
    } catch {
      failed += 1;
    }
  }

  for (const photo of await listDeletingPhotos()) {
    try {
      await purgePhotoTombstone(photo);
      retried += 1;
    } catch {
      failed += 1;
    }
  }

  return { retried, failed };
}
