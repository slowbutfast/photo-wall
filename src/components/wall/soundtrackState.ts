'use client';

/**
 * Soundtrack plaque state machine (pure, no DOM, no React).
 *
 * The rules come straight from `specs/3d-pbr-wall-and-lighting`:
 * - the plaque is hidden at macro tier (`overview`) and shows a proxied resting
 *   thumbnail at `album` / `print`;
 * - at most **one** native iframe is mounted, on an explicit click;
 * - a transparent capture layer forwards wheel/drag while it is armed, so the
 *   first gesture over the plaque is never swallowed by the iframe, and it lifts
 *   only on an explicit click into the player;
 * - playback survives `album` <-> `print` inside the same album and stops on
 *   `overview` (raising the zoom-out toast) or on switching albums.
 */

export type SoundtrackViewMode = 'overview' | 'album' | 'print';


export interface SoundtrackState {
  viewMode: SoundtrackViewMode;
  /** Album the visitor is looking at (album/print focus). */
  currentAlbumId: string | null;
  /** Album whose native iframe is mounted (at most one). */
  activeAlbumId: string | null;
  playing: boolean;
  /** Transparent gesture capture layer is intercepting pointer events. */
  captureLayerActive: boolean;
  /** Drives the bottom-right "Paused soundtrack on zoom out" toast. */
  pauseToastVisible: boolean;
}

export type GestureSource = 'wheel' | 'drag';

export type SoundtrackEvent =
  | { type: 'enter-album'; albumId: string }
  | { type: 'focus-print'; albumId: string }
  | { type: 'enter-overview' }
  | { type: 'play'; albumId: string }
  | { type: 'stop' }
  | { type: 'gesture-start'; source: GestureSource }
  | { type: 'gesture-end' }
  | { type: 'lift-capture-layer' }
  | { type: 'track-ended' }
  | { type: 'dismiss-pause-toast' };

export function createSoundtrackState(viewMode: SoundtrackViewMode = 'overview'): SoundtrackState {
  return {
    viewMode,
    currentAlbumId: null,
    activeAlbumId: null,
    playing: false,
    captureLayerActive: false,
    pauseToastVisible: false,
  };
}

function stopped(state: SoundtrackState, patch: Partial<SoundtrackState>): SoundtrackState {
  return {
    ...state,
    ...patch,
    playing: false,
    activeAlbumId: null,
    captureLayerActive: false,
  };
}

/** Everything unloaded: used by "stop", album switches and zoom-out. */
function stopPlayback(state: SoundtrackState, patch: Partial<SoundtrackState> = {}): SoundtrackState {
  return stopped(state, patch);
}

export function soundtrackReducer(
  state: SoundtrackState,
  event: SoundtrackEvent,
): SoundtrackState {
  switch (event.type) {
    case 'enter-album': {
      const sameAlbum = state.currentAlbumId === event.albumId;
      const keepsPlayer = sameAlbum && state.activeAlbumId === event.albumId;
      const base = keepsPlayer ? state : stopPlayback(state);
      return {
        ...base,
        viewMode: 'album',
        currentAlbumId: event.albumId,
        pauseToastVisible: false,
      };
    }

    case 'focus-print': {
      const keepsPlayer = state.activeAlbumId === event.albumId;
      const base = keepsPlayer ? state : stopPlayback(state);
      return {
        ...base,
        viewMode: 'print',
        currentAlbumId: event.albumId,
        pauseToastVisible: false,
      };
    }

    case 'enter-overview': {
      const wasPlaying = state.playing;
      return {
        ...stopPlayback(state),
        viewMode: 'overview',
        currentAlbumId: null,
        pauseToastVisible: wasPlaying,
      };
    }

    case 'play': {
      // The plaque is hidden at macro tier: nothing can mount from overview.
      if (state.viewMode === 'overview') return state;
      return {
        ...state,
        activeAlbumId: event.albumId,
        playing: true,
        captureLayerActive: true,
        pauseToastVisible: false,
      };
    }

    case 'stop':
      return stopPlayback(state);

    case 'gesture-start':
    case 'gesture-end':
      // Gestures neither pause audio nor lift the layer; the layer stays armed
      // so a wheel tick that starts over the plaque reaches the viewport.
      return state;

    case 'lift-capture-layer':
      if (!state.captureLayerActive) return state;
      return { ...state, captureLayerActive: false };

    case 'track-ended':
      if (!state.playing) return state;
      return { ...state, playing: false };

    case 'dismiss-pause-toast':
      if (!state.pauseToastVisible) return state;
      return { ...state, pauseToastVisible: false };

    default:
      return state;
  }
}

/** Plaque is never rendered at macro tier. */
export function showsSoundtrackPlaque(state: SoundtrackState): boolean {
  return state.viewMode !== 'overview';
}

export function canMountIframe(state: SoundtrackState): boolean {
  return state.viewMode !== 'overview' && state.currentAlbumId !== null;
}

export function showsIframe(state: SoundtrackState): boolean {
  return state.activeAlbumId !== null && state.activeAlbumId === state.currentAlbumId;
}

/**
 * Per-plaque projection of `showsIframe`. Each mounted plaque renders from its
 * own album id, so an unplayed neighbour keeps its resting facade and never
 * mounts an autoplaying player of its own.
 */
export function showsIframeFor(state: SoundtrackState, albumId: string): boolean {
  return showsIframe(state) && state.activeAlbumId === albumId;
}

export function showsFacade(state: SoundtrackState): boolean {
  return state.viewMode !== 'overview' && !showsIframe(state);
}

/**
 * How many native players exist. The slice owns at most one; it can stay mounted
 * while its island scrolls out of view (`showsIframe` then reports false).
 */
export function mountedIframeCount(state: SoundtrackState): 0 | 1 {
  return state.activeAlbumId !== null ? 1 : 0;
}

export function captureLayerActive(state: SoundtrackState): boolean {
  return state.captureLayerActive;
}

export function zoomOutPauseToast(state: SoundtrackState): boolean {
  return state.pauseToastVisible;
}
