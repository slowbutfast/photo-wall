import { revalidateTag } from 'next/cache';

import { reorderAlbums } from '@/db/repository';
import { guardAdminMutation, jsonResponse } from '@/lib/auth';

function parseAlbumIds(body: unknown): string[] | null {
  if (typeof body !== 'object' || body === null) return null;
  const value = (body as { albumIds?: unknown }).albumIds;
  if (!Array.isArray(value)) return null;
  if (!value.every((entry): entry is string => typeof entry === 'string')) return null;
  return value;
}

/**
 * Atomic cross-wall album reorder.
 *
 * `{ albumIds }` must contain every non-`deleting` album (`published` + `draft`)
 * exactly once; a stale/incomplete/duplicate/foreign list is `409 order_stale`
 * with `activeAlbumIds`. A successful save revalidates the `wall` tag once.
 */
export async function PUT(request: Request): Promise<Response> {
  const guard = await guardAdminMutation(request);
  if (guard) return guard;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: 'invalid_body' }, 400);
  }

  const albumIds = parseAlbumIds(body);
  if (albumIds === null) return jsonResponse({ error: 'invalid_body' }, 400);

  const result = await reorderAlbums(albumIds);

  if (result.status === 'order_stale') {
    return jsonResponse(
      { error: 'order_stale', activeAlbumIds: result.activeAlbumIds },
      409,
    );
  }

  revalidateTag('wall', { expire: 0 });
  return jsonResponse({ albumIds: result.albumIds });
}
