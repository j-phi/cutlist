/**
 * Adapters between the in-memory `SceneState` (used by capture/apply/
 * interpolate) and the persisted `IdbScene` shape. Centralised here so the
 * Map/Set ↔ Record/array translation lives in one place.
 */

import { isIdentityObjectOffset } from '~/composables/useIdb';
import type { IdbScene, ObjectOffset } from '~/composables/useIdb';
import type { GroupId } from '~/utils/types';
import type { SceneState } from './types';

export function sceneStateToIdb(
  state: SceneState,
): Pick<
  IdbScene,
  | 'cameraMode'
  | 'cameraPose'
  | 'objectOffsets'
  | 'visibleObjects'
  | 'floorVisible'
> {
  const offsets: Record<number, ObjectOffset> = {};
  for (const [groupId, off] of state.objectOffsets) {
    if (isIdentityObjectOffset(off)) continue;
    offsets[groupId] = off;
  }
  return {
    cameraMode: state.cameraMode,
    cameraPose: state.cameraPose,
    objectOffsets: offsets,
    visibleObjects:
      state.visibleObjects === null
        ? undefined
        : [...state.visibleObjects].sort((a, b) => a - b),
    floorVisible: state.floorVisible,
  };
}

export function sceneStateFromIdb(scene: IdbScene): SceneState {
  const offsets = new Map<GroupId, ObjectOffset>();
  for (const [k, v] of Object.entries(scene.objectOffsets)) {
    offsets.set(Number(k), v);
  }
  return {
    cameraMode: scene.cameraMode,
    cameraPose: scene.cameraPose,
    objectOffsets: offsets,
    visibleObjects:
      scene.visibleObjects == null ? null : new Set(scene.visibleObjects),
    floorVisible: scene.floorVisible,
  };
}
