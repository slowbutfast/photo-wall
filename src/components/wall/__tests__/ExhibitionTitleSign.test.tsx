// @vitest-environment jsdom

import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { WallAlbum } from '@/lib/layout/types';
import { PLAYGROUND_THEMES } from '@/lib/lighting/playgroundTheme';
import { useWallStore } from '@/store/useWallStore';

import ExhibitionTitleSign from '../ExhibitionTitleSign';

vi.mock('../PlaygroundPbrWall', () => ({ default: () => null }));
vi.mock('../PrintSharpOverlay', () => ({ default: () => null }));

import GalleryCanvas from '../GalleryCanvas';

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
  dateLabel: null,
  locationLabel: null,
  soundtrack: null,
  photos: [],
};

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let host: HTMLDivElement | null = null;

function mount(element: ReturnType<typeof createElement>) {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => root!.render(element));
  return host;
}

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', ResizeObserverStub);
  vi.stubGlobal('requestAnimationFrame', vi.fn(() => 1));
  vi.stubGlobal('cancelAnimationFrame', () => {});
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
  vi.unstubAllGlobals();
});

describe('ExhibitionTitleSign', () => {
  it('renders the grid-locked Beveled Glass banner without the museum-placard class', () => {
    const html = renderToStaticMarkup(
      createElement(ExhibitionTitleSign, { left: 0, top: 0 }),
    );

    expect(html).toContain('exhibition-sign-column');
    expect(html).toContain('exhibition-title-placard');
    expect(html).toContain('mat-acrylic');
    expect(html).not.toContain('mat-aluminum');
    expect(html).not.toContain('museum-placard');
    expect(html).toContain("greg&#x27;s");
    expect(html).toContain('photo wall');
    expect(html).toContain('placard-standoff left');
    expect(html).toContain('placard-standoff right');
    expect(html).toContain('width:452px');
    expect(html).toContain('height:200px');
  });

  it('renders ← home as a direct portfolio link', () => {
    const html = renderToStaticMarkup(
      createElement(ExhibitionTitleSign, { left: 0, top: 0 }),
    );

    expect(html).toContain('href="https://gregory-lazatin.com"');
    expect(html).toContain('exhibition-home-link');
    expect(html).toContain('home-arrow');
    expect(html).toContain('←');
    expect(html).toContain('home');
  });
});

describe('GalleryCanvas native pointer isolation for .exhibition-sign-column', () => {
  it('mounts the sign inside .wall-world to the left of the top-left album', () => {
    const container = mount(
      createElement(GalleryCanvas, {
        albums: [album],
        lodUrl: () => '',
        theme: PLAYGROUND_THEMES.chiaroscuro,
      }),
    );

    const world = container.querySelector('.wall-world');
    const sign = container.querySelector('.exhibition-sign-column');
    expect(world).not.toBeNull();
    expect(sign).not.toBeNull();
    expect(world!.contains(sign)).toBe(true);

    // 100px = 1 world unit: a 452px banner + 94px gap left of the adjacent
    // album placard, vertically flush with that placard's 200px height.
    const signLeft = Number.parseFloat((sign as HTMLElement).style.left);
    expect(signLeft).toBeCloseTo(-1126, 5);
    expect(Number.parseFloat((sign as HTMLElement).style.top)).toBeCloseTo(-272, 5);
    expect((sign as HTMLElement).style.width).toBe('452px');
    const placard = sign!.querySelector<HTMLElement>('.exhibition-title-placard')!;
    expect(placard.style.width).toBe('452px');
    expect(placard.style.height).toBe('200px');
  });

  it('never starts a wall pan from pointerdown/pointermove on ← home', () => {
    // No focused album => no entry fly-to, so the pan loop starts idle.
    useWallStore.setState({ viewMode: 'album', focusedAlbumId: null, focusedPhotoId: null });
    const container = mount(
      createElement(GalleryCanvas, {
        albums: [album],
        lodUrl: () => '',
        theme: PLAYGROUND_THEMES.chiaroscuro,
      }),
    );

    const world = container.querySelector<HTMLElement>('.wall-world')!;
    const link = container.querySelector<HTMLElement>('.exhibition-home-link')!;
    const raf = vi.mocked(globalThis.requestAnimationFrame);
    world.style.willChange = '';

    act(() => {
      link.dispatchEvent(
        new MouseEvent('pointerdown', { bubbles: true, clientX: 20, clientY: 20 }),
      );
      link.dispatchEvent(
        new MouseEvent('pointermove', { bubbles: true, clientX: 80, clientY: 60 }),
      );
    });

    expect(world.style.willChange).toBe('');
    expect(raf).not.toHaveBeenCalled();

    // Control: the same gesture on the bare wall does arm the pan loop.
    act(() => {
      container
        .querySelector<HTMLElement>('.wall-viewport')!
        .dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, clientX: 20, clientY: 20 }));
    });
    expect(raf).toHaveBeenCalled();
  });

  it('ignores background clicks that start inside .exhibition-sign-column', () => {
    useWallStore.setState({ viewMode: 'album', focusedAlbumId: album.id });
    const container = mount(
      createElement(GalleryCanvas, {
        albums: [album],
        lodUrl: () => '',
        theme: PLAYGROUND_THEMES.chiaroscuro,
      }),
    );

    const placard = container.querySelector<HTMLElement>('.exhibition-title-placard')!;
    act(() => {
      placard.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(useWallStore.getState().viewMode).toBe('album');
  });
});
