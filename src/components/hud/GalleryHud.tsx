'use client';

/**
 * Quiet gallery ephemera HUD for the strictly read-only public wall.
 *
 * Just the top-right `Overview` control. Album names live on the wall's
 * placards (click one to open it); the bottom bar only appears in Print Focus
 * as `PhotoFocusBar`. No curator trigger, no auth probe and no manual mood
 * control: all curation lives in the server-gated `/admin` tree.
 */

import { useWallStore } from '@/store/useWallStore';

export default function GalleryHud() {
  const viewMode = useWallStore((state) => state.viewMode);
  const goOverview = useWallStore((state) => state.goOverview);

  return (
    <div className="gallery-hud hud-top-right">
      <button
        type="button"
        className={`hud-button${viewMode === 'overview' ? ' active' : ''}`}
        onClick={goOverview}
        title="Return to Gallery Overview (0)"
      >
        Overview
      </button>
    </div>
  );
}
