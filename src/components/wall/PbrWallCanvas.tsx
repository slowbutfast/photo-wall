'use client';

/**
 * Continuous PBR plaster wall, rendered as one full-viewport WebGL2 draw call.
 *
 * - Loads `wall_{albedo,normal,ao,roughness}.webp` once and desaturates the
 *   albedo to neutral plaster so the mood tint plus the warm `3500K` light pools
 *   supply every bit of colour (no khaki muddiness).
 * - Samples the GPU-baked wall-space lightmap (`bakeLightmapOnGpu`) for
 *   irradiance and the dominant light direction; outside the baked bounds the
 *   wall falls back to pure ambient with no wrap or smearing.
 * - Attenuates normal-map relief at macro zoom so the overview does not look
 *   blotchy, and applies the playground's exposure curve.
 * - Is driven imperatively (`render(camera, viewport)`) from `GalleryViewport`
 *   in the same `requestAnimationFrame` tick as the `.world` transform, so the
 *   wall and the DOM islands can never drift apart.
 *
 * All GPU resources are created on mount and disposed on unmount.
 */

import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';

import { CAMERA_FOV_DEG, type CameraState } from '@/lib/camera/cameraMath';
import type { WallAlbum } from '@/lib/layout/types';
import {
  LIGHTMAP_AMBIENT_RATIO,
  bakeLightmapOnGpu,
  type GpuLightmapTexture,
} from '@/lib/lighting/lightmap';
import { LIGHT_CFG } from '@/lib/lighting/fixtures';
import { readMoodTokens, useWallStore } from '@/store/useWallStore';

/** Plaster tile size in world units (matches the playground's `tileScale`). */
const WALL_TILE_UNITS = 5.2;
const MAX_RENDER_PIXELS = 4096;

export interface WallRenderViewport {
  width: number;
  height: number;
  dpr: number;
}

export interface PbrWallCanvasHandle {
  /** Draw the wall for this camera/viewport. Safe to call every frame. */
  render: (camera: CameraState, viewport: WallRenderViewport) => void;
  /** Discard the baked lightmap and rebuild it for the current albums. */
  rebake: () => void;
}

export interface PbrWallCanvasProps {
  albums: readonly WallAlbum[];
}

const VERTEX_SHADER = `#version 300 es
in vec2 aPosition;
void main() {
  gl_Position = vec4(aPosition, 0.0, 1.0);
}
`;

const FRAGMENT_SHADER = `#version 300 es
precision highp float;

uniform vec2 uResolution;
uniform float uDpr;
uniform vec2 uCam;
uniform float uCssPerWorldUnit;
uniform vec3 uWallTint;
uniform vec3 uWarm;
uniform float uAmbient;
uniform float uSpotIntensity;
uniform float uNormalStrength;
uniform float uExposure;
uniform float uTileUnits;
uniform float uHasLightmap;
uniform float uLightmapFloor;
uniform vec2 uLightmapOrigin;
uniform vec2 uLightmapWorldSize;

uniform sampler2D uAlbedo;
uniform sampler2D uNormal;
uniform sampler2D uAo;
uniform sampler2D uRoughness;
uniform sampler2D uLightmap;

out vec4 fragColor;

float luminance(vec3 color) {
  return dot(color, vec3(0.299, 0.587, 0.114));
}

void main() {
  // Screen pixel -> world units (y up in both spaces).
  vec2 screen = gl_FragCoord.xy / uDpr;
  vec2 world = uCam + (screen - uResolution / uDpr * 0.5) / uCssPerWorldUnit;

  vec2 tileUv = world / uTileUnits;

  vec3 albedo = texture(uAlbedo, tileUv).rgb;
  // Desaturate to neutral plaster: mood + warm lights own all the colour.
  albedo = mix(albedo, vec3(luminance(albedo)), 0.92);

  vec3 nmap = texture(uNormal, tileUv).xyz * 2.0 - 1.0;
  nmap.xy *= uNormalStrength;
  vec3 normal = normalize(vec3(nmap.xy, max(0.05, nmap.z)));
  float ao = texture(uAo, tileUv).r;
  float roughness = texture(uRoughness, tileUv).r;

  // Baked lightmap: normalized irradiance in R, unit direction in GB.
  float irradiance = 0.0;
  vec3 lightDir = vec3(0.0, 0.0, 1.0);
  if (uHasLightmap > 0.5) {
    vec2 lmUv = (world - uLightmapOrigin) / uLightmapWorldSize;
    if (lmUv.x >= 0.0 && lmUv.x <= 1.0 && lmUv.y >= 0.0 && lmUv.y <= 1.0) {
      vec4 lm = texture(uLightmap, lmUv);
      irradiance = lm.r;
      vec2 planar = lm.gb * 2.0 - 1.0;
      lightDir = vec3(planar, sqrt(max(0.0, 1.0 - dot(planar, planar))));
    }
  }

  // Grazing relief from the wall normal against the baked light direction.
  // The direction is quantized at 8 texels/unit; blending toward straight-up
  // keeps macro zoom from showing those texel steps as diagonal banding.
  float ndotl = clamp(dot(normal, normalize(mix(vec3(0.0, 0.0, 1.0), lightDir, 0.55))), 0.0, 1.0);
  float relief = mix(1.0, 0.82 + 0.18 * ndotl, uNormalStrength);
  // Soft sheen from the roughness map, driven by the same direction.
  float sheen = (1.0 - roughness) * pow(ndotl, 3.0) * 0.12;

  // The R channel already carries the baked inter-cluster ambient floor
  // (35-45% of pool peak, asserted in lightmap.test.ts). Subtract it so wall
  // space outside the baked bounds (irradiance 0) matches the gaps inside
  // them: the AABB edge then never shows as a rectangle, just ambient plaster.
  float pool = 0.0;
  if (uHasLightmap > 0.5) {
    pool = clamp((irradiance - uLightmapFloor) / max(1e-4, 1.0 - uLightmapFloor), 0.0, 1.0);
  }

  float ambient = uAmbient;
  vec3 base = albedo * uWallTint;
  vec3 lit = uWarm * (pool * uSpotIntensity);
  vec3 color = base * (ambient + lit) * (0.55 + 0.45 * ao) * relief;
  color += uWarm * sheen * pool;

  color = pow(max(color, 0.0) * uExposure, vec3(1.0 / 2.2));
  fragColor = vec4(color, 1.0);
}
`;

interface WallGl {
  gl: WebGL2RenderingContext;
  program: WebGLProgram;
  buffer: WebGLBuffer;
  textures: Record<'albedo' | 'normal' | 'ao' | 'roughness', WebGLTexture | null>;
  blackTexture: WebGLTexture;
  uniforms: Record<string, WebGLUniformLocation | null>;
  lightmap: GpuLightmapTexture | null;
}

function compile(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader | null {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

function createProgram(gl: WebGL2RenderingContext): WebGLProgram | null {
  const vertex = compile(gl, gl.VERTEX_SHADER, VERTEX_SHADER);
  const fragment = compile(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER);
  if (!vertex || !fragment) {
    if (vertex) gl.deleteShader(vertex);
    if (fragment) gl.deleteShader(fragment);
    return null;
  }
  const program = gl.createProgram();
  if (!program) return null;
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  gl.deleteShader(vertex);
  gl.deleteShader(fragment);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    gl.deleteProgram(program);
    return null;
  }
  return program;
}

const WALL_TEXTURES = {
  albedo: '/textures/wall/wall_albedo.webp',
  normal: '/textures/wall/wall_normal.webp',
  ao: '/textures/wall/wall_ao.webp',
  roughness: '/textures/wall/wall_roughness.webp',
} as const;

async function loadTexture(
  gl: WebGL2RenderingContext,
  url: string,
): Promise<WebGLTexture | null> {
  const texture = gl.createTexture();
  if (!texture) return null;

  const image = new Image();
  image.decoding = 'async';
  image.src = url;
  try {
    await image.decode();
  } catch {
    gl.deleteTexture(texture);
    return null;
  }

  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 0);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, image);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
  gl.generateMipmap(gl.TEXTURE_2D);
  return texture;
}

function createBlackTexture(gl: WebGL2RenderingContext): WebGLTexture {
  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texImage2D(
    gl.TEXTURE_2D,
    0,
    gl.RGBA8,
    1,
    1,
    0,
    gl.RGBA,
    gl.UNSIGNED_BYTE,
    new Uint8Array([0, 0, 0, 255]),
  );
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return texture;
}

const UNIFORM_NAMES = [
  'uResolution',
  'uDpr',
  'uCam',
  'uCssPerWorldUnit',
  'uWallTint',
  'uWarm',
  'uAmbient',
  'uSpotIntensity',
  'uNormalStrength',
  'uExposure',
  'uTileUnits',
  'uHasLightmap',
  'uLightmapFloor',
  'uLightmapOrigin',
  'uLightmapWorldSize',
  'uAlbedo',
  'uNormal',
  'uAo',
  'uRoughness',
  'uLightmap',
] as const;

/** Albums identity that actually changes the bake (ids + soundtrack presence). */
function bakeSignature(albums: readonly WallAlbum[]): string {
  return albums
    .map(
      (album) =>
        `${album.id}:${album.photos.length}:${album.gridColumns}:${album.soundtrack ? 1 : 0}`,
    )
    .join('|');
}

export const PbrWallCanvas = forwardRef<PbrWallCanvasHandle, PbrWallCanvasProps>(
  function PbrWallCanvas({ albums }, ref) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const stateRef = useRef<WallGl | null>(null);
    const albumsRef = useRef<readonly WallAlbum[]>(albums);
    albumsRef.current = albums;

    const lastFrameRef = useRef<{ camera: CameraState; viewport: WallRenderViewport } | null>(
      null,
    );

    function paint() {
      const state = stateRef.current;
      const canvas = canvasRef.current;
      const frame = lastFrameRef.current;
      if (!state || !canvas || !frame) return;
      const { gl, program, uniforms, lightmap } = state;
      const { camera, viewport } = frame;

      const pixelWidth = Math.min(
        MAX_RENDER_PIXELS,
        Math.max(1, Math.round(viewport.width * viewport.dpr)),
      );
      const pixelHeight = Math.min(
        MAX_RENDER_PIXELS,
        Math.max(1, Math.round(viewport.height * viewport.dpr)),
      );
      if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
        canvas.width = pixelWidth;
        canvas.height = pixelHeight;
      }

      const tokens = readMoodTokens(useWallStore.getState(), performance.now());
      // CSS pixels covered by one world unit on the wall plane.
      const cssPerUnit =
        viewport.height / (2 * camera.z * Math.tan((CAMERA_FOV_DEG * Math.PI) / 360));

      // Macro zoom flattens normal relief so the overview reads as plaster,
      // not blotchy noise.
      const macro = Math.min(1, Math.max(0, (cssPerUnit / 100 - 0.1) / 0.5));
      const normalStrength = 0.22 + 0.78 * macro;

      gl.viewport(0, 0, pixelWidth, pixelHeight);
      gl.useProgram(program);

      // The vertex attribute state lives on the default VAO, which the
      // offscreen lightmap bake also touches; re-bind it every frame.
      const attribute = gl.getAttribLocation(program, 'aPosition');
      gl.bindBuffer(gl.ARRAY_BUFFER, state.buffer);
      gl.enableVertexAttribArray(attribute);
      gl.vertexAttribPointer(attribute, 2, gl.FLOAT, false, 0, 0);

      const set1f = (name: string, value: number) => {
        const location = uniforms[name];
        if (location) gl.uniform1f(location, value);
      };
      const set2f = (name: string, x: number, y: number) => {
        const location = uniforms[name];
        if (location) gl.uniform2f(location, x, y);
      };
      const set3f = (name: string, x: number, y: number, z: number) => {
        const location = uniforms[name];
        if (location) gl.uniform3f(location, x, y, z);
      };

      set2f('uResolution', viewport.width, viewport.height);
      set1f('uDpr', viewport.dpr);
      set2f('uCam', camera.x, camera.y);
      set1f('uCssPerWorldUnit', Math.max(1e-6, cssPerUnit));
      // Ambient stays low so the 3500K pools carry the image (playground
      // exposure curve): ~2-3x ambient at the pool centre after gamma.
      set1f('uAmbient', 0.04 + tokens.ambientLevel * 0.42);
      set1f('uSpotIntensity', 0.55 + tokens.spotIntensity * 1.5);
      set1f('uNormalStrength', normalStrength);
      set1f('uExposure', 1.05);
      set1f('uTileUnits', WALL_TILE_UNITS);
      set1f('uHasLightmap', lightmap ? 1 : 0);
      set1f('uLightmapFloor', LIGHTMAP_AMBIENT_RATIO);
      if (lightmap) {
        set2f('uLightmapOrigin', lightmap.grid.originX, lightmap.grid.originY);
        set2f('uLightmapWorldSize', lightmap.grid.worldWidth, lightmap.grid.worldHeight);
      }

      const tint = tokens.wallTint;
      set3f('uWallTint', ...hexToRgb(tint));
      set3f('uWarm', ...hexToRgb(LIGHT_CFG.warm));

      const bind = (name: string, unit: number, texture: WebGLTexture | null) => {
        const location = uniforms[name];
        if (location) gl.uniform1i(location, unit);
        gl.activeTexture(gl.TEXTURE0 + unit);
        gl.bindTexture(gl.TEXTURE_2D, texture ?? state.blackTexture);
      };
      bind('uAlbedo', 0, state.textures.albedo);
      bind('uNormal', 1, state.textures.normal);
      bind('uAo', 2, state.textures.ao);
      bind('uRoughness', 3, state.textures.roughness);
      bind('uLightmap', 4, lightmap?.texture ?? null);

      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }

    useImperativeHandle(ref, () => ({
      render: (camera, viewport) => {
        lastFrameRef.current = {
          camera: { x: camera.x, y: camera.y, z: camera.z },
          viewport: { width: viewport.width, height: viewport.height, dpr: viewport.dpr },
        };
        paint();
      },
      rebake: () => {
        const state = stateRef.current;
        if (!state) return;
        state.lightmap?.dispose();
        state.lightmap = bakeLightmapOnGpu(state.gl, albumsRef.current, {
          texelsPerUnit: 8,
          maxSize: 2048,
        });
        paint();
      },
    }));

    useEffect(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const gl = canvas.getContext('webgl2', {
        alpha: false,
        antialias: false,
        depth: false,
        stencil: false,
        premultipliedAlpha: false,
        powerPreference: 'high-performance',
      });
      if (!gl) return;

      const program = createProgram(gl);
      if (!program) return;

      const buffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
      const attribute = gl.getAttribLocation(program, 'aPosition');
      gl.enableVertexAttribArray(attribute);
      gl.vertexAttribPointer(attribute, 2, gl.FLOAT, false, 0, 0);

      const uniforms: Record<string, WebGLUniformLocation | null> = {};
      for (const name of UNIFORM_NAMES) uniforms[name] = gl.getUniformLocation(program, name);

      const state: WallGl = {
        gl,
        program,
        buffer,
        textures: { albedo: null, normal: null, ao: null, roughness: null },
        blackTexture: createBlackTexture(gl),
        uniforms,
        lightmap: null,
      };
      stateRef.current = state;

      let disposed = false;
      void (async () => {
        const entries = await Promise.all(
          (Object.keys(WALL_TEXTURES) as Array<keyof typeof WALL_TEXTURES>).map(async (key) => {
            const texture = await loadTexture(gl, WALL_TEXTURES[key]);
            return [key, texture] as const;
          }),
        );
        if (disposed) {
          for (const [, texture] of entries) if (texture) gl.deleteTexture(texture);
          return;
        }
        for (const [key, texture] of entries) state.textures[key] = texture;
        paint();
      })();

      state.lightmap = bakeLightmapOnGpu(gl, albumsRef.current, {
        texelsPerUnit: 8,
        maxSize: 2048,
      });
      paint();

      return () => {
        disposed = true;
        state.lightmap?.dispose();
        for (const texture of Object.values(state.textures)) {
          if (texture) gl.deleteTexture(texture);
        }
        gl.deleteTexture(state.blackTexture);
        gl.deleteBuffer(state.buffer);
        gl.deleteProgram(state.program);
        stateRef.current = null;
      };
    }, []);

    // A manifest change (publish/edit/delete) re-bakes the wall-space lightmap.
    useEffect(() => {
      const state = stateRef.current;
      if (!state) return;
      state.lightmap?.dispose();
      state.lightmap = bakeLightmapOnGpu(state.gl, albums, { texelsPerUnit: 8, maxSize: 2048 });
      paint();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [bakeSignature(albums)]);

    return <canvas ref={canvasRef} className="pbr-wall-canvas" aria-hidden="true" />;
  },
);

export default PbrWallCanvas;

/** `#RRGGBB` -> linear-ish `[r, g, b]` in the shader's 0..1 space. */
function hexToRgb(hex: string): [number, number, number] {
  const value = hex.replace('#', '');
  const normalised =
    value.length === 3
      ? value
          .split('')
          .map((char) => char + char)
          .join('')
      : value;
  const int = Number.parseInt(normalised, 16);
  if (!Number.isFinite(int)) return [1, 1, 1];
  return [((int >> 16) & 255) / 255, ((int >> 8) & 255) / 255, (int & 255) / 255];
}
