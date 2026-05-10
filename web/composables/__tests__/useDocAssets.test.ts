// @vitest-environment nuxt
/**
 * Boundary tests for `validateImageFile` — the single source of truth for
 * MIME and size policy on doc-image uploads. Every drop / paste / picker
 * path eventually calls `uploadImageAsset` which calls this; if these
 * cases pass, every path enforces them.
 *
 * Plus integration coverage of `uploadImageAsset` itself: the compression
 * step is faked (browser-image-compression needs canvas + workers, neither
 * of which `happy-dom` provides) but every branch of the wrapper is
 * exercised — pick the smaller blob, fall back when compression bloats,
 * fall back when compression throws.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MAX_IMAGE_BYTES, validateImageFile } from '../useDocAssets';

// Functional fake for browser-image-compression. Each test pushes a
// behaviour onto the queue; the fake pops one off per call. No vi.fn().
type CompressBehaviour =
  | { kind: 'resolve'; blob: Blob }
  | { kind: 'reject'; error: Error };
const compressQueue: CompressBehaviour[] = [];
const compressCalls: { file: File }[] = [];

vi.mock('browser-image-compression', () => ({
  default: async (file: File) => {
    compressCalls.push({ file });
    const next = compressQueue.shift();
    if (!next) throw new Error('compress fake: no behaviour queued');
    if (next.kind === 'reject') throw next.error;
    return next.blob;
  },
}));

import useDocAssets from '../useDocAssets';
import { useIdb } from '../useIdb';

describe('validateImageFile', () => {
  it('accepts allowed MIME types (PNG, JPEG, WebP)', () => {
    for (const type of ['image/png', 'image/jpeg', 'image/webp']) {
      expect(() => validateImageFile({ type, size: 1024 })).not.toThrow();
    }
  });

  it('rejects unsupported MIME types with a descriptive error', () => {
    expect(() => validateImageFile({ type: 'image/gif', size: 1024 })).toThrow(
      /image\/gif/,
    );
    expect(() =>
      validateImageFile({ type: 'image/svg+xml', size: 1024 }),
    ).toThrow(/PNG, JPEG, or WebP/);
  });

  it('rejects an empty MIME type (catches blob.type === "")', () => {
    expect(() => validateImageFile({ type: '', size: 1024 })).toThrow();
  });

  it('accepts a file exactly at the size cap, rejects one byte over', () => {
    expect(() =>
      validateImageFile({ type: 'image/png', size: MAX_IMAGE_BYTES }),
    ).not.toThrow();
    expect(() =>
      validateImageFile({ type: 'image/png', size: MAX_IMAGE_BYTES + 1 }),
    ).toThrow(/must be under/);
  });

  it('mentions the actual file size so users know what to trim', () => {
    expect(() =>
      validateImageFile({ type: 'image/jpeg', size: 25 * 1024 * 1024 }),
    ).toThrow(/25\.0 MB/);
  });

  it('checks MIME before size, so an invalid huge file reports type first', () => {
    expect(() =>
      validateImageFile({
        type: 'application/pdf',
        size: 100 * 1024 * 1024,
      }),
    ).toThrow(/Unsupported image type/);
  });
});

describe('uploadImageAsset', () => {
  function makeFile(size: number, type = 'image/jpeg') {
    return new File([new Uint8Array(size)], 'photo', { type });
  }

  let projectId: string;

  beforeEach(async () => {
    compressQueue.length = 0;
    compressCalls.length = 0;
    const project = await useIdb().createProject('P');
    projectId = project.id;
  });

  it('stores the compressed blob when smaller than the source', async () => {
    const file = makeFile(2_000_000, 'image/jpeg');
    const compressed = new Blob([new Uint8Array(50_000)], {
      type: 'image/webp',
    });
    compressQueue.push({ kind: 'resolve', blob: compressed });

    const stored = await useDocAssets().uploadImageAsset(file, projectId);

    expect(compressCalls).toHaveLength(1);
    expect(compressCalls[0].file).toBe(file);
    expect(stored.mimeType).toBe('image/webp');
    expect(stored.blob).toBe(compressed);
  });

  it('keeps the original when re-encoding produced a larger blob', async () => {
    const file = makeFile(800, 'image/webp');
    const inflated = new Blob([new Uint8Array(1_500)], { type: 'image/webp' });
    compressQueue.push({ kind: 'resolve', blob: inflated });

    const stored = await useDocAssets().uploadImageAsset(file, projectId);

    expect(stored.mimeType).toBe('image/webp');
    expect(stored.blob).toBe(file);
  });

  it('falls back to the original when compression throws', async () => {
    const file = makeFile(1_000_000, 'image/png');
    compressQueue.push({
      kind: 'reject',
      error: new Error('encoder unavailable'),
    });

    const stored = await useDocAssets().uploadImageAsset(file, projectId);

    expect(stored.mimeType).toBe('image/png');
    expect(stored.blob).toBe(file);
  });

  it('rejects oversized files before invoking the compressor', async () => {
    const file = makeFile(MAX_IMAGE_BYTES + 1, 'image/jpeg');

    await expect(
      useDocAssets().uploadImageAsset(file, projectId),
    ).rejects.toThrow(/must be under/);
    expect(compressCalls).toHaveLength(0);
  });
});
