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
  const loadedGraph = ref<ObjectGraph | null>(null);

  async function loadFocusedModel(): Promise<void> {
    if (!viewer.ready.value) return;
    const id = focusedModelId.value;
    if (!id) {
      viewer.clearModels();
      loadedGraph.value = null;
      return;
    }
    const graph = await models.getModelGraph(id);

    viewer.clearModels();
    loadedGraph.value = null;

    if (!graph) return;
    await viewer.loadModel(graph);
    loadedGraph.value = graph;
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

  return { loadedGraph };
}

export default useFocusedModelLoader;
