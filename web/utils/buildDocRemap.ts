/**
 * Remap embedded asset / model / scene ids inside a build-doc HTML string.
 *
 * Build doc HTML contains `<image-block data-asset-id="…">` and
 * `<scene-block data-model-id="…" data-scene-id="…">` nodes. On import we
 * remap their referenced ids to the freshly-generated ids in the importing
 * client's IDB, so references stay valid after the new write.
 *
 * Orphan ids (no entry in the relevant id map) are blanked rather than
 * rejected — the corresponding node will render its empty state.
 */

export interface BuildDocRemapMaps {
  assetIdMap: Map<string, string>;
  modelIdMap: Map<string, string>;
  sceneIdMap: Map<string, string>;
}

export function remapBuildDocHtml(
  html: string,
  maps: BuildDocRemapMaps,
): string {
  if (!html) return html;

  const parser = new DOMParser();
  const doc = parser.parseFromString(`<root>${html}</root>`, 'text/html');
  const root = doc.querySelector('root');
  if (!root) return html;

  for (const el of Array.from(root.querySelectorAll('image-block'))) {
    const old = el.getAttribute('data-asset-id') ?? '';
    el.setAttribute('data-asset-id', maps.assetIdMap.get(old) ?? '');
  }
  for (const el of Array.from(root.querySelectorAll('scene-block'))) {
    const oldModel = el.getAttribute('data-model-id') ?? '';
    const oldScene = el.getAttribute('data-scene-id') ?? '';
    el.setAttribute('data-model-id', maps.modelIdMap.get(oldModel) ?? '');
    el.setAttribute('data-scene-id', maps.sceneIdMap.get(oldScene) ?? '');
  }

  return root.innerHTML;
}
