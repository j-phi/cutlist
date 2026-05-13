import type { ObjectGraph } from './types';
import { buildGltfObjectGraph } from './parseGltf';
import { fileBytesToGltfJson } from './assimpToGltf';

interface ResolveInput {
  rawSource: object | string | null | undefined;
}

/**
 * Re-derive the canonical ObjectGraph for a stored model. New imports persist
 * glTF JSON; the `string`-rawSource branch handles legacy IDB records written
 * before the Assimp switch, which re-run the WASM converter once.
 */
export async function resolveModelScene(
  model: ResolveInput,
): Promise<ObjectGraph | null> {
  if (!model.rawSource) return null;
  if (typeof model.rawSource === 'object') {
    return buildGltfObjectGraph(model.rawSource);
  }
  const bytes = new TextEncoder().encode(model.rawSource);
  return buildGltfObjectGraph(await fileBytesToGltfJson(bytes, 'model.dae'));
}
