/**
 * Pure geometry and pointer hand-off state for the wall's touch gestures.
 *
 * `GalleryCanvas` owns the camera, the DOM and the native listeners; this
 * module owns the two parts of that input path that are easy to get subtly
 * wrong and impossible to verify by hand:
 *
 * - `pinchStep` decomposes a two-finger move into a zoom factor about the
 *   *current* midpoint plus the midpoint's own screen-space delta, so applying
 *   pan then zoom keeps the world point under the fingers fixed (map-style).
 * - `beginPointer` / `movePointer` / `releasePointer` track the pointer map so a
 *   second finger brushing the wall mid-drag never rewinds the active pan, and
 *   lifting it hands the gesture back to the remaining finger from where it
 *   actually is.
 *
 * Every helper is a pure state transition, so the unit tests drive exactly the
 * code `GalleryCanvas` runs.
 */

/** A pointer position in CSS pixels (screen space). */
export interface Pt {
  x: number;
  y: number;
}

/** The two live touch points of a pinch. */
export interface PinchPoints {
  a: Pt;
  b: Pt;
}

export interface PinchStep {
  /** `dist(curr) / dist(prev)`; `> 1` zooms in. */
  zoomFactor: number;
  /** Current midpoint, in the caller's screen space. */
  anchor: Pt;
  /** Midpoint movement since the previous move, in CSS pixels. */
  panDx: number;
  panDy: number;
}

/** Drag threshold shared with the tap-vs-pan decision in `GalleryCanvas`. */
export const DRAG_THRESHOLD_PX = 5;

export interface GesturePointer {
  id: number;
  x: number;
  y: number;
  /** Press point of the current drag leg; rebased on a 2 → 1 finger hand-off. */
  startX: number;
  startY: number;
}

export interface GestureState {
  pointers: readonly GesturePointer[];
  /** Latches once the gesture stops being a tap; cleared by the caller. */
  dragged: boolean;
  /** The two live pinch points, or `null` below two pointers. */
  pinch: PinchPoints | null;
}

export interface PointerMove {
  state: GestureState;
  /** One-finger pan delta in CSS pixels, or `null` for a pinch or a sub-threshold move. */
  pan: { dx: number; dy: number } | null;
  pinch: PinchStep | null;
}

function isFinitePoint(point: Pt): boolean {
  return Number.isFinite(point.x) && Number.isFinite(point.y);
}

function distance(points: PinchPoints): number {
  return Math.hypot(points.a.x - points.b.x, points.a.y - points.b.y);
}

function midpoint(points: PinchPoints): Pt {
  return { x: (points.a.x + points.b.x) / 2, y: (points.a.y + points.b.y) / 2 };
}

/**
 * Two-finger move → camera delta. Returns `null` for degenerate geometry (a
 * zero-length or non-finite finger separation), which would otherwise divide
 * by zero and poison the camera with `NaN`.
 */
export function pinchStep(prev: PinchPoints, curr: PinchPoints): PinchStep | null {
  if (!isFinitePoint(prev.a) || !isFinitePoint(prev.b)) return null;
  if (!isFinitePoint(curr.a) || !isFinitePoint(curr.b)) return null;

  const prevDistance = distance(prev);
  const currDistance = distance(curr);
  if (!Number.isFinite(prevDistance) || !Number.isFinite(currDistance)) return null;
  if (prevDistance <= 0 || currDistance <= 0) return null;

  const prevMidpoint = midpoint(prev);
  const currMidpoint = midpoint(curr);
  return {
    zoomFactor: currDistance / prevDistance,
    anchor: currMidpoint,
    panDx: currMidpoint.x - prevMidpoint.x,
    panDy: currMidpoint.y - prevMidpoint.y,
  };
}

/** The gesture state before any finger touches the wall. */
export function createIdleGesture(): GestureState {
  return { pointers: [], dragged: false, pinch: null };
}

function pinchPointsOf(pointers: readonly GesturePointer[]): PinchPoints | null {
  const [a, b] = pointers;
  if (!a || !b) return null;
  return { a: { x: a.x, y: a.y }, b: { x: b.x, y: b.y } };
}

/**
 * `pointerdown`. Only the `0 -> 1` transition clears the drag latch: a second
 * finger landing mid-drag must not turn the gesture back into a tap, or the
 * release would fire a click and the next move would pan from the old origin.
 */
export function beginPointer(
  state: GestureState,
  pointer: { id: number; x: number; y: number },
): GestureState {
  const pointers = [
    ...state.pointers.filter((existing) => existing.id !== pointer.id),
    {
      id: pointer.id,
      x: pointer.x,
      y: pointer.y,
      startX: pointer.x,
      startY: pointer.y,
    },
  ];
  return {
    pointers,
    dragged: pointers.length === 1 ? false : state.dragged,
    pinch: pinchPointsOf(pointers),
  };
}

/**
 * `pointerup` / `pointercancel`. A `2 -> 1` hand-off keeps the drag latch and
 * rebases the remaining finger's press point to where that finger is now, so
 * the next move contributes only its incremental delta — no jump back across
 * the earlier pan. Reaching zero pointers leaves `dragged` set; the caller
 * clears it on the next tick so the `click` that follows a drag stays ignored.
 */
export function releasePointer(state: GestureState, id: number): GestureState {
  const pointers = state.pointers.filter((pointer) => pointer.id !== id);
  if (pointers.length === state.pointers.length) return state;

  const handOff = state.pointers.length === 2 && pointers.length === 1;
  return {
    pointers: handOff
      ? pointers.map((pointer) => ({ ...pointer, startX: pointer.x, startY: pointer.y }))
      : pointers,
    dragged: state.dragged,
    pinch: pinchPointsOf(pointers),
  };
}

/**
 * `pointermove`. With two or more pointers the result is the pinch delta;
 * with one it is the one-finger pan, threshold-gated exactly like the previous
 * inline logic (including the first pan coming from the press point).
 */
export function movePointer(
  state: GestureState,
  id: number,
  x: number,
  y: number,
  thresholdPx: number = DRAG_THRESHOLD_PX,
): PointerMove {
  const previous = state.pointers.find((pointer) => pointer.id === id);
  if (!previous) return { state, pan: null, pinch: null };

  const pointers = state.pointers.map((pointer) =>
    pointer.id === id ? { ...pointer, x, y } : pointer,
  );
  const points = pinchPointsOf(pointers);

  if (points) {
    const step = state.pinch ? pinchStep(state.pinch, points) : null;
    return {
      state: { pointers, dragged: state.dragged || step !== null, pinch: points },
      pan: null,
      pinch: step,
    };
  }

  const dx = x - previous.x;
  const dy = y - previous.y;
  const fromPress = Math.hypot(x - previous.startX, y - previous.startY);

  if (!state.dragged && fromPress > thresholdPx) {
    return {
      state: { pointers, dragged: true, pinch: null },
      pan: { dx: x - previous.startX, dy: y - previous.startY },
      pinch: null,
    };
  }
  if (state.dragged && (dx !== 0 || dy !== 0)) {
    return { state: { pointers, dragged: true, pinch: null }, pan: { dx, dy }, pinch: null };
  }
  return {
    state: { pointers, dragged: state.dragged, pinch: null },
    pan: null,
    pinch: null,
  };
}
