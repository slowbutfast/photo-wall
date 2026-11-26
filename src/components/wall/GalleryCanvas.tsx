'use client';

/**
 * Pure manifest-driven wall canvas: one camera controller, one culled DOM wall,
 * one single-pass WebGL2 plaster shader.
 *
 * Shared verbatim by the public gallery (`mode="public"`, fed by
 * `GET /api/wall`) and the Curator Studio (`mode="preview"`, fed by
 * `GET /api/admin/wall-preview`). Preview mode layers draft affordances
 * (dashed mat + `"Draft"` placard badge) and reports island selection through
 * `onSelectAlbum` without forking the camera or shader code.
 *
 * Reused production contracts:
 * - `cameraMath.ts` — clamped cursor zoom, Y-flip, aspect-aware Row-0 framing,
 *   `bottomInsetPx`, van Wijk fly-to.
 * - `visibleIslands.ts` / `zoomTier.ts` / `macroMosaic.ts` — DOM culling and the
 *   `scale < 0.25` mosaic tier.
 * - `islandLayout.ts` — absolute island + cell geometry (1px playground golden).
 * - `soundtrackState.ts` — plaque state machine (kept playing across print
 *   focus, paused on overview).
 *
 * Renderer:
 * - `PlaygroundPbrWall` reads up to 128 culled spots from a row-major
 *   `RGBA32F` data texture and applies the playground filmic curve once.
 * - `.playground-wall-root` CSS is extracted verbatim from the pinned
 *   playground; world `preserve-3d`/sway is dropped so Chrome keeps the
 *   `backdrop-filter` backdrop root.
 */

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';

import {
  CAMERA_FOV_DEG,
  ZOOM_MAX,
  ZOOM_MIN,
  cameraToCssScale,
  clampCameraToBounds,
  computeFirstRowBounds,
  computeMaxZoom,
  computeWallBounds,
  fitBoundsToViewport,
  snapToDevicePixel,
  worldPerPixel,
  worldXToCssLeft,
  worldYToCssTop,
  zoomToCursor,
  type Bounds,
  type CameraState,
} from '@/lib/camera/cameraMath';
import { planFlight, sampleFlight, type FlightKind } from '@/lib/camera/flightPlan';
import { CELL_SIZE, PLACARD_GAP, PLACARD_WIDTH, computeAlbumGrid, entryFirstRowCount } from '@/lib/layout/islandLayout';
import type { AlbumPlacement, WallAlbum, WallPhoto } from '@/lib/layout/types';
import {
  computePlaygroundLighting,
  playgroundLightingVars,
  selectVisibleSpots,
  type PlaygroundShadedObject,
} from '@/lib/lighting/playgroundLighting';
import type { PlaygroundTheme } from '@/lib/lighting/playgroundTheme';
import { useWallStore } from '@/store/useWallStore';

import PlaygroundPbrWall, { type PlaygroundPbrWallHandle } from './PlaygroundPbrWall';
import SoundtrackPlaque from './SoundtrackPlaque';
import AlbumPlacard from './AlbumPlacard';
import FramedPrint from './FramedPrint';
import MacroIsland from './MacroIsland';
import PrintSharpOverlay from './PrintSharpOverlay';
import { prefetchPrintImage } from './printImagePrefetch';
import { beginPointer, createIdleGesture, movePointer, releasePointer, type GestureState } from './pinchGesture';
import { islandRectStyle } from './islandPlacement';
import { fitFrameInCell } from './macroMosaic';
import type { PlacardMaterial } from './placardMaterial';
import {
  createFocusHandoff,
  type FocusHandoff,
  type FocusHandoffBegin,
  type FocusHandoffSink,
} from './focusHandoff';
import { handoffDebug } from './handoffDebug';
import { useGyroTilt, type GyroPermissionRequester, type GyroSubscribe } from './useGyroTilt';
import { visibleIslands } from './visibleIslands';
import {
  PRINT_FOCUS_LOD_WIDTH,
  resolveProjectedLodWidth,
  resolveZoomTier,
  type ZoomTier,
} from './zoomTier';

const DEFAULT_CAMERA: CameraState = { x: 0, y: 0, z: 44 };
const SETTLE_MS = 140;
const ENTRY_PADDING = 0.06;
const ALBUM_PADDING = 0.1;
const PRINT_PADDING = 0.14;
/** Portrait phones get a tighter Print Focus frame so the print fills ~84%. */
const PRINT_PADDING_TOUCH_PORTRAIT = 0.08;

/**
 * `FramedPrint` routes a click to Album Focus (not Print Focus) below this CSS
 * scale. It must therefore be part of the imperative snapshot key, or crossing
 * the threshold mid-gesture would leave click routing stale.
 */
const PRINT_CLICK_SCALE_THRESHOLD = 0.52;

/**
 * Coarse-pointer probe. `useSyncExternalStore` reads the real media query on
 * the client but returns the server snapshot (`false`) during SSR and the
 * hydration render, so server HTML and the first client render always match
 * (zero hydration mismatch). Coarse devices accept one post-mount LOD bucket
 * update instead.
 */
const COARSE_POINTER_QUERY = '(pointer: coarse)';

function subscribeCoarsePointer(onChange: () => void): () => void {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return () => {};
  const query = window.matchMedia(COARSE_POINTER_QUERY);
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
}

function getCoarsePointerSnapshot(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia(COARSE_POINTER_QUERY).matches;
}

function getCoarsePointerServerSnapshot(): boolean {
  return false;
}

/** Non-focused thumbnail DPR cap applied on coarse pointers. */
const COARSE_MAX_THUMB_DPR = 2;

/**
 * Every value a descendant reads off React `snapshot` / `scale`: the zoom tier,
 * the projected LOD bucket, the `scale < 0.52` click-routing threshold, and the
 * visible island ID set. `setSnapshot` is skipped while this string is stable.
 */
export function buildSnapshotKey(
  tier: ZoomTier,
  lodWidth: number,
  scale: number,
  visibleIds: readonly string[],
): string {
  return `${tier}|${lodWidth}|${scale < PRINT_CLICK_SCALE_THRESHOLD ? 1 : 0}|${visibleIds.join(',')}`;
}

export type GalleryCanvasMode = 'public' | 'preview';

export interface GalleryCanvasProps {
  albums: readonly WallAlbum[];
  /** Longest-edge LOD URL builder bound to the manifest's CDN base. */
  lodUrl: (photo: WallPhoto, longestEdge: number) => string;
  theme: PlaygroundTheme;
  /** `public` is read-only; `preview` marks drafts and reports selection. */
  mode?: GalleryCanvasMode;
  /** Album highlighted by the Curator Studio sidebar. */
  selectedAlbumId?: string | null;
  /** Curator Studio selection seam (island or placard click). */
  onSelectAlbum?: (albumId: string) => void;
}

interface IslandLighting {
  placard?: Record<string, string>;
  prints: Map<number, Record<string, string>>;
}

function buildLightingByAlbum(
  objects: readonly PlaygroundShadedObject[],
): Map<string, IslandLighting> {
  const byAlbum = new Map<string, IslandLighting>();
  for (const object of objects) {
    let entry = byAlbum.get(object.albumId);
    if (!entry) {
      entry = { prints: new Map() };
      byAlbum.set(object.albumId, entry);
    }
    if (object.kind === 'placard') entry.placard = playgroundLightingVars(object);
    else entry.prints.set(object.index, playgroundLightingVars(object));
  }
  return byAlbum;
}

export default function GalleryCanvas({
  albums: rawAlbums,
  lodUrl,
  theme,
  mode = 'public',
  selectedAlbumId = null,
  onSelectAlbum,
}: GalleryCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const worldRef = useRef<HTMLDivElement>(null);
  const wallRef = useRef<PlaygroundPbrWallHandle>(null);

  const cameraRef = useRef<CameraState>({ ...DEFAULT_CAMERA });
  const targetRef = useRef<CameraState>({ ...DEFAULT_CAMERA });
  const flightRef = useRef<{
    from: CameraState;
    to: CameraState;
    kind: FlightKind;
    startedAt: number;
    durationMs: number;
  } | null>(null);
  const handoffRef = useRef<FocusHandoff | null>(null);
  const [handoffParticipants, setHandoffParticipants] = useState<
    Array<{ photoId: string; src: string | null }>
  >([]);

  const viewportRef = useRef({ width: 1, height: 1, dpr: 1 });
  const gestureRef = useRef<GestureState>(createIdleGesture());
  const lastGestureAtRef = useRef(0);
  const willChangeRef = useRef(false);
  const settleTimerRef = useRef<number | null>(null);
  const rafRef = useRef(0);
  const animatingRef = useRef(false);
  const entryNonceRef = useRef<number | null>(null);
  // Coalesced gesture input: `onPointerMove` only accumulates here; the rAF
  // loop applies one pan + one pinch step per vsync while pointers are down.
  const pendingPanRef = useRef({ dx: 0, dy: 0 });
  const pendingPinchRef = useRef<{ zoomFactor: number; anchor: { x: number; y: number } } | null>(null);
  // Indirection so `requestFrame` (defined before the gesture callbacks) can
  // flush without a circular dependency.
  const flushPendingInputRef = useRef<() => void>(() => {});
  // Imperative snapshot gating: `setSnapshot` only when this key changes (or
  // once on settle). Seed it with `''` so the first frame always publishes.
  const lastSnapshotKeyRef = useRef('');
  const wasSettledRef = useRef(false);
  const coarsePointer = useSyncExternalStore(
    subscribeCoarsePointer,
    getCoarsePointerSnapshot,
    getCoarsePointerServerSnapshot,
  );
  const maxThumbDpr = coarsePointer ? COARSE_MAX_THUMB_DPR : Number.POSITIVE_INFINITY;
  // Read inside the rAF callback so a coarse-pointer flip never leaves a stale
  // LOD bucket in the imperative snapshot key.
  const maxThumbDprRef = useRef(maxThumbDpr);
  maxThumbDprRef.current = maxThumbDpr;
  const coarsePointerRef = useRef(coarsePointer);
  // Camera-motion wake for `PrintSharpOverlay`; `applyCamera` pings it every
  // frame the loop runs, and the overlay's own scheduler coalesces the wakes.
  const overlayWakeRef = useRef<Set<() => void>>(new Set());

  const [viewport, setViewport] = useState({ width: 1, height: 1, dpr: 1 });
  const [snapshot, setSnapshot] = useState<CameraState>({ ...DEFAULT_CAMERA });
  const [containerTier, setContainerTier] = useState<ZoomTier>('album');

  const viewMode = useWallStore((state) => state.viewMode);
  const overviewNonce = useWallStore((state) => state.overviewNonce);
  const focusedAlbumId = useWallStore((state) => state.focusedAlbumId);
  const focusedPhotoId = useWallStore((state) => state.focusedPhotoId);
  // Read inside the rAF loop without re-creating `requestFrame`.
  const focusStateRef = useRef({ albumId: focusedAlbumId, photoId: focusedPhotoId });
  focusStateRef.current = { albumId: focusedAlbumId, photoId: focusedPhotoId };
  // Previous semantic focus, so the hand-off can tell album→print from
  // print→print and print→album. Updated at the end of the focus effect.
  const prevFocusRef = useRef<{
    albumId: string | null;
    photoId: string | null;
    viewMode: string;
  }>({ albumId: focusedAlbumId, photoId: focusedPhotoId, viewMode });
  const bottomInsetPx = useWallStore((state) => state.bottomInsetPx);
  const placardMaterial = useWallStore((state) => state.placardMaterial);
  const soundtrack = useWallStore((state) => state.soundtrack);
  const dispatchSoundtrack = useWallStore((state) => state.dispatchSoundtrack);
  const enterAlbum = useWallStore((state) => state.enterAlbum);
  const enterPrint = useWallStore((state) => state.enterPrint);
  const goOverview = useWallStore((state) => state.goOverview);
  const returnOneLevel = useWallStore((state) => state.returnOneLevel);
  const stepPhoto = useWallStore((state) => state.stepPhoto);

  const selectAlbum = useCallback(
    (albumId: string) => {
      onSelectAlbum?.(albumId);
      enterAlbum(albumId);
    },
    [enterAlbum, onSelectAlbum],
  );

  const albums = useMemo<WallAlbum[]>(
    () =>
      rawAlbums.map((album) => ({
        ...album,
        photos: [...album.photos].sort((a, b) => a.sortOrder - b.sortOrder),
      })),
    [rawAlbums],
  );

  const placements = useMemo<AlbumPlacement[]>(
    () => albums.map((album) => ({ id: album.id, position: album.position, bounds: album.bounds })),
    [albums],
  );
  const wallBounds = useMemo(() => computeWallBounds(placements), [placements]);
  const wallBoundsRef = useRef(wallBounds);
  wallBoundsRef.current = wallBounds;
  const placementsRef = useRef(placements);
  placementsRef.current = placements;

  const lighting = useMemo(() => computePlaygroundLighting(albums), [albums]);
  const lightingByAlbum = useMemo(
    () => buildLightingByAlbum(lighting.objects),
    [lighting.objects],
  );
  const fixturesRef = useRef(lighting.fixtures);
  fixturesRef.current = lighting.fixtures;
  const themeRef = useRef(theme);
  themeRef.current = theme;

  const scale = cameraToCssScale(snapshot.z, Math.max(1, viewport.height));
  const tier: ZoomTier = resolveZoomTier(scale, Boolean(focusedAlbumId && focusedPhotoId));
  // Mobile-only sensor feed: coarse pointer, motion allowed, off in macro tier.
  // Emits imperatively (no setState per sensor tick) to subscribed prints.
  const gyro = useGyroTilt(tier, focusedPhotoId);
  const visible = useMemo(
    () => visibleIslands(snapshot, viewport, placements, 3),
    [snapshot, viewport, placements],
  );

  // --- camera <-> DOM + WebGL ----------------------------------------------
  const applyCamera = useCallback((settled = false) => {
    const camera = cameraRef.current;
    const view = viewportRef.current;
    const world = worldRef.current;
    if (!world) return;
    const cssScale = cameraToCssScale(camera.z, Math.max(1, view.height));
    if (coarsePointerRef.current) {
      // Same matrix as `scale(s) translate3d(...)` with `transform-origin: 0 0`.
      // On the settled frame, snap the translation to whole device pixels so
      // mat corners stay crisp at rest.
      let tx = -camera.x * 100 * cssScale;
      let ty = camera.y * 100 * cssScale;
      if (settled) {
        tx = snapToDevicePixel(tx, view.dpr);
        ty = snapToDevicePixel(ty, view.dpr);
      }
      world.style.transform = `translate3d(${tx.toFixed(6)}px, ${ty.toFixed(6)}px, 0) scale(${cssScale.toFixed(6)})`;
    } else {
      world.style.transform = `scale(${cssScale.toFixed(6)}) translate3d(${(-camera.x * 100).toFixed(3)}px, ${(camera.y * 100).toFixed(3)}px, 0px)`;
    }
    const spots = selectVisibleSpots(fixturesRef.current, camera, view);
    wallRef.current?.render(camera, view, spots, themeRef.current);
    // Keep the sharp overlay aligned on every camera frame (flights, pan,
    // zoom); its scheduler coalesces repeated wakes.
    for (const wake of overlayWakeRef.current) wake();
  }, []);

  const requestFrame = useCallback(() => {
    if (animatingRef.current) return;
    animatingRef.current = true;
    rafRef.current = requestAnimationFrame(function frame(now) {
      // Apply anything the pointer handlers accumulated since the last vsync
      // before reading the camera, so this frame renders the newest input.
      flushPendingInputRef.current();
      const camera = cameraRef.current;
      const target = targetRef.current;
      const flight = flightRef.current;
      const handoff = handoffRef.current;
      let eased: number | null = null;

      if (flight) {
        const t = Math.min(1, (now - flight.startedAt) / Math.max(1, flight.durationMs));
        const sample = sampleFlight(flight.from, flight.to, flight.kind, t);
        eased = sample.eased;
        camera.x = sample.camera.x;
        camera.y = sample.camera.y;
        camera.z = sample.camera.z;
        targetRef.current = { ...sample.camera };
        if (t >= 1) {
          flightRef.current = null;
          gyro.setHold(false);
          handoffDebug.flightEnd();
        }
      } else {
        const ease = 0.24;
        camera.x += (target.x - camera.x) * ease;
        camera.y += (target.y - camera.y) * ease;
        camera.z += (target.z - camera.z) * ease;
        if (
          Math.abs(target.x - camera.x) < 1e-4 &&
          Math.abs(target.y - camera.y) < 1e-4 &&
          Math.abs(target.z - camera.z) < 1e-4
        ) {
          camera.x = target.x;
          camera.y = target.y;
          camera.z = target.z;
        }
      }

      camera.z = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, camera.z));
      if (!flightRef.current) {
        const clamped = clampCameraToBounds(camera, wallBoundsRef.current, viewportRef.current);
        camera.x = clamped.x;
        camera.y = clamped.y;
        camera.z = clamped.z;
      }

      // One clock: the hand-off reads the very same eased progress as the
      // camera. With no flight (a cancel or an already-running release) the
      // loop drives the 160 ms release instead.
      if (eased !== null) handoff?.tick(eased);
      else handoff?.advance(now);
      const handoffActive = handoff?.isActive() ?? false;
      if (handoffActive && handoffDebug.enabled) handoffDebug.weights(handoff?.participants() ?? []);

      // Imperative snapshot key: descendants read `tier`, `lodWidth`,
      // `scale < 0.52`, and the visible island set, so only those changes (or
      // the final settled camera) need a React render. `world.style.transform`
      // below still updates every frame, so pan/zoom stays smooth.
      const view = viewportRef.current;
      const cssScale = cameraToCssScale(camera.z, Math.max(1, view.height));
      const zoomTier = resolveZoomTier(
        cssScale,
        Boolean(focusStateRef.current.albumId && focusStateRef.current.photoId),
      );
      const nextLodWidth = resolveProjectedLodWidth(
        CELL_SIZE * 100,
        cssScale,
        view.dpr,
        maxThumbDprRef.current,
      );
      const visibleIds = visibleIslands(camera, view, placementsRef.current, 3).map(
        (entry) => entry.id,
      );
      const snapshotKey = buildSnapshotKey(zoomTier, nextLodWidth, cssScale, visibleIds);

      if (
        willChangeRef.current &&
        gestureRef.current.pointers.length === 0 &&
        now - lastGestureAtRef.current > SETTLE_MS &&
        !flightRef.current &&
        !handoffActive
      ) {
        willChangeRef.current = false;
        if (worldRef.current) worldRef.current.style.willChange = 'auto';
        handoffDebug.willChange('auto');
      }

      // While any pointer is down the loop must keep ticking every vsync: a
      // pending rAF keeps WebKit delivering `pointermove` and holds
      // `will-change: transform` for the whole gesture. An active hand-off also
      // keeps the loop alive until its last weight lands.
      const settled =
        gestureRef.current.pointers.length === 0 &&
        !flightRef.current &&
        !handoffActive &&
        Math.abs(targetRef.current.x - cameraRef.current.x) < 1e-3 &&
        Math.abs(targetRef.current.y - cameraRef.current.y) < 1e-3 &&
        Math.abs(targetRef.current.z - cameraRef.current.z) < 1e-3;

      applyCamera(settled);
      if (settled) gyro.setHold(false);

      // Mid-gesture pan/zoom skips React entirely; the settle frame always
      // publishes the exact final camera so click routing and LOD are current.
      const snapshotChanged = snapshotKey !== lastSnapshotKeyRef.current;
      if (snapshotChanged || (settled && !wasSettledRef.current)) {
        lastSnapshotKeyRef.current = snapshotKey;
        setSnapshot({ x: camera.x, y: camera.y, z: camera.z });
      }
      wasSettledRef.current = settled;

      if (settled) {
        animatingRef.current = false;
        rafRef.current = 0;
        return;
      }
      rafRef.current = requestAnimationFrame(frame);
    });
  }, [applyCamera, gyro]);

  // A post-mount coarse-pointer detection changes the effective thumbnail DPR
  // cap. Republish once so the imperative snapshot key and every descendant
  // move to the capped LOD bucket.
  useEffect(() => {
    if (coarsePointerRef.current === coarsePointer) return;
    coarsePointerRef.current = coarsePointer;
    requestFrame();
  }, [coarsePointer, requestFrame]);

  const markGesture = useCallback(() => {
    lastGestureAtRef.current = performance.now();
    if (!willChangeRef.current && worldRef.current) {
      willChangeRef.current = true;
      worldRef.current.style.willChange = 'transform';
    }
    if (settleTimerRef.current !== null) {
      window.clearTimeout(settleTimerRef.current);
    }
    settleTimerRef.current = window.setTimeout(() => {
      settleTimerRef.current = null;
      // Never drop `will-change` while a finger is still down: re-arming on
      // pointerup restarts this timer once the gesture actually ends.
      if (
        gestureRef.current.pointers.length === 0 &&
        !flightRef.current &&
        performance.now() - lastGestureAtRef.current >= SETTLE_MS
      ) {
        willChangeRef.current = false;
        if (worldRef.current) worldRef.current.style.willChange = 'auto';
      }
    }, SETTLE_MS + 16);
  }, []);

  // --- viewport measurement -------------------------------------------------
  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;

    const measure = () => {
      const rect = element.getBoundingClientRect();
      const next = {
        width: Math.max(1, Math.round(rect.width)),
        height: Math.max(1, Math.round(rect.height)),
        dpr: Math.min(3, Math.max(1, window.devicePixelRatio || 1)),
      };
      viewportRef.current = next;
      setViewport((previous) =>
        previous.width === next.width && previous.height === next.height && previous.dpr === next.dpr
          ? previous
          : next,
      );
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    window.addEventListener('resize', measure);

    // Tab focus inside the overflow-hidden viewport must not scroll it.
    const resetScroll = () => {
      element.scrollLeft = 0;
      element.scrollTop = 0;
    };
    element.addEventListener('scroll', resetScroll);
    element.addEventListener('focusin', resetScroll);

    return () => {
      observer.disconnect();
      window.removeEventListener('resize', measure);
      element.removeEventListener('scroll', resetScroll);
      element.removeEventListener('focusin', resetScroll);
    };
  }, []);

  useEffect(() => {
    applyCamera(true);
  }, [applyCamera, viewport, theme]);

  // --- focus hand-off -------------------------------------------------------
  // The sink is the only place that touches the DOM: it resolves participant
  // frames by `data-photo-id`, skips identical writes, and mirrors the
  // `.is-handoff*` classes. Reduced motion is sampled once per mount.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return undefined;

    interface CachedFrame {
      frame: HTMLElement;
      cell: HTMLElement | null;
    }
    const frames = new Map<string, CachedFrame>();

    const resolveFrame = (photoId: string): CachedFrame | null => {
      const cached = frames.get(photoId);
      if (cached && cached.frame.isConnected) return cached;
      const frame = container.querySelector<HTMLElement>(
        `.photo-frame[data-photo-id="${photoId}"]`,
      );
      if (!frame) return null;
      const hit = { frame, cell: frame.parentElement as HTMLElement | null };
      frames.set(photoId, hit);
      return hit;
    };

    const sink: FocusHandoffSink = {
      setWeight(photoId, w) {
        const hit = resolveFrame(photoId);
        if (!hit) return;
        const { frame, cell } = hit;
        if (w === null) {
          frame.classList.remove('is-handoff');
          frame.style.removeProperty('--focus-w');
          cell?.classList.remove('is-handoff-cell');
          return;
        }
        const value = w.toFixed(4);
        if (frame.style.getPropertyValue('--focus-w') !== value) {
          frame.style.setProperty('--focus-w', value);
        }
        frame.classList.add('is-handoff');
        cell?.classList.add('is-handoff-cell');
      },
      setPrintWeight(albumId, p) {
        const grid = container.querySelector<HTMLElement>(
          `.album-grid[data-album-id="${albumId}"]`,
        );
        if (!grid) return;
        if (p === null) {
          grid.style.removeProperty('--print-w');
          return;
        }
        const value = p.toFixed(4);
        if (grid.style.getPropertyValue('--print-w') !== value) {
          grid.style.setProperty('--print-w', value);
        }
      },
      onEnd(photoId) {
        const hit = frames.get(photoId) ?? resolveFrame(photoId);
        frames.delete(photoId);
        if (hit) {
          const { frame } = hit;
          // The outgoing print's tilt unwinds with its weight, so its gyro
          // writes are only cleared now, when the camera has landed.
          // A cancelled incoming print is retired while it is the focused one:
          // its gyro is live again, so only unfocused frames are wiped.
          if (!frame.classList.contains('focused')) {
            frame.style.removeProperty('--gyro-rx');
            frame.style.removeProperty('--gyro-ry');
            frame.style.removeProperty('--tilt-sx');
            frame.style.removeProperty('--tilt-sy');
            frame.style.removeProperty('--gyro-on');
            frame.style.transform = '';
          }
        }
        setHandoffParticipants((current) =>
          current.filter((participant) => participant.photoId !== photoId),
        );
      },
    };

    const reducedMotion =
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    handoffRef.current = createFocusHandoff(sink, { reducedMotion });
    return () => {
      handoffRef.current = null;
      frames.clear();
    };
  }, []);

  // --- framing --------------------------------------------------------------
  const frameBounds = useCallback(
    (bounds: Bounds, padding: number, planeZ = 0, useBottomInset = false) => {
      const view = viewportRef.current;
      return fitBoundsToViewport(bounds, {
        fovDeg: CAMERA_FOV_DEG,
        aspect: view.width / Math.max(1, view.height),
        padding,
        planeZ,
        bottomInsetPx: useBottomInset ? bottomInsetPx : 0,
        viewportHeightPx: view.height,
      });
    },
    [bottomInsetPx],
  );

  const photoBounds = useCallback(
    (album: WallAlbum, photoId: string): Bounds | null => {
      const index = album.photos.findIndex((photo) => photo.id === photoId);
      if (index < 0) return null;
      const grid = computeAlbumGrid(album.photos.length, album.gridColumns, album.soundtrack !== null);
      const cell = grid.photos[index];
      if (!cell) return null;
      const frame = fitFrameInCell(album.photos[index].aspectRatio);
      return {
        x: album.position.x + cell.x,
        y: album.position.y + cell.y,
        width: frame.width,
        height: frame.height,
      };
    },
    [],
  );

  const flyTo = useCallback(
    (target: CameraState, durationMs: number, kind: FlightKind = 'arc') => {
      flightRef.current = {
        from: { ...cameraRef.current },
        to: target,
        kind,
        startedAt: performance.now(),
        durationMs,
      };
      targetRef.current = { ...target };
      // The camera is about to move: no tilt may baseline on the tap jolt.
      gyro.setHold(true);
      handoffDebug.flight({ kind, durationMs });
      markGesture();
      requestFrame();
    },
    [gyro, markGesture, requestFrame],
  );

  // Starts a focus hand-off and mounts one crisp overlay per participant. The
  // caller must already have a flight running, which is what drives it.
  const beginHandoff = (input: FocusHandoffBegin) => {
    const handoff = handoffRef.current;
    if (!handoff) return;
    handoff.begin(input);
    const resolveSrc = (photoId: string): string | null => {
      for (const candidate of albums) {
        const photo = candidate.photos.find((entry) => entry.id === photoId);
        if (photo) return lodUrl(photo, PRINT_FOCUS_LOD_WIDTH);
      }
      return null;
    };
    setHandoffParticipants(
      handoff
        .participants()
        .map((participant) => ({ photoId: participant.photoId, src: resolveSrc(participant.photoId) })),
    );
  };

  // Initial load + Overview/0 framing. Resize, mood and manifest refresh never
  // re-fire it; only `overviewNonce` (Overview click / `0`) does.
  useEffect(() => {
    if (viewMode !== 'overview' || albums.length === 0) return;
    if (entryNonceRef.current === overviewNonce) return;
    entryNonceRef.current = overviewNonce;

    const aspect = viewportRef.current.width / Math.max(1, viewportRef.current.height);
    const albumsPerRow = entryFirstRowCount(albums.length, aspect);
    const bounds = computeFirstRowBounds(placements, albumsPerRow);
    const framed = frameBounds(bounds, ENTRY_PADDING);
    const entryTarget = { ...framed, y: framed.y - bounds.height * 0.14 };
    // Entry framing keeps its fixed 620 ms; only the flight kind is planned.
    const entryPlan = planFlight(cameraRef.current, entryTarget, viewportRef.current);
    flyTo(entryTarget, 620, entryPlan.kind);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [albums.length, overviewNonce, viewMode]);

  useEffect(() => {
    const album = albums.find((candidate) => candidate.id === focusedAlbumId);
    const previous = prevFocusRef.current;
    if (viewMode === 'overview' || !album) {
      // Leaving Print Focus for Overview (button or `0`): the entry effect above
      // has just started the overview flight, so the outgoing print and the
      // neighbour veil hand off along it instead of stranding `--print-w`.
      if (previous.viewMode === 'print' && previous.photoId && flightRef.current) {
        beginHandoff({
          outgoing: previous.photoId,
          incoming: null,
          printFrom: 1,
          printTo: 0,
          albumId: previous.albumId,
        });
      }
      prevFocusRef.current = { albumId: focusedAlbumId, photoId: focusedPhotoId, viewMode };
      return;
    }

    const aspect = viewportRef.current.width / Math.max(1, viewportRef.current.height);
    let bounds: Bounds | null = null;
    let padding = ALBUM_PADDING;

    if (viewMode === 'print' && focusedPhotoId) {
      bounds = photoBounds(album, focusedPhotoId);
      padding =
        coarsePointerRef.current && aspect < 0.9 ? PRINT_PADDING_TOUCH_PORTRAIT : PRINT_PADDING;
    } else if (aspect < 0.9) {
      // On portrait phones, frame the photo grid (excluding placard) so Album Focus zooms in.
      const grid = computeAlbumGrid(album.photos.length, album.gridColumns, album.soundtrack !== null);
      const gridLeft = grid.placard.x + PLACARD_WIDTH / 2 + PLACARD_GAP;
      const gridTop = grid.photos[0] ? grid.photos[0].y + CELL_SIZE / 2 : grid.bounds.height / 2;
      bounds = {
        x: album.position.x + gridLeft + grid.grid.width / 2,
        y: album.position.y + gridTop - grid.grid.height / 2,
        width: grid.grid.width,
        height: grid.grid.height,
      };
      padding = 0.06;
    } else {
      bounds = {
        x: album.position.x,
        y: album.position.y,
        width: album.bounds.width,
        height: album.bounds.height,
      };
    }
    if (!bounds) {
      prevFocusRef.current = { albumId: focusedAlbumId, photoId: focusedPhotoId, viewMode };
      return;
    }

    const target =
      viewMode === 'print'
        ? frameBounds(bounds, padding, 0.22, true)
        : frameBounds(bounds, padding);

    // Semantic focus already flipped at the tap; start the visual hand-off
    // before the camera moves so both read the same eased progress.
    const incomingId = viewMode === 'print' ? focusedPhotoId : null;
    const outgoingId = previous.viewMode === 'print' ? previous.photoId : null;
    const printFrom = previous.viewMode === 'print' ? 1 : 0;
    const printTo = viewMode === 'print' ? 1 : 0;
    const handoffAlbumId = viewMode === 'print' ? focusedAlbumId : previous.albumId;
    if (incomingId || outgoingId || printFrom !== printTo) {
      beginHandoff({
        outgoing: outgoingId,
        incoming: incomingId,
        printFrom,
        printTo,
        albumId: handoffAlbumId,
      });
    }

    const plan = planFlight(cameraRef.current, target, viewportRef.current);
    flyTo(target, plan.durationMs, plan.kind);
    prevFocusRef.current = { albumId: focusedAlbumId, photoId: focusedPhotoId, viewMode };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewMode, focusedAlbumId, focusedPhotoId, albums]);

  // Stop a playing soundtrack when the visitor zooms back out to macro tier.
  useEffect(() => {
    if (tier !== 'macro') return;
    if (soundtrack.viewMode === 'overview') return;
    dispatchSoundtrack({ type: 'enter-overview' });
  }, [tier, soundtrack.viewMode, dispatchSoundtrack]);

  useEffect(() => {
    setContainerTier(tier);
  }, [tier]);

  // --- gestures -------------------------------------------------------------
  const zoomBy = useCallback(
    (cursorX: number, cursorY: number, factor: number) => {
      const view = viewportRef.current;
      const maxZ = computeMaxZoom(wallBoundsRef.current, view);
      const zoomed = zoomToCursor(
        cameraRef.current,
        { x: cursorX, y: cursorY },
        { width: view.width, height: view.height },
        factor,
        CAMERA_FOV_DEG,
        maxZ,
      );
      const next = clampCameraToBounds(zoomed, wallBoundsRef.current, view);
      cameraRef.current = next;
      targetRef.current = { ...next };
      flightRef.current = null;
      handoffRef.current?.cancel();
      gyro.setHold(false);
      handoffDebug.cancel();
      markGesture();
      requestFrame();
    },
    [gyro, markGesture, requestFrame],
  );

  const panByPixels = useCallback(
    (dx: number, dy: number) => {
      const view = viewportRef.current;
      const camera = cameraRef.current;
      const unitsPerPixel = worldPerPixel(camera.z, Math.max(1, view.height));
      const next = clampCameraToBounds(
        {
          x: camera.x - dx * unitsPerPixel,
          y: camera.y + dy * unitsPerPixel,
          z: camera.z,
        },
        wallBoundsRef.current,
        view,
      );
      cameraRef.current = next;
      targetRef.current = { ...next };
      flightRef.current = null;
      handoffRef.current?.cancel();
      gyro.setHold(false);
      handoffDebug.cancel();
      markGesture();
    },
    [gyro, markGesture],
  );

  // Wired through a ref so the rAF callback (defined above) can apply
  // coalesced pointer input without depending on these callbacks.
  useEffect(() => {
    flushPendingInputRef.current = () => {
      const pan = pendingPanRef.current;
      if (pan.dx !== 0 || pan.dy !== 0) {
        panByPixels(pan.dx, pan.dy);
        pan.dx = 0;
        pan.dy = 0;
      }

      const pinch = pendingPinchRef.current;
      if (pinch) {
        const container = containerRef.current;
        if (container) {
          const rect = container.getBoundingClientRect();
          // Pan must land before the zoom so the world point under the
          // midpoint stays fixed, exactly like the old per-event order.
          zoomBy(pinch.anchor.x - rect.left, pinch.anchor.y - rect.top, pinch.zoomFactor);
        }
        pendingPinchRef.current = null;
      }
    };

    return () => {
      flushPendingInputRef.current = () => {};
    };
  }, [panByPixels, zoomBy]);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;

    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const rect = element.getBoundingClientRect();
      const factor = Math.exp(-event.deltaY * 0.0014);
      zoomBy(event.clientX - rect.left, event.clientY - rect.top, factor);
      requestFrame();
    };

    const onPointerDown = (event: PointerEvent) => {
      // Only the 0 -> 1 transition clears the drag latch: a second finger must
      // not turn an in-flight pan back into a tap.
      gestureRef.current = beginPointer(gestureRef.current, {
        id: event.pointerId,
        x: event.clientX,
        y: event.clientY,
      });
      markGesture();
      // Start the loop on touch-down, before the first move, so WebKit always
      // has a rendering update pending while the gesture is live.
      requestFrame();
    };

    const onPointerMove = (event: PointerEvent) => {
      const wasDragged = gestureRef.current.dragged;
      const { state, pan, pinch } = movePointer(
        gestureRef.current,
        event.pointerId,
        event.clientX,
        event.clientY,
      );
      gestureRef.current = state;

      if (pinch) {
        // Accumulate only; the rAF loop applies pan first, then one zoom step
        // about the latest midpoint. Multiplying the per-event factors keeps
        // the total zoom when several events land in one vsync.
        pendingPanRef.current.dx += pinch.panDx;
        pendingPanRef.current.dy += pinch.panDy;
        const previous = pendingPinchRef.current;
        pendingPinchRef.current = {
          zoomFactor: (previous?.zoomFactor ?? 1) * pinch.zoomFactor,
          anchor: pinch.anchor,
        };
        requestFrame();
        return;
      }

      if (!pan) return;
      // After a `2 -> 1` pinch hand-off `wasDragged` is already true, so capture
      // is intentionally skipped here: touch pointers stay implicitly captured
      // to their hit target and their moves still bubble to this container.
      if (!wasDragged && state.dragged) {
        // Capture only after the drag threshold so plain desktop clicks work.
        element.setPointerCapture?.(event.pointerId);
      }
      pendingPanRef.current.dx += pan.dx;
      pendingPanRef.current.dy += pan.dy;
      requestFrame();
    };

    const endPointer = (event: PointerEvent) => {
      if (element.hasPointerCapture?.(event.pointerId)) {
        element.releasePointerCapture?.(event.pointerId);
      }
      gestureRef.current = releasePointer(gestureRef.current, event.pointerId);
      if (gestureRef.current.pointers.length === 0) {
        // The teardown timer may have fired (and been blocked by the pointer
        // guard) during a finger pause; re-arm it now that the gesture ended.
        markGesture();
        // Keep the latch through the `click` that fires right after `pointerup`,
        // then re-arm taps for the next gesture.
        window.setTimeout(() => {
          gestureRef.current = { ...gestureRef.current, dragged: false };
        }, 0);
      }
    };

    const onClick = (event: MouseEvent) => {
      if (gestureRef.current.dragged) return;
      const target = event.target as HTMLElement | null;
      if (
        target?.closest('.photo-frame') ||
        target?.closest('.museum-placard') ||
        target?.closest('.soundtrack-plaque') ||
        target?.closest('.gallery-surface')
      ) {
        return;
      }
      if (useWallStore.getState().viewMode === 'print') returnOneLevel();
      else if (useWallStore.getState().viewMode === 'album') goOverview();
    };

    // WebKit still pinch-zooms the *page* on iOS Safari despite
    // `touch-action: none`; the Safari-only `gesture*` events are the only way
    // to suppress that. They never fire elsewhere, so registering them is inert.
    const onGesture = (event: Event) => {
      event.preventDefault();
    };

    element.addEventListener('wheel', onWheel, { passive: false });
    element.addEventListener('pointerdown', onPointerDown);
    element.addEventListener('pointermove', onPointerMove);
    element.addEventListener('pointerup', endPointer);
    element.addEventListener('pointercancel', endPointer);
    element.addEventListener('click', onClick);
    element.addEventListener('gesturestart', onGesture, { passive: false });
    element.addEventListener('gesturechange', onGesture, { passive: false });
    return () => {
      element.removeEventListener('wheel', onWheel);
      element.removeEventListener('pointerdown', onPointerDown);
      element.removeEventListener('pointermove', onPointerMove);
      element.removeEventListener('pointerup', endPointer);
      element.removeEventListener('pointercancel', endPointer);
      element.removeEventListener('click', onClick);
      element.removeEventListener('gesturestart', onGesture);
      element.removeEventListener('gesturechange', onGesture);
    };
  }, [goOverview, markGesture, requestFrame, returnOneLevel, zoomBy]);

  // --- keyboard -------------------------------------------------------------
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      ) {
        return;
      }
      const view = viewportRef.current;
      switch (event.key) {
        case '0':
          goOverview();
          break;
        case 'Escape':
          returnOneLevel();
          break;
        case 'ArrowLeft':
          stepPhoto(-1);
          break;
        case 'ArrowRight':
          stepPhoto(1);
          break;
        case '+':
        case '=':
          zoomBy(view.width / 2, view.height / 2, 1.25);
          break;
        case '-':
        case '_':
          zoomBy(view.width / 2, view.height / 2, 0.8);
          break;
        default:
          break;
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [goOverview, returnOneLevel, stepPhoto, zoomBy]);

  useEffect(() => {
    return () => {
      if (rafRef.current !== 0) cancelAnimationFrame(rafRef.current);
      if (settleTimerRef.current !== null) window.clearTimeout(settleTimerRef.current);
    };
  }, []);

  const wasDragged = useCallback(() => gestureRef.current.dragged, []);
  const lodWidth = resolveProjectedLodWidth(
    CELL_SIZE * 100,
    scale,
    viewport.dpr,
    maxThumbDpr,
  );

  // Full-resolution URL of the focused print, plus neighbour prefetch so Prev /
  // Next lands on an already-decoded image.
  const focusedAlbum = focusedAlbumId ? albums.find((candidate) => candidate.id === focusedAlbumId) : undefined;
  const focusedPhotoIndex =
    focusedAlbum && focusedPhotoId ? focusedAlbum.photos.findIndex((photo) => photo.id === focusedPhotoId) : -1;
  const printSrc =
    focusedAlbum && focusedPhotoIndex >= 0
      ? lodUrl(focusedAlbum.photos[focusedPhotoIndex], PRINT_FOCUS_LOD_WIDTH)
      : null;
  useEffect(() => {
    if (tier !== 'print' || !focusedAlbum || focusedPhotoIndex < 0) return;
    for (const offset of [1, -1]) {
      const neighbour = focusedAlbum.photos[focusedPhotoIndex + offset];
      if (neighbour) prefetchPrintImage(lodUrl(neighbour, PRINT_FOCUS_LOD_WIDTH));
    }
  }, [tier, focusedAlbum, focusedPhotoIndex, lodUrl]);

  // The overlay opacity is `w` once decoded: mid-flight the outgoing and the
  // incoming crisp layers crossfade instead of unmounting at the tap.
  const getWeight = useCallback((photoId: string): number => {
    const weight = handoffRef.current?.weightOf(photoId);
    if (typeof weight === 'number') return weight;
    return photoId === focusStateRef.current.photoId ? 1 : 0;
  }, []);

  const overlays = useMemo(() => {
    const list: Array<{ photoId: string; src: string | null }> = [];
    const seen = new Set<string>();
    if (tier === 'print' && focusedPhotoId) {
      list.push({ photoId: focusedPhotoId, src: printSrc });
      seen.add(focusedPhotoId);
    }
    for (const participant of handoffParticipants) {
      if (seen.has(participant.photoId)) continue;
      seen.add(participant.photoId);
      list.push(participant);
    }
    return list;
  }, [tier, focusedPhotoId, printSrc, handoffParticipants]);

  return (
    <div
      className="wall-viewport"
      ref={containerRef}
      data-tier={containerTier}
      style={{ touchAction: 'none' }}
    >
      <PlaygroundPbrWall ref={wallRef} coarsePointer={coarsePointer} />
      <div className="viewport-chiaroscuro-vignette" />
      <div className="wall-world" ref={worldRef}>
        <div className="wings-container">
          {albums.map((album) => {
            const visibleAlbum = visible.some((entry) => entry.id === album.id);
            if (!visibleAlbum) return null;
            const lightingForAlbum = lightingByAlbum.get(album.id);
            const isDraft = mode === 'preview' && album.status === 'draft';
            const isSelected = selectedAlbumId === album.id;
            return (
              <div
                key={album.id}
                className={`album-island${isDraft ? ' is-draft' : ''}${isSelected ? ' is-selected' : ''}`}
                data-tier={tier}
                data-album-id={album.id}
                data-status={album.status}
                style={{
                  left: worldXToCssLeft(album.position.x),
                  top: worldYToCssTop(album.position.y),
                  width: album.bounds.width * 100,
                  height: album.bounds.height * 100,
                }}
              >
                {tier === 'macro' ? (
                  <MacroIsland
                    album={album}
                    lodUrl={lodUrl}
                    onSelect={() => {
                      if (wasDragged()) return;
                      selectAlbum(album.id);
                    }}
                  />
                ) : (
                  <AlbumTier
                    album={album}
                    lodUrl={lodUrl}
                    lodWidth={lodWidth}
                    tier={tier}
                    scale={scale}
                    focusedPhotoId={focusedAlbumId === album.id ? focusedPhotoId : null}
                    albumFocused={focusedAlbumId === album.id}
                    placardMaterial={placardMaterial}
                    lighting={lightingForAlbum}
                    isDraft={isDraft}
                    onSelectAlbum={selectAlbum}
                    onSelectPhoto={enterPrint}
                    wasDragged={wasDragged}
                    gyroSubscribe={gyro.subscribe}
                    requestGyroPermission={gyro.requestGyroPermission}
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>
      {overlays.map((overlay) => (
        <PrintSharpOverlay
          key={overlay.photoId}
          containerRef={containerRef}
          active
          photoId={overlay.photoId}
          src={overlay.src}
          getWeight={getWeight}
          cameraWakeRef={overlayWakeRef}
          gyroSubscribe={gyro.subscribe}
        />
      ))}
    </div>
  );
}

interface AlbumTierProps {
  album: WallAlbum;
  lodUrl: (photo: WallPhoto, longestEdge: number) => string;
  lodWidth: number;
  tier: ZoomTier;
  scale: number;
  focusedPhotoId: string | null;
  albumFocused: boolean;
  placardMaterial: PlacardMaterial;
  lighting: IslandLighting | undefined;
  isDraft: boolean;
  onSelectAlbum: (albumId: string) => void;
  onSelectPhoto: (albumId: string, photoId: string) => void;
  wasDragged: () => boolean;
  /** Imperative smoothed gyro tilt feed from `useGyroTilt` (coarse pointers). */
  gyroSubscribe: GyroSubscribe;
  /** Session-memoized iOS motion permission prompt for the Print Focus tap. */
  requestGyroPermission: GyroPermissionRequester;
}

function AlbumTier({
  album,
  lodUrl,
  lodWidth,
  tier,
  scale,
  focusedPhotoId,
  albumFocused,
  placardMaterial,
  lighting,
  isDraft,
  onSelectAlbum,
  onSelectPhoto,
  wasDragged,
  gyroSubscribe,
  requestGyroPermission,
}: AlbumTierProps) {
  const grid = useMemo(
    () => computeAlbumGrid(album.photos.length, album.gridColumns, album.soundtrack !== null),
    [album.photos.length, album.gridColumns, album.soundtrack],
  );

  const placardPlaced = islandRectStyle(album.bounds, grid.placard.x, grid.placard.y, {
    width: grid.placard.width,
    height: grid.placard.height,
  });

  const gridLeft = grid.placard.x + PLACARD_WIDTH / 2 + PLACARD_GAP;
  const gridTop = grid.photos[0] ? grid.photos[0].y + CELL_SIZE / 2 : grid.bounds.height / 2;
  const gridPlaced = islandRectStyle(
    album.bounds,
    gridLeft + grid.grid.width / 2,
    gridTop - grid.grid.height / 2,
    { width: grid.grid.width, height: grid.grid.height },
  );

  return (
    <>
      <AlbumPlacard
        album={album}
        placedStyle={placardPlaced}
        material={placardMaterial}
        isDraft={isDraft}
        lightingVars={lighting?.placard}
        onSelectAlbum={onSelectAlbum}
        wasDragged={wasDragged}
      />

      <div
        className="album-grid"
        data-album-id={album.id}
        style={{
          ...gridPlaced,
          gridTemplateColumns: `repeat(${grid.grid.columns}, ${CELL_SIZE * 100}px)`,
        }}
      >
        {album.photos.map((photo, index) => {
          const cell = grid.photos[index];
          if (!cell) return null;
          const frame = fitFrameInCell(photo.aspectRatio);
          const focused = focusedPhotoId === photo.id;
          return (
            <FramedPrint
              key={photo.id}
              albumId={album.id}
              albumTitle={album.title}
              photo={photo}
              index={index}
              frameSize={{ width: frame.width * 100, height: frame.height * 100 }}
              lodUrl={lodUrl}
              lodWidth={lodWidth}
              tier={tier}
              scale={scale}
              focused={focused}
              albumFocused={albumFocused}
              lightingVars={lighting?.prints.get(index)}
              onSelectAlbum={onSelectAlbum}
              onSelectPhoto={onSelectPhoto}
              wasDragged={wasDragged}
              gyroSubscribe={gyroSubscribe}
              requestGyroPermission={requestGyroPermission}
            />
          );
        })}
      </div>

      <SoundtrackPlaque album={album} tier={tier} />
    </>
  );
}
