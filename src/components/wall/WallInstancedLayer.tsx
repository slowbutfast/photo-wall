'use client';

/**
 * Instanced print/mat/shadow passes and batched TeX Gyre Heros glass placards.
 *
 * - Wall-plane cast shadows at `z = 0.002` (`depthWrite: false`), one instance
 *   per print/placard, positioned with `buildWorldFixtures` offsets.
 * - Instanced cotton mats with a `32x32` ThumbHash atlas placeholder (falling
 *   back to the photo's dominant colour) and CPU-precomputed `litTop/Bot/L/R`.
 * - Beveled glass standoff placards (`2.14u x 2.00u`, `z = 0.14`) with a faked
 *   Fresnel bevel, frosted text backing, and `troika-three-text` typography
 *   LOD-culled below `8px` projected text height.
 */

import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Text } from 'troika-three-text';
import { thumbHashToRGBA } from 'thumbhash';
import * as THREE from 'three';

import { buildWorldFixtures, PRINT_Z, type WorldShadedObject } from '@/lib/lighting/fixtures';
import { computeAlbumGrid, PLACARD_HEIGHT, PLACARD_WIDTH } from '@/lib/layout/islandLayout';
import type { WallAlbum } from '@/lib/layout/types';
import { readMoodTokens, useWallStore } from '@/store/useWallStore';

import { buildTrackLine } from './soundtrackText';
import { galleryViewport } from './viewportState';
import { isInstancedPhotoHidden, visibilityVersion } from './wallRuntime';

interface WallInstancedLayerProps {
  albums: WallAlbum[];
}

interface InstancedFields {
  centers: Float32Array;
  scales: Float32Array;
  count: number;
}

function createInstancedGeometry(
  fields: InstancedFields,
  extras: Record<string, { array: Float32Array; itemSize: number }>,
): THREE.InstancedBufferGeometry {
  const base = new THREE.PlaneGeometry(1, 1);
  const geometry = new THREE.InstancedBufferGeometry();
  geometry.index = base.index;
  geometry.setAttribute('position', base.getAttribute('position'));
  geometry.setAttribute('uv', base.getAttribute('uv'));
  geometry.setAttribute('aCenter', new THREE.InstancedBufferAttribute(fields.centers, 3));
  geometry.setAttribute('aSize', new THREE.InstancedBufferAttribute(fields.scales, 2));
  for (const [name, value] of Object.entries(extras)) {
    geometry.setAttribute(name, new THREE.InstancedBufferAttribute(value.array, value.itemSize));
  }
  geometry.instanceCount = fields.count;
  base.dispose();
  return geometry;
}

function linearColor(hex: string | null): THREE.Color {
  return new THREE.Color(hex && hex.startsWith('#') ? hex : '#6b6861');
}

/* ------------------------------------------------------------------ */
/* Pass 3: wall-plane cast shadows                                     */
/* ------------------------------------------------------------------ */

const SHADOW_VERTEX = /* glsl */ `
  attribute vec3 aCenter;
  attribute vec2 aSize;
  attribute float aOpacity;
  varying vec2 vUv;
  varying float vOpacity;
  void main() {
    vUv = uv;
    vOpacity = aOpacity;
    vec3 p = vec3(position.xy * aSize + aCenter.xy, aCenter.z);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  }
`;

const SHADOW_FRAGMENT = /* glsl */ `
  precision highp float;
  uniform float uShadowOpacity;
  varying vec2 vUv;
  varying float vOpacity;
  void main() {
    vec2 p = abs(vUv - 0.5) * 2.0;
    float d = max(p.x, p.y);
    float alpha = (1.0 - smoothstep(0.42, 1.0, d)) * uShadowOpacity * vOpacity;
    if (alpha < 0.004) discard;
    gl_FragColor = vec4(0.012, 0.011, 0.009, alpha);
  }
`;

function ShadowLayer({ objects }: { objects: WorldShadedObject[] }) {
  const { geometry, material } = useMemo(() => {
    const count = objects.length;
    const centers = new Float32Array(count * 3);
    const sizes = new Float32Array(count * 2);
    const opacity = new Float32Array(count);

    objects.forEach((object, index) => {
      centers[index * 3] = object.x + object.shadow.sx;
      centers[index * 3 + 1] = object.y + object.shadow.sy;
      centers[index * 3 + 2] = 0.002;
      sizes[index * 2] = object.width + 0.36;
      sizes[index * 2 + 1] = object.height + 0.4;
      opacity[index] = 0.55 + Math.min(0.4, object.lit * 0.35);
    });

    const shadowGeometry = createInstancedGeometry(
      { centers, scales: sizes, count },
      { aOpacity: { array: opacity, itemSize: 1 } },
    );
    const shadowMaterial = new THREE.ShaderMaterial({
      vertexShader: SHADOW_VERTEX,
      fragmentShader: SHADOW_FRAGMENT,
      uniforms: { uShadowOpacity: { value: 0.42 } },
      transparent: true,
      depthWrite: false,
      toneMapped: false,
    });

    return { geometry: shadowGeometry, material: shadowMaterial };
  }, [objects]);

  useEffect(() => {
    return () => {
      geometry.dispose();
      material.dispose();
    };
  }, [geometry, material]);

  useFrame(() => {
    material.uniforms.uShadowOpacity.value =
      readMoodTokens(useWallStore.getState(), performance.now()).shadowOpacity * 0.55;
  });

  return (
    <mesh geometry={geometry} material={material} frustumCulled={false} renderOrder={0} />
  );
}

/* ------------------------------------------------------------------ */
/* Pass 4: instanced mats + ThumbHash atlas                            */
/* ------------------------------------------------------------------ */

interface Atlas {
  texture: THREE.CanvasTexture | null;
  rectByHash: Map<string, [number, number, number, number]>;
}

const ATLAS_TILE = 32;
const ATLAS_COLUMNS = 64;

function decodeThumbHash(hash: string): Uint8Array | null {
  try {
    if (typeof atob === 'undefined') return null;
    const binary = atob(hash);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    return bytes;
  } catch {
    return null;
  }
}

function buildThumbAtlas(albums: WallAlbum[]): Atlas {
  const hashes: string[] = [];
  const seen = new Set<string>();
  for (const album of albums) {
    for (const photo of album.photos) {
      if (photo.thumbHash && !seen.has(photo.thumbHash)) {
        seen.add(photo.thumbHash);
        hashes.push(photo.thumbHash);
      }
    }
  }

  if (hashes.length === 0 || typeof document === 'undefined') {
    return { texture: null, rectByHash: new Map() };
  }

  const rows = Math.ceil(hashes.length / ATLAS_COLUMNS);
  const width = ATLAS_COLUMNS * ATLAS_TILE;
  const height = Math.max(ATLAS_TILE, rows * ATLAS_TILE);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) return { texture: null, rectByHash: new Map() };

  const tileCanvas = document.createElement('canvas');
  tileCanvas.width = ATLAS_TILE;
  tileCanvas.height = ATLAS_TILE;
  const tileContext = tileCanvas.getContext('2d');
  if (!tileContext) return { texture: null, rectByHash: new Map() };

  const rectByHash = new Map<string, [number, number, number, number]>();

  hashes.forEach((hash, index) => {
    const bytes = decodeThumbHash(hash);
    if (!bytes) return;
    try {
      const { w, h, rgba } = thumbHashToRGBA(bytes);
      const column = index % ATLAS_COLUMNS;
      const row = Math.floor(index / ATLAS_COLUMNS);
      tileContext.clearRect(0, 0, ATLAS_TILE, ATLAS_TILE);
      tileContext.putImageData(new ImageData(new Uint8ClampedArray(rgba), w, h), 0, 0);
      const x = column * ATLAS_TILE;
      const y = row * ATLAS_TILE;
      context.clearRect(x, y, ATLAS_TILE, ATLAS_TILE);
      context.drawImage(tileCanvas, x, y, ATLAS_TILE, ATLAS_TILE);
      rectByHash.set(hash, [
        x / width,
        1 - (y + ATLAS_TILE) / height,
        ATLAS_TILE / width,
        ATLAS_TILE / height,
      ]);
    } catch {
      // Malformed hash: fall back to dominant colour for this photo.
    }
  });

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.NoColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return { texture, rectByHash };
}

const MAT_VERTEX = /* glsl */ `
  attribute vec3 aCenter;
  attribute vec2 aSize;
  attribute vec3 aColor;
  attribute vec4 aUvRect;
  attribute float aVisible;
  attribute vec2 aLit;
  attribute vec2 aLitLR;
  varying vec2 vUv;
  varying vec3 vColor;
  varying vec4 vUvRect;
  varying float vVisible;
  varying vec2 vLit;
  varying vec2 vLitLR;
  void main() {
    vUv = uv;
    vColor = aColor;
    vUvRect = aUvRect;
    vVisible = aVisible;
    vLit = aLit;
    vLitLR = aLitLR;
    vec3 p = vec3(position.xy * aSize + aCenter.xy, aCenter.z);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  }
`;

const MAT_FRAGMENT = /* glsl */ `
  precision highp float;
  uniform sampler2D uAtlas;
  uniform vec3 uMatColor;
  uniform float uAmbient;
  varying vec2 vUv;
  varying vec3 vColor;
  varying vec4 vUvRect;
  varying float vVisible;
  varying vec2 vLit;
  varying vec2 vLitLR;

  void main() {
    if (vVisible < 0.5) discard;

    float border = 0.11;
    float inside =
      step(border, vUv.x) * step(vUv.x, 1.0 - border) *
      step(border, vUv.y) * step(vUv.y, 1.0 - border);

    vec2 local = (vUv - border) / (1.0 - 2.0 * border);
    vec3 photo;
    if (vUvRect.z > 0.0) {
      vec2 atlasUv = vUvRect.xy + local * vUvRect.zw;
      photo = pow(texture2D(uAtlas, atlasUv).rgb, vec3(2.2));
    } else {
      photo = vColor;
    }

    float light = mix(vLit.y, vLit.x, clamp(inside > 0.5 ? local.y : vUv.y, 0.0, 1.0));
    float side = mix(vLitLR.x, vLitLR.y, vUv.x);
    light *= mix(0.9, 1.0, side);
    float recessed = mix(0.62, 1.0, smoothstep(0.0, 0.12, local.y));
    vec3 mat = uMatColor * light * mix(0.76, 1.0, vUv.y) * uAmbient;
    vec3 print = photo * light * recessed;
    vec3 color = mix(mat, print, inside);
    color += vec3(0.05) * smoothstep(0.975, 1.0, vUv.y);
    gl_FragColor = vec4(pow(max(color, 0.0), vec3(1.0 / 2.2)), 1.0);
  }
`;

function MatLayer({
  albums,
  objects,
}: {
  albums: WallAlbum[];
  objects: WorldShadedObject[];
}) {
  const atlasRef = useRef<Atlas>({ texture: null, rectByHash: new Map() });

  const { geometry, material, visibleArray, photoIds } = useMemo(() => {
    const atlas = buildThumbAtlas(albums);
    atlasRef.current = atlas;

    const printsByAlbum = new Map<string, WorldShadedObject[]>();
    for (const object of objects) {
      if (object.kind !== 'print') continue;
      const list = printsByAlbum.get(object.albumId);
      if (list) list.push(object);
      else printsByAlbum.set(object.albumId, [object]);
    }

    const total = albums.reduce((sum, album) => sum + album.photos.length, 0);
    const centers = new Float32Array(total * 3);
    const sizes = new Float32Array(total * 2);
    const colors = new Float32Array(total * 3);
    const uvs = new Float32Array(total * 4);
    const visible = new Float32Array(total);
    const lits = new Float32Array(total * 2);
    const litsLR = new Float32Array(total * 2);
    const ids: string[] = [];

    let index = 0;
    for (const album of albums) {
      const grid = computeAlbumGrid(
        album.photos.length,
        album.gridColumns,
        album.soundtrack !== null,
      );
      const prints = printsByAlbum.get(album.id) ?? [];

      album.photos.forEach((photo, photoIndex) => {
        const cell = grid.photos[photoIndex];
        const shaded = prints[photoIndex];
        const color = linearColor(photo.dominantColor);
        const rect = photo.thumbHash ? atlas.rectByHash.get(photo.thumbHash) : undefined;

        centers[index * 3] = album.position.x + (cell?.x ?? 0);
        centers[index * 3 + 1] = album.position.y + (cell?.y ?? 0);
        centers[index * 3 + 2] = PRINT_Z;
        sizes[index * 2] = 1;
        sizes[index * 2 + 1] = 1;
        colors[index * 3] = color.r;
        colors[index * 3 + 1] = color.g;
        colors[index * 3 + 2] = color.b;
        if (rect) {
          uvs[index * 4] = rect[0];
          uvs[index * 4 + 1] = rect[1];
          uvs[index * 4 + 2] = rect[2];
          uvs[index * 4 + 3] = rect[3];
        }
        visible[index] = 1;
        lits[index * 2] = shaded?.litTop ?? 1;
        lits[index * 2 + 1] = shaded?.litBot ?? 1;
        litsLR[index * 2] = shaded?.litL ?? 1;
        litsLR[index * 2 + 1] = shaded?.litR ?? 1;
        ids.push(photo.id);
        index += 1;
      });
    }

    const matGeometry = createInstancedGeometry(
      { centers, scales: sizes, count: total },
      {
        aColor: { array: colors, itemSize: 3 },
        aUvRect: { array: uvs, itemSize: 4 },
        aVisible: { array: visible, itemSize: 1 },
        aLit: { array: lits, itemSize: 2 },
        aLitLR: { array: litsLR, itemSize: 2 },
      },
    );

    const atlasTexture = atlas.texture;
    const matMaterial = new THREE.ShaderMaterial({
      vertexShader: MAT_VERTEX,
      fragmentShader: MAT_FRAGMENT,
      uniforms: {
        uAtlas: { value: atlasTexture },
        uMatColor: { value: new THREE.Color('#F6F4EF') },
        uAmbient: { value: 1 },
      },
      toneMapped: false,
    });

    return { geometry: matGeometry, material: matMaterial, visibleArray: visible, photoIds: ids };
  }, [albums, objects]);

  useEffect(() => {
    return () => {
      geometry.dispose();
      material.dispose();
      atlasRef.current.texture?.dispose();
    };
  }, [geometry, material]);

  const lastVersion = useRef(-1);
  const indexById = useMemo(() => {
    const map = new Map<string, number>();
    photoIds.forEach((id, index) => map.set(id, index));
    return map;
  }, [photoIds]);

  useFrame(() => {
    const state = useWallStore.getState();
    const tokens = readMoodTokens(state, performance.now());
    const focusedAny = state.viewMode === 'print';
    material.uniforms.uAmbient.value =
      (0.55 + tokens.ambientLevel * 0.55) * (focusedAny ? 0.74 : 1);

    const version = visibilityVersion();
    if (version === lastVersion.current) return;
    lastVersion.current = version;

    for (let index = 0; index < photoIds.length; index += 1) {
      visibleArray[index] = isInstancedPhotoHidden(photoIds[index]) ? 0 : 1;
    }
    const attribute = geometry.getAttribute('aVisible') as THREE.InstancedBufferAttribute;
    attribute.needsUpdate = true;
  });

  return <mesh geometry={geometry} material={material} frustumCulled={false} />;
}

/* ------------------------------------------------------------------ */
/* Pass 6: beveled glass standoff placards + troika text               */
/* ------------------------------------------------------------------ */

const GLASS_VERTEX = /* glsl */ `
  attribute vec3 aCenter;
  attribute vec2 aSize;
  attribute float aLod;
  attribute float aLit;
  varying vec2 vUv;
  varying float vLod;
  varying float vLit;
  void main() {
    vUv = uv;
    vLod = aLod;
    vLit = aLit;
    vec3 p = vec3(position.xy * aSize + aCenter.xy, aCenter.z);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  }
`;

const GLASS_FRAGMENT = /* glsl */ `
  precision highp float;
  uniform vec3 uBacking;
  uniform float uBackingAlpha;
  varying vec2 vUv;
  varying float vLod;
  varying float vLit;
  void main() {
    if (vLod < 0.5) discard;
    float edge = min(min(vUv.x, 1.0 - vUv.x), min(vUv.y, 1.0 - vUv.y));
    float bevel = smoothstep(0.055, 0.0, edge);
    float backing = smoothstep(0.075, 0.105, edge);
    vec3 glass = vec3(0.886, 0.949, 0.918) + vec3(0.06) * bevel;
    vec3 color = mix(glass, uBacking, backing) * mix(0.72, 1.16, clamp(vLit, 0.0, 1.0));
    float alpha = mix(0.10 + bevel * 0.22, uBackingAlpha, backing);
    gl_FragColor = vec4(color, alpha);
  }
`;

interface PlacardEntry {
  album: WallAlbum;
  x: number;
  y: number;
  width: number;
  height: number;
}

function createText(
  content: string,
  options: {
    font: string;
    fontSize: number;
    maxWidth: number;
    color: string;
    anchorY?: 'top' | 'bottom';
    letterSpacing?: number;
  },
): Text {
  const text = new Text();
  text.text = content;
  text.font = options.font;
  text.fontSize = options.fontSize;
  text.maxWidth = options.maxWidth;
  text.anchorX = 'left';
  text.anchorY = options.anchorY ?? 'top';
  text.color = options.color;
  text.letterSpacing = options.letterSpacing ?? 0;
  text.material.depthWrite = false;
  text.material.transparent = true;
  text.material.toneMapped = false;
  text.renderOrder = 3;
  text.sync();
  return text;
}

interface PlacardTexts {
  group: THREE.Group;
  title: Text;
  caption: Text;
  track: Text | null;
  album: WallAlbum;
}

const TITLE_FONT = '/fonts/texgyreheros-bold.otf';
const REGULAR_FONT = '/fonts/texgyreheros-regular.otf';

function PlacardLayer({
  albums,
  objects,
}: {
  albums: WallAlbum[];
  objects: WorldShadedObject[];
}) {
  const { camera } = useThree();

  const litByAlbum = useMemo(() => {
    const map = new Map<string, number>();
    for (const object of objects) {
      if (object.kind === 'placard') map.set(object.albumId, object.lit);
    }
    return map;
  }, [objects]);

  const placards = useMemo<PlacardEntry[]>(
    () =>
      albums.map((album) => {
        const grid = computeAlbumGrid(
          album.photos.length,
          album.gridColumns,
          album.soundtrack !== null,
        );
        return {
          album,
          x: album.position.x + grid.placard.x,
          y: album.position.y + grid.placard.y,
          width: PLACARD_WIDTH,
          height: PLACARD_HEIGHT,
        };
      }),
    [albums],
  );

  const { geometry, material, lodArray } = useMemo(() => {
    const count = placards.length;
    const centers = new Float32Array(count * 3);
    const sizes = new Float32Array(count * 2);
    const lod = new Float32Array(count);
    const lit = new Float32Array(count);
    placards.forEach((placard, index) => {
      centers[index * 3] = placard.x;
      centers[index * 3 + 1] = placard.y;
      centers[index * 3 + 2] = 0.14;
      sizes[index * 2] = placard.width;
      sizes[index * 2 + 1] = placard.height;
      lit[index] = litByAlbum.get(placard.album.id) ?? 1;
    });

    const glassGeometry = createInstancedGeometry({ centers, scales: sizes, count }, {
      aLod: { array: lod, itemSize: 1 },
      aLit: { array: lit, itemSize: 1 },
    });
    const glassMaterial = new THREE.ShaderMaterial({
      vertexShader: GLASS_VERTEX,
      fragmentShader: GLASS_FRAGMENT,
      uniforms: {
        uBacking: { value: new THREE.Color('#141614') },
        uBackingAlpha: { value: 0.74 },
      },
      transparent: true,
      depthWrite: false,
      toneMapped: false,
    });

    return { geometry: glassGeometry, material: glassMaterial, lodArray: lod };
  }, [placards, litByAlbum]);

  const textRoot = useRef<THREE.Group>(null);
  const entriesRef = useRef<PlacardTexts[]>([]);
  const inkRef = useRef('#F4F6F4');
  const trackRef = useRef<string[]>([]);
  const lastLodRef = useRef<Float32Array | null>(null);

  useEffect(() => {
    const root = textRoot.current;
    if (!root) return;

    const entries: PlacardTexts[] = [];
    placards.forEach((placard) => {
      const group = new THREE.Group();
      group.position.set(placard.x, placard.y, 0.145);
      group.visible = false;

      const maxWidth = placard.width - 0.44;
      const title = createText(placard.album.title, {
        font: TITLE_FONT,
        fontSize: 0.16,
        maxWidth,
        color: '#F4F6F4',
        letterSpacing: -0.002,
      });
      title.position.set(-placard.width / 2 + 0.22, placard.height / 2 - 0.26, 0);

      const caption = createText(placard.album.description ?? '', {
        font: REGULAR_FONT,
        fontSize: 0.13,
        maxWidth,
        color: '#F4F6F4',
      });
      caption.position.set(-placard.width / 2 + 0.22, placard.height / 2 - 0.58, 0);

      group.add(title);
      group.add(caption);

      let track: Text | null = null;
      if (placard.album.soundtrack) {
        track = createText(buildTrackLine(placard.album.soundtrack, 0), {
          font: REGULAR_FONT,
          fontSize: 0.115,
          maxWidth,
          color: '#F4F6F4',
          anchorY: 'bottom',
        });
        track.position.set(-placard.width / 2 + 0.22, -placard.height / 2 + 0.22, 0);
        group.add(track);
      }

      root.add(group);
      entries.push({ group, title, caption, track, album: placard.album });
    });

    entriesRef.current = entries;
    trackRef.current = entries.map(() => '');

    return () => {
      for (const entry of entries) {
        entry.group.removeFromParent();
        entry.title.dispose();
        entry.caption.dispose();
        entry.track?.dispose();
      }
      entriesRef.current = [];
    };
  }, [placards]);

  useEffect(() => {
    return () => {
      geometry.dispose();
      material.dispose();
    };
  }, [geometry, material]);

  useFrame(() => {
    const tokens = readMoodTokens(useWallStore.getState(), performance.now());
    const state = useWallStore.getState();

    const ink = tokens.placardInk;
    const inkIsLight = isLightColor(ink);
    if (inkRef.current !== ink) {
      inkRef.current = ink;
      for (const entry of entriesRef.current) {
        entry.title.color = ink;
        entry.caption.color = ink;
        if (entry.track) entry.track.color = ink;
      }
    }
    material.uniforms.uBacking.value.set(inkIsLight ? '#141614' : '#F4F6F4');
    material.uniforms.uBackingAlpha.value = inkIsLight ? 0.74 : 0.72;

    const cam = galleryViewport.camera;
    const viewportHeight = Math.max(1, galleryViewport.height);
    const viewportWidth = Math.max(1, galleryViewport.width);
    const fov = ((camera as THREE.PerspectiveCamera).fov || 38) * (Math.PI / 180);
    const distance = Math.max(0.3, cam.z - 0.14);
    const unitsPerPixel = (2 * distance * Math.tan(fov / 2)) / viewportHeight;
    const textPx = 0.16 / unitsPerPixel;
    const halfWidth = (viewportWidth * unitsPerPixel) / 2;
    const halfHeight = (viewportHeight * unitsPerPixel) / 2;

    let changed = false;
    if (!lastLodRef.current || lastLodRef.current.length !== placards.length) {
      lastLodRef.current = new Float32Array(placards.length);
      changed = true;
    }
    const previous = lastLodRef.current;

    const playhead = state.playheadSec;
    entriesRef.current.forEach((entry, index) => {
      const placard = placards[index];
      if (!placard) return;
      const inView =
        Math.abs(placard.x - cam.x) < halfWidth + placard.width &&
        Math.abs(placard.y - cam.y) < halfHeight + placard.height;
      const visible = textPx >= 8 && inView;
      const value = visible ? 1 : 0;
      if (previous[index] !== value) {
        previous[index] = value;
        lodArray[index] = value;
        changed = true;
      }
      entry.group.visible = visible;

      if (entry.track && entry.album.soundtrack) {
        const line = buildTrackLine(entry.album.soundtrack, playhead);
        if (trackRef.current[index] !== line) {
          trackRef.current[index] = line;
          entry.track.text = line;
          entry.track.sync();
        }
      }
    });

    if (changed) {
      const attribute = geometry.getAttribute('aLod') as THREE.InstancedBufferAttribute;
      attribute.needsUpdate = true;
    }
  });

  return (
    <group>
      <mesh geometry={geometry} material={material} frustumCulled={false} renderOrder={2} />
      <group ref={textRoot} />
    </group>
  );
}

function isLightColor(color: string): boolean {
  const match = color.match(/rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/i);
  if (match) {
    return (Number(match[1]) + Number(match[2]) + Number(match[3])) / 3 > 140;
  }
  const hex = color.replace('#', '');
  if (hex.length < 6) return false;
  const value = Number.parseInt(hex.slice(0, 6), 16);
  return ((value >> 16) + ((value >> 8) & 255) + (value & 255)) / 3 > 140;
}

/* ------------------------------------------------------------------ */

export default function WallInstancedLayer({ albums }: WallInstancedLayerProps) {
  const fixtures = useMemo(() => buildWorldFixtures(albums), [albums]);

  return (
    <group>
      <ShadowLayer objects={fixtures.objects} />
      <MatLayer albums={albums} objects={fixtures.objects} />
      <PlacardLayer albums={albums} objects={fixtures.objects} />
    </group>
  );
}
