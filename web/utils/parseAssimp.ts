import { buildGltfObjectGraph } from './parseGltf';
import { fileBytesToGltfJson } from './assimpToGltf';
import type { ObjectGraph } from './types';

/**
 * Curated subset of Assimp-readable formats that map cleanly to per-part
 * cut-list output. Single-mesh (`stl`, `ply`) and split-per-face (`obj`)
 * formats are intentionally excluded — re-enable once we have a UI for
 * merging or splitting parts after import.
 *
 * `gltf` is omitted because it has a native fast path in `parseGltf`;
 * `glb` goes through Assimp because that path only handles JSON glTF.
 */
export const ASSIMP_EXTENSIONS = ['dae', 'fbx', 'glb'] as const;

export type AssimpExtension = (typeof ASSIMP_EXTENSIONS)[number];

export interface ParseAssimpResult extends ObjectGraph {
  rawSource: object;
}

export async function parseAssimp(file: File): Promise<ParseAssimpResult> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const gltfJson = await fileBytesToGltfJson(bytes, file.name);
  const graph = await buildGltfObjectGraph(gltfJson);
  if (graph.parts.length === 0) {
    throw new Error(`No parts with geometry found in "${file.name}".`);
  }
  return { ...graph, rawSource: gltfJson };
}

export function getFileExtension(name: string): string {
  const idx = name.lastIndexOf('.');
  return idx >= 0 ? name.slice(idx + 1).toLowerCase() : '';
}

export function isAssimpExtension(ext: string): ext is AssimpExtension {
  return (ASSIMP_EXTENSIONS as readonly string[]).includes(ext);
}
