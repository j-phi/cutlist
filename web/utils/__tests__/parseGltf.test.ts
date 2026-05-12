import { describe, expect, it } from 'vitest';
import { deriveFromGltf } from '../parseGltf';

interface FixtureNode {
  name: string;
  size: [number, number, number];
  material: number;
}

function makeGltf(nodes: FixtureNode[]) {
  return {
    scene: 0,
    scenes: [{ nodes: nodes.map((_, i) => i) }],
    nodes: nodes.map((n, i) => ({ name: n.name, mesh: i })),
    meshes: nodes.map((n, i) => ({
      name: `Mesh ${i}`,
      primitives: [{ attributes: { POSITION: i }, material: n.material }],
    })),
    accessors: nodes.map((n) => ({
      componentType: 5126,
      count: 8,
      type: 'VEC3',
      min: [0, 0, 0],
      max: [...n.size],
    })),
    materials: [
      {
        name: 'Birch Ply',
        pbrMetallicRoughness: { baseColorFactor: [0.9, 0.85, 0.75, 1] },
      },
      {
        name: 'Walnut',
        pbrMetallicRoughness: { baseColorFactor: [0.3, 0.2, 0.1, 1] },
      },
    ],
  };
}

describe('deriveFromGltf dimensions for rotated nodes', () => {
  function quatAroundZ(angleRad: number): [number, number, number, number] {
    const half = angleRad / 2;
    return [0, 0, Math.sin(half), Math.cos(half)];
  }

  it('returns the same dims for a part regardless of node rotation', () => {
    const flat = deriveFromGltf({
      scene: 0,
      scenes: [{ nodes: [0, 1] }],
      nodes: [
        { name: 'Flat', mesh: 0 },
        { name: 'Rotated', mesh: 0, rotation: quatAroundZ(Math.PI / 4) },
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
          name: 'Birch Ply',
          pbrMetallicRoughness: { baseColorFactor: [0.9, 0.85, 0.75, 1] },
        },
      ],
    });

    expect(flat.parts).toHaveLength(2);
    const [a, b] = flat.parts;
    expect(a.size.thickness).toBeCloseTo(b.size.thickness, 8);
    expect(a.size.width).toBeCloseTo(b.size.width, 8);
    expect(a.size.length).toBeCloseTo(b.size.length, 8);
    expect(b.size.thickness).toBeCloseTo(0.018, 8);
    expect(b.size.width).toBeCloseTo(0.3, 8);
    expect(b.size.length).toBeCloseTo(0.5, 8);
  });

  it('still applies node scale to part dims', () => {
    const result = deriveFromGltf({
      scene: 0,
      scenes: [{ nodes: [0] }],
      nodes: [
        {
          name: 'Scaled',
          mesh: 0,
          scale: [2, 1, 0.5],
          rotation: quatAroundZ(Math.PI / 6),
        },
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
          name: 'Birch Ply',
          pbrMetallicRoughness: { baseColorFactor: [0.9, 0.85, 0.75, 1] },
        },
      ],
    });

    // Source (0.018, 0.3, 0.5) × scale (0.5, 1, 2) → (0.009, 0.3, 1.0).
    const size = result.parts[0].size;
    expect(size.thickness).toBeCloseTo(0.009, 8);
    expect(size.width).toBeCloseTo(0.3, 8);
    expect(size.length).toBeCloseTo(1.0, 8);
  });
});

describe('deriveFromGltf dimension canonicalization', () => {
  it('snaps mesh extents to the canonical mm grid', () => {
    const result = deriveFromGltf(
      makeGltf([{ name: 'Top', size: [1.2192, 0.9144, 0.01905], material: 0 }]),
    );
    const size = result.parts[0].size;
    expect(size.length).toBe(1219.2 / 1000);
    expect(size.width).toBe(914.4 / 1000);
    expect(size.thickness).toBe(19.05 / 1000);
  });
});

describe('deriveFromGltf grouping', () => {
  it('merges same stock + same size with different names into one group using first name', () => {
    const result = deriveFromGltf(
      makeGltf([
        { name: 'Left Side', size: [0.5, 0.3, 0.018], material: 0 },
        { name: 'Right Side', size: [0.5, 0.3, 0.018], material: 0 },
      ]),
    );

    expect(result.parts).toHaveLength(2);
    expect(new Set(result.parts.map((p) => p.partNumber))).toEqual(
      new Set([1]),
    );
    // Uses the first-encountered name, no suffix
    expect(result.parts.map((p) => p.name)).toEqual(['Left Side', 'Left Side']);
  });

  it('treats W×L and L×W as the same dimensions for grouping', () => {
    const result = deriveFromGltf(
      makeGltf([
        { name: 'Panel A', size: [0.5, 0.3, 0.018], material: 0 },
        { name: 'Panel B', size: [0.3, 0.5, 0.018], material: 0 },
      ]),
    );

    expect(result.parts).toHaveLength(2);
    expect(new Set(result.parts.map((p) => p.partNumber))).toEqual(
      new Set([1]),
    );
  });

  it('keeps groups separate when stock identity differs', () => {
    const result = deriveFromGltf(
      makeGltf([
        { name: 'Panel A', size: [0.5, 0.3, 0.018], material: 0 },
        { name: 'Panel B', size: [0.5, 0.3, 0.018], material: 1 },
      ]),
    );

    expect(result.parts).toHaveLength(2);
    expect(result.parts.map((p) => p.partNumber)).toEqual([1, 2]);
    expect(result.parts.map((p) => p.colorKey)).toEqual([
      'Birch Ply',
      'Walnut',
    ]);
  });

  it('keeps groups separate when thickness differs', () => {
    const result = deriveFromGltf(
      makeGltf([
        { name: 'Shelf', size: [0.5, 0.3, 0.018], material: 0 },
        { name: 'Shelf', size: [0.5, 0.3, 0.012], material: 0 },
      ]),
    );

    expect(result.parts).toHaveLength(2);
    expect(result.parts.map((p) => p.partNumber)).toEqual([1, 2]);
  });

  it('groups parts within 0.1mm tolerance', () => {
    const result = deriveFromGltf(
      makeGltf([
        { name: 'Panel', size: [0.5, 0.3, 0.018], material: 0 },
        // Differs by 0.04mm — within 0.1mm grid cell
        { name: 'Panel', size: [0.50004, 0.3, 0.018], material: 0 },
      ]),
    );

    expect(result.parts).toHaveLength(2);
    expect(new Set(result.parts.map((p) => p.partNumber))).toEqual(
      new Set([1]),
    );
  });

  it('stores canonical dimensions (width <= length) on grouped parts', () => {
    const result = deriveFromGltf(
      makeGltf([
        { name: 'Panel A', size: [0.5, 0.3, 0.018], material: 0 },
        { name: 'Panel B', size: [0.3, 0.5, 0.018], material: 0 },
      ]),
    );

    // Both instances should have identical canonical dimensions
    for (const part of result.parts) {
      expect(part.size.width).toBeLessThanOrEqual(part.size.length);
    }
    expect(result.parts[0].size.width).toBe(result.parts[1].size.width);
    expect(result.parts[0].size.length).toBe(result.parts[1].size.length);
  });

  it('assigns deterministic part numbers based on first group appearance order', () => {
    const result = deriveFromGltf(
      makeGltf([
        { name: 'A1', size: [0.5, 0.3, 0.018], material: 0 },
        { name: 'B1', size: [0.5, 0.3, 0.018], material: 1 },
        { name: 'A2', size: [0.5, 0.3, 0.018], material: 0 },
      ]),
    );

    const byNode = new Map(
      result.nodePartMap.map((entry) => [entry.nodeIndex, entry.partNumber]),
    );

    expect(byNode.get(0)).toBe(1);
    expect(byNode.get(1)).toBe(2);
    expect(byNode.get(2)).toBe(1);
    expect(result.parts.map((p) => p.partNumber)).toEqual([1, 1, 2]);
  });
});
