import { describe, expect, it } from 'vitest';
import {
  canMountOverlay,
  createOverlayState,
  overlayReducer,
  type OverlayState,
} from '../soundtrackOverlay';

function albumMode(albumId = 'album-1'): OverlayState {
  const state = overlayReducer(createOverlayState(), { type: 'select-album', albumId });
  return overlayReducer(state, { type: 'view-mode', viewMode: 'album' });
}

function playing(albumId = 'album-1'): OverlayState {
  return overlayReducer(albumMode(albumId), { type: 'play' });
}

describe('soundtrack overlay state machine', () => {
  it('never mounts while the gallery is in overview', () => {
    const state = overlayReducer(createOverlayState('overview'), {
      type: 'select-album',
      albumId: 'album-1',
    });
    expect(state.mounted).toBe(false);
    expect(canMountOverlay(state)).toBe(false);
    expect(overlayReducer(state, { type: 'play' }).playing).toBe(false);
  });

  it('mounts only when viewMode becomes album', () => {
    const selected = overlayReducer(createOverlayState('overview'), {
      type: 'select-album',
      albumId: 'album-1',
    });
    expect(selected.mounted).toBe(false);

    const focused = overlayReducer(selected, { type: 'view-mode', viewMode: 'album' });
    expect(focused.mounted).toBe(true);
    expect(focused.albumId).toBe('album-1');
    expect(canMountOverlay(focused)).toBe(true);
  });

  it('unmounts and stops playback on pan start', () => {
    const state = overlayReducer(playing(), { type: 'pan-start' });
    expect(state.mounted).toBe(false);
    expect(state.playing).toBe(false);
  });

  it('unmounts and stops playback on drag start', () => {
    const state = overlayReducer(playing(), { type: 'drag-start' });
    expect(state.mounted).toBe(false);
    expect(state.playing).toBe(false);
  });

  it('unmounts and stops playback on wheel start', () => {
    const state = overlayReducer(playing(), { type: 'wheel-start' });
    expect(state.mounted).toBe(false);
    expect(state.playing).toBe(false);
  });

  it('stops playback and unmounts when viewMode leaves album', () => {
    for (const viewMode of ['overview', 'print'] as const) {
      const state = overlayReducer(playing(), { type: 'view-mode', viewMode });
      expect(state.mounted).toBe(false);
      expect(state.playing).toBe(false);
    }
  });

  it('only plays when mounted in album view', () => {
    const overview = createOverlayState('overview');
    expect(overlayReducer(overview, { type: 'play' }).playing).toBe(false);

    const mounted = albumMode();
    expect(overlayReducer(mounted, { type: 'play' }).playing).toBe(true);

    const stopped = overlayReducer(mounted, { type: 'pause' });
    expect(stopped.playing).toBe(false);
    expect(stopped.mounted).toBe(true);
  });

  it('remounts when re-entering album view after a pan', () => {
    const afterPan = overlayReducer(playing(), { type: 'pan-start' });
    const reentered = overlayReducer(afterPan, { type: 'view-mode', viewMode: 'album' });
    expect(reentered.mounted).toBe(true);
    expect(reentered.albumId).toBe('album-1');
  });

  it('resets playback when a different album is selected', () => {
    const other = overlayReducer(playing(), { type: 'select-album', albumId: 'album-2' });
    expect(other.albumId).toBe('album-2');
    expect(other.playing).toBe(false);
  });
});
