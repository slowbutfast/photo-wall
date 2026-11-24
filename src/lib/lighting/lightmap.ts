/**
 * GPU-baked wall-space lightmap.
 *
 * The wall is unbounded but a 50-album exhibition is static per manifest, so the
 * whole lighting rig is baked once into one `RGBA8` texture covering the
 * published wall AABB plus a `6u` zero-irradiance margin:
 *
 * - `R` = normalized irradiance (`0` = pure ambient outside the wall, `1` = pool
 *   peak). Inter-cluster wall space is pinned to `~35-45%` of peak.
 * - `GB` = the dominant light direction `(dirX, dirY)`, unit-length in 2D, so the
 *   wall shader reconstructs `dirZ = sqrt(max(0, 1 - dirX*dirX - dirY*dirY))` and
 *   `wall_normal.webp` preserves out-of-wall grazing relief.
 * - `A` = 255. `CLAMP_TO_EDGE` + explicit UV bounds checks keep panning beyond
 *   the baked wall from wrapping or smearing.
 *
 * Two bake paths share one layout contract:
 * - `bakeLightmap` — the pure CPU reference (Node tests, no GPU needed);
 * - `bakeLightmapOnGpu` — an offscreen WebGL2 framebuffer pass that mirrors the
 *   same maths so a manifest change costs microseconds instead of a ~1s CPU
 *   loop over tens of millions of evaluations.
 */

import { buildWorldFixtures, LIGHT_CFG } from './fixtures';
import { computeAlbumGrid, PLACARD_GAP, PLACARD_WIDTH } from '../layout/islandLayout';
import type { WallAlbum } from '../layout/types';

/** Texels per world unit (100px). */
export const LIGHTMAP_TEXELS_PER_UNIT = 8;
/** Hard GPU budget: the lightmap never exceeds 2048 x 2048 (`RGBA8`, <= 16 MB). */
export const LIGHTMAP_MAX_SIZE = 2048;
/** Zero-irradiance margin around the published wall AABB, in world units. */
export const LIGHTMAP_MARGIN_UNITS = 6;
/** Target inter-cluster ambient ratio (fraction of pool peak). */
export const LIGHTMAP_AMBIENT_RATIO_MIN = 0.35;
export const LIGHTMAP_AMBIENT_RATIO_MAX = 0.45;
/** Ambient floor written between clusters; midpoint of the target range. */
export const LIGHTMAP_AMBIENT_RATIO = 0.4;
/**
 * Width of the fade from `ambient` to zero at the wall AABB edge, in world
 * units. Wide enough that album/print zoom never shows a hard rectangle.
 */
const EDGE_FADE_UNITS = 1.5;

const DEG_TO_RAD = Math.PI / 180;
const COS_INNER = Math.cos(LIGHT_CFG.innerDeg * DEG_TO_RAD);
const COS_OUTER = Math.cos(LIGHT_CFG.outerDeg * DEG_TO_RAD);
const MAX_BAKED_FIXTURES = 256;

export interface LightmapGrid {
  /** Baked texel density (world units -> texels). */
  texelsPerUnit: number;
  /** Texture dimensions in texels. */
  width: number;
  height: number;
  /** World-space lower-left corner covered by texel (0, 0). */
  originX: number;
  originY: number;
  /** World-space extent covered by the texture (`width / texelsPerUnit`). */
  worldWidth: number;
  worldHeight: number;
  albumCount: number;
  fixtureCount: number;
}

export interface LightmapPlanOptions {
  texelsPerUnit?: number;
  maxSize?: number;
  marginUnits?: number;
}

export interface LightmapTexture {
  grid: LightmapGrid;
  data: Uint8Array;
}

export interface LightmapSample {
  irradiance: number;
  dirX: number;
  dirY: number;
  dirZ: number;
  insideBounds: boolean;
}

export interface LightmapUv {
  u: number;
  v: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  const t = clamp((value - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

function wallAabb(albums: readonly WallAlbum[]) {
  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const album of albums) {
    minX = Math.min(minX, album.position.x - album.bounds.width / 2);
    maxX = Math.max(maxX, album.position.x + album.bounds.width / 2);
    minY = Math.min(minY, album.position.y - album.bounds.height / 2);
    maxY = Math.max(maxY, album.position.y + album.bounds.height / 2);
  }
  if (!Number.isFinite(minX) || !Number.isFinite(minY)) {
    return { minX: 0, maxX: 0, minY: 0, maxY: 0 };
  }
  return { minX, maxX, minY, maxY };
}

/** Union AABB of every album island's print grid (for tests/renderers). */
export function lightmapWallAabb(albums: readonly WallAlbum[]) {
  return wallAabb(albums);
}

/**
 * Plan the bake texture: cover the wall AABB plus margin at `8 texels/unit`,
 * degrade texel density (never coverage) when the 2048² budget binds, and keep
 * the map centred on the wall so the wall centre maps to UV `(0.5, 0.5)`.
 */
export function planLightmapGrid(
  albums: readonly WallAlbum[],
  options: LightmapPlanOptions = {},
): LightmapGrid {
  const aabb = wallAabb(albums);
  const margin = Math.max(0, options.marginUnits ?? LIGHTMAP_MARGIN_UNITS);
  const maxSize = Math.max(1, Math.floor(options.maxSize ?? LIGHTMAP_MAX_SIZE));
  const requested = Math.max(1e-3, options.texelsPerUnit ?? LIGHTMAP_TEXELS_PER_UNIT);

  const rawWidth = Math.max(1e-3, aabb.maxX - aabb.minX + margin * 2);
  const rawHeight = Math.max(1e-3, aabb.maxY - aabb.minY + margin * 2);
  const texelsPerUnit = Math.min(requested, maxSize / rawWidth, maxSize / rawHeight);

  const width = Math.max(1, Math.ceil(rawWidth * texelsPerUnit));
  const height = Math.max(1, Math.ceil(rawHeight * texelsPerUnit));
  const worldWidth = width / texelsPerUnit;
  const worldHeight = height / texelsPerUnit;
  const centreX = (aabb.minX + aabb.maxX) / 2;
  const centreY = (aabb.minY + aabb.maxY) / 2;

  const fixtures = buildWorldFixtures([...albums]).fixtures;

  return {
    texelsPerUnit,
    width,
    height,
    originX: centreX - worldWidth / 2,
    originY: centreY - worldHeight / 2,
    worldWidth,
    worldHeight,
    albumCount: albums.length,
    fixtureCount: fixtures.length,
  };
}

/** World `(x, y)` -> lightmap UV. Values outside `[0, 1]` are off the baked wall. */
export function worldToLightmapUv(grid: LightmapGrid, x: number, y: number): LightmapUv {
  return {
    u: (x - grid.originX) / grid.worldWidth,
    v: (y - grid.originY) / grid.worldHeight,
  };
}

export function encodeIrradiance(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(clamp(value, 0, 1) * 255);
}

export function decodeIrradiance(byte: number): number {
  if (!Number.isFinite(byte)) return 0;
  return clamp(byte, 0, 255) / 255;
}

/**
 * Encode `(dirX, dirY)` into `GB` as `[0, 1]`-mapped bytes. The 2D part is
 * clamped to the unit disk so a greedy direction can never produce a NaN
 * `dirZ` after reconstruction.
 */
export function encodeLightDirection(dirX: number, dirY: number): { g: number; b: number } {
  const length = Math.hypot(dirX, dirY);
  const scale = length > 1 ? 1 / length : 1;
  const x = Number.isFinite(dirX) ? dirX * scale : 0;
  const y = Number.isFinite(dirY) ? dirY * scale : 0;
  return {
    g: Math.round((clamp(x, -1, 1) * 0.5 + 0.5) * 255),
    b: Math.round((clamp(y, -1, 1) * 0.5 + 0.5) * 255),
  };
}

/** Decode `GB` into a unit 3D direction with `dirZ` reconstructed in-shader. */
export function decodeLightDirection(
  gByte: number,
  bByte: number,
): { x: number; y: number; z: number } {
  const x = clamp(gByte, 0, 255) / 255 * 2 - 1;
  const y = clamp(bByte, 0, 255) / 255 * 2 - 1;
  const z = Math.sqrt(Math.max(0, 1 - x * x - y * y));
  return { x, y, z };
}

/** Irradiance + dominant direction at a wall point, using the shared fixture model. */
function accumulateAt(
  fixtures: ReadonlyArray<{ pos: [number, number, number]; axis: [number, number, number] }>,
  x: number,
  y: number,
  h: number,
): { energy: number; dirX: number; dirY: number } {
  let energy = 0;
  let dirX = 0;
  let dirY = 0;

  for (const fixture of fixtures) {
    const dx = x - fixture.pos[0];
    const dy = y - fixture.pos[1];
    const dz = h - fixture.pos[2];
    const distance = Math.hypot(dx, dy, dz);
    if (distance < 1e-6) continue;

    // `l` points from the wall point toward the fixture.
    const lx = -dx / distance;
    const ly = -dy / distance;
    const lz = -dz / distance;
    const nDotL = Math.max(0, lz);
    if (nDotL <= 0) continue;
    const cone = smoothstep(COS_OUTER, COS_INNER, -(lx * fixture.axis[0] + ly * fixture.axis[1] + lz * fixture.axis[2]));
    if (cone <= 0) continue;

    const weight = (nDotL * cone) / (distance * distance);
    energy += weight;
    dirX += lx * weight;
    dirY += ly * weight;
  }

  const planar = Math.hypot(dirX, dirY);
  if (planar > 1e-9) {
    dirX /= planar;
    dirY /= planar;
  } else {
    dirX = 0;
    dirY = 0;
  }

  return { energy, dirX, dirY };
}

/** 1 across the wall AABB + inner 5u of margin, fading to 0 at the 6u edge. */
function insideWallMask(
  x: number,
  y: number,
  aabb: { minX: number; maxX: number; minY: number; maxY: number },
): number {
  const outer = LIGHTMAP_MARGIN_UNITS;
  const toEdge = Math.min(
    x - (aabb.minX - outer),
    aabb.maxX + outer - x,
    y - (aabb.minY - outer),
    aabb.maxY + outer - y,
  );
  return smoothstep(0, 1.0, toEdge);
}

/**
 * Build per-album Gaussian pool descriptors `(cx, cy, rx, ry)` centred slightly
 * above each cluster's photo grid so every album has a soft elliptical pool.
 */
function buildAlbumPools(
  albums: readonly WallAlbum[],
): Array<{ cx: number; cy: number; rx: number; ry: number }> {
  return albums.map((album) => {
    const grid = computeAlbumGrid(
      album.photos.length,
      album.gridColumns,
      album.soundtrack !== null,
    );
    const gridCenterX = album.position.x + (PLACARD_WIDTH + PLACARD_GAP) / 2;
    const islandTop = grid.bounds.height / 2;
    const gridCenterY = album.position.y + islandTop - grid.grid.height / 2;
    return {
      cx: gridCenterX,
      cy: gridCenterY + grid.grid.height * 0.14,
      rx: Math.max(1.8, grid.grid.width * 0.68),
      ry: Math.max(1.8, grid.grid.height * 0.72),
    };
  });
}

function accumulatePoolsAt(
  pools: ReadonlyArray<{ cx: number; cy: number; rx: number; ry: number }>,
  x: number,
  y: number,
): number {
  let sum = 0;
  for (const p of pools) {
    const dx = x - p.cx;
    const dy = y - p.cy;
    sum += Math.exp(-((dx * dx) / (2 * p.rx * p.rx) + (dy * dy) / (2 * p.ry * p.ry)) * 2.2);
  }
  return 1 - Math.exp(-1.6 * sum);
}

/**
 * Pure CPU reference implementation of the bake. Deterministic, GPU-free, and
 * the authority the WebGL2 pass is diffed against.
 */
export function bakeLightmap(
  albums: readonly WallAlbum[],
  options: LightmapPlanOptions = {},
): LightmapTexture {
  const grid = planLightmapGrid(albums, options);
  const data = new Uint8Array(grid.width * grid.height * 4);
  const { fixtures } = buildWorldFixtures([...albums]);
  const pools = buildAlbumPools(albums);
  const aabb = wallAabb(albums);

  for (let ty = 0; ty < grid.height; ty += 1) {
    const wy = grid.originY + ((ty + 0.5) / grid.height) * grid.worldHeight;
    for (let tx = 0; tx < grid.width; tx += 1) {
      const wx = grid.originX + ((tx + 0.5) / grid.width) * grid.worldWidth;

      const inside = insideWallMask(wx, wy, aabb);
      const { dirX, dirY } = accumulateAt(fixtures, wx, wy, 0);
      const pool = accumulatePoolsAt(pools, wx, wy);

      const ambient = LIGHTMAP_AMBIENT_RATIO;
      const irradiance = inside * (ambient + (1 - ambient) * pool);
      const direction = encodeLightDirection(dirX, dirY);

      const offset = (ty * grid.width + tx) * 4;
      data[offset] = encodeIrradiance(irradiance);
      data[offset + 1] = direction.g;
      data[offset + 2] = direction.b;
      data[offset + 3] = 255;
    }
  }

  return { grid, data };
}

/**
 * Sample a baked `RGBA8` map. Outside `[0, 1]` UV the wall is pure ambient, so
 * panning past the baked bounds never wraps or smears a stale edge texel.
 */
export function sampleLightmap(
  data: Uint8Array,
  grid: LightmapGrid,
  uv: LightmapUv,
): LightmapSample {
  const { u, v } = uv;
  if (!Number.isFinite(u) || !Number.isFinite(v) || u < 0 || u > 1 || v < 0 || v > 1) {
    return { irradiance: 0, dirX: 0, dirY: 0, dirZ: 1, insideBounds: false };
  }

  const tx = clamp(Math.floor(u * grid.width), 0, grid.width - 1);
  const ty = clamp(Math.floor(v * grid.height), 0, grid.height - 1);
  const offset = (ty * grid.width + tx) * 4;
  const direction = decodeLightDirection(data[offset + 1], data[offset + 2]);

  return {
    irradiance: decodeIrradiance(data[offset]),
    dirX: direction.x,
    dirY: direction.y,
    dirZ: direction.z,
    insideBounds: true,
  };
}

// ---------------------------------------------------------------------------
// GPU bake (WebGL2 framebuffer pass)
// ---------------------------------------------------------------------------

/**
 * Structural subset of `WebGL2RenderingContext` used by the bake. Real contexts
 * satisfy it structurally; tests can stub it, and the CPU reference path stays
 * the authority for behaviour.
 */
export interface LightmapGl {
  readonly VERTEX_SHADER: number;
  readonly FRAGMENT_SHADER: number;
  readonly LINK_STATUS: number;
  readonly TEXTURE_2D: number;
  readonly TEXTURE0: number;
  readonly TEXTURE1: number;
  readonly RGBA32F: number;
  readonly RGBA8: number;
  readonly RGBA: number;
  readonly FLOAT: number;
  readonly UNSIGNED_BYTE: number;
  readonly TEXTURE_MIN_FILTER: number;
  readonly TEXTURE_MAG_FILTER: number;
  readonly TEXTURE_WRAP_S: number;
  readonly TEXTURE_WRAP_T: number;
  readonly NEAREST: number;
  readonly LINEAR: number;
  readonly CLAMP_TO_EDGE: number;
  readonly FRAMEBUFFER: number;
  readonly COLOR_ATTACHMENT0: number;
  readonly ARRAY_BUFFER: number;
  readonly STATIC_DRAW: number;
  readonly TRIANGLES: number;

  createTexture(): WebGLTexture | null;
  bindTexture(target: number, texture: WebGLTexture | null): void;
  texImage2D(
    target: number,
    level: number,
    internalformat: number,
    width: number,
    height: number,
    border: number,
    format: number,
    type: number,
    pixels: ArrayBufferView | null,
  ): void;
  texParameteri(target: number, pname: number, param: number): void;
  activeTexture(texture: number): void;
  createFramebuffer(): WebGLFramebuffer | null;
  bindFramebuffer(target: number, framebuffer: WebGLFramebuffer | null): void;
  framebufferTexture2D(
    target: number,
    attachment: number,
    textarget: number,
    texture: WebGLTexture | null,
    level: number,
  ): void;
  viewport(x: number, y: number, width: number, height: number): void;
  createShader(type: number): WebGLShader | null;
  shaderSource(shader: WebGLShader, source: string): void;
  compileShader(shader: WebGLShader): void;
  getShaderParameter(shader: WebGLShader, pname: number): boolean | number;
  deleteShader(shader: WebGLShader): void;
  createProgram(): WebGLProgram | null;
  attachShader(program: WebGLProgram, shader: WebGLShader): void;
  linkProgram(program: WebGLProgram): void;
  getProgramParameter(program: WebGLProgram, pname: number): boolean | number;
  deleteProgram(program: WebGLProgram): void;
  useProgram(program: WebGLProgram | null): void;
  getUniformLocation(program: WebGLProgram, name: string): WebGLUniformLocation | null;
  uniform1f(location: WebGLUniformLocation | null, x: number): void;
  uniform1i(location: WebGLUniformLocation | null, x: number): void;
  uniform2f(location: WebGLUniformLocation | null, x: number, y: number): void;
  uniform4f(
    location: WebGLUniformLocation | null,
    x: number,
    y: number,
    z: number,
    w: number,
  ): void;
  createBuffer(): WebGLBuffer | null;
  bindBuffer(target: number, buffer: WebGLBuffer | null): void;
  bufferData(target: number, data: BufferSource | null, usage: number): void;
  getAttribLocation(program: WebGLProgram, name: string): number;
  enableVertexAttribArray(index: number): void;
  vertexAttribPointer(
    index: number,
    size: number,
    type: number,
    normalized: boolean,
    stride: number,
    offset: number,
  ): void;
  drawArrays(mode: number, first: number, count: number): void;
  disableVertexAttribArray(index: number): void;
  deleteTexture(texture: WebGLTexture | null): void;
  deleteFramebuffer(framebuffer: WebGLFramebuffer | null): void;
  deleteBuffer(buffer: WebGLBuffer | null): void;
}

export interface GpuLightmapTexture {
  grid: LightmapGrid;
  texture: WebGLTexture;
  dispose: () => void;
}

const LIGHTMAP_VERTEX_SHADER = `#version 300 es
in vec2 aPosition;
void main() {
  gl_Position = vec4(aPosition, 0.0, 1.0);
}
`;

/**
 * Mirrors `accumulateAt` + `insideWallMask` + the encode step. Fixtures come in
 * as two RGBA32F texels each so the loop is not bound by fragment uniform space.
 */
const LIGHTMAP_FRAGMENT_SHADER = `#version 300 es
precision highp float;
precision highp int;

uniform sampler2D uFixtures;
uniform int uFixtureCount;
uniform int uPoolCount;
uniform vec2 uOrigin;
uniform vec2 uWorldSize;
uniform vec2 uSize;
uniform float uAmbient;
uniform float uEdgeFade;
uniform vec4 uAabb; // minX, maxX, minY, maxY
uniform float uCosInner;
uniform float uCosOuter;

out vec4 fragColor;

float smoothStep(float edge0, float edge1, float value) {
  float t = clamp((value - edge0) / (edge1 - edge0), 0.0, 1.0);
  return t * t * (3.0 - 2.0 * t);
}

void main() {
  ivec2 texel = ivec2(gl_FragCoord.xy);
  vec2 world = uOrigin + (vec2(texel) + 0.5) / uSize * uWorldSize;

  vec2 direction = vec2(0.0);

  for (int i = 0; i < ${MAX_BAKED_FIXTURES}; i++) {
    if (i >= uFixtureCount) break;
    vec4 fpos = texelFetch(uFixtures, ivec2(i, 0), 0);
    vec4 faxis = texelFetch(uFixtures, ivec2(i, 1), 0);

    vec3 d = vec3(world, 0.0) - fpos.xyz;
    float distance = length(d);
    if (distance < 1e-6) continue;
    vec3 l = -d / distance;
    float ndotl = max(0.0, l.z);
    if (ndotl <= 0.0) continue;
    float cone = smoothStep(uCosOuter, uCosInner, -dot(l, faxis.xyz));
    if (cone <= 0.0) continue;
    float weight = ndotl * cone / (distance * distance);
    direction += l.xy * weight;
  }

  float poolEnergy = 0.0;
  for (int i = 0; i < ${MAX_BAKED_FIXTURES}; i++) {
    if (i >= uPoolCount) break;
    vec4 p = texelFetch(uFixtures, ivec2(i, 2), 0);
    vec2 dp = world - p.xy;
    float rx = max(0.01, p.z);
    float ry = max(0.01, p.w);
    poolEnergy += exp(-((dp.x * dp.x) / (2.0 * rx * rx) + (dp.y * dp.y) / (2.0 * ry * ry)) * 2.2);
  }

  float planar = length(direction);
  vec2 dir = planar > 1e-9 ? direction / planar : vec2(0.0);

  float outer = ${LIGHTMAP_MARGIN_UNITS.toFixed(1)};
  float toEdge = min(
    min(world.x - (uAabb.x - outer), (uAabb.y + outer) - world.x),
    min(world.y - (uAabb.z - outer), (uAabb.w + outer) - world.y)
  );
  float inside = smoothStep(0.0, 1.0, toEdge);

  float pool = 1.0 - exp(-1.6 * poolEnergy);
  float irradiance = inside * (uAmbient + (1.0 - uAmbient) * pool);

  fragColor = vec4(irradiance, dir * 0.5 + 0.5, 1.0);
}
`;

function compileShader(gl: LightmapGl, type: number, source: string): WebGLShader | null {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  return shader;
}

/**
 * Bake the lightmap into an `RGBA8` texture on the GPU. Returns `null` when the
 * context cannot run the pass, in which case the caller renders ambient plaster
 * without a lightmap rather than blocking the wall.
 */
export function bakeLightmapOnGpu(
  gl: LightmapGl,
  albums: readonly WallAlbum[],
  options: LightmapPlanOptions = {},
): GpuLightmapTexture | null {
  const grid = planLightmapGrid(albums, options);
  const { fixtures } = buildWorldFixtures([...albums]);
  const pools = buildAlbumPools(albums);
  if (fixtures.length > MAX_BAKED_FIXTURES || pools.length > MAX_BAKED_FIXTURES) return null;

  const aabb = wallAabb(albums);

  const vertex = compileShader(gl, gl.VERTEX_SHADER, LIGHTMAP_VERTEX_SHADER);
  const fragment = compileShader(gl, gl.FRAGMENT_SHADER, LIGHTMAP_FRAGMENT_SHADER);
  if (!vertex || !fragment) return null;

  const program = gl.createProgram();
  if (!program) return null;
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  const linked = gl.getProgramParameter(program, gl.LINK_STATUS) as boolean;
  gl.deleteShader(vertex);
  gl.deleteShader(fragment);
  if (!linked) {
    gl.deleteProgram(program);
    return null;
  }

  // Row-major data texture: width = max(fixtures, pools, 1), height = 3.
  // Row 0 = fixture pos, Row 1 = fixture axis, Row 2 = per-album Gaussian pool.
  const texWidth = Math.max(1, fixtures.length, pools.length);
  const fixtureData = new Float32Array(texWidth * 3 * 4);
  fixtures.forEach((fixture, index) => {
    const posBase = index * 4;
    fixtureData[posBase] = fixture.pos[0];
    fixtureData[posBase + 1] = fixture.pos[1];
    fixtureData[posBase + 2] = fixture.pos[2];
    fixtureData[posBase + 3] = 1;

    const axisBase = (texWidth + index) * 4;
    fixtureData[axisBase] = fixture.axis[0];
    fixtureData[axisBase + 1] = fixture.axis[1];
    fixtureData[axisBase + 2] = fixture.axis[2];
    fixtureData[axisBase + 3] = 0;
  });
  pools.forEach((pool, index) => {
    const poolBase = (texWidth * 2 + index) * 4;
    fixtureData[poolBase] = pool.cx;
    fixtureData[poolBase + 1] = pool.cy;
    fixtureData[poolBase + 2] = pool.rx;
    fixtureData[poolBase + 3] = pool.ry;
  });

  const fixtureTexture = gl.createTexture();
  const target = gl.createTexture();
  const framebuffer = gl.createFramebuffer();
  if (!fixtureTexture || !target || !framebuffer) {
    if (fixtureTexture) gl.deleteTexture(fixtureTexture);
    if (target) gl.deleteTexture(target);
    if (framebuffer) gl.deleteFramebuffer(framebuffer);
    gl.deleteProgram(program);
    return null;
  }

  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, fixtureTexture);
  gl.texImage2D(
    gl.TEXTURE_2D,
    0,
    gl.RGBA32F,
    texWidth,
    3,
    0,
    gl.RGBA,
    gl.FLOAT,
    fixtureData,
  );
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

  gl.activeTexture(gl.TEXTURE1);
  gl.bindTexture(gl.TEXTURE_2D, target);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, grid.width, grid.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

  gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, target, 0);
  gl.viewport(0, 0, grid.width, grid.height);

  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([-1, -1, 3, -1, -1, 3]),
    gl.STATIC_DRAW,
  );

  gl.useProgram(program);
  const attribute = gl.getAttribLocation(program, 'aPosition');
  gl.enableVertexAttribArray(attribute);
  gl.vertexAttribPointer(attribute, 2, gl.FLOAT, false, 0, 0);

  const setUniform1f = (name: string, value: number) => {
    const location = gl.getUniformLocation(program, name);
    if (location) gl.uniform1f(location, value);
  };
  const setUniform1i = (name: string, value: number) => {
    const location = gl.getUniformLocation(program, name);
    if (location) gl.uniform1i(location, value);
  };
  const setUniform2f = (name: string, x: number, y: number) => {
    const location = gl.getUniformLocation(program, name);
    if (location) gl.uniform2f(location, x, y);
  };

  setUniform1i('uFixtures', 0);
  setUniform1i('uFixtureCount', fixtures.length);
  setUniform1i('uPoolCount', pools.length);
  setUniform2f('uOrigin', grid.originX, grid.originY);
  setUniform2f('uWorldSize', grid.worldWidth, grid.worldHeight);
  setUniform2f('uSize', grid.width, grid.height);
  setUniform1f('uAmbient', LIGHTMAP_AMBIENT_RATIO);
  setUniform1f('uEdgeFade', EDGE_FADE_UNITS);
  setUniform1f('uCosInner', COS_INNER);
  setUniform1f('uCosOuter', COS_OUTER);
  const aabbLocation = gl.getUniformLocation(program, 'uAabb');
  if (aabbLocation) {
    gl.uniform4f(aabbLocation, aabb.minX, aabb.maxX, aabb.minY, aabb.maxY);
  }

  gl.drawArrays(gl.TRIANGLES, 0, 3);

  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  // Do not leave a dangling pointer into the buffer we are about to delete.
  gl.disableVertexAttribArray(attribute);
  gl.bindBuffer(gl.ARRAY_BUFFER, null);
  gl.deleteBuffer(buffer);
  gl.deleteTexture(fixtureTexture);
  gl.deleteProgram(program);
  gl.activeTexture(gl.TEXTURE0);

  return {
    grid,
    texture: target,
    dispose: () => {
      gl.deleteTexture(target);
      gl.deleteFramebuffer(framebuffer);
    },
  };
}
