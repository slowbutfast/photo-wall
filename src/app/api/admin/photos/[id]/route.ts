import { revalidateTag } from 'next/cache';

import {
  getPhoto,
  markPhotoDeleting,
  toAdminPhotoDto,
  updatePhoto,
  type PhotoPatch,
} from '@/db/repository';
import { guardAdminMutation, jsonResponse } from '@/lib/auth';
import { purgePhotoTombstone } from '@/lib/storage/deletions';

type RouteContext = { params: Promise<{ id: string }> };

function nullableString(value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

export async function PATCH(request: Request, context: RouteContext): Promise<Response> {
  const guard = await guardAdminMutation(request);
  if (guard) return guard;

  const { id } = await context.params;
  const photo = await getPhoto(id);
  if (!photo) return jsonResponse({ error: 'not_found' }, 404);

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
  const patch: PhotoPatch = {};

  for (const key of ['title', 'caption'] as const) {
    if (input[key] === undefined) continue;
    const value = nullableString(input[key]);
    if (value === undefined) return jsonResponse({ error: `invalid_${key}` }, 400);
    patch[key] = value;
  }

  if (input.sortOrder !== undefined) {
    if (
      typeof input.sortOrder !== 'number' ||
      !Number.isInteger(input.sortOrder) ||
      input.sortOrder < 0
    ) {
      return jsonResponse({ error: 'invalid_sort_order' }, 400);
    }
    patch.sortOrder = input.sortOrder;
  }

  const updated = await updatePhoto(id, patch);
  if (!updated) return jsonResponse({ error: 'not_found' }, 404);

  revalidateTag('wall', { expire: 0 });
  return jsonResponse(toAdminPhotoDto(updated));
}

/**
 * Photo tombstone delete: mark `'deleting'` → object delete → wildcard purge of
 * `/albums/{albumId}/{photoId}.*` → row delete.
 */
export async function DELETE(request: Request, context: RouteContext): Promise<Response> {
  const guard = await guardAdminMutation(request);
  if (guard) return guard;

  const { id } = await context.params;
  const photo = await getPhoto(id);
  if (!photo) return jsonResponse({ error: 'not_found' }, 404);

  if (photo.status !== 'deleting') {
    await markPhotoDeleting(id);
  }

  try {
    await purgePhotoTombstone(photo);
  } catch {
    revalidateTag('wall', { expire: 0 });
    return jsonResponse({ error: 'storage_delete_failed', tombstone: true }, 502);
  }

  revalidateTag('wall', { expire: 0 });
  return jsonResponse({ deleted: true, id });
}
