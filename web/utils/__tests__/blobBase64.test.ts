import { describe, expect, it } from 'vitest';
import { blobToBase64, base64ToBlob } from '../blobBase64';

describe('blobBase64', () => {
  it('round-trips a small text blob byte-for-byte', async () => {
    const original = new Blob([new TextEncoder().encode('Hello, world! 🎉')], {
      type: 'image/png',
    });
    const b64 = await blobToBase64(original);
    const restored = base64ToBlob(b64, 'image/png');
    expect(restored.type).toBe('image/png');
    expect(await restored.text()).toBe('Hello, world! 🎉');
  });

  it('round-trips a binary blob with bytes spanning the chunk boundary', async () => {
    // 0x8000 is the chunk size; exceeding it exercises the loop path.
    const size = 0x8000 + 17;
    const bytes = new Uint8Array(size);
    for (let i = 0; i < size; i++) bytes[i] = i % 256;
    const original = new Blob([bytes], { type: 'image/jpeg' });

    const b64 = await blobToBase64(original);
    const restored = base64ToBlob(b64, 'image/jpeg');
    const restoredBytes = new Uint8Array(await restored.arrayBuffer());

    expect(restoredBytes).toHaveLength(size);
    for (let i = 0; i < size; i++) {
      expect(restoredBytes[i]).toBe(bytes[i]);
    }
  });

  it('survives an empty blob', async () => {
    const original = new Blob([], { type: 'image/webp' });
    const b64 = await blobToBase64(original);
    expect(b64).toBe('');
    const restored = base64ToBlob(b64, 'image/webp');
    expect(restored.size).toBe(0);
  });
});
