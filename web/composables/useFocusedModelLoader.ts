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
}) {
  const { viewer, focusedModelId, sceneAuthor, scenesApi } = opts;
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
    // Replay the remembered active scene (if any) so the camera/visibility
    // /offsets match the marker the timeline is showing. `useSceneAuthor`
    // has already populated `activeSceneId` from the per-model memory map;
    // we just need to wait until both the model and its scenes are in
    // memory before applying. `jumpToScene` is a one-shot apply (no tween).
    const sid = sceneAuthor.activeSceneId.value;
    if (sid) {
      const scene = scenesApi.scenes.value.find((s) => s.id === sid);
      if (scene) sceneAuthor.jumpToScene(scene);
    }
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
