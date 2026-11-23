'use client';

/**
 * R3F canvas shell for the gallery wall.
 *
 * The canvas is mounted only on the client (`next/dynamic({ ssr: false })` from
 * `PhotoWallApp`) and composites the six renderer passes:
 * plaster wall + instanced spotlights, instanced cast shadows, instanced
 * mats/ThumbHash atlas, pooled textured prints, and batched glass placards.
 */

import { Suspense, useEffect } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import * as THREE from 'three';

import { CAMERA_FAR, CAMERA_FOV_DEG, CAMERA_NEAR } from '@/lib/camera/cameraMath';
import { useWallStore } from '@/store/useWallStore';

import CameraRig from './CameraRig';
import InfiniteWallShader from './InfiniteWallShader';
import SoundtrackPlaque from './SoundtrackPlaque';
import VisiblePrintPool from './VisiblePrintPool';
import WallInstancedLayer from './WallInstancedLayer';
import { createSharedTexturePool, disposeSharedTexturePool, getSharedTexturePool } from './textureRuntime';

function TexturePump() {
  useFrame(() => {
    getSharedTexturePool()?.uploadPending();
  });
  return null;
}

function WallScene() {
  const albums = useWallStore((state) => state.wall.albums);

  return (
    <>
      <TexturePump />
      <InfiniteWallShader albums={albums} />
      <WallInstancedLayer albums={albums} />
      <VisiblePrintPool albums={albums} />
      {albums.map((album) =>
        album.soundtrack ? <SoundtrackPlaque key={album.id} album={album} /> : null,
      )}
    </>
  );
}

export default function PhotoWallCanvas() {
  useEffect(() => {
    return () => {
      disposeSharedTexturePool();
    };
  }, []);

  return (
    <Canvas
      className="gallery-canvas"
      dpr={[1, 1.75]}
      gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
      camera={{
        fov: CAMERA_FOV_DEG,
        near: CAMERA_NEAR,
        far: CAMERA_FAR,
        position: [0, 0, 44],
      }}
      onCreated={({ gl, scene }) => {
        gl.toneMapping = THREE.ACESFilmicToneMapping;
        gl.toneMappingExposure = 1.05;
        gl.outputColorSpace = THREE.SRGBColorSpace;
        scene.matrixWorldAutoUpdate = true;
        createSharedTexturePool(
          {
            initTexture: (texture) => {
              gl.initTexture(texture as unknown as THREE.Texture);
            },
          },
          typeof window === 'undefined' ? 1920 : window.innerWidth,
        );
      }}
    >
      <Suspense fallback={null}>
        <WallScene />
      </Suspense>
      <CameraRig />
    </Canvas>
  );
}
