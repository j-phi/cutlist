/**
 * Builds a `BatchedMesh` and per-Object `ObjectRecord` set from an
 * `ObjectGraph`. Owns the slice/attribute-normalize/instance-add pipeline
 * and the per-Object edge-line construction. Returns the artifacts
 * ViewerCore attaches to the scene and registry.
 *
 * No scene mutation here — the caller decides where the batched mesh and
 * edge lines hang in the SceneGraph.
 */

import type { GroupId, ObjectGraph, ObjectNode } from '~/utils/types';
import type { ObjectRecord } from '../types';

type BatchedMesh = import('three').BatchedMesh;
type Box3 = import('three').Box3;
type MeshStandardMaterial = import('three').MeshStandardMaterial;
type LineMaterial = import('three/addons/lines/LineMaterial.js').LineMaterial;
type LineSegments2 =
  import('three/addons/lines/LineSegments2.js').LineSegments2;

interface BatchLoaderDeps {
  THREE: typeof import('three');
  LineSegmentsGeometry: typeof import('three/addons/lines/LineSegmentsGeometry.js').LineSegmentsGeometry;
  LineSegments2: typeof import('three/addons/lines/LineSegments2.js').LineSegments2;
  batchMaterial: MeshStandardMaterial;
  edgeMaterial: LineMaterial;
}

export interface BatchLoadResult {
  batched: BatchedMesh;
  batchToGroupId: Map<number, GroupId>;
  originalColors: Map<number, [number, number, number, number]>;
  sceneBounds: Box3;
  records: ObjectRecord[];
  /** Convenience handle for attaching to the scene's edge group. */
  edgeLines: LineSegments2[];
}

interface Slice {
  object: ObjectNode;
  geometry: import('three').BufferGeometry;
  colorHex: string;
}

export class BatchLoader {
  constructor(private deps: BatchLoaderDeps) {}

  load(graph: ObjectGraph): BatchLoadResult | null {
    const { THREE, batchMaterial } = this.deps;

    const slices: Slice[] = [];
    for (const obj of graph.objects) {
      for (const m of obj.meshes) {
        slices.push({
          object: obj,
          geometry: m.geometry,
          colorHex: m.colorHex,
        });
      }
    }
    if (slices.length === 0) return null;

    this.normalizeAttributes(slices);

    let totalVerts = 0;
    let totalIdx = 0;
    for (const s of slices) {
      totalVerts += s.geometry.attributes.position.count;
      totalIdx += s.geometry.index ? s.geometry.index.count : 0;
    }

    const batch = new THREE.BatchedMesh(
      slices.length,
      totalVerts,
      totalIdx > 0 ? totalIdx : undefined,
      batchMaterial,
    );
    batch.castShadow = true;
    batch.receiveShadow = true;
    batch.sortObjects = false;

    const batchToGroupId = new Map<number, GroupId>();
    const originalColors = new Map<number, [number, number, number, number]>();
    const idsByObject = new Map<GroupId, number[]>();
    const sceneBounds = new THREE.Box3();
    const meshBox = new THREE.Box3();
    const colorScratch = new THREE.Color();
    const vec4 = new THREE.Vector4();

    for (const s of slices) {
      const geometryId = batch.addGeometry(s.geometry);
      const instanceId = batch.addInstance(geometryId);
      batch.setMatrixAt(instanceId, s.object.originalMatrix);

      const hex = parseInt(s.colorHex.slice(1), 16);
      const sr = ((hex >> 16) & 0xff) / 255;
      const sg = ((hex >> 8) & 0xff) / 255;
      const sb = (hex & 0xff) / 255;
      colorScratch.setRGB(sr, sg, sb, THREE.SRGBColorSpace);
      vec4.set(colorScratch.r, colorScratch.g, colorScratch.b, 1.0);
      batch.setColorAt(instanceId, vec4);
      originalColors.set(instanceId, [
        colorScratch.r,
        colorScratch.g,
        colorScratch.b,
        1.0,
      ]);

      const groupId = s.object.groupId;
      batchToGroupId.set(instanceId, groupId);
      const list = idsByObject.get(groupId);
      if (list) list.push(instanceId);
      else idsByObject.set(groupId, [instanceId]);

      s.geometry.computeBoundingBox();
      if (s.geometry.boundingBox) {
        meshBox
          .copy(s.geometry.boundingBox)
          .applyMatrix4(s.object.originalMatrix);
        sceneBounds.union(meshBox);
      }
    }

    const records: ObjectRecord[] = [];
    const edgeLines: LineSegments2[] = [];
    for (const obj of graph.objects) {
      const groupId = obj.groupId;
      const partNumber = obj.partNumber;

      const center = new THREE.Vector3();
      meshBox.makeEmpty();
      for (const m of obj.meshes) {
        m.geometry.computeBoundingBox();
        if (m.geometry.boundingBox) {
          meshBox.union(
            meshBox
              .clone()
              .copy(m.geometry.boundingBox)
              .applyMatrix4(obj.originalMatrix),
          );
        }
      }
      if (!meshBox.isEmpty()) meshBox.getCenter(center);

      const originalMatrixInverse = new THREE.Matrix4()
        .copy(obj.originalMatrix)
        .invert();

      const edge = this.buildEdgeLines(obj);
      if (edge) edgeLines.push(edge);

      const { center: boundsLocalCenter, radius: boundsLocalRadius } =
        computeLocalBoundingSphere(THREE, obj.edgesLocal);
      const { min: boundsLocalMin, max: boundsLocalMax } =
        computeLocalBoundingBox(THREE, obj.edgesLocal);

      records.push({
        groupId,
        partNumber,
        name: obj.name,
        batchIds: idsByObject.get(groupId) ?? [],
        originalMatrix: obj.originalMatrix.clone(),
        originalMatrixInverse,
        center,
        offset: {
          position: new THREE.Vector3(0, 0, 0),
          quaternion: new THREE.Quaternion(0, 0, 0, 1),
        },
        offsetMatrix: new THREE.Matrix4(),
        offsetMatrixInverse: new THREE.Matrix4(),
        edgesLocal: obj.edgesLocal,
        boundsLocalCenter,
        boundsLocalRadius,
        boundsLocalMin,
        boundsLocalMax,
        edgeLines: edge,
      });
    }

    return {
      batched: batch,
      batchToGroupId,
      originalColors,
      sceneBounds,
      records,
      edgeLines,
    };
  }

  private normalizeAttributes(slices: Slice[]): void {
    const { THREE } = this.deps;
    const allAttribs = new Set<string>();
    for (const s of slices) {
      for (const k of Object.keys(s.geometry.attributes)) allAttribs.add(k);
    }
    for (const s of slices) {
      for (const name of allAttribs) {
        if (s.geometry.attributes[name]) continue;
        const ref = slices.find((x) => x.geometry.attributes[name])!;
        const refAttr = ref.geometry.attributes[name];
        const count = s.geometry.attributes.position.count;
        s.geometry.setAttribute(
          name,
          new THREE.BufferAttribute(
            new Float32Array(count * refAttr.itemSize),
            refAttr.itemSize,
          ),
        );
      }
    }
  }

  private buildEdgeLines(obj: ObjectNode): LineSegments2 | null {
    const { THREE, LineSegmentsGeometry, LineSegments2, edgeMaterial } =
      this.deps;
    if (obj.edgesLocal.length === 0) return null;
    const lsg = new LineSegmentsGeometry();
    // edgesLocal is in source-mesh local space; bake the originalMatrix into a
    // world-space copy so the rendered LineSegments2 only needs to hold the
    // Object's offset (position + quaternion).
    const baked = new Float32Array(obj.edgesLocal.length);
    const v = new THREE.Vector3();
    for (let i = 0; i < obj.edgesLocal.length; i += 3) {
      v.set(
        obj.edgesLocal[i],
        obj.edgesLocal[i + 1],
        obj.edgesLocal[i + 2],
      ).applyMatrix4(obj.originalMatrix);
      baked[i] = v.x;
      baked[i + 1] = v.y;
      baked[i + 2] = v.z;
    }
    lsg.setPositions(baked);
    const lines = new LineSegments2(lsg, edgeMaterial);
    lines.computeLineDistances();
    lines.raycast = () => {};
    lines.castShadow = false;
    lines.renderOrder = 1;
    return lines;
  }
}

/**
 * Local-space bounding sphere over an edge buffer. Centre = mean of
 * endpoints (cheap, good enough — edges sample the silhouette densely);
 * radius = max distance from centre to any endpoint. Used by SnapDetector
 * for the screen-margin cull, so over-estimating slightly is fine.
 */
function computeLocalBoundingSphere(
  THREE: typeof import('three'),
  edgesLocal: Float32Array,
): { center: import('three').Vector3; radius: number } {
  const center = new THREE.Vector3();
  if (edgesLocal.length === 0) return { center, radius: 0 };
  const n = edgesLocal.length / 3;
  let cx = 0;
  let cy = 0;
  let cz = 0;
  for (let i = 0; i < edgesLocal.length; i += 3) {
    cx += edgesLocal[i];
    cy += edgesLocal[i + 1];
    cz += edgesLocal[i + 2];
  }
  cx /= n;
  cy /= n;
  cz /= n;
  center.set(cx, cy, cz);
  let r2 = 0;
  for (let i = 0; i < edgesLocal.length; i += 3) {
    const dx = edgesLocal[i] - cx;
    const dy = edgesLocal[i + 1] - cy;
    const dz = edgesLocal[i + 2] - cz;
    const d = dx * dx + dy * dy + dz * dz;
    if (d > r2) r2 = d;
  }
  return { center, radius: Math.sqrt(r2) };
}

/**
 * Local-space axis-aligned bounding box over an edge buffer. Used by
 * `MarqueeSelector` for a tight screen-AABB hit test. Tighter than the
 * bounding sphere for elongated parts (legs, rails) — projecting the eight
 * corners to screen still over-approximates the silhouette but does so by
 * the diagonal of the box, not the diameter of the enclosing sphere.
 */
function computeLocalBoundingBox(
  THREE: typeof import('three'),
  edgesLocal: Float32Array,
): { min: import('three').Vector3; max: import('three').Vector3 } {
  const min = new THREE.Vector3(Infinity, Infinity, Infinity);
  const max = new THREE.Vector3(-Infinity, -Infinity, -Infinity);
  if (edgesLocal.length === 0) {
    min.set(0, 0, 0);
    max.set(0, 0, 0);
    return { min, max };
  }
  for (let i = 0; i < edgesLocal.length; i += 3) {
    const x = edgesLocal[i];
    const y = edgesLocal[i + 1];
    const z = edgesLocal[i + 2];
    if (x < min.x) min.x = x;
    if (y < min.y) min.y = y;
    if (z < min.z) min.z = z;
    if (x > max.x) max.x = x;
    if (y > max.y) max.y = y;
    if (z > max.z) max.z = z;
  }
  return { min, max };
}
