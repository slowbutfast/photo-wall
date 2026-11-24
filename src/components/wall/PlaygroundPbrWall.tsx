'use client';

/**
 * Single-pass verbatim playground WebGL2 PBR plaster wall.
 *
 * The fragment shader is extracted from `playgrounds/photo_wall_playground.html`
 * (`dcc7a048`, `L1527-L1596`): `N·L * cone / r² + roughness specular` summed
 * over visible fixtures, then **one** nonlinear filmic curve
 * `color / (color + 0.88) * 1.34`. Additive multi-pass chunking would apply
 * that curve more than once and break the look, so all culled spots (`<= 128`)
 * are read from one row-major `RGBA32F` data texture.
 *
 * Rendering is idle-stopped: `render()` only marks the frame dirty and schedules
 * a single rAF; the loop paints once and parks until the next camera, viewport,
 * mood, or manifest change.
 */

import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';

import { withBase } from '@/lib/basePath';
import type { CameraState } from '@/lib/camera/cameraMath';
import type { PlaygroundFixture } from '@/lib/lighting/playgroundLighting';
import {
  LIGHT_CFG,
  MAX_SPOTS,
  WALL_SHADER_CFG,
  packFixtureDataTexture,
  toPlaygroundYDown,
} from '@/lib/lighting/playgroundLighting';
import type { PlaygroundTheme } from '@/lib/lighting/playgroundTheme';

const MAX_RENDER_PIXELS = 4096;
const WALL_TEXTURES = {
  albedo: withBase('/textures/wall/wall_albedo.webp'),
  normal: withBase('/textures/wall/wall_normal.webp'),
  ao: withBase('/textures/wall/wall_ao.webp'),
  roughness: withBase('/textures/wall/wall_roughness.webp'),
} as const;

export interface WallRenderViewport {
  width: number;
  height: number;
  dpr: number;
}

export interface PlaygroundPbrWallHandle {
  /** Mark a frame dirty for this camera/viewport/spots/theme. */
  render: (
    camera: CameraState,
    viewport: WallRenderViewport,
    spots: readonly PlaygroundFixture[],
    theme: PlaygroundTheme,
  ) => void;
}

const VERTEX_SHADER = `#version 300 es
in vec2 aPos;
void main() {
  gl_Position = vec4(aPos, 0.0, 1.0);
}
`;

const FRAGMENT_SHADER = `#version 300 es
precision highp float;
out vec4 fragColor;

uniform sampler2D uAlbedo;
uniform sampler2D uNormal;
uniform sampler2D uAO;
uniform sampler2D uRoughness;
uniform sampler2D uSpotTexture;

uniform vec2 uRes;
uniform float uDpr;
uniform vec2 uCamPos;
uniform float uCamScale;
uniform float uPxPerUnit;
uniform float uTileSize;
uniform float uNormalStrength;
uniform float uAoStrength;
uniform float uSpotIntensity;
uniform float uAmbientLevel;
uniform vec3 uWallTint;

uniform float uCosInner;
uniform float uCosOuter;
uniform int uSpotCount;

void main() {
  vec2 screenOffset = vec2(gl_FragCoord.x - uRes.x * 0.5, (uRes.y - gl_FragCoord.y) - uRes.y * 0.5);
  vec2 worldPos = uCamPos + screenOffset / max(0.05, uPxPerUnit * uDpr);  vec2 uv = worldPos / max(0.8, uTileSize);

  vec3 albedo = texture(uAlbedo, uv).rgb * uWallTint;
  vec3 nTex = texture(uNormal, uv).xyz * 2.0 - 1.0;
  vec3 N = normalize(vec3(nTex.x * uNormalStrength, -nTex.y * uNormalStrength, max(0.15, nTex.z)));
  float ao = mix(1.0, texture(uAO, uv).r, uAoStrength);
  float rough = clamp(texture(uRoughness, uv).r, 0.18, 1.0);

  vec3 fragPos = vec3(worldPos, 0.0);
  vec3 viewPos = vec3(uCamPos, 11.5 / max(0.18, uCamScale));
  vec3 V = normalize(viewPos - fragPos);

  // Low-key chiaroscuro ambient
  vec3 color = albedo * uAmbientLevel * ao;
  vec3 warmLamp = vec3(1.0, 0.96, 0.89);

  for (int i = 0; i < 256; i++) {
    if (i >= uSpotCount) break;
    vec4 spotPos = texelFetch(uSpotTexture, ivec2(i, 0), 0);
    vec4 spotAxis = texelFetch(uSpotTexture, ivec2(i, 1), 0);

    float ex = max(1.0, spotAxis.w);
    vec3 L = spotPos.xyz - fragPos;
    L.x /= ex;
    float r = length(L);
    L /= max(r, 0.001);

    float cone = smoothstep(uCosOuter, uCosInner, dot(-L, spotAxis.xyz));
    if (cone <= 0.001) continue;

    // Normalized physical inverse-square irradiance matching frame/placard model 1:1
    float atten = (cone / (r * r)) * spotPos.w;
    float NdotL = max(dot(N, L), 0.0);

    // Roughness-modulated micro-specular on plaster peaks
    vec3 H = normalize(L + V);
    float shininess = mix(84.0, 8.0, rough * rough);
    float spec = pow(max(dot(N, H), 0.0), shininess) * (1.0 - rough * 0.72) * 0.36;

    vec3 radiance = warmLamp * uSpotIntensity * atten * 1.38;
    color += (albedo * NdotL + vec3(spec)) * radiance * mix(1.0, ao, 0.74);
  }

  // Soft-knee filmic curve so stucco highlights stay crisp
  color = color / (color + vec3(0.88)) * 1.34;
  fragColor = vec4(color, 1.0);
}
`;

interface WallGl {
  gl: WebGL2RenderingContext;
  program: WebGLProgram;
  buffer: WebGLBuffer;
  textures: Record<'albedo' | 'normal' | 'ao' | 'roughness', WebGLTexture | null>;
  spotTexture: WebGLTexture;
  uniforms: Record<string, WebGLUniformLocation | null>;
}

const UNIFORM_NAMES = [
  'uAlbedo',
  'uNormal',
  'uAO',
  'uRoughness',
  'uSpotTexture',
  'uRes',
  'uDpr',
  'uCamPos',
  'uCamScale',
  'uPxPerUnit',
  'uTileSize',
  'uNormalStrength',
  'uAoStrength',
  'uSpotIntensity',
  'uAmbientLevel',
  'uWallTint',
  'uCosInner',
  'uCosOuter',
  'uSpotCount',
] as const;

function compile(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader | null {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.error('PBR wall shader error:', gl.getShaderInfoLog(shader));
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

function createSolidTexture(
  gl: WebGL2RenderingContext,
  rgba: readonly [number, number, number, number],
): WebGLTexture {
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
    new Uint8Array(rgba),
  );
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
  return texture;
}

async function loadTexture(
  gl: WebGL2RenderingContext,
  url: string,
): Promise<WebGLTexture | null> {
  const image = new Image();
  image.decoding = 'async';
  image.src = url;
  try {
    await image.decode();
  } catch {
    return null;
  }

  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 0);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, image);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
  gl.generateMipmap(gl.TEXTURE_2D);

  const aniso = gl.getExtension('EXT_texture_filter_anisotropic');
  if (aniso) {
    const maxAniso = Math.min(
      8,
      gl.getParameter(aniso.MAX_TEXTURE_MAX_ANISOTROPY_EXT) as number,
    );
    if (maxAniso > 1) {
      gl.texParameterf(gl.TEXTURE_2D, aniso.TEXTURE_MAX_ANISOTROPY_EXT, maxAniso);
    }
  }
  return texture;
}

function createSpotTexture(gl: WebGL2RenderingContext): WebGLTexture {
  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texImage2D(
    gl.TEXTURE_2D,
    0,
    gl.RGBA32F,
    1,
    2,
    0,
    gl.RGBA,
    gl.FLOAT,
    new Float32Array(8),
  );
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return texture;
}

interface FrameState {
  camera: CameraState;
  viewport: WallRenderViewport;
  spots: readonly PlaygroundFixture[];
  theme: PlaygroundTheme;
}

const PlaygroundPbrWall = forwardRef<PlaygroundPbrWallHandle>(function PlaygroundPbrWall(
  _props,
  ref,
) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef<WallGl | null>(null);
  const frameRef = useRef<FrameState | null>(null);
  const dirtyRef = useRef(false);
  const rafRef = useRef(0);
  const disposedRef = useRef(false);

  function paint() {
    const state = stateRef.current;
    const canvas = canvasRef.current;
    const frame = frameRef.current;
    if (!state || !canvas || !frame) return;

    const { gl, program, uniforms, spotTexture } = state;
    const { camera, viewport, spots, theme } = frame;
    const dpr = Math.min(2, Math.max(1, viewport.dpr || 1));
    const pixelWidth = Math.min(
      MAX_RENDER_PIXELS,
      Math.max(1, Math.round(viewport.width * dpr)),
    );
    const pixelHeight = Math.min(
      MAX_RENDER_PIXELS,
      Math.max(1, Math.round(viewport.height * dpr)),
    );
    if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
      canvas.width = pixelWidth;
      canvas.height = pixelHeight;
    }
    gl.viewport(0, 0, pixelWidth, pixelHeight);

    // Row 0 = pos + 1/peak, Row 1 = axis (see packFixtureDataTexture).
    const count = Math.min(MAX_SPOTS, spots.length);
    const visible = spots.slice(0, count).map(toPlaygroundYDown);
    const packed = packFixtureDataTexture(visible);
    const width = Math.max(1, count);
    gl.activeTexture(gl.TEXTURE4);
    gl.bindTexture(gl.TEXTURE_2D, spotTexture);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA32F,
      width,
      2,
      0,
      gl.RGBA,
      gl.FLOAT,
      packed.length === width * 8 ? packed : new Float32Array(width * 8),
    );

    gl.useProgram(program);
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

    const scale = Math.max(1e-6, cameraCssScale(camera, viewport));
    // CSS pixels per world unit (`100px = 1u`, then the camera scale).
    const pxPerUnit = scale * 100;

    set2f('uRes', pixelWidth, pixelHeight);
    set1f('uDpr', dpr);
    set2f('uCamPos', camera.x, -camera.y);
    set1f('uCamScale', scale);
    set1f('uPxPerUnit', pxPerUnit);
    set1f('uTileSize', WALL_SHADER_CFG.tileUnits);
    set1f('uNormalStrength', WALL_SHADER_CFG.normalStrength);
    set1f('uAoStrength', WALL_SHADER_CFG.aoStrength);
    set1f('uSpotIntensity', 0.78);
    set1f('uAmbientLevel', theme.ambientLevel);
    set3f('uWallTint', theme.tint[0], theme.tint[1], theme.tint[2]);
    set1f('uCosInner', Math.cos((LIGHT_CFG.innerDeg * Math.PI) / 180));
    set1f('uCosOuter', Math.cos((LIGHT_CFG.outerDeg * Math.PI) / 180));
    gl.uniform1i(uniforms.uSpotCount ?? null, count);

    const bind = (name: string, unit: number, texture: WebGLTexture | null) => {
      const location = uniforms[name];
      if (location) gl.uniform1i(location, unit);
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D, texture ?? state.textures.albedo);
    };
    bind('uAlbedo', 0, state.textures.albedo);
    bind('uNormal', 1, state.textures.normal);
    bind('uAO', 2, state.textures.ao);
    bind('uRoughness', 3, state.textures.roughness);
    bind('uSpotTexture', 4, spotTexture);

    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  function schedule() {
    if (rafRef.current !== 0 || disposedRef.current) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = 0;
      if (!dirtyRef.current) return;
      dirtyRef.current = false;
      paint();
    });
  }

  useImperativeHandle(ref, () => ({
    render: (camera, viewport, spots, theme) => {
      frameRef.current = {
        camera: { x: camera.x, y: camera.y, z: camera.z },
        viewport: {
          width: Math.max(1, viewport.width),
          height: Math.max(1, viewport.height),
          dpr: viewport.dpr,
        },
        spots,
        theme,
      };
      dirtyRef.current = true;
      schedule();
    },
  }));

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    // React StrictMode runs the effect twice in development: a previous
    // cleanup must not leave the scheduler permanently parked.
    disposedRef.current = false;
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
    const attribute = gl.getAttribLocation(program, 'aPos');
    gl.enableVertexAttribArray(attribute);
    gl.vertexAttribPointer(attribute, 2, gl.FLOAT, false, 0, 0);

    const uniforms: Record<string, WebGLUniformLocation | null> = {};
    for (const name of UNIFORM_NAMES) uniforms[name] = gl.getUniformLocation(program, name);
    gl.useProgram(program);
    gl.uniform1i(uniforms.uAlbedo ?? null, 0);
    gl.uniform1i(uniforms.uNormal ?? null, 1);
    gl.uniform1i(uniforms.uAO ?? null, 2);
    gl.uniform1i(uniforms.uRoughness ?? null, 3);
    gl.uniform1i(uniforms.uSpotTexture ?? null, 4);

    const state: WallGl = {
      gl,
      program,
      buffer,
      textures: {
        albedo: createSolidTexture(gl, [180, 176, 170, 255]),
        normal: createSolidTexture(gl, [128, 128, 255, 255]),
        ao: createSolidTexture(gl, [255, 255, 255, 255]),
        roughness: createSolidTexture(gl, [210, 210, 210, 255]),
      },
      spotTexture: createSpotTexture(gl),
      uniforms,
    };
    stateRef.current = state;

    let cancelled = false;
    void (async () => {
      const entries = await Promise.all(
        (Object.keys(WALL_TEXTURES) as Array<keyof typeof WALL_TEXTURES>).map(async (key) => {
          const texture = await loadTexture(gl, WALL_TEXTURES[key]);
          return [key, texture] as const;
        }),
      );
      if (cancelled || disposedRef.current) {
        for (const [, texture] of entries) if (texture) gl.deleteTexture(texture);
        return;
      }
      for (const [key, texture] of entries) {
        if (texture) {
          const previous = state.textures[key];
          if (previous) gl.deleteTexture(previous);
          state.textures[key] = texture;
        }
      }
      dirtyRef.current = true;
      schedule();
    })();

    return () => {
      cancelled = true;
      disposedRef.current = true;
      if (rafRef.current !== 0) cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
      for (const texture of Object.values(state.textures)) {
        if (texture) gl.deleteTexture(texture);
      }
      gl.deleteTexture(state.spotTexture);
      gl.deleteBuffer(state.buffer);
      gl.deleteProgram(state.program);
      stateRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <canvas ref={canvasRef} className="pbr-wall-canvas" aria-hidden="true" />;
});

/** `cameraToCssScale` without importing the whole camera module into the shader path. */
function cameraCssScale(camera: CameraState, viewport: WallRenderViewport): number {
  const tanHalf = Math.tan((38 * Math.PI) / 360);
  return (
    Math.max(1, viewport.height) /
    (2 * Math.max(1e-6, camera.z) * tanHalf * 100)
  );
}

export default PlaygroundPbrWall;
