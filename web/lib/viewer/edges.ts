/**
 * Per-Object edge generation. Computed once at load time and stored on the
 * ObjectNode in local space; the viewer translates the corresponding
 * LineSegments2 by the Object's offset rather than regenerating.
 *
 * Two SketchUp/COLLADA workarounds are isolated here because they are
 * defensive against quirks of the upstream exporter:
 *
 *   1. SketchUp emits each face twice across separate material groups
 *      (front + back). EdgesGeometry's adjacency pairing then thinks each
 *      physical edge touches 4+ triangles and emits every internal
 *      triangulation line. When `groups.length > 1` on a non-indexed
 *      geometry, restrict to the first group's vertices.
 *   2. ColladaLoader produces non-indexed geometry with per-face normals;
 *      `mergeVertices` won't collapse positionally-identical vertices when
 *      normals differ. Strip to a position-only clone before merging.
 */

import type { MeshSlice } from '~/utils/types';

type BufferGeometry = import('three').BufferGeometry;

export async function computeObjectEdges(
  meshes: MeshSlice[],
  thresholdDeg = 15,
): Promise<Float32Array> {
  if (meshes.length === 0) return new Float32Array(0);

  const [THREE, { mergeVertices }] = await Promise.all([
    import('three'),
    import('three/addons/utils/BufferGeometryUtils.js'),
  ]);

  const positions: number[] = [];

  for (const slice of meshes) {
    const src = slice.geometry;
    const indexed = src.index
      ? src
      : positionOnlyMerged(src, THREE, mergeVertices);
    const edges = new THREE.EdgesGeometry(indexed, thresholdDeg);
    const arr = edges.attributes.position.array as Float32Array;
    for (let i = 0; i < arr.length; i++) positions.push(arr[i]);
    edges.dispose();
    if (indexed !== src) indexed.dispose();
  }

  return new Float32Array(positions);
}

function positionOnlyMerged(
  src: BufferGeometry,
  THREE: typeof import('three'),
  mergeVertices: (typeof import('three/addons/utils/BufferGeometryUtils.js'))['mergeVertices'],
): BufferGeometry {
  const srcPos = src.attributes.position;
  let posAttr = srcPos;

  if (src.groups.length > 1) {
    const g = src.groups[0];
    const arr = new Float32Array(g.count * 3);
    for (let vi = 0; vi < g.count; vi++) {
      arr[vi * 3] = srcPos.getX(g.start + vi);
      arr[vi * 3 + 1] = srcPos.getY(g.start + vi);
      arr[vi * 3 + 2] = srcPos.getZ(g.start + vi);
    }
    posAttr = new THREE.BufferAttribute(arr, 3);
  }

  const posOnly = new THREE.BufferGeometry();
  posOnly.setAttribute('position', posAttr);
  return mergeVertices(posOnly);
}
