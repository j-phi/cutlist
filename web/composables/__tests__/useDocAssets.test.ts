/**
 * Boundary tests for `validateImageFile` — the single source of truth for
 * MIME and size policy on doc-image uploads. Every drop / paste / picker
 * path eventually calls `uploadImageAsset` which calls this; if these
 * cases pass, every path enforces them.
 */
import { describe, expect, it } from 'vitest';
import { MAX_IMAGE_BYTES, validateImageFile } from '../useDocAssets';

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
