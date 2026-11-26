'use client';

/**
 * In-world exhibition title signage, rendered inside `.wall-world` at the
 * upper-left margin so it scales with the camera like every album placard.
 *
 * `greg's photo wall` reuses the verbatim Beveled Acrylic Glass material via
 * `.mat-acrylic` (widened in `wall.css`), with the painted `← home` wayfinding
 * link directly beneath it. `GalleryCanvas`'s native pointer handlers ignore
 * `.exhibition-sign-column`, so dragging from the link can never pan the wall.
 */

export interface ExhibitionTitleSignProps {
  /** CSS pixels inside `.wall-world` (`100px = 1 world unit`). */
  left: number;
  /** CSS pixels inside `.wall-world`, measured from the world origin. */
  top: number;
}

export default function ExhibitionTitleSign({ left, top }: ExhibitionTitleSignProps) {
  return (
    <div className="exhibition-sign-column" style={{ left, top }}>
      <div className="exhibition-title-placard mat-acrylic">
        <span className="exhibition-title-line">greg&apos;s photo</span>
        <span className="exhibition-title-line">wall</span>
        <span className="placard-standoff left" />
        <span className="placard-standoff right" />
      </div>

      <a
        className="exhibition-home-link"
        href="https://gregory-lazatin.com"
        onPointerDown={(event) => event.stopPropagation()}
      >
        <span className="home-arrow" aria-hidden="true">
          ←
        </span>
        <span>home</span>
      </a>
    </div>
  );
}
