/**
 * Dev-only instrumentation for the on-device hand-off attribution pass
 * (`?debugHandoff=1`, see `tests.md`). It logs flight boundaries, gyro emits,
 * overlay readiness and per-frame participant weights into a ring buffer and a
 * small on-screen panel.
 *
 * The whole module compiles out of production: `ENABLED` folds to `false`
 * because `process.env.NODE_ENV` is inlined, so every call is a no-op.
 */

export interface HandoffDebugEntry {
  at: number;
  event: string;
  data?: Record<string, unknown>;
}

const MAX_ENTRIES = 240;

const ENABLED =
  process.env.NODE_ENV !== 'production' &&
  typeof window !== 'undefined' &&
  new URLSearchParams(window.location.search).get('debugHandoff') === '1';

const entries: HandoffDebugEntry[] = [];
let panel: HTMLElement | null = null;

function ensurePanel(): HTMLElement | null {
  if (typeof document === 'undefined') return null;
  if (panel?.isConnected) return panel;
  panel = document.createElement('pre');
  panel.setAttribute('aria-hidden', 'true');
  panel.style.cssText = [
    'position:fixed',
    'left:8px',
    'bottom:8px',
    'z-index:2147483647',
    'max-width:46ch',
    'max-height:38vh',
    'overflow:hidden',
    'margin:0',
    'padding:6px 8px',
    'border-radius:4px',
    'background:rgba(8,7,5,0.82)',
    'color:#f4f2ec',
    'font:10px/1.35 ui-monospace,monospace',
    'pointer-events:none',
    'white-space:pre-wrap',
  ].join(';');
  document.body.appendChild(panel);
  return panel;
}

function render() {
  const node = ensurePanel();
  if (!node) return;
  node.textContent = entries
    .slice(-18)
    .map((entry) => `${entry.at.toFixed(0)} ${entry.event} ${JSON.stringify(entry.data ?? {})}`)
    .join('\n');
}

function log(event: string, data?: Record<string, unknown>) {
  if (!ENABLED) return;
  entries.push({ at: performance.now(), event, data });
  if (entries.length > MAX_ENTRIES) entries.shift();
  console.debug('[handoff]', event, data ?? {});
  render();
}

export const handoffDebug = {
  enabled: ENABLED,
  log,
  flight(data: Record<string, unknown>) {
    log('flight', data);
  },
  flightEnd() {
    log('flight-end');
  },
  cancel() {
    log('cancel');
  },
  weights(participants: ReadonlyArray<{ photoId: string; w: number }>) {
    log('weights', {
      p: participants.map((participant) => `${participant.photoId.slice(0, 6)}:${participant.w.toFixed(3)}`),
    });
  },
  gyro(tilt: { nx: number; ny: number }) {
    log('gyro', { nx: tilt.nx.toFixed(3), ny: tilt.ny.toFixed(3) });
  },
  willChange(value: string) {
    log('will-change', { value });
  },
  overlay(photoId: string, live: boolean) {
    log('overlay', { photoId: photoId.slice(0, 6), live });
  },
};
