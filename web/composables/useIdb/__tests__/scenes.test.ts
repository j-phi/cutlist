import { describe, expect, it } from 'vitest';
import { useIdb } from '../../useIdb';
import type { IdbScene, IdbCallout } from '../../useIdb';

const idb = useIdb();

function makeScene(
  projectId: string,
  overrides: Partial<IdbScene> = {},
): IdbScene {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    projectId,
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

describe('scenes CRUD', () => {
  it('round-trips create / get', async () => {
    const project = await idb.createProject('Scenes');
    const scene = makeScene(project.id, { name: 'Front' });
    await idb.createScene(scene);

    const got = await idb.getScenes(project.id);
    expect(got).toHaveLength(1);
    expect(got[0]).toEqual(scene);
  });

  it('returns scenes sorted by order', async () => {
    const project = await idb.createProject('Order');
    await idb.createScene(makeScene(project.id, { name: 'C', order: 2 }));
    await idb.createScene(makeScene(project.id, { name: 'A', order: 0 }));
    await idb.createScene(makeScene(project.id, { name: 'B', order: 1 }));

    const got = await idb.getScenes(project.id);
    expect(got.map((s) => s.name)).toEqual(['A', 'B', 'C']);
  });

  it('isolates scenes by projectId', async () => {
    const a = await idb.createProject('A');
    const b = await idb.createProject('B');
    await idb.createScene(makeScene(a.id, { name: 'AScene' }));
    await idb.createScene(makeScene(b.id, { name: 'BScene' }));

    const aScenes = await idb.getScenes(a.id);
    expect(aScenes).toHaveLength(1);
    expect(aScenes[0].name).toBe('AScene');
  });

  it('updateScene patches and bumps updatedAt', async () => {
    const project = await idb.createProject('Patch');
    const scene = makeScene(project.id, { name: 'Original' });
    await idb.createScene(scene);

    // Force a measurable timestamp gap.
    await new Promise((r) => setTimeout(r, 5));
    await idb.updateScene(scene.id, { name: 'Renamed', floorVisible: false });

    const [got] = await idb.getScenes(project.id);
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
    const project = await idb.createProject('Cascade');
    const scene = makeScene(project.id);
    await idb.createScene(scene);
    await idb.createAnnotation(makeCallout(scene.id));
    await idb.createAnnotation(makeCallout(scene.id));

    await idb.deleteScene(scene.id);

    expect(await idb.getScenes(project.id)).toHaveLength(0);
    expect(await idb.getAnnotationsForScene(scene.id)).toHaveLength(0);
  });

  it('deleteScene leaves other scenes annotations alone', async () => {
    const project = await idb.createProject('Survive');
    const sceneA = makeScene(project.id, { name: 'A' });
    const sceneB = makeScene(project.id, { name: 'B', order: 1 });
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
});

describe('nextSceneOrder', () => {
  it('returns 0 for an empty project', async () => {
    const project = await idb.createProject('Empty');
    expect(await idb.nextSceneOrder(project.id)).toBe(0);
  });

  it('returns the count of existing scenes', async () => {
    const project = await idb.createProject('Counted');
    expect(await idb.nextSceneOrder(project.id)).toBe(0);
    await idb.createScene(makeScene(project.id, { order: 0 }));
    expect(await idb.nextSceneOrder(project.id)).toBe(1);
    await idb.createScene(makeScene(project.id, { order: 1 }));
    expect(await idb.nextSceneOrder(project.id)).toBe(2);
  });

  it('counts only scenes from the given project', async () => {
    const a = await idb.createProject('A');
    const b = await idb.createProject('B');
    await idb.createScene(makeScene(a.id));
    await idb.createScene(makeScene(a.id, { order: 1 }));
    expect(await idb.nextSceneOrder(b.id)).toBe(0);
  });
});
