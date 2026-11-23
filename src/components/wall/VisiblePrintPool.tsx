'use client';

/**
 * Visible/focused print pool (<= 40 prints).
 *
 * Each pooled print renders its own mat, textured print, and glass glare as one
 * rigid unit so the mat and photograph lift and tilt together. The matching
 * instanced mat slot is hidden via `aVisible = 0` (see `wallRuntime.ts`).
 * Textures stream through the shared `TexturePool` using longest-edge LOD URLs.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

import { buildLodUrl } from '@/lib/cdn/lodUrl';
import { computeAlbumGrid } from '@/lib/layout/islandLayout';
import type { WallAlbum, WallPhoto } from '@/lib/layout/types';
import { PRINT_Z } from '@/lib/lighting/fixtures';
import { readMoodTokens, useWallStore } from '@/store/useWallStore';

import { requestSharedTexture, releaseSharedTexture } from './textureRuntime';
import { galleryPointer, galleryViewport } from './viewportState';
import { setHiddenInstancedPhotos, clearHiddenInstancedPhotos } from './wallRuntime';

const MAX_POOLED_PRINTS = 40;
const MIN_PRINT_PX = 56;
const SELECTION_INTERVAL_MS = 130;
const MAX_TILT_RAD = (5 * Math.PI) / 180;
const CAMERA_FOV_DEG = 38;

interface PooledPrint {
  photo: WallPhoto;
  albumId: string;
  x: number;
  y: number;
  edge: number;
}

interface PrintHandle {
  group: THREE.Group | null;
  printMaterial: THREE.ShaderMaterial | null;
  matMaterial: THREE.ShaderMaterial | null;
  glareMaterial: THREE.ShaderMaterial | null;
  currentZ: number;
  rotationX: number;
  rotationY: number;
}

const MAT_VERTEX = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const MAT_FRAGMENT = /* glsl */ `
  precision highp float;
  uniform vec3 uMatColor;
  uniform float uAmbient;
  varying vec2 vUv;
  void main() {
    float border = 0.11;
    float edge = min(min(vUv.x, 1.0 - vUv.x), min(vUv.y, 1.0 - vUv.y));
    float band = smoothstep(border * 0.5, border, edge);
    float topBias = smoothstep(0.3, 0.95, vUv.y);
    vec3 color = uMatColor * uAmbient * mix(0.84, 1.0, vUv.y);
    color *= 1.0 - band * 0.3 * (0.45 + 0.55 * topBias);
    color += vec3(0.03) * smoothstep(0.985, 1.0, vUv.y);
    gl_FragColor = vec4(color, 1.0);
    #include <colorspace_fragment>
  }
`;

const GLARE_VERTEX = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const PRINT_VERTEX = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const PRINT_FRAGMENT = /* glsl */ `
  precision highp float;
  uniform sampler2D uMap;
  uniform float uHasMap;
  uniform float uVFlip;
  uniform float uExposure;
  uniform vec3 uColor;
  varying vec2 vUv;
  void main() {
    vec2 uv = vec2(vUv.x, uVFlip > 0.5 ? 1.0 - vUv.y : vUv.y);
    vec3 color = uHasMap > 0.5 ? texture2D(uMap, uv).rgb : uColor;
    // SRGBColorSpace textures sample as linear in WebGL2; encode linear to sRGB
    // for the ShaderMaterial output (three does not append that conversion).
    gl_FragColor = vec4(pow(max(color * uExposure, 0.0), vec3(1.0 / 2.2)), 1.0);
  }
`;

const GLARE_FRAGMENT = /* glsl */ `
  precision highp float;
  uniform float uStrength;
  uniform vec2 uPointer;
  varying vec2 vUv;
  void main() {
    float axis = vUv.x * 0.78 + vUv.y * 0.62;
    float center = 0.52 + uPointer.x * 0.18 + uPointer.y * 0.08;
    float band = smoothstep(0.34, 0.0, abs(axis - center));
    float alpha = band * uStrength * 0.26;
    if (alpha < 0.004) discard;
    gl_FragColor = vec4(1.0, 0.995, 0.97, alpha);
  }
`;

function projectedUnitsPerPixel(cameraZ: number, viewportHeight: number, planeZ: number): number {
  const distance = Math.max(0.25, cameraZ - planeZ);
  return (2 * distance * Math.tan(((CAMERA_FOV_DEG * Math.PI) / 180) / 2)) / Math.max(1, viewportHeight);
}

function lodEdgeFor(projectedPx: number, dpr: number, focused: boolean): number {
  if (focused) return 1600;
  const needed = projectedPx * Math.max(1, dpr);
  if (needed <= 420) return 512;
  if (needed <= 900) return 1024;
  return 1500;
}

function resolvePhotoUrl(
  cdnBase: string,
  storagePath: string,
  edge: number,
  aspectRatio: number,
): string {
  if (storagePath.startsWith('data:') || /^https?:\/\//i.test(storagePath)) {
    return storagePath;
  }
  return buildLodUrl(cdnBase, storagePath, edge, aspectRatio);
}

function PrintQuad({
  item,
  cdnBase,
  register,
  focused,
}: {
  item: PooledPrint;
  cdnBase: string;
  focused: boolean;
  register: (id: string, handle: PrintHandle | null) => void;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const [texture, setTexture] = useState<THREE.Texture | null>(null);

  const matMaterial = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: MAT_VERTEX,
        fragmentShader: MAT_FRAGMENT,
        uniforms: {
          uMatColor: { value: new THREE.Color('#F6F4EF') },
          uAmbient: { value: 1 },
        },
        toneMapped: false,
      }),
    [],
  );

  const printMaterial = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: PRINT_VERTEX,
        fragmentShader: PRINT_FRAGMENT,
        uniforms: {
          uMap: { value: null },
          uHasMap: { value: 0 },
          uVFlip: { value: 0 },
          uExposure: { value: 1 },
          uColor: {
            value: new THREE.Color(
              item.photo.dominantColor && item.photo.dominantColor.startsWith('#')
                ? item.photo.dominantColor
                : '#6b6861',
            ),
          },
        },
        toneMapped: false,
      }),
    [item.photo.dominantColor],
  );

  const glareMaterial = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: GLARE_VERTEX,
        fragmentShader: GLARE_FRAGMENT,
        uniforms: { uStrength: { value: 0 }, uPointer: { value: new THREE.Vector2() } },
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
      }),
    [],
  );

  const textureId = `${item.photo.id}@${item.edge}`;
  const url = resolvePhotoUrl(cdnBase, item.photo.storagePath, item.edge, item.photo.aspectRatio);

  useEffect(() => {
    let alive = true;
    requestSharedTexture(
      textureId,
      url,
      focused ? 'focus' : 'visible-medium',
      THREE.SRGBColorSpace,
    ).then((loaded) => {
      if (alive && loaded) setTexture(loaded);
    });
    return () => {
      alive = false;
      releaseSharedTexture(textureId);
    };
  }, [textureId, url, focused]);

  useEffect(() => {
    printMaterial.uniforms.uMap.value = texture;
    printMaterial.uniforms.uHasMap.value = texture ? 1 : 0;
    printMaterial.uniforms.uVFlip.value = texture?.userData?.vFlip ? 1 : 0;
    printMaterial.needsUpdate = true;
  }, [texture, printMaterial]);

  const handle = useMemo<PrintHandle>(
    () => ({
      group: null,
      printMaterial,
      matMaterial,
      glareMaterial,
      currentZ: PRINT_Z,
      rotationX: 0,
      rotationY: 0,
    }),
    [printMaterial, matMaterial, glareMaterial],
  );

  useEffect(() => {
    handle.group = groupRef.current;
    if (groupRef.current) {
      groupRef.current.position.set(item.x, item.y, PRINT_Z);
    }
    register(item.photo.id, handle);
    return () => {
      register(item.photo.id, null);
      matMaterial.dispose();
      printMaterial.dispose();
      glareMaterial.dispose();
    };
  }, [handle, item.x, item.y, item.photo.id, register, matMaterial, printMaterial, glareMaterial]);

  return (
    <group ref={groupRef} position={[item.x, item.y, PRINT_Z]}>
      <mesh material={matMaterial} renderOrder={1}>
        <planeGeometry args={[1, 1]} />
      </mesh>
      <mesh material={printMaterial} position={[0, 0, 0.004]} renderOrder={1}>
        <planeGeometry args={[0.78, 0.78]} />
      </mesh>
      <mesh material={glareMaterial} position={[0, 0, 0.012]} renderOrder={4}>
        <planeGeometry args={[0.78, 0.78]} />
      </mesh>
    </group>
  );
}

export interface VisiblePrintPoolProps {
  albums: WallAlbum[];
}

export default function VisiblePrintPool({ albums }: VisiblePrintPoolProps) {
  const [items, setItems] = useState<PooledPrint[]>([]);
  const focusedPhotoId = useWallStore((state) => state.focusedPhotoId);
  const cdnBase = useWallStore((state) => state.wall.cdnBase);
  const handles = useRef(new Map<string, PrintHandle>());
  const lastSelection = useRef(0);

  const register = useCallback((id: string, handle: PrintHandle | null) => {
    if (handle) handles.current.set(id, handle);
    else handles.current.delete(id);
  }, []);

  useEffect(() => {
    setHiddenInstancedPhotos(items.map((item) => item.photo.id));
  }, [items]);

  useEffect(() => {
    return () => {
      clearHiddenInstancedPhotos();
    };
  }, []);

  useFrame((state, delta) => {
    const now = performance.now();
    if (now - lastSelection.current > SELECTION_INTERVAL_MS) {
      lastSelection.current = now;
      const store = useWallStore.getState();
      const width = Math.max(1, galleryViewport.width);
      const height = Math.max(1, galleryViewport.height);
      const cam = galleryViewport.camera;
      const unitsPerPixel = projectedUnitsPerPixel(cam.z, height, 0.22);
      const printPx = 1 / Math.max(1e-6, unitsPerPixel);
      const dpr = state.viewport.dpr ?? 1;

      interface Candidate {
        photo: WallPhoto;
        albumId: string;
        x: number;
        y: number;
        distance: number;
        priority: number;
      }

      const candidates: Candidate[] = [];
      for (const album of albums) {
        if (album.photos.length === 0) continue;
        const grid = computeAlbumGrid(
          album.photos.length,
          album.gridColumns,
          album.soundtrack !== null,
        );
        album.photos.forEach((photo, index) => {
          const cell = grid.photos[index];
          if (!cell) return;
          const worldX = album.position.x + cell.x;
          const worldY = album.position.y + cell.y;
          const screenX = width / 2 + (worldX - cam.x) / unitsPerPixel;
          const screenY = height / 2 - (worldY - cam.y) / unitsPerPixel;
          if (
            screenX < -printPx ||
            screenX > width + printPx ||
            screenY < -printPx ||
            screenY > height + printPx
          ) {
            return;
          }

          const focused = store.focusedPhotoId === photo.id;
          if (printPx < MIN_PRINT_PX && !focused) return;

          const priority = focused
            ? 0
            : store.hoveredPhotoId === photo.id
              ? 1
              : 2;
          candidates.push({
            photo,
            albumId: album.id,
            x: worldX,
            y: worldY,
            priority,
            distance: Math.hypot(screenX - width / 2, screenY - height / 2),
          });
        });
      }

      candidates.sort((left, right) => left.priority - right.priority || left.distance - right.distance);
      const selection = candidates.slice(0, MAX_POOLED_PRINTS).map<PooledPrint>((candidate) => {
        const focused = store.focusedPhotoId === candidate.photo.id;
        return {
          photo: candidate.photo,
          albumId: candidate.albumId,
          x: candidate.x,
          y: candidate.y,
          edge: lodEdgeFor(printPx, dpr, focused),
        };
      });

      setItems((previous) => {
        const same =
          previous.length === selection.length &&
          previous.every(
            (item, index) =>
              item.photo.id === selection[index].photo.id &&
              item.edge === selection[index].edge,
          );
        if (same) {
          // Keep the world coordinates fresh without a re-render.
          for (let index = 0; index < selection.length; index += 1) {
            previous[index].x = selection[index].x;
            previous[index].y = selection[index].y;
          }
          return previous;
        }
        return selection;
      });
    }

    const store = useWallStore.getState();
    const tokens = readMoodTokens(store, performance.now());
    const focusedAny = store.viewMode === 'print';
    const dt = Math.min(0.05, delta);
    const hoveredId = store.hoveredPhotoId;

    for (const item of items) {
      const handle = handles.current.get(item.photo.id);
      if (!handle || !handle.group) continue;
      const isFocused = store.focusedPhotoId === item.photo.id;
      const isHovered = hoveredId === item.photo.id;

      let targetZ = PRINT_Z;
      if (isFocused) targetZ = 0.54;
      else if (isHovered) targetZ = 0.36;

      handle.currentZ = THREE.MathUtils.damp(handle.currentZ, targetZ, 14, dt);
      handle.group.position.z = handle.currentZ;

      const targetRotX = isHovered ? -galleryPointer.y * MAX_TILT_RAD : 0;
      const targetRotY = isHovered ? galleryPointer.x * MAX_TILT_RAD : 0;
      handle.rotationX = THREE.MathUtils.damp(handle.rotationX, targetRotX, 16, dt);
      handle.rotationY = THREE.MathUtils.damp(handle.rotationY, targetRotY, 16, dt);
      handle.group.rotation.x = handle.rotationX;
      handle.group.rotation.y = handle.rotationY;

      const exposure = isFocused ? 1 : focusedAny ? 0.74 : 0.5 + tokens.ambientLevel * 0.6;
      if (handle.printMaterial) handle.printMaterial.uniforms.uExposure.value = exposure;
      if (handle.matMaterial) handle.matMaterial.uniforms.uAmbient.value = 0.5 + tokens.ambientLevel * 0.55;
      if (handle.glareMaterial) {
        handle.glareMaterial.uniforms.uStrength.value = isFocused ? 0.85 : isHovered ? 0.7 : 0;
        (handle.glareMaterial.uniforms.uPointer.value as THREE.Vector2).set(
          galleryPointer.x,
          galleryPointer.y,
        );
      }
    }
  });

  return (
    <group>
      {items.map((item) => (
        <PrintQuad
          key={`${item.photo.id}@${item.edge}`}
          item={item}
          cdnBase={cdnBase}
          focused={focusedPhotoId === item.photo.id}
          register={register}
        />
      ))}
    </group>
  );
}
