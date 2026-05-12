import type { ObjectGraph } from './types';
import { buildGltfObjectGraph } from './parseGltf';
import { fileBytesToGltfJson } from './assimpToGltf';

interface ResolveInput {
  source: 'gltf' | 'collada' | 'manual';
  rawSource: object | string | null | undefined;
}

/**
 * Re-derive the canonical ObjectGraph for a stored model. New imports persist
 * glTF JSON regardless of source format, so the common path is the fast glTF
 * derive. The `string`-rawSource branch handles legacy IDB records written
 * before the Assimp switch — those re-run the WASM converter once.
 */
export async function resolveModelScene(
  model: ResolveInput,
): Promise<ObjectGraph | null> {
  if (!model.rawSource) return null;
  if (typeof model.rawSource === 'object') {
    return buildGltfObjectGraph(model.rawSource);
  }
  if (model.source === 'collada') {
    const bytes = new TextEncoder().encode(model.rawSource);
    return buildGltfObjectGraph(await fileBytesToGltfJson(bytes, 'model.dae'));
  }
  return null;
}
