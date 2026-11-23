import { guardAdminMutation, jsonResponse } from '@/lib/auth';
import { buildOembedUrl, extractYoutubeVideoId, parseYoutubeTitle } from '@/lib/validation/youtube';

interface OembedPayload {
  title?: unknown;
  author_name?: unknown;
}

/**
 * SSRF-safe YouTube inspection: the URL is validated first, then the oEmbed
 * request is built from the 11-character videoId only. Invalid or non-YouTube
 * URLs return 400 without any outbound request.
 */
export async function POST(request: Request): Promise<Response> {
  const guard = await guardAdminMutation(request);
  if (guard) return guard;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: 'invalid_body' }, 400);
  }

  const url =
    typeof body === 'object' && body !== null && typeof (body as { url?: unknown }).url === 'string'
      ? (body as { url: string }).url
      : null;
  if (!url) return jsonResponse({ error: 'invalid_url' }, 400);

  const videoId = extractYoutubeVideoId(url);
  if (!videoId) {
    return jsonResponse({ error: 'invalid_youtube_url' }, 400);
  }

  let payload: OembedPayload;
  try {
    const response = await fetch(buildOembedUrl(videoId), {
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) {
      return jsonResponse({ error: 'oembed_failed' }, 400);
    }
    payload = (await response.json()) as OembedPayload;
  } catch {
    return jsonResponse({ error: 'oembed_failed' }, 400);
  }

  const title = typeof payload.title === 'string' ? payload.title : '';
  const author = typeof payload.author_name === 'string' ? payload.author_name : null;
  const { artistGuess, titleGuess } = parseYoutubeTitle(title, author);

  return jsonResponse({ videoId, artistGuess, titleGuess });
}
