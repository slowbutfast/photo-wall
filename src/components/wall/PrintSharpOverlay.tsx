'use client';

/**
 * Crisp full-resolution layer for the focused print.
 *
 * The wall is zoomed with a CSS `scale()` on `.wall-world`, and the focused
 * frame sits on a 3D layer (`translateZ` + `perspective`). Safari and Firefox
 * paint such a layer once at its unzoomed size and then stretch the bitmap, so
 * even a 2048px `<img>` looks soft. This component draws a second `<img>` of
 * the same (cached) file *outside* the scaled world, at its real on-screen
 * size, so the browser decodes and paints it at device resolution.
 *
 * Geometry is read from the live DOM every frame while a print is focused:
 * the frame's computed transform (hover tilt, lift) is mirrored with its
 * translation scaled by the world scale, and the sheen is copied over, so the
 * overlay lines up with the in-world frame. It only fades in once the camera
 * has stopped moving; while moving, the in-world print is shown as before.
 */

import { useEffect, useRef, useState, type RefObject } from 'react';

/** Frames the focused print must sit still before the overlay is revealed. */
const STABLE_FRAMES = 8;

interface PrintSharpOverlayProps {
  containerRef: RefObject<HTMLElement | null>;
  /** True only in Print Focus. */
  active: boolean;
  /** The parent keys this component by print, so Prev / Next remounts it fresh. */
  photoId: string | null;
}

export default function PrintSharpOverlay({ containerRef, active, photoId }: PrintSharpOverlayProps) {
  const boxRef = useRef<HTMLDivElement>(null);
  const readyRef = useRef(false);
  const srcRef = useRef<string | null>(null);
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    if (!active || !photoId) return undefined;
    const boxAtMount = boxRef.current;

    let raf = 0;
    let stable = 0;
    let lastKey = '';

    const tick = () => {
      raf = requestAnimationFrame(tick);
      const container = containerRef.current;
      const box = boxRef.current;
      const frame = container?.querySelector<HTMLElement>('.photo-frame.focused') ?? null;
      const cell = frame?.parentElement ?? null;
      const win = frame?.querySelector<HTMLElement>('.photo-window') ?? null;
      const inImg = win?.querySelector<HTMLImageElement>('img.photo-img') ?? null;
      if (!container || !box || !frame || !cell || !win || !inImg || cell.offsetWidth === 0) {
        box?.classList.remove('is-live');
        return;
      }

      const cellRect = cell.getBoundingClientRect();
      const containerRect = container.getBoundingClientRect();
      const scale = cellRect.width / cell.offsetWidth;

      const key = `${cellRect.left.toFixed(1)}|${cellRect.top.toFixed(1)}|${cellRect.width.toFixed(1)}`;
      stable = key === lastKey ? stable + 1 : 0;
      lastKey = key;

      // Take the file the in-world <img> resolved to (already requested, cached).
      if (inImg.complete && inImg.naturalWidth > 0 && inImg.currentSrc && srcRef.current !== inImg.currentSrc) {
        srcRef.current = inImg.currentSrc;
        readyRef.current = false;
        setSrc(inImg.currentSrc);
      }

      // Window box inside the frame (layout px, border-box coordinates).
      const windowWidth = win.offsetWidth;
      const windowHeight = win.offsetHeight;
      const dx = frame.clientLeft + win.offsetLeft + windowWidth / 2 - frame.offsetWidth / 2;
      const dy = frame.clientTop + win.offsetTop + windowHeight / 2 - frame.offsetHeight / 2;

      box.style.width = `${windowWidth * scale}px`;
      box.style.height = `${windowHeight * scale}px`;
      const originX = scale * (windowWidth / 2 - dx);
      const originY = scale * (windowHeight / 2 - dy);
      box.style.transformOrigin = `${originX}px ${originY}px`;

      const centerX = cellRect.left + cellRect.width / 2 - containerRect.left;
      const centerY = cellRect.top + cellRect.height / 2 - containerRect.top;

      let matrix: DOMMatrix;
      try {
        const computed = getComputedStyle(frame).transform;
        matrix = new DOMMatrix(computed === 'none' ? undefined : computed);
      } catch {
        matrix = new DOMMatrix();
      }
      matrix.m41 *= scale;
      matrix.m42 *= scale;
      matrix.m43 *= scale;
      const perspective = parseFloat(getComputedStyle(cell).perspective) || 1150;
      box.style.transform =
        `translate(${centerX - originX}px, ${centerY - originY}px) ` +
        `perspective(${perspective * scale}px) ${matrix.toString()}`;

      // Mirror the hover glare.
      const sheenIn = win.querySelector<HTMLElement>('.photo-sheen');
      const sheenOut = box.querySelector<HTMLElement>('.photo-sheen');
      if (sheenIn && sheenOut) {
        sheenOut.style.transform = sheenIn.style.transform;
        sheenOut.style.opacity = sheenIn.style.opacity;
      }

      const outImg = box.querySelector<HTMLImageElement>('img.print-sharp-img');
      if (outImg?.complete && outImg.naturalWidth > 0) readyRef.current = true;
      box.classList.toggle('is-live', stable >= STABLE_FRAMES && readyRef.current);
    };

    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      boxAtMount?.classList.remove('is-live');
    };
  }, [active, photoId, containerRef]);

  if (!active) return null;

  return (
    <div className="print-sharp-layer" aria-hidden="true">
      <div className="print-sharp-overlay" ref={boxRef}>
        {src ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            className="print-sharp-img"
            src={src}
            alt=""
            draggable={false}
            onLoad={() => {
              readyRef.current = true;
            }}
          />
        ) : null}
        <span className="photo-paper-grain" />
        <span className="photo-sheen" />
      </div>
    </div>
  );
}
