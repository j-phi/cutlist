/**
 * Asset upload + URL resolution for build-doc image blocks.
 *
 * Two thin layers over the IDB asset table:
 *
 * - `uploadImageAsset(file, projectId)` — stores a `File`/`Blob` and returns
 *   the asset id to drop into an image block.
 * - `useAssetUrl(assetId)` — a reactive object URL bound to the calling
 *   component's lifecycle. The URL is created on demand and revoked when
 *   either the assetId changes or the component unmounts, so consumers don't
 *   leak blob URLs.
 */

import {
  onScopeDispose,
  ref,
  watch,
  type MaybeRefOrGetter,
  toValue,
} from 'vue';

const ALLOWED_IMAGE_MIME = ['image/png', 'image/jpeg', 'image/webp'] as const;
type AllowedImageMime = (typeof ALLOWED_IMAGE_MIME)[number];

/**
 * Per-image size cap. Generous enough for phone photos and typical
 * screenshots; tight enough to keep IDB responsive and the editor snappy.
 * Drag-from-tab fetches use this as a pre-flight memory bound too.
 */
export const MAX_IMAGE_BYTES = 15 * 1024 * 1024;
const MAX_IMAGE_MB = MAX_IMAGE_BYTES / 1024 / 1024;

function isAllowedImageMime(mime: string): mime is AllowedImageMime {
  return (ALLOWED_IMAGE_MIME as readonly string[]).includes(mime);
}

/**
 * Throws a user-facing Error if the file fails MIME or size checks.
 * Single source of truth — every upload path (toolbar picker, drag/drop,
 * paste, URL fetch) routes through `uploadImageAsset`, which calls this.
 */
export function validateImageFile(file: { type: string; size: number }): void {
  if (!isAllowedImageMime(file.type)) {
    throw new Error(
      `Unsupported image type "${file.type}". Use PNG, JPEG, or WebP.`,
    );
  }
  if (file.size > MAX_IMAGE_BYTES) {
    const mb = (file.size / 1024 / 1024).toFixed(1);
    throw new Error(`Image is ${mb} MB — must be under ${MAX_IMAGE_MB} MB.`);
  }
}

export default function useDocAssets() {
  const idb = useIdb();

  /**
   * Persist an image file as an asset record. Rejects unsupported MIME
   * types and oversized files at the boundary rather than letting them
   * sneak into IDB.
   */
  async function uploadImageAsset(file: File, projectId: string) {
    validateImageFile(file);
    return idb.createAsset({
      projectId,
      mimeType: file.type,
      blob: file,
    });
  }

  /**
   * Reactive object URL for an asset id. Returns `null` until the asset
   * loads, or if the id is empty/missing.
   */
  function useAssetUrl(
    assetIdSource: MaybeRefOrGetter<string | null | undefined>,
  ) {
    const url = ref<string | null>(null);
    let current: string | null = null;

    function revoke() {
      if (current) {
        URL.revokeObjectURL(current);
        current = null;
      }
    }

    watch(
      () => toValue(assetIdSource),
      async (id, _prev, onCleanup) => {
        revoke();
        url.value = null;
        if (!id) return;

        let cancelled = false;
        onCleanup(() => {
          cancelled = true;
        });

        const asset = await idb.getAsset(id);
        if (cancelled || !asset) return;
        current = URL.createObjectURL(asset.blob);
        url.value = current;
      },
      { immediate: true },
    );

    onScopeDispose(revoke);

    return url;
  }

  return {
    uploadImageAsset,
    useAssetUrl,
  };
}
