'use client';

/**
 * In-world exhibition title signage, rendered inside `.wall-world` at the
 * upper-left margin so it scales with the camera like every album placard.
 *
 * The banner is a 2 × 1 horizontal exhibition plaque: `TITLE_SIGN_WIDTH` is two
 * album placards plus one grid gutter, and its height matches an album placard.
 * It reuses the Beveled Glass material family (`.mat-acrylic`) as a light,
 * cool-tinted translucent panel with aqua bevels, bottom corner standoffs and a
 * soft cast shadow. The painted `← home` wayfinding link sits flush-left
 * beneath it. `GalleryCanvas`'s native pointer handlers ignore
 * `.exhibition-sign-column`, so dragging from the link can never pan the wall.
 */

import {
  TITLE_SIGN_HEIGHT,
  TITLE_SIGN_WIDTH,
} from '@/lib/camera/cameraMath';

export interface ExhibitionTitleSignProps {
  /** CSS pixels inside `.wall-world` (`100px = 1 world unit`). */
  left: number;
  /** CSS pixels inside `.wall-world`, measured from the world origin. */
  top: number;
}

export default function ExhibitionTitleSign({ left, top }: ExhibitionTitleSignProps) {
  const width = Math.round(TITLE_SIGN_WIDTH * 100);
  const height = Math.round(TITLE_SIGN_HEIGHT * 100);

  return (
    <div className="exhibition-sign-column" style={{ left, top, width }}>
      <div className="exhibition-title-placard mat-acrylic" style={{ width, height }}>
        <span className="exhibition-title-line">greg&apos;s</span>
        <span className="exhibition-title-line">photo wall</span>
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
