// @vitest-environment jsdom

/**
 * Macro-tier mosaic painting and canvas lifetime.
 *
 * Thumbnails resolve at different times, so a full `clearRect` + `N`-cell
 * redraw per `onload` is `O(N²)` startup work. The component must paint the
 * placeholder geometry once, draw each arriving thumbnail into its own cell,
 * refresh LRU recency on cache hits, and never zero a canvas that is still
 * mounted in a visible island.
 *
 * Since `macro-lod-continuity` the placeholder also reserves the album tier's
 * footprint: a placard plate in the live material's colours, greeked title and
 * caption bars, and a soundtrack slot. It still draws no text and requests no
 * soundtrack thumbnail.
 */

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { WallAlbum, WallPhoto, WallSoundtrack } from '@/lib/layout/types';
import { PLAYGROUND_THEMES } from '@/lib/lighting/playgroundTheme';

import MacroIsland, {
  __mosaicCacheKeys,
  __mosaicForTest,
  __resetMosaicCache,
} from '../MacroIsland';
import {
  planMacroMosaic,
  resolveMacroMosaicPalette,
  type MacroMosaicPalette,
  type MosaicPlan,
} from '../macroMosaic';
import type { PlacardMaterial } from '../placardMaterial';

interface PaintCall {
  op: 'fill' | 'stroke' | 'text';
  x: number;
  y: number;
  width: number;
  height: number;
  style: string;
  lineWidth: number;
}

interface FakeContext {
  clearRect: ReturnType<typeof vi.fn>;
  fillRect: ReturnType<typeof vi.fn>;
  strokeRect: ReturnType<typeof vi.fn>;
  drawImage: ReturnType<typeof vi.fn>;
  fillText: ReturnType<typeof vi.fn>;
  measureText: ReturnType<typeof vi.fn>;
  createLinearGradient: ReturnType<typeof vi.fn>;
  fillStyle: string;
  strokeStyle: string;
  lineWidth: number;
  paintLog: PaintCall[];
  fillStyleLog: string[];
  strokeStyleLog: string[];
  gradientStops: string[];
  gradientCalls: Array<{ x0: number; y0: number; x1: number; y1: number }>;
}

/** `missing` and `throwing` exercise the solid-fill fallback. */
let gradientMode: 'ok' | 'missing' | 'throwing' = 'ok';

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

const SOUNDTRACK: WallSoundtrack = {
  videoId: 'jfKfPfyJRdk',
  artist: 'Lofi Girl',
  title: 'lofi hip hop radio',
  durationSec: 3600,
};

function makeAlbum(
  id: string,
  photoCount = 16,
  overrides: Partial<WallAlbum> = {},
): WallAlbum {
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
    ...overrides,
  };
}

function lodUrl(_photo: WallPhoto, longestEdge: number): string {
  return `https://cdn.test/${longestEdge}.jpg`;
}

/** Minimal palette for the lifetime assertions, which never read a colour. */
const NEUTRAL_PALETTE: MacroMosaicPalette = {
  key: 'neutral',
  plate: { kind: 'solid', color: '#101010' },
  edges: null,
  titleInk: 'rgba(244, 246, 244, 0.34)',
  captionInk: 'rgba(240, 244, 241, 0.24)',
  slot: { fill: '#161616', stroke: 'rgba(255, 255, 255, 0.08)' },
};

/**
 * Resolved lazily so the pre-existing lifetime assertions, which never read a
 * colour, keep running while `resolveMacroMosaicPalette` does not exist yet.
 */
function paletteOf(
  mood: keyof typeof PLAYGROUND_THEMES,
  material: PlacardMaterial,
  coarse = false,
) {
  return resolveMacroMosaicPalette(PLAYGROUND_THEMES[mood], material, coarse);
}

/** Narrow the acrylic plate to its three stops for a readable assertion. */
function plateStops(palette: ReturnType<typeof paletteOf>): [string, string, string] {
  if (palette.plate.kind !== 'gradient') throw new Error('expected an acrylic gradient plate');
  return palette.plate.stops;
}

function createFakeContext(): FakeContext {
  const paintLog: PaintCall[] = [];
  const fillStyleLog: string[] = [];
  const strokeStyleLog: string[] = [];
  const gradientStops: string[] = [];
  const gradientCalls: Array<{ x0: number; y0: number; x1: number; y1: number }> = [];

  let fillStyle = '';
  let strokeStyle = '';
  let lineWidth = 1;

  const styleOf = (value: unknown) => (typeof value === 'string' ? value : '<gradient>');

  const context: FakeContext = {
    clearRect: vi.fn(),
    fillRect: vi.fn((x: number, y: number, width: number, height: number) => {
      paintLog.push({ op: 'fill', x, y, width, height, style: styleOf(fillStyle), lineWidth });
    }),
    strokeRect: vi.fn((x: number, y: number, width: number, height: number) => {
      paintLog.push({ op: 'stroke', x, y, width, height, style: styleOf(strokeStyle), lineWidth });
    }),
    drawImage: vi.fn(),
    fillText: vi.fn(),
    measureText: vi.fn(() => ({ width: 0 })),
    createLinearGradient: vi.fn(),
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    paintLog,
    fillStyleLog,
    strokeStyleLog,
    gradientStops,
    gradientCalls,
  };

  if (gradientMode === 'missing') {
    // Simulate a canvas without gradient support.
    delete (context as { createLinearGradient?: unknown }).createLinearGradient;
  } else {
    context.createLinearGradient.mockImplementation(
      (x0: number, y0: number, x1: number, y1: number) => {
        if (gradientMode === 'throwing') throw new Error('createLinearGradient is unavailable');
        gradientCalls.push({ x0, y0, x1, y1 });
        return {
          addColorStop: vi.fn((_offset: number, colour: string) => {
            gradientStops.push(colour);
          }),
        } as unknown as CanvasGradient;
      },
    );
  }

  Object.defineProperty(context, 'fillStyle', {
    get: () => fillStyle,
    set: (value: string) => {
      fillStyle = value;
      fillStyleLog.push(styleOf(value));
    },
  });
  Object.defineProperty(context, 'strokeStyle', {
    get: () => strokeStyle,
    set: (value: string) => {
      strokeStyle = value;
      strokeStyleLog.push(styleOf(value));
    },
  });
  Object.defineProperty(context, 'lineWidth', {
    get: () => lineWidth,
    set: (value: number) => {
      lineWidth = value;
    },
  });

  return context as unknown as FakeContext;
}

let container: HTMLDivElement;
let root: Root | null = null;

async function render(album: WallAlbum, palette?: ReturnType<typeof paletteOf>): Promise<void> {
  if (!root) root = createRoot(container);
  const current = root;
  const activePalette = palette ?? NEUTRAL_PALETTE;
  await act(async () => {
    current.render(
      <MacroIsland album={album} lodUrl={lodUrl} palette={activePalette} onSelect={() => {}} />,
    );
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

function contextFor(selector = 'canvas'): FakeContext {
  const canvas = container.querySelector(selector);
  expect(canvas).not.toBeNull();
  return contexts.get(canvas as HTMLCanvasElement)!;
}

/** Fills whose rect matches `rect` within `tolerance` buffer px. */
function fillsAt(context: FakeContext, rect: { x: number; y: number; width: number; height: number }, tolerance = 0.75) {
  return context.paintLog.filter(
    (call) =>
      call.op === 'fill' &&
      Math.abs(call.x - rect.x) <= tolerance &&
      Math.abs(call.y - rect.y) <= tolerance &&
      Math.abs(call.width - rect.width) <= tolerance &&
      Math.abs(call.height - rect.height) <= tolerance,
  );
}

describe('MacroIsland mosaic', () => {
  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    __resetMosaicCache();
    FakeImage.created = [];
    contexts = new WeakMap();
    gradientMode = 'ok';
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
      __mosaicForTest(makeAlbum(`filler-${index}`, 1), lodUrl, NEUTRAL_PALETTE);
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

describe('MacroIsland placard and soundtrack footprint', () => {
  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    __resetMosaicCache();
    FakeImage.created = [];
    contexts = new WeakMap();
    gradientMode = 'ok';
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

  function planOf(album: WallAlbum): MosaicPlan {
    return planMacroMosaic(album);
  }

  it('paints the plate, its three acrylic stops and three greeked bars', async () => {
    const album = makeAlbum('footprint', 8, {
      description: 'throwback to bali group 19',
      soundtrack: SOUNDTRACK,
    });
    await render(album, paletteOf('chiaroscuro', 'acrylic'));

    const context = contextFor();
    const plan = planOf(album);

    // One gradient across the plate, with the theme's three stops in order.
    expect(context.gradientCalls).toHaveLength(1);
    expect(context.gradientStops).toEqual(plateStops(paletteOf('chiaroscuro', 'acrylic')));
    expect(fillsAt(context, plan.placard)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ style: '<gradient>' }),
      ]),
    );

    // The flat offset shadow the cells already use, painted under the plate.
    expect(
      context.paintLog.some(
        (call) =>
          call.op === 'fill' &&
          call.style === 'rgba(0, 0, 0, 0.45)' &&
          Math.abs(call.x - plan.placard.x) <= 0.75 &&
          Math.abs(call.y - (plan.placard.y + 2)) <= 0.75,
      ),
    ).toBe(true);

    // The acrylic glass edges.
    expect(context.fillStyleLog).toContain('rgba(242, 255, 248, 0.72)');
    expect(context.fillStyleLog).toContain('rgba(140, 185, 165, 0.52)');

    // Three greeked bars at the design.md placard-local rects.
    expect(plan.placardLines).toHaveLength(3);
    const inks = [
      paletteOf('chiaroscuro', 'acrylic').titleInk,
      paletteOf('chiaroscuro', 'acrylic').captionInk,
      paletteOf('chiaroscuro', 'acrylic').captionInk,
    ];
    plan.placardLines.forEach((bar, index) => {
      const fills = fillsAt(context, bar);
      expect(fills.some((call) => call.style === inks[index])).toBe(true);
    });

    // The soundtrack slot: #161616 fill plus its 1px pale stroke.
    expect(plan.soundtrack).not.toBeNull();
    const slotFills = fillsAt(context, plan.soundtrack!);
    expect(slotFills.some((call) => call.style === '#161616')).toBe(true);
    expect(context.strokeStyleLog).toContain('rgba(255, 255, 255, 0.08)');
  });

  it('paints only the plate and one bar without a soundtrack or description', async () => {
    const album = makeAlbum('bare', 8);
    await render(album, paletteOf('chiaroscuro', 'acrylic'));

    const context = contextFor();
    const plan = planOf(album);
    expect(plan.placardLines).toHaveLength(1);
    expect(plan.soundtrack).toBeNull();

    expect(fillsAt(context, plan.placard).some((call) => call.style === '<gradient>')).toBe(true);
    expect(context.fillStyleLog).toContain(paletteOf('chiaroscuro', 'acrylic').titleInk);
    expect(context.fillStyleLog).not.toContain(paletteOf('chiaroscuro', 'acrylic').captionInk);
    expect(context.fillStyleLog).not.toContain('#161616');

    // Nothing below the placard in the placard column.
    const aboveSlot = plan.placard.y + plan.placard.height + 1;
    const below = context.paintLog.filter(
      (call) =>
        call.x < plan.placard.x + plan.placard.width &&
        call.y > aboveSlot,
    );
    expect(below).toEqual([]);
  });

  it('never draws text, never fetches a soundtrack image, and never paints the old pale square', async () => {
    const album = makeAlbum('quiet', 6, {
      description: 'spent over a decade...',
      soundtrack: SOUNDTRACK,
    });
    await render(album, paletteOf('chiaroscuro', 'acrylic'));

    const context = contextFor();
    expect(context.fillText).not.toHaveBeenCalled();
    expect(context.measureText).not.toHaveBeenCalled();

    expect(FakeImage.created).toHaveLength(album.photos.length);
    for (const image of FakeImage.created) {
      expect(image.src).toMatch(/\/256\.jpg$/);
    }
    expect(FakeImage.created.some((image) => image.src.includes(SOUNDTRACK.videoId))).toBe(false);

    expect(context.fillStyleLog).not.toContain('rgba(226, 242, 234, 0.18)');
    expect(context.strokeStyleLog).not.toContain('rgba(240, 245, 242, 0.22)');
  });

  it('fills solid with the 55% stop when createLinearGradient is missing', async () => {
    gradientMode = 'missing';
    const album = makeAlbum('fallback', 4, {
      description: 'caption',
      soundtrack: SOUNDTRACK,
    });
    await render(album, paletteOf('chiaroscuro', 'acrylic'));

    const context = contextFor();
    const plan = planOf(album);
    expect(context.createLinearGradient).toBeUndefined();
    expect(
      fillsAt(context, plan.placard).some(
        (call) => call.style === plateStops(paletteOf('chiaroscuro', 'acrylic'))[1],
      ),
    ).toBe(true);
  });

  it('survives a createLinearGradient that throws', async () => {
    gradientMode = 'throwing';
    const album = makeAlbum('throwing', 4) as WallAlbum;
    await expect(render(album, paletteOf('chiaroscuro', 'acrylic'))).resolves.toBeUndefined();

    const context = contextFor();
    const plan = planOf(album);
    expect(
      fillsAt(context, plan.placard).some(
        (call) => call.style === plateStops(paletteOf('chiaroscuro', 'acrylic'))[1],
      ),
    ).toBe(true);
  });

  it('uses the fixed aluminum fill and its dark ink', async () => {
    const album = makeAlbum('metal', 4, { description: 'caption' });
    await render(album, paletteOf('chiaroscuro', 'aluminum'));

    const context = contextFor();
    const plan = planOf(album);
    expect(context.createLinearGradient).not.toHaveBeenCalled();
    expect(fillsAt(context, plan.placard).some((call) => call.style === '#d2d5d9')).toBe(true);
    expect(context.fillStyleLog).toContain(paletteOf('chiaroscuro', 'aluminum').titleInk);
    expect(context.fillStyleLog).toContain(paletteOf('chiaroscuro', 'aluminum').captionInk);
  });
});

describe('MacroIsland palette signature', () => {
  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    __resetMosaicCache();
    FakeImage.created = [];
    contexts = new WeakMap();
    gradientMode = 'ok';
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

  it('reuses the canvas when the palette key is unchanged', async () => {
    const album = makeAlbum('stable', 2, { description: 'caption' });
    await render(album, paletteOf('chiaroscuro', 'acrylic'));
    const first = container.querySelector('canvas');

    // Concrete shares chiaroscuro's fine acrylic stops, so it is a cache hit.
    await render(album, resolveMacroMosaicPalette(PLAYGROUND_THEMES.concrete, 'acrylic', false));
    expect(container.querySelector('canvas')).toBe(first);
  });

  it('replaces the mosaic when the palette changes, and zeros the old canvas after detaching', async () => {
    const album = makeAlbum('mood', 2, { description: 'caption' });
    await render(album, paletteOf('chiaroscuro', 'acrylic'));
    const previous = container.querySelector('canvas')!;
    const width = previous.width;
    expect(width).toBeGreaterThan(0);

    await render(album, paletteOf('alabaster', 'acrylic'));
    const next = container.querySelector('canvas')!;

    expect(next).not.toBe(previous);
    expect(previous.isConnected).toBe(false);
    expect(previous.width).toBe(0);
    // The visible island is never blanked: the replacement is already sized.
    expect(next.width).toBe(width);

    const context = contexts.get(next)!;
    expect(context.gradientStops).toEqual(plateStops(paletteOf('alabaster', 'acrylic')));
  });

  it('replaces the mosaic when the description appears or disappears', async () => {
    const album = makeAlbum('described', 2);
    await render(album, paletteOf('chiaroscuro', 'acrylic'));
    const first = container.querySelector('canvas');

    await render({ ...album, description: 'now there is a caption' }, paletteOf('chiaroscuro', 'acrylic'));
    const second = container.querySelector('canvas');
    expect(second).not.toBe(first);

    await render(album, paletteOf('chiaroscuro', 'acrylic'));
    expect(container.querySelector('canvas')).not.toBe(second);
  });
});
