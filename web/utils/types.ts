/**
 * Canonical model-domain types for the Object-graph pipeline.
 *
 * `ObjectGraph` is the single shape every consumer (BOM, viewer, annotations)
 * reads from. It collapses the historical split where each consumer derived
 * its own view of the imported file.
 */

import type { Part, ColorInfo, NodePartMapping } from './modelTypes';

export type GroupId = number;
export type PartNumber = number;

export interface MeshSlice {
  geometry: import('three').BufferGeometry;
  colorHex: string;
}

export interface ObjectNode {
  groupId: GroupId;
  partNumber: PartNumber;
  name: string;
  meshes: MeshSlice[];
  originalMatrix: import('three').Matrix4;
  edgesLocal: Float32Array;
}

export interface ObjectGraph {
  parts: Part[];
  objects: ObjectNode[];
  objectIndex: Map<GroupId, ObjectNode>;
  partIndex: Map<PartNumber, ObjectNode[]>;
  colorMap: Record<string, ColorInfo>;
  nodePartMap: NodePartMapping[];
}

export function indexById(objects: ObjectNode[]): Map<GroupId, ObjectNode> {
  const m = new Map<GroupId, ObjectNode>();
  for (const o of objects) m.set(o.groupId, o);
  return m;
}

export function indexByPartNumber(
  objects: ObjectNode[],
): Map<PartNumber, ObjectNode[]> {
  const m = new Map<PartNumber, ObjectNode[]>();
  for (const o of objects) {
    const list = m.get(o.partNumber);
    if (list) list.push(o);
    else m.set(o.partNumber, [o]);
  }
  return m;
}
