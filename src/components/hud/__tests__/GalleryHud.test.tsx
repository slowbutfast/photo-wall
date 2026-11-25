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

describe('GalleryHud', () => {
  it.each<ViewMode>(['overview', 'album', 'print'])(
    'never lists album names in a bottom directory (%s)',
    (mode) => {
      const html = render(mode);
      expect(html).not.toContain('hud-directory');
      expect(html).not.toContain('Exhibition Room Directory');
      expect(html).not.toContain('Tokyo Nocturnes');
      expect(html).not.toContain('Pacific Coastline');
    },
  );

  it('keeps the top-right Overview control', () => {
    expect(render('album')).toContain('Overview');
  });
});
