/**
 * Remap embedded asset / model / scene ids inside a build-doc JSON tree.
 *
 * Build doc storage is a Tiptap JSON tree. Image and scene embeds appear
 * as nodes with `type: 'imageBlock' | 'sceneBlock'` and carry their refs
 * in `attrs.assetId`, `attrs.modelId`, `attrs.sceneId`. On import we
 * rewrite those attrs to the freshly-generated ids so references stay
 * valid in the importing client's IDB.
 *
 * Orphan ids (no entry in the relevant id map) are blanked rather than
 * rejected — the corresponding node renders its empty state.
 */

import type { JSONContent } from '@tiptap/core';

export interface BuildDocRemapMaps {
  assetIdMap: Map<string, string>;
  modelIdMap: Map<string, string>;
  sceneIdMap: Map<string, string>;
}

export function remapBuildDoc(
  doc: JSONContent,
  maps: BuildDocRemapMaps,
): JSONContent {
  return walk(doc, maps);
}

function walk(node: JSONContent, maps: BuildDocRemapMaps): JSONContent {
  const next: JSONContent = { ...node };
  if (node.type === 'imageBlock' && node.attrs) {
    const old = (node.attrs.assetId as string | undefined) ?? '';
    next.attrs = { ...node.attrs, assetId: maps.assetIdMap.get(old) ?? '' };
  } else if (node.type === 'sceneBlock' && node.attrs) {
    const oldModel = (node.attrs.modelId as string | undefined) ?? '';
    const oldScene = (node.attrs.sceneId as string | undefined) ?? '';
    next.attrs = {
      ...node.attrs,
      modelId: maps.modelIdMap.get(oldModel) ?? '',
      sceneId: maps.sceneIdMap.get(oldScene) ?? '',
    };
  }
  if (node.content) {
    next.content = node.content.map((c) => walk(c, maps));
  }
  return next;
}

/**
 * Walk a build-doc JSON tree and return the set of asset ids referenced
 * by `imageBlock` nodes. Used by orphan-asset GC to discover live refs
 * without re-parsing storage.
 */
export function collectAssetIds(doc: JSONContent): Set<string> {
  const out = new Set<string>();
  visit(doc, (node) => {
    if (node.type === 'imageBlock') {
      const id = node.attrs?.assetId;
      if (typeof id === 'string' && id) out.add(id);
    }
  });
  return out;
}

function visit(node: JSONContent, fn: (node: JSONContent) => void): void {
  fn(node);
  if (node.content) {
    for (const child of node.content) visit(child, fn);
  }
}
