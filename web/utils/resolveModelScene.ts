import type { ObjectGraph } from './types';
import { buildGltfObjectGraph } from './parseGltf';
import { buildColladaObjectGraph } from './parseCollada';

interface ResolveInput {
  source: 'gltf' | 'collada' | 'manual';
  rawSource: object | string | null | undefined;
}

/**
 * Re-derive the canonical ObjectGraph for a stored model. The raw source is
 * persisted at import time; this re-runs the parser to recover per-Object
 * geometry, transforms, and edges on demand.
 */
export async function resolveModelScene(
  model: ResolveInput,
): Promise<ObjectGraph | null> {
  if (model.source === 'gltf' && model.rawSource) {
    return buildGltfObjectGraph(model.rawSource as object);
  }
  if (model.source === 'collada' && model.rawSource) {
    return buildColladaObjectGraph(model.rawSource as string);
  }
  return null;
}
