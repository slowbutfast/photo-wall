import { cacheTag } from 'next/cache';

import { listPublishedAlbumsWithPhotos } from '@/db/repository';
import { computeWallGridPositions } from '@/lib/layout/islandLayout';
import type { WallAlbum, WallPhoto, WallSummary } from '@/lib/layout/types';
import { getCdnBase } from '@/lib/storage';

/**
 * Compact cached wall manifest: `published` albums with derived 3-column world
 * positions, active compact photo arrays, and a single CDN base.
 *
 * Next.js 16 `'use cache'` + `cacheTag('wall')`; route handlers invalidate with
 * `revalidateTag('wall', { expire: 0 })`.
 */
export async function getWallSummary(): Promise<WallSummary> {
  'use cache';
  cacheTag('wall');

  const records = await listPublishedAlbumsWithPhotos();

  const placements = computeWallGridPositions(
    records.map((record) => ({
      id: record.id,
      status: record.status,
      photoCount: record.photos.length,
      gridColumns: record.gridColumns,
      sortOrder: record.sortOrder,
      hasSoundtrack: record.youtubeVideoId !== null,
    })),
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
