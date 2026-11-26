// @vitest-environment jsdom

/**
 * Macro-tier mosaic painting and canvas lifetime.
 *
 * Thumbnails resolve at different times, so a full `clearRect` + `N`-cell
 * redraw per `onload` is `O(N²)` startup work. The component must paint the
 * placeholder geometry once, draw each arriving thumbnail into its own cell,
 * refresh LRU recency on cache hits, and never zero a canvas that is still
 * mounted in a visible island.
 */

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { WallAlbum, WallPhoto } from '@/lib/layout/types';

import MacroIsland, {
  __mosaicCacheKeys,
  __mosaicForTest,
  __resetMosaicCache,
} from '../MacroIsland';

interface FakeContext {
  clearRect: ReturnType<typeof vi.fn>;
  fillRect: ReturnType<typeof vi.fn>;
  strokeRect: ReturnType<typeof vi.fn>;
  drawImage: ReturnType<typeof vi.fn>;
  fillStyle: string;
  strokeStyle: string;
  lineWidth: number;
}

let contexts = new WeakMap<HTMLCanvasElement, FakeContext>();

class FakeImage {
  static created: FakeImage[] = [];
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  decoding = '';
  private source = '';

  constructor() {
    FakeImage.created.push(this);
  }

  get src(): string {
    return this.source;
  }

  set src(value: string) {
    this.source = value;
  }
}

const ASPECTS = [4 / 5, 3 / 2, 2 / 3];

function makeAlbum(id: string, photoCount = 16): WallAlbum {
  const photos: WallPhoto[] = Array.from({ length: photoCount }, (_, index) => ({
    id: `${id}-p${index}`,
    storagePath: `albums/${id}/${index}.jpg`,
    width: 1600,
    height: 1200,
    aspectRatio: ASPECTS[index % ASPECTS.length],
    dominantColor: null,
    thumbHash: null,
    sortOrder: index,
  }));

  return {
    id,
    slug: id,
    title: `Album ${id}`,
    description: null,
    gridColumns: 4,
    sortOrder: 0,
    position: { x: 0, y: 0 },
    bounds: { width: 10, height: 8 },
    cameraName: null,
    dateLabel: null,
    locationLabel: null,
    soundtrack: null,
    photos,
  };
}

function lodUrl(_photo: WallPhoto, longestEdge: number): string {
  return `https://cdn.test/${longestEdge}.jpg`;
}

function createFakeContext(): FakeContext {
  return {
    clearRect: vi.fn(),
    fillRect: vi.fn(),
    strokeRect: vi.fn(),
    drawImage: vi.fn(),
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 0,
  };
}

let container: HTMLDivElement;
let root: Root | null = null;

async function render(album: WallAlbum): Promise<void> {
  if (!root) root = createRoot(container);
  const current = root;
  await act(async () => {
    current.render(<MacroIsland album={album} lodUrl={lodUrl} onSelect={() => {}} />);
  });
}

async function unmount(): Promise<void> {
  if (!root) return;
  const current = root;
  root = null;
  await act(async () => {
    current.unmount();
  });
}

describe('MacroIsland mosaic', () => {
  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    __resetMosaicCache();
    FakeImage.created = [];
    contexts = new WeakMap();
    vi.stubGlobal('Image', FakeImage);
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
      function (this: HTMLCanvasElement) {
        const context = createFakeContext();
        contexts.set(this, context);
        return context as unknown as CanvasRenderingContext2D;
      } as never,
    );
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(async () => {
    await unmount();
    container.remove();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('paints the placeholder once and draws only each loaded cell (O(N) draws)', async () => {
    const album = makeAlbum('one', 16);
    await render(album);

    const canvas = container.querySelector('canvas');
    expect(canvas).not.toBeNull();
    const context = contexts.get(canvas!)!;
    expect(context.clearRect).toHaveBeenCalledTimes(1);
    expect(context.fillRect.mock.calls.length).toBeGreaterThanOrEqual(album.photos.length * 2);
    expect(context.drawImage).not.toHaveBeenCalled();

    expect(FakeImage.created).toHaveLength(album.photos.length);
    for (const image of FakeImage.created) {
      await act(async () => {
        image.onload?.();
      });
    }

    expect(context.drawImage).toHaveBeenCalledTimes(album.photos.length);
    // No full repaint once a thumbnail arrives.
    expect(context.clearRect).toHaveBeenCalledTimes(1);
  });

  it('refreshes recency on a cache hit (true LRU)', async () => {
    const albumA = makeAlbum('a', 2);
    const albumB = makeAlbum('b', 2);

    await render(albumA);
    await render(albumB);
    expect(__mosaicCacheKeys()).toEqual(['a', 'b']);

    // Re-entering A is a hit and must move it to the most-recent slot.
    await render(albumA);
    expect(__mosaicCacheKeys()).toEqual(['b', 'a']);
  });

  it('does not blank a mounted canvas when it is evicted, and zeros it on unmount', async () => {
    const mounted = makeAlbum('mounted', 1);
    await render(mounted);

    const canvas = container.querySelector('canvas')!;
    expect(canvas.isConnected).toBe(true);
    const width = canvas.width;
    expect(width).toBeGreaterThan(0);

    // Fill the 120-entry cache so the mounted island's entry is evicted first.
    for (let index = 0; index < 120; index += 1) {
      __mosaicForTest(makeAlbum(`filler-${index}`, 1), lodUrl);
    }

    // Still on screen: eviction must defer disposal.
    expect(canvas.isConnected).toBe(true);
    expect(canvas.width).toBe(width);

    await unmount();
    expect(canvas.width).toBe(0);
    expect(canvas.height).toBe(0);
  });

  it('zeros a signature-mismatched canvas after it is replaced', async () => {
    const album = makeAlbum('signature', 2);
    await render(album);

    const previous = container.querySelector('canvas')!;
    expect(previous.isConnected).toBe(true);

    const changed: WallAlbum = {
      ...album,
      bounds: { width: 12, height: 8 },
    };
    await render(changed);

    const next = container.querySelector('canvas')!;
    expect(next).not.toBe(previous);
    expect(previous.isConnected).toBe(false);
    expect(previous.width).toBe(0);
    expect(next.width).toBeGreaterThan(0);
  });
});
