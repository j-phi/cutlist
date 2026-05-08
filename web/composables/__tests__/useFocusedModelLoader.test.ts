// @vitest-environment nuxt
/**
 * Tests for the focused-model loading boundary. This composable owns the
 * viewer transition between models, so stale selection/hover state and missing
 * raw-source state belong here rather than leaking into ModelTab.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { effectScope, nextTick, ref, type EffectScope } from 'vue';
import type { ObjectGraph } from '~/utils/types';
import type { IdbScene } from '../useIdb/types';
import type { SceneAuthor } from '../useSceneAuthor';
import type { UseScenesApi } from '../useScenes';
import useModelViewerStore from '../useModelViewerStore';

const { getModelGraph } = vi.hoisted(() => ({
  getModelGraph: vi.fn(),
}));

vi.mock('~/composables/useModels', () => ({
  default: () => ({ getModelGraph }),
}));

import { useFocusedModelLoader } from '../useFocusedModelLoader';

function makeGraph(): ObjectGraph {
  return {
    parts: [],
    objects: [],
    objectIndex: new Map(),
    partIndex: new Map(),
    colorMap: {},
    nodePartMap: [],
  };
}

function flush(): Promise<void> {
  return Promise.resolve().then(() => nextTick());
}

function makeScene(id: string, modelId: string): IdbScene {
  return {
    id,
    modelId,
    name: id,
    order: 0,
    cameraMode: 'perspective',
    cameraPose: {
      position: [1, 2, 3],
      target: [0, 0, 0],
      zoom: 1,
      up: [0, 1, 0],
    },
    objectOffsets: {},
    floorVisible: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

describe('useFocusedModelLoader', () => {
  let scope: EffectScope;

  beforeEach(() => {
    scope = effectScope();
    getModelGraph.mockReset();
    const store = useModelViewerStore();
    store.clearGroupSelection();
    store.setHoveredGroupIds([]);
    store.setPartIndex(new Map());
  });

  afterEach(() => {
    scope.stop();
  });

  it('Should clear selected and hovered object ids when loading a focused model', async () => {
    getModelGraph.mockResolvedValue(makeGraph());
    const store = useModelViewerStore();
    store.selectGroupIds([1, 2]);
    store.setHoveredGroupIds([3]);

    const viewer = {
      ready: ref(true),
      clearModels: vi.fn(),
      loadModel: vi.fn(async () => {}),
    };
    const focusedModelId = ref<string | null>('m1');
    const sceneAuthor = {
      activeSceneId: ref<string | null>(null),
      jumpToScene: vi.fn(),
      captureCurrentSceneState: vi.fn(() => ({
        cameraMode: 'perspective',
        cameraPose: { position: [0, 0, 0], target: [0, 0, 0] },
        objectOffsets: new Map(),
        visibleObjects: null,
        floorVisible: true,
      })),
      captureThumbnail: vi.fn(() => null),
    } as unknown as SceneAuthor;
    const scenesApi = {
      scenes: ref([]),
      reload: vi.fn(async () => {}),
      ensureDefaultScene: vi.fn(async () => undefined),
    } as unknown as UseScenesApi;

    const loader = scope.run(() =>
      useFocusedModelLoader({
        viewer,
        focusedModelId,
        sceneAuthor,
        scenesApi,
      }),
    )!;

    expect(store.selectedGroupIds.value.size).toBe(0);
    expect(store.hoveredGroupIds.value.size).toBe(0);
    expect(loader.loadState.value).toBe('loading');

    await flush();

    expect(viewer.clearModels).toHaveBeenCalled();
    expect(viewer.loadModel).toHaveBeenCalledTimes(1);
    expect(loader.loadedGraph.value).not.toBeNull();
    expect(loader.loadState.value).toBe('loaded');
  });

  it('Should expose missing-source when the focused model has no raw source', async () => {
    getModelGraph.mockResolvedValue(null);
    const viewer = {
      ready: ref(true),
      clearModels: vi.fn(),
      loadModel: vi.fn(async () => {}),
    };

    const loader = scope.run(() =>
      useFocusedModelLoader({
        viewer,
        focusedModelId: ref<string | null>('missing'),
        sceneAuthor: {
          activeSceneId: ref<string | null>(null),
          jumpToScene: vi.fn(),
          captureCurrentSceneState: vi.fn(),
          captureThumbnail: vi.fn(),
        } as unknown as SceneAuthor,
        scenesApi: {
          scenes: ref([]),
          reload: vi.fn(async () => {}),
          ensureDefaultScene: vi.fn(async () => undefined),
        } as unknown as UseScenesApi,
      }),
    )!;

    await flush();

    expect(loader.loadedGraph.value).toBeNull();
    expect(loader.loadState.value).toBe('missing-source');
    expect(viewer.loadModel).not.toHaveBeenCalled();
  });

  it('Should jump to the active scene immediately after loadModel with no awaitable in between', async () => {
    getModelGraph.mockResolvedValue(makeGraph());
    const calls: string[] = [];
    const viewer = {
      ready: ref(true),
      clearModels: vi.fn(),
      loadModel: vi.fn(async () => {
        calls.push('loadModel');
      }),
    };

    const existingScene = makeScene('scene-a', 'm1');
    const scenesRef = ref([existingScene]);
    const sceneAuthor = {
      activeSceneId: ref<string | null>('scene-a'),
      jumpToScene: vi.fn((s: IdbScene) => calls.push(`jumpToScene:${s.id}`)),
      captureCurrentSceneState: vi.fn(() => ({
        cameraMode: 'perspective',
        cameraPose: { position: [0, 0, 0], target: [0, 0, 0] },
        objectOffsets: new Map(),
        visibleObjects: null,
        floorVisible: true,
      })),
      captureThumbnail: vi.fn(() => null),
    } as unknown as SceneAuthor;
    const scenesApi = {
      scenes: scenesRef,
      reload: vi.fn(async () => {
        calls.push('reload');
      }),
      ensureDefaultScene: vi.fn(async () => {
        calls.push('ensureDefaultScene');
        return 'default-id';
      }),
    } as unknown as UseScenesApi;

    scope.run(() =>
      useFocusedModelLoader({
        viewer,
        focusedModelId: ref<string | null>('m1'),
        sceneAuthor,
        scenesApi,
      }),
    )!;

    await flush();

    expect(calls).toEqual([
      'reload',
      'loadModel',
      'jumpToScene:scene-a',
      'ensureDefaultScene',
    ]);
    expect(sceneAuthor.jumpToScene).toHaveBeenCalledTimes(1);
  });

  it('Should create the default scene and jump to it on first load with no scenes', async () => {
    getModelGraph.mockResolvedValue(makeGraph());
    const viewer = {
      ready: ref(true),
      clearModels: vi.fn(),
      loadModel: vi.fn(async () => {}),
    };

    const scenesRef = ref<IdbScene[]>([]);
    const sceneAuthor = {
      activeSceneId: ref<string | null>(null),
      jumpToScene: vi.fn(),
      captureCurrentSceneState: vi.fn(() => ({
        cameraMode: 'perspective',
        cameraPose: { position: [0, 0, 0], target: [0, 0, 0] },
        objectOffsets: new Map(),
        visibleObjects: null,
        floorVisible: true,
      })),
      captureThumbnail: vi.fn(() => null),
    } as unknown as SceneAuthor;
    const scenesApi = {
      scenes: scenesRef,
      reload: vi.fn(async () => {}),
      ensureDefaultScene: vi.fn(async () => {
        const created = makeScene('default-id', 'm1');
        scenesRef.value = [created];
        return 'default-id';
      }),
    } as unknown as UseScenesApi;

    scope.run(() =>
      useFocusedModelLoader({
        viewer,
        focusedModelId: ref<string | null>('m1'),
        sceneAuthor,
        scenesApi,
      }),
    )!;

    await flush();

    expect(scenesApi.ensureDefaultScene).toHaveBeenCalledTimes(1);
    expect(sceneAuthor.jumpToScene).toHaveBeenCalledTimes(1);
    expect(
      (sceneAuthor.jumpToScene as ReturnType<typeof vi.fn>).mock.calls[0][0].id,
    ).toBe('default-id');
  });

  it('Should not apply scene state when the focused model changes mid-load', async () => {
    let resolveLoad: (() => void) | null = null;
    const loadModelPromise = new Promise<void>((resolve) => {
      resolveLoad = resolve;
    });
    getModelGraph.mockResolvedValue(makeGraph());

    const viewer = {
      ready: ref(true),
      clearModels: vi.fn(),
      loadModel: vi.fn(() => loadModelPromise),
    };

    const focusedModelId = ref<string | null>('m1');
    const sceneAuthor = {
      activeSceneId: ref<string | null>('scene-a'),
      jumpToScene: vi.fn(),
      captureCurrentSceneState: vi.fn(() => ({
        cameraMode: 'perspective',
        cameraPose: { position: [0, 0, 0], target: [0, 0, 0] },
        objectOffsets: new Map(),
        visibleObjects: null,
        floorVisible: true,
      })),
      captureThumbnail: vi.fn(() => null),
    } as unknown as SceneAuthor;
    const scenesApi = {
      scenes: ref([makeScene('scene-a', 'm1')]),
      reload: vi.fn(async () => {}),
      ensureDefaultScene: vi.fn(async () => 'default-id'),
    } as unknown as UseScenesApi;

    scope.run(() =>
      useFocusedModelLoader({
        viewer,
        focusedModelId,
        sceneAuthor,
        scenesApi,
      }),
    )!;

    await flush();

    // Mid-load: clear the focused model, then resolve loadModel. The
    // generation guard should bail before applying scene state.
    focusedModelId.value = null;
    resolveLoad!();
    await flush();

    expect(sceneAuthor.jumpToScene).not.toHaveBeenCalled();
    expect(scenesApi.ensureDefaultScene).not.toHaveBeenCalled();
  });
});
