/**
 * Tests for the batched manual-part creation method addManualParts inside
 * useProjectModels. Mirrors addManualPart's persistence invariants but assigns
 * one partNumber per input row (qty expands into instances under that number)
 * and reconciles the colorMap in a single IDB write for the whole batch.
 *
 * Reads from the module-level `activeProjectData` ref and persists to IDB
 * (fake-indexeddb), so the test seeds both before exercising the method.
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

describe('addManualParts', () => {
  let projectId: string;

  beforeEach(async () => {
    activeProjectData.value = null;
    const project = await idb.createProject('AddManualPartsTest');
    projectId = project.id;
    activeProjectData.value = makeProject(projectId);
  });

  it('creates the first manual model with per-row partNumbers and qty instances', async () => {
    const { addManualParts } = useProjectModels();

    await addManualParts(projectId, [
      makeInput({ name: 'A', qty: 1 }),
      makeInput({ name: 'B', qty: 3 }),
    ]);

    const persisted = (await idb.getProjectWithModels(projectId))!;
    expect(persisted.models).toHaveLength(1);
    const idbModel = persisted.models[0];
    expect(idbModel.source).toBe('manual');
    expect(idbModel.filename).toBe('Manual Parts');
    expect(idbModel.parts).toHaveLength(4);

    expect(idbModel.parts.map((p) => p.partNumber)).toEqual([1, 2, 2, 2]);

    const aInstances = idbModel.parts
      .filter((p) => p.partNumber === 1)
      .map((p) => p.instanceNumber);
    expect(aInstances).toEqual([1]);

    const bInstances = idbModel.parts
      .filter((p) => p.partNumber === 2)
      .map((p) => p.instanceNumber)
      .sort();
    expect(bInstances).toEqual([1, 2, 3]);
  });

  it('continues partNumbers from max+1 when appending to an existing manual model', async () => {
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

    const { addManualParts } = useProjectModels();
    await addManualParts(projectId, [
      makeInput({ name: 'Second' }),
      makeInput({ name: 'Third' }),
    ]);

    const persisted = (await idb.getProjectWithModels(projectId))!.models[0];
    expect(persisted.parts.map((p) => p.partNumber).sort()).toEqual([1, 2, 3]);
    expect(persisted.parts.find((p) => p.name === 'Second')!.partNumber).toBe(
      2,
    );
    expect(persisted.parts.find((p) => p.name === 'Third')!.partNumber).toBe(3);
  });

  it('routes grainLock into partOverrides keyed by the row partNumber, not onto the raw Part', async () => {
    const { addManualParts } = useProjectModels();
    await addManualParts(projectId, [
      makeInput({ name: 'Plain' }),
      makeInput({ name: 'Locked', grainLock: 'length' }),
    ]);

    const persisted = (await idb.getProjectWithModels(projectId))!.models[0];
    expect(persisted.partOverrides).toEqual({ 2: { grainLock: 'length' } });
    expect(persisted.parts.every((p) => p.grainLock === undefined)).toBe(true);
  });

  it('writes every distinct material into the project colorMap', async () => {
    const { addManualParts } = useProjectModels();
    await addManualParts(projectId, [
      makeInput({ material: 'Oak' }),
      makeInput({ material: 'Walnut' }),
      makeInput({ material: 'Oak' }),
    ]);

    const persisted = (await idb.getProjectWithModels(projectId))!;
    expect(persisted.colorMap).toMatchObject({ Oak: 'Oak', Walnut: 'Walnut' });
    expect(activeProjectData.value!.colorMap).toMatchObject({
      Oak: 'Oak',
      Walnut: 'Walnut',
    });
  });

  it('preserves an existing colorMap mapping instead of clobbering it to identity', async () => {
    activeProjectData.value = {
      ...makeProject(projectId),
      colorMap: { Oak: 'Red Oak 3/4"' },
    };

    const { addManualParts } = useProjectModels();
    await addManualParts(projectId, [
      makeInput({ material: 'Oak' }),
      makeInput({ material: 'Walnut' }),
    ]);

    const persisted = (await idb.getProjectWithModels(projectId))!;
    // Oak already mapped to a real stock — left untouched; Walnut added as identity.
    expect(persisted.colorMap).toEqual({
      Oak: 'Red Oak 3/4"',
      Walnut: 'Walnut',
    });
  });

  it('applies overrides to in-memory parts but stores raw parts in IDB', async () => {
    const { addManualParts } = useProjectModels();
    await addManualParts(projectId, [
      makeInput({ name: 'Locked', grainLock: 'width' }),
    ]);

    const reactivePart = activeProjectData.value!.models[0].parts[0];
    expect(reactivePart.grainLock).toBe('width');

    const idbPart = (await idb.getProjectWithModels(projectId))!.models[0]
      .parts[0];
    expect(idbPart.grainLock).toBeUndefined();
  });

  it('is a no-op for an empty inputs array', async () => {
    const { addManualParts } = useProjectModels();
    await addManualParts(projectId, []);

    expect(activeProjectData.value!.models).toHaveLength(0);
    const persisted = (await idb.getProjectWithModels(projectId))!;
    expect(persisted.models).toHaveLength(0);
  });

  it('is a no-op for a non-active projectId', async () => {
    const { addManualParts } = useProjectModels();
    await addManualParts('wrong-id', [makeInput()]);

    expect(activeProjectData.value!.models).toHaveLength(0);
  });
});
