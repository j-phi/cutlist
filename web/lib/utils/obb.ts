/**
 * Oriented bounding-box dimensions for a box-shaped part.
 *
 * Area-weighted face-normal clustering: pick the heaviest cluster as axis 1,
 * the heaviest perpendicular cluster as axis 2, cross-product the third.
 * O'Rourke (1985): the min-volume OBB must align with a convex-hull face,
 * and for boxy CAD parts those faces are the part's own faces — so we get
 * the OBB axes directly, without PCA's √2 worst case on square panels.
 *
 * Falls back to the supplied AABB dims for non-boxy geometry.
 *
 * Known limitation: faceted cylinders (dowels, turned legs) pick an arbitrary
 * side facet as axis 2, so the two non-axial dims come out as random chord
 * lengths instead of the diameter. Boxy parts only.
 */

import type { BufferGeometry, Matrix4 } from 'three';

export interface ObbMeshInput {
  geometry: BufferGeometry;
  matrixWorld: Matrix4;
}

type Vec3 = [number, number, number];

const CLUSTER_COSINE_THRESHOLD = 0.995; // ~5.7°
const PERPENDICULAR_DOT_MAX = 0.3;

/**
 * Returns sorted dims `[thickness, width, length]`. `fallback` is the
 * extents from any AABB-derived calc — used when clustering can't find two
 * perpendicular axes (degenerate geometry).
 */
export function obbDimsFromMeshes(
  meshes: readonly ObbMeshInput[],
  fallback: Vec3,
): Vec3 {
  const sortedFallback = [...fallback].sort((a, b) => a - b) as Vec3;

  const worldPositions = collectWorldPositions(meshes);
  if (worldPositions.length < 9) return sortedFallback;

  const clusters = clusterFaceNormals(meshes, worldPositions);
  if (clusters.length === 0) return sortedFallback;

  clusters.sort((a, b) => b.weight - a.weight);
  const axis1 = clusters[0]!.dir;

  let axis2: Vec3 | null = null;
  for (let i = 1; i < clusters.length; i += 1) {
    if (Math.abs(dot(axis1, clusters[i]!.dir)) < PERPENDICULAR_DOT_MAX) {
      axis2 = clusters[i]!.dir;
      break;
    }
  }
  if (!axis2) return sortedFallback;

  const proj = dot(axis1, axis2);
  axis2 = normalize([
    axis2[0] - axis1[0] * proj,
    axis2[1] - axis1[1] * proj,
    axis2[2] - axis1[2] * proj,
  ]);
  const axis3 = normalize(cross(axis1, axis2));

  return [
    extentAlong(worldPositions, axis1),
    extentAlong(worldPositions, axis2),
    extentAlong(worldPositions, axis3),
  ].sort((a, b) => a - b) as Vec3;
}

function collectWorldPositions(meshes: readonly ObbMeshInput[]): Float32Array {
  let total = 0;
  for (const m of meshes) {
    const pos = m.geometry.attributes.position;
    if (pos) total += pos.count;
  }
  const out = new Float32Array(total * 3);
  let offset = 0;
  for (const m of meshes) {
    const pos = m.geometry.attributes.position;
    if (!pos) continue;
    const e = m.matrixWorld.elements;
    for (let i = 0; i < pos.count; i += 1) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      const z = pos.getZ(i);
      out[offset] = e[0]! * x + e[4]! * y + e[8]! * z + e[12]!;
      out[offset + 1] = e[1]! * x + e[5]! * y + e[9]! * z + e[13]!;
      out[offset + 2] = e[2]! * x + e[6]! * y + e[10]! * z + e[14]!;
      offset += 3;
    }
  }
  return out;
}

interface NormalCluster {
  dir: Vec3;
  weight: number;
}

function clusterFaceNormals(
  meshes: readonly ObbMeshInput[],
  worldPositions: Float32Array,
): NormalCluster[] {
  const clusters: NormalCluster[] = [];

  let baseVertex = 0;
  for (const m of meshes) {
    const pos = m.geometry.attributes.position;
    if (!pos) continue;
    const index = m.geometry.index;
    const triCount = index ? index.count / 3 : pos.count / 3;

    for (let t = 0; t < triCount; t += 1) {
      const i0 = index ? index.getX(t * 3) : t * 3;
      const i1 = index ? index.getX(t * 3 + 1) : t * 3 + 1;
      const i2 = index ? index.getX(t * 3 + 2) : t * 3 + 2;

      const p0 = vertexAt(worldPositions, baseVertex + i0);
      const p1 = vertexAt(worldPositions, baseVertex + i1);
      const p2 = vertexAt(worldPositions, baseVertex + i2);

      const e1: Vec3 = [p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]];
      const e2: Vec3 = [p2[0] - p0[0], p2[1] - p0[1], p2[2] - p0[2]];
      const n = cross(e1, e2);
      const len = Math.hypot(n[0], n[1], n[2]);
      if (len < 1e-12) continue;

      const area = len * 0.5;
      const normal = canonicalize([n[0] / len, n[1] / len, n[2] / len]);
      addToCluster(clusters, normal, area);
    }
    baseVertex += pos.count;
  }

  return clusters;
}

function addToCluster(
  clusters: NormalCluster[],
  normal: Vec3,
  weight: number,
): void {
  for (const c of clusters) {
    const d = dot(c.dir, normal);
    if (Math.abs(d) <= CLUSTER_COSINE_THRESHOLD) continue;

    const total = c.weight + weight;
    const sign = d >= 0 ? 1 : -1;
    c.dir = normalize([
      (c.dir[0] * c.weight + sign * normal[0] * weight) / total,
      (c.dir[1] * c.weight + sign * normal[1] * weight) / total,
      (c.dir[2] * c.weight + sign * normal[2] * weight) / total,
    ]);
    c.weight = total;
    return;
  }
  clusters.push({ dir: normal, weight });
}

function vertexAt(positions: Float32Array, i: number): Vec3 {
  return [positions[i * 3]!, positions[i * 3 + 1]!, positions[i * 3 + 2]!];
}

function extentAlong(positions: Float32Array, axis: Vec3): number {
  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < positions.length; i += 3) {
    const p =
      positions[i]! * axis[0] +
      positions[i + 1]! * axis[1] +
      positions[i + 2]! * axis[2];
    if (p < min) min = p;
    if (p > max) max = p;
  }
  return max - min;
}

/** Force the largest-magnitude component positive so `n` and `-n` collide. */
function canonicalize(n: Vec3): Vec3 {
  const ax = Math.abs(n[0]);
  const ay = Math.abs(n[1]);
  const az = Math.abs(n[2]);
  const dominant = ax >= ay && ax >= az ? n[0] : ay >= az ? n[1] : n[2];
  return dominant < 0 ? [-n[0], -n[1], -n[2]] : n;
}

function normalize(v: Vec3): Vec3 {
  const len = Math.hypot(v[0], v[1], v[2]);
  if (len < 1e-12) return v;
  return [v[0] / len, v[1] / len, v[2] / len];
}

function dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function cross(a: Vec3, b: Vec3): Vec3 {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}
