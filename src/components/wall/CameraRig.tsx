'use client';

/**
 * Perspective camera controller for the infinite gallery wall.
 *
 * Owns wheel/trackpad zoom-to-cursor, pointer-drag panning, two-finger pinch,
 * Safari `gesturechange`, damped motion, van Wijk–Nuij fly-to framing, pointer
 * hit-testing via `hitTestWall`, and the editable-element keyboard guard.
 */

import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';

import {
  CAMERA_FOV_DEG,
  fitBoundsToViewport,
  hitTestWall,
  interpolateZoom,
  screenToWorld,
  worldPerPixel,
  zoomToCursor,
  type Bounds,
  type CameraState,
} from '@/lib/camera/cameraMath';
import { computeAlbumGrid } from '@/lib/layout/islandLayout';
import type { WallAlbum } from '@/lib/layout/types';
import { useWallStore } from '@/store/useWallStore';

import { galleryPointer, galleryViewport } from './viewportState';

const FLY_DURATION_MS = 1000;
const DRAG_THRESHOLD_PX = 4;
const DEFAULT_CAMERA: CameraState = { x: 0, y: 0, z: 44 };

function isEditableTarget(target: EventTarget | null): boolean {
  const element = target as HTMLElement | null;
  if (!element) return false;
  const tag = element.tagName;
  return (
    tag === 'INPUT' ||
    tag === 'TEXTAREA' ||
    tag === 'SELECT' ||
    tag === 'OPTION' ||
    element.isContentEditable === true
  );
}

function overallBounds(albums: WallAlbum[]): Bounds {
  if (albums.length === 0) return { x: 0, y: 0, width: 24, height: 14 };
  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const album of albums) {
    minX = Math.min(minX, album.position.x - album.bounds.width / 2);
    maxX = Math.max(maxX, album.position.x + album.bounds.width / 2);
    minY = Math.min(minY, album.position.y - album.bounds.height / 2);
    maxY = Math.max(maxY, album.position.y + album.bounds.height / 2);
  }
  return {
    x: (minX + maxX) / 2,
    y: (minY + maxY) / 2,
    width: Math.max(1, maxX - minX),
    height: Math.max(1, maxY - minY),
  };
}

function photoWorldCenter(album: WallAlbum, photoId: string): { x: number; y: number } | null {
  const index = album.photos.findIndex((photo) => photo.id === photoId);
  if (index < 0) return null;
  const grid = computeAlbumGrid(
    album.photos.length,
    album.gridColumns,
    album.soundtrack !== null,
  );
  const cell = grid.photos[index];
  if (!cell) return null;
  return { x: album.position.x + cell.x, y: album.position.y + cell.y };
}

export default function CameraRig() {
  const { camera, gl, size } = useThree();
  const current = useRef<CameraState>({ ...DEFAULT_CAMERA });
  const target = useRef<CameraState>({ ...DEFAULT_CAMERA });
  const fly = useRef<{ from: CameraState; to: CameraState; start: number } | null>(null);

  const viewMode = useWallStore((state) => state.viewMode);
  const focusedAlbumId = useWallStore((state) => state.focusedAlbumId);
  const focusedPhotoId = useWallStore((state) => state.focusedPhotoId);
  const wall = useWallStore((state) => state.wall);
  const bottomInsetPx = useWallStore((state) => state.bottomInsetPx);

  const aspect = useMemo(
    () => Math.max(0.1, size.width / Math.max(1, size.height)),
    [size.width, size.height],
  );

  // Fly to the current selection whenever it changes (album/print/overview).
  useEffect(() => {
    const albums = wall.albums;
    let bounds: Bounds = overallBounds(albums);
    let padding = 0.07;
    let planeZ = 0;
    let inset = 0;

    if (viewMode === 'print' && focusedAlbumId && focusedPhotoId) {
      const album = albums.find((candidate) => candidate.id === focusedAlbumId);
      const center = album ? photoWorldCenter(album, focusedPhotoId) : null;
      if (center && album) {
        bounds = { x: center.x, y: center.y, width: 1.16, height: 1.16 };
        padding = 0.2;
        planeZ = 0.54;
        inset = bottomInsetPx;
      }
    } else if (viewMode === 'album' && focusedAlbumId) {
      const album = albums.find((candidate) => candidate.id === focusedAlbumId);
      if (album) {
        bounds = {
          x: album.position.x,
          y: album.position.y,
          width: album.bounds.width,
          height: album.bounds.height,
        };
        padding = 0.11;
        planeZ = 0.22;
        inset = Math.min(bottomInsetPx, 80);
      }
    }

    const next = fitBoundsToViewport(bounds, {
      aspect,
      padding,
      planeZ,
      bottomInsetPx: inset,
      viewportHeightPx: Math.max(1, size.height),
    });

    const from: CameraState = { ...current.current };
    fly.current = { from, to: next, start: performance.now() };
    target.current = next;
  }, [
    viewMode,
    focusedAlbumId,
    focusedPhotoId,
    wall,
    bottomInsetPx,
    aspect,
    size.width,
    size.height,
  ]);

  useFrame((_state, delta) => {
    galleryViewport.width = size.width;
    galleryViewport.height = size.height;
    galleryViewport.bottomInsetPx = bottomInsetPx;

    const activeFly = fly.current;
    if (activeFly) {
      const progress = Math.min(1, Math.max(0, (performance.now() - activeFly.start) / FLY_DURATION_MS));
      const next = interpolateZoom(activeFly.from, activeFly.to, progress);
      current.current = next;
      target.current = { ...next };
      if (progress >= 1) fly.current = null;
    } else {
      const damping = 1 - Math.exp(-Math.min(0.05, delta) * 12);
      current.current = {
        x: current.current.x + (target.current.x - current.current.x) * damping,
        y: current.current.y + (target.current.y - current.current.y) * damping,
        z: current.current.z + (target.current.z - current.current.z) * damping,
      };
    }

    const cam = current.current;
    camera.position.set(cam.x, cam.y, cam.z);
    camera.lookAt(cam.x, cam.y, 0);

    galleryViewport.camera.x = cam.x;
    galleryViewport.camera.y = cam.y;
    galleryViewport.camera.z = cam.z;
  });

  useEffect(() => {
    const element = gl.domElement;
    const pointers = new Map<number, { x: number; y: number }>();
    let dragging = false;
    let downX = 0;
    let downY = 0;
    let lastX = 0;
    let lastY = 0;
    let moved = false;
    let pinchDistance = 0;
    let gestureActive = false;
    let wheelIdleTimer: ReturnType<typeof setTimeout> | null = null;

    const localPoint = (event: PointerEvent | WheelEvent): { x: number; y: number } => {
      const rect = element.getBoundingClientRect();
      return { x: event.clientX - rect.left, y: event.clientY - rect.top };
    };

    const notifyOverlay = (type: 'gesture-start' | 'gesture-end') => {
      const state = useWallStore.getState();
      if (!state.overlay.mounted) return;
      state.dispatchOverlay({ type });
    };

    const signalGestureStart = () => {
      if (gestureActive) return;
      gestureActive = true;
      notifyOverlay('gesture-start');
    };

    const signalGestureEnd = () => {
      if (!gestureActive) return;
      gestureActive = false;
      notifyOverlay('gesture-end');
    };

    const scheduleGestureEnd = () => {
      if (wheelIdleTimer !== null) clearTimeout(wheelIdleTimer);
      wheelIdleTimer = setTimeout(() => {
        wheelIdleTimer = null;
        signalGestureEnd();
      }, 120);
    };

    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      signalGestureStart();
      scheduleGestureEnd();
      const point = localPoint(event);
      const viewport = { width: size.width, height: size.height };
      const delta = event.deltaMode === 1 ? event.deltaY * 16 : event.deltaY;
      const sensitivity = event.ctrlKey ? 0.0045 : 0.0016;
      const factor = Math.exp(-delta * sensitivity);
      const next = zoomToCursor(current.current, point, viewport, factor);
      fly.current = null;
      current.current = next;
      target.current = { ...next };
    };

    const onPointerDown = (event: PointerEvent) => {
      element.setPointerCapture?.(event.pointerId);
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (pointers.size === 1) {
        dragging = true;
        moved = false;
        downX = event.clientX;
        downY = event.clientY;
        lastX = event.clientX;
        lastY = event.clientY;
      } else if (pointers.size === 2) {
        signalGestureStart();
        const [a, b] = Array.from(pointers.values());
        pinchDistance = Math.hypot(a.x - b.x, a.y - b.y);
      }
    };

    const onPointerMove = (event: PointerEvent) => {
      const rect = element.getBoundingClientRect();
      const px = event.clientX - rect.left;
      const py = event.clientY - rect.top;
      galleryPointer.x = (px / Math.max(1, rect.width)) * 2 - 1;
      galleryPointer.y = (py / Math.max(1, rect.height)) * 2 - 1;

      if (pointers.has(event.pointerId)) {
        pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      }

      if (pointers.size === 2) {
        const [a, b] = Array.from(pointers.values());
        const distance = Math.hypot(a.x - b.x, a.y - b.y);
        if (pinchDistance > 0) {
          const midpoint = { x: (a.x + b.x) / 2 - rect.left, y: (a.y + b.y) / 2 - rect.top };
          const factor = distance / pinchDistance;
          if (Math.abs(factor - 1) > 0.002) {
            fly.current = null;
            current.current = zoomToCursor(
              current.current,
              midpoint,
              { width: size.width, height: size.height },
              factor,
            );
            target.current = { ...current.current };
          }
        }
        pinchDistance = distance;
        moved = true;
        return;
      }

      if (dragging && pointers.size === 1) {
        const dx = event.clientX - lastX;
        const dy = event.clientY - lastY;
        if (!moved && Math.hypot(event.clientX - downX, event.clientY - downY) > DRAG_THRESHOLD_PX) {
          moved = true;
          signalGestureStart();
        }
        if (moved) {
          const unitsPerPixel = worldPerPixel(current.current.z, size.height);
          fly.current = null;
          current.current = {
            x: current.current.x - dx * unitsPerPixel,
            y: current.current.y + dy * unitsPerPixel,
            z: current.current.z,
          };
          target.current = { ...current.current };
        }
        lastX = event.clientX;
        lastY = event.clientY;
        return;
      }

      // Hover hit-testing.
      const world = screenToWorld(
        { x: px, y: py },
        current.current,
        { width: size.width, height: size.height },
      );
      const hit = hitTestWall(world, useWallStore.getState().wall.albums);
      const store = useWallStore.getState();
      if (hit) store.setHover(hit.album.id, hit.photo.id);
      else {
        const album = store.wall.albums.find(
          (candidate) =>
            Math.abs(world.x - candidate.position.x) <= candidate.bounds.width / 2 &&
            Math.abs(world.y - candidate.position.y) <= candidate.bounds.height / 2,
        );
        store.setHover(album?.id ?? null, null);
      }
    };

    const finishPointer = (event: PointerEvent) => {
      pointers.delete(event.pointerId);
      if (pointers.size < 2) pinchDistance = 0;
      if (pointers.size === 0) {
        signalGestureEnd();
        if (dragging && !moved) {
          const point = localPoint(event);
          const store = useWallStore.getState();
          const world = screenToWorld(
            point,
            current.current,
            { width: size.width, height: size.height },
          );
          const hit = hitTestWall(world, store.wall.albums);
          if (hit) {
            store.enterPrint(hit.album.id, hit.photo.id);
          } else {
            const album = store.wall.albums.find(
              (candidate) =>
                Math.abs(world.x - candidate.position.x) <= candidate.bounds.width / 2 &&
                Math.abs(world.y - candidate.position.y) <= candidate.bounds.height / 2,
            );
            if (album) {
              const alreadyFocused =
                store.viewMode === 'album' && store.focusedAlbumId === album.id;
              if (!alreadyFocused) store.enterAlbum(album.id);
            }
          }
        }
        dragging = false;
        moved = false;
      }
    };

    const onGestureChange = (event: Event) => {
      event.preventDefault();
      const gesture = event as Event & { scale?: number; clientX?: number; clientY?: number };
      const factor = gesture.scale ?? 1;
      if (Math.abs(factor - 1) < 0.001) return;
      const rect = element.getBoundingClientRect();
      const point = {
        x: (gesture.clientX ?? rect.left + rect.width / 2) - rect.left,
        y: (gesture.clientY ?? rect.top + rect.height / 2) - rect.top,
      };
      fly.current = null;
      current.current = zoomToCursor(current.current, point, { width: size.width, height: size.height }, factor);
      target.current = { ...current.current };
    };

    const panBy = (fractionX: number, fractionY: number) => {
      const visibleHeight = 2 * current.current.z * Math.tan(((CAMERA_FOV_DEG * Math.PI) / 180) / 2);
      const visibleWidth = visibleHeight * (size.width / Math.max(1, size.height));
      fly.current = null;
      current.current = {
        x: current.current.x + visibleWidth * fractionX,
        y: current.current.y + visibleHeight * fractionY,
        z: current.current.z,
      };
      target.current = { ...current.current };
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (isEditableTarget(event.target)) return;
      const store = useWallStore.getState();
      if (store.curatorOpen) return;
      switch (event.key) {
        case 'Escape':
          store.returnOneLevel();
          break;
        case '0':
          store.goOverview();
          break;
        case 'Left':
        case 'ArrowLeft':
          store.stepPhoto(-1);
          break;
        case 'Right':
        case 'ArrowRight':
          store.stepPhoto(1);
          break;
        case 'a':
        case 'A':
          panBy(-0.18, 0);
          break;
        case 'd':
        case 'D':
          panBy(0.18, 0);
          break;
        case 'w':
        case 'W':
          panBy(0, 0.18);
          break;
        case 's':
        case 'S':
          panBy(0, -0.18);
          break;
        default:
          return;
      }
      event.preventDefault();
    };

    element.addEventListener('wheel', onWheel, { passive: false });
    element.addEventListener('pointerdown', onPointerDown);
    element.addEventListener('pointermove', onPointerMove);
    element.addEventListener('pointerup', finishPointer);
    element.addEventListener('pointercancel', finishPointer);
    element.addEventListener('gesturechange', onGestureChange as EventListener, { passive: false });
    window.addEventListener('keydown', onKeyDown);

    return () => {
      if (wheelIdleTimer !== null) clearTimeout(wheelIdleTimer);
      element.removeEventListener('wheel', onWheel);
      element.removeEventListener('pointerdown', onPointerDown);
      element.removeEventListener('pointermove', onPointerMove);
      element.removeEventListener('pointerup', finishPointer);
      element.removeEventListener('pointercancel', finishPointer);
      element.removeEventListener('gesturechange', onGestureChange as EventListener);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [gl, size.width, size.height]);

  return null;
}
