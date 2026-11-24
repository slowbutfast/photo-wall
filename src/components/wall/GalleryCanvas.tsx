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

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

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
  interpolateZoom,
  worldPerPixel,
  worldXToCssLeft,
  worldYToCssTop,
  zoomToCursor,
  type Bounds,
  type CameraState,
} from '@/lib/camera/cameraMath';
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
import { islandRectStyle } from './islandPlacement';
import { fitFrameInCell } from './macroMosaic';
import type { PlacardMaterial } from './placardMaterial';
import { visibleIslands } from './visibleIslands';
import { resolveProjectedLodWidth, resolveZoomTier, type ZoomTier } from './zoomTier';

const DEFAULT_CAMERA: CameraState = { x: 0, y: 0, z: 44 };
const DRAG_THRESHOLD_PX = 5;
const SETTLE_MS = 140;
const ENTRY_PADDING = 0.06;
const ALBUM_PADDING = 0.1;
const PRINT_PADDING = 0.14;

interface PointerState {
  id: number;
  x: number;
  y: number;
  startX: number;
  startY: number;
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
  const flightRef = useRef<{ from: CameraState; to: CameraState; startedAt: number; durationMs: number } | null>(
    null,
  );
  const viewportRef = useRef({ width: 1, height: 1, dpr: 1 });
  const pointersRef = useRef(new Map<number, PointerState>());
  const pinchRef = useRef<{ distance: number } | null>(null);
  const draggedRef = useRef(false);
  const lastGestureAtRef = useRef(0);
  const willChangeRef = useRef(false);
  const settleTimerRef = useRef<number | null>(null);
  const rafRef = useRef(0);
  const animatingRef = useRef(false);
  const entryNonceRef = useRef<number | null>(null);

  const [viewport, setViewport] = useState({ width: 1, height: 1, dpr: 1 });
  const [snapshot, setSnapshot] = useState<CameraState>({ ...DEFAULT_CAMERA });
  const [containerTier, setContainerTier] = useState<ZoomTier>('album');

  const viewMode = useWallStore((state) => state.viewMode);
  const overviewNonce = useWallStore((state) => state.overviewNonce);
  const focusedAlbumId = useWallStore((state) => state.focusedAlbumId);
  const focusedPhotoId = useWallStore((state) => state.focusedPhotoId);
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
  const visible = useMemo(
    () => visibleIslands(snapshot, viewport, placements, 3),
    [snapshot, viewport, placements],
  );

  // --- camera <-> DOM + WebGL ----------------------------------------------
  const applyCamera = useCallback(() => {
    const camera = cameraRef.current;
    const view = viewportRef.current;
    const world = worldRef.current;
    if (!world) return;
    const cssScale = cameraToCssScale(camera.z, Math.max(1, view.height));
    world.style.transform = `scale(${cssScale.toFixed(6)}) translate3d(${(-camera.x * 100).toFixed(3)}px, ${(camera.y * 100).toFixed(3)}px, 0px)`;
    const spots = selectVisibleSpots(fixturesRef.current, camera, view);
    wallRef.current?.render(camera, view, spots, themeRef.current);
  }, []);

  const requestFrame = useCallback(() => {
    if (animatingRef.current) return;
    animatingRef.current = true;
    rafRef.current = requestAnimationFrame(function frame(now) {
      const camera = cameraRef.current;
      const target = targetRef.current;
      const flight = flightRef.current;

      if (flight) {
        const t = Math.min(1, (now - flight.startedAt) / Math.max(1, flight.durationMs));
        const eased = t * t * (3 - 2 * t);
        const next = interpolateZoom(flight.from, flight.to, eased);
        camera.x = next.x;
        camera.y = next.y;
        camera.z = next.z;
        targetRef.current = { ...next };
        if (t >= 1) flightRef.current = null;
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
      applyCamera();

      // Zoom-relative snapshot threshold: coarse re-renders follow the visible
      // world span instead of an absolute 0.5u that under-samples at macro zoom.
      setSnapshot((previous) => {
        const view = viewportRef.current;
        const unit = worldPerPixel(camera.z, Math.max(1, view.height));
        const threshold = Math.max(0.01, unit * 12);
        const zThreshold = Math.max(0.01, camera.z * 0.004);
        if (
          Math.abs(previous.x - camera.x) < threshold &&
          Math.abs(previous.y - camera.y) < threshold &&
          Math.abs(previous.z - camera.z) < zThreshold
        ) {
          return previous;
        }
        return { x: camera.x, y: camera.y, z: camera.z };
      });

      if (willChangeRef.current && now - lastGestureAtRef.current > SETTLE_MS && !flightRef.current) {
        willChangeRef.current = false;
        if (worldRef.current) worldRef.current.style.willChange = 'auto';
      }

      const settled =
        !flightRef.current &&
        Math.abs(targetRef.current.x - cameraRef.current.x) < 1e-3 &&
        Math.abs(targetRef.current.y - cameraRef.current.y) < 1e-3 &&
        Math.abs(targetRef.current.z - cameraRef.current.z) < 1e-3;

      if (settled) {
        animatingRef.current = false;
        rafRef.current = 0;
        return;
      }
      rafRef.current = requestAnimationFrame(frame);
    });
  }, [applyCamera]);

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
      if (!flightRef.current && performance.now() - lastGestureAtRef.current >= SETTLE_MS) {
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
    applyCamera();
  }, [applyCamera, viewport, theme]);

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
    (target: CameraState, durationMs: number) => {
      flightRef.current = {
        from: { ...cameraRef.current },
        to: target,
        startedAt: performance.now(),
        durationMs,
      };
      targetRef.current = { ...target };
      markGesture();
      requestFrame();
    },
    [markGesture, requestFrame],
  );

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
    flyTo({ ...framed, y: framed.y - bounds.height * 0.14 }, 620);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [albums.length, overviewNonce, viewMode]);

  useEffect(() => {
    const album = albums.find((candidate) => candidate.id === focusedAlbumId);
    if (viewMode === 'overview' || !album) return;

    const aspect = viewportRef.current.width / Math.max(1, viewportRef.current.height);
    let bounds: Bounds | null = null;
    let padding = ALBUM_PADDING;

    if (viewMode === 'print' && focusedPhotoId) {
      bounds = photoBounds(album, focusedPhotoId);
      padding = PRINT_PADDING;
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
    if (!bounds) return;

    const target =
      viewMode === 'print'
        ? frameBounds(bounds, padding, 0.22, true)
        : frameBounds(bounds, padding);
    flyTo(target, 720);
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
      markGesture();
      requestFrame();
    },
    [markGesture, requestFrame],
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
      markGesture();
    },
    [markGesture],
  );

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
      pointersRef.current.set(event.pointerId, {
        id: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        startX: event.clientX,
        startY: event.clientY,
      });
      draggedRef.current = false;
      if (pointersRef.current.size === 2) {
        const [a, b] = [...pointersRef.current.values()];
        pinchRef.current = { distance: Math.hypot(a.x - b.x, a.y - b.y) };
      }
      markGesture();
    };

    const onPointerMove = (event: PointerEvent) => {
      const previous = pointersRef.current.get(event.pointerId);
      if (!previous) return;
      pointersRef.current.set(event.pointerId, {
        id: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        startX: previous.startX,
        startY: previous.startY,
      });

      if (pointersRef.current.size >= 2) {
        const [a, b] = [...pointersRef.current.values()];
        const distance = Math.hypot(a.x - b.x, a.y - b.y);
        const center = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        const pinch = pinchRef.current;
        const rect = element.getBoundingClientRect();
        if (pinch && pinch.distance > 0 && distance > 0) {
          zoomBy(center.x - rect.left, center.y - rect.top, distance / pinch.distance);
          draggedRef.current = true;
        }
        pinchRef.current = { distance };
        return;
      }

      const dx = event.clientX - previous.x;
      const dy = event.clientY - previous.y;
      if (Math.abs(dx) + Math.abs(dy) > 0) {
        const totalDist = Math.hypot(event.clientX - previous.startX, event.clientY - previous.startY);
        if (!draggedRef.current && totalDist > DRAG_THRESHOLD_PX) {
          draggedRef.current = true;
          // Capture only after the drag threshold so plain desktop clicks work.
          element.setPointerCapture?.(event.pointerId);
          panByPixels(event.clientX - previous.startX, event.clientY - previous.startY);
          requestFrame();
          return;
        }
        if (draggedRef.current) {
          panByPixels(dx, dy);
          requestFrame();
        }
      }
    };

    const endPointer = (event: PointerEvent) => {
      if (element.hasPointerCapture?.(event.pointerId)) {
        element.releasePointerCapture?.(event.pointerId);
      }
      pointersRef.current.delete(event.pointerId);
      if (pointersRef.current.size < 2) pinchRef.current = null;
      if (pointersRef.current.size === 0) {
        window.setTimeout(() => {
          draggedRef.current = false;
        }, 0);
      }
    };

    const onClick = (event: MouseEvent) => {
      if (draggedRef.current) return;
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

    element.addEventListener('wheel', onWheel, { passive: false });
    element.addEventListener('pointerdown', onPointerDown);
    element.addEventListener('pointermove', onPointerMove);
    element.addEventListener('pointerup', endPointer);
    element.addEventListener('pointercancel', endPointer);
    element.addEventListener('click', onClick);
    return () => {
      element.removeEventListener('wheel', onWheel);
      element.removeEventListener('pointerdown', onPointerDown);
      element.removeEventListener('pointermove', onPointerMove);
      element.removeEventListener('pointerup', endPointer);
      element.removeEventListener('pointercancel', endPointer);
      element.removeEventListener('click', onClick);
    };
  }, [goOverview, markGesture, panByPixels, requestFrame, returnOneLevel, zoomBy]);

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

  const wasDragged = useCallback(() => draggedRef.current, []);
  const lodWidth = resolveProjectedLodWidth(CELL_SIZE * 100, scale, viewport.dpr);

  return (
    <div
      className="wall-viewport"
      ref={containerRef}
      data-tier={containerTier}
      style={{ touchAction: 'none' }}
    >
      <PlaygroundPbrWall ref={wallRef} />
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
                    placardMaterial={placardMaterial}
                    lighting={lightingForAlbum}
                    isDraft={isDraft}
                    onSelectAlbum={selectAlbum}
                    onSelectPhoto={enterPrint}
                    wasDragged={wasDragged}
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>
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
  placardMaterial: PlacardMaterial;
  lighting: IslandLighting | undefined;
  isDraft: boolean;
  onSelectAlbum: (albumId: string) => void;
  onSelectPhoto: (albumId: string, photoId: string) => void;
  wasDragged: () => boolean;
}

function AlbumTier({
  album,
  lodUrl,
  lodWidth,
  tier,
  scale,
  focusedPhotoId,
  placardMaterial,
  lighting,
  isDraft,
  onSelectAlbum,
  onSelectPhoto,
  wasDragged,
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
              lightingVars={lighting?.prints.get(index)}
              onSelectAlbum={onSelectAlbum}
              onSelectPhoto={onSelectPhoto}
              wasDragged={wasDragged}
            />
          );
        })}
      </div>

      <SoundtrackPlaque album={album} tier={tier} />
    </>
  );
}
