/**
 * Reactive scene list per active project.
 *
 * Mirrors the shape of `useBuildSteps`: a module-level reactive array shared
 * across every caller, kept in sync with IDB. The composable exposes CRUD
 * plus reorder helpers; the viewer/UI never touches the IDB layer directly.
 *
 * Concurrency: a single `activeId` watcher is installed lazily on first call.
 * Every IDB mutation bumps a generation counter so any in-flight load
 * triggered by a recent project switch is discarded if a write has landed
 * since — prevents an outdated `getScenes` result from clobbering optimistic
 * state right after a mutation.
 */

import { effectScope, type Ref } from 'vue';
import type { IdbScene } from '~/composables/useIdb';
import { sceneStateToIdb } from '~/lib/scene';
import type { SceneState } from '~/lib/scene';
import {
  moveSceneToIndex,
  nextSceneOrder,
  removeScene as removeSceneOrdered,
} from '~/utils/sceneOrder';
import { useAnnotations } from '~/composables/useAnnotations';

const scenes = ref<IdbScene[]>([]);
let loadedForId: string | null = null;
let loadGen = 0;
let watcherInstalled = false;

export interface AddSceneInput {
  name?: string;
  state: SceneState;
  thumbnail?: string;
}

export interface UseScenesApi {
  scenes: Ref<IdbScene[]>;
  addScene(input: AddSceneInput): Promise<string | undefined>;
  updateScene(id: string, patch: Partial<IdbScene>): Promise<void>;
  removeScene(id: string): Promise<void>;
  moveScene(id: string, toIndex: number): Promise<void>;
  reload(projectId: string): Promise<void>;
}

export function useScenes(): UseScenesApi {
  const idb = useIdb();
  const { activeId } = useProjects();

  if (!watcherInstalled) {
    watcherInstalled = true;
    // Detached so the watcher's lifetime is bound to the module, not the
    // first caller's scope (a unit test scope can otherwise dispose it).
    effectScope(true).run(() => {
      watch(
        activeId,
        async (id) => {
          const gen = ++loadGen;
          if (!id) {
            scenes.value = [];
            loadedForId = null;
            return;
          }
          if (id === loadedForId) return;
          const loaded = await idb.getScenes(id);
          if (gen !== loadGen) return;
          scenes.value = loaded;
          loadedForId = id;
        },
        { immediate: true },
      );
    });
  }

  async function addScene(input: AddSceneInput): Promise<string | undefined> {
    const projectId = activeId.value;
    if (!projectId) return;
    const now = new Date().toISOString();
    const scene: IdbScene = {
      id: crypto.randomUUID(),
      projectId,
      name: input.name ?? `Scene ${scenes.value.length + 1}`,
      order: nextSceneOrder(scenes.value),
      ...sceneStateToIdb(input.state),
      thumbnailDataUrl: input.thumbnail,
      createdAt: now,
      updatedAt: now,
    };
    loadGen++;
    scenes.value = [...scenes.value, scene];
    loadedForId = projectId;
    await idb.createScene(scene);
    return scene.id;
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
    const renumbered = moveSceneToIndex(scenes.value, id, toIndex);
    if (renumbered === scenes.value) return;
    loadGen++;
    scenes.value = renumbered;
    await Promise.all(
      renumbered.map((s) => idb.updateScene(s.id, { order: s.order })),
    );
  }

  async function reload(projectId: string): Promise<void> {
    const gen = ++loadGen;
    const loaded = await idb.getScenes(projectId);
    if (gen !== loadGen) return;
    scenes.value = loaded;
    loadedForId = projectId;
  }

  return { scenes, addScene, updateScene, removeScene, moveScene, reload };
}

export default useScenes;
