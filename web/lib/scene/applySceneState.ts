/**
 * Apply: resolve a `SceneState` into the per-frame values the viewer renders.
 *
 * Equivalent to `interpolateSceneState(s, s, 1, allGroupIds)` but expressed
 * directly so callers don't pay for an unnecessary lerp. Iterates `allGroupIds`
 * once to expand visibility into per-group opacity and to fill missing offsets
 * with identity — keeps downstream loops branch-free.
 */

import { IDENTITY_OBJECT_OFFSET } from '~/composables/useIdb';
import type { ObjectOffset } from '~/composables/useIdb';
import type { GroupId } from '~/utils/types';
import type { AppliedSceneState, SceneState } from './types';

export function applySceneState(
  state: SceneState,
  allGroupIds: readonly GroupId[],
): AppliedSceneState {
  const visible = state.visibleObjects;

  const groupOpacity = new Map<GroupId, number>();
  for (const id of allGroupIds) {
    groupOpacity.set(id, visible === null || visible.has(id) ? 1 : 0);
  }

  const objectOffsets = new Map<GroupId, ObjectOffset>();
  for (const id of allGroupIds) {
    objectOffsets.set(id, cloneOffset(state.objectOffsets.get(id)));
  }

  return {
    cameraMode: state.cameraMode,
    cameraPose: {
      position: [
        state.cameraPose.position[0],
        state.cameraPose.position[1],
        state.cameraPose.position[2],
      ],
      target: [
        state.cameraPose.target[0],
        state.cameraPose.target[1],
        state.cameraPose.target[2],
      ],
    },
    objectOffsets,
    groupOpacity,
    floorVisible: state.floorVisible,
  };
}

function cloneOffset(o: ObjectOffset | undefined): ObjectOffset {
  const src = o ?? IDENTITY_OBJECT_OFFSET;
  return {
    position: [src.position[0], src.position[1], src.position[2]],
    quaternion: [
      src.quaternion[0],
      src.quaternion[1],
      src.quaternion[2],
      src.quaternion[3],
    ],
  };
}
