/**
 * YouTube URL validation and oEmbed parsing.
 *
 * SECURITY: oEmbed requests are constructed *only* from a validated
 * 11-character videoId. Arbitrary user-supplied URLs are never fetched, which
 * removes the SSRF surface entirely.
 */

const VIDEO_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;

const YOUTUBE_HOSTS = new Set([
  'youtube.com',
  'www.youtube.com',
  'm.youtube.com',
  'music.youtube.com',
  'youtube-nocookie.com',
  'www.youtube-nocookie.com',
  'youtu.be',
  'www.youtu.be',
]);

const TITLE_SUFFIX_PATTERN =
  /\s*[([][^)\]]*(?:official|lyrics?|audio|video|visuali[sz]er|hd|hq|4k|8k|remaster(?:ed)?|live|performance|mv|m\/v)[^)\]]*[)\]]\s*$/gi;

function parseUrl(input: string): URL | null {
  const trimmed = input.trim();
  if (trimmed.length === 0) return null;
  try {
    return new URL(trimmed);
  } catch {
    if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)) {
      try {
        return new URL(`https://${trimmed}`);
      } catch {
        return null;
      }
    }
    return null;
  }
}

/**
 * Returns the 11-character videoId for a YouTube URL, or null for anything
 * else (including private-IP and other host SSRF attempts).
 */
export function extractYoutubeVideoId(input: string): string | null {
  const url = parseUrl(input);
  if (!url) return null;
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;

  const host = url.hostname.toLowerCase();
  if (!YOUTUBE_HOSTS.has(host)) return null;

  const candidate = (() => {
    if (host === 'youtu.be' || host === 'www.youtu.be') {
      return url.pathname.split('/').filter(Boolean)[0] ?? null;
    }
    const segments = url.pathname.split('/').filter(Boolean);
    if (segments[0] === 'watch') return url.searchParams.get('v');
    if (segments[0] === 'shorts' || segments[0] === 'embed' || segments[0] === 'live') {
      return segments[1] ?? null;
    }
    if (segments[0] === 'v') return segments[1] ?? null;
    return null;
  })();

  if (!candidate || !VIDEO_ID_PATTERN.test(candidate)) return null;
  return candidate;
}

/** Builds the oEmbed URL from a validated videoId only. */
export function buildOembedUrl(videoId: string): string {
  if (!VIDEO_ID_PATTERN.test(videoId)) {
    throw new Error('Cannot build an oEmbed URL from an invalid YouTube video id');
  }
  const watchUrl = `https://www.youtube.com/watch?v=${videoId}`;
  return `https://www.youtube.com/oembed?url=${encodeURIComponent(watchUrl)}&format=json`;
}

function stripTitleSuffixes(value: string): string {
  let result = value.trim();
  // Repeatedly remove trailing decorations such as "(Official Video)".
  for (let guard = 0; guard < 5; guard += 1) {
    const next = result.replace(TITLE_SUFFIX_PATTERN, '').trim();
    if (next === result) break;
    result = next;
  }
  return result;
}

function stripAuthorSuffix(authorName: string): string {
  return authorName.replace(/\s*-\s*Topic\s*$/i, '').trim();
}

export interface YoutubeGuess {
  artistGuess: string | null;
  titleGuess: string;
}

/**
 * Splits an oEmbed title on `" - "`, strips `(Official Video)`-style suffixes,
 * and falls back to `author_name` for the artist.
 */
export function parseYoutubeTitle(title: string, authorName?: string | null): YoutubeGuess {
  const separatorIndex = title.indexOf(' - ');
  let artistGuess: string | null = null;
  let rawTitle = title;

  if (separatorIndex > 0) {
    artistGuess = title.slice(0, separatorIndex).trim() || null;
    rawTitle = title.slice(separatorIndex + 3);
  }

  const titleGuess = stripTitleSuffixes(rawTitle) || rawTitle.trim();

  if (!artistGuess && authorName) {
    artistGuess = stripAuthorSuffix(authorName) || null;
  }

  return { artistGuess, titleGuess };
}
