// @vitest-environment nuxt
/**
 * Boundary tests for `validateImageFile` — the single source of truth for
 * MIME and size policy on doc-image uploads. Every drop / paste / picker
 * path eventually calls `uploadImageAsset` which calls this; if these
 * cases pass, every path enforces them.
 *
 * Plus integration coverage of `uploadImageAsset` itself: the compression
 * step is mocked (browser-image-compression needs canvas + workers, neither
 * of which `happy-dom` provides) but every branch of the wrapper is
 * exercised — pick the smaller blob, fall back when compression bloats,
 * fall back when compression throws.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  COMPRESSION_OPTIONS,
  MAX_IMAGE_BYTES,
  validateImageFile,
} from '../useDocAssets';

const compressMock = vi.fn();
vi.mock('browser-image-compression', () => ({
  default: (file: File, opts: unknown) => compressMock(file, opts),
}));

// Spy on `createAsset` at its source. `useIdb()` returns a fresh object
// on every call, so a test-side spy wouldn't intercept the composable's
// internal call; mocking the export catches every reference.
const createAssetSpy = vi.fn();
vi.mock('../useIdb/assets', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../useIdb/assets')>();
  return {
    ...actual,
    createAsset: (input: Parameters<typeof actual.createAsset>[0]) => {
      createAssetSpy(input);
      return actual.createAsset(input);
    },
  };
});

import useDocAssets from '../useDocAssets';
import { useIdb } from '../useIdb';

describe('validateImageFile', () => {
  it('accepts a small PNG', () => {
    expect(() =>
      validateImageFile({ type: 'image/png', size: 1024 }),
    ).not.toThrow();
  });

  it('accepts JPEG and WebP', () => {
    expect(() =>
      validateImageFile({ type: 'image/jpeg', size: 1024 }),
    ).not.toThrow();
    expect(() =>
      validateImageFile({ type: 'image/webp', size: 1024 }),
    ).not.toThrow();
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

  it('accepts a file exactly at the size cap', () => {
    expect(() =>
      validateImageFile({ type: 'image/png', size: MAX_IMAGE_BYTES }),
    ).not.toThrow();
  });

  it('rejects a file one byte over the cap', () => {
    expect(() =>
      validateImageFile({ type: 'image/png', size: MAX_IMAGE_BYTES + 1 }),
    ).toThrow(/must be under/);
  });

  it('mentions the actual file size in the error so users know what to trim', () => {
    expect(() =>
      validateImageFile({
        type: 'image/jpeg',
        size: 25 * 1024 * 1024, // 25 MB
      }),
    ).toThrow(/25\.0 MB/);
  });

  it('checks MIME before size, so an invalid huge file reports the type problem first', () => {
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

  /** Args of every `createAsset` call. Probing here, not after the IDB
   * round-trip, sidesteps happy-dom's lossy `Blob` serialization. */
  function createAssetInputs(): { mimeType: string; blob: Blob }[] {
    return createAssetSpy.mock.calls.map((args) => args[0]);
  }

  let projectId: string;

  beforeEach(async () => {
    compressMock.mockReset();
    createAssetSpy.mockReset();
    const project = await useIdb().createProject('P');
    projectId = project.id;
  });

  it('passes the source file and compression options through to the worker', async () => {
    const file = makeFile(2_000_000);
    compressMock.mockResolvedValueOnce(
      new Blob([new Uint8Array(100)], { type: 'image/webp' }),
    );

    await useDocAssets().uploadImageAsset(file, projectId);

    expect(compressMock).toHaveBeenCalledTimes(1);
    expect(compressMock).toHaveBeenCalledWith(file, COMPRESSION_OPTIONS);
  });

  it('stores the compressed blob (with its WebP mime) when smaller than the source', async () => {
    const file = makeFile(2_000_000, 'image/jpeg');
    const compressed = new Blob([new Uint8Array(50_000)], {
      type: 'image/webp',
    });
    compressMock.mockResolvedValueOnce(compressed);
    await useDocAssets().uploadImageAsset(file, projectId);

    const inputs = createAssetInputs();
    expect(inputs).toHaveLength(1);
    expect(inputs[0].mimeType).toBe('image/webp');
    expect(inputs[0].blob).toBe(compressed);
  });

  it('keeps the original when re-encoding produced a larger blob', async () => {
    // Tiny WebP that the encoder would only inflate. Mimic that case.
    const file = makeFile(800, 'image/webp');
    const inflated = new Blob([new Uint8Array(1_500)], { type: 'image/webp' });
    compressMock.mockResolvedValueOnce(inflated);
    await useDocAssets().uploadImageAsset(file, projectId);

    const inputs = createAssetInputs();
    expect(inputs).toHaveLength(1);
    expect(inputs[0].mimeType).toBe('image/webp');
    expect(inputs[0].blob).toBe(file);
  });

  it('falls back to the original when compression throws', async () => {
    const file = makeFile(1_000_000, 'image/png');
    compressMock.mockRejectedValueOnce(new Error('encoder unavailable'));
    await useDocAssets().uploadImageAsset(file, projectId);

    const inputs = createAssetInputs();
    expect(inputs).toHaveLength(1);
    // We never reached a usable compressed blob, so the PNG hits IDB unchanged.
    expect(inputs[0].mimeType).toBe('image/png');
    expect(inputs[0].blob).toBe(file);
  });

  it('rejects oversized files before invoking the compressor', async () => {
    const file = makeFile(MAX_IMAGE_BYTES + 1, 'image/jpeg');

    await expect(
      useDocAssets().uploadImageAsset(file, projectId),
    ).rejects.toThrow(/must be under/);
    expect(compressMock).not.toHaveBeenCalled();
  });
});
