/**
 * Adapters between the in-memory `SceneState` (used by capture/apply/
 * interpolate) and the persisted `IdbScene` shape. Centralised here so the
 * Map/Set ↔ Record/array translation lives in one place.
 */

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
    if (isIdentity(off)) continue;
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

function isIdentity(o: ObjectOffset): boolean {
  return (
    o.position[0] === 0 &&
    o.position[1] === 0 &&
    o.position[2] === 0 &&
    o.quaternion[0] === 0 &&
    o.quaternion[1] === 0 &&
    o.quaternion[2] === 0 &&
    o.quaternion[3] === 1
  );
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
