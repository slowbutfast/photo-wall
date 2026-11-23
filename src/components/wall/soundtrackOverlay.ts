/**
 * Pure state machine for the YouTube soundtrack DOM overlay.
 *
 * The overlay may only exist while the gallery is in `album` view. Any
 * pan/drag/wheel gesture unmounts it immediately (so the iframe cannot swallow
 * navigation), and leaving `album` stops playback.
 */

export type ViewMode = 'overview' | 'album' | 'print';

export interface OverlayState {
  mounted: boolean;
  playing: boolean;
  albumId: string | null;
  viewMode: ViewMode;
}

export type OverlayEvent =
  | { type: 'select-album'; albumId: string }
  | { type: 'view-mode'; viewMode: ViewMode }
  | { type: 'pan-start' }
  | { type: 'drag-start' }
  | { type: 'wheel-start' }
  | { type: 'play' }
  | { type: 'pause' }
  | { type: 'stop' };

export function createOverlayState(viewMode: ViewMode = 'overview'): OverlayState {
  return { mounted: false, playing: false, albumId: null, viewMode };
}

export function canMountOverlay(state: OverlayState): boolean {
  return state.viewMode === 'album' && state.albumId !== null;
}

export function overlayReducer(state: OverlayState, event: OverlayEvent): OverlayState {
  switch (event.type) {
    case 'select-album':
      return {
        ...state,
        albumId: event.albumId,
        mounted: canMountOverlay({ ...state, albumId: event.albumId }),
        playing: false,
      };

    case 'view-mode': {
      const viewMode = event.viewMode;
      const mounted = viewMode === 'album' && state.albumId !== null;
      return {
        ...state,
        viewMode,
        mounted,
        playing: mounted ? state.playing : false,
      };
    }

    case 'pan-start':
    case 'drag-start':
    case 'wheel-start':
      return { ...state, mounted: false, playing: false };

    case 'play':
      return {
        ...state,
        playing: state.mounted && state.viewMode === 'album',
      };

    case 'pause':
      return { ...state, playing: false };

    case 'stop':
      return { ...state, mounted: false, playing: false };

    default:
      return state;
  }
}
