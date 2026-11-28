'use client';

/**
 * Zustand wall store for the public gallery and the curator shell.
 *
 * The store deliberately holds only client-safe public data: the compact
 * `WallSummary` (`GET /api/wall`), camera/view selection, the soundtrack plaque
 * state machine and the curator's client-local mood/material preferences.
 * Session state lives entirely in the server-gated `/admin` tree, so no public
 * module (or this store) references `/api/admin`. Server-only modules
 * (`src/db`, `src/lib/manifest`, `src/lib/storage`) are never imported.
 */

import { create } from 'zustand';

import { withBase } from '@/lib/basePath';
import {
  blendMoodTokens,
  moodTokens,
} from '@/lib/lighting/moodBlend';
import { MOOD_CROSSFADE_MS, MOOD_TOKENS, type Mood, type MoodTokens } from '@/lib/lighting/nyTimeMood';
import type { WallAlbum, WallPhoto, WallSummary } from '@/lib/layout/types';
import {
  createSoundtrackState,
  soundtrackReducer,
  type SoundtrackEvent,
  type SoundtrackState,
} from '@/components/wall/soundtrackState';
import {
  DEFAULT_PLACARD_MATERIAL,
  readStoredPlacardMaterial,
  storePlacardMaterial,
  type PlacardMaterial,
} from '@/components/wall/placardMaterial';

const EMPTY_WALL: WallSummary = { cdnBase: '', albums: [] };

/**
 * Last playback position the mounted soundtrack player reported, and the
 * `performance.now()` time it arrived. Kept outside the `soundtrack` slice so a
 * position report never changes that slice's identity (`GalleryCanvas`
 * subscribes to the whole slice).
 */
export interface SoundtrackClock {
  albumId: string | null;
  positionSec: number;
  at: number;
}

const EMPTY_CLOCK: SoundtrackClock = { albumId: null, positionSec: 0, at: 0 };

/** The clock belongs to the active album: drop it whenever that album changes. */
function clockAfter(
  previous: SoundtrackState,
  next: SoundtrackState,
  clock: SoundtrackClock,
): SoundtrackClock {
  return previous.activeAlbumId === next.activeAlbumId ? clock : EMPTY_CLOCK;
}

/** Gallery navigation state (`overview` = macro tier, `album`, `print`). */
export type ViewMode = 'overview' | 'album' | 'print';

export interface WallStoreState {
  wall: WallSummary;
  /** SSR-computed solar mood, used as the baseline. */
  initialMood: Mood;
  /** Current target mood (60s crossfade source/target). */
  mood: Mood;
  moodFrom: Mood;
  /** `performance.now()`-style timestamp when the crossfade started. */
  moodCrossfadeStartMs: number;
  /** Client-local admin Lighting Preview; never rendered for public visitors. */
  manualMood: Mood | null;

  viewMode: ViewMode;
  overviewNonce: number;
  focusedAlbumId: string | null;
  focusedPhotoId: string | null;
  hoveredAlbumId: string | null;
  hoveredPhotoId: string | null;

  /**
   * Soundtrack plaque state machine for the DOM wall (capture layer, single
   * iframe, keep-playing rules).
   */
  soundtrack: SoundtrackState;
  /** Player-reported playback position for the active soundtrack album. */
  soundtrackClock: SoundtrackClock;

  /**
   * Touch-only Print Focus glare toggle (`print-glare-tap-toggle`). Session
   * state: never persisted, and untouched by navigation or wall refreshes.
   */
  glareOff: boolean;
  /** Increments on every toggle so the confirmation hint can fire each time. */
  glareToggleCount: number;

  /** Curator Settings placard material. */
  placardMaterial: PlacardMaterial;

  bottomInsetPx: number;
  demoMode: boolean;

  setWall: (wall: WallSummary) => void;
  refreshWall: () => Promise<void>;
  setInitialMood: (mood: Mood) => void;
  transitionMood: (mood: Mood, nowMs?: number) => void;
  setManualMood: (mood: Mood | null) => void;

  enterAlbum: (albumId: string) => void;
  enterPrint: (albumId: string, photoId: string) => void;
  goOverview: () => void;
  returnOneLevel: () => void;
  stepPhoto: (delta: number) => void;

  setHover: (albumId: string | null, photoId: string | null) => void;

  dispatchSoundtrack: (event: SoundtrackEvent) => void;
  setSoundtrackClock: (clock: SoundtrackClock) => void;
  toggleGlare: () => void;

  setPlacardMaterial: (material: PlacardMaterial) => void;
  /** Restore the curator's last placard material from localStorage. */
  hydratePlacardMaterial: () => void;

  setBottomInset: (px: number) => void;
  setDemoMode: (demo: boolean) => void;
}

function findAlbum(state: WallStoreState, albumId: string | null): WallAlbum | null {
  if (!albumId) return null;
  return state.wall.albums.find((album) => album.id === albumId) ?? null;
}

function findPhoto(album: WallAlbum | null, photoId: string | null): WallPhoto | null {
  if (!album || !photoId) return null;
  return album.photos.find((photo) => photo.id === photoId) ?? null;
}

export const useWallStore = create<WallStoreState>((set, get) => ({
  wall: EMPTY_WALL,
  initialMood: 'chiaroscuro',
  mood: 'chiaroscuro',
  moodFrom: 'chiaroscuro',
  moodCrossfadeStartMs: 0,
  manualMood: null,

  viewMode: 'overview',
  overviewNonce: 0,
  focusedAlbumId: null,
  focusedPhotoId: null,
  hoveredAlbumId: null,
  hoveredPhotoId: null,

  soundtrack: createSoundtrackState('overview'),
  soundtrackClock: EMPTY_CLOCK,
  glareOff: false,
  glareToggleCount: 0,
  placardMaterial: DEFAULT_PLACARD_MATERIAL,

  bottomInsetPx: 0,
  demoMode: false,

  setWall: (wall) =>
    set({
      wall,
      viewMode: 'overview',
      focusedAlbumId: null,
      focusedPhotoId: null,
      hoveredAlbumId: null,
      hoveredPhotoId: null,
      soundtrack: createSoundtrackState('overview'),
      soundtrackClock: EMPTY_CLOCK,
    }),

  refreshWall: async () => {
    try {
      const response = await fetch(withBase('/api/wall'), { credentials: 'same-origin' });
      if (!response.ok) return;
      const wall = (await response.json()) as WallSummary;
      get().setWall(wall);
    } catch {
      // Keep the current wall if the refresh fails.
    }
  },

  setInitialMood: (mood) =>
    set({ initialMood: mood, mood, moodFrom: mood, moodCrossfadeStartMs: 0 }),  transitionMood: (mood, nowMs = 0) => {
    const state = get();
    if (state.mood === mood) return;
    set({ moodFrom: state.mood, mood, moodCrossfadeStartMs: nowMs });
  },

  setManualMood: (mood) => set({ manualMood: mood }),

  enterAlbum: (albumId) => {
    const state = get();
    if (!state.wall.albums.some((album) => album.id === albumId)) return;
    const soundtrack = soundtrackReducer(state.soundtrack, { type: 'enter-album', albumId });
    set({
      viewMode: 'album',
      focusedAlbumId: albumId,
      focusedPhotoId: null,
      hoveredPhotoId: null,
      soundtrack,
      soundtrackClock: clockAfter(state.soundtrack, soundtrack, state.soundtrackClock),
    });
  },

  enterPrint: (albumId, photoId) => {
    const state = get();
    const album = state.wall.albums.find((candidate) => candidate.id === albumId);
    if (!album || !album.photos.some((photo) => photo.id === photoId)) return;
    const soundtrack = soundtrackReducer(state.soundtrack, { type: 'focus-print', albumId });
    set({
      viewMode: 'print',
      focusedAlbumId: albumId,
      focusedPhotoId: photoId,
      soundtrack,
      soundtrackClock: clockAfter(state.soundtrack, soundtrack, state.soundtrackClock),
    });
  },

  goOverview: () => {
    const state = get();
    const soundtrack = soundtrackReducer(state.soundtrack, { type: 'enter-overview' });
    set({
      viewMode: 'overview',
      overviewNonce: state.overviewNonce + 1,
      focusedAlbumId: null,
      focusedPhotoId: null,
      soundtrack,
      soundtrackClock: clockAfter(state.soundtrack, soundtrack, state.soundtrackClock),
    });
  },

  returnOneLevel: () => {
    const state = get();
    if (state.viewMode === 'print' && state.focusedAlbumId) {
      state.enterAlbum(state.focusedAlbumId);
      return;
    }
    state.goOverview();
  },

  stepPhoto: (delta) => {
    const state = get();
    const album = findAlbum(state, state.focusedAlbumId);
    if (!album || album.photos.length === 0) return;

    if (state.viewMode !== 'print') {
      const albumIndex = state.wall.albums.findIndex((candidate) => candidate.id === album.id);
      const nextAlbum = state.wall.albums[albumIndex + (delta > 0 ? 1 : -1)];
      if (nextAlbum) state.enterAlbum(nextAlbum.id);
      return;
    }

    const currentIndex = Math.max(
      0,
      album.photos.findIndex((photo) => photo.id === state.focusedPhotoId),
    );
    const nextIndex = Math.min(album.photos.length - 1, Math.max(0, currentIndex + delta));
    const nextPhoto = album.photos[nextIndex];
    if (nextPhoto) state.enterPrint(album.id, nextPhoto.id);
  },

  setHover: (albumId, photoId) => {
    const state = get();
    if (state.hoveredAlbumId === albumId && state.hoveredPhotoId === photoId) return;
    set({ hoveredAlbumId: albumId, hoveredPhotoId: photoId });
  },

  dispatchSoundtrack: (event) =>
    set((state) => {
      const next = soundtrackReducer(state.soundtrack, event);
      if (next === state.soundtrack) return state;
      return {
        soundtrack: next,
        soundtrackClock: clockAfter(state.soundtrack, next, state.soundtrackClock),
      };
    }),

  setSoundtrackClock: (clock) => set({ soundtrackClock: clock }),

  toggleGlare: () =>
    set((state) => ({ glareOff: !state.glareOff, glareToggleCount: state.glareToggleCount + 1 })),

  setPlacardMaterial: (material) => {
    storePlacardMaterial(material);
    set({ placardMaterial: material });
  },

  hydratePlacardMaterial: () => set({ placardMaterial: readStoredPlacardMaterial() }),

  setBottomInset: (px) => set({ bottomInsetPx: Math.max(0, px) }),

  setDemoMode: (demo) => set({ demoMode: demo }),
}));

/** Currently focused album/photo, for HUD and camera framing. */
export function selectFocused(state: WallStoreState): {
  album: WallAlbum | null;
  photo: WallPhoto | null;
} {
  const album = findAlbum(state, state.focusedAlbumId);
  return { album, photo: findPhoto(album, state.focusedPhotoId) };
}

/** Effective mood (admin preview wins over the solar baseline). */
export function selectEffectiveMood(state: WallStoreState): Mood {
  return state.manualMood ?? state.mood;
}

/**
 * Tokens at a point in time, incorporating the 60-second crossfade. Called from
 * render loops, so it never triggers React updates.
 */
export function readMoodTokens(state: WallStoreState, nowMs: number): MoodTokens {
  if (state.manualMood) return MOOD_TOKENS[state.manualMood];
  if (state.moodCrossfadeStartMs <= 0 || state.moodFrom === state.mood) {
    return MOOD_TOKENS[state.mood];
  }
  const elapsed = nowMs - state.moodCrossfadeStartMs;
  const progress = Math.min(1, Math.max(0, elapsed / MOOD_CROSSFADE_MS));
  return blendMoodTokens(MOOD_TOKENS[state.moodFrom], MOOD_TOKENS[state.mood], progress);
}
