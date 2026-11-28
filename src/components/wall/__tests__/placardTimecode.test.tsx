// @vitest-environment jsdom

/**
 * `soundtrack-playback-sync` — the placard timecode shows the player's reported
 * position, not a wall clock started by the click.
 */

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useWallStore } from '@/store/useWallStore';

import { PlacardTimecode, computeTimecodeSeconds } from '../AlbumPlacard';
import { createSoundtrackState } from '../soundtrackState';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const EMPTY = { albumId: null, positionSec: 0, at: 0 };

describe('computeTimecodeSeconds', () => {
  const clock = { albumId: 'a', positionSec: 10, at: 1000 };

  it('is 0 without a clock for this album', () => {
    expect(
      computeTimecodeSeconds({ playing: true, clock: EMPTY, albumId: 'a', now: 5000, durationSec: 100 }),
    ).toBe(0);
    expect(
      computeTimecodeSeconds({ playing: true, clock, albumId: 'b', now: 5000, durationSec: 100 }),
    ).toBe(0);
  });

  it('interpolates from the anchor while playing', () => {
    expect(
      computeTimecodeSeconds({ playing: true, clock, albumId: 'a', now: 4200, durationSec: 100 }),
    ).toBe(13);
  });

  it('holds the reported position while not playing', () => {
    expect(
      computeTimecodeSeconds({ playing: false, clock, albumId: 'a', now: 99999, durationSec: 100 }),
    ).toBe(10);
  });

  it('clamps to the duration and never goes negative', () => {
    expect(
      computeTimecodeSeconds({ playing: true, clock, albumId: 'a', now: 500000, durationSec: 100 }),
    ).toBe(100);
    expect(
      computeTimecodeSeconds({ playing: true, clock, albumId: 'a', now: 0, durationSec: 100 }),
    ).toBe(10);
  });
});

describe('PlacardTimecode', () => {
  let host: HTMLDivElement;
  let root: Root;

  const text = () => host.querySelector('.placard-timecode')?.textContent ?? '';

  async function render() {
    await act(async () => {
      root.render(<PlacardTimecode albumId="a" durationSec={205} />);
    });
  }

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    useWallStore.setState({
      soundtrack: createSoundtrackState('overview'),
      soundtrackClock: EMPTY,
    });
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
    vi.useRealTimers();
  });

  it('shows 0:00 while the player is mounted but not playing', async () => {
    useWallStore.getState().dispatchSoundtrack({ type: 'enter-album', albumId: 'a' });
    useWallStore.getState().dispatchSoundtrack({ type: 'play', albumId: 'a' });
    await render();
    expect(text()).toBe('0:00 / 3:25');
    await act(async () => {
      vi.advanceTimersByTime(5000);
    });
    expect(text()).toBe('0:00 / 3:25');
  });

  it('follows the reported position while playing', async () => {
    const store = useWallStore.getState();
    store.dispatchSoundtrack({ type: 'enter-album', albumId: 'a' });
    store.dispatchSoundtrack({ type: 'play', albumId: 'a' });
    await render();
    await act(async () => {
      store.setSoundtrackClock({ albumId: 'a', positionSec: 10, at: performance.now() });
      store.dispatchSoundtrack({ type: 'player-state', albumId: 'a', state: 1 });
    });
    await act(async () => {
      vi.advanceTimersByTime(1);
    });
    expect(text()).toBe('0:10 / 3:25');
    await act(async () => {
      vi.advanceTimersByTime(3200);
    });
    expect(text()).toBe('0:13 / 3:25');
  });

  it('holds when the player pauses', async () => {
    const store = useWallStore.getState();
    store.dispatchSoundtrack({ type: 'enter-album', albumId: 'a' });
    store.dispatchSoundtrack({ type: 'play', albumId: 'a' });
    await render();
    await act(async () => {
      store.setSoundtrackClock({ albumId: 'a', positionSec: 42.3, at: performance.now() });
      store.dispatchSoundtrack({ type: 'player-state', albumId: 'a', state: 2 });
    });
    await act(async () => {
      vi.advanceTimersByTime(10000);
    });
    expect(text()).toBe('0:42 / 3:25');
  });

  it('shows zero for an album that is not the active one', async () => {
    const store = useWallStore.getState();
    store.dispatchSoundtrack({ type: 'enter-album', albumId: 'b' });
    store.dispatchSoundtrack({ type: 'play', albumId: 'b' });
    store.setSoundtrackClock({ albumId: 'b', positionSec: 50, at: performance.now() });
    await render();
    await act(async () => {
      vi.advanceTimersByTime(1);
    });
    expect(text()).toBe('0:00 / 3:25');
  });
});
