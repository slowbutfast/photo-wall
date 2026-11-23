import { createHash } from 'node:crypto';

import { revalidateTag } from 'next/cache';

import {
  getAlbum,
  getNextPhotoSortOrder,
  getPhoto,
  insertPhoto,
  toAdminPhotoDto,
} from '@/db/repository';
import { guardAdminMutation, jsonResponse } from '@/lib/auth';
import { getStorageAdapter } from '@/lib/storage';
import {
  ImageValidationError,
  MAX_UPLOAD_BYTES,
  sanitizeImage,
} from '@/lib/upload/sanitizeImage';

type RouteContext = { params: Promise<{ id: string }> };

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function optionalText(value: FormDataEntryValue | null): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

/**
 * Multipart upload contract:
 * `file` (required), `photoId` (required UUID), `thumbHash`, `dominantColor`,
 * `sortOrder`. The DB idempotency pre-check runs BEFORE the storage PUT so an
 * identical retry never touches storage, and a different payload for the same
 * photoId is rejected with 409.
 */
export async function POST(request: Request, context: RouteContext): Promise<Response> {
  const guard = await guardAdminMutation(request);
  if (guard) return guard;

  const { id: albumId } = await context.params;
  const album = await getAlbum(albumId);
  if (!album) return jsonResponse({ error: 'not_found' }, 404);

  // Tombstoned albums reject uploads before any storage or DB write.
  if (album.status === 'deleting') {
    return jsonResponse({ error: 'album_deleting' }, 409);
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return jsonResponse({ error: 'invalid_multipart_body' }, 400);
  }

  const file = form.get('file');
  if (!(file instanceof Blob)) {
    return jsonResponse({ error: 'missing_file' }, 400);
  }

  const photoId = form.get('photoId');
  if (typeof photoId !== 'string' || !UUID_PATTERN.test(photoId)) {
    return jsonResponse({ error: 'invalid_photo_id' }, 400);
  }

  const rawBytes = new Uint8Array(await file.arrayBuffer());
  if (rawBytes.byteLength > MAX_UPLOAD_BYTES) {
    return jsonResponse({ error: 'payload_too_large' }, 413);
  }

  const contentHash = createHash('sha256').update(rawBytes).digest('hex');

  const existing = await getPhoto(photoId);
  if (existing) {
    if (existing.albumId !== albumId || existing.contentHash !== contentHash) {
      return jsonResponse({ error: 'photo_id_conflict' }, 409);
    }
    // Idempotent retry: the storage object and DB row are already correct.
    return jsonResponse(toAdminPhotoDto(existing));
  }

  let sanitized;
  try {
    sanitized = sanitizeImage(rawBytes);
  } catch (error) {
    if (error instanceof ImageValidationError) {
      return jsonResponse({ error: 'invalid_image', message: error.message }, error.status);
    }
    throw error;
  }

  const storage = getStorageAdapter();
  const storagePath = `/albums/${albumId}/${photoId}.${sanitized.extension}`;

  try {
    await storage.putObject(storagePath, sanitized.bytes, sanitized.contentType);
  } catch {
    return jsonResponse({ error: 'storage_write_failed' }, 502);
  }

  const sortOrderValue = form.get('sortOrder');
  const parsedSortOrder =
    typeof sortOrderValue === 'string' && Number.isFinite(Number(sortOrderValue))
      ? Math.max(0, Math.trunc(Number(sortOrderValue)))
      : null;
  const sortOrder =
    parsedSortOrder ?? (await getNextPhotoSortOrder(albumId));

  let created;
  try {
    created = await insertPhoto({
      id: photoId,
      albumId,
      storagePath,
      contentHash,
      filename: typeof File !== 'undefined' && file instanceof File ? file.name : null,
      width: sanitized.width,
      height: sanitized.height,
      aspectRatio: sanitized.aspectRatio,
      dominantColor: optionalText(form.get('dominantColor')),
      thumbHash: optionalText(form.get('thumbHash')),
      sortOrder,
    });
  } catch {
    // A concurrent retry may have committed the same photoId first. Re-read the
    // row before touching storage so the loser never deletes the live object.
    const winner = await getPhoto(photoId);
    if (winner) {
      if (winner.albumId === albumId && winner.contentHash === contentHash) {
        revalidateTag('wall', { expire: 0 });
        return jsonResponse(toAdminPhotoDto(winner));
      }
      return jsonResponse({ error: 'photo_id_conflict' }, 409);
    }
    // Roll back the freshly uploaded object so no orphan is left behind.
    try {
      await storage.deleteObject(storagePath);
    } catch {
      // Cleanup is best-effort; the tombstone sweep does not cover orphans.
    }
    return jsonResponse({ error: 'database_write_failed' }, 500);
  }

  revalidateTag('wall', { expire: 0 });
  return jsonResponse(toAdminPhotoDto(created), 201);
}
