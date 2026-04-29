/**
 * Callout annotation kind. Three pieces:
 *
 * 1. `createCalloutHandler` — `PickKindHandler` for the annotation author.
 *    Single-click placement with a snap-first / face-fallback flow:
 *      - On pointer move, ask the viewer for a SnapTarget (vertex/edge
 *        midpoint/edge) under the cursor and forward it to `setSnapHover`
 *        so the user sees a yellow indicator before they click.
 *      - On click, prefer the snap target's world point + a
 *        per-kind normal; if no snap, fall back to a face raycast (the
 *        original Spec 08 behaviour) so empty face clicks still work.
 *
 * 2. `calloutKindHooks` — `KindHooks` plug for the `AnnotationProjector`.
 *    Drives where the label DOM lands (anchor + offset along the normal) and
 *    builds the 3D leader segment from anchor to label position.
 *
 * 3. `DEFAULT_LABEL_OFFSET_M` — 6 cm along the local normal at create time.
 *    Models live in metres in this app; 6 cm reads at furniture scale and
 *    keeps the label off the geometry without floating into space.
 *
 * Anchors live in Object-local space (Spec 07). The Object's load-time
 * `originalMatrix` and live `offsetMatrix` are composed by
 * `objectLocalToWorld` so callouts ride explode tweens and gizmo drags
 * automatically.
 */

import type { Ref } from 'vue';
import type { PickKindHandler } from '~/composables/useAnnotationAuthor';
import type { UseAnnotationsApi } from '~/composables/useAnnotations';
import type {
  KindHooks,
  ObjectLocalToWorld,
} from '~/lib/viewer/modules/AnnotationProjector';
import type {
  PickResult,
  RenderedLeaderSpec,
  SnapTarget,
} from '~/lib/viewer/types';
import type { GroupId } from '~/utils/types';
import type { IdbCallout } from '~/composables/useIdb';

type Vec3 = [number, number, number];

export const DEFAULT_LABEL_OFFSET_M = 0.06;
const LEADER_COLOR = 0x6ee7b7;

export interface CalloutViewer {
  raycastFromClient(x: number, y: number): PickResult | null;
  findSnapTarget(x: number, y: number): SnapTarget | null;
  setSnapHover(target: SnapTarget | null): void;
  worldToObjectLocal(groupId: GroupId, world: Vec3): Vec3 | null;
  worldDirToObjectLocal(groupId: GroupId, worldDir: Vec3): Vec3 | null;
  /**
   * Camera pose — used to build a sensible callout normal from snapped
   * clicks. Returns `undefined` only before the viewer has finished init;
   * the caller should bail in that case.
   */
  getCameraPose(): { position: Vec3; target: Vec3 } | undefined;
}

export function createCalloutHandler(deps: {
  viewer: CalloutViewer;
  annotationsApi: UseAnnotationsApi;
  activeSceneId: Ref<string | null>;
}): PickKindHandler {
  const { viewer, annotationsApi, activeSceneId } = deps;
  return {
    hint: () =>
      'Click an edge, vertex, or face to drop a callout · Esc to cancel',
    onPointerMove(client) {
      const snap = viewer.findSnapTarget(client.x, client.y);
      viewer.setSnapHover(snap);
    },
    async onClick(client) {
      const sceneId = activeSceneId.value;
      if (!sceneId) {
        viewer.setSnapHover(null);
        return { done: true };
      }

      const snap = viewer.findSnapTarget(client.x, client.y);
      const placement = snap
        ? placementFromSnap(snap, viewer)
        : placementFromFace(viewer.raycastFromClient(client.x, client.y));
      // Snap path needs the camera pose to build the normal; if it isn't
      // available yet (viewer still booting), back out cleanly.

      if (!placement) return { done: false };

      const anchorLocal = viewer.worldToObjectLocal(
        placement.groupId,
        placement.worldPoint,
      );
      const normalLocal = viewer.worldDirToObjectLocal(
        placement.groupId,
        placement.worldNormal,
      );
      if (!anchorLocal || !normalLocal) return { done: false };

      const normalised = normalize3(normalLocal);
      const labelOffsetLocal: Vec3 = [
        normalised[0] * DEFAULT_LABEL_OFFSET_M,
        normalised[1] * DEFAULT_LABEL_OFFSET_M,
        normalised[2] * DEFAULT_LABEL_OFFSET_M,
      ];
      const id = await annotationsApi.add({
        kind: 'callout',
        sceneId,
        groupId: placement.groupId,
        anchorLocal,
        anchorNormalLocal: normalised,
        labelOffsetLocal,
        text: '',
      });
      viewer.setSnapHover(null);
      return { done: true, draftId: id ?? null };
    },
    onEsc() {
      viewer.setSnapHover(null);
    },
  };
}

interface Placement {
  groupId: GroupId;
  worldPoint: Vec3;
  worldNormal: Vec3;
}

function placementFromSnap(
  snap: SnapTarget,
  viewer: CalloutViewer,
): Placement | null {
  // World-axis-aligned label offset: prefer +Y (label sits above the
  // anchor, matching how furniture plans publish labels). For edges
  // running along ±Y the +Y direction is parallel to the edge, so we fall
  // back to whichever horizontal axis (±X / ±Z) faces the camera most.
  // The result is always one of six world-axis unit vectors — no oblique
  // leaders.
  let normal: Vec3 = [0, 1, 0];
  if (snap.kind !== 'vertex') {
    const edgeDir = normalize3([
      snap.edgeB[0] - snap.edgeA[0],
      snap.edgeB[1] - snap.edgeA[1],
      snap.edgeB[2] - snap.edgeA[2],
    ]);
    if (Math.abs(edgeDir[1]) > 0.95) {
      const pose = viewer.getCameraPose();
      if (!pose) return null;
      normal = pickHorizontalAxisToward(pose.position, snap.worldPoint);
    }
  }
  return {
    groupId: snap.groupId,
    worldPoint: snap.worldPoint,
    worldNormal: normal,
  };
}

function pickHorizontalAxisToward(camera: Vec3, anchor: Vec3): Vec3 {
  const dx = camera[0] - anchor[0];
  const dz = camera[2] - anchor[2];
  if (Math.abs(dx) >= Math.abs(dz)) {
    return [dx >= 0 ? 1 : -1, 0, 0];
  }
  return [0, 0, dz >= 0 ? 1 : -1];
}

function placementFromFace(hit: PickResult | null): Placement | null {
  if (!hit) return null;
  return {
    groupId: hit.groupId,
    worldPoint: [hit.worldPoint.x, hit.worldPoint.y, hit.worldPoint.z],
    worldNormal: [hit.worldNormal.x, hit.worldNormal.y, hit.worldNormal.z],
  };
}

export const calloutKindHooks: KindHooks<IdbCallout> = {
  primaryLocal(a) {
    return labelLocal(a);
  },
  leaderSpec(a, lookup) {
    const start = lookup(a.groupId, a.anchorLocal);
    const end = lookup(a.groupId, labelLocal(a));
    if (!start || !end) return null;
    const spec: RenderedLeaderSpec = {
      start,
      end,
      color: LEADER_COLOR,
    };
    return spec;
  },
};

function labelLocal(a: IdbCallout): Vec3 {
  return [
    a.anchorLocal[0] + a.labelOffsetLocal[0],
    a.anchorLocal[1] + a.labelOffsetLocal[1],
    a.anchorLocal[2] + a.labelOffsetLocal[2],
  ];
}

function normalize3(v: Vec3): Vec3 {
  const len = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / len, v[1] / len, v[2] / len];
}

export type { ObjectLocalToWorld };
