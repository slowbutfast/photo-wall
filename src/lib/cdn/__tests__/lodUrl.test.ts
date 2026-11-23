import { describe, expect, it } from 'vitest';

import { buildLodUrl, longestEdgeParams, normalizeCdnBase } from '@/lib/cdn/lodUrl';

describe('longestEdgeParams', () => {
  it('uses a width constraint for landscape photos', () => {
    expect(longestEdgeParams(800, 1.5)).toEqual({ width: 800 });
  });

  it('uses a height constraint for portrait photos', () => {
    expect(longestEdgeParams(800, 0.75)).toEqual({ height: 800 });
  });

  it('uses a width constraint for square photos', () => {
    expect(longestEdgeParams(640, 1)).toEqual({ width: 640 });
  });

  it('clamps invalid target sizes to positive integers', () => {
    expect(longestEdgeParams(0, 1)).toEqual({ width: 1 });
    expect(longestEdgeParams(320.4, 1.5)).toEqual({ width: 320 });
  });
});

describe('buildLodUrl', () => {
  it('builds a Bunny Optimizer width URL for landscape images', () => {
    expect(buildLodUrl('https://cdn.example.com', '/albums/a1/p1.jpg', 800, 1.6)).toBe(
      'https://cdn.example.com/albums/a1/p1.jpg?width=800',
    );
  });

  it('builds a Bunny Optimizer height URL for portrait images', () => {
    expect(buildLodUrl('https://cdn.example.com/', '/albums/a1/p1.jpg', 512, 0.5)).toBe(
      'https://cdn.example.com/albums/a1/p1.jpg?height=512',
    );
  });

  it('works against the local uploads base', () => {
    expect(buildLodUrl('/api/local-uploads', 'albums/a1/p1.webp', 1200, 1.2)).toBe(
      '/api/local-uploads/albums/a1/p1.webp?width=1200',
    );
  });

  it('normalizes duplicated slashes at the join point', () => {
    expect(buildLodUrl('https://cdn.example.com//', '//albums/a1/p1.jpg', 100, 1)).toBe(
      'https://cdn.example.com/albums/a1/p1.jpg?width=100',
    );
  });
});

describe('normalizeCdnBase', () => {
  it('strips trailing slashes', () => {
    expect(normalizeCdnBase('https://cdn.example.com///')).toBe('https://cdn.example.com');
    expect(normalizeCdnBase('/api/local-uploads/')).toBe('/api/local-uploads');
  });
});
