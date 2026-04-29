/**
 * Minimal scene-authoring surface for Layer B. Owns the visibility state of
 * loaded Objects and exposes the imperative methods the Objects panel calls.
 *
 * Spec 06 will extend this composable into the full scene-authoring system
 * (capture / apply / dirty / thumbnails / tween). The visibility surface here
 * is the contract the panel relies on, so it stays.
 *
 * Visibility convention: `visibleObjects.value === null` means "everything
 * visible" (the default). Once any explicit hide/show happens, the ref holds
 * a `Set<GroupId>` that names the visible Objects.
 */

import type { Ref } from 'vue';
import type { GroupId } from '~/utils/types';

export interface SceneAuthor {
  visibleObjects: Ref<Set<GroupId> | null>;
  setObjectsVisibility(groupIds: GroupId[], visible: boolean): void;
  toggleObjectVisibility(groupId: GroupId): void;
  showAllObjects(): void;
  hideAllObjects(): void;
  resetAllOffsets(): void;
}

export interface SceneAuthorViewerHooks {
  setObjectVisible(groupId: GroupId, visible: boolean): void;
  setAllObjectsVisible(visible: boolean): void;
  resetAllOffsets(): void;
  /** All groupIds currently registered in the viewer. */
  getObjectIds(): GroupId[];
}

export function useSceneAuthor(viewer: SceneAuthorViewerHooks): SceneAuthor {
  const visibleObjects = ref<Set<GroupId> | null>(null);

  function isVisible(groupId: GroupId): boolean {
    const set = visibleObjects.value;
    if (set === null) return true;
    return set.has(groupId);
  }

  function ensureSet(): Set<GroupId> {
    if (visibleObjects.value === null) {
      visibleObjects.value = new Set(viewer.getObjectIds());
    }
    return new Set(visibleObjects.value);
  }

  function setObjectsVisibility(groupIds: GroupId[], visible: boolean): void {
    const next = ensureSet();
    for (const id of groupIds) {
      if (visible) next.add(id);
      else next.delete(id);
      viewer.setObjectVisible(id, visible);
    }
    visibleObjects.value = next;
  }

  function toggleObjectVisibility(groupId: GroupId): void {
    setObjectsVisibility([groupId], !isVisible(groupId));
  }

  function showAllObjects(): void {
    visibleObjects.value = null;
    viewer.setAllObjectsVisible(true);
  }

  function hideAllObjects(): void {
    visibleObjects.value = new Set();
    viewer.setAllObjectsVisible(false);
  }

  function resetAllOffsets(): void {
    viewer.resetAllOffsets();
  }

  return {
    visibleObjects,
    setObjectsVisibility,
    toggleObjectVisibility,
    showAllObjects,
    hideAllObjects,
    resetAllOffsets,
  };
}
