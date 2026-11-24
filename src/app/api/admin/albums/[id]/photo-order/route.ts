import { revalidateTag } from 'next/cache';

import { reorderAlbumPhotos } from '@/db/repository';
import { guardAdminMutation, jsonResponse } from '@/lib/auth';

type RouteContext = { params: Promise<{ id: string }> };

function parsePhotoIds(body: unknown): string[] | null {
  if (typeof body !== 'object' || body === null) return null;
  const value = (body as { photoIds?: unknown }).photoIds;
  if (!Array.isArray(value)) return null;
  if (!value.every((entry): entry is string => typeof entry === 'string')) return null;
  return value;
}

/**
 * Atomic full-permutation photo reorder.
 *
 * `{ photoIds }` must contain every active photo of this album exactly once.
 * Anything else is `409 order_stale` with the current `activePhotoIds`, so the
 * client can merge concurrent uploads/deletes without losing its drag order.
 * A successful save revalidates the `wall` tag exactly once.
 */
export async function PUT(request: Request, context: RouteContext): Promise<Response> {
  const guard = await guardAdminMutation(request);
  if (guard) return guard;

  const { id } = await context.params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: 'invalid_body' }, 400);
  }

  const photoIds = parsePhotoIds(body);
  if (photoIds === null) return jsonResponse({ error: 'invalid_body' }, 400);

  const result = await reorderAlbumPhotos(id, photoIds);

  if (result.status === 'not_found') return jsonResponse({ error: 'not_found' }, 404);
  if (result.status === 'album_deleting') {
    return jsonResponse({ error: 'album_deleting' }, 409);
  }
  if (result.status === 'order_stale') {
    return jsonResponse(
      { error: 'order_stale', activePhotoIds: result.activePhotoIds },
      409,
    );
  }

  revalidateTag('wall', { expire: 0 });
  return jsonResponse({ albumId: id, photoIds: result.photoIds });
}
