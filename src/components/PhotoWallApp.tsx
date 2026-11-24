'use client';

/**
 * Client gallery shell for the playground wall engine.
 *
 * Composition:
 * - `PlaygroundGallery` owns the single camera store and renders
 *   `PlaygroundPbrWall` (single-pass WebGL2 plaster) under the culled,
 *   2D-transformed DOM islands.
 * - `GalleryHud` / `PhotoFocusBar` are chrome; `AdminDrawer` is lazy.
 * - `useWallManifest` is the live adapter over `GET /api/wall` (drafts already
 *   excluded server-side) and re-derives the wall whenever the Curator Drawer
 *   refreshes the store after publish/edit/delete.
 *
 * Query params (deterministic visual pins, never persisted):
 * - `?demo=4` — exact pinned playground four-album parity fixture.
 * - `?demo=1000` — 50 x 20 macro stress fixture (`?demo=2000` falls back here).
 * - `?mood=alabaster|concrete|chiaroscuro` — overrides the NYC solar mood.
 */

import dynamic from 'next/dynamic';
import { useEffect, useMemo, useState, type CSSProperties } from 'react';

import { withBase } from '@/lib/basePath';
import GalleryHud from '@/components/hud/GalleryHud';
import PhotoFocusBar from '@/components/hud/PhotoFocusBar';
import PlaygroundGallery from '@/components/wall/PlaygroundGallery';
import { useWallManifest } from '@/components/wall/useWallManifest';
import { buildDemoWallSummary, type DemoFixture } from '@/lib/dev/fakeManifest';
import type { WallSummary } from '@/lib/layout/types';
import {
  MOOD_POLL_INTERVAL_MS,
  determineAutoMood,
  type Mood,
} from '@/lib/lighting/nyTimeMood';
import { PLAYGROUND_THEMES, playgroundThemeStyle } from '@/lib/lighting/playgroundTheme';
import { useWallStore } from '@/store/useWallStore';

const AdminDrawer = dynamic(() => import('@/components/admin/AdminDrawer'), {
  ssr: false,
  loading: () => null,
});

const DEMO_FIXTURES: Record<string, DemoFixture> = { '4': 'four', '1000': 'thousand' };
const MOODS: readonly Mood[] = ['alabaster', 'concrete', 'chiaroscuro'];
const EMPTY_WALL: WallSummary = { cdnBase: '', albums: [] };

export interface PhotoWallAppProps {
  /** SSR manifest from `GET /api/wall` (public gallery). */
  initialWall?: WallSummary;
  /** Alias used by the `/admin` preview (`GET /api/admin/wall-preview`). */
  initialManifest?: WallSummary;
  initialMood: Mood;
  /** Manifest endpoint for refreshes; `/api/wall` by default. */
  manifestUrl?: string;
}

interface UrlPins {
  demo: DemoFixture | null;
  mood: Mood | null;
}

function resolveDemoFixture(raw: string | null): DemoFixture | null {
  if (!raw) return null;
  if (DEMO_FIXTURES[raw]) return DEMO_FIXTURES[raw];
  const parsed = Number(raw);
  if (Number.isFinite(parsed) && parsed > 0) {
    return parsed <= 20 ? 'four' : 'thousand';
  }
  return null;
}

function readUrlPins(): UrlPins {
  if (typeof window === 'undefined') return { demo: null, mood: null };
  const params = new URLSearchParams(window.location.search);
  const demo = params.get('demo');
  const mood = params.get('mood');
  return {
    demo: resolveDemoFixture(demo),
    mood: mood && (MOODS as readonly string[]).includes(mood) ? (mood as Mood) : null,
  };
}

export default function PhotoWallApp({
  initialWall,
  initialManifest,
  initialMood,
  manifestUrl = withBase('/api/wall'),
}: PhotoWallAppProps) {
  const initial = initialManifest ?? initialWall ?? EMPTY_WALL;
  const pins = useMemo(() => readUrlPins(), []);
  const manifest = useWallManifest(initial, {
    autoFetch: pins.demo === null,
    manifestUrl,
  });

  const manualMood = useWallStore((state) => state.manualMood);
  const curatorOpen = useWallStore((state) => state.curatorOpen);
  const setCuratorOpen = useWallStore((state) => state.setCuratorOpen);
  const [liveMood, setLiveMood] = useState<Mood | null>(null);

  const effectiveMood = manualMood ?? liveMood ?? initialMood;
  const theme = PLAYGROUND_THEMES[effectiveMood];

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
      store.setWall(initial);
    }

    if (pins.mood) store.setManualMood(pins.mood);

    void store.refreshAuth();
  }, [initial, initialMood, pins]);

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
    <div
      className="gallery-root-inner playground-wall-root"
      data-mood={effectiveMood}
      style={playgroundThemeStyle(theme) as CSSProperties}
    >
      <main className="gallery-stage">
        <PlaygroundGallery albums={manifest.albums} lodUrl={manifest.lodUrl} theme={theme} />
        <GalleryHud />
        <PhotoFocusBar />
        {curatorOpen ? <AdminDrawer onClose={() => setCuratorOpen(false)} /> : null}
      </main>
    </div>
  );
}
