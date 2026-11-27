'use client';

/**
 * Quiet gallery ephemera HUD for the strictly read-only public wall.
 *
 * A single persistent bottom-right `RETURN` control. Album names live on the
 * wall's placards (click one to open it); `PhotoFocusBar` carries the Print
 * Focus controls. No curator trigger, no auth probe and no manual mood
 * control: all curation lives in the server-gated `/admin` tree.
 */

import { useWallStore } from '@/store/useWallStore';

export default function GalleryHud() {
  const viewMode = useWallStore((state) => state.viewMode);
  const returnOneLevel = useWallStore((state) => state.returnOneLevel);
  const hidden = viewMode === 'overview';

  return (
    <button
      type="button"
      className={`hud-button hud-return-persistent${hidden ? ' is-hidden' : ''}`}
      onClick={returnOneLevel}
      title="Return one level"
      aria-hidden={hidden || undefined}
      disabled={hidden}
      tabIndex={hidden ? -1 : 0}
      inert={hidden || undefined}
    >
      RETURN
    </button>
  );
}
