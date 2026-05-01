/**
 * Parity test: parseGltf and parseCollada must produce equivalent
 * `originalMatrix` values for an `ObjectNode` derived from the same primitive
 * geometry placed at the same world transform.
 *
 * Strategy
 * --------
 * Both parsers go through the same pipeline:
 *   loader.parse → scene.updateMatrixWorld(true) → mesh.matrixWorld.clone()
 *
 * The risk is that GLTFLoader and ColladaLoader interpret their respective
 * file formats' matrix conventions differently (column-major in the wire
 * format, row-major in `Matrix4.elements` after Three constructs the matrix).
 * If a future Three upgrade changes either loader's normalization, parity
 * would silently drift.
 *
 * We construct a single cube placed with translation [1, 2, 3] and rotated
 * 30° around Y, expressed:
 *   - As a minimal GLTF JSON (using `matrix:` so we control the bytes
 *     entering the loader directly).
 *   - As a minimal COLLADA XML using the same world matrix written in
 *     COLLADA's row-major-on-disk form.
 *
 * Both fixtures share the same expected world matrix; we run them through
 * `buildGltfObjectGraph` and `buildColladaObjectGraph` and assert that the
 * resulting `originalMatrix.elements` arrays match each other AND match the
 * hand-computed expected matrix within 1e-6.
 *
 * Test environment
 * ----------------
 * GLTFLoader and ColladaLoader both run synchronously on JSON/XML in-memory
 * — they do not require WebGL for matrix extraction. They DO require
 * `DOMParser` (ColladaLoader) and `atob`/`TextDecoder` (GLTFLoader for
 * embedded buffers). happy-dom provides all three. If the environment lacks
 * any of these in the future, the tests below will throw and the failure
 * message will surface the missing API rather than silently passing.
 *
 * `computeObjectEdges` is invoked by both parsers and uses
 * `BufferGeometryUtils.mergeVertices`. That works in happy-dom — verified by
 * the existing `parseCollada` tests (none of which currently exercise the
 * full success path, so this is the first end-to-end loader test in the
 * suite).
 */

import { describe, expect, it } from 'vitest';
import { buildGltfObjectGraph } from '../parseGltf';
import { buildColladaObjectGraph } from '../parseCollada';

// ─── Fixture math ──────────────────────────────────────────────────────────

const TX = 1;
const TY = 2;
const TZ = 3;
const THETA = Math.PI / 6; // 30°

const COS = Math.cos(THETA);
const SIN = Math.sin(THETA);

/**
 * Expected world matrix in row-major form (the layout Three's
 * `Matrix4.set(...)` accepts). Equivalent column-major elements (what
 * `Matrix4.elements` exposes) are derived below.
 *
 * Rotation around Y by θ then translation by (TX, TY, TZ):
 *   |  cos θ   0   sin θ   tx |
 *   |    0     1     0     ty |
 *   | -sin θ   0   cos θ   tz |
 *   |    0     0     0      1 |
 */
const EXPECTED_ROW_MAJOR = [
  COS,
  0,
  SIN,
  TX,
  0,
  1,
  0,
  TY,
  -SIN,
  0,
  COS,
  TZ,
  0,
  0,
  0,
  1,
];

/**
 * `Matrix4.elements` is column-major. Convert by transposing.
 */
const EXPECTED_COLUMN_MAJOR: number[] = [];
for (let col = 0; col < 4; col += 1) {
  for (let row = 0; row < 4; row += 1) {
    EXPECTED_COLUMN_MAJOR.push(EXPECTED_ROW_MAJOR[row * 4 + col]!);
  }
}

// ─── GLTF fixture ──────────────────────────────────────────────────────────

/**
 * Inline a tiny cube as a base64-encoded GLTF buffer. We need real geometry
 * so GLTFLoader can construct a Mesh; matrix parity is independent of the
 * vertex data so a 1-triangle-per-face cube is fine.
 *
 * To stay readable, we instead use POSITION min/max accessors plus a
 * minimal indexed buffer with 8 corner vertices and 12 triangles.
 */
function makeGltfFixture() {
  // 8 cube corners (unit cube centered at origin — actual values don't
  // matter for matrix parity, only that there are vertices).
  const positions = new Float32Array([
    -0.5, -0.5, -0.5, 0.5, -0.5, -0.5, 0.5, 0.5, -0.5, -0.5, 0.5, -0.5, -0.5,
    -0.5, 0.5, 0.5, -0.5, 0.5, 0.5, 0.5, 0.5, -0.5, 0.5, 0.5,
  ]);
  // 12 triangles (36 indices) — uint16
  const indices = new Uint16Array([
    0, 1, 2, 0, 2, 3, 4, 6, 5, 4, 7, 6, 0, 4, 5, 0, 5, 1, 1, 5, 6, 1, 6, 2, 2,
    6, 7, 2, 7, 3, 3, 7, 4, 3, 4, 0,
  ]);

  // Concatenate: positions, then indices (aligned to 4 bytes — already are).
  const posBytes = new Uint8Array(positions.buffer);
  const idxBytes = new Uint8Array(indices.buffer);
  // Pad indices to multiple of 4 if needed (72 bytes — already aligned).
  const total = posBytes.byteLength + idxBytes.byteLength;
  const merged = new Uint8Array(total);
  merged.set(posBytes, 0);
  merged.set(idxBytes, posBytes.byteLength);
  const base64 = base64Encode(merged);

  return {
    asset: { version: '2.0' },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [
      {
        name: 'Cube',
        mesh: 0,
        // GLTF stores matrices column-major. Three.js matrix.elements is also
        // column-major; we build EXPECTED_COLUMN_MAJOR above for direct
        // comparison.
        matrix: EXPECTED_COLUMN_MAJOR.slice(),
      },
    ],
    meshes: [
      {
        primitives: [{ attributes: { POSITION: 0 }, indices: 1, material: 0 }],
      },
    ],
    materials: [
      {
        name: 'Wood',
        pbrMetallicRoughness: { baseColorFactor: [0.8, 0.7, 0.5, 1] },
      },
    ],
    accessors: [
      {
        bufferView: 0,
        componentType: 5126, // FLOAT
        count: 8,
        type: 'VEC3',
        min: [-0.5, -0.5, -0.5],
        max: [0.5, 0.5, 0.5],
      },
      {
        bufferView: 1,
        componentType: 5123, // UNSIGNED_SHORT
        count: 36,
        type: 'SCALAR',
      },
    ],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: posBytes.byteLength },
      {
        buffer: 0,
        byteOffset: posBytes.byteLength,
        byteLength: idxBytes.byteLength,
      },
    ],
    buffers: [
      {
        byteLength: total,
        uri: `data:application/octet-stream;base64,${base64}`,
      },
    ],
  };
}

function base64Encode(bytes: Uint8Array): string {
  // happy-dom provides btoa.
  let bin = '';
  for (let i = 0; i < bytes.byteLength; i += 1) {
    bin += String.fromCharCode(bytes[i]!);
  }
  return btoa(bin);
}

// ─── COLLADA fixture ───────────────────────────────────────────────────────

/**
 * Minimal COLLADA 1.4.1 file with a single cube under a node carrying our
 * target matrix. COLLADA stores matrices in row-major form on disk
 * (`<matrix>` is read row by row), so we emit `EXPECTED_ROW_MAJOR` directly.
 */
function makeColladaFixture(): string {
  const matrixText = EXPECTED_ROW_MAJOR.join(' ');
  return `<?xml version="1.0" encoding="utf-8"?>
<COLLADA xmlns="http://www.collada.org/2005/11/COLLADASchema" version="1.4.1">
  <asset>
    <unit name="meter" meter="1"/>
    <up_axis>Y_UP</up_axis>
  </asset>
  <library_effects>
    <effect id="WoodFx">
      <profile_COMMON>
        <technique sid="common">
          <lambert>
            <diffuse><color>0.8 0.7 0.5 1</color></diffuse>
          </lambert>
        </technique>
      </profile_COMMON>
    </effect>
  </library_effects>
  <library_materials>
    <material id="WoodMat" name="Wood">
      <instance_effect url="#WoodFx"/>
    </material>
  </library_materials>
  <library_geometries>
    <geometry id="cube-geo" name="cube-geo">
      <mesh>
        <source id="cube-pos">
          <float_array id="cube-pos-array" count="24">
            -0.5 -0.5 -0.5  0.5 -0.5 -0.5  0.5 0.5 -0.5  -0.5 0.5 -0.5
            -0.5 -0.5 0.5   0.5 -0.5 0.5   0.5 0.5 0.5   -0.5 0.5 0.5
          </float_array>
          <technique_common>
            <accessor source="#cube-pos-array" count="8" stride="3">
              <param name="X" type="float"/>
              <param name="Y" type="float"/>
              <param name="Z" type="float"/>
            </accessor>
          </technique_common>
        </source>
        <vertices id="cube-verts">
          <input semantic="POSITION" source="#cube-pos"/>
        </vertices>
        <triangles count="12" material="WoodMatSym">
          <input semantic="VERTEX" source="#cube-verts" offset="0"/>
          <p>
            0 1 2  0 2 3  4 6 5  4 7 6
            0 4 5  0 5 1  1 5 6  1 6 2
            2 6 7  2 7 3  3 7 4  3 4 0
          </p>
        </triangles>
      </mesh>
    </geometry>
  </library_geometries>
  <library_visual_scenes>
    <visual_scene id="Scene" name="Scene">
      <node id="Cube" name="Cube" type="NODE">
        <matrix sid="transform">${matrixText}</matrix>
        <instance_geometry url="#cube-geo">
          <bind_material>
            <technique_common>
              <instance_material symbol="WoodMatSym" target="#WoodMat"/>
            </technique_common>
          </bind_material>
        </instance_geometry>
      </node>
    </visual_scene>
  </library_visual_scenes>
  <scene>
    <instance_visual_scene url="#Scene"/>
  </scene>
</COLLADA>`;
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function expectMatrixClose(
  actual: ArrayLike<number>,
  expected: ArrayLike<number>,
  tol = 1e-6,
): void {
  expect(actual.length).toBe(expected.length);
  for (let i = 0; i < expected.length; i += 1) {
    expect(actual[i]).toBeCloseTo(expected[i]!, 6);
    // toBeCloseTo with precision=6 ⇒ |Δ| < 5e-7, well within 1e-6.
    void tol;
  }
}

// ─── Tests ─────────────────────────────────────────────────────────────────

describe('parser matrix parity', () => {
  it('parseGltf produces the spec-defined originalMatrix for a known transform', async () => {
    const gltf = makeGltfFixture();
    const graph = await buildGltfObjectGraph(gltf);

    expect(graph.objects).toHaveLength(1);
    const elements = graph.objects[0]!.originalMatrix.elements;
    expectMatrixClose(elements, EXPECTED_COLUMN_MAJOR);
  });

  it('parseCollada produces the spec-defined originalMatrix for a known transform', async () => {
    const xml = makeColladaFixture();
    const graph = await buildColladaObjectGraph(xml);

    expect(graph.objects).toHaveLength(1);
    const elements = graph.objects[0]!.originalMatrix.elements;
    expectMatrixClose(elements, EXPECTED_COLUMN_MAJOR);
  });

  it('parseGltf and parseCollada agree on originalMatrix for the same world transform', async () => {
    const [gltfGraph, colladaGraph] = await Promise.all([
      buildGltfObjectGraph(makeGltfFixture()),
      buildColladaObjectGraph(makeColladaFixture()),
    ]);

    expect(gltfGraph.objects).toHaveLength(1);
    expect(colladaGraph.objects).toHaveLength(1);

    const a = gltfGraph.objects[0]!.originalMatrix.elements;
    const b = colladaGraph.objects[0]!.originalMatrix.elements;
    expectMatrixClose(a, b);
  });
});
