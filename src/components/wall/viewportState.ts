/**
 * Mutable viewport/camera snapshot shared by the WebGL scene and the DOM
 * soundtrack overlay. Written by `CameraRig` every frame, read by the overlay's
 * `requestAnimationFrame` loop so the iframe can stay glued to its plaque
 * without React re-renders.
 */

export interface ViewportCamera {
  x: number;
  y: number;
  z: number;
}

export interface GalleryViewportSnapshot {
  camera: ViewportCamera;
  width: number;
  height: number;
  bottomInsetPx: number;
}

export const galleryViewport: GalleryViewportSnapshot = {
  camera: { x: 0, y: 0, z: 40 },
  width: 1,
  height: 1,
  bottomInsetPx: 0,
};

/** Pointer position in normalized device coordinates (-1..1), for glass tilt. */
export const galleryPointer = { x: 0, y: 0 };
