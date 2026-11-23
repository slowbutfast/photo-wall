'use client';

/**
 * Client gallery shell: hydrates the Zustand store from the SSR manifest,
 * detects the `?demo=2000` benchmark client-side, polls NYC solar mood every
 * 60 seconds with a 60-second token crossfade, and composes the WebGL canvas,
 * HUD, Photo Focus bar, soundtrack overlay, and lazily loaded Curator Drawer.
 */

import dynamic from 'next/dynamic';
import { useEffect, useState } from 'react';

import GalleryHud from '@/components/hud/GalleryHud';
import PhotoFocusBar from '@/components/hud/PhotoFocusBar';
import SoundtrackOverlay from '@/components/wall/SoundtrackOverlay';
import { buildFakeWallSummary } from '@/lib/dev/fakeManifest';
import type { WallSummary } from '@/lib/layout/types';
import {
  MOOD_POLL_INTERVAL_MS,
  determineAutoMood,
  type Mood,
} from '@/lib/lighting/nyTimeMood';
import { useWallStore } from '@/store/useWallStore';

const PhotoWallCanvas = dynamic(() => import('@/components/wall/PhotoWallCanvas'), {
  ssr: false,
  loading: () => <div className="gallery-canvas-loading" aria-hidden="true" />,
});

const AdminDrawer = dynamic(() => import('@/components/admin/AdminDrawer'), {
  ssr: false,
  loading: () => null,
});

export interface PhotoWallAppProps {
  initialWall: WallSummary;
  initialMood: Mood;
}

export default function PhotoWallApp({ initialWall, initialMood }: PhotoWallAppProps) {
  const manualMood = useWallStore((state) => state.manualMood);
  const curatorOpen = useWallStore((state) => state.curatorOpen);
  const setCuratorOpen = useWallStore((state) => state.setCuratorOpen);
  const refreshAuth = useWallStore((state) => state.refreshAuth);
  const [liveMood, setLiveMood] = useState<Mood | null>(null);

  const effectiveMood = manualMood ?? liveMood ?? initialMood;
  const wrapperClass = 'gallery-root-inner';

  // Hydrate the store once on the client (also swaps in the demo manifest).
  useEffect(() => {
    const store = useWallStore.getState();
    store.setInitialMood(initialMood);

    const params = new URLSearchParams(window.location.search);
    const demo = params.get('demo');
    if (demo === '2000') {
      store.setDemoMode(true);
      store.setWall(buildFakeWallSummary(2000));
    } else {
      store.setDemoMode(false);
      store.setWall(initialWall);
    }

    void store.refreshAuth();
  }, [initialWall, initialMood]);

  // Local 60s solar mood poll with a 60s CSS/token crossfade.
  useEffect(() => {
    const tick = () => {
      const next = determineAutoMood(new Date());
      const store = useWallStore.getState();
      if (store.mood !== next) {
        store.transitionMood(next, performance.now());
        setLiveMood(next);
      }
    };
    const initialTimer = window.setTimeout(tick, 1000);
    const timer = window.setInterval(tick, MOOD_POLL_INTERVAL_MS);
    return () => {
      window.clearTimeout(initialTimer);
      window.clearInterval(timer);
    };
  }, []);

  return (
    <div className={wrapperClass} data-mood={effectiveMood}>
      <main className="gallery-stage">
        <PhotoWallCanvas />
        <GalleryHud />
        <PhotoFocusBar />
        <SoundtrackOverlay />
        {curatorOpen ? <AdminDrawer onClose={() => setCuratorOpen(false)} /> : null}
      </main>
    </div>
  );
}
