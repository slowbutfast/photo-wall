'use client';

/**
 * Matte-black soundtrack plaque (`2.14u x 2.00u`, `z = 0.14`) mounted `0.12u`
 * directly beneath the glass placard, showing a CORS-proxied resting YouTube
 * thumbnail through the shared `TexturePool`.
 *
 * Clicking in `album` viewMode mounts the single `matrix3d` DOM `YT.Player`
 * overlay (see `SoundtrackOverlay`). Clicking from overview first flies into the
 * album, matching the gallery's spatial navigation grammar.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';

import { computeAlbumGrid } from '@/lib/layout/islandLayout';
import type { WallAlbum } from '@/lib/layout/types';
import { useWallStore } from '@/store/useWallStore';

import { requestSharedTexture, releaseSharedTexture } from './textureRuntime';

export interface SoundtrackPlaqueProps {
  album: WallAlbum;
}

const PLAQUE_VERTEX = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const PLAQUE_FRAGMENT = /* glsl */ `
  precision highp float;
  uniform sampler2D uMap;
  uniform float uHasMap;
  uniform float uVFlip;
  varying vec2 vUv;
  void main() {
    vec2 uv = vec2(vUv.x, uVFlip > 0.5 ? 1.0 - vUv.y : vUv.y);
    vec3 mapped = vec3(0.0);
    if (uHasMap > 0.5) mapped = texture2D(uMap, uv).rgb;

    // Charcoal gradient + warm play glyph when no resting thumbnail is available.
    float gradient = mix(0.55, 1.0, vUv.y);
    vec3 fallback = vec3(0.020, 0.019, 0.017) * gradient;
    float rim = smoothstep(0.022, 0.0, min(min(vUv.x, 1.0 - vUv.x), min(vUv.y, 1.0 - vUv.y)));
    fallback += vec3(0.030, 0.026, 0.020) * rim;

    vec2 q = vUv - vec2(0.48, 0.5);
    q.x /= 0.072;
    q.y /= 0.088;
    float insideX = step(-1.0, q.x) * step(q.x, 1.0);
    float insideY = step(abs(q.y), 1.0 - q.x);
    float triangle = insideX * insideY;
    float glow = smoothstep(1.5, 0.35, length(q)) * 0.07;
    fallback += vec3(0.10, 0.075, 0.040) * glow;
    fallback = mix(fallback, vec3(0.78, 0.58, 0.32), triangle * 0.82);

    vec3 color = mix(fallback, mapped, step(0.5, uHasMap));
    gl_FragColor = vec4(pow(max(color, 0.0), vec3(1.0 / 2.2)), 1.0);
  }
`;

export default function SoundtrackPlaque({ album }: SoundtrackPlaqueProps) {
  const soundtrack = album.soundtrack;
  const [texture, setTexture] = useState<THREE.Texture | null>(null);
  const materialRef = useRef<THREE.ShaderMaterial>(null);

  const rect = useMemo(() => {
    if (!soundtrack) return null;
    const grid = computeAlbumGrid(
      album.photos.length,
      album.gridColumns,
      album.soundtrack !== null,
    );
    if (!grid.soundtrack) return null;
    return {
      x: album.position.x + grid.soundtrack.x,
      y: album.position.y + grid.soundtrack.y,
      width: grid.soundtrack.width,
      height: grid.soundtrack.height,
    };
  }, [album, soundtrack]);

  useEffect(() => {
    if (!soundtrack) return;
    let alive = true;
    const id = `youtube-thumb-${album.id}-${soundtrack.videoId}`;
    requestSharedTexture(id, `/api/youtube/thumb/${soundtrack.videoId}`, 'visible-thumb').then(
      (loaded) => {
        if (alive && loaded) setTexture(loaded);
      },
    );
    return () => {
      alive = false;
      releaseSharedTexture(id);
    };
  }, [album.id, soundtrack]);

  useEffect(() => {
    const material = materialRef.current;
    if (!material) return;
    material.uniforms.uMap.value = texture;
    material.uniforms.uHasMap.value = texture ? 1 : 0;
    material.uniforms.uVFlip.value = texture?.userData?.vFlip ? 1 : 0;
    material.needsUpdate = true;
  }, [texture]);

  if (!rect || !soundtrack) return null;

  const handleClick = (event: { stopPropagation: () => void }) => {
    event.stopPropagation();
    const state = useWallStore.getState();
    if (state.viewMode === 'album' && state.focusedAlbumId === album.id) {
      state.dispatchOverlay({ type: 'select-album', albumId: album.id });
      state.dispatchOverlay({ type: 'play' });
    } else {
      state.enterAlbum(album.id);
    }
  };

  return (
    <mesh
      position={[rect.x, rect.y, 0.14]}
      renderOrder={1}
      onClick={handleClick}
      onPointerOver={() => {
        if (typeof document !== 'undefined') document.body.style.cursor = 'pointer';
      }}
      onPointerOut={() => {
        if (typeof document !== 'undefined') document.body.style.cursor = '';
      }}
    >
      <planeGeometry args={[rect.width, rect.height]} />
      <shaderMaterial
        ref={materialRef}
        vertexShader={PLAQUE_VERTEX}
        fragmentShader={PLAQUE_FRAGMENT}
        uniforms={{
          uMap: { value: null },
          uHasMap: { value: 0 },
          uVFlip: { value: 0 },
        }}
        toneMapped={false}
      />
    </mesh>
  );
}
