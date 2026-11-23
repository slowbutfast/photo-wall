/**
 * CORS proxy for YouTube resting thumbnails.
 *
 * Only the fixed `mqdefault.jpg` asset for an 11-character YouTube video id is
 * ever fetched, so this route cannot be used as an arbitrary URL proxy.
 */

const VIDEO_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;
const UPSTREAM = 'https://i.ytimg.com/vi';
const CACHE_SECONDS = 60 * 60 * 24;

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext): Promise<Response> {
  const { id } = await context.params;
  if (!VIDEO_ID_PATTERN.test(id)) {
    return Response.json({ error: 'invalid_video_id' }, { status: 400 });
  }

  let upstream: Response;
  try {
    upstream = await fetch(`${UPSTREAM}/${id}/mqdefault.jpg`, {
      headers: { Accept: 'image/jpeg,image/*' },
      next: { revalidate: CACHE_SECONDS },
    });
  } catch {
    return Response.json({ error: 'thumbnail_unavailable' }, { status: 502 });
  }

  if (!upstream.ok || !upstream.body) {
    return Response.json({ error: 'thumbnail_unavailable' }, { status: 502 });
  }

  return new Response(upstream.body, {
    status: 200,
    headers: {
      'Content-Type': upstream.headers.get('content-type') ?? 'image/jpeg',
      'Cache-Control': `public, max-age=${CACHE_SECONDS}, s-maxage=${CACHE_SECONDS}, immutable`,
      'Access-Control-Allow-Origin': '*',
    },
  });
}
