'use client';

/**
 * Continuous borderless PBR plaster wall plus instanced per-album additive
 * spotlight quads.
 *
 * Pass 1 of the hybrid renderer: the wall itself (albedo + normal + AO +
 * roughness maps at `z = 0`) and one additive warm light pool per album. There
 * is no global light-count cap, so 50+ albums stay illuminated in a single
 * instanced draw call.
 */

import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useLoader, useThree } from '@react-three/fiber';
import * as THREE from 'three';

import { computeAlbumGrid, ISLAND_GAP, PLACARD_WIDTH } from '@/lib/layout/islandLayout';
import type { WallAlbum } from '@/lib/layout/types';
import { readMoodTokens, useWallStore } from '@/store/useWallStore';

const WALL_TILE_WORLD = 5.2;
const CAMERA_FOV_RAD = (38 * Math.PI) / 180;

function createInstancedQuads(
  centers: Float32Array,
  scales: Float32Array,
  strengths: Float32Array,
  count: number,
): THREE.InstancedBufferGeometry {
  const base = new THREE.PlaneGeometry(1, 1);
  const geometry = new THREE.InstancedBufferGeometry();
  geometry.index = base.index;
  geometry.setAttribute('position', base.getAttribute('position'));
  geometry.setAttribute('uv', base.getAttribute('uv'));
  geometry.setAttribute('aCenter', new THREE.InstancedBufferAttribute(centers, 3));
  geometry.setAttribute('aScale', new THREE.InstancedBufferAttribute(scales, 2));
  geometry.setAttribute('aStrength', new THREE.InstancedBufferAttribute(strengths, 1));
  geometry.instanceCount = count;
  base.dispose();
  return geometry;
}

interface SpotlightFields {
  centers: Float32Array;
  scales: Float32Array;
  strengths: Float32Array;
  count: number;
}

function buildSpotlightFields(albums: WallAlbum[]): SpotlightFields {
  const centers = new Float32Array(albums.length * 3);
  const scales = new Float32Array(albums.length * 2);
  const strengths = new Float32Array(albums.length);

  albums.forEach((album, index) => {
    const grid = computeAlbumGrid(
      album.photos.length,
      album.gridColumns,
      album.soundtrack !== null,
    );
    const gridCenterLocalX =
      grid.placard.x + PLACARD_WIDTH / 2 + ISLAND_GAP + grid.grid.width / 2;
    const islandTop = grid.bounds.height / 2;
    const poolCenterY = islandTop - grid.grid.height * 0.34;

    centers[index * 3] = album.position.x + gridCenterLocalX;
    centers[index * 3 + 1] = album.position.y + poolCenterY;
    centers[index * 3 + 2] = 0.02;
    scales[index * 2] = grid.grid.width * 1.28;
    scales[index * 2 + 1] = Math.max(1.6, grid.grid.height * 0.92);
    strengths[index] = 1;
  });

  return { centers, scales, strengths, count: albums.length };
}

const SPOT_VERTEX = /* glsl */ `
  attribute vec3 aCenter;
  attribute vec2 aScale;
  attribute float aStrength;
  varying vec2 vUv;
  varying float vStrength;

  void main() {
    vUv = uv;
    vStrength = aStrength;
    vec3 p = vec3(position.xy * aScale + aCenter.xy, aCenter.z);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  }
`;

const SPOT_FRAGMENT = /* glsl */ `
  precision highp float;
  uniform vec3 uWarm;
  uniform float uIntensity;
  uniform float uPoolAlpha;
  varying vec2 vUv;
  varying float vStrength;

  void main() {
    vec2 p = (vUv - vec2(0.5, 0.62)) * vec2(1.0, 1.2);
    float d = length(p);
    float pool = smoothstep(0.54, 0.05, d);
    float topBias = smoothstep(0.0, 0.45, vUv.y);
    float alpha = pool * uPoolAlpha * vStrength * mix(0.55, 1.0, topBias);
    if (alpha < 0.003) discard;
    vec3 color = uWarm * uIntensity * mix(0.55, 1.0, topBias);
    gl_FragColor = vec4(color, alpha);
  }
`;

export interface InfiniteWallShaderProps {
  albums: WallAlbum[];
}

export default function InfiniteWallShader({ albums }: InfiniteWallShaderProps) {
  const { camera, size, gl } = useThree();
  const wallRef = useRef<THREE.Mesh>(null);
  const ambientRef = useRef<THREE.AmbientLight>(null);
  const directorRef = useRef<THREE.DirectionalLight>(null);
  const materialRef = useRef<THREE.MeshStandardMaterial>(null);

  const [albedo, normalMap, aoMap, roughnessMap] = useLoader(THREE.TextureLoader, [
    '/textures/wall/wall_albedo.webp',
    '/textures/wall/wall_normal.webp',
    '/textures/wall/wall_ao.webp',
    '/textures/wall/wall_roughness.webp',
  ]);

  const wallGeometry = useMemo(() => {
    const geometry = new THREE.PlaneGeometry(1, 1);
    const uv = geometry.getAttribute('uv');
    geometry.setAttribute('uv1', uv.clone());
    return geometry;
  }, []);

  useEffect(() => {
    return () => {
      wallGeometry.dispose();
    };
  }, [wallGeometry]);

  useEffect(() => {
    albedo.colorSpace = THREE.SRGBColorSpace;
    normalMap.colorSpace = THREE.NoColorSpace;
    aoMap.colorSpace = THREE.NoColorSpace;
    roughnessMap.colorSpace = THREE.NoColorSpace;
    for (const texture of [albedo, normalMap, aoMap, roughnessMap]) {
      texture.wrapS = THREE.RepeatWrapping;
      texture.wrapT = THREE.RepeatWrapping;
      texture.anisotropy = Math.min(8, gl.capabilities.getMaxAnisotropy());
      texture.needsUpdate = true;
    }
  }, [albedo, normalMap, aoMap, roughnessMap, gl]);

  const { geometry, material } = useMemo(() => {
    const fields = buildSpotlightFields(albums);
    const spotGeometry = createInstancedQuads(
      fields.centers,
      fields.scales,
      fields.strengths,
      fields.count,
    );
    const spotMaterial = new THREE.ShaderMaterial({
      vertexShader: SPOT_VERTEX,
      fragmentShader: SPOT_FRAGMENT,
      uniforms: {
        uWarm: { value: new THREE.Color('#FFF5E3') },
        uIntensity: { value: 0.85 },
        uPoolAlpha: { value: 0.6 },
      },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    });
    return { geometry: spotGeometry, material: spotMaterial };
  }, [albums]);

  useEffect(() => {
    return () => {
      geometry.dispose();
      material.dispose();
    };
  }, [geometry, material]);

  useFrame(() => {
    const wall = wallRef.current;
    if (!wall) return;

    const cameraZ = Math.max(0.25, camera.position.z);
    const fovRad =
      ((camera as THREE.PerspectiveCamera).fov
        ? ((camera as THREE.PerspectiveCamera).fov * Math.PI) / 180
        : CAMERA_FOV_RAD);
    const visibleHeight = 2 * cameraZ * Math.tan(fovRad / 2);
    const visibleWidth = visibleHeight * (size.width / Math.max(1, size.height));
    const width = visibleWidth * 2.4 + 60;
    const height = visibleHeight * 2.4 + 60;

    wall.position.set(camera.position.x, camera.position.y, 0);
    wall.scale.set(width, height, 1);

    const repeatX = width / WALL_TILE_WORLD;
    const repeatY = height / WALL_TILE_WORLD;
    const offsetX = (camera.position.x - width / 2) / WALL_TILE_WORLD;
    const offsetY = (camera.position.y - height / 2) / WALL_TILE_WORLD;
    for (const texture of [albedo, normalMap, aoMap, roughnessMap]) {
      texture.repeat.set(repeatX, repeatY);
      texture.offset.set(offsetX, offsetY);
    }

    const tokens = readMoodTokens(useWallStore.getState(), performance.now());
    material.uniforms.uIntensity.value = tokens.spotIntensity;
    material.uniforms.uPoolAlpha.value = tokens.poolAlpha;

    if (materialRef.current) materialRef.current.color.set(tokens.wallTint);
    if (ambientRef.current) ambientRef.current.intensity = 0.25 + tokens.ambientLevel * 1.35;
    if (directorRef.current) directorRef.current.intensity = 0.15 + tokens.spotIntensity * 0.5;
  });

  return (
    <group>
      <ambientLight ref={ambientRef} color="#fff7ea" intensity={1} />
      <directionalLight ref={directorRef} position={[0.4, 1.2, 1.4]} color="#fff5e3" intensity={0.6} />
      <mesh ref={wallRef} geometry={wallGeometry} position={[0, 0, 0]} renderOrder={-2} frustumCulled={false}>
        <meshStandardMaterial
          ref={materialRef}
          map={albedo}
          normalMap={normalMap}
          aoMap={aoMap}
          aoMapIntensity={0.75}
          roughnessMap={roughnessMap}
          normalScale={new THREE.Vector2(1.15, 1.15)}
          color="#2d2c29"
          roughness={0.92}
          metalness={0}
        />
      </mesh>
      <mesh
        geometry={geometry}
        material={material}
        frustumCulled={false}
        renderOrder={-1}
        position={[0, 0, 0]}
      />
    </group>
  );
}
