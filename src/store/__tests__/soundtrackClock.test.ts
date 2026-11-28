/**
 * `soundtrack-playback-sync` — the soundtrack clock lives in its own store key,
 * so position reports never change the identity of the `soundtrack` slice that
 * `GalleryCanvas` subscribes to, and it resets whenever the active album does.
 */

import { beforeEach, describe, expect, it } from 'vitest';

import { createSoundtrackState } from '@/components/wall/soundtrackState';
import { useWallStore } from '../useWallStore';

const EMPTY = { albumId: null, positionSec: 0, at: 0 };

function reset() {
  useWallStore.setState({
    soundtrack: createSoundtrackState('overview'),
    soundtrackClock: EMPTY,
  });
}

function mountA() {
  const { dispatchSoundtrack } = useWallStore.getState();
  dispatchSoundtrack({ type: 'enter-album', albumId: 'a' });
  dispatchSoundtrack({ type: 'play', albumId: 'a' });
}

describe('soundtrackClock', () => {
  beforeEach(reset);

  it('starts empty', () => {
    expect(useWallStore.getState().soundtrackClock).toEqual(EMPTY);
  });

  it('writes do not change the soundtrack slice identity', () => {
    mountA();
    const before = useWallStore.getState().soundtrack;
    for (let i = 0; i < 10; i += 1) {
      useWallStore
        .getState()
        .setSoundtrackClock({ albumId: 'a', positionSec: i, at: 1000 + i * 250 });
    }
    const after = useWallStore.getState();
    expect(after.soundtrack).toBe(before);
    expect(after.soundtrackClock).toEqual({ albumId: 'a', positionSec: 9, at: 3250 });
  });

  it('resets when playback starts for a different album', () => {
    mountA();
    useWallStore.getState().setSoundtrackClock({ albumId: 'a', positionSec: 30, at: 5 });
    useWallStore.getState().dispatchSoundtrack({ type: 'play', albumId: 'b' });
    expect(useWallStore.getState().soundtrackClock).toEqual(EMPTY);
  });

  it('resets on stop', () => {
    mountA();
    useWallStore.getState().setSoundtrackClock({ albumId: 'a', positionSec: 30, at: 5 });
    useWallStore.getState().dispatchSoundtrack({ type: 'stop' });
    expect(useWallStore.getState().soundtrackClock).toEqual(EMPTY);
  });

  it('resets on going to the overview', () => {
    mountA();
    useWallStore.getState().setSoundtrackClock({ albumId: 'a', positionSec: 30, at: 5 });
    useWallStore.getState().goOverview();
    expect(useWallStore.getState().soundtrackClock).toEqual(EMPTY);
  });

  it('keeps the clock while the same album keeps playing', () => {
    mountA();
    useWallStore.getState().setSoundtrackClock({ albumId: 'a', positionSec: 30, at: 5 });
    useWallStore.getState().dispatchSoundtrack({ type: 'player-state', albumId: 'a', state: 1 });
    useWallStore.getState().dispatchSoundtrack({ type: 'player-state', albumId: 'a', state: 2 });
    expect(useWallStore.getState().soundtrackClock).toEqual({ albumId: 'a', positionSec: 30, at: 5 });
  });
});
