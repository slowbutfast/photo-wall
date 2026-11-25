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
 * overlay lines up with the in-world frame, including during the camera flight.
 * The file is requested the moment focus starts (and warmed earlier by hover
 * prefetch), and the layer fades in as soon as it has loaded, so the print is
 * already sharp while the camera is still landing.
 */

import { useEffect, useRef, type RefObject } from 'react';

interface PrintSharpOverlayProps {
  containerRef: RefObject<HTMLElement | null>;
  /** True only in Print Focus. */
  active: boolean;
  /** The parent keys this component by print, so Prev / Next remounts it fresh. */
  photoId: string | null;
  /** Full-resolution URL of the focused print, known the moment focus starts. */
  src: string | null;
}

export default function PrintSharpOverlay({ containerRef, active, photoId, src }: PrintSharpOverlayProps) {
  const boxRef = useRef<HTMLDivElement>(null);
  const readyRef = useRef(false);

  useEffect(() => {
    if (!active || !photoId) return undefined;
    const boxAtMount = boxRef.current;

    let raf = 0;

    const tick = () => {
      raf = requestAnimationFrame(tick);
      const container = containerRef.current;
      const box = boxRef.current;
      const frame = container?.querySelector<HTMLElement>('.photo-frame.focused') ?? null;
      const cell = frame?.parentElement ?? null;
      const win = frame?.querySelector<HTMLElement>('.photo-window') ?? null;
      if (!container || !box || !frame || !cell || !win || cell.offsetWidth === 0) {
        box?.classList.remove('is-live');
        return;
      }

      const cellRect = cell.getBoundingClientRect();
      const containerRect = container.getBoundingClientRect();
      const scale = cellRect.width / cell.offsetWidth;

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
      box.classList.toggle('is-live', readyRef.current);
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
