/**
 * Tests for the manual-part CRUD inside useProjectModels — addManualPart,
 * removeManualPart, updateManualPart. These functions read from the
 * module-level `activeProjectData` ref and persist to IDB (fake-indexeddb),
 * so the test seeds both before exercising the functions.
 */
import { describe, expect, it, beforeEach } from 'vitest';
import { mmToUm } from 'cutlist';
import { useIdb } from '~/composables/useIdb';
import type { Part } from '~/utils/modelTypes';
import type { Project, ManualPartInput } from '../types';
import useProjectModels from '../useProjectModels';
import { activeProjectData } from '../state';
import { DEFAULT_SETTINGS } from '~/utils/settings';

const idb = useIdb();

function makeProject(id: string, models: Project['models'] = []): Project {
  return {
    id,
    name: 'Test Project',
    models,
    colorMap: {},
    excludedColors: [],
    stocks: [],
    distanceUnit: DEFAULT_SETTINGS.distanceUnit,
    precision: DEFAULT_SETTINGS.precision,
    bladeWidth: DEFAULT_SETTINGS.bladeWidth,
    margin: DEFAULT_SETTINGS.margin,
    defaultAlgorithm: DEFAULT_SETTINGS.defaultAlgorithm,
    showPartNumbers: DEFAULT_SETTINGS.showPartNumbers,
    showBomName: DEFAULT_SETTINGS.showBomName,
    layoutAlignH: DEFAULT_SETTINGS.layoutAlignH,
    layoutAlignV: DEFAULT_SETTINGS.layoutAlignV,
    labelPlacement: DEFAULT_SETTINGS.labelPlacement,
    bandingThicknessUm: DEFAULT_SETTINGS.bandingThicknessUm,
    subtractBandingThickness: DEFAULT_SETTINGS.subtractBandingThickness,
    optimizationObjective: DEFAULT_SETTINGS.optimizationObjective,
  };
}

function makeManualModel(id: string, parts: Part[]): Project['models'][number] {
  return {
    id,
    filename: 'Manual Parts',
    source: 'manual',
    parts,
    colors: [],
    enabled: true,
  };
}

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

function makeInput(overrides?: Partial<ManualPartInput>): ManualPartInput {
  return {
    name: 'Side Panel',
    widthUm: mmToUm(300),
    lengthUm: mmToUm(600),
    thicknessUm: mmToUm(18),
    qty: 1,
    material: 'Plywood',
    ...overrides,
  };
}

describe('addManualPart', () => {
  let projectId: string;

  beforeEach(async () => {
    activeProjectData.value = null;
    const project = await idb.createProject('ManualPartTest');
    projectId = project.id;
    activeProjectData.value = makeProject(projectId);
  });

  it('creates a part with correct defaults', async () => {
    const { addManualPart } = useProjectModels();

    await addManualPart(
      projectId,
      makeInput({
        name: 'Shelf',
        widthUm: mmToUm(400),
        lengthUm: mmToUm(800),
        thicknessUm: mmToUm(18),
        qty: 1,
        material: 'Oak',
      }),
    );

    const project = activeProjectData.value!;
    expect(project.models).toHaveLength(1);

    const model = project.models[0];
    expect(model.source).toBe('manual');
    expect(model.filename).toBe('Manual Parts');
    expect(model.parts).toHaveLength(1);

    const part = model.parts[0];
    expect(part.partNumber).toBe(1);
    expect(part.instanceNumber).toBe(1);
    expect(part.name).toBe('Shelf');
    expect(part.colorKey).toBe('Oak');
    expect(part.size.width).toBe(mmToUm(400));
    expect(part.size.length).toBe(mmToUm(800));
    expect(part.size.thickness).toBe(mmToUm(18));
  });

  it('assigns sequential partNumbers', async () => {
    const modelId = crypto.randomUUID();
    const existingParts = [makePart(1, { name: 'First' })];

    activeProjectData.value = makeProject(projectId, [
      makeManualModel(modelId, existingParts),
    ]);
    await idb.createModel({
      id: modelId,
      projectId,
      filename: 'Manual Parts',
      source: 'manual',
      parts: existingParts,
      colors: [],
      nodePartMap: [],
      enabled: true,
      rawSource: null,
      partOverrides: {},
      createdAt: new Date().toISOString(),
    });

    const { addManualPart } = useProjectModels();
    await addManualPart(projectId, makeInput({ name: 'Second' }));

    const model = activeProjectData.value!.models.find(
      (m) => m.source === 'manual',
    )!;
    const partNumbers = [...new Set(model.parts.map((p) => p.partNumber))];
    expect(partNumbers).toContain(1);
    expect(partNumbers).toContain(2);
  });

  it('creates multiple instances when qty > 1', async () => {
    const { addManualPart } = useProjectModels();
    await addManualPart(projectId, makeInput({ qty: 3, name: 'Leg' }));

    const model = activeProjectData.value!.models[0];
    expect(model.parts).toHaveLength(3);
    expect(model.parts.every((p) => p.partNumber === 1)).toBe(true);
    const instances = model.parts.map((p) => p.instanceNumber).sort();
    expect(instances).toEqual([1, 2, 3]);
  });

  it('writes the new material into the colorMap when unseen', async () => {
    const { addManualPart } = useProjectModels();
    await addManualPart(projectId, makeInput({ material: 'Walnut' }));

    expect(activeProjectData.value!.colorMap).toHaveProperty(
      'Walnut',
      'Walnut',
    );
    const persisted = await idb.getProjectWithModels(projectId);
    expect(persisted!.colorMap).toHaveProperty('Walnut', 'Walnut');
  });

  it('stores grainLock in partOverrides, not on the Part', async () => {
    const { addManualPart } = useProjectModels();
    await addManualPart(
      projectId,
      makeInput({ grainLock: 'length', name: 'Grain Test' }),
    );

    const model = activeProjectData.value!.models[0];
    expect(model.parts[0].grainLock).toBe('length');

    const full = await idb.getProjectWithModels(projectId);
    const idbModel = full!.models[0];
    expect(idbModel.partOverrides[1]).toEqual({ grainLock: 'length' });
  });

  it('does nothing if project ID does not match', async () => {
    const { addManualPart } = useProjectModels();
    await addManualPart('wrong-id', makeInput());
    expect(activeProjectData.value!.models).toHaveLength(0);
  });
});

describe('removeManualPart', () => {
  let projectId: string;
  let modelId: string;

  beforeEach(async () => {
    activeProjectData.value = null;
    const project = await idb.createProject('RemovePartTest');
    projectId = project.id;
    modelId = crypto.randomUUID();

    const parts = [
      makePart(1, { name: 'Rail' }),
      makePart(2, { name: 'Stile' }),
      makePart(3, { name: 'Panel' }),
    ];

    activeProjectData.value = makeProject(projectId, [
      makeManualModel(modelId, parts),
    ]);

    await idb.createModel({
      id: modelId,
      projectId,
      filename: 'Manual Parts',
      source: 'manual',
      parts,
      colors: [],
      nodePartMap: [],
      enabled: true,
      rawSource: null,
      partOverrides: {},
      createdAt: new Date().toISOString(),
    });
  });

  it('removes the correct part by partNumber', async () => {
    const { removeManualPart } = useProjectModels();
    await removeManualPart(projectId, 2);

    const model = activeProjectData.value!.models[0];
    expect(model.parts).toHaveLength(2);
    const names = model.parts.map((p) => p.name);
    expect(names).toContain('Rail');
    expect(names).toContain('Panel');
    expect(names).not.toContain('Stile');
  });

  it('Should remove stale overrides and persist only raw remaining parts', async () => {
    const partsWithOverridesApplied = [
      makePart(1, { name: 'Rail', grainLock: 'length' }),
      makePart(2, { name: 'Stile', grainLock: 'width' }),
      makePart(3, { name: 'Panel' }),
    ];
    activeProjectData.value = makeProject(projectId, [
      makeManualModel(modelId, partsWithOverridesApplied),
    ]);

    await idb.updateModel(modelId, {
      parts: [
        makePart(1, { name: 'Rail' }),
        makePart(2, { name: 'Stile' }),
        makePart(3, { name: 'Panel' }),
      ],
      partOverrides: {
        1: { grainLock: 'length' },
        2: { grainLock: 'width' },
      },
    });
    await idb.flushPendingModelWrites();

    const { removeManualPart } = useProjectModels();
    await removeManualPart(projectId, 2);
    await idb.flushPendingModelWrites();

    const persisted = (await idb.getProjectWithModels(projectId))!.models[0];
    expect(persisted.partOverrides).toEqual({ 1: { grainLock: 'length' } });
    expect(persisted.parts.map((p) => p.partNumber)).toEqual([1, 3]);
    expect(persisted.parts[0].grainLock).toBeUndefined();

    const reactiveModel = activeProjectData.value!.models[0];
    expect(reactiveModel.parts[0].grainLock).toBe('length');
    expect(reactiveModel.parts.some((p) => p.partNumber === 2)).toBe(false);
  });

  it('removes the manual model entirely when last part is removed', async () => {
    const singlePartModelId = crypto.randomUUID();
    const singleProject = await idb.createProject('SinglePartRemove');
    const singleParts = [makePart(1, { name: 'Only Part' })];

    activeProjectData.value = makeProject(singleProject.id, [
      makeManualModel(singlePartModelId, singleParts),
    ]);

    await idb.createModel({
      id: singlePartModelId,
      projectId: singleProject.id,
      filename: 'Manual Parts',
      source: 'manual',
      parts: singleParts,
      colors: [],
      nodePartMap: [],
      enabled: true,
      rawSource: null,
      partOverrides: {},
      createdAt: new Date().toISOString(),
    });

    const { removeManualPart } = useProjectModels();
    await removeManualPart(singleProject.id, 1);

    expect(activeProjectData.value!.models).toHaveLength(0);
  });

  it('does nothing if project ID does not match', async () => {
    const { removeManualPart } = useProjectModels();
    await removeManualPart('wrong-id', 1);
    expect(activeProjectData.value!.models[0].parts).toHaveLength(3);
  });
});

describe('updateManualPart', () => {
  let projectId: string;
  let modelId: string;

  beforeEach(async () => {
    activeProjectData.value = null;
    const project = await idb.createProject('UpdatePartTest');
    projectId = project.id;
    modelId = crypto.randomUUID();

    const parts = [
      makePart(1, { name: 'Rail', colorKey: 'Oak' }),
      makePart(2, { name: 'Stile', colorKey: 'Oak' }),
    ];

    activeProjectData.value = makeProject(projectId, [
      makeManualModel(modelId, parts),
    ]);

    await idb.createModel({
      id: modelId,
      projectId,
      filename: 'Manual Parts',
      source: 'manual',
      parts,
      colors: [],
      nodePartMap: [],
      enabled: true,
      rawSource: null,
      partOverrides: {},
      createdAt: new Date().toISOString(),
    });
  });

  it('updates dimensions correctly', async () => {
    const { updateManualPart } = useProjectModels();
    await updateManualPart(
      projectId,
      1,
      makeInput({
        name: 'Updated Rail',
        widthUm: mmToUm(100),
        lengthUm: mmToUm(200),
        thicknessUm: mmToUm(12),
        material: 'Oak',
      }),
    );

    const model = activeProjectData.value!.models[0];
    const updatedPart = model.parts.find((p) => p.partNumber === 1)!;
    expect(updatedPart.name).toBe('Updated Rail');
    expect(updatedPart.size.width).toBe(mmToUm(100));
    expect(updatedPart.size.length).toBe(mmToUm(200));
    expect(updatedPart.size.thickness).toBe(mmToUm(12));

    const stile = model.parts.find((p) => p.partNumber === 2)!;
    expect(stile.name).toBe('Stile');
  });

  it('updates grain lock via partOverrides', async () => {
    const { updateManualPart } = useProjectModels();
    await updateManualPart(
      projectId,
      1,
      makeInput({ name: 'Rail', material: 'Oak', grainLock: 'width' }),
    );

    const model = activeProjectData.value!.models[0];
    const rail = model.parts.find((p) => p.partNumber === 1)!;
    expect(rail.grainLock).toBe('width');

    await idb.flushPendingModelWrites();
    const fullAfterFlush = await idb.getProjectWithModels(projectId);
    const idbModel = fullAfterFlush!.models[0];
    expect(idbModel.partOverrides[1]?.grainLock).toBe('width');
  });

  it('clears grainLock when removed', async () => {
    await idb.updateModel(modelId, {
      partOverrides: { 1: { grainLock: 'length' } },
    });
    await idb.flushPendingModelWrites();

    const { updateManualPart } = useProjectModels();
    await updateManualPart(
      projectId,
      1,
      makeInput({ name: 'Rail', material: 'Oak' }), // no grainLock
    );

    await idb.flushPendingModelWrites();
    const full = await idb.getProjectWithModels(projectId);
    const idbModel = full!.models[0];
    expect(idbModel.partOverrides[1]).toBeUndefined();
  });

  it('Should update the color map when changing to a new material', async () => {
    const { updateManualPart } = useProjectModels();
    await updateManualPart(
      projectId,
      1,
      makeInput({ name: 'Rail', material: 'Walnut' }),
    );

    expect(activeProjectData.value!.colorMap).toHaveProperty(
      'Walnut',
      'Walnut',
    );
  });

  it('does nothing if project ID does not match', async () => {
    const { updateManualPart } = useProjectModels();
    await updateManualPart('wrong-id', 1, makeInput());
    const model = activeProjectData.value!.models[0];
    expect(model.parts[0].name).toBe('Rail');
  });

  it('does nothing if no manual model exists', async () => {
    const gltfProject = await idb.createProject('NoManual');
    activeProjectData.value = makeProject(gltfProject.id, [
      {
        id: 'gltf-1',
        filename: 'test.glb',
        source: 'gltf',
        parts: [makePart(1)],
        colors: [],
        enabled: true,
      },
    ]);

    const { updateManualPart } = useProjectModels();
    await updateManualPart(gltfProject.id, 1, makeInput());

    expect(activeProjectData.value!.models[0].source).toBe('gltf');
  });
});
