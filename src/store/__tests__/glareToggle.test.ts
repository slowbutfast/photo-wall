/**
 * `print-glare-tap-toggle` — the session-only glare flag in `useWallStore`.
 * It must survive navigation and wall refreshes, and never touch storage.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useWallStore } from '../useWallStore';

function reset() {
  useWallStore.setState({ glareOff: false, glareToggleCount: 0 });
}

describe('glare toggle', () => {
  beforeEach(reset);

  it('starts with glare on and no toggles', () => {
    expect(useWallStore.getState().glareOff).toBe(false);
    expect(useWallStore.getState().glareToggleCount).toBe(0);
  });

  it('toggleGlare flips the flag and counts every toggle', () => {
    const { toggleGlare } = useWallStore.getState();
    toggleGlare();
    expect(useWallStore.getState()).toMatchObject({ glareOff: true, glareToggleCount: 1 });
    toggleGlare();
    expect(useWallStore.getState()).toMatchObject({ glareOff: false, glareToggleCount: 2 });
    toggleGlare();
    expect(useWallStore.getState()).toMatchObject({ glareOff: true, glareToggleCount: 3 });
  });

  it('survives navigation between overview, albums and prints', () => {
    useWallStore.getState().setWall({
      cdnBase: '',
      albums: [
        {
          id: 'a',
          slug: 'a',
          title: 'A',
          description: null,
          gridColumns: 4,
          sortOrder: 0,
          position: { x: 0, y: 0 },
          bounds: { width: 10, height: 8 },
          cameraName: null,
          dateLabel: null,
          locationLabel: null,
          soundtrack: null,
          photos: [
            {
              id: 'p0',
              storagePath: 'albums/a/0.jpg',
              width: 100,
              height: 100,
              aspectRatio: 1,
              dominantColor: null,
              thumbHash: null,
              sortOrder: 0,
            },
          ],
        },
      ],
    });
    useWallStore.getState().toggleGlare();
    useWallStore.getState().enterAlbum('a');
    useWallStore.getState().enterPrint('a', 'p0');
    expect(useWallStore.getState().viewMode).toBe('print');
    expect(useWallStore.getState().glareOff).toBe(true);
    useWallStore.getState().returnOneLevel();
    useWallStore.getState().goOverview();
    expect(useWallStore.getState().glareOff).toBe(true);
  });

  it('survives a manifest reset', () => {
    useWallStore.getState().toggleGlare();
    useWallStore.getState().setWall({ cdnBase: '', albums: [] });
    expect(useWallStore.getState()).toMatchObject({ glareOff: true, glareToggleCount: 1 });
  });

  it('never writes to browser storage', () => {
    const setItem = vi.fn();
    vi.stubGlobal('localStorage', { getItem: vi.fn(), setItem, removeItem: vi.fn() });
    vi.stubGlobal('sessionStorage', { getItem: vi.fn(), setItem, removeItem: vi.fn() });
    useWallStore.getState().toggleGlare();
    useWallStore.getState().toggleGlare();
    expect(setItem).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});
