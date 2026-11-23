import { revalidateTag } from 'next/cache';

import {
  countActivePhotos,
  getAlbum,
  markAlbumDeleting,
  toAdminAlbumDto,
  updateAlbum,
  type AlbumPatch,
} from '@/db/repository';
import { guardAdminMutation, jsonResponse } from '@/lib/auth';
import { purgeAlbumTombstone } from '@/lib/storage/deletions';

type RouteContext = { params: Promise<{ id: string }> };

function nullableString(value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

function optionalInteger(value: unknown, min: number, max: number): number | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) {
    return undefined;
  }
  return value;
}

export async function PATCH(request: Request, context: RouteContext): Promise<Response> {
  const guard = await guardAdminMutation(request);
  if (guard) return guard;

  const { id } = await context.params;
  const album = await getAlbum(id);
  if (!album) return jsonResponse({ error: 'not_found' }, 404);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: 'invalid_body' }, 400);
  }
  if (typeof body !== 'object' || body === null) {
    return jsonResponse({ error: 'invalid_body' }, 400);
  }

  const input = body as Record<string, unknown>;
  const patch: AlbumPatch = {};

  if (input.title !== undefined) {
    if (typeof input.title !== 'string' || input.title.trim().length === 0) {
      return jsonResponse({ error: 'invalid_title' }, 400);
    }
    patch.title = input.title.trim();
  }

  for (const key of ['description', 'cameraName', 'dateLabel', 'locationLabel'] as const) {
    if (input[key] === undefined) continue;
    const value = nullableString(input[key]);
    if (value === undefined) return jsonResponse({ error: `invalid_${key}` }, 400);
    patch[key] = value;
  }

  if (input.gridColumns !== undefined) {
    const value = optionalInteger(input.gridColumns, 1, 8);
    if (value === undefined || value === null) {
      return jsonResponse({ error: 'invalid_grid_columns' }, 400);
    }
    patch.gridColumns = value;
  }

  if (input.sortOrder !== undefined) {
    const value = optionalInteger(input.sortOrder, 0, Number.MAX_SAFE_INTEGER);
    if (value === undefined || value === null) {
      return jsonResponse({ error: 'invalid_sort_order' }, 400);
    }
    patch.sortOrder = value;
  }

  if (input.youtubeVideoId !== undefined) {
    const value = nullableString(input.youtubeVideoId);
    if (value === undefined) return jsonResponse({ error: 'invalid_youtube_video_id' }, 400);
    if (value !== null && !/^[A-Za-z0-9_-]{11}$/.test(value)) {
      return jsonResponse({ error: 'invalid_youtube_video_id' }, 400);
    }
    patch.youtubeVideoId = value;
    if (value === null) {
      patch.soundtrackArtist = null;
      patch.soundtrackTitle = null;
      patch.soundtrackDurationSec = null;
    }
  }

  for (const key of ['soundtrackArtist', 'soundtrackTitle'] as const) {
    if (input[key] === undefined) continue;
    const value = nullableString(input[key]);
    if (value === undefined) return jsonResponse({ error: `invalid_${key}` }, 400);
    patch[key] = value;
  }

  if (input.soundtrackDurationSec !== undefined) {
    const value = optionalInteger(input.soundtrackDurationSec, 0, Number.MAX_SAFE_INTEGER);
    if (value === undefined) {
      return jsonResponse({ error: 'invalid_soundtrack_duration_sec' }, 400);
    }
    patch.soundtrackDurationSec = value;
  }

  if (input.status !== undefined) {
    if (input.status !== 'published' && input.status !== 'draft') {
      return jsonResponse({ error: 'invalid_status' }, 400);
    }
    patch.status = input.status;
  }

  if (patch.status === 'published' && album.status !== 'published') {
    const uploadedCount = await countActivePhotos(id);
    const allowPartial = input.allowPartial === true;
    if (uploadedCount !== album.expectedCount && !allowPartial) {
      return jsonResponse(
        {
          error: 'incomplete_album',
          uploadedCount,
          expectedCount: album.expectedCount,
        },
        409,
      );
    }
  }

  const updated = await updateAlbum(id, patch);
  if (!updated) return jsonResponse({ error: 'not_found' }, 404);

  revalidateTag('wall', { expire: 0 });

  const photoCount = await countActivePhotos(id);
  return jsonResponse(toAdminAlbumDto(updated, photoCount));
}

/**
 * Tombstone delete: mark `'deleting'` → recursive storage delete → wildcard
 * purge → row delete. A failed storage step leaves the tombstone for retry.
 */
export async function DELETE(request: Request, context: RouteContext): Promise<Response> {
  const guard = await guardAdminMutation(request);
  if (guard) return guard;

  const { id } = await context.params;
  const album = await getAlbum(id);
  if (!album) return jsonResponse({ error: 'not_found' }, 404);

  if (album.status !== 'deleting') {
    await markAlbumDeleting(id);
  }

  try {
    await purgeAlbumTombstone(id);
  } catch {
    revalidateTag('wall', { expire: 0 });
    return jsonResponse({ error: 'storage_delete_failed', tombstone: true }, 502);
  }

  revalidateTag('wall', { expire: 0 });
  return jsonResponse({ deleted: true, id });
}
