// @vitest-environment jsdom

/**
 * `print-glare-tap-toggle` — tap routing on a framed print.
 *
 * On a coarse pointer, a tap on the focused print in Print Focus toggles the
 * glare (and still asks for iOS motion permission). Every other tap keeps its
 * meaning: neighbours navigate, drags pan, and mice never toggle.
 */

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

import type { WallPhoto } from '@/lib/layout/types';
import { useWallStore } from '@/store/useWallStore';

import FramedPrint from '../FramedPrint';
import type { GyroPermissionRequester } from '../useGyroTilt';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const PHOTO: WallPhoto = {
  id: 'p0',
  storagePath: 'albums/a/0.jpg',
  width: 1600,
  height: 1200,
  aspectRatio: 4 / 3,
  dominantColor: null,
  thumbHash: null,
  sortOrder: 0,
};

let host: HTMLDivElement;
let root: Root;

function stubPointer(coarse: boolean) {
  window.matchMedia = vi.fn((query: string) => ({
    matches: coarse && query.includes('pointer: coarse'),
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })) as unknown as typeof window.matchMedia;
}

interface Spies {
  onSelectPhoto: Mock<(albumId: string, photoId: string) => void>;
  onSelectAlbum: Mock<(albumId: string) => void>;
  requestGyroPermission: Mock<GyroPermissionRequester>;
}

async function render(
  props: { tier?: 'album' | 'print'; focused?: boolean; dragged?: boolean; scale?: number } = {},
): Promise<Spies> {
  const spies: Spies = {
    onSelectPhoto: vi.fn<(albumId: string, photoId: string) => void>(),
    onSelectAlbum: vi.fn<(albumId: string) => void>(),
    requestGyroPermission: vi.fn<GyroPermissionRequester>(async () => 'granted'),
  };
  await act(async () => {
    root.render(
      <FramedPrint
        albumId="a"
        albumTitle="Album A"
        photo={PHOTO}
        index={0}
        frameSize={{ width: 160, height: 120 }}
        lodUrl={() => 'https://cdn.test/1.jpg'}
        lodWidth={640}
        tier={props.tier ?? 'print'}
        scale={props.scale ?? 1}
        focused={props.focused ?? true}
        albumFocused
        onSelectAlbum={spies.onSelectAlbum}
        onSelectPhoto={spies.onSelectPhoto}
        wasDragged={() => props.dragged ?? false}
        requestGyroPermission={spies.requestGyroPermission}
      />,
    );
  });
  return spies;
}

async function tap() {
  await act(async () => {
    host.querySelector<HTMLButtonElement>('.photo-frame')?.click();
  });
}

beforeEach(() => {
  useWallStore.setState({ glareOff: false, glareToggleCount: 0 });
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});

describe('coarse pointer', () => {
  beforeEach(() => stubPointer(true));

  it('toggles glare on the focused print in Print Focus, without re-selecting it', async () => {
    const spies = await render();
    await tap();
    expect(useWallStore.getState().glareOff).toBe(true);
    expect(useWallStore.getState().glareToggleCount).toBe(1);
    expect(spies.onSelectPhoto).not.toHaveBeenCalled();
    expect(spies.requestGyroPermission).toHaveBeenCalledTimes(1);
    await tap();
    expect(useWallStore.getState().glareOff).toBe(false);
    expect(useWallStore.getState().glareToggleCount).toBe(2);
  });

  it('still navigates when the print is not focused', async () => {
    const spies = await render({ tier: 'print', focused: false });
    await tap();
    expect(useWallStore.getState().glareToggleCount).toBe(0);
    expect(spies.onSelectPhoto).toHaveBeenCalledWith('a', 'p0');
  });

  it('does not toggle outside Print Focus', async () => {
    const spies = await render({ tier: 'album', focused: true });
    await tap();
    expect(useWallStore.getState().glareToggleCount).toBe(0);
    expect(spies.onSelectPhoto).toHaveBeenCalledWith('a', 'p0');
  });

  it('ignores a tap that ended a drag', async () => {
    const spies = await render({ dragged: true });
    await tap();
    expect(useWallStore.getState().glareToggleCount).toBe(0);
    expect(spies.onSelectPhoto).not.toHaveBeenCalled();
  });
});

describe('fine pointer', () => {
  beforeEach(() => stubPointer(false));

  it('keeps the old behaviour on a focused print and never toggles', async () => {
    const spies = await render();
    await tap();
    expect(useWallStore.getState().glareToggleCount).toBe(0);
    expect(spies.onSelectPhoto).toHaveBeenCalledWith('a', 'p0');
    expect(spies.requestGyroPermission).not.toHaveBeenCalled();
  });
});
