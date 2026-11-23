/**
 * Single source of truth for longest-edge image URLs (Bunny Optimizer and the
 * local uploads route). Both the server and the client use this module.
 */

export interface LongestEdgeParams {
  width?: number;
  height?: number;
}

export function normalizeCdnBase(cdnBase: string): string {
  return cdnBase.replace(/\/+$/, '');
}

function normalizePath(storagePath: string): string {
  return `/${storagePath.replace(/^\/+|\/+$/g, '')}`;
}

/** Portrait images constrain height; landscape and square images constrain width. */
export function longestEdgeParams(longestEdge: number, aspectRatio: number): LongestEdgeParams {
  const edge = Number.isFinite(longestEdge) ? Math.max(1, Math.floor(longestEdge)) : 1;
  const ratio = Number.isFinite(aspectRatio) && aspectRatio > 0 ? aspectRatio : 1;
  return ratio < 1 ? { height: edge } : { width: edge };
}

export function buildLodUrl(
  cdnBase: string,
  storagePath: string,
  longestEdge: number,
  aspectRatio: number,
): string {
  const params = longestEdgeParams(longestEdge, aspectRatio);
  const query = new URLSearchParams();
  if (params.width !== undefined) query.set('width', String(params.width));
  if (params.height !== undefined) query.set('height', String(params.height));
  return `${normalizeCdnBase(cdnBase)}${normalizePath(storagePath)}?${query.toString()}`;
}

/** Raw (non-Optimizer) public URL for an object; used for downloads/debugging. */
export function buildRawUrl(cdnBase: string, storagePath: string): string {
  return `${normalizeCdnBase(cdnBase)}${normalizePath(storagePath)}`;
}
