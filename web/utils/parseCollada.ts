import { groupPartInfos, rgbToHex, type PartInfo } from './groupPartInfos';
import {
  indexById,
  indexByPartNumber,
  type MeshSlice,
  type ObjectGraph,
  type ObjectNode,
} from './types';
import { computeObjectEdges } from '~/lib/viewer/edges';
import type { ColorInfo } from './modelTypes';

type Mesh = import('three').Mesh;
type Material = import('three').Material;
type MeshLambertMaterial = import('three').MeshLambertMaterial;

export interface ParseColladaResult extends ObjectGraph {
  rawSource: string;
}

/**
 * Parse a COLLADA (.dae) file exported from SketchUp/etc. Returns the
 * canonical ObjectGraph plus the raw XML for re-derivation on project load.
 *
 * SketchUp's exporter quirks (duplicate material groups, per-face normals)
 * are absorbed by `computeObjectEdges` — see `web/lib/viewer/edges.ts`.
 */
export async function parseCollada(file: File): Promise<ParseColladaResult> {
  const xmlText = await file.text();
  if (!xmlText.includes('<COLLADA')) {
    throw new Error(
      `"${file.name}" does not appear to be a COLLADA (.dae) file.`,
    );
  }
  const graph = await buildColladaObjectGraph(xmlText);
  return { ...graph, rawSource: xmlText };
}

export async function buildColladaObjectGraph(
  xmlText: string,
): Promise<ObjectGraph> {
  const [THREE, { ColladaLoader }] = await Promise.all([
    import('three'),
    import('three/addons/loaders/ColladaLoader.js'),
  ]);

  const loader = new ColladaLoader();
  const collada = loader.parse(xmlText, '');
  if (!collada?.scene) {
    throw new Error('Failed to parse COLLADA file.');
  }
  const scene = collada.scene;
  scene.updateMatrixWorld(true);

  // Two-phase walk:
  //  1. Collect mesh-bearing Object3Ds in DFS order, deriving PartInfo for
  //     grouping. groupId = mesh-leaf visit-order index.
  //  2. After grouping resolves partNumbers, build ObjectNodes (geometry,
  //     matrix, edges).

  interface Visit {
    groupId: number;
    mesh: Mesh;
    info: PartInfo;
  }

  const visits: Visit[] = [];
  let cursor = 0;

  scene.traverse((obj) => {
    const mesh = obj as Mesh;
    if (!mesh.isMesh) return;

    const material = resolveMaterial(mesh);
    if (!material) return;
    if (isEdgeMaterial(material.name)) return;

    const box = new THREE.Box3().setFromObject(mesh);
    if (box.isEmpty()) return;

    const size = new THREE.Vector3();
    box.getSize(size);
    const dims = [size.x, size.y, size.z].sort((a, b) => a - b);
    if (dims[0] < 1e-8 || dims[1] < 1e-8 || dims[2] < 1e-8) return;

    const { key, rgb, hex } = resolveColor(material);

    visits.push({
      groupId: cursor,
      mesh,
      info: {
        name: obj.name || '',
        colorKey: key,
        colorHex: hex,
        rgb,
        size: { thickness: dims[0], width: dims[1], length: dims[2] },
        nodeIndex: cursor,
      },
    });
    cursor++;
  });

  if (visits.length === 0) {
    throw new Error('No parts with geometry found in the COLLADA file.');
  }

  const grouped = groupPartInfos(visits.map((v) => v.info));
  const partByGroup = new Map<number, number>();
  for (const entry of grouped.nodePartMap) {
    partByGroup.set(entry.nodeIndex, entry.partNumber);
  }

  const objects: ObjectNode[] = [];

  for (const v of visits) {
    const meshSlices: MeshSlice[] = [
      { geometry: v.mesh.geometry, colorHex: v.info.colorHex },
    ];

    v.mesh.updateWorldMatrix(true, false);
    const originalMatrix = v.mesh.matrixWorld.clone();

    const partNumber = partByGroup.get(v.groupId) ?? 0;
    const edgesLocal = await computeObjectEdges(meshSlices);

    objects.push({
      groupId: v.groupId,
      partNumber,
      name: nameFor(v.info.name, partNumber),
      meshes: meshSlices,
      originalMatrix,
      edgesLocal,
    });

    if (objects.length % 16 === 0) await new Promise((r) => setTimeout(r, 0));
  }

  return {
    parts: grouped.parts,
    objects,
    objectIndex: indexById(objects),
    partIndex: indexByPartNumber(objects),
    colorMap: colorMapFromArray(grouped.colors),
    nodePartMap: grouped.nodePartMap,
  };
}

// ─── Material / mesh helpers ────────────────────────────────────────────────

function isEdgeMaterial(name: string): boolean {
  return /^edge_color/i.test(name);
}

function isDefaultMaterial(name: string): boolean {
  return /^material(_\d+)?$/i.test(name);
}

function resolveMaterial(mesh: Mesh): Material | null {
  const materials = Array.isArray(mesh.material)
    ? mesh.material
    : [mesh.material];
  let fallback: Material | null = null;
  for (const mat of materials) {
    if (!mat) continue;
    if (isEdgeMaterial(mat.name)) continue;
    if (isDefaultMaterial(mat.name)) {
      if (!fallback) fallback = mat;
      continue;
    }
    return mat;
  }
  return fallback;
}

function resolveColor(material: Material): {
  key: string;
  rgb: [number, number, number];
  hex: string;
} {
  const name = material.name || '';
  const matWithColor = material as MeshLambertMaterial;
  if (matWithColor.color) {
    const c = matWithColor.color;
    const rgb: [number, number, number] = [c.r, c.g, c.b];
    const hex = rgbToHex(rgb);
    const key = name && !isDefaultMaterial(name) ? name : hex;
    return { key, rgb, hex };
  }
  const fallbackRgb: [number, number, number] = [0.5, 0.5, 0.5];
  const key = name || 'Unknown';
  return { key, rgb: fallbackRgb, hex: rgbToHex(fallbackRgb) };
}

function nameFor(sourceName: string, partNumber: number): string {
  const trimmed = sourceName?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : `Part_${partNumber}`;
}

function colorMapFromArray(colors: ColorInfo[]): Record<string, ColorInfo> {
  const out: Record<string, ColorInfo> = {};
  for (const c of colors) out[c.key] = c;
  return out;
}
