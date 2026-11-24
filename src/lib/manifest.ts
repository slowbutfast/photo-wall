import { cacheTag } from 'next/cache';

import { listAlbumsWithPhotos, listPublishedAlbumsWithPhotos } from '@/db/repository';
import type { WallAlbumRecord } from '@/db/repository';
import { computeWallGridPositions } from '@/lib/layout/islandLayout';
import type { AlbumStatus, WallAlbum, WallPhoto, WallSummary } from '@/lib/layout/types';
import { getCdnBase } from '@/lib/storage';

/**
 * Build a compact wall manifest from album records: derived 3-column world
 * positions, active compact photo arrays, status and a single CDN base.
 */
function toWallSummary(
  records: WallAlbumRecord[],
  includeStatuses: readonly AlbumStatus[],
): WallSummary {
  const placements = computeWallGridPositions(
    records.map((record) => ({
      id: record.id,
      status: record.status,
      photoCount: record.photos.length,
      gridColumns: record.gridColumns,
      sortOrder: record.sortOrder,
      hasSoundtrack: record.youtubeVideoId !== null,
    })),
    { includeStatuses },
  );
  const placementById = new Map(placements.map((placement) => [placement.id, placement]));

  const albums: WallAlbum[] = [];
  for (const record of records) {
    const placement = placementById.get(record.id);
    if (!placement) continue;

    const photos: WallPhoto[] = record.photos.map((photo) => ({
      id: photo.id,
      storagePath: photo.storagePath,
      width: photo.width,
      height: photo.height,
      aspectRatio: photo.aspectRatio,
      dominantColor: photo.dominantColor,
      thumbHash: photo.thumbHash,
      sortOrder: photo.sortOrder,
    }));

    albums.push({
      id: record.id,
      slug: record.slug,
      title: record.title,
      description: record.description,
      status: record.status,
      gridColumns: record.gridColumns,
      sortOrder: record.sortOrder,
      position: placement.position,
      bounds: placement.bounds,
      cameraName: record.cameraName,
      dateLabel: record.dateLabel,
      locationLabel: record.locationLabel,
      soundtrack:
        record.youtubeVideoId === null
          ? null
          : {
              videoId: record.youtubeVideoId,
              artist: record.soundtrackArtist,
              title: record.soundtrackTitle,
              durationSec: record.soundtrackDurationSec,
            },
      photos,
    });
  }

  return { cdnBase: getCdnBase(), albums };
}

/**
 * Compact cached public wall manifest: `published` albums only.
 *
 * Next.js 16 `'use cache'` + `cacheTag('wall')`; route handlers invalidate with
 * `revalidateTag('wall', { expire: 0 })`.
 */
export async function getWallSummary(): Promise<WallSummary> {
  'use cache';
  cacheTag('wall');

  return toWallSummary(await listPublishedAlbumsWithPhotos(), ['published']);
}

/**
 * Authenticated Studio preview manifest: published + draft albums. Deliberately
 * uncached; `GET /api/admin/wall-preview` adds `private, no-store`.
 */
export async function getWallPreviewSummary(): Promise<WallSummary> {
  return toWallSummary(await listAlbumsWithPhotos(['published', 'draft']), ['published', 'draft']);
}
