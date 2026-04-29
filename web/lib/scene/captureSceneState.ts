/**
 * Capture: shape raw viewer values into a canonical `SceneState`.
 *
 * Pure — keeping the conversion side-effect-free means it round-trips with
 * `applySceneState` and is trivially testable. Identity offsets are dropped
 * so two scenes with no Object moves capture-equal regardless of read order.
 */

import type {
  CameraMode,
  CameraPose,
  ObjectOffset,
} from '~/composables/useIdb';
import type { GroupId } from '~/utils/types';
import type { SceneState } from './types';

export interface CaptureInput {
  cameraMode: CameraMode;
  cameraPose: CameraPose;
  objectOffsets: ReadonlyMap<GroupId, ObjectOffset>;
  visibleObjects: Set<GroupId> | null;
  floorVisible: boolean;
}

export function captureSceneState(input: CaptureInput): SceneState {
  const offsets = new Map<GroupId, ObjectOffset>();
  for (const [groupId, off] of input.objectOffsets) {
    if (isIdentityOffset(off)) continue;
    offsets.set(groupId, {
      position: [off.position[0], off.position[1], off.position[2]],
      quaternion: [
        off.quaternion[0],
        off.quaternion[1],
        off.quaternion[2],
        off.quaternion[3],
      ],
    });
  }
  return {
    cameraMode: input.cameraMode,
    cameraPose: {
      position: [
        input.cameraPose.position[0],
        input.cameraPose.position[1],
        input.cameraPose.position[2],
      ],
      target: [
        input.cameraPose.target[0],
        input.cameraPose.target[1],
        input.cameraPose.target[2],
      ],
    },
    objectOffsets: offsets,
    visibleObjects: input.visibleObjects ? new Set(input.visibleObjects) : null,
    floorVisible: input.floorVisible,
  };
}

function isIdentityOffset(o: ObjectOffset): boolean {
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
