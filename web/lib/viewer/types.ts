import type { CameraMode, CameraPose } from '~/composables/useIdb';

type Vector3 = import('three').Vector3;
type Matrix4 = import('three').Matrix4;
type LineSegments2 =
  import('three/addons/lines/LineSegments2.js').LineSegments2;

export type ObjectId = number;
export type Vec3 = [number, number, number];

export interface ObjectRecord {
  groupId: ObjectId;
  partNumber: number;
  name: string;
  /** All BatchedMesh instance ids that compose this Object. */
  batchIds: number[];
  /** Load-time world matrix for this Object. Frozen for life of the load. */
  originalMatrix: Matrix4;
  originalMatrixInverse: Matrix4;
  /** World-space centroid at load time. */
  center: Vector3;
  /** Current translation offset (mutable). */
  offset: Vector3;
  /** Local-space edge vertex pairs from the loader (frozen). */
  edgesLocal: Float32Array;
  /** World-space rendered edges; position = origin + offset. */
  edgeLines: LineSegments2 | null;
}

export interface PickResult {
  groupId: ObjectId;
  worldPoint: Vector3;
  worldNormal: Vector3;
}

export interface SnapEdgeResult {
  groupId: ObjectId;
  endpointA: Vector3;
  endpointB: Vector3;
}

export type ViewerEvent =
  | { type: 'user-interaction' }
  | { type: 'object-moved'; groupId: ObjectId }
  | {
      type: 'selection-changed';
      groupIds: ObjectId[];
      /** True when the originating input event had Shift held. */
      shiftKey?: boolean;
    }
  | { type: 'render-requested' }
  | { type: 'pick'; result: PickResult | null }
  | { type: 'snap-edge'; result: SnapEdgeResult | null };

export type ViewPreset =
  | 'front'
  | 'back'
  | 'left'
  | 'right'
  | 'top'
  | 'bottom'
  | 'iso';

export type InteractionMode = 'select' | 'pick';
export type GizmoMode = 'translate' | 'rotate' | 'scale';

export interface RenderedLeaderSpec {
  start: Vec3;
  end: Vec3;
  color?: number;
}

export type { CameraMode, CameraPose };
