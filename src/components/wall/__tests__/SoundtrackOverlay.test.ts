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
  it('starts with gestures inactive', () => {
    expect(createOverlayState('overview').gestureActive).toBe(false);
    expect(createOverlayState('album').gestureActive).toBe(false);
  });

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

  it('keeps playback and mounting when print focus stays within the same album', () => {
    const inPrint = overlayReducer(playing(), { type: 'view-mode', viewMode: 'print' });
    expect(inPrint.viewMode).toBe('print');
    expect(inPrint.albumId).toBe('album-1');
    expect(inPrint.mounted).toBe(true);
    expect(inPrint.playing).toBe(true);
    expect(canMountOverlay(inPrint)).toBe(true);
  });

  it('keeps playback when a click happens without any gesture', () => {
    // A plain click dispatches no gesture events; the overlay must be untouched.
    const before = playing();
    const after = overlayReducer(before, { type: 'gesture-end' });
    expect(after.mounted).toBe(true);
    expect(after.playing).toBe(true);
    expect(after.gestureActive).toBe(false);
  });

  it('gesture-start disables pointer events but keeps playback and mounting', () => {
    const state = overlayReducer(playing(), { type: 'gesture-start' });
    expect(state.gestureActive).toBe(true);
    expect(state.mounted).toBe(true);
    expect(state.playing).toBe(true);
    expect(state.albumId).toBe('album-1');
  });

  it('gesture-end clears gestureActive without touching playback', () => {
    const dragging = overlayReducer(playing(), { type: 'gesture-start' });
    const released = overlayReducer(dragging, { type: 'gesture-end' });
    expect(released.gestureActive).toBe(false);
    expect(released.mounted).toBe(true);
    expect(released.playing).toBe(true);
  });

  it('stops playback, unmounts, and clears gestures when viewMode returns to overview', () => {
    const gesturing = overlayReducer(playing(), { type: 'gesture-start' });
    const overview = overlayReducer(gesturing, { type: 'view-mode', viewMode: 'overview' });
    expect(overview.mounted).toBe(false);
    expect(overview.playing).toBe(false);
    expect(overview.gestureActive).toBe(false);
    expect(canMountOverlay(overview)).toBe(false);
  });

  it('keeps playback when the same album is re-selected', () => {
    const state = overlayReducer(playing(), { type: 'select-album', albumId: 'album-1' });
    expect(state.albumId).toBe('album-1');
    expect(state.mounted).toBe(true);
    expect(state.playing).toBe(true);
  });

  it('keeps playback in print mode when the same album is re-selected', () => {
    const inPrint = overlayReducer(playing(), { type: 'view-mode', viewMode: 'print' });
    const state = overlayReducer(inPrint, { type: 'select-album', albumId: 'album-1' });
    expect(state.viewMode).toBe('print');
    expect(state.mounted).toBe(true);
    expect(state.playing).toBe(true);
  });

  it('stops playback and resets gestures when a different album is selected', () => {
    const gesturing = overlayReducer(playing(), { type: 'gesture-start' });
    const other = overlayReducer(gesturing, { type: 'select-album', albumId: 'album-2' });
    expect(other.albumId).toBe('album-2');
    expect(other.playing).toBe(false);
    expect(other.gestureActive).toBe(false);
  });

  it('only plays when mounted in album or print view', () => {
    const overview = createOverlayState('overview');
    expect(overlayReducer(overview, { type: 'play' }).playing).toBe(false);

    const mounted = albumMode();
    expect(overlayReducer(mounted, { type: 'play' }).playing).toBe(true);

    const inPrint = overlayReducer(mounted, { type: 'view-mode', viewMode: 'print' });
    expect(overlayReducer(inPrint, { type: 'play' }).playing).toBe(true);

    const stopped = overlayReducer(mounted, { type: 'pause' });
    expect(stopped.playing).toBe(false);
    expect(stopped.mounted).toBe(true);
  });

  it('remounts when re-entering album view from overview', () => {
    const afterOverview = overlayReducer(playing(), { type: 'view-mode', viewMode: 'overview' });
    const reentered = overlayReducer(afterOverview, { type: 'view-mode', viewMode: 'album' });
    expect(reentered.mounted).toBe(true);
    expect(reentered.albumId).toBe('album-1');
    expect(reentered.playing).toBe(false);
  });
});
