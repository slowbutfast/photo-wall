/**
 * Recursive folder-drop reader for the Curator Drawer.
 *
 * Chrome's `FileSystemDirectoryReader.readEntries()` returns at most 100
 * entries per call, so folders with more than 100 photos must be read in a
 * loop until an empty page arrives. The helpers are pure and accept structural
 * snapshots (`DataTransferItemLike[]`), which keeps them testable in Node.
 */

export interface DirectoryReaderLike {
  readEntries(
    onSuccess: (entries: FileSystemEntryLike[]) => void,
    onError?: (error: unknown) => void,
  ): void;
}

export interface FileSystemEntryLike {
  isFile: boolean;
  isDirectory: boolean;
  name: string;
  file?(onSuccess: (file: File) => void, onError?: (error: unknown) => void): void;
  createReader?(): DirectoryReaderLike;
}

export interface DataTransferItemLike {
  kind?: string;
  webkitGetAsEntry?(): FileSystemEntryLike | null;
  getAsFile?(): File | null;
}

export interface DroppedFile {
  /** Path relative to the drop root, e.g. `Trip/Day 2/IMG_0001.jpg`. */
  relativePath: string;
  file: File;
}

export interface FolderContents {
  /** Leaf folder name used as the album title (empty for flat file drops). */
  folder: string;
  files: File[];
  /** Relative paths of non-image files that were skipped (e.g. `.mp4`). */
  skipped: string[];
}

const IMAGE_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'webp']);

const VIDEO_EXTENSIONS = new Set(['mp4', 'mov', 'webm', 'm4v', 'avi', 'mkv', 'ogv']);

/**
 * Split a dropped folder into the files an album can mount and the overflow
 * beyond `MAX_PHOTOS_PER_ALBUM`. The uploader uses this before creating the
 * draft, so a 25-photo folder shows a clear cap message instead of uploading
 * 20 files and then getting stuck on a rejected 21st.
 */
export function splitAlbumCap(
  files: readonly File[],
  cap: number,
): { accepted: File[]; overflow: number } {
  const limit = Math.max(0, Math.floor(cap));
  return {
    accepted: files.slice(0, limit),
    overflow: Math.max(0, files.length - limit),
  };
}

function extensionOf(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot >= 0 ? name.slice(dot + 1).toLowerCase() : '';
}

export function isImageFileName(name: string): boolean {
  return IMAGE_EXTENSIONS.has(extensionOf(name));
}

export function isVideoFileName(name: string): boolean {
  return VIDEO_EXTENSIONS.has(extensionOf(name));
}

function normalizePath(path: string): string {
  return path.replace(/\\/g, '/').replace(/\/+/g, '/');
}

/** Leaf folder name for a relative path (`Trips/Day 2/a.jpg` → `Day 2`). */
export function leafFolderName(relativePath: string): string {
  const parts = normalizePath(relativePath).split('/').filter(Boolean);
  if (parts.length <= 1) return '';
  return parts[parts.length - 2];
}

/** Loop `readEntries()` until it returns an empty page. */
export async function readAllDirectoryEntries(
  reader: DirectoryReaderLike,
): Promise<FileSystemEntryLike[]> {
  const all: FileSystemEntryLike[] = [];
  let page: FileSystemEntryLike[];
  do {
    page = await new Promise<FileSystemEntryLike[]>((resolve, reject) => {
      reader.readEntries(resolve, reject);
    });
    if (page.length > 0) all.push(...page);
  } while (page.length > 0);
  return all;
}

function readFileFromEntry(entry: FileSystemEntryLike): Promise<File> {
  return new Promise<File>((resolve, reject) => {
    if (!entry.file) {
      reject(new Error(`Entry "${entry.name}" is not a readable file`));
      return;
    }
    entry.file(resolve, reject);
  });
}

/** Depth-first walk of a dropped directory, preserving relative paths. */
export async function readEntryTree(
  root: FileSystemEntryLike,
  basePath = '',
): Promise<DroppedFile[]> {
  const entries: DroppedFile[] = [];

  async function walk(entry: FileSystemEntryLike, parentPath: string): Promise<void> {
    const path = parentPath ? `${parentPath}/${entry.name}` : entry.name;
    if (entry.isFile) {
      const file = await readFileFromEntry(entry);
      entries.push({ relativePath: normalizePath(path), file });
      return;
    }
    if (entry.isDirectory && entry.createReader) {
      const children = await readAllDirectoryEntries(entry.createReader());
      for (const child of children) {
        await walk(child, path);
      }
    }
  }

  await walk(root, basePath);
  return entries;
}

/** Partition a file list into supported images and skipped non-images. */
export function collectImagesFromEntries(entries: DroppedFile[]): {
  images: DroppedFile[];
  skipped: string[];
} {
  const images: DroppedFile[] = [];
  const skipped: string[] = [];
  for (const entry of entries) {
    if (isImageFileName(entry.relativePath)) {
      images.push(entry);
    } else {
      skipped.push(entry.relativePath);
    }
  }
  return { images, skipped };
}

/** Group image files by the leaf folder that contains them. */
export function groupByLeafFolder(entries: DroppedFile[]): FolderContents[] {
  const groups = new Map<string, FolderContents>();
  for (const entry of entries) {
    const folder = leafFolderName(entry.relativePath);
    let group = groups.get(folder);
    if (!group) {
      group = { folder, files: [], skipped: [] };
      groups.set(folder, group);
    }
    group.files.push(entry.file);
  }
  return Array.from(groups.values());
}

/**
 * Read everything from a `DataTransferItem` snapshot (callers should snapshot
 * `Array.from(dataTransfer.items)` synchronously during the drop event) and
 * return one grouped album per leaf folder.
 */
export async function readDroppedFolders(
  items: readonly DataTransferItemLike[],
): Promise<FolderContents[]> {
  const entries: DroppedFile[] = [];

  for (const item of items) {
    const entry = item.webkitGetAsEntry?.() ?? null;
    if (entry) {
      if (entry.isDirectory) {
        entries.push(...(await readEntryTree(entry)));
      } else if (entry.isFile) {
        const file = await readFileFromEntry(entry);
        entries.push({ relativePath: normalizePath(entry.name), file });
      }
      continue;
    }

    const file = item.getAsFile?.() ?? null;
    if (file) entries.push({ relativePath: normalizePath(file.name), file });
  }

  const { images, skipped } = collectImagesFromEntries(entries);
  const groups = groupByLeafFolder(images);

  for (const skippedPath of skipped) {
    const folder = leafFolderName(skippedPath);
    let group = groups.find((candidate) => candidate.folder === folder);
    if (!group) {
      group = { folder, files: [], skipped: [] };
      groups.push(group);
    }
    group.skipped.push(skippedPath);
  }

  return groups;
}
