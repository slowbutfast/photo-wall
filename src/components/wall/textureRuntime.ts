'use client';

/**
 * Shared `TexturePool` instance for the single gallery canvas.
 *
 * Visible prints and CORS-proxied YouTube resting thumbnails draw from the same
 * priority-ordered byte budget. Decoding uses `createImageBitmap(...)` with
 * `imageOrientation: 'from-image'` and a shader-side V flip.
 */

import * as THREE from 'three';

import { TexturePool, type TexturePriority } from './TexturePool';

let sharedPool: TexturePool | null = null;
let viewportWidth = 1920;
const inflight = new Map<string, Promise<THREE.Texture | null>>();

export function createSharedTexturePool(
  renderer: { initTexture: (texture: { dispose: () => void }) => void },
  width: number = typeof window === 'undefined' ? 1920 : window.innerWidth,
): TexturePool {
  if (sharedPool) sharedPool.disposeAll();
  viewportWidth = width;
  sharedPool = new TexturePool({ renderer, viewportWidth });
  inflight.clear();
  return sharedPool;
}

export function getSharedTexturePool(): TexturePool | null {
  return sharedPool;
}

export function disposeSharedTexturePool(): void {
  sharedPool?.disposeAll();
  sharedPool = null;
  inflight.clear();
}

export function sharedPoolViewportWidth(): number {
  return viewportWidth;
}

/**
 * Fetch + decode a texture into the shared pool. Returns the `THREE.Texture`
 * once decoded, or `null` while in flight / when no pool exists yet.
 */
export function requestSharedTexture(
  id: string,
  url: string,
  priority: TexturePriority,
  colorSpace: THREE.ColorSpace = THREE.SRGBColorSpace,
): Promise<THREE.Texture | null> {
  const pool = sharedPool;
  if (!pool) return Promise.resolve(null);

  const existing = pool.get(id);
  if (existing) {
    pool.touch(id);
    return Promise.resolve(existing.texture as unknown as THREE.Texture);
  }

  const pending = inflight.get(id);
  if (pending) return pending;

  const promise = (async () => {
    try {
      const response = await fetch(url, { credentials: 'same-origin' });
      if (!response.ok) return null;
      const blob = await response.blob();

      let texture: THREE.Texture | null = null;
      let bitmap: { width: number; height: number; close: () => void } | null = null;
      let needsVFlip = false;

      try {
        const decoded = await createImageBitmap(blob, { imageOrientation: 'from-image' });
        texture = new THREE.Texture(decoded);
        // `ImageBitmap` ignores `texture.flipY`; the consuming shader flips V.
        texture.flipY = false;
        needsVFlip = true;
        bitmap = decoded;
      } catch {
        // `createImageBitmap` cannot decode SVG in some browsers (including
        // headless Chrome). Fall back to an HTMLImageElement, which also covers
        // the `?demo=2000` inline-SVG manifest.
        const image = new Image();
        image.crossOrigin = 'anonymous';
        image.src = url;
        await image.decode();
        texture = new THREE.Texture(image);
        texture.flipY = true;
        needsVFlip = false;
        bitmap = {
          width: image.naturalWidth || image.width,
          height: image.naturalHeight || image.height,
          close: () => undefined,
        };
      }

      if (!texture || !bitmap) return null;
      texture.userData.vFlip = needsVFlip;
      texture.colorSpace = colorSpace;
      texture.minFilter = THREE.LinearFilter;
      texture.magFilter = THREE.LinearFilter;
      texture.generateMipmaps = false;
      texture.needsUpdate = true;

      // The pool may have been replaced while decoding.
      if (sharedPool !== pool) {
        texture.dispose();
        bitmap.close();
        return null;
      }

      pool.add({
        id,
        bitmap,
        texture: texture as unknown as { dispose: () => void },
        priority,
        upload: true,
      });
      return texture;
    } catch {
      return null;
    } finally {
      inflight.delete(id);
    }
  })();

  inflight.set(id, promise);
  return promise;
}

export function releaseSharedTexture(id: string): void {
  sharedPool?.release(id);
}
