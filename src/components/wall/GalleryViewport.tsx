'use client';

/**
 * The single camera controller for the DOM wall.
 *
 * Owns the one source of truth (`cameraMath.ts`), the gesture handling
 * (wheel / trackpad pinch / pointer drag / two-finger pinch / keyboard) and the
 * `requestAnimationFrame` loop that drives **both** consumers in lockstep:
 * - `div.world` gets `translate(...) scale(...)` (gesture-only `will-change`),
 * - `PbrWallCanvas.render(camera, viewport)` gets the same numbers.
 *
 * React re-renders only when the coarse view changes (tier or ~0.5 world-unit
 * camera movement), so 1,000 prints never re-render per frame.
 *
 * Default entry (and `Overview` / `0`) frames **row 0** via
 * `computeFirstRowBounds`, not the whole wall; mobile framing respects
 * `bottomInsetPx`, and panning down through rows stays free.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  CAMERA_FOV_DEG,
  ZOOM_MAX,
  ZOOM_MIN,
  cameraToCssScale,
  computeFirstRowBounds,
  fitBoundsToViewport,
  interpolateZoom,
  worldPerPixel,
  zoomToCursor,
  type Bounds,
  type CameraState,
} from '@/lib/camera/cameraMath';
import { computeAlbumGrid } from '@/lib/layout/islandLayout';
import type { AlbumPlacement, WallAlbum, WallPhoto } from '@/lib/layout/types';
import { useWallStore } from '@/store/useWallStore';

import CssGalleryWorld from './CssGalleryWorld';
import { fitFrameInCell } from './macroMosaic';
import PbrWallCanvas, { type PbrWallCanvasHandle } from './PbrWallCanvas';
import { resolveZoomTier, type ZoomTier } from './zoomTier';

const DEFAULT_CAMERA: CameraState = { x: 0, y: 0, z: 44 };
const DRAG_THRESHOLD_PX = 4;
const SETTLE_MS = 140;
const ENTRY_PADDING = 0.06;
const ALBUM_PADDING = 0.1;
const PRINT_PADDING = 0.14;

interface PointerState {
  id: number;
  x: number;
  y: number;
}

export interface GalleryViewportProps {
  albums: readonly WallAlbum[];
  lodUrl: (photo: WallPhoto, longestEdge: number) => string;
}

/**
 * Wall surface. Camera state lives in refs; only coarse snapshots reach React so
 * the DOM wall re-renders on culling/tier changes instead of every frame.
 */
export default function GalleryViewport({ albums, lodUrl }: GalleryViewportProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const worldRef = useRef<HTMLDivElement>(null);
  const wallRef = useRef<PbrWallCanvasHandle>(null);

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
  const rafRef = useRef(0);

  const [viewport, setViewport] = useState({ width: 1, height: 1, dpr: 1 });
  const [snapshot, setSnapshot] = useState<CameraState>({ ...DEFAULT_CAMERA });

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

  const scale = cameraToCssScale(snapshot.z, Math.max(1, viewport.height));
  const tier: ZoomTier = resolveZoomTier(scale, Boolean(focusedAlbumId && focusedPhotoId));

  const placements = useMemo<AlbumPlacement[]>(
    () => albums.map((album) => ({ id: album.id, position: album.position, bounds: album.bounds })),
    [albums],
  );

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
        previous.width === next.width &&
        previous.height === next.height &&
        previous.dpr === next.dpr
          ? previous
          : next,
      );
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    window.addEventListener('resize', measure);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, []);

  // --- camera <-> DOM -------------------------------------------------------
  const applyCamera = useCallback(() => {
    const camera = cameraRef.current;
    const world = worldRef.current;
    const view = viewportRef.current;
    if (!world) return;
    const cssScale = cameraToCssScale(camera.z, Math.max(1, view.height));
    const translateX = view.width / 2 - cssScale * camera.x * 100;
    const translateY = view.height / 2 + cssScale * camera.y * 100;
    world.style.transform = `translate(${translateX.toFixed(3)}px, ${translateY.toFixed(3)}px) scale(${cssScale.toFixed(6)})`;
    wallRef.current?.render(camera, view);
  }, []);

  const markGesture = useCallback(() => {
    lastGestureAtRef.current = performance.now();
    if (!willChangeRef.current && worldRef.current) {
      willChangeRef.current = true;
      worldRef.current.style.willChange = 'transform';
    }
  }, []);

  const commitSnapshot = useCallback((camera: CameraState) => {
    setSnapshot((previous) => {
      const moved =
        Math.abs(previous.x - camera.x) > 0.5 ||
        Math.abs(previous.y - camera.y) > 0.5 ||
        Math.abs(previous.z - camera.z) > 0.5;
      if (!moved) return previous;
      return { x: camera.x, y: camera.y, z: camera.z };
    });
  }, []);

  // --- animation loop -------------------------------------------------------
  useEffect(() => {
    let stopped = false;
    let lastSnapshotAt = 0;

    const frame = (now: number) => {
      if (stopped) return;
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
      applyCamera();

      if (now - lastSnapshotAt > 60) {
        lastSnapshotAt = now;
        commitSnapshot(camera);
      }

      if (
        willChangeRef.current &&
        now - lastGestureAtRef.current > SETTLE_MS &&
        !flightRef.current
      ) {
        willChangeRef.current = false;
        if (worldRef.current) worldRef.current.style.willChange = 'auto';
      }

      rafRef.current = requestAnimationFrame(frame);
    };

    rafRef.current = requestAnimationFrame(frame);
    return () => {
      stopped = true;
      cancelAnimationFrame(rafRef.current);
    };
  }, [applyCamera, commitSnapshot]);

  useEffect(() => {
    applyCamera();
  }, [applyCamera, viewport]);

  // --- framing --------------------------------------------------------------
  const frameBounds = useCallback(
    (bounds: Bounds, padding: number, planeZ = 0) => {
      const view = viewportRef.current;
      const target = fitBoundsToViewport(bounds, {
        fovDeg: CAMERA_FOV_DEG,
        aspect: view.width / Math.max(1, view.height),
        padding,
        planeZ,
        bottomInsetPx,
        viewportHeightPx: view.height,
      });
      return target;
    },
    [bottomInsetPx],
  );

  const photoBounds = useCallback(
    (album: WallAlbum, photoId: string): Bounds | null => {
      const index = album.photos.findIndex((photo) => photo.id === photoId);
      if (index < 0) return null;
      const grid = computeAlbumGrid(
        album.photos.length,
        album.gridColumns,
        album.soundtrack !== null,
      );
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

  // Row-0 entry framing on first load and whenever the wall changes.
  useEffect(() => {
    if (albums.length === 0) return;
    if (useWallStore.getState().viewMode !== 'overview') return;
    // Fit as many row-0 albums as the viewport can hold legibly: three on a
    // landscape desktop, two on a square-ish tablet, one on a phone (three
    // albums across 390px would zoom out past the macro threshold).
    const aspect = viewportRef.current.width / Math.max(1, viewportRef.current.height);
    const albumsPerRow = aspect >= 1.4 ? 3 : aspect >= 0.9 ? 2 : 1;
    const bounds = computeFirstRowBounds(placements, albumsPerRow);
    const framed = frameBounds(bounds, ENTRY_PADDING);
    // Bias row 0 slightly into the upper third so the top edge isn't empty dark wall.
    const target: CameraState = {
      ...framed,
      y: framed.y - bounds.height * 0.14,
    };
    flightRef.current = {
      from: { ...cameraRef.current },
      to: target,
      startedAt: performance.now(),
      durationMs: 620,
    };
    targetRef.current = target;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [placements, albums.length, viewport.width, viewport.height, bottomInsetPx, overviewNonce]);

  // Focus framing follows the store's view mode (album focus / print focus).
  useEffect(() => {
    const album = albums.find((candidate) => candidate.id === focusedAlbumId);
    if (viewMode === 'overview' || !album) return;

    const bounds =
      viewMode === 'print' && focusedPhotoId
        ? photoBounds(album, focusedPhotoId)
        : {
            x: album.position.x,
            y: album.position.y,
            width: album.bounds.width,
            height: album.bounds.height,
          };
    if (!bounds) return;

    const target =
      viewMode === 'print'
        ? frameBounds(bounds, PRINT_PADDING, 0.22)
        : frameBounds(bounds, ALBUM_PADDING);
    flightRef.current = {
      from: { ...cameraRef.current },
      to: target,
      startedAt: performance.now(),
      durationMs: 720,
    };
    targetRef.current = target;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewMode, focusedAlbumId, focusedPhotoId, albums]);

  // Zooming out to macro tier hides the plaques, so any playing soundtrack
  // stops there and raises the zoom-out toast (spec: stop on `overview`).
  useEffect(() => {
    if (tier !== 'macro') return;
    if (soundtrack.viewMode === 'overview') return;
    dispatchSoundtrack({ type: 'enter-overview' });
  }, [tier, soundtrack.viewMode, dispatchSoundtrack]);

  // --- gestures -------------------------------------------------------------
  const zoomBy = useCallback(
    (cursorX: number, cursorY: number, factor: number) => {
      const view = viewportRef.current;
      const next = zoomToCursor(
        cameraRef.current,
        { x: cursorX, y: cursorY },
        { width: view.width, height: view.height },
        factor,
      );
      cameraRef.current = next;
      targetRef.current = { ...next };
      flightRef.current = null;
      markGesture();
    },
    [markGesture],
  );

  const panByPixels = useCallback(
    (dx: number, dy: number) => {
      const view = viewportRef.current;
      const camera = cameraRef.current;
      const unitsPerPixel = worldPerPixel(camera.z, Math.max(1, view.height));
      const next: CameraState = {
        x: camera.x - dx * unitsPerPixel,
        y: camera.y + dy * unitsPerPixel,
        z: camera.z,
      };
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
      const factor = Math.exp(-event.deltaY * 0.0016);
      zoomBy(event.clientX - rect.left, event.clientY - rect.top, factor);
    };

    const onPointerDown = (event: PointerEvent) => {
      pointersRef.current.set(event.pointerId, {
        id: event.pointerId,
        x: event.clientX,
        y: event.clientY,
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
        if (!draggedRef.current && Math.hypot(dx, dy) > DRAG_THRESHOLD_PX) {
          draggedRef.current = true;
          // Capture only after drag threshold so plain desktop clicks still hit buttons.
          element.setPointerCapture?.(event.pointerId);
        }
        if (draggedRef.current) panByPixels(dx, dy);
      }
    };

    const endPointer = (event: PointerEvent) => {
      if (element.hasPointerCapture?.(event.pointerId)) {
        element.releasePointerCapture?.(event.pointerId);
      }
      pointersRef.current.delete(event.pointerId);
      if (pointersRef.current.size < 2) pinchRef.current = null;
      if (pointersRef.current.size === 0) {
        // Keep `draggedRef` true until the click event has been dispatched.
        window.setTimeout(() => {
          draggedRef.current = false;
        }, 0);
      }
    };

    element.addEventListener('wheel', onWheel, { passive: false });
    element.addEventListener('pointerdown', onPointerDown);
    element.addEventListener('pointermove', onPointerMove);
    element.addEventListener('pointerup', endPointer);
    element.addEventListener('pointercancel', endPointer);
    return () => {
      element.removeEventListener('wheel', onWheel);
      element.removeEventListener('pointerdown', onPointerDown);
      element.removeEventListener('pointermove', onPointerMove);
      element.removeEventListener('pointerup', endPointer);
      element.removeEventListener('pointercancel', endPointer);
    };
  }, [markGesture, panByPixels, zoomBy]);

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

  const wasDragged = useCallback(() => draggedRef.current, []);

  return (
    <div
      className="gallery-viewport"
      ref={containerRef}
      data-tier={tier}
      style={{ touchAction: 'none' }}
    >
      <PbrWallCanvas ref={wallRef} albums={albums} />
      <CssGalleryWorld
        albums={albums}
        lodUrl={lodUrl}
        camera={snapshot}
        viewport={viewport}
        scale={scale}
        dpr={viewport.dpr}
        focusedAlbumId={focusedAlbumId}
        focusedPhotoId={focusedPhotoId}
        placardMaterial={placardMaterial}
        worldRef={worldRef}
        onSelectAlbum={enterAlbum}
        onSelectPhoto={(albumId, photoId) => enterPrint(albumId, photoId)}
        wasDragged={wasDragged}
      />
      {soundtrack.pauseToastVisible ? <ZoomOutToast /> : null}
    </div>
  );
}

function ZoomOutToast() {
  return (
    <div className="soundtrack-toast" role="status">
      Paused soundtrack on zoom out
    </div>
  );
}
