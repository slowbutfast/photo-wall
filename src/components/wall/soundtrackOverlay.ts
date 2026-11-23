/**
 * Pure state machine for the YouTube soundtrack DOM overlay.
 *
 * The overlay may exist while the gallery is in `album` or `print` view for the
 * active album. Gestures (drag / pinch / wheel) never stop playback: they only
 * flag `gestureActive` so the iframe can drop `pointer-events` while the user
 * navigates. Playback stops only when returning to `overview` or selecting a
 * different album.
 */

export type ViewMode = 'overview' | 'album' | 'print';

export interface OverlayState {
  mounted: boolean;
  playing: boolean;
  albumId: string | null;
  viewMode: ViewMode;
  /** True while a drag/pinch/wheel gesture is in flight (iframe ignores pointer input). */
  gestureActive: boolean;
}

export type OverlayEvent =
  | { type: 'select-album'; albumId: string }
  | { type: 'view-mode'; viewMode: ViewMode }
  | { type: 'gesture-start' }
  | { type: 'gesture-end' }
  | { type: 'play' }
  | { type: 'pause' }
  | { type: 'stop' };

export function createOverlayState(viewMode: ViewMode = 'overview'): OverlayState {
  return { mounted: false, playing: false, albumId: null, viewMode, gestureActive: false };
}

export function canMountOverlay(state: OverlayState): boolean {
  return (
    (state.viewMode === 'album' || state.viewMode === 'print') && state.albumId !== null
  );
}

export function overlayReducer(state: OverlayState, event: OverlayEvent): OverlayState {
  switch (event.type) {
    case 'select-album': {
      // Selecting the already-focused album (e.g. album -> print focus) is a
      // no-op so playback survives the transition inside the same album.
      if (event.albumId === state.albumId) return state;
      const next = { ...state, albumId: event.albumId };
      return {
        ...next,
        mounted: canMountOverlay(next),
        playing: false,
        gestureActive: false,
      };
    }

    case 'view-mode': {
      const viewMode = event.viewMode;
      if (viewMode === 'overview') {
        return { ...state, viewMode, mounted: false, playing: false, gestureActive: false };
      }
      const mounted = canMountOverlay({ ...state, viewMode });
      return {
        ...state,
        viewMode,
        mounted,
        playing: mounted ? state.playing : false,
        gestureActive: mounted ? state.gestureActive : false,
      };
    }

    case 'gesture-start':
      return { ...state, gestureActive: true };

    case 'gesture-end':
      return { ...state, gestureActive: false };

    case 'play':
      return {
        ...state,
        playing:
          state.mounted && (state.viewMode === 'album' || state.viewMode === 'print'),
      };

    case 'pause':
      return { ...state, playing: false };

    case 'stop':
      return { ...state, mounted: false, playing: false, gestureActive: false };

    default:
      return state;
  }
}
