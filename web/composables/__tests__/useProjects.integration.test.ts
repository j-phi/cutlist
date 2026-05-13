/**
 * Integration tests for the IDB ↔ hydration boundary.
 *
 * Single-record CRUD lives in useIdb.test.ts; pure-function applyOverrides
 * semantics live in utils/__tests__/modelHydration.test.ts. This file covers the cases
 * where those layers interact in non-trivial ways — multi-model projects,
 * GLTF-derived data round-tripping through IDB metadata, and the batch
 * partOverride flow that crosses both layers.
 */
import { describe, expect, it } from 'vitest';
import { mmToUm } from 'cutlist';
import { useIdb, type IdbModel } from '../useIdb';
import type { Part } from '~/utils/modelTypes';
import { applyOverrides } from '~/utils/modelHydration';

const idb = useIdb();

function makePart(partNumber: number, overrides?: Partial<Part>): Part {
  return {
    partNumber,
    instanceNumber: 1,
    name: `Part ${partNumber}`,
    colorKey: '#aaa',
    size: {
      width: mmToUm(300),
      length: mmToUm(500),
      thickness: mmToUm(18),
    },
    ...overrides,
  };
}

function makeModel(
  projectId: string,
  overrides: Partial<IdbModel> = {},
): IdbModel {
  return {
    id: crypto.randomUUID(),
    projectId,
    filename: 'test.glb',
    source: 'gltf',
    parts: [],
    colors: [],
    nodePartMap: [],
    enabled: true,
    rawSource: {},
    partOverrides: {},
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

// ─── GLTF derived data survives the IDB round-trip ──────────────────────────

describe('GLTF model derived data round-trip', () => {
  it('stores and retrieves parts + colors + nodePartMap together', async () => {
    const project = await idb.createProject('GltfDerivedDataTest');
    await idb.createModel(
      makeModel(project.id, {
        filename: 'test.glb',
        parts: [makePart(1)],
        colors: [{ key: '#fff', rgb: [1, 1, 1], count: 1 }],
        nodePartMap: [{ nodeIndex: 0, partNumber: 1, colorHex: '#fff' }],
      }),
    );

    const full = await idb.getProjectWithModels(project.id);
    const meta = full!.models[0];
    expect(meta.colors).toEqual([{ key: '#fff', rgb: [1, 1, 1], count: 1 }]);
    expect(meta.nodePartMap).toEqual([
      { nodeIndex: 0, partNumber: 1, colorHex: '#fff' },
    ]);
    expect(meta.parts).toHaveLength(1);
  });
});

// ─── Batch partOverride flow (IDB write → metadata read → applyOverrides) ───
//
// Covers the full path users see when they batch-rename in the BOM tab:
// override is keyed by partNumber, persists in IDB, and on hydrate it must
// fan out to every instance sharing that partNumber. The pure apply logic is
// covered in useModelHydration.test; here we confirm it flows through IDB.

describe('batch name override IDB round-trip', () => {
  it('applies persisted batch + individual overrides to every matching instance', async () => {
    const project = await idb.createProject('BatchRenameTest');
    const parts: Part[] = [
      makePart(1, { name: 'Mesh_001', colorKey: 'red' }),
      makePart(1, { name: 'Mesh_001', colorKey: 'red', instanceNumber: 2 }),
      makePart(2, { name: 'Mesh_002', colorKey: 'red' }),
      makePart(3, { name: 'Mesh_003', colorKey: 'blue' }),
    ];
    const modelId = crypto.randomUUID();
    await idb.createModel(makeModel(project.id, { id: modelId, parts }));

    // Batch rename red parts (1 + 2) to "Shelf"; rename part 3 individually.
    await idb.updateModel(modelId, {
      partOverrides: {
        1: { name: 'Shelf' },
        2: { name: 'Shelf' },
        3: { name: 'Custom Cleat' },
      },
    });
    await idb.flushPendingModelWrites();

    const full = await idb.getProjectWithModels(project.id);
    const hydrated = applyOverrides(
      full!.models[0].parts,
      full!.models[0].partOverrides,
    );

    // Both red instances of partNumber 1 renamed.
    expect(hydrated[0].name).toBe('Shelf');
    expect(hydrated[1].name).toBe('Shelf');
    // Part 2 (red, single instance) renamed.
    expect(hydrated[2].name).toBe('Shelf');
    // Part 3 individual override.
    expect(hydrated[3].name).toBe('Custom Cleat');
  });
});

// ─── Multiple models per project ────────────────────────────────────────────

describe('multiple models per project', () => {
  it('returns every model attached to the project', async () => {
    const project = await idb.createProject('MultiModelTest');
    for (let i = 0; i < 3; i++) {
      await idb.createModel(
        makeModel(project.id, {
          filename: `model-${i}.glb`,
          source: i === 0 ? 'manual' : 'gltf',
          rawSource: i === 0 ? null : { mock: true },
          parts: [makePart(1, { name: `Part from model ${i}` })],
        }),
      );
    }

    const full = await idb.getProjectWithModels(project.id);
    expect(full!.models).toHaveLength(3);
  });

  it('removing one model leaves the others intact', async () => {
    const project = await idb.createProject('RemoveModelTest');
    const ids: string[] = [];
    for (let i = 0; i < 3; i++) {
      const id = crypto.randomUUID();
      ids.push(id);
      await idb.createModel(
        makeModel(project.id, {
          id,
          source: 'manual',
          rawSource: null,
          filename: `model-${i}.glb`,
        }),
      );
    }

    await idb.deleteModel(ids[1]);

    const full = await idb.getProjectWithModels(project.id);
    expect(full!.models).toHaveLength(2);
    expect(full!.models.map((m) => m.id).sort()).toEqual(
      [ids[0], ids[2]].sort(),
    );
  });
});
