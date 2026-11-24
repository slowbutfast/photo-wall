import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

type ViewMode = 'overview' | 'album' | 'print';

// zustand serves its initial state during server rendering, so drive the HUD
// through a mutable fake store instead of `setState`.
const fake = vi.hoisted(() => ({
  state: {
    wall: { albums: [] as { id: string; title: string }[] },
    viewMode: 'overview' as 'overview' | 'album' | 'print',
    focusedAlbumId: null as string | null,
    goOverview: () => {},
    enterAlbum: () => {},
  },
}));

vi.mock('@/store/useWallStore', () => ({
  useWallStore: (selector: (state: typeof fake.state) => unknown) => selector(fake.state),
}));

import GalleryHud from '../GalleryHud';

function render(viewMode: ViewMode): string {
  fake.state.wall.albums = [
    { id: 'a1', title: 'Tokyo Nocturnes' },
    { id: 'a2', title: 'Pacific Coastline' },
  ];
  fake.state.viewMode = viewMode;
  fake.state.focusedAlbumId = viewMode === 'overview' ? null : 'a1';
  return renderToStaticMarkup(createElement(GalleryHud));
}

describe('GalleryHud directory visibility', () => {
  it('hides the album directory in Overview', () => {
    const html = render('overview');
    expect(html).not.toContain('hud-directory');
    expect(html).not.toContain('Tokyo Nocturnes');
    expect(html).toContain('Overview');
  });

  it('shows the directory only while an album is focused', () => {
    const html = render('album');
    expect(html).toContain('Exhibition Room Directory');
    expect(html).toContain('Tokyo Nocturnes');
    expect(html).toContain('Pacific Coastline');
  });

  it('hides the directory in Print Focus', () => {
    expect(render('print')).not.toContain('hud-directory');
  });
});
