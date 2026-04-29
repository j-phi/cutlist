import { describe, expect, it } from 'vitest';
import { deriveFromGltf } from '../parseGltf';

/**
 * The async `buildGltfObjectGraph` path needs GLTFLoader (and a real WebGL
 * context) to run, which the happy-dom test environment can't provide.
 * `deriveFromGltf` is the synchronous JSON walker that produces the same
 * `nodePartMap` keying — testing it here covers the contract that group ids
 * are visit-order indices over mesh-bearing leaves.
 */

function flatGltf(names: string[]) {
  return {
    scene: 0,
    scenes: [{ nodes: names.map((_, i) => i) }],
    nodes: names.map((n, i) => ({ name: n, mesh: i })),
    meshes: names.map((_, i) => ({
      primitives: [{ attributes: { POSITION: i }, material: 0 }],
    })),
    accessors: names.map((_, i) => ({
      componentType: 5126,
      count: 8,
      type: 'VEC3',
      min: [0, 0, 0],
      max: [0.5 + i * 0.01, 0.3, 0.018],
    })),
    materials: [
      {
        name: 'Wood',
        pbrMetallicRoughness: { baseColorFactor: [0.8, 0.7, 0.5, 1] },
      },
    ],
  };
}

describe('deriveFromGltf — visit-order indexing', () => {
  it('Should assign monotonically increasing nodeIndex to mesh-bearing leaves', () => {
    const result = deriveFromGltf(
      flatGltf(['Long Rail', 'Short Rail', 'Strut']),
    );

    expect(result.nodePartMap).toHaveLength(3);
    expect(result.nodePartMap.map((e) => e.nodeIndex)).toEqual([0, 1, 2]);
  });

  it('Should skip non-mesh nodes when assigning visit-order', () => {
    const gltf = {
      scene: 0,
      scenes: [{ nodes: [0] }],
      // Parent has no mesh → not counted; child has mesh → groupId 0.
      nodes: [
        { name: 'GroupNode', children: [1] },
        { name: 'TheLeaf', mesh: 0 },
      ],
      meshes: [{ primitives: [{ attributes: { POSITION: 0 }, material: 0 }] }],
      accessors: [
        {
          componentType: 5126,
          count: 8,
          type: 'VEC3',
          min: [0, 0, 0],
          max: [0.5, 0.3, 0.018],
        },
      ],
      materials: [
        {
          name: 'Wood',
          pbrMetallicRoughness: { baseColorFactor: [0.8, 0.7, 0.5, 1] },
        },
      ],
    };

    const result = deriveFromGltf(gltf);
    expect(result.nodePartMap).toHaveLength(1);
    expect(result.nodePartMap[0].nodeIndex).toBe(0);
    // Naming surfaces from the leaf, not the group.
    expect(result.parts[0].name).toBe('TheLeaf');
  });

  it('Should preserve imported names rather than auto-generating Part_N strings', () => {
    const result = deriveFromGltf(flatGltf(['Drawer Side', 'Long Rail']));
    // Each name is unique, so each gets its own group → distinct partNumbers.
    expect(result.parts.map((p) => p.name)).toEqual([
      'Drawer Side',
      'Long Rail',
    ]);
  });
});
