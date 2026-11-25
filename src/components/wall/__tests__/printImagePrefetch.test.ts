import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { __heldPrefetchCount, __resetPrefetch, prefetchPrintImage } from '../printImagePrefetch';

class FakeImage {
  static created: FakeImage[] = [];
  src = '';
  decoding = '';
  constructor() {
    FakeImage.created.push(this);
  }
  decode() {
    return Promise.resolve();
  }
}

describe('prefetchPrintImage', () => {
  beforeEach(() => {
    FakeImage.created = [];
    __resetPrefetch();
    vi.stubGlobal('Image', FakeImage);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('requests each URL once and ignores empty input', () => {
    prefetchPrintImage('https://cdn/a.jpg?width=2048');
    prefetchPrintImage('https://cdn/a.jpg?width=2048');
    prefetchPrintImage(null);
    prefetchPrintImage('');
    expect(FakeImage.created.map((image) => image.src)).toEqual(['https://cdn/a.jpg?width=2048']);
  });

  it('keeps at most 3 images alive, dropping the oldest', () => {
    for (let index = 0; index < 12; index += 1) prefetchPrintImage(`https://cdn/${index}.jpg`);
    expect(__heldPrefetchCount()).toBe(3);
    // The oldest was evicted, so asking again creates a fresh request.
    const before = FakeImage.created.length;
    prefetchPrintImage('https://cdn/0.jpg');
    expect(FakeImage.created.length).toBe(before + 1);
  });

  it('is a no-op when Image is unavailable (server render)', () => {
    vi.stubGlobal('Image', undefined);
    expect(() => prefetchPrintImage('https://cdn/x.jpg')).not.toThrow();
  });
});
