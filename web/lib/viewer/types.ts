import type {
  CameraMode,
  CameraPose,
  GroupId,
  ObjectOffset,
} from '~/utils/types';

type Vector3 = import('three').Vector3;
type Quaternion = import('three').Quaternion;
type Matrix4 = import('three').Matrix4;
type LineSegments2 =
  import('three/addons/lines/LineSegments2.js').LineSegments2;

export type Vec3 = [number, number, number];
export type Quat4 = [number, number, number, number];

export interface ObjectRecord {
  groupId: GroupId;
  partNumber: number;
  name: string;
  /** All BatchedMesh instance ids that compose this Object. */
  batchIds: number[];
  /** Load-time world matrix for this Object. Frozen for life of the load. */
  originalMatrix: Matrix4;
  originalMatrixInverse: Matrix4;
  /** World-space centroid at load time. */
  center: Vector3;
  /**
   * Current rigid offset (mutable). Identity = no offset. Always paired with
   * a pre-composed `offsetMatrix` so writers pay the compose cost once and
   * BatchedMesh / annotation transforms read a single Matrix4.
   */
  offset: { position: Vector3; quaternion: Quaternion };
  /** Cached `T(offset.position) · R(offset.quaternion)`. Updated by the registry. */
  offsetMatrix: Matrix4;
  /** Cached inverse of `offsetMatrix`. Updated by the registry. */
  offsetMatrixInverse: Matrix4;
  /** Local-space edge vertex pairs from the loader (frozen). */
  edgesLocal: Float32Array;
  /**
   * Local-space bounding-sphere centre. The world-space centre is
   * `transformLocalToWorld(record, boundsLocalCenter)`; the sphere radius is
   * invariant under rigid offsets so it's a single number. Used by
   * `SnapDetector` to cull Objects that fall outside the cursor's screen
   * margin without walking their edge buffer.
   */
  boundsLocalCenter: Vector3;
  boundsLocalRadius: number;
  /**
   * Local-space axis-aligned bounding box over the Object's edge buffer.
   * Used by `MarqueeSelector`'s screen-AABB hit test — the bounding sphere
   * is way too loose for elongated parts (table legs, long boards) and
   * makes the marquee select objects the cursor isn't visibly over.
   */
  boundsLocalMin: Vector3;
  boundsLocalMax: Vector3;
  /** World-space rendered edges; transform = offset. */
  edgeLines: LineSegments2 | null;
}

export interface PickResult {
  groupId: GroupId;
  worldPoint: Vector3;
  worldNormal: Vector3;
}

/**
 * Snap target produced by `SnapDetector` and consumed by callouts (single
 * pick, Spec 08b) and dimensions (two-step pick, Spec 09). Three kinds in
 * priority order: a vertex anchor is a corner; an edge midpoint anchor
 * reads as "centre of this edge"; an edge anchor is the closest point
 * along the edge segment to the cursor ray.
 */
export type SnapTarget =
  | {
      kind: 'vertex';
      groupId: GroupId;
      worldPoint: Vec3;
    }
  | {
      kind: 'edgeMidpoint';
      groupId: GroupId;
      worldPoint: Vec3;
      edgeA: Vec3;
      edgeB: Vec3;
    }
  | {
      kind: 'edge';
      groupId: GroupId;
      worldPoint: Vec3;
      edgeA: Vec3;
      edgeB: Vec3;
    };

/**
 * Screen-space marquee rectangle in CSS pixels relative to the canvas
 * `getBoundingClientRect()` origin. `mode` reflects the AutoCAD/OnShape
 * convention: drag left→right is "window" (Object's projected bounds must
 * be fully contained), drag right→left is "crossing" (any overlap counts).
 */
export interface MarqueeRect {
  x: number;
  y: number;
  w: number;
  h: number;
  mode: 'window' | 'crossing';
}

export type ViewerEvent =
  | { type: 'ready' }
  | { type: 'user-interaction' }
  | { type: 'object-moved'; groupId: GroupId }
  | {
      type: 'selection-changed';
      groupIds: GroupId[];
      /** True when the originating input event had Shift held. */
      shiftKey?: boolean;
    }
  | { type: 'render-requested' }
  | { type: 'pick'; result: PickResult | null }
  | { type: 'marquee-start'; shiftKey: boolean; baseline: GroupId[] }
  | {
      type: 'marquee-update';
      rect: MarqueeRect;
      candidates: GroupId[];
      shiftKey: boolean;
      baseline: GroupId[];
    }
  | {
      type: 'marquee-end';
      committed: boolean;
      candidates: GroupId[];
      shiftKey: boolean;
      baseline: GroupId[];
    };

export type ViewPreset =
  | 'front'
  | 'back'
  | 'left'
  | 'right'
  | 'top'
  | 'bottom'
  | 'iso';

export type InteractionMode = 'select' | 'pick';
export type GizmoMode = 'translate' | 'rotate';

export interface RenderedLeaderSpec {
  start: Vec3;
  end: Vec3;
  color?: number;
  /**
   * When true, the segment is drawn with a dashed pattern (witness lines on
   * dimension annotations). Solid by default. The LeaderManager keeps a
   * separate dashed material so toggling this flag is per-segment.
   */
  dashed?: boolean;
}

export type { CameraMode, CameraPose };
