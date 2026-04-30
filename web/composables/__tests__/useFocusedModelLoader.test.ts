// @vitest-environment nuxt
/**
 * Tests for the focused-model loading boundary. This composable owns the
 * viewer transition between models, so stale selection/hover state and missing
 * raw-source state belong here rather than leaking into ModelTab.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { effectScope, nextTick, ref, type EffectScope } from 'vue';
import type { ObjectGraph } from '~/utils/types';
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
    } as unknown as SceneAuthor;
    const scenesApi = { scenes: ref([]) } as unknown as UseScenesApi;

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
        } as unknown as SceneAuthor,
        scenesApi: { scenes: ref([]) } as unknown as UseScenesApi,
      }),
    )!;

    await flush();

    expect(loader.loadedGraph.value).toBeNull();
    expect(loader.loadState.value).toBe('missing-source');
    expect(viewer.loadModel).not.toHaveBeenCalled();
  });
});
