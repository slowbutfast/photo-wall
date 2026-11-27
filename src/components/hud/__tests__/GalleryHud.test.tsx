// @vitest-environment jsdom

import { act, createElement, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { WallAlbum, WallPhoto } from '@/lib/layout/types';
import { useWallStore } from '@/store/useWallStore';

import GalleryHud from '../GalleryHud';
import PhotoFocusBar from '../PhotoFocusBar';

const photos: WallPhoto[] = [
  {
    id: 'p1',
    storagePath: 'photos/p1.jpg',
    width: 1600,
    height: 1200,
    aspectRatio: 4 / 3,
    dominantColor: '#888888',
    thumbHash: null,
    sortOrder: 0,
  },
  {
    id: 'p2',
    storagePath: 'photos/p2.jpg',
    width: 1200,
    height: 1600,
    aspectRatio: 3 / 4,
    dominantColor: '#999999',
    thumbHash: null,
    sortOrder: 1,
  },
];

const album: WallAlbum = {
  id: 'a1',
  slug: 'tokyo-nocturnes',
  title: 'Tokyo Nocturnes',
  description: 'Tokyo Nocturnes',
  gridColumns: 2,
  sortOrder: 0,
  position: { x: 0, y: 0 },
  bounds: { width: 12, height: 6 },
  cameraName: null,
  dateLabel: 'March 2026',
  locationLabel: 'Tokyo',
  soundtrack: null,
  photos,
};

type ViewMode = 'overview' | 'album' | 'print';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function setMode(viewMode: ViewMode) {
  useWallStore.setState({
    wall: { cdnBase: '', albums: [album] },
    viewMode,
    focusedAlbumId: viewMode === 'overview' ? null : album.id,
    focusedPhotoId: viewMode === 'print' ? photos[0].id : null,
  });
}

let root: Root | null = null;
let host: HTMLDivElement | null = null;

function mount(element: ReactElement) {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => root!.render(element));
  return host;
}

/** Mount once, read the live client markup, then unmount. */
function renderMarkup(element: ReactElement): string {
  const container = mount(element);
  const html = container.innerHTML;
  act(() => root?.unmount());
  root = null;
  host?.remove();
  host = null;
  return html;
}

beforeEach(() => {
  useWallStore.setState({
    wall: { cdnBase: '', albums: [album] },
    viewMode: 'overview',
    focusedAlbumId: null,
    focusedPhotoId: null,
    bottomInsetPx: 0,
  });
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  host?.remove();
  host = null;
  document.body.innerHTML = '';
});

describe('GalleryHud', () => {
  it.each<ViewMode>(['overview', 'album', 'print'])(
    'never lists album names or renders the removed Overview control (%s)',
    (viewMode) => {
      setMode(viewMode);
      const html = renderMarkup(createElement(GalleryHud));
      expect(html).not.toContain('hud-directory');
      expect(html).not.toContain('Exhibition Room Directory');
      expect(html).not.toContain('Tokyo Nocturnes');
      expect(html).not.toContain('Pacific Coastline');
      expect(html).not.toContain('Overview');
      expect(html).not.toContain('hud-top-right');
    },
  );

  it('hides the persistent RETURN button in overview', () => {
    setMode('overview');
    const html = renderMarkup(createElement(GalleryHud));
    expect(html).toContain('hud-return-persistent');
    expect(html).toContain('is-hidden');
    expect(html).toContain('disabled');
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain('tabindex="-1"');
    expect(html).toContain('inert');
    expect(html).toContain('RETURN');
    expect(html).not.toContain('[ESC]');
  });

  it.each<ViewMode>(['album', 'print'])(
    'shows an enabled, focusable plain RETURN button in %s',
    (viewMode) => {
      setMode(viewMode);
      const html = renderMarkup(createElement(GalleryHud));
      expect(html).toContain('hud-return-persistent');
      expect(html).not.toContain('is-hidden');
      expect(html).not.toContain('disabled');
      expect(html).not.toContain('aria-hidden="true"');
      expect(html).toContain('tabindex="0"');
      expect(html).not.toContain('inert');
      expect(html).toContain('RETURN');
      expect(html).not.toContain('[ESC]');
    },
  );

  it('steps print -> album and album -> overview through returnOneLevel()', () => {
    setMode('print');
    const container = mount(createElement(GalleryHud));
    const button = container.querySelector<HTMLButtonElement>('.hud-return-persistent')!;

    act(() => button.click());
    expect(useWallStore.getState().viewMode).toBe('album');

    act(() => button.click());
    expect(useWallStore.getState().viewMode).toBe('overview');
  });
});

describe('PhotoFocusBar', () => {
  it('renders plain PREV / NEXT with no arrows or duplicate RETURN', () => {
    setMode('print');
    const html = renderMarkup(createElement(PhotoFocusBar));
    expect(html).toContain('PREV');
    expect(html).toContain('NEXT');
    expect(html).not.toContain('←');
    expect(html).not.toContain('→');
    expect(html).not.toMatch(/<button[^>]*>RETURN/);
    expect(html).toContain('photo-focus-return-spacer');
    expect(html).not.toContain('hud-key-hint');
    expect(html).toContain('Tokyo Nocturnes');
    expect(html).toContain('March 2026');
    expect(html).toContain('Tokyo');
  });

  it('stays mounted with is-hidden + inert outside print', () => {
    setMode('album');
    const html = renderMarkup(createElement(PhotoFocusBar));
    expect(html).toContain('photo-focus-bar');
    expect(html).toContain('is-hidden');
    expect(html).toContain('inert');
    expect(html).toContain('aria-hidden="true"');
  });

  it('latches the last visible caption during the exit fade', () => {
    setMode('print');
    const container = mount(createElement(PhotoFocusBar));
    expect(container.textContent).toContain('Tokyo Nocturnes');
    expect(container.querySelector('.photo-focus-bar')?.className).not.toContain('is-hidden');

    act(() => setMode('album'));

    const bar = container.querySelector('.photo-focus-bar')!;
    expect(bar.className).toContain('is-hidden');
    expect(bar.hasAttribute('inert')).toBe(true);
    // The 0.22s fade still paints the previous album/photo content.
    expect(bar.textContent).toContain('Tokyo Nocturnes');
    expect(bar.textContent).toContain('March 2026');
    expect(useWallStore.getState().bottomInsetPx).toBe(0);
  });
});
