'use client';

/**
 * Client gallery shell for the DOM wall engine.
 *
 * Composition:
 * - `GalleryViewport` owns the single camera store and renders `PbrWallCanvas`
 *   (WebGL2 plaster + baked lightmap) under `CssGalleryWorld` (2D-transformed,
 *   viewport-culled DOM islands).
 * - `GalleryHud` / `PhotoFocusBar` are chrome; `AdminDrawer` is lazy.
 * - `useWallManifest` is the live adapter over `GET /api/wall` (drafts already
 *   excluded server-side) and re-derives the wall whenever the Curator Drawer
 *   refreshes the store after publish/edit/delete.
 *
 * Query params (deterministic visual pins, never persisted):
 * - `?demo=4` — pinned four-album parity fixture (12-16 prints, mixed aspects).
 * - `?demo=1000` — 50 x 20 macro stress fixture.
 * - `?mood=alabaster|concrete|chiaroscuro` — overrides the NYC solar mood.
 */

import dynamic from 'next/dynamic';
import { useEffect, useMemo, useState } from 'react';

import GalleryHud from '@/components/hud/GalleryHud';
import PhotoFocusBar from '@/components/hud/PhotoFocusBar';
import GalleryViewport from '@/components/wall/GalleryViewport';
import { useWallManifest } from '@/components/wall/useWallManifest';
import { buildDemoWallSummary, type DemoFixture } from '@/lib/dev/fakeManifest';
import type { WallSummary } from '@/lib/layout/types';
import {
  MOOD_POLL_INTERVAL_MS,
  determineAutoMood,
  type Mood,
} from '@/lib/lighting/nyTimeMood';
import { useWallStore } from '@/store/useWallStore';

const AdminDrawer = dynamic(() => import('@/components/admin/AdminDrawer'), {
  ssr: false,
  loading: () => null,
});

const DEMO_FIXTURES: Record<string, DemoFixture> = { '4': 'four', '1000': 'thousand' };
const MOODS: readonly Mood[] = ['alabaster', 'concrete', 'chiaroscuro'];

export interface PhotoWallAppProps {
  initialWall: WallSummary;
  initialMood: Mood;
}

interface UrlPins {
  demo: DemoFixture | null;
  mood: Mood | null;
}

function readUrlPins(): UrlPins {
  if (typeof window === 'undefined') return { demo: null, mood: null };
  const params = new URLSearchParams(window.location.search);
  const demo = params.get('demo');
  const mood = params.get('mood');
  return {
    demo: demo && DEMO_FIXTURES[demo] ? DEMO_FIXTURES[demo] : null,
    mood: mood && (MOODS as readonly string[]).includes(mood) ? (mood as Mood) : null,
  };
}

export default function PhotoWallApp({ initialWall, initialMood }: PhotoWallAppProps) {
  const pins = useMemo(() => readUrlPins(), []);
  const manifest = useWallManifest(initialWall, { autoFetch: pins.demo === null });

  const manualMood = useWallStore((state) => state.manualMood);
  const curatorOpen = useWallStore((state) => state.curatorOpen);
  const setCuratorOpen = useWallStore((state) => state.setCuratorOpen);
  const [liveMood, setLiveMood] = useState<Mood | null>(null);

  const effectiveMood = manualMood ?? liveMood ?? initialMood;

  // Hydrate the store once on the client: SSR wall or demo fixture, mood pin,
  // persisted placard material and the admin session probe.
  useEffect(() => {
    const store = useWallStore.getState();
    store.setInitialMood(initialMood);
    store.hydratePlacardMaterial();

    if (pins.demo) {
      store.setDemoMode(true);
      store.setWall(buildDemoWallSummary(pins.demo));
    } else {
      store.setDemoMode(false);
      store.setWall(initialWall);
    }

    if (pins.mood) store.setManualMood(pins.mood);

    void store.refreshAuth();
  }, [initialWall, initialMood, pins]);

  // Local 60s solar mood poll with a 60s token crossfade. A `?mood=` pin is
  // deterministic and disables the poll for that page load.
  useEffect(() => {
    if (pins.mood) return;
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
  }, [pins.mood]);

  return (
    <div className="gallery-root-inner" data-mood={effectiveMood}>
      <main className="gallery-stage">
        <GalleryViewport albums={manifest.albums} lodUrl={manifest.lodUrl} />
        <GalleryHud />
        <PhotoFocusBar />
        {curatorOpen ? <AdminDrawer onClose={() => setCuratorOpen(false)} /> : null}
      </main>
    </div>
  );
}
