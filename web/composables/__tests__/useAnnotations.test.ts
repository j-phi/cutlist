// @vitest-environment nuxt
/**
 * Integration tests for useAnnotations against a real (fake) IndexedDB.
 * Mirrors the useScenes setup: module-scoped reactive list, manually-driven
 * activeId, reload() to bypass watcher timing inside individual tests.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { effectScope, nextTick, ref, type EffectScope } from 'vue';
import { mockNuxtImport } from '@nuxt/test-utils/runtime';

const activeId = ref<string | null>(null);
mockNuxtImport('useProjects', () => () => ({ activeId }));

import { useAnnotations } from '../useAnnotations';
import { useScenes } from '../useScenes';
import { useIdb } from '../useIdb';
import type { IdbModel } from '~/composables/useIdb';

let scope: EffectScope;
const idb = useIdb();

async function flush() {
  for (let i = 0; i < 5; i++) {
    await nextTick();
    await Promise.resolve();
  }
}

async function makeProjectWithScene(): Promise<{
  projectId: string;
  modelId: string;
  sceneId: string;
}> {
  const project = await idb.createProject('P');
  const now = new Date().toISOString();
  const model: IdbModel = {
    id: crypto.randomUUID(),
    projectId: project.id,
    filename: 'm.gltf',
    source: 'gltf',
    parts: [],
    colors: [],
    nodePartMap: [],
    enabled: true,
    rawSource: null,
    partOverrides: {},
    createdAt: now,
  };
  await idb.createModel(model);
  const sceneId = 'scene-' + crypto.randomUUID();
  await idb.createScene({
    id: sceneId,
    modelId: model.id,
    name: 'S',
    order: 0,
    cameraMode: 'perspective',
    cameraPose: { position: [0, 0, 0], target: [0, 0, 0] },
    objectOffsets: {},
    floorVisible: true,
    createdAt: now,
    updatedAt: now,
  });
  return { projectId: project.id, modelId: model.id, sceneId };
}

beforeEach(async () => {
  scope = effectScope();
  activeId.value = null;
  await flush();
});

afterEach(() => {
  scope.stop();
});

describe('useAnnotations — round-trip', () => {
  it('Should add a callout, surface it in-memory, and persist to IDB', async () => {
    const { projectId, sceneId } = await makeProjectWithScene();
    const api = scope.run(() => useAnnotations())!;
    activeId.value = projectId;
    await flush();
    await api.reload(projectId);

    const id = await api.add({
      kind: 'callout',
      sceneId,
      groupId: 1,
      anchorLocal: [1, 2, 3],
      anchorNormalLocal: [0, 1, 0],
      labelOffsetLocal: [0, 0.1, 0],
      text: 'hi',
    });

    expect(id).toBeDefined();
    expect(api.annotations.value).toHaveLength(1);
    const persisted = await idb.getAnnotationsForScene(sceneId);
    expect(persisted).toHaveLength(1);
    expect(persisted[0].kind).toBe('callout');
  });

  it('Should add a dimension and persist its anchors', async () => {
    const { projectId, sceneId } = await makeProjectWithScene();
    const api = scope.run(() => useAnnotations())!;
    activeId.value = projectId;
    await flush();
    await api.reload(projectId);

    await api.add({
      kind: 'dimension',
      sceneId,
      groupId: 7,
      anchor1: { groupId: 7, local: [0, 0, 0] },
      anchor2: { groupId: 7, local: [1, 0, 0] },
      offsetLocal: [0, 0.1, 0],
    });

    const persisted = await idb.getAnnotationsForScene(sceneId);
    expect(persisted).toHaveLength(1);
    expect(persisted[0].kind).toBe('dimension');
    if (persisted[0].kind === 'dimension') {
      expect(persisted[0].anchor1).toEqual({ groupId: 7, local: [0, 0, 0] });
      expect(persisted[0].anchor2).toEqual({ groupId: 7, local: [1, 0, 0] });
    }
  });
});

describe('useAnnotations — visibleForScene', () => {
  it('Should return only annotations bound to the given scene', async () => {
    const { projectId, modelId, sceneId } = await makeProjectWithScene();
    const otherSceneId = 'other';
    const now = new Date().toISOString();
    await idb.createScene({
      id: otherSceneId,
      modelId,
      name: 'B',
      order: 1,
      cameraMode: 'perspective',
      cameraPose: { position: [0, 0, 0], target: [0, 0, 0] },
      objectOffsets: {},
      floorVisible: true,
      createdAt: now,
      updatedAt: now,
    });

    const api = scope.run(() => useAnnotations())!;
    activeId.value = projectId;
    await flush();
    await api.reload(projectId);

    await api.add({
      kind: 'callout',
      sceneId,
      groupId: 1,
      anchorLocal: [0, 0, 0],
      anchorNormalLocal: [0, 1, 0],
      labelOffsetLocal: [0, 0.1, 0],
    });
    await api.add({
      kind: 'callout',
      sceneId: otherSceneId,
      groupId: 2,
      anchorLocal: [0, 0, 0],
      anchorNormalLocal: [0, 1, 0],
      labelOffsetLocal: [0, 0.1, 0],
    });

    const visible = api.visibleForScene(sceneId);
    expect(visible.value).toHaveLength(1);
    expect(visible.value[0].sceneId).toBe(sceneId);
  });
});

describe('useAnnotations — cascade purge via useScenes', () => {
  it('Should drop in-memory annotations when their scene is removed', async () => {
    const { projectId, modelId, sceneId } = await makeProjectWithScene();
    const annApi = scope.run(() => useAnnotations())!;
    const modelIdRef = ref<string | null>(modelId);
    const sceneApi = scope.run(() => useScenes(modelIdRef))!;
    activeId.value = projectId;
    await flush();
    await annApi.reload(projectId);
    await sceneApi.reload(modelId);

    await annApi.add({
      kind: 'callout',
      sceneId,
      groupId: 1,
      anchorLocal: [0, 0, 0],
      anchorNormalLocal: [0, 1, 0],
      labelOffsetLocal: [0, 0.1, 0],
    });
    expect(annApi.annotations.value).toHaveLength(1);

    await sceneApi.removeScene(sceneId);
    expect(annApi.annotations.value).toHaveLength(0);
    expect(await idb.getAnnotationsForScene(sceneId)).toHaveLength(0);
  });
});

describe('useAnnotations — update / remove', () => {
  it('Should patch a callout in-memory and in IDB', async () => {
    const { projectId, sceneId } = await makeProjectWithScene();
    const api = scope.run(() => useAnnotations())!;
    activeId.value = projectId;
    await flush();
    await api.reload(projectId);

    const id = (await api.add({
      kind: 'callout',
      sceneId,
      groupId: 1,
      anchorLocal: [0, 0, 0],
      anchorNormalLocal: [0, 1, 0],
      labelOffsetLocal: [0, 0.1, 0],
      text: 'old',
    }))!;

    await api.update(id, { text: 'new' });

    const persisted = await idb.getAnnotationsForScene(sceneId);
    expect(persisted[0].kind === 'callout' && persisted[0].text).toBe('new');
    const local = api.annotations.value.find((a) => a.id === id)!;
    expect(local.kind === 'callout' && local.text).toBe('new');
  });

  it('Should remove an annotation', async () => {
    const { projectId, sceneId } = await makeProjectWithScene();
    const api = scope.run(() => useAnnotations())!;
    activeId.value = projectId;
    await flush();
    await api.reload(projectId);

    const id = (await api.add({
      kind: 'callout',
      sceneId,
      groupId: 1,
      anchorLocal: [0, 0, 0],
      anchorNormalLocal: [0, 1, 0],
      labelOffsetLocal: [0, 0.1, 0],
    }))!;
    await api.remove(id);
    expect(api.annotations.value).toHaveLength(0);
    expect(await idb.getAnnotationsForScene(sceneId)).toHaveLength(0);
  });
});
