/**
 * Reactive scene list per active model.
 *
 * Scenes are model-scoped: each model in a project has its own scene
 * timeline. The composable takes a reactive `modelId` ref — when it flips,
 * the in-memory list is rehydrated for the new model. When the ref is
 * `null`, the list is empty and mutations no-op.
 *
 * Mirrors the shape of `useBuildSteps`: a module-level reactive array shared
 * across every caller, kept in sync with IDB. The composable exposes CRUD
 * plus reorder helpers; the viewer/UI never touches the IDB layer directly.
 *
 * Concurrency: a single `modelId` watcher is installed lazily on first call.
 * Every IDB mutation bumps a generation counter so any in-flight load
 * triggered by a recent model switch is discarded if a write has landed
 * since — prevents an outdated `getScenesForModel` result from clobbering
 * optimistic state right after a mutation.
 */

import { effectScope, type ComputedRef, type Ref } from 'vue';
import type { IdbScene } from '~/composables/useIdb';
import { sceneStateToIdb } from '~/lib/scene';
import type { SceneState } from '~/lib/scene';
import {
  moveSceneToIndex,
  nextSceneOrder,
  removeScene as removeSceneOrdered,
  renumberScenes,
} from '~/utils/sceneOrder';
import { useAnnotations } from '~/composables/useAnnotations';
import {
  DEFAULT_SCENE_NAME,
  defaultSceneIdForModel,
  isDefaultScene,
} from '~/utils/defaultScene';

const scenes = ref<IdbScene[]>([]);
let loadedForId: string | null = null;
let loadGen = 0;
let watcherInstalled = false;
let activeModelIdRef: Ref<string | null> | null = null;

export interface AddSceneInput {
  name?: string;
  state: SceneState;
  thumbnail?: string;
}

export interface UseScenesApi {
  scenes: Ref<IdbScene[]>;
  pinnedSceneIds: ComputedRef<string[]>;
  defaultSceneId: ComputedRef<string | null>;
  addScene(input: AddSceneInput): Promise<string | undefined>;
  ensureDefaultScene(input: AddSceneInput): Promise<string | undefined>;
  updateScene(id: string, patch: Partial<IdbScene>): Promise<void>;
  removeScene(id: string): Promise<void>;
  moveScene(id: string, toIndex: number): Promise<void>;
  isDefaultScene(id: string): boolean;
  reload(modelId: string): Promise<void>;
}

export function useScenes(modelIdRef: Ref<string | null>): UseScenesApi {
  const idb = useIdb();
  const defaultSceneId = computed(() =>
    modelIdRef.value ? defaultSceneIdForModel(modelIdRef.value) : null,
  );
  const pinnedSceneIds = computed(() =>
    defaultSceneId.value ? [defaultSceneId.value] : [],
  );
  // Latest binding wins: the most recent caller dictates which ref drives
  // the watcher. In practice there's one consumer (ModelTab) at a time.
  activeModelIdRef = modelIdRef;

  if (!watcherInstalled) {
    watcherInstalled = true;
    // Detached so the watcher's lifetime is bound to the module, not the
    // first caller's scope (a unit test scope can otherwise dispose it).
    effectScope(true).run(() => {
      watch(
        () => activeModelIdRef?.value ?? null,
        async (id) => {
          const gen = ++loadGen;
          if (!id) {
            scenes.value = [];
            loadedForId = null;
            return;
          }
          if (id === loadedForId) return;
          const loaded = await idb.getScenesForModel(id);
          if (gen !== loadGen) return;
          scenes.value = sortScenesWithDefault(loaded);
          loadedForId = id;
        },
        { immediate: true },
      );
    });
  }

  async function addScene(input: AddSceneInput): Promise<string | undefined> {
    const modelId = modelIdRef.value;
    if (!modelId) return;
    const now = new Date().toISOString();
    const sceneNumber =
      scenes.value.filter((scene) => !isDefaultScene(scene)).length + 1;
    const scene: IdbScene = {
      id: crypto.randomUUID(),
      modelId,
      name: input.name ?? `Scene ${sceneNumber}`,
      order: nextSceneOrder(scenes.value),
      ...sceneStateToIdb(input.state),
      thumbnailDataUrl: input.thumbnail,
      createdAt: now,
      updatedAt: now,
    };
    loadGen++;
    scenes.value = [...scenes.value, scene];
    loadedForId = modelId;
    await idb.createScene(scene);
    return scene.id;
  }

  /**
   * Create the model's deterministic "Default" scene if it doesn't already
   * exist. The IDB order field for the default isn't enforced after creation
   * — `sortScenesWithDefault` is the single source of truth for in-memory
   * ordering on every read, and nobody else reads IDB directly.
   */
  async function ensureDefaultScene(
    input: AddSceneInput,
  ): Promise<string | undefined> {
    const modelId = modelIdRef.value;
    if (!modelId) return;
    const id = defaultSceneIdForModel(modelId);
    if (scenes.value.some((scene) => scene.id === id)) return id;

    const now = new Date().toISOString();
    const scene: IdbScene = {
      id,
      modelId,
      name: DEFAULT_SCENE_NAME,
      order: 0,
      ...sceneStateToIdb(input.state),
      thumbnailDataUrl: input.thumbnail,
      createdAt: now,
      updatedAt: now,
    };
    const renumbered = renumberScenes([scene, ...scenes.value]);
    loadGen++;
    scenes.value = renumbered;
    loadedForId = modelId;
    await idb.createScene(scene);
    await Promise.all(
      renumbered
        .filter((s) => s.id !== id)
        .map((s) => idb.updateScene(s.id, { order: s.order })),
    );
    return id;
  }

  async function updateScene(
    id: string,
    patch: Partial<IdbScene>,
  ): Promise<void> {
    loadGen++;
    scenes.value = scenes.value.map((s) =>
      s.id === id ? { ...s, ...patch } : s,
    );
    await idb.updateScene(id, patch);
  }

  async function removeScene(id: string): Promise<void> {
    if (isDefaultSceneIdForCurrentModel(id)) return;
    if (!scenes.value.find((s) => s.id === id)) return;
    loadGen++;
    const remaining = removeSceneOrdered(scenes.value, id);
    scenes.value = remaining;
    useAnnotations().purgeForScene(id);
    await idb.deleteScene(id);
    await Promise.all(
      remaining.map((s) => idb.updateScene(s.id, { order: s.order })),
    );
  }

  async function moveScene(id: string, toIndex: number): Promise<void> {
    if (isDefaultSceneIdForCurrentModel(id)) return;
    const minIndex = scenes.value.some((scene) => isDefaultScene(scene))
      ? 1
      : 0;
    const renumbered = moveSceneToIndex(
      scenes.value,
      id,
      Math.max(minIndex, toIndex),
    );
    if (renumbered === scenes.value) return;
    loadGen++;
    scenes.value = renumbered;
    await Promise.all(
      renumbered.map((s) => idb.updateScene(s.id, { order: s.order })),
    );
  }

  async function reload(modelId: string): Promise<void> {
    const gen = ++loadGen;
    const loaded = await idb.getScenesForModel(modelId);
    if (gen !== loadGen) return;
    scenes.value = sortScenesWithDefault(loaded);
    loadedForId = modelId;
  }

  function isDefaultSceneIdForCurrentModel(id: string): boolean {
    return defaultSceneId.value === id;
  }

  function sortScenesWithDefault(list: IdbScene[]): IdbScene[] {
    const sorted = [...list].sort((a, b) => a.order - b.order);
    const defaultIndex = sorted.findIndex((scene) => isDefaultScene(scene));
    if (defaultIndex === -1) return sorted;
    if (defaultIndex === 0) return renumberScenes(sorted);
    const [defaultScene] = sorted.splice(defaultIndex, 1);
    return renumberScenes([defaultScene, ...sorted]);
  }

  return {
    scenes,
    pinnedSceneIds,
    defaultSceneId,
    addScene,
    ensureDefaultScene,
    updateScene,
    removeScene,
    moveScene,
    isDefaultScene: isDefaultSceneIdForCurrentModel,
    reload,
  };
}

export default useScenes;
