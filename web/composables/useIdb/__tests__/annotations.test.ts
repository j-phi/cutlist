import { describe, expect, it } from 'vitest';
import { useIdb, applyAnnotationDefaults } from '../../useIdb';
import type {
  IdbModel,
  IdbScene,
  IdbCallout,
  IdbDimension,
} from '../../useIdb';

const idb = useIdb();

function makeModel(
  projectId: string,
  overrides: Partial<IdbModel> = {},
): IdbModel {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    projectId,
    filename: 'model.gltf',
    source: 'gltf',
    parts: [],
    colors: [],
    nodePartMap: [],
    enabled: true,
    rawSource: null,
    partOverrides: {},
    createdAt: now,
    ...overrides,
  };
}

function makeScene(
  modelId: string,
  overrides: Partial<IdbScene> = {},
): IdbScene {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    modelId,
    name: 'Scene',
    order: 0,
    cameraMode: 'perspective',
    cameraPose: { position: [1, 2, 3], target: [0, 0, 0] },
    objectOffsets: {},
    floorVisible: true,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function makeCallout(
  sceneId: string,
  overrides: Partial<IdbCallout> = {},
): IdbCallout {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    sceneId,
    kind: 'callout',
    groupId: 7,
    anchorLocal: [0.1, 0.2, 0.3],
    anchorNormalLocal: [0, 0, 1],
    labelOffsetLocal: [1, 0, 0],
    text: 'Hello',
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function makeDimension(
  sceneId: string,
  overrides: Partial<IdbDimension> = {},
): IdbDimension {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    sceneId,
    kind: 'dimension',
    groupId: 12,
    anchor1: { groupId: 12, local: [0, 0, 0] },
    anchor2: { groupId: 12, local: [1, 0, 0] },
    offsetLocal: [0, 0.5, 0],
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

async function makeProjectAndScene() {
  const project = await idb.createProject('Annotations');
  const model = makeModel(project.id);
  await idb.createModel(model);
  const scene = makeScene(model.id);
  await idb.createScene(scene);
  return { project, model, scene };
}

describe('annotations CRUD', () => {
  it('round-trips a callout', async () => {
    const { scene } = await makeProjectAndScene();
    const callout = makeCallout(scene.id);
    await idb.createAnnotation(callout);

    const [got] = await idb.getAnnotationsForScene(scene.id);
    expect(got).toEqual(callout);
    expect(got.kind).toBe('callout');
  });

  it('round-trips a dimension', async () => {
    const { scene } = await makeProjectAndScene();
    const dimension = makeDimension(scene.id, { text: '120 mm' });
    await idb.createAnnotation(dimension);

    const [got] = await idb.getAnnotationsForScene(scene.id);
    expect(got).toEqual(dimension);
    expect(got.kind).toBe('dimension');
  });

  it('getAnnotationsForScene only returns matching scene', async () => {
    const project = await idb.createProject('Iso');
    const model = makeModel(project.id);
    await idb.createModel(model);
    const a = makeScene(model.id, { name: 'A' });
    const b = makeScene(model.id, { name: 'B', order: 1 });
    await idb.createScene(a);
    await idb.createScene(b);
    await idb.createAnnotation(makeCallout(a.id, { text: 'in A' }));
    await idb.createAnnotation(makeDimension(b.id, { text: 'in B' }));

    const aRows = await idb.getAnnotationsForScene(a.id);
    expect(aRows).toHaveLength(1);
    expect(aRows[0].kind).toBe('callout');

    const bRows = await idb.getAnnotationsForScene(b.id);
    expect(bRows).toHaveLength(1);
    expect(bRows[0].kind).toBe('dimension');
  });

  it('getAnnotationsForProject joins through models and scenes', async () => {
    const project = await idb.createProject('Project');
    const model = makeModel(project.id);
    await idb.createModel(model);
    const a = makeScene(model.id);
    const b = makeScene(model.id, { order: 1 });
    await idb.createScene(a);
    await idb.createScene(b);
    await idb.createAnnotation(makeCallout(a.id));
    await idb.createAnnotation(makeDimension(b.id));

    // Empty project sees nothing of ours.
    const other = await idb.createProject('Other');
    expect(await idb.getAnnotationsForProject(other.id)).toEqual([]);

    const all = await idb.getAnnotationsForProject(project.id);
    expect(all).toHaveLength(2);
    expect(all.map((a) => a.kind).sort()).toEqual(['callout', 'dimension']);
  });

  it('getAnnotationsForModel returns annotations across the model scenes', async () => {
    const project = await idb.createProject('PerModel');
    const m1 = makeModel(project.id);
    const m2 = makeModel(project.id);
    await idb.createModel(m1);
    await idb.createModel(m2);
    const a = makeScene(m1.id);
    const b = makeScene(m2.id);
    await idb.createScene(a);
    await idb.createScene(b);
    await idb.createAnnotation(makeCallout(a.id, { text: 'm1' }));
    await idb.createAnnotation(makeCallout(b.id, { text: 'm2' }));

    const m1Rows = await idb.getAnnotationsForModel(m1.id);
    expect(m1Rows).toHaveLength(1);
    if (m1Rows[0].kind === 'callout') {
      expect(m1Rows[0].text).toBe('m1');
    }
  });

  it('updateAnnotation patches text and bumps updatedAt', async () => {
    const { scene } = await makeProjectAndScene();
    const callout = makeCallout(scene.id, { text: 'before' });
    await idb.createAnnotation(callout);

    await new Promise((r) => setTimeout(r, 5));
    await idb.updateAnnotation(callout.id, { text: 'after' });

    const [got] = await idb.getAnnotationsForScene(scene.id);
    if (got.kind !== 'callout') throw new Error('expected callout');
    expect(got.text).toBe('after');
    expect(got.updatedAt > callout.updatedAt).toBe(true);
  });

  it('updateAnnotation throws for unknown id', async () => {
    await expect(idb.updateAnnotation('nope', { text: 'x' })).rejects.toThrow(
      'not found',
    );
  });

  it('deleteAnnotation removes only the targeted row', async () => {
    const { scene } = await makeProjectAndScene();
    const a = makeCallout(scene.id, { text: 'A' });
    const b = makeCallout(scene.id, { text: 'B' });
    await idb.createAnnotation(a);
    await idb.createAnnotation(b);

    await idb.deleteAnnotation(a.id);

    const remaining = await idb.getAnnotationsForScene(scene.id);
    expect(remaining).toHaveLength(1);
    if (remaining[0].kind !== 'callout') throw new Error('expected callout');
    expect(remaining[0].text).toBe('B');
  });

  it('discriminated union narrows correctly on read', async () => {
    const { scene } = await makeProjectAndScene();
    await idb.createAnnotation(makeCallout(scene.id, { text: 'Hi' }));
    await idb.createAnnotation(makeDimension(scene.id));

    const rows = await idb.getAnnotationsForScene(scene.id);
    for (const row of rows) {
      if (row.kind === 'callout') {
        // TS sees IdbCallout in this branch.
        expect(typeof row.text).toBe('string');
        expect(row.anchorNormalLocal).toHaveLength(3);
      } else {
        // TS sees IdbDimension in this branch.
        expect(row.anchor1.local).toHaveLength(3);
        expect(row.offsetLocal).toHaveLength(3);
      }
    }
  });
});

describe('applyAnnotationDefaults', () => {
  it('fills empty text on a callout', () => {
    const got = applyAnnotationDefaults({
      id: 'a',
      sceneId: 's',
      kind: 'callout',
      groupId: 1,
      anchorLocal: [0, 0, 0],
      anchorNormalLocal: [0, 0, 1],
      labelOffsetLocal: [0, 0, 0],
      createdAt: '',
      updatedAt: '',
    });
    if (got.kind !== 'callout') throw new Error('expected callout');
    expect(got.text).toBe('');
  });

  it('throws when groupId is missing', () => {
    expect(() =>
      applyAnnotationDefaults({
        id: 'a',
        sceneId: 's',
        kind: 'callout',
      } as never),
    ).toThrow(/groupId/);
  });
});
