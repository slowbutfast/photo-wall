'use client';

/**
 * Continuous borderless PBR plaster wall plus instanced per-fixture additive
 * spotlight quads.
 *
 * Pass 1 of the hybrid renderer: the wall itself (albedo + normal + AO +
 * roughness maps at `z = 0`) and one additive warm light pool per overhead
 * track head from the shared `buildWorldFixtures` model. There is no global
 * light-count cap, so 50+ albums stay illuminated in a single instanced draw
 * call, and the wall pools use the same fixture positions/angles that drive the
 * object shading.
 */

import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useLoader, useThree } from '@react-three/fiber';
import * as THREE from 'three';

import type { WallAlbum } from '@/lib/layout/types';
import {
  buildWorldFixtures,
  LIGHT_CFG,
  type WorldFixture,
} from '@/lib/lighting/fixtures';
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

function buildSpotlightFields(fixtures: WorldFixture[]): SpotlightFields {
  const count = fixtures.length;
  const centers = new Float32Array(count * 3);
  const scales = new Float32Array(count * 2);
  const strengths = new Float32Array(count);

  const tanOuter = Math.tan((LIGHT_CFG.outerDeg * Math.PI) / 180);
  let maxInvPeak = 0;
  for (const fixture of fixtures) {
    maxInvPeak = Math.max(maxInvPeak, fixture.invPeak);
  }
  const normaliser = maxInvPeak > 0 ? maxInvPeak : 1;

  fixtures.forEach((fixture, index) => {
    // The cone's wall-plane radius is the fixture throw distance times the
    // outer half-angle, so the pool is derived from the same geometry as the
    // object shading instead of a per-album oval heuristic.
    const radius = Math.max(0.4, fixture.pos[2] * tanOuter);
    centers[index * 3] = fixture.hot[0];
    centers[index * 3 + 1] = fixture.hot[1];
    centers[index * 3 + 2] = 0.02;
    scales[index * 2] = radius * 2;
    scales[index * 2 + 1] = radius * 2;
    // Relative `1 / peakIrradiance`, normalised so the brightest album stays
    // at full strength and dimmer albums stay proportional.
    strengths[index] = Math.min(1, fixture.invPeak / normaliser);
  });

  return { centers, scales, strengths, count };
}

/** Light position whose rays travel along the fixtures' averaged cone axis. */
function averageLightPosition(fixtures: WorldFixture[]): [number, number, number] {
  if (fixtures.length === 0) return [0, 1, 1.4];
  let x = 0;
  let y = 0;
  let z = 0;
  for (const fixture of fixtures) {
    x += fixture.axis[0];
    y += fixture.axis[1];
    z += fixture.axis[2];
  }
  const length = Math.hypot(x, y, z) || 1;
  return [-x / length, -y / length, -z / length];
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
    vec2 p = vUv - vec2(0.5);
    float d = length(p);
    float pool = 1.0 - smoothstep(0.05, 0.54, d);
    float alpha = pool * uPoolAlpha * vStrength;
    if (alpha < 0.003) discard;
    vec3 color = uWarm * uIntensity;
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

  const { geometry, material, lightPosition } = useMemo(() => {
    const worldFixtures = buildWorldFixtures(albums);
    const fields = buildSpotlightFields(worldFixtures.fixtures);
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
        uWarm: { value: new THREE.Color(LIGHT_CFG.warm) },
        uIntensity: { value: 0.85 },
        uPoolAlpha: { value: 0.6 },
      },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    });
    return {
      geometry: spotGeometry,
      material: spotMaterial,
      lightPosition: averageLightPosition(worldFixtures.fixtures),
    };
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
      <directionalLight
        ref={directorRef}
        position={lightPosition}
        color={LIGHT_CFG.warm}
        intensity={0.6}
      />
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
          depthWrite={false}
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
