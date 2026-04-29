import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { computeObjectEdges } from '../edges';
import type { MeshSlice } from '~/utils/types';

describe('computeObjectEdges', () => {
  it('Should produce 12 edges for a unit cube at the default 15° threshold', async () => {
    const cube = new THREE.BoxGeometry(1, 1, 1);
    const slice: MeshSlice = { geometry: cube, colorHex: '#ffffff' };

    const positions = await computeObjectEdges([slice]);

    // Each edge contributes two vertices (3 floats each) → 12 edges = 72 floats.
    expect(positions.length).toBe(12 * 2 * 3);
  });

  it('Should return an empty Float32Array when given no slices', async () => {
    const positions = await computeObjectEdges([]);
    expect(positions.length).toBe(0);
  });

  it('Should accumulate edges from multiple slices', async () => {
    const a = new THREE.BoxGeometry(1, 1, 1);
    const b = new THREE.BoxGeometry(1, 1, 1);
    const positions = await computeObjectEdges([
      { geometry: a, colorHex: '#fff' },
      { geometry: b, colorHex: '#fff' },
    ]);
    // Two cubes, each with 12 edges.
    expect(positions.length).toBe(24 * 2 * 3);
  });
});
