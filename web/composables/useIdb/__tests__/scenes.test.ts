import { describe, expect, it } from 'vitest';
import { useIdb } from '../../useIdb';
import type { IdbModel, IdbScene, IdbCallout } from '../../useIdb';

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
    groupId: 1,
    anchorLocal: [0, 0, 0],
    anchorNormalLocal: [0, 0, 1],
    labelOffsetLocal: [1, 1, 0],
    text: 'Note',
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

async function makeProjectAndModel() {
  const project = await idb.createProject('Scenes');
  const model = makeModel(project.id);
  await idb.createModel(model);
  return { project, model };
}

describe('scenes CRUD', () => {
  it('round-trips create / get', async () => {
    const { model } = await makeProjectAndModel();
    const scene = makeScene(model.id, { name: 'Front' });
    await idb.createScene(scene);

    const got = await idb.getScenesForModel(model.id);
    expect(got).toHaveLength(1);
    expect(got[0]).toEqual(scene);
  });

  it('returns scenes sorted by order', async () => {
    const { model } = await makeProjectAndModel();
    await idb.createScene(makeScene(model.id, { name: 'C', order: 2 }));
    await idb.createScene(makeScene(model.id, { name: 'A', order: 0 }));
    await idb.createScene(makeScene(model.id, { name: 'B', order: 1 }));

    const got = await idb.getScenesForModel(model.id);
    expect(got.map((s) => s.name)).toEqual(['A', 'B', 'C']);
  });

  it('isolates scenes by modelId', async () => {
    const project = await idb.createProject('Iso');
    const a = makeModel(project.id);
    const b = makeModel(project.id);
    await idb.createModel(a);
    await idb.createModel(b);
    await idb.createScene(makeScene(a.id, { name: 'AScene' }));
    await idb.createScene(makeScene(b.id, { name: 'BScene' }));

    const aScenes = await idb.getScenesForModel(a.id);
    expect(aScenes).toHaveLength(1);
    expect(aScenes[0].name).toBe('AScene');
  });

  it('updateScene patches and bumps updatedAt', async () => {
    const { model } = await makeProjectAndModel();
    const scene = makeScene(model.id, { name: 'Original' });
    await idb.createScene(scene);

    // Force a measurable timestamp gap.
    await new Promise((r) => setTimeout(r, 5));
    await idb.updateScene(scene.id, { name: 'Renamed', floorVisible: false });

    const [got] = await idb.getScenesForModel(model.id);
    expect(got.name).toBe('Renamed');
    expect(got.floorVisible).toBe(false);
    expect(got.updatedAt > scene.updatedAt).toBe(true);
  });

  it('updateScene throws for unknown id', async () => {
    await expect(idb.updateScene('nope', { name: 'X' })).rejects.toThrow(
      'not found',
    );
  });

  it('deleteScene removes the scene and cascades to its annotations', async () => {
    const { model } = await makeProjectAndModel();
    const scene = makeScene(model.id);
    await idb.createScene(scene);
    await idb.createAnnotation(makeCallout(scene.id));
    await idb.createAnnotation(makeCallout(scene.id));

    await idb.deleteScene(scene.id);

    expect(await idb.getScenesForModel(model.id)).toHaveLength(0);
    expect(await idb.getAnnotationsForScene(scene.id)).toHaveLength(0);
  });

  it('deleteScene leaves other scenes annotations alone', async () => {
    const { model } = await makeProjectAndModel();
    const sceneA = makeScene(model.id, { name: 'A' });
    const sceneB = makeScene(model.id, { name: 'B', order: 1 });
    await idb.createScene(sceneA);
    await idb.createScene(sceneB);
    await idb.createAnnotation(makeCallout(sceneA.id, { text: 'A1' }));
    await idb.createAnnotation(makeCallout(sceneB.id, { text: 'B1' }));

    await idb.deleteScene(sceneA.id);

    const survivors = await idb.getAnnotationsForScene(sceneB.id);
    expect(survivors).toHaveLength(1);
    expect(survivors[0].kind).toBe('callout');
    if (survivors[0].kind === 'callout') {
      expect(survivors[0].text).toBe('B1');
    }
  });

  it('deleting a model cascades to its scenes and annotations', async () => {
    const { model } = await makeProjectAndModel();
    const scene = makeScene(model.id);
    await idb.createScene(scene);
    await idb.createAnnotation(makeCallout(scene.id));

    await idb.deleteModel(model.id);

    expect(await idb.getScenesForModel(model.id)).toHaveLength(0);
    expect(await idb.getAnnotationsForScene(scene.id)).toHaveLength(0);
  });
});

describe('nextSceneOrder', () => {
  it('returns 0 for an empty model', async () => {
    const { model } = await makeProjectAndModel();
    expect(await idb.nextSceneOrder(model.id)).toBe(0);
  });

  it('returns the count of existing scenes', async () => {
    const { model } = await makeProjectAndModel();
    expect(await idb.nextSceneOrder(model.id)).toBe(0);
    await idb.createScene(makeScene(model.id, { order: 0 }));
    expect(await idb.nextSceneOrder(model.id)).toBe(1);
    await idb.createScene(makeScene(model.id, { order: 1 }));
    expect(await idb.nextSceneOrder(model.id)).toBe(2);
  });

  it('counts only scenes from the given model', async () => {
    const project = await idb.createProject('A');
    const a = makeModel(project.id);
    const b = makeModel(project.id);
    await idb.createModel(a);
    await idb.createModel(b);
    await idb.createScene(makeScene(a.id));
    await idb.createScene(makeScene(a.id, { order: 1 }));
    expect(await idb.nextSceneOrder(b.id)).toBe(0);
  });
});
