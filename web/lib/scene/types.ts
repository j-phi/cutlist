/**
 * In-memory scene-state types consumed by the pure capture/apply/interpolate
 * functions.
 *
 * `SceneState` is the spatial subset of an `IdbScene` (record metadata such
 * as `id`, `name`, `order`, `thumbnailDataUrl` is intentionally absent).
 * Per-Object data is keyed by `groupId` (source-file node identity), never
 * `batchId`.
 *
 * `AppliedSceneState` is the per-frame value the viewer renders: visibility
 * is expanded into per-group opacity for cheap cross-fading during a tween,
 * and `objectOffsets` is fully populated for every group so interpolation
 * doesn't need a fallback branch in the hot path.
 */

import type {
  CameraMode,
  CameraPose,
  ObjectOffset,
} from '~/composables/useIdb';
import type { GroupId } from '~/utils/types';

export interface SceneState {
  cameraMode: CameraMode;
  cameraPose: CameraPose;
  /** Rigid offset per Object. Missing key = `IDENTITY_OBJECT_OFFSET`. */
  objectOffsets: Map<GroupId, ObjectOffset>;
  /** `null` ≡ all visible. */
  visibleObjects: Set<GroupId> | null;
  floorVisible: boolean;
}

export interface AppliedSceneState {
  cameraMode: CameraMode;
  cameraPose: CameraPose;
  /** Always covers every group passed to apply/interpolate. */
  objectOffsets: Map<GroupId, ObjectOffset>;
  /** 0..1 per group; 0 hides. */
  groupOpacity: Map<GroupId, number>;
  floorVisible: boolean;
}
