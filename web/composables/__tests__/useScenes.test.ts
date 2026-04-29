// @vitest-environment nuxt
/**
 * Integration tests for useScenes. The composable is module-scoped (matching
 * useBuildSteps), so tests share the watcher and reactive `scenes` ref. Each
 * test creates a fresh project id; the global beforeEach in test-setup
 * resets the IDB. We manually drive the activeId ref via a mocked
 * useProjects, then call `reload(projectId)` to bypass watcher timing
 * inside the test (the watcher path itself is exercised by the first test).
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { effectScope, nextTick, ref, type EffectScope } from 'vue';
import { mockNuxtImport } from '@nuxt/test-utils/runtime';
import type { SceneState } from '~/lib/scene';

const activeId = ref<string | null>(null);

mockNuxtImport('useProjects', () => () => ({ activeId }));

import { useScenes } from '../useScenes';
import { useIdb } from '../useIdb';

let scope: EffectScope;
const idb = useIdb();

function makeState(overrides: Partial<SceneState> = {}): SceneState {
  return {
    cameraMode: 'perspective',
    cameraPose: { position: [0, 0, 0], target: [0, 0, 0] },
    objectOffsets: new Map(),
    visibleObjects: null,
    floorVisible: true,
    ...overrides,
  };
}

async function flush() {
  for (let i = 0; i < 5; i++) {
    await nextTick();
    await Promise.resolve();
  }
}

beforeEach(async () => {
  scope = effectScope();
  activeId.value = null;
  await flush();
});

afterEach(() => {
  scope.stop();
});

describe('useScenes', () => {
  it('Should hydrate the active project via reload after activeId is set', async () => {
    const project = await idb.createProject('Load');
    const now = new Date().toISOString();
    await idb.createScene({
      id: 's1',
      projectId: project.id,
      name: 'A',
      order: 0,
      cameraMode: 'perspective',
      cameraPose: { position: [0, 0, 0], target: [0, 0, 0] },
      objectOffsets: {},
      floorVisible: true,
      createdAt: now,
      updatedAt: now,
    });

    const api = scope.run(() => useScenes())!;
    activeId.value = project.id;
    await flush();
    await api.reload(project.id);
    await flush();

    expect(api.scenes.value.map((s) => s.name)).toEqual(['A']);
  });

  it('Should add a scene with optimistic updates and persist to IDB', async () => {
    const project = await idb.createProject('Add');
    const api = scope.run(() => useScenes())!;
    activeId.value = project.id;
    await flush();
    await api.reload(project.id);
    await flush();

    const id = await api.addScene({
      name: 'Front',
      state: makeState({
        cameraPose: { position: [1, 2, 3], target: [0, 0, 0] },
      }),
      thumbnail: 'data:image/png;base64,thumb',
    });
    expect(id).toBeDefined();
    expect(api.scenes.value).toHaveLength(1);

    const persisted = await idb.getScenes(project.id);
    expect(persisted).toHaveLength(1);
    expect(persisted[0].name).toBe('Front');
    expect(persisted[0].thumbnailDataUrl).toBe('data:image/png;base64,thumb');
    expect(persisted[0].cameraPose.position).toEqual([1, 2, 3]);
  });

  it('Should drop identity object offsets in persisted scene state', async () => {
    const project = await idb.createProject('Identity');
    const api = scope.run(() => useScenes())!;
    activeId.value = project.id;
    await flush();
    await api.reload(project.id);
    await flush();

    const offsets = new Map([
      [
        1,
        {
          position: [0, 0, 0] as [number, number, number],
          quaternion: [0, 0, 0, 1] as [number, number, number, number],
        },
      ],
      [
        2,
        {
          position: [5, 0, 0] as [number, number, number],
          quaternion: [0, 0, 0, 1] as [number, number, number, number],
        },
      ],
    ]);
    await api.addScene({ state: makeState({ objectOffsets: offsets }) });

    const [persisted] = await idb.getScenes(project.id);
    expect(Object.keys(persisted.objectOffsets).map(Number).sort()).toEqual([
      2,
    ]);
  });

  it('Should remove a scene and renumber survivors', async () => {
    const project = await idb.createProject('Remove');
    const api = scope.run(() => useScenes())!;
    activeId.value = project.id;
    await flush();
    await api.reload(project.id);
    await flush();

    await api.addScene({ name: 'A', state: makeState() });
    await api.addScene({ name: 'B', state: makeState() });
    await api.addScene({ name: 'C', state: makeState() });

    const middleId = api.scenes.value[1].id;
    await api.removeScene(middleId);

    expect(api.scenes.value.map((s) => s.name)).toEqual(['A', 'C']);
    expect(api.scenes.value.map((s) => s.order)).toEqual([0, 1]);

    const persisted = await idb.getScenes(project.id);
    expect(persisted.map((s) => s.order)).toEqual([0, 1]);
    expect(persisted.map((s) => s.name)).toEqual(['A', 'C']);
  });

  it('Should cascade-delete annotations when a scene is removed', async () => {
    const project = await idb.createProject('Cascade');
    const api = scope.run(() => useScenes())!;
    activeId.value = project.id;
    await flush();
    await api.reload(project.id);
    await flush();

    await api.addScene({ name: 'A', state: makeState() });
    const sceneId = api.scenes.value[0].id;
    const now = new Date().toISOString();
    await idb.createAnnotation({
      id: 'a1',
      sceneId,
      kind: 'callout',
      groupId: 1,
      anchorLocal: [0, 0, 0],
      anchorNormalLocal: [0, 0, 1],
      labelOffsetLocal: [1, 0, 0],
      text: 'Hi',
      createdAt: now,
      updatedAt: now,
    });

    await api.removeScene(sceneId);

    expect(await idb.getAnnotationsForScene(sceneId)).toHaveLength(0);
  });

  it('Should reorder scenes and persist new order values', async () => {
    const project = await idb.createProject('Reorder');
    const api = scope.run(() => useScenes())!;
    activeId.value = project.id;
    await flush();
    await api.reload(project.id);
    await flush();

    await api.addScene({ name: 'A', state: makeState() });
    await api.addScene({ name: 'B', state: makeState() });
    await api.addScene({ name: 'C', state: makeState() });

    const aId = api.scenes.value[0].id;
    await api.moveScene(aId, 2);

    expect(api.scenes.value.map((s) => s.name)).toEqual(['B', 'C', 'A']);
    const persisted = await idb.getScenes(project.id);
    expect(persisted.map((s) => s.name)).toEqual(['B', 'C', 'A']);
    expect(persisted.map((s) => s.order)).toEqual([0, 1, 2]);
  });

  it('Should patch a scene and persist via updateScene', async () => {
    const project = await idb.createProject('Update');
    const api = scope.run(() => useScenes())!;
    activeId.value = project.id;
    await flush();
    await api.reload(project.id);
    await flush();

    await api.addScene({ name: 'Old', state: makeState() });
    const id = api.scenes.value[0].id;
    await api.updateScene(id, { name: 'New', floorVisible: false });

    expect(api.scenes.value[0].name).toBe('New');
    expect(api.scenes.value[0].floorVisible).toBe(false);
    const persisted = await idb.getScenes(project.id);
    expect(persisted[0].name).toBe('New');
    expect(persisted[0].floorVisible).toBe(false);
  });
});
