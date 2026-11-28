// @vitest-environment jsdom

/**
 * `soundtrack-playback-sync` — the plaque's bridge to the youtube-nocookie
 * embed: embed params, the `listening` handshake and its retry, origin and
 * source filtering, autoplay-refusal detection, the silent-bridge fallback and
 * the throttled clock write.
 */

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { WallAlbum } from '@/lib/layout/types';
import { useWallStore } from '@/store/useWallStore';

import SoundtrackPlaque from '../SoundtrackPlaque';
import { createSoundtrackState } from '../soundtrackState';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const ORIGIN = 'https://www.youtube-nocookie.com';

const ALBUM: WallAlbum = {
  id: 'album-a',
  slug: 'album-a',
  title: 'Album A',
  description: null,
  gridColumns: 4,
  sortOrder: 0,
  position: { x: 0, y: 0 },
  bounds: { width: 10, height: 8 },
  cameraName: null,
  dateLabel: null,
  locationLabel: null,
  soundtrack: { videoId: 'jNQXAC9IVRw', artist: 'Artist', title: 'Song', durationSec: 190 },
  photos: Array.from({ length: 4 }, (_, index) => ({
    id: `p${index}`,
    storagePath: `albums/a/${index}.jpg`,
    width: 1600,
    height: 1200,
    aspectRatio: 4 / 3,
    dominantColor: null,
    thumbHash: null,
    sortOrder: index,
  })),
};

let host: HTMLDivElement;
let root: Root;

const msg = (value: unknown) => JSON.stringify(value);
const state = (info: number) => msg({ event: 'onStateChange', info });
const delivery = (info: Record<string, unknown>) => msg({ event: 'infoDelivery', info });

function iframe(): HTMLIFrameElement {
  const found = host.querySelector<HTMLIFrameElement>('.soundtrack-iframe');
  if (!found) throw new Error('iframe not mounted');
  return found;
}

async function mount() {
  useWallStore.getState().dispatchSoundtrack({ type: 'enter-album', albumId: ALBUM.id });
  await act(async () => {
    root.render(<SoundtrackPlaque album={ALBUM} tier="album" />);
  });
  await act(async () => {
    host.querySelector<HTMLButtonElement>('.soundtrack-facade')?.click();
  });
}

async function load() {
  await act(async () => {
    iframe().dispatchEvent(new Event('load'));
  });
}

async function send(data: unknown, overrides: { origin?: string; source?: Window | null } = {}) {
  const frame = iframe();
  await act(async () => {
    window.dispatchEvent(
      new MessageEvent('message', {
        data,
        origin: overrides.origin ?? ORIGIN,
        source: overrides.source === undefined ? frame.contentWindow : overrides.source,
      }),
    );
  });
}

async function advance(ms: number) {
  await act(async () => {
    vi.advanceTimersByTime(ms);
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  useWallStore.setState({
    soundtrack: createSoundtrackState('overview'),
    soundtrackClock: { albumId: null, positionSec: 0, at: 0 },
  });
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('embed URL', () => {
  it('asks for the JS API bridge and passes the page origin', async () => {
    await mount();
    const src = new URL(iframe().src);
    expect(src.searchParams.get('enablejsapi')).toBe('1');
    expect(src.searchParams.get('origin')).toBe(window.location.origin);
    expect(src.searchParams.get('autoplay')).toBe('1');
    expect(src.searchParams.get('playsinline')).toBe('1');
    expect(src.host).toBe('www.youtube-nocookie.com');
  });
});

describe('listening handshake', () => {
  it('posts listening on load, retries every 250ms, and stops after the first message', async () => {
    await mount();
    const post = vi.spyOn(iframe().contentWindow as Window, 'postMessage');
    await load();
    expect(post).toHaveBeenCalledTimes(1);
    expect(post).toHaveBeenLastCalledWith(
      '{"event":"listening","id":"album-a","channel":"widget"}',
      ORIGIN,
    );
    await advance(250);
    await advance(250);
    expect(post).toHaveBeenCalledTimes(3);

    await send(msg({ event: 'onReady', info: null }));
    await advance(1000);
    expect(post).toHaveBeenCalledTimes(3);
  });

  it('gives up retrying after 3000ms of silence', async () => {
    await mount();
    const post = vi.spyOn(iframe().contentWindow as Window, 'postMessage');
    await load();
    await advance(3000);
    const calls = post.mock.calls.length;
    await advance(2000);
    expect(post.mock.calls.length).toBe(calls);
  });
});

describe('message filtering', () => {
  it('ignores messages from another origin or another window', async () => {
    await mount();
    await load();
    await send(state(1), { origin: 'https://evil.example' });
    expect(useWallStore.getState().soundtrack.playing).toBe(false);
    await send(state(1), { source: window });
    expect(useWallStore.getState().soundtrack.playing).toBe(false);
    await send(state(1));
    expect(useWallStore.getState().soundtrack.playing).toBe(true);
  });
});

describe('player state', () => {
  it('follows play and pause reports', async () => {
    await mount();
    await load();
    await send(delivery({ playerState: -1, currentTime: 0 }));
    expect(useWallStore.getState().soundtrack.playing).toBe(false);
    await send(delivery({ playerState: 1, currentTime: 0.2 }));
    expect(useWallStore.getState().soundtrack.playing).toBe(true);
    await send(delivery({ playerState: 2, currentTime: 42.3 }));
    expect(useWallStore.getState().soundtrack.playing).toBe(false);
    expect(useWallStore.getState().soundtrackClock).toMatchObject({
      albumId: 'album-a',
      positionSec: 42.3,
    });
  });

  it('stops the track on state 0', async () => {
    await mount();
    await load();
    await send(state(1));
    await send(state(0));
    expect(useWallStore.getState().soundtrack.playing).toBe(false);
  });
});

describe('autoplay refusal', () => {
  it('lifts the capture layer once, 1500ms after the first message, when the player stays unstarted', async () => {
    await mount();
    await load();
    expect(host.querySelector('.soundtrack-capture-layer')).not.toBeNull();
    await send(delivery({ playerState: -1, currentTime: 0 }));
    await send(delivery({ playerState: 5, currentTime: 0 }));
    await advance(1400);
    expect(host.querySelector('.soundtrack-capture-layer')).not.toBeNull();
    await advance(200);
    expect(host.querySelector('.soundtrack-capture-layer')).toBeNull();
    expect(useWallStore.getState().soundtrack.captureLayerActive).toBe(false);
  });

  it('does not mistake buffering for refusal', async () => {
    await mount();
    await load();
    await send(delivery({ playerState: -1, currentTime: 0 }));
    await send(delivery({ playerState: 3, currentTime: 0 }));
    await advance(4000);
    expect(host.querySelector('.soundtrack-capture-layer')).not.toBeNull();
    await send(delivery({ playerState: 1, currentTime: 0.1 }));
    await advance(2000);
    expect(host.querySelector('.soundtrack-capture-layer')).not.toBeNull();
  });
});

describe('silent bridge', () => {
  it('falls back to playing after 3000ms with no message', async () => {
    await mount();
    await load();
    await advance(2900);
    expect(useWallStore.getState().soundtrack.playing).toBe(false);
    await advance(200);
    expect(useWallStore.getState().soundtrack.playing).toBe(true);
    expect(useWallStore.getState().soundtrackClock.albumId).toBe('album-a');
  });

  it('does not fall back once the player has spoken', async () => {
    await mount();
    await load();
    await send(delivery({ playerState: -1, currentTime: 0 }));
    await advance(5000);
    expect(useWallStore.getState().soundtrack.playing).toBe(false);
  });
});

describe('clock writes', () => {
  it('writes the clock rarely while steady playback reports stay on the interpolated line', async () => {
    await mount();
    await load();
    let writes = 0;
    const unsubscribe = useWallStore.subscribe((next, prev) => {
      if (next.soundtrackClock !== prev.soundtrackClock) writes += 1;
    });
    await send(delivery({ playerState: 1, currentTime: 10 }));
    const afterStart = writes;
    for (let i = 1; i <= 10; i += 1) {
      await advance(250);
      await send(delivery({ playerState: 1, currentTime: 10 + (i * 250) / 1000 }));
    }
    expect(writes - afterStart).toBeLessThanOrEqual(1);
    unsubscribe();
  });

  it('re-anchors immediately on a seek', async () => {
    await mount();
    await load();
    await send(delivery({ playerState: 1, currentTime: 10 }));
    await advance(250);
    await send(delivery({ playerState: 1, currentTime: 120 }));
    expect(useWallStore.getState().soundtrackClock.positionSec).toBe(120);
  });
});

describe('cleanup', () => {
  it('stops handshaking, falling back and listening after unmount', async () => {
    await mount();
    const post = vi.spyOn(iframe().contentWindow as Window, 'postMessage');
    await load();
    const callsAtUnmount = post.mock.calls.length;
    await act(async () => root.unmount());
    root = createRoot(host);

    // The retry interval and the 3 s silence fallback must both be gone.
    await advance(5000);
    expect(post.mock.calls.length).toBe(callsAtUnmount);
    expect(useWallStore.getState().soundtrackClock.albumId).toBeNull();

    // And the window listener: a late report changes nothing.
    window.dispatchEvent(new MessageEvent('message', { data: state(1), origin: ORIGIN }));
    expect(useWallStore.getState().soundtrack.playing).toBe(false);
  });

  it('cancels the refusal timer on unmount', async () => {
    await mount();
    await load();
    await send(delivery({ playerState: -1, currentTime: 0 }));
    const original = useWallStore.getState().dispatchSoundtrack;
    const lift = vi.fn();
    useWallStore.setState({ dispatchSoundtrack: lift });
    try {
      await act(async () => root.unmount());
      root = createRoot(host);
      await advance(3000);
      expect(lift).not.toHaveBeenCalledWith({ type: 'lift-capture-layer' });
    } finally {
      useWallStore.setState({ dispatchSoundtrack: original });
    }
  });
});

describe('debug logging', () => {
  it('logs bridge messages only with ?debugSoundtrack=1', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});
    await mount();
    await load();
    await send(state(1));
    expect(info).not.toHaveBeenCalled();
  });

  it('logs when the flag is present', async () => {
    window.history.pushState({}, '', '/?debugSoundtrack=1');
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});
    await mount();
    await load();
    await send(state(1));
    expect(info).toHaveBeenCalled();
    window.history.pushState({}, '', '/');
  });
});
