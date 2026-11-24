/**
 * Task 1.3 — transparent-capture-layer soundtrack state machine
 * (`src/components/wall/soundtrackState.ts`, Task 3.1).
 *
 * Contract from `specs/3d-pbr-wall-and-lighting` (CSS beveled glass standoff
 * placards and native YouTube soundtrack plaques):
 * - the plaque is hidden at macro tier and shows a proxied resting thumbnail at
 *   `album` / `print`;
 * - at most one native iframe is ever mounted, on an explicit click;
 * - a transparent capture layer forwards wheel/drag so the first gesture over
 *   the plaque is never swallowed, and lifts only on an explicit click into the
 *   player;
 * - playback survives `album` <-> `print` within the same album and stops on
 *   `overview` (with the zoom-out toast) or on switching albums.
 */

import { describe, expect, it } from 'vitest';

import {
  canMountIframe,
  captureLayerActive,
  createSoundtrackState,
  mountedIframeCount,
  showsFacade,
  showsIframe,
  showsSoundtrackPlaque,
  soundtrackReducer,
  zoomOutPauseToast,
  type SoundtrackEvent,
  type SoundtrackState,
} from '../soundtrackState';

const ALBUM_A = 'album-a';
const ALBUM_B = 'album-b';

function reduce(events: SoundtrackEvent[], from: SoundtrackState = createSoundtrackState()) {
  return events.reduce(soundtrackReducer, from);
}

/** Album focus with ALBUM_A's player mounted and playing. */
function playingA(): SoundtrackState {
  return reduce([
    { type: 'enter-album', albumId: ALBUM_A },
    { type: 'play', albumId: ALBUM_A },
  ]);
}

describe('soundtrack state machine — resting state', () => {
  it('starts in overview with nothing mounted', () => {
    const state = createSoundtrackState();
    expect(state.viewMode).toBe('overview');
    expect(state.activeAlbumId).toBeNull();
    expect(state.playing).toBe(false);
    expect(state.captureLayerActive).toBe(false);
    expect(showsIframe(state)).toBe(false);
    expect(showsFacade(state)).toBe(false);
    expect(canMountIframe(state)).toBe(false);
    expect(mountedIframeCount(state)).toBe(0);
  });

  it('hides the soundtrack plaque entirely at macro tier', () => {
    expect(showsSoundtrackPlaque(createSoundtrackState())).toBe(false);
    expect(showsSoundtrackPlaque(reduce([{ type: 'enter-album', albumId: ALBUM_A }]))).toBe(true);
  });

  it('shows the resting facade (not an iframe) on entering album focus', () => {
    const state = reduce([{ type: 'enter-album', albumId: ALBUM_A }]);
    expect(state.viewMode).toBe('album');
    expect(state.currentAlbumId).toBe(ALBUM_A);
    expect(state.playing).toBe(false);
    expect(showsFacade(state)).toBe(true);
    expect(showsIframe(state)).toBe(false);
    expect(canMountIframe(state)).toBe(true);
    expect(captureLayerActive(state)).toBe(false);
  });

  it('refuses to mount a player while the gallery is in overview', () => {
    const state = reduce([{ type: 'play', albumId: ALBUM_A }]);
    expect(state.playing).toBe(false);
    expect(state.activeAlbumId).toBeNull();
    expect(mountedIframeCount(state)).toBe(0);
  });
});

describe('soundtrack state machine — mounting and the capture layer', () => {
  it('mounts exactly one iframe on an explicit click and arms the capture layer', () => {
    const state = playingA();
    expect(state.playing).toBe(true);
    expect(state.activeAlbumId).toBe(ALBUM_A);
    expect(showsIframe(state)).toBe(true);
    expect(showsFacade(state)).toBe(false);
    expect(mountedIframeCount(state)).toBe(1);
    expect(captureLayerActive(state)).toBe(true);
  });

  it('never mounts more than one player, even when a second album is clicked', () => {
    const state = reduce([
      { type: 'enter-album', albumId: ALBUM_A },
      { type: 'play', albumId: ALBUM_A },
      { type: 'play', albumId: ALBUM_B },
    ]);
    expect(state.activeAlbumId).toBe(ALBUM_B);
    expect(mountedIframeCount(state)).toBe(1);
    expect(showsIframe(state)).toBe(false); // B is not the album in view
    expect(showsFacade(state)).toBe(true);
  });

  it('forwards wheel/drag gestures without pausing audio', () => {
    const playing = playingA();
    const gesture = soundtrackReducer(playing, { type: 'gesture-start', source: 'wheel' });

    expect(gesture.playing).toBe(true);
    expect(gesture.activeAlbumId).toBe(ALBUM_A);
    expect(captureLayerActive(gesture)).toBe(true);
    expect(soundtrackReducer(gesture, { type: 'gesture-end' }).playing).toBe(true);
  });

  it('forwards a drag that starts over the plaque too', () => {
    const playing = playingA();
    const drag = soundtrackReducer(playing, { type: 'gesture-start', source: 'drag' });
    expect(drag.playing).toBe(true);
    expect(captureLayerActive(drag)).toBe(true);
  });

  it('lifts the capture layer only on an explicit click into the player', () => {
    const playing = playingA();
    // Gestures alone never lift it.
    const afterGesture = soundtrackReducer(
      soundtrackReducer(playing, { type: 'gesture-start', source: 'wheel' }),
      { type: 'gesture-end' },
    );
    expect(captureLayerActive(afterGesture)).toBe(true);

    const lifted = soundtrackReducer(afterGesture, { type: 'lift-capture-layer' });
    expect(captureLayerActive(lifted)).toBe(false);
    expect(lifted.playing).toBe(true);
    expect(showsIframe(lifted)).toBe(true);

    // Once lifted, gestures reach the native player directly and change nothing.
    const native = soundtrackReducer(lifted, { type: 'gesture-start', source: 'wheel' });
    expect(native.playing).toBe(true);
    expect(captureLayerActive(native)).toBe(false);
  });

  it('re-arms the capture layer after re-mounting the player', () => {
    const state = reduce([
      { type: 'enter-album', albumId: ALBUM_A },
      { type: 'play', albumId: ALBUM_A },
      { type: 'lift-capture-layer' },
      { type: 'stop' },
      { type: 'play', albumId: ALBUM_A },
    ]);
    expect(captureLayerActive(state)).toBe(true);
    expect(state.playing).toBe(true);
  });
});

describe('soundtrack state machine — focus transitions', () => {
  it('keeps playing across album <-> print focus within the same album', () => {
    const inPrint = soundtrackReducer(playingA(), { type: 'focus-print', albumId: ALBUM_A });
    expect(inPrint.viewMode).toBe('print');
    expect(inPrint.playing).toBe(true);
    expect(inPrint.activeAlbumId).toBe(ALBUM_A);
    expect(showsIframe(inPrint)).toBe(true);
    expect(captureLayerActive(inPrint)).toBe(true);

    const backToAlbum = soundtrackReducer(inPrint, { type: 'enter-album', albumId: ALBUM_A });
    expect(backToAlbum.playing).toBe(true);
    expect(backToAlbum.activeAlbumId).toBe(ALBUM_A);
  });

  it('stops playback when print focus moves to a different album', () => {
    const state = soundtrackReducer(playingA(), { type: 'focus-print', albumId: ALBUM_B });
    expect(state.viewMode).toBe('print');
    expect(state.playing).toBe(false);
    expect(state.activeAlbumId).toBeNull();
    expect(mountedIframeCount(state)).toBe(0);
  });

  it('stops playback on album switch and shows the new album facade', () => {
    const state = soundtrackReducer(playingA(), { type: 'enter-album', albumId: ALBUM_B });
    expect(state.currentAlbumId).toBe(ALBUM_B);
    expect(state.playing).toBe(false);
    expect(state.activeAlbumId).toBeNull();
    expect(captureLayerActive(state)).toBe(false);
    expect(showsFacade(state)).toBe(true);
    expect(mountedIframeCount(state)).toBe(0);
    // Only zooming out raises the toast, not switching albums.
    expect(zoomOutPauseToast(state)).toBe(false);
  });

  it('stops playback on overview and raises the zoom-out pause toast', () => {
    const state = soundtrackReducer(playingA(), { type: 'enter-overview' });
    expect(state.viewMode).toBe('overview');
    expect(state.playing).toBe(false);
    expect(state.activeAlbumId).toBeNull();
    expect(captureLayerActive(state)).toBe(false);
    expect(mountedIframeCount(state)).toBe(0);
    expect(showsSoundtrackPlaque(state)).toBe(false);
    expect(zoomOutPauseToast(state)).toBe(true);
  });

  it('does not raise the toast when zooming out with nothing playing', () => {
    const state = reduce([
      { type: 'enter-album', albumId: ALBUM_A },
      { type: 'enter-overview' },
    ]);
    expect(zoomOutPauseToast(state)).toBe(false);
  });

  it('clears the toast on explicit dismissal, the next view or an album switch', () => {
    const paused = soundtrackReducer(playingA(), { type: 'enter-overview' });
    expect(zoomOutPauseToast(paused)).toBe(true);

    expect(
      zoomOutPauseToast(soundtrackReducer(paused, { type: 'dismiss-pause-toast' })),
    ).toBe(false);
    expect(
      zoomOutPauseToast(reduce([{ type: 'enter-album', albumId: ALBUM_B }], paused)),
    ).toBe(false);
    expect(zoomOutPauseToast(reduce([{ type: 'enter-overview' }], paused))).toBe(false);
  });

  it('lets the player stop on its own without unmounting it', () => {
    const ended = soundtrackReducer(playingA(), { type: 'track-ended' });
    expect(ended.playing).toBe(false);
    expect(ended.activeAlbumId).toBe(ALBUM_A);
    expect(mountedIframeCount(ended)).toBe(1);
  });
});

describe('soundtrack state machine — invariants', () => {
  it('never reports more than one mounted iframe across a long event walk', () => {
    const walk: SoundtrackEvent[] = [
      { type: 'enter-album', albumId: ALBUM_A },
      { type: 'play', albumId: ALBUM_A },
      { type: 'gesture-start', source: 'drag' },
      { type: 'gesture-end' },
      { type: 'focus-print', albumId: ALBUM_A },
      { type: 'play', albumId: ALBUM_A },
      { type: 'enter-album', albumId: ALBUM_B },
      { type: 'play', albumId: ALBUM_B },
      { type: 'play', albumId: ALBUM_A },
      { type: 'enter-overview' },
      { type: 'play', albumId: ALBUM_B },
      { type: 'dismiss-pause-toast' },
    ];

    let state = createSoundtrackState();
    for (const event of walk) {
      state = soundtrackReducer(state, event);
      expect(mountedIframeCount(state)).toBeLessThanOrEqual(1);
      expect(state.activeAlbumId === null || typeof state.activeAlbumId === 'string').toBe(true);
      if (state.captureLayerActive) expect(state.activeAlbumId).not.toBeNull();
      if (state.playing) expect(state.activeAlbumId).not.toBeNull();
    }
  });

  it('is a pure reducer: no mutation and stable output for the same input', () => {
    const playing = playingA();
    const snapshot = JSON.parse(JSON.stringify(playing));
    const next = soundtrackReducer(playing, { type: 'enter-overview' });

    expect(playing).toEqual(snapshot);
    expect(next).not.toBe(playing);
    expect(soundtrackReducer(playingA(), { type: 'enter-overview' })).toEqual(next);
  });

  it('ignores unknown/irrelevant events without throwing', () => {
    const state = createSoundtrackState();
    expect(soundtrackReducer(state, { type: 'dismiss-pause-toast' })).toEqual(state);
    expect(soundtrackReducer(state, { type: 'gesture-start', source: 'wheel' })).toEqual(state);
    expect(soundtrackReducer(state, { type: 'track-ended' })).toEqual(state);
  });
});
