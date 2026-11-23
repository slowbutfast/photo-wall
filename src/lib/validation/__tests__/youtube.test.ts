import { describe, expect, it } from 'vitest';

import {
  buildOembedUrl,
  extractYoutubeVideoId,
  parseYoutubeTitle,
} from '@/lib/validation/youtube';

const VIDEO_ID = 'dQw4w9WgXcQ';

describe('extractYoutubeVideoId', () => {
  it('accepts canonical watch URLs', () => {
    expect(extractYoutubeVideoId(`https://www.youtube.com/watch?v=${VIDEO_ID}`)).toBe(VIDEO_ID);
    expect(extractYoutubeVideoId(`https://youtube.com/watch?v=${VIDEO_ID}&t=42`)).toBe(VIDEO_ID);
  });

  it('accepts youtu.be short links, shorts, embed and music hosts', () => {
    expect(extractYoutubeVideoId(`https://youtu.be/${VIDEO_ID}`)).toBe(VIDEO_ID);
    expect(extractYoutubeVideoId(`https://www.youtube.com/shorts/${VIDEO_ID}`)).toBe(VIDEO_ID);
    expect(extractYoutubeVideoId(`https://www.youtube.com/embed/${VIDEO_ID}`)).toBe(VIDEO_ID);
    expect(extractYoutubeVideoId(`https://music.youtube.com/watch?v=${VIDEO_ID}`)).toBe(VIDEO_ID);
    expect(extractYoutubeVideoId(`www.youtube.com/watch?v=${VIDEO_ID}`)).toBe(VIDEO_ID);
  });

  it('rejects private-IP and non-YouTube origins without any request', () => {
    expect(extractYoutubeVideoId('http://169.254.169.254/latest/meta-data')).toBeNull();
    expect(extractYoutubeVideoId('http://127.0.0.1:8080/watch?v=dQw4w9WgXcQ')).toBeNull();
    expect(extractYoutubeVideoId('https://vimeo.com/123456789')).toBeNull();
    expect(extractYoutubeVideoId('file:///etc/passwd')).toBeNull();
  });

  it('rejects invalid or malformed video IDs', () => {
    expect(extractYoutubeVideoId('https://www.youtube.com/watch?v=short')).toBeNull();
    expect(extractYoutubeVideoId(`https://www.youtube.com/watch?v=${VIDEO_ID}x`)).toBeNull();
    expect(extractYoutubeVideoId('https://www.youtube.com/watch')).toBeNull();
    expect(extractYoutubeVideoId('')).toBeNull();
  });
});

describe('buildOembedUrl', () => {
  it('constructs the oEmbed URL strictly from a validated videoId', () => {
    expect(buildOembedUrl(VIDEO_ID)).toBe(
      `https://www.youtube.com/oembed?url=https%3A%2F%2Fwww.youtube.com%2Fwatch%3Fv%3D${VIDEO_ID}&format=json`,
    );
  });

  it('refuses to build a URL from an invalid videoId', () => {
    expect(() => buildOembedUrl('../../etc/passwd')).toThrow();
  });
});

describe('parseYoutubeTitle', () => {
  it('splits "Artist - Title" and strips official-video suffixes', () => {
    expect(parseYoutubeTitle('Massive Attack - Teardrop (Official Video)', null)).toEqual({
      artistGuess: 'Massive Attack',
      titleGuess: 'Teardrop',
    });
  });

  it('falls back to author_name when the title has no artist segment', () => {
    expect(parseYoutubeTitle('Teardrop (Official Video)', 'Massive Attack - Topic')).toEqual({
      artistGuess: 'Massive Attack',
      titleGuess: 'Teardrop',
    });
  });

  it('returns a null artist when neither title nor author identify one', () => {
    expect(parseYoutubeTitle('Teardrop [Official Audio]', null)).toEqual({
      artistGuess: null,
      titleGuess: 'Teardrop',
    });
  });

  it('keeps multi-hyphen titles intelligible', () => {
    expect(parseYoutubeTitle('Artist - Song - Part 2 (Lyrics)', 'Artist')).toEqual({
      artistGuess: 'Artist',
      titleGuess: 'Song - Part 2',
    });
  });
});
