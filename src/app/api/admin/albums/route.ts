import {
  createAlbum,
  listAdminAlbums,
  toAdminAlbumDto,
} from '@/db/repository';
import { guardAdminMutation, jsonResponse, requireAdmin } from '@/lib/auth';

function optionalString(value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

/** Lists drafts and `'deleting'` tombstones alongside published albums. */
export async function GET(request: Request): Promise<Response> {
  const guard = await requireAdmin(request);
  if (guard) return guard;

  const albums = await listAdminAlbums();
  return jsonResponse({
    albums: albums.map((album) => toAdminAlbumDto(album, album.photoCount)),
  });
}

/** Creates a draft album; drafts never reserve wall space. */
export async function POST(request: Request): Promise<Response> {
  const guard = await guardAdminMutation(request);
  if (guard) return guard;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: 'invalid_body' }, 400);
  }

  if (typeof body !== 'object' || body === null) {
    return jsonResponse({ error: 'invalid_body' }, 400);
  }

  const { title, expectedCount, gridColumns, description } = body as {
    title?: unknown;
    expectedCount?: unknown;
    gridColumns?: unknown;
    description?: unknown;
  };

  if (typeof title !== 'string' || title.trim().length === 0) {
    return jsonResponse({ error: 'invalid_title' }, 400);
  }
  if (
    typeof expectedCount !== 'number' ||
    !Number.isInteger(expectedCount) ||
    expectedCount < 0
  ) {
    return jsonResponse({ error: 'invalid_expected_count' }, 400);
  }
  if (
    gridColumns !== undefined &&
    (typeof gridColumns !== 'number' || !Number.isInteger(gridColumns) || gridColumns < 1 || gridColumns > 12)
  ) {
    return jsonResponse({ error: 'invalid_grid_columns' }, 400);
  }

  const album = await createAlbum({
    title: title.trim(),
    expectedCount,
    gridColumns: typeof gridColumns === 'number' ? gridColumns : undefined,
    description: optionalString(description) ?? null,
  });

  return jsonResponse(toAdminAlbumDto(album, 0), 201);
}
