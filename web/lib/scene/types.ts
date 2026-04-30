/**
 * In-memory scene-state types consumed by the pure capture/interpolate
 * functions.
 *
 * `SceneState` is the spatial subset of an `IdbScene` (record metadata such
 * as `id`, `name`, `order`, `thumbnailDataUrl` is intentionally absent).
 * Per-Object data is keyed by `groupId` (source-file node identity), never
 * `batchId`.
 */

import type {
  CameraMode,
  CameraPose,
  GroupId,
  ObjectOffset,
} from '~/utils/types';

export interface SceneState {
  cameraMode: CameraMode;
  cameraPose: CameraPose;
  /** Rigid offset per Object. Missing key = `IDENTITY_OBJECT_OFFSET`. */
  objectOffsets: Map<GroupId, ObjectOffset>;
  /** `null` ≡ all visible. */
  visibleObjects: Set<GroupId> | null;
  floorVisible: boolean;
}
