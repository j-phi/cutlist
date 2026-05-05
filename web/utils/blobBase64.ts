/**
 * Helpers for round-tripping a `Blob` as a base64 string. Used by the
 * `.cutlist` export/import pipeline so binary asset bytes survive the JSON
 * envelope.
 *
 * The whole export is gzipped, so base64's ~33% inflation is paid only on
 * the wire briefly — the on-disk file is comparable to the raw bytes.
 */

export async function blobToBase64(blob: Blob): Promise<string> {
  const buf = await blob.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let binary = '';
  // Chunked to avoid blowing the call stack on multi-MB images.
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode.apply(
      null,
      Array.from(bytes.subarray(i, i + CHUNK)),
    );
  }
  return btoa(binary);
}

export function base64ToBlob(b64: string, mimeType: string): Blob {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Blob([bytes], { type: mimeType });
}
