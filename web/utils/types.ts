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

// ─── Spatial / scene-domain types ───────────────────────────────────────────

export type CameraMode = 'perspective' | 'orthographic';

export interface CameraPose {
  position: [number, number, number];
  target: [number, number, number];
  /** THREE camera.zoom factor. Defaults to 1 when absent. */
  zoom?: number;
  /** Camera up vector. Defaults to [0, 1, 0] when absent. */
  up?: [number, number, number];
}

/**
 * A rigid (translation + rotation) offset applied to an Object after its
 * load-time `originalMatrix`. Stored as a 3-tuple position and a 4-tuple
 * quaternion (THREE.Quaternion order: x, y, z, w).
 *
 * Identity = `{ position: [0,0,0], quaternion: [0,0,0,1] }`.
 *
 * The rotation pivot is the world origin: applying a non-identity quaternion
 * rotates the Object around `(0,0,0)` after its originalMatrix has placed it.
 * Gizmo callers that want "rotate around the Object's centroid" must
 * conjugate (`T(c) · R · T(-c)`) before persisting.
 */
export interface ObjectOffset {
  position: [number, number, number];
  quaternion: [number, number, number, number];
}

export const IDENTITY_OBJECT_OFFSET: ObjectOffset = {
  position: [0, 0, 0],
  quaternion: [0, 0, 0, 1],
};

export function isIdentityObjectOffset(o: ObjectOffset): boolean {
  return (
    o.position[0] === 0 &&
    o.position[1] === 0 &&
    o.position[2] === 0 &&
    o.quaternion[0] === 0 &&
    o.quaternion[1] === 0 &&
    o.quaternion[2] === 0 &&
    o.quaternion[3] === 1
  );
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
