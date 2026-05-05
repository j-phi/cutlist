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

function isAllowedImageMime(mime: string): mime is AllowedImageMime {
  return (ALLOWED_IMAGE_MIME as readonly string[]).includes(mime);
}

export default function useDocAssets() {
  const idb = useIdb();

  /**
   * Persist an image file as an asset record. Rejects unsupported MIME types
   * at the boundary rather than letting them sneak into IDB.
   */
  async function uploadImageAsset(file: File, projectId: string) {
    if (!isAllowedImageMime(file.type)) {
      throw new Error(
        `Unsupported image type "${file.type}". Use PNG, JPEG, or WebP.`,
      );
    }
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
