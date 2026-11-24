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
import { CELL_SIZE, PLACARD_GAP, PLACARD_WIDTH, computeAlbumGrid } from '@/lib/layout/islandLayout';
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
import { islandRectStyle } from './islandPlacement';
import { fitFrameInCell, planMacroMosaic } from './macroMosaic';
import type { PlacardMaterial } from './placardMaterial';
import { visibleIslands } from './visibleIslands';
import { resolveProjectedLodWidth, resolveZoomTier, type ZoomTier } from './zoomTier';

const DEFAULT_CAMERA: CameraState = { x: 0, y: 0, z: 44 };
const DRAG_THRESHOLD_PX = 5;
const SETTLE_MS = 140;
const ENTRY_PADDING = 0.06;
const ALBUM_PADDING = 0.1;
const PRINT_PADDING = 0.14;
const MACRO_MOSAIC_LOD = 256;
const MOSAIC_CACHE_LIMIT = 120;

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

/** One pre-baked canvas per island, used only at `scale < 0.25`. */
const mosaicCache = new Map<string, { canvas: HTMLCanvasElement; signature: string }>();
const MOSAIC_LOADED = new WeakMap<HTMLImageElement, boolean>();

function mosaicSignature(
  album: WallAlbum,
  lodUrl: (photo: WallPhoto, longestEdge: number) => string,
): string {
  const sample = album.photos[0] ? lodUrl(album.photos[0], MACRO_MOSAIC_LOD) : '';
  return `${album.id}|${album.photos.map((photo) => photo.id).join(',')}|${album.bounds.width}x${album.bounds.height}|${sample}`;
}

function mosaicFor(
  album: WallAlbum,
  lodUrl: (photo: WallPhoto, longestEdge: number) => string,
): HTMLCanvasElement | null {
  if (typeof document === 'undefined') return null;
  const signature = mosaicSignature(album, lodUrl);
  const cached = mosaicCache.get(album.id);
  if (cached && cached.signature === signature) return cached.canvas;

  const canvas = document.createElement('canvas');
  const plan = planMacroMosaic(album);
  canvas.width = plan.width;
  canvas.height = plan.height;
  canvas.className = 'island-mosaic';
  canvas.setAttribute('aria-hidden', 'true');

  const context = canvas.getContext('2d');
  const images: HTMLImageElement[] = album.photos.map((photo) => {
    const image = new Image();
    image.decoding = 'async';
    image.onload = () => {
      MOSAIC_LOADED.set(image, true);
      paint();
    };
    image.onerror = () => MOSAIC_LOADED.set(image, false);
    image.src = lodUrl(photo, MACRO_MOSAIC_LOD);
    return image;
  });

  const paint = () => {
    if (!context) return;
    context.clearRect(0, 0, plan.width, plan.height);
    plan.cells.forEach((cell) => {
      context.fillStyle = 'rgba(0, 0, 0, 0.45)';
      context.fillRect(cell.x, cell.y + 2, cell.width, cell.height);
      context.fillStyle = '#f6f4ef';
      context.fillRect(cell.x, cell.y, cell.width, cell.height);
      const image = images[cell.photoIndex];
      if (!image || !MOSAIC_LOADED.get(image)) return;
      context.drawImage(
        image,
        cell.x + 1,
        cell.y + 1,
        Math.max(1, cell.width - 2),
        Math.max(1, cell.height - 2),
      );
    });

    context.fillStyle = 'rgba(226, 242, 234, 0.18)';
    context.fillRect(plan.placard.x, plan.placard.y, plan.placard.width, plan.placard.height);
    context.strokeStyle = 'rgba(240, 245, 242, 0.22)';
    context.lineWidth = 1;
    context.strokeRect(plan.placard.x, plan.placard.y, plan.placard.width, plan.placard.height);
  };

  paint();
  mosaicCache.set(album.id, { canvas, signature });
  while (mosaicCache.size > MOSAIC_CACHE_LIMIT) {
    const oldest = mosaicCache.keys().next().value;
    if (oldest === undefined) break;
    mosaicCache.delete(oldest);
  }
  return canvas;
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
    const albumsPerRow = aspect >= 1.4 ? 3 : aspect >= 0.9 ? 2 : 1;
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
      {soundtrack.pauseToastVisible ? (
        <div className="soundtrack-toast" role="status">
          Paused soundtrack on zoom out
        </div>
      ) : null}
    </div>
  );
}

function MacroIsland({
  album,
  lodUrl,
  onSelect,
}: {
  album: WallAlbum;
  lodUrl: (photo: WallPhoto, longestEdge: number) => string;
  onSelect: () => void;
}) {
  const hostRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const canvas = mosaicFor(album, lodUrl);
    if (canvas && canvas.parentElement !== host) host.replaceChildren(canvas);
    return () => {
      if (canvas && canvas.parentElement === host) host.removeChild(canvas);
    };
  }, [album, lodUrl]);

  return (
    <button
      type="button"
      className="island-mosaic-button"
      onClick={onSelect}
      aria-label={`Open ${album.title} (${album.photos.length} prints)`}
    >
      <span className="island-mosaic-host" ref={hostRef} />
    </button>
  );
}

/** Empty metadata halves collapse cleanly with no stray separators. */
function placardMetaLine(album: WallAlbum): string {
  return [album.dateLabel, album.locationLabel]
    .map((part) => part?.trim() ?? '')
    .filter(Boolean)
    .join(' · ');
}

/** `0:42` / `3:25` tabular timecode formatting. */
function formatClock(totalSeconds: number | null): string {
  if (totalSeconds === null || !Number.isFinite(totalSeconds) || totalSeconds < 0) return '0:00';
  const whole = Math.floor(totalSeconds);
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
}

/**
 * Live placard timecode.
 *
 * The public CSP intentionally does not load `www.youtube.com/iframe_api`, so
 * the plaque cannot read the native player's clock. Anchor a local ticker to the
 * explicit play click instead (the embedded player also starts at 0 on mount)
 * and clamp it to the stored duration. Nothing renders once playback stops.
 */
function PlacardTimecode({
  albumId,
  durationSec,
}: {
  albumId: string;
  durationSec: number | null;
}) {
  const playing = useWallStore(
    (store) => store.soundtrack.playing && store.soundtrack.activeAlbumId === albumId,
  );
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!playing) return;
    const startedAt = performance.now();
    const tick = () => {
      const seconds = Math.floor((performance.now() - startedAt) / 1000);
      setElapsed(
        durationSec !== null && durationSec > 0 ? Math.min(seconds, durationSec) : seconds,
      );
    };
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [albumId, durationSec, playing]);

  return (
    <span className="placard-timecode" aria-live="off">
      {formatClock(playing ? elapsed : 0)}
      {durationSec !== null && durationSec > 0 ? ` / ${formatClock(durationSec)}` : ''}
    </span>
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
  const metaLine = placardMetaLine(album);
  const trackLine = album.soundtrack
    ? [album.soundtrack.title, album.soundtrack.artist].filter(Boolean).join(' — ') ||
      'Soundtrack'
    : '';

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
      <button
        type="button"
        className={`museum-placard mat-${placardMaterial} is-lit${isDraft ? ' is-draft' : ''}`}
        style={{ ...placardPlaced, ...(lighting?.placard ?? {}) }}
        onClick={(event) => {
          event.stopPropagation();
          if (wasDragged()) return;
          onSelectAlbum(album.id);
        }}
        aria-label={`${isDraft ? 'Draft album ' : 'Open '}${album.title}`}
      >
        <h3 className="placard-title">{album.title}</h3>
        {metaLine ? <p className="placard-meta">{metaLine}</p> : null}
        {isDraft ? <span className="placard-draft-badge">Draft</span> : null}
        {album.soundtrack ? (
          <span className="placard-soundtrack">
            <span className="placard-track-name" title={trackLine}>
              {trackLine}
            </span>
            <PlacardTimecode albumId={album.id} durationSec={album.soundtrack.durationSec} />
          </span>
        ) : null}
        <span className="placard-standoff left" />
        <span className="placard-standoff right" />
      </button>

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
          const dimmed = tier === 'print' && focusedPhotoId !== null && !focused;
          return (
            <div key={photo.id} className="photo-cell">
              <button
                type="button"
                className={`photo-frame is-lit${focused ? ' focused' : ''}${dimmed ? ' dimmed' : ''}`}
                style={{
                  width: frame.width * 100,
                  height: frame.height * 100,
                  ...(lighting?.prints.get(index) ?? {}),
                }}
                onClick={(event) => {
                  event.stopPropagation();
                  if (wasDragged()) return;
                  if (tier === 'macro' || scale < 0.52) onSelectAlbum(album.id);
                  else onSelectPhoto(album.id, photo.id);
                }}
                onPointerMove={(event) => {
                  if (wasDragged()) return;
                  const frameElement = event.currentTarget;
                  const isFocused = frameElement.classList.contains('focused');
                  if (tier === 'print' && !isFocused) return;
                  const rect = frameElement.getBoundingClientRect();
                  const nx = (event.clientX - rect.left) / rect.width - 0.5;
                  const ny = (event.clientY - rect.top) / rect.height - 0.5;
                  const maxTilt = isFocused ? Math.min(4, 5 * 0.75) : 5;
                  const liftZ = isFocused ? 58 : 36;
                  frameElement.style.transform = `translateZ(${liftZ}px) rotateY(${(nx * maxTilt * 2).toFixed(2)}deg) rotateX(${(-ny * maxTilt * 2).toFixed(2)}deg)`;
                  const sheen = frameElement.querySelector<HTMLElement>('.photo-sheen');
                  if (sheen) {
                    sheen.style.transform = `translate3d(${(nx * 45).toFixed(1)}%, ${(ny * 45).toFixed(1)}%, 0)`;
                    sheen.style.opacity = '0.88';
                  }
                }}
                onPointerLeave={(event) => {
                  const frameElement = event.currentTarget;
                  frameElement.style.transform = frameElement.classList.contains('focused')
                    ? 'translateZ(54px)'
                    : '';
                  const sheen = frameElement.querySelector<HTMLElement>('.photo-sheen');
                  if (sheen) {
                    sheen.style.transform = '';
                    sheen.style.opacity = '';
                  }
                }}
                aria-label={`${album.title}, print ${index + 1}`}
                title={`${album.title}, print ${index + 1}`}
              >
                <span className="photo-window">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    className="photo-img"
                    src={lodUrl(photo, lodWidth)}
                    alt=""
                    loading="lazy"
                    decoding="async"
                    draggable={false}
                  />
                  <span className="photo-paper-grain" />
                  <span className="photo-sheen" />
                </span>
              </button>
            </div>
          );
        })}
      </div>

      <SoundtrackPlaque album={album} tier={tier} />
    </>
  );
}
