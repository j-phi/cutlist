/**
 * Resolve build-doc embed refs into static URLs.
 *
 * The build-time extractor (`scripts/build-plans.ts`) writes asset blobs and
 * scene thumbnails as real image files under `_build/<slug>/{assets,scenes}/`.
 * This walker rewrites every `imageBlock` / `sceneBlock` node so its `attrs`
 * carry a `resolvedUrl` pointing at the extracted file. The marketplace
 * Tiptap extensions render against `resolvedUrl` directly, so the runtime
 * never has to look anything up.
 *
 * Missing refs are tolerated — the node keeps the original id but gets a
 * blank `resolvedUrl` so renderers can show an empty placeholder.
 */

import type { JSONContent } from '@tiptap/core';

export interface ResolvedRefMaps {
  /** assetId → public URL (e.g. `/plans/_build/coffee-table/assets/abc.png`) */
  assetUrls: Map<string, string>;
  /** sceneId → public URL of the scene thumbnail */
  sceneUrls: Map<string, string>;
}

export function injectResolvedRefs(
  doc: JSONContent,
  maps: ResolvedRefMaps,
): JSONContent {
  return walk(doc, maps);
}

function walk(node: JSONContent, maps: ResolvedRefMaps): JSONContent {
  const next: JSONContent = { ...node };

  if (node.type === 'imageBlock' && node.attrs) {
    const id = (node.attrs.assetId as string | undefined) ?? '';
    next.attrs = {
      ...node.attrs,
      resolvedUrl: maps.assetUrls.get(id) ?? '',
    };
  } else if (node.type === 'sceneBlock' && node.attrs) {
    const id = (node.attrs.sceneId as string | undefined) ?? '';
    next.attrs = {
      ...node.attrs,
      resolvedUrl: maps.sceneUrls.get(id) ?? '',
    };
  }

  if (node.content) {
    next.content = node.content.map((c) => walk(c, maps));
  }
  return next;
}
