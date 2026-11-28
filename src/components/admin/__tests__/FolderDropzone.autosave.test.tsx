// @vitest-environment jsdom

/**
 * `upload-autosave-draft` — behaviour of the Upload card with mocked network.
 *
 * Covers: one metadata PATCH (never carrying `status`) when every file is
 * uploaded, Studio refresh after each upload run, Publish sending only the
 * fields changed since the auto-save, and the races between auto-save, Publish
 * and Discard.
 */

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useWallStore } from '@/store/useWallStore';

import FolderDropzone from '../FolderDropzone';

vi.mock('../captureTime', () => ({
  orderByCaptureTime: async (files: File[]) => files,
  readCaptureBytes: vi.fn(),
}));

vi.mock('../imageCompressor', async (importOriginal) => {
  const original = await importOriginal<typeof import('../imageCompressor')>();
  return {
    ...original,
    prepareUploadFile: vi.fn(async (file: File) => ({
      blob: new Blob(['x'], { type: 'image/jpeg' }),
      filename: file.name,
      contentType: 'image/jpeg',
      thumbHash: null,
      dominantColor: null,
      compressed: false,
    })),
  };
});

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

interface RecordedRequest {
  method: string;
  url: string;
  body: Record<string, unknown> | null;
}

let host: HTMLDivElement;
let root: Root;
let requests: RecordedRequest[];
/** Photo filenames whose upload returns a deterministic 400. */
let failingFiles: Set<string>;
/** When set, PATCH requests wait for this promise before answering. */
let patchGate: Promise<void> | null;
/** Status the PATCH answers with once the gate opens. */
let patchStatus: number;

class FakeXhr {
  status = 0;
  responseText = '';
  withCredentials = false;
  upload: { onprogress: ((event: unknown) => void) | null } = { onprogress: null };
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  ontimeout: (() => void) | null = null;
  onabort: (() => void) | null = null;
  open() {}
  abort() {
    this.onabort?.();
  }
  send(form: FormData) {
    const name = (form.get('file') as File).name;
    this.status = failingFiles.has(name) ? 400 : 200;
    queueMicrotask(() => this.onload?.());
  }
}

function installFetch() {
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? 'GET';
    const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : null;
    requests.push({ method, url, body });
    if (method === 'POST' && url.endsWith('/api/admin/albums')) {
      return new Response(JSON.stringify({ id: 'album-1' }), { status: 201 });
    }
    if (method === 'PATCH') {
      if (patchGate) await patchGate;
      return new Response(JSON.stringify(patchStatus === 200 ? { ok: true } : { error: 'not_found' }), {
        status: patchStatus,
      });
    }
    return new Response('{}', { status: 200 });
  }) as typeof fetch;
}

const patches = () => requests.filter((request) => request.method === 'PATCH');
const text = () => host.textContent ?? '';
const buttons = () => Array.from(host.querySelectorAll('button')).map((button) => button.textContent);

async function tick(times = 6) {
  for (let i = 0; i < times; i += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 5));
    });
  }
}

async function waitFor(condition: () => boolean, label: string) {
  for (let i = 0; i < 80; i += 1) {
    if (condition()) return;
    await tick(1);
  }
  throw new Error(`timed out waiting for ${label}`);
}

function setInput(placeholder: string, value: string) {
  const input = host.querySelector<HTMLInputElement>(`input[placeholder="${placeholder}"]`);
  if (!input) throw new Error(`no input ${placeholder}`);
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  setter?.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

async function drop(names: string[]) {
  const input = host.querySelector<HTMLInputElement>('input[type="file"]');
  if (!input) throw new Error('no file input');
  const files = names.map((name) => new File(['x'], name, { type: 'image/jpeg' }));
  Object.defineProperty(input, 'files', { value: files, configurable: true });
  await act(async () => {
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
}

async function click(label: string) {
  const button = Array.from(host.querySelectorAll('button')).find((b) => b.textContent === label);
  if (!button) throw new Error(`no button ${label}; have ${buttons().join(', ')}`);
  await act(async () => {
    button.click();
  });
}

async function render(onWallChanged?: () => void | Promise<void>) {
  await act(async () => {
    root.render(onWallChanged ? <FolderDropzone onWallChanged={onWallChanged} /> : <FolderDropzone />);
  });
}

beforeEach(() => {
  requests = [];
  failingFiles = new Set();
  patchGate = null;
  patchStatus = 200;
  installFetch();
  vi.stubGlobal('XMLHttpRequest', FakeXhr);
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

describe('auto-save when every upload is done', () => {
  it('sends one metadata PATCH without status, then refreshes the Studio', async () => {
    const onWallChanged = vi.fn(async () => {});
    await render(onWallChanged);
    setInput('Shibuya, Tokyo', 'Kyoto');
    await drop(['a.jpg', 'b.jpg']);
    await waitFor(() => text().includes('Saved as draft'), 'Saved as draft');

    expect(patches()).toHaveLength(1);
    const body = patches()[0].body as Record<string, unknown>;
    expect('status' in body).toBe(false);
    expect(body.locationLabel).toBe('Kyoto');
    expect(body.title).toBe('Untitled Album');
    expect(onWallChanged).toHaveBeenCalledTimes(1);
    expect(text()).toContain('Saved Untitled Album as draft');
  });

  it('adds no button: only Publish album and Discard draft are offered', async () => {
    await render(vi.fn(async () => {}));
    await drop(['a.jpg']);
    await waitFor(() => text().includes('Saved as draft'), 'Saved as draft');
    const labels = buttons().filter((label) => label !== 'Inspect');
    expect(labels.sort()).toEqual(['Discard draft', 'Publish album']);
  });

  it('falls back to refreshWall without an onWallChanged prop', async () => {
    const original = useWallStore.getState().refreshWall;
    const refresh = vi.fn(async () => {});
    useWallStore.setState({ refreshWall: refresh });
    try {
      await render();
      await drop(['a.jpg']);
      await waitFor(() => text().includes('Saved as draft'), 'Saved as draft');
      expect(refresh).toHaveBeenCalledTimes(1);
    } finally {
      useWallStore.setState({ refreshWall: original });
    }
  });
});

describe('partial upload and retry', () => {
  it('refreshes the preview but sends no metadata while a file has failed', async () => {
    failingFiles.add('bad.jpg');
    const onWallChanged = vi.fn(async () => {});
    await render(onWallChanged);
    await drop(['a.jpg', 'bad.jpg']);
    await waitFor(() => text().includes('1 failed'), '1 failed');

    expect(patches()).toHaveLength(0);
    expect(onWallChanged).toHaveBeenCalledTimes(1);
    expect(buttons()).toContain('Retry failed uploads');
    expect(buttons()).toContain('Discard draft');
  });

  it('auto-saves once the retry completes the album', async () => {
    failingFiles.add('bad.jpg');
    await render(vi.fn(async () => {}));
    await drop(['a.jpg', 'bad.jpg']);
    await waitFor(() => text().includes('1 failed'), '1 failed');

    failingFiles.clear();
    await click('Retry failed uploads');
    await waitFor(() => text().includes('Saved as draft'), 'Saved as draft');
    expect(patches()).toHaveLength(1);
    expect('status' in (patches()[0].body as Record<string, unknown>)).toBe(false);
  });
});

describe('publish after an auto-save', () => {
  async function savedCard() {
    const onWallChanged = vi.fn(async () => {});
    await render(onWallChanged);
    setInput('Shibuya, Tokyo', 'Kyoto');
    await drop(['a.jpg']);
    await waitFor(() => text().includes('Saved as draft'), 'Saved as draft');
    return onWallChanged;
  }

  it('sends only the status when the form is unchanged', async () => {
    const onWallChanged = await savedCard();
    await click('Publish album');
    await waitFor(() => text().includes('Published'), 'Published');
    expect(patches()).toHaveLength(2);
    expect(patches()[1].body).toEqual({ status: 'published' });
    expect(onWallChanged).toHaveBeenCalledTimes(2);
  });

  it('carries only the Upload-form edits made after the auto-save', async () => {
    await savedCard();
    setInput('October 2025', 'Spring 2026');
    await click('Publish album');
    await waitFor(() => text().includes('Published'), 'Published');
    expect(patches()[1].body).toEqual({ status: 'published', dateLabel: 'Spring 2026' });
  });

  it('never sends status draft in any request', async () => {
    await savedCard();
    await click('Publish album');
    await waitFor(() => text().includes('Published'), 'Published');
    expect(patches().some((request) => request.body?.status === 'draft')).toBe(false);
  });
});

describe('races', () => {
  it('ignores Publish while the auto-save is in flight', async () => {
    let open!: () => void;
    patchGate = new Promise<void>((resolve) => {
      open = resolve;
    });
    await render(vi.fn(async () => {}));
    await drop(['a.jpg']);
    await waitFor(() => text().includes('Saving…'), 'Saving…');

    const publish = Array.from(host.querySelectorAll('button')).find((b) => b.textContent === 'Publish album');
    expect(publish?.disabled).toBe(true);
    await act(async () => {
      publish?.click();
    });
    expect(patches()).toHaveLength(1);

    await act(async () => {
      open();
    });
    await waitFor(() => text().includes('Saved as draft'), 'Saved as draft');
    expect(patches()).toHaveLength(1);
  });

  it('stays quiet when Discard lands during a failing auto-save', async () => {
    let open!: () => void;
    patchGate = new Promise<void>((resolve) => {
      open = resolve;
    });
    patchStatus = 404;
    const onWallChanged = vi.fn(async () => {});
    await render(onWallChanged);
    await drop(['a.jpg']);
    await waitFor(() => text().includes('Saving…'), 'Saving…');

    await click('Discard draft');
    await waitFor(() => host.querySelector('.admin-draft') === null, 'card removed');
    expect(requests.some((request) => request.method === 'DELETE')).toBe(true);

    await act(async () => {
      open();
    });
    await tick();
    expect(host.querySelector('.admin-error')).toBeNull();
    expect(host.querySelector('.admin-draft')).toBeNull();
    expect(onWallChanged).toHaveBeenCalled();
  });

  it('removes a saved draft from the preview when discarded', async () => {
    const onWallChanged = vi.fn(async () => {});
    await render(onWallChanged);
    await drop(['a.jpg']);
    await waitFor(() => text().includes('Saved as draft'), 'Saved as draft');
    const before = onWallChanged.mock.calls.length;

    await click('Discard draft');
    await waitFor(() => host.querySelector('.admin-draft') === null, 'card removed');
    expect(requests.filter((request) => request.method === 'DELETE')).toHaveLength(1);
    expect(onWallChanged.mock.calls.length).toBe(before + 1);
  });
});
