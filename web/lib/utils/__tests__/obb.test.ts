import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { obbDimsFromMeshes } from '../obb';

function makeBox(hx: number, hy: number, hz: number): THREE.BufferGeometry {
  const v = [
    [-hx, -hy, -hz], // 0
    [hx, -hy, -hz], // 1
    [hx, hy, -hz], // 2
    [-hx, hy, -hz], // 3
    [-hx, -hy, hz], // 4
    [hx, -hy, hz], // 5
    [hx, hy, hz], // 6
    [-hx, hy, hz], // 7
  ];
  const positions = new Float32Array(36 * 3);
  const faces = [
    [0, 3, 2, 1], // -Z
    [4, 5, 6, 7], // +Z
    [0, 1, 5, 4], // -Y
    [2, 3, 7, 6], // +Y
    [0, 4, 7, 3], // -X
    [1, 2, 6, 5], // +X
  ];
  let off = 0;
  for (const [a, b, c, d] of faces) {
    // Two triangles per face with consistent (outward) winding.
    for (const i of [a, b, c, a, c, d]) {
      positions[off] = v[i!]![0]!;
      positions[off + 1] = v[i!]![1]!;
      positions[off + 2] = v[i!]![2]!;
      off += 3;
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  return geo;
}

function bakeRotation(
  geo: THREE.BufferGeometry,
  axis: THREE.Vector3,
  angleRad: number,
): void {
  const m = new THREE.Matrix4().makeRotationAxis(
    axis.clone().normalize(),
    angleRad,
  );
  geo.applyMatrix4(m);
}

function dims(geo: THREE.BufferGeometry, m?: THREE.Matrix4) {
  return obbDimsFromMeshes(
    [{ geometry: geo, matrixWorld: m ?? new THREE.Matrix4() }],
    [0, 0, 0],
  );
}

describe('obbDimsFromMeshes', () => {
  it('returns the AABB extents for an axis-aligned box', () => {
    const geo = makeBox(0.009, 0.15, 0.181); // 18 × 300 × 362 mm
    const out = dims(geo);
    expect(out[0]).toBeCloseTo(0.018, 6);
    expect(out[1]).toBeCloseTo(0.3, 6);
    expect(out[2]).toBeCloseTo(0.362, 6);
  });

  it('recovers true dims under a baked rotation around an arbitrary axis', () => {
    const geo = makeBox(0.009, 0.15, 0.181);
    bakeRotation(geo, new THREE.Vector3(0.3, 0.7, 0.4), (37 * Math.PI) / 180);
    const out = dims(geo);
    expect(out[0]).toBeCloseTo(0.018, 6);
    expect(out[1]).toBeCloseTo(0.3, 6);
    expect(out[2]).toBeCloseTo(0.362, 6);
  });

  it('handles a square panel rotated 30° (PCA worst case)', () => {
    const geo = makeBox(0.15, 0.15, 0.009);
    bakeRotation(geo, new THREE.Vector3(0, 0, 1), Math.PI / 6);
    const out = dims(geo);
    expect(out[0]).toBeCloseTo(0.018, 6);
    expect(out[1]).toBeCloseTo(0.3, 6);
    expect(out[2]).toBeCloseTo(0.3, 6);
  });

  it('applies matrixWorld scale (e.g. unit conversion) to dims', () => {
    const geo = makeBox(0.5, 0.5, 0.5); // unit box
    const m = new THREE.Matrix4().makeScale(0.0254, 0.0254, 0.0254); // inches→m
    const out = dims(geo, m);
    expect(out[0]).toBeCloseTo(0.0254, 6);
    expect(out[1]).toBeCloseTo(0.0254, 6);
    expect(out[2]).toBeCloseTo(0.0254, 6);
  });

  it('falls back to AABB dims for degenerate geometry (single triangle)', () => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute(
      'position',
      new THREE.BufferAttribute(
        new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
        3,
      ),
    );
    const out = obbDimsFromMeshes(
      [{ geometry: geo, matrixWorld: new THREE.Matrix4() }],
      [0.1, 0.2, 0.3],
    );
    expect(out).toEqual([0.1, 0.2, 0.3]);
  });

  it('is unaffected by a tiny chamfer-like face on a boxy part', () => {
    const box = makeBox(0.009, 0.15, 0.181);
    const tinyPositions = new Float32Array([
      0.009,
      0.15,
      0.181, // existing corner
      0.0089,
      0.15,
      0.181,
      0.009,
      0.1499,
      0.181,
    ]);
    const tiny = new THREE.BufferGeometry();
    tiny.setAttribute('position', new THREE.BufferAttribute(tinyPositions, 3));

    const out = obbDimsFromMeshes(
      [
        { geometry: box, matrixWorld: new THREE.Matrix4() },
        { geometry: tiny, matrixWorld: new THREE.Matrix4() },
      ],
      [0, 0, 0],
    );
    expect(out[0]).toBeCloseTo(0.018, 6);
    expect(out[1]).toBeCloseTo(0.3, 6);
    expect(out[2]).toBeCloseTo(0.362, 6);
  });

  it('prefers AABB fallback when OBB agrees within 0.1mm', () => {
    // A boxy axis-aligned mesh: face-normal clustering may produce sub-mm
    // OBB drift on identical instances. When the answer is already inside the
    // AABB-preference window we return the (bit-stable) fallback verbatim so
    // grouping doesn't split otherwise-identical parts.
    const geo = makeBox(0.00953, 0.04128, 0.44768); // ~3/4 × 3¼ × 35¼ in mm
    const out = obbDimsFromMeshes(
      [{ geometry: geo, matrixWorld: new THREE.Matrix4() }],
      [0.01905, 0.0826, 0.89535],
    );
    expect(out).toEqual([0.01905, 0.0826, 0.89535]);
  });

  it('works with an indexed BufferGeometry', () => {
    const geo = makeBox(0.009, 0.15, 0.181);
    const triCount = geo.attributes.position!.count / 3;
    const idx = new Uint32Array(triCount * 3);
    for (let i = 0; i < idx.length; i += 1) idx[i] = i;
    geo.setIndex(new THREE.BufferAttribute(idx, 1));
    bakeRotation(geo, new THREE.Vector3(0, 0, 1), Math.PI / 4);
    const out = dims(geo);
    expect(out[0]).toBeCloseTo(0.018, 6);
    expect(out[1]).toBeCloseTo(0.3, 6);
    expect(out[2]).toBeCloseTo(0.362, 6);
  });
});
