/**
 * Wires the host's scene-authoring buttons (add / select / update / remove)
 * to the `useSceneAuthor` + `useScenes` pair, and exposes the
 * `canUpdateScene` predicate.
 *
 * ModelTab needs each of these as a tiny `async () => …` arrow that just
 * orchestrates the two composables; bundling them here keeps the host
 * focused on layout / wiring.
 */

import type { ComputedRef } from 'vue';
import type { SceneAuthor } from '~/composables/useSceneAuthor';
import type { UseScenesApi } from '~/composables/useScenes';
import { sceneStateToIdb } from '~/lib/scene';

export interface SceneAuthoringActions {
  canUpdateScene: ComputedRef<boolean>;
  addScene(): Promise<void>;
  selectScene(id: string): Promise<void>;
  updateActiveScene(): Promise<void>;
  removeScene(id: string): Promise<void>;
}

export function useSceneAuthoringActions(
  sceneAuthor: SceneAuthor,
  scenesApi: UseScenesApi,
): SceneAuthoringActions {
  const canUpdateScene = computed(
    () =>
      sceneAuthor.dirty.value &&
      sceneAuthor.activeSceneId.value !== null &&
      sceneAuthor.tween.value === null,
  );

  async function addScene(): Promise<void> {
    if (sceneAuthor.tween.value !== null) return;
    const state = sceneAuthor.captureCurrentSceneState();
    const thumbnail = sceneAuthor.captureThumbnail() ?? undefined;
    const id = await scenesApi.addScene({ state, thumbnail });
    if (id) sceneAuthor.activeSceneId.value = id;
    sceneAuthor.dirty.value = false;
  }

  async function selectScene(id: string): Promise<void> {
    if (sceneAuthor.tween.value !== null) return;
    const scene = scenesApi.scenes.value.find((s) => s.id === id);
    if (!scene) return;
    await sceneAuthor.tweenToScene(scene);
  }

  async function updateActiveScene(): Promise<void> {
    const id = sceneAuthor.activeSceneId.value;
    if (!id) return;
    const state = sceneAuthor.captureCurrentSceneState();
    const thumbnail = sceneAuthor.captureThumbnail() ?? undefined;
    await scenesApi.updateScene(id, {
      ...sceneStateToIdb(state),
      thumbnailDataUrl: thumbnail,
    });
    sceneAuthor.markClean();
  }

  async function removeScene(id: string): Promise<void> {
    if (sceneAuthor.activeSceneId.value === id) {
      sceneAuthor.activeSceneId.value = null;
      sceneAuthor.dirty.value = false;
    }
    await scenesApi.removeScene(id);
  }

  return {
    canUpdateScene,
    addScene,
    selectScene,
    updateActiveScene,
    removeScene,
  };
}

export default useSceneAuthoringActions;
