import { describe, expect, it } from 'vitest';

import { BASE_PATH, withBase } from '@/lib/basePath';

describe('BASE_PATH', () => {
  it('is the single /photos constant', () => {
    expect(BASE_PATH).toBe('/photos');
  });
});

describe('withBase', () => {
  it('prefixes root-relative app paths', () => {
    expect(withBase('/api/wall')).toBe('/photos/api/wall');
    expect(withBase('/textures/wall/wall_albedo.webp')).toBe('/photos/textures/wall/wall_albedo.webp');
    expect(withBase('/demo')).toBe('/photos/demo');
    expect(withBase('/api/youtube/thumb/abc?x=1')).toBe('/photos/api/youtube/thumb/abc?x=1');
  });

  it('passes absolute, protocol-relative, data: and blob: URLs through unchanged', () => {
    for (const url of [
      'https://cdn.example.com/a.jpg',
      'http://cdn.example.com/a.jpg',
      '//cdn.example.com/a.jpg',
      'data:image/png;base64,AA',
      'blob:https://example.com/uuid',
    ]) {
      expect(withBase(url)).toBe(url);
    }
  });

  it('passes relative (non-root) paths through unchanged', () => {
    expect(withBase('textures/a.webp')).toBe('textures/a.webp');
    expect(withBase('./a.webp')).toBe('./a.webp');
  });

  it('is idempotent on already-prefixed paths', () => {
    expect(withBase('/photos')).toBe('/photos');
    expect(withBase('/photos/api/wall')).toBe('/photos/api/wall');
    expect(withBase('/photos?demo=4')).toBe('/photos?demo=4');
    expect(withBase(withBase('/api/wall'))).toBe('/photos/api/wall');
  });

  it('does not treat a look-alike prefix as already prefixed', () => {
    expect(withBase('/photosynthesis')).toBe('/photos/photosynthesis');
  });
});
