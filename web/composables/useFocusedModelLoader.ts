/**
 * Loads the focused model's `ObjectGraph` into the viewer whenever the
 * focused id or viewer-readiness changes, then replays the per-model
 * remembered scene so the timeline lands where the user left it.
 *
 * Owns the `loadedGraph` ref the host binds to <ObjectsPanel>. The cache
 * lives in `useModels` — this composable just orchestrates the read +
 * load + scene-replay sequence.
 */

import type { Ref } from 'vue';
import type { ObjectGraph } from '~/utils/types';
import type { SceneAuthor } from '~/composables/useSceneAuthor';
import type { UseScenesApi } from '~/composables/useScenes';
import useModels from '~/composables/useModels';
import useModelViewerStore from '~/composables/useModelViewerStore';

interface FocusedModelLoaderViewer {
  ready: Ref<boolean>;
  clearModels(): void;
  loadModel(graph: ObjectGraph): Promise<void>;
}

export function useFocusedModelLoader(opts: {
  viewer: FocusedModelLoaderViewer;
  focusedModelId: Ref<string | null>;
  sceneAuthor: SceneAuthor;
  scenesApi: UseScenesApi;
  targetSceneId?: Ref<string | null>;
}) {
  const { viewer, focusedModelId, sceneAuthor, scenesApi, targetSceneId } =
    opts;
  const models = useModels();
  const store = useModelViewerStore();
  const loadedGraph = ref<ObjectGraph | null>(null);
  const loadState = ref<'idle' | 'loading' | 'loaded' | 'missing-source'>(
    'idle',
  );
  let loadGeneration = 0;

  function clearLoadedModel(): void {
    viewer.clearModels();
    store.clearGroupSelection();
    store.setHoveredGroupIds([]);
    loadedGraph.value = null;
  }

  async function loadFocusedModel(): Promise<void> {
    if (!viewer.ready.value) return;
    const generation = ++loadGeneration;
    const id = focusedModelId.value;
    if (!id) {
      clearLoadedModel();
      loadState.value = 'idle';
      return;
    }

    clearLoadedModel();
    loadState.value = 'loading';

    const graph = await models.getModelGraph(id);
    if (generation !== loadGeneration || focusedModelId.value !== id) return;

    if (!graph) {
      loadState.value = 'missing-source';
      return;
    }
    await viewer.loadModel(graph);
    if (generation !== loadGeneration || focusedModelId.value !== id) return;
    loadedGraph.value = graph;
    loadState.value = 'loaded';
    await scenesApi.reload(id);
    if (generation !== loadGeneration || focusedModelId.value !== id) return;
    const defaultSceneId = await scenesApi.ensureDefaultScene({
      state: sceneAuthor.captureCurrentSceneState(),
      thumbnail: sceneAuthor.captureThumbnail() ?? undefined,
    });
    if (generation !== loadGeneration || focusedModelId.value !== id) return;

    // Replay an explicitly requested preview scene first, then the per-model
    // remembered scene, and finally the always-present default scene.
    const requestedSceneId = targetSceneId?.value ?? null;
    const candidateIds = [
      requestedSceneId,
      sceneAuthor.activeSceneId.value,
      defaultSceneId,
    ].filter((sid): sid is string => !!sid);
    const scene = candidateIds
      .map((sid) => scenesApi.scenes.value.find((s) => s.id === sid))
      .find((s): s is NonNullable<typeof s> => !!s);
    if (scene) sceneAuthor.jumpToScene(scene);
  }

  // Single watch on the combined predicate avoids a double-fire on initial
  // mount (once when the focused id resolves, once when the viewer becomes
  // ready). The downstream loader is idempotent enough that an extra call
  // would be harmless, but it would also re-clear the loaded graph and
  // momentarily blank the panel UI — so we gate on both upstream signals.
  watch(
    () => ({
      id: focusedModelId.value,
      ready: viewer.ready.value,
    }),
    ({ ready }) => {
      if (ready) void loadFocusedModel();
    },
    { immediate: true },
  );

  return { loadedGraph, loadState };
}

export default useFocusedModelLoader;
