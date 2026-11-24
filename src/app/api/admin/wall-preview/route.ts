import { requireAdmin } from '@/lib/auth';
import { getWallPreviewSummary } from '@/lib/manifest';

/**
 * Authenticated, uncached Studio preview manifest: published + draft albums
 * laid out for `<GalleryCanvas mode="preview" />`.
 *
 * The public `GET /api/wall` stays cached and published-only.
 */
export async function GET(request: Request): Promise<Response> {
  const guard = await requireAdmin(request);
  if (guard) return guard;

  return Response.json(await getWallPreviewSummary(), {
    headers: {
      'Cache-Control': 'private, no-store',
      'X-Robots-Tag': 'noindex',
    },
  });
}
