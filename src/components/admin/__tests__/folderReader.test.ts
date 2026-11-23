import { describe, expect, it } from 'vitest';
import {
  collectImagesFromEntries,
  groupByLeafFolder,
  isImageFileName,
  isVideoFileName,
  readAllDirectoryEntries,
  readDroppedFolders,
  readEntryTree,
  type DataTransferItemLike,
  type DirectoryReaderLike,
  type DroppedFile,
  type FileSystemEntryLike,
} from '../folderReader';

function fakeFile(name: string): File {
  return { name } as unknown as File;
}

function fileEntry(name: string): FileSystemEntryLike {
  return {
    isFile: true,
    isDirectory: false,
    name,
    file(onSuccess) {
      onSuccess(fakeFile(name));
    },
  };
}

function directoryEntry(name: string, children: FileSystemEntryLike[]): FileSystemEntryLike {
  let served = false;
  return {
    isFile: false,
    isDirectory: true,
    name,
    createReader(): DirectoryReaderLike {
      return {
        readEntries(onSuccess) {
          if (served) {
            onSuccess([]);
            return;
          }
          served = true;
          onSuccess(children);
        },
      };
    },
  };
}

/** Mimics Chrome: readEntries() returns at most 100 entries per call. */
function pagedReader(entries: FileSystemEntryLike[], pageSize = 100): DirectoryReaderLike {
  let offset = 0;
  return {
    readEntries(onSuccess) {
      const page = entries.slice(offset, offset + pageSize);
      offset += page.length;
      onSuccess(page);
    },
  };
}

function droppedFile(name: string, relativePath: string): DroppedFile {
  return { relativePath, file: fakeFile(name) };
}

describe('readAllDirectoryEntries', () => {
  it('loops readEntries() past the 100-entry page limit', async () => {
    const entries = Array.from({ length: 120 }, (_, index) => fileEntry(`photo-${index}.jpg`));
    const reader = pagedReader(entries);
    const read = await readAllDirectoryEntries(reader);
    expect(read).toHaveLength(120);
    expect(read[0].name).toBe('photo-0.jpg');
    expect(read[119].name).toBe('photo-119.jpg');
  });

  it('returns an empty array for an empty directory', async () => {
    await expect(readAllDirectoryEntries(pagedReader([]))).resolves.toEqual([]);
  });

  it('rejects when readEntries reports an error', async () => {
    const reader: DirectoryReaderLike = {
      readEntries(_onSuccess, onError) {
        onError?.(new Error('permission denied'));
      },
    };
    await expect(readAllDirectoryEntries(reader)).rejects.toThrow('permission denied');
  });
});

describe('image/video classification', () => {
  it('classifies extensions case-insensitively', () => {
    expect(isImageFileName('IMG_0001.JPG')).toBe(true);
    expect(isImageFileName('print.webp')).toBe(true);
    expect(isImageFileName('clip.mp4')).toBe(false);
    expect(isImageFileName('notes.txt')).toBe(false);
    expect(isVideoFileName('clip.MP4')).toBe(true);
    expect(isVideoFileName('IMG_0001.JPG')).toBe(false);
  });
});

describe('collectImagesFromEntries', () => {
  it('keeps images and reports skipped videos', () => {
    const entries = [
      droppedFile('a.jpg', 'Trip/a.jpg'),
      droppedFile('c.mp4', 'Trip/c.mp4'),
      droppedFile('b.png', 'Trip/b.png'),
    ];
    const { images, skipped } = collectImagesFromEntries(entries);
    expect(images.map((entry) => entry.relativePath)).toEqual(['Trip/a.jpg', 'Trip/b.png']);
    expect(skipped).toEqual(['Trip/c.mp4']);
  });
});

describe('groupByLeafFolder', () => {
  it('groups files by the leaf folder that contains them', () => {
    const groups = groupByLeafFolder([
      droppedFile('a.jpg', 'Trip/Day 1/a.jpg'),
      droppedFile('b.jpg', 'Trip/Day 1/b.jpg'),
      droppedFile('c.jpg', 'Trip/Day 2/c.jpg'),
      droppedFile('d.jpg', 'Trip/d.jpg'),
    ]);
    expect(groups.map((group) => group.folder)).toEqual(['Day 1', 'Day 2', 'Trip']);
    expect(groups[0].files).toHaveLength(2);
    expect(groups[1].files).toHaveLength(1);
    expect(groups[2].files).toHaveLength(1);
  });
});

describe('readEntryTree', () => {
  it('walks nested directories and records relative paths', async () => {
    const root = directoryEntry('Trip', [
      fileEntry('a.jpg'),
      directoryEntry('Day 2', [fileEntry('b.jpg'), fileEntry('clip.mp4')]),
    ]);
    const entries = await readEntryTree(root);
    expect(entries.map((entry) => entry.relativePath)).toEqual([
      'Trip/a.jpg',
      'Trip/Day 2/b.jpg',
      'Trip/Day 2/clip.mp4',
    ]);
  });
});

describe('readDroppedFolders', () => {
  it('reads a dropped folder with 120 photos and 3 videos past the page limit', async () => {
    const photos = Array.from({ length: 120 }, (_, index) => fileEntry(`photo-${index}.jpg`));
    const videos = Array.from({ length: 3 }, (_, index) => fileEntry(`clip-${index}.mp4`));
    const root = directoryEntry('Trip', [...photos, ...videos]);

    const items: DataTransferItemLike[] = [
      { kind: 'file', webkitGetAsEntry: () => root },
    ];
    const groups = await readDroppedFolders(items);

    expect(groups).toHaveLength(1);
    expect(groups[0].folder).toBe('Trip');
    expect(groups[0].files).toHaveLength(120);
    expect(groups[0].skipped).toHaveLength(3);
    expect(groups[0].skipped).toContain('Trip/clip-0.mp4');
  });

  it('splits nested leaf folders into separate albums', async () => {
    const root = directoryEntry('Trip', [
      fileEntry('cover.jpg'),
      directoryEntry('Day 2', [fileEntry('b.jpg')]),
    ]);
    const groups = await readDroppedFolders([{ kind: 'file', webkitGetAsEntry: () => root }]);
    const folders = groups.map((group) => group.folder).sort();
    expect(folders).toEqual(['Day 2', 'Trip']);
  });

  it('accepts flat image files dropped without a directory entry', async () => {
    const items: DataTransferItemLike[] = [
      { kind: 'file', getAsFile: () => fakeFile('a.jpg') },
      { kind: 'file', getAsFile: () => fakeFile('clip.mp4') },
    ];
    const groups = await readDroppedFolders(items);
    expect(groups).toHaveLength(1);
    expect(groups[0].folder).toBe('');
    expect(groups[0].files).toHaveLength(1);
    expect(groups[0].skipped).toEqual(['clip.mp4']);
  });
});
