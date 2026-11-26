// @vitest-environment jsdom

/**
 * Camera wake registry for `PrintSharpOverlay`.
 *
 * A focus hand-off mounts two overlays at once (outgoing + incoming). With a
 * single shared wake slot the newest overlay replaced the older one, which then
 * stopped following the camera and hung on screen as a frozen crisp copy of the
 * previous print. Every mounted overlay must be woken by the camera loop, and it
 * must sync inside that call, not one animation frame later.
 */

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import PrintSharpOverlay from '../PrintSharpOverlay';

class FakeMatrix {
  m41 = 0;
  m42 = 0;
  m43 = 0;
  toString() {
    return 'matrix3d(1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1)';
  }
}

const original = {
  matrix: (globalThis as { DOMMatrix?: unknown }).DOMMatrix,
  rect: HTMLElement.prototype.getBoundingClientRect,
  offsetWidth: Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetWidth'),
  offsetHeight: Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetHeight'),
};

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  (globalThis as { DOMMatrix?: unknown }).DOMMatrix = FakeMatrix;
  Object.defineProperty(HTMLElement.prototype, 'offsetWidth', { configurable: true, get: () => 100 });
  Object.defineProperty(HTMLElement.prototype, 'offsetHeight', { configurable: true, get: () => 100 });
  HTMLElement.prototype.getBoundingClientRect = function rect(this: HTMLElement) {
    const left = Number(this.dataset.left ?? 0);
    return { left, top: 0, width: 100, height: 100, right: left + 100, bottom: 100, x: left, y: 0 } as DOMRect;
  };
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  (globalThis as { DOMMatrix?: unknown }).DOMMatrix = original.matrix;
  HTMLElement.prototype.getBoundingClientRect = original.rect;
  if (original.offsetWidth) Object.defineProperty(HTMLElement.prototype, 'offsetWidth', original.offsetWidth);
  if (original.offsetHeight) Object.defineProperty(HTMLElement.prototype, 'offsetHeight', original.offsetHeight);
});

function buildWall(ids: string[]): HTMLElement {
  const container = document.createElement('div');
  container.className = 'wall-viewport';
  for (const id of ids) {
    const cell = document.createElement('div');
    cell.className = 'photo-cell';
    cell.dataset.left = '0';
    const frame = document.createElement('button');
    frame.className = 'photo-frame focused';
    frame.dataset.photoId = id;
    const win = document.createElement('span');
    win.className = 'photo-window';
    const sheen = document.createElement('span');
    sheen.className = 'photo-sheen';
    win.appendChild(sheen);
    frame.appendChild(win);
    cell.appendChild(frame);
    container.appendChild(cell);
  }
  document.body.appendChild(container);
  return container;
}

function mountOverlays(ids: string[], wakes: Set<() => void>, container: HTMLElement) {
  const containerRef = { current: container };
  const wakeRef = { current: wakes };
  act(() => {
    root.render(
      <>
        {ids.map((id) => (
          <PrintSharpOverlay
            key={id}
            containerRef={containerRef}
            active
            photoId={id}
            src={null}
            cameraWakeRef={wakeRef}
          />
        ))}
      </>,
    );
  });
}

describe('PrintSharpOverlay camera wake registry', () => {
  it('registers one wake per mounted overlay and removes it on unmount', () => {
    const container = buildWall(['a', 'b']);
    const wakes = new Set<() => void>();

    mountOverlays(['a', 'b'], wakes, container);
    expect(wakes.size).toBe(2);

    mountOverlays(['b'], wakes, container);
    expect(wakes.size).toBe(1);

    act(() => root.render(<></>));
    expect(wakes.size).toBe(0);
    container.remove();
  });

  it('moves every overlay with the camera in the same call, with no frame in between', () => {
    const container = buildWall(['a', 'b']);
    const wakes = new Set<() => void>();
    mountOverlays(['a', 'b'], wakes, container);

    const boxes = Array.from(document.querySelectorAll<HTMLElement>('.print-sharp-overlay'));
    expect(boxes).toHaveLength(2);

    for (const cell of container.querySelectorAll<HTMLElement>('.photo-cell')) cell.dataset.left = '240';
    for (const wake of wakes) wake();

    const moved = boxes.map((box) => box.style.transform);
    expect(moved[0]).toContain('translate(');
    expect(moved[1]).toContain('translate(');
    expect(moved[0]).toBe(moved[1]);

    for (const cell of container.querySelectorAll<HTMLElement>('.photo-cell')) cell.dataset.left = '480';
    for (const wake of wakes) wake();
    const next = boxes.map((box) => box.style.transform);
    expect(next[0]).not.toBe(moved[0]);
    expect(next[1]).not.toBe(moved[1]);
    container.remove();
  });

  it('mirrors the gyro flag instead of reading computed style on coarse pointers', () => {
    const container = buildWall(['a']);
    const wakes = new Set<() => void>();
    const matchMedia = window.matchMedia;
    window.matchMedia = ((query: string) => ({
      matches: query.includes('pointer: coarse'),
      media: query,
      addEventListener() {},
      removeEventListener() {},
      addListener() {},
      removeListener() {},
      onchange: null,
      dispatchEvent: () => false,
    })) as typeof window.matchMedia;
    try {
      mountOverlays(['a'], wakes, container);
      const box = document.querySelector<HTMLElement>('.print-sharp-overlay');
      const frame = container.querySelector<HTMLElement>('.photo-frame');
      expect(box && frame).toBeTruthy();

      frame!.style.setProperty('--gyro-on', '1');
      for (const wake of wakes) wake();
      expect(box!.style.getPropertyValue('--gyro-on')).toBe('1');

      frame!.style.removeProperty('--gyro-on');
      for (const wake of wakes) wake();
      expect(box!.style.getPropertyValue('--gyro-on')).toBe('');
    } finally {
      window.matchMedia = matchMedia;
      container.remove();
    }
  });
});
