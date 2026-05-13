/**
 * End-to-end regression: a vertex-baked rotation (Onshape / SketchUp Pro /
 * Fusion 360 pattern) must still report the part's intrinsic dims so
 * rotated and un-rotated twins group together.
 */

import { describe, expect, it } from 'vitest';
import { buildGltfObjectGraph } from '../parseGltf';

const COS_45 = Math.cos(Math.PI / 4);
const SIN_45 = Math.sin(Math.PI / 4);

function rotX(x: number, y: number, z: number): [number, number, number] {
  return [x, y * COS_45 - z * SIN_45, y * SIN_45 + z * COS_45];
}

function makeBoxPositions(
  hx: number,
  hy: number,
  hz: number,
  rotate?: (x: number, y: number, z: number) => [number, number, number],
): Float32Array {
  const corners: [number, number, number][] = [
    [-hx, -hy, -hz],
    [hx, -hy, -hz],
    [hx, hy, -hz],
    [-hx, hy, -hz],
    [-hx, -hy, hz],
    [hx, -hy, hz],
    [hx, hy, hz],
    [-hx, hy, hz],
  ];
  const v = rotate ? corners.map(([x, y, z]) => rotate(x, y, z)) : corners;
  const arr = new Float32Array(v.length * 3);
  for (let i = 0; i < v.length; i += 1) {
    arr[i * 3] = v[i]![0];
    arr[i * 3 + 1] = v[i]![1];
    arr[i * 3 + 2] = v[i]![2];
  }
  return arr;
}

// 12 triangles indexing 8 corners.
const CUBE_INDICES = new Uint16Array([
  0, 1, 2, 0, 2, 3, 4, 6, 5, 4, 7, 6, 0, 4, 5, 0, 5, 1, 1, 5, 6, 1, 6, 2, 2, 6,
  7, 2, 7, 3, 3, 7, 4, 3, 4, 0,
]);

function base64Encode(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.byteLength; i += 1)
    bin += String.fromCharCode(bytes[i]!);
  return btoa(bin);
}

function makeGltf(positionsList: Float32Array[]) {
  const idxBytes = new Uint8Array(CUBE_INDICES.buffer);
  const posBytesList = positionsList.map(
    (p) => new Uint8Array(p.buffer, p.byteOffset, p.byteLength),
  );
  const sizes = [...posBytesList.map((b) => b.byteLength), idxBytes.byteLength];
  const total = sizes.reduce((a, b) => a + b, 0);
  const merged = new Uint8Array(total);
  let offset = 0;
  const offsets: number[] = [];
  for (const b of posBytesList) {
    offsets.push(offset);
    merged.set(b, offset);
    offset += b.byteLength;
  }
  const idxOffset = offset;
  merged.set(idxBytes, idxOffset);

  const minMax = positionsList.map((p) => {
    let xmin = Infinity,
      ymin = Infinity,
      zmin = Infinity;
    let xmax = -Infinity,
      ymax = -Infinity,
      zmax = -Infinity;
    for (let i = 0; i < p.length; i += 3) {
      if (p[i]! < xmin) xmin = p[i]!;
      if (p[i]! > xmax) xmax = p[i]!;
      if (p[i + 1]! < ymin) ymin = p[i + 1]!;
      if (p[i + 1]! > ymax) ymax = p[i + 1]!;
      if (p[i + 2]! < zmin) zmin = p[i + 2]!;
      if (p[i + 2]! > zmax) zmax = p[i + 2]!;
    }
    return { min: [xmin, ymin, zmin], max: [xmax, ymax, zmax] };
  });

  return {
    asset: { version: '2.0' },
    scene: 0,
    scenes: [{ nodes: positionsList.map((_, i) => i) }],
    nodes: positionsList.map((_, i) => ({ name: `Part ${i + 1}`, mesh: i })),
    meshes: positionsList.map((_, i) => ({
      primitives: [
        {
          attributes: { POSITION: i * 2 },
          indices: i * 2 + 1,
          material: 0,
        },
      ],
    })),
    materials: [
      {
        name: 'Plywood',
        pbrMetallicRoughness: { baseColorFactor: [0.8, 0.7, 0.5, 1] },
      },
    ],
    accessors: positionsList.flatMap((p, i) => [
      {
        bufferView: i,
        componentType: 5126,
        count: p.length / 3,
        type: 'VEC3',
        min: minMax[i]!.min,
        max: minMax[i]!.max,
      },
      {
        bufferView: positionsList.length,
        componentType: 5123,
        count: CUBE_INDICES.length,
        type: 'SCALAR',
      },
    ]),
    bufferViews: [
      ...posBytesList.map((b, i) => ({
        buffer: 0,
        byteOffset: offsets[i]!,
        byteLength: b.byteLength,
      })),
      { buffer: 0, byteOffset: idxOffset, byteLength: idxBytes.byteLength },
    ],
    buffers: [
      {
        byteLength: total,
        uri: `data:application/octet-stream;base64,${base64Encode(merged)}`,
      },
    ],
  };
}

describe('buildGltfObjectGraph OBB recovery', () => {
  it('groups a flat panel with its vertex-baked-rotated twin', async () => {
    // 18 × 300 × 362 mm — half-extents in metres.
    const flat = makeBoxPositions(0.009, 0.15, 0.181);
    const baked = makeBoxPositions(0.009, 0.15, 0.181, rotX);

    const graph = await buildGltfObjectGraph(makeGltf([flat, baked]));

    expect(graph.parts).toHaveLength(2);
    const [a, b] = graph.parts;
    expect(b.size.thickness).toBe(a.size.thickness);
    expect(b.size.width).toBe(a.size.width);
    expect(b.size.length).toBe(a.size.length);
    expect(b.size.thickness).toBe(18_000);
    expect(b.size.width).toBe(300_000);
    expect(b.size.length).toBe(362_000);
    expect(new Set(graph.parts.map((p) => p.partNumber))).toEqual(new Set([1]));
  });
});
