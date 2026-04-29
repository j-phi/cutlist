/**
 * Callout annotation kind. Three pieces:
 *
 * 1. `createCalloutHandler` — `PickKindHandler` for the annotation author.
 *    Single-click placement: raycast → translate the hit + face normal into
 *    Object-local space → push an empty-text callout into IDB → surface the
 *    new id as `draftId` so `CalloutLabel` can take focus and accept text.
 *
 * 2. `calloutKindHooks` — `KindHooks` plug for the `AnnotationProjector`.
 *    Drives where the label DOM lands (anchor + offset along the normal) and
 *    builds the 3D leader segment from face anchor to label position.
 *
 * 3. `DEFAULT_LABEL_OFFSET_M` — 6cm along the local normal at create-time.
 *    Models live in metres in this app; 6cm reads at furniture scale and
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
import type { PickResult, RenderedLeaderSpec } from '~/lib/viewer/types';
import type { GroupId } from '~/utils/types';
import type { IdbCallout } from '~/composables/useIdb';

type Vec3 = [number, number, number];

export const DEFAULT_LABEL_OFFSET_M = 0.06;
const LEADER_COLOR = 0x6ee7b7;

export interface CalloutViewer {
  raycastFromClient(x: number, y: number): PickResult | null;
  worldToObjectLocal(groupId: GroupId, world: Vec3): Vec3 | null;
  worldDirToObjectLocal(groupId: GroupId, worldDir: Vec3): Vec3 | null;
}

export function createCalloutHandler(deps: {
  viewer: CalloutViewer;
  annotationsApi: UseAnnotationsApi;
  activeSceneId: Ref<string | null>;
}): PickKindHandler {
  const { viewer, annotationsApi, activeSceneId } = deps;
  return {
    hint: () => 'Click a face to drop a callout · Esc to cancel',
    onPointerMove() {},
    async onClick(client) {
      const sceneId = activeSceneId.value;
      if (!sceneId) return { done: true };
      const hit = viewer.raycastFromClient(client.x, client.y);
      if (!hit) return { done: false };
      const worldPoint: Vec3 = [
        hit.worldPoint.x,
        hit.worldPoint.y,
        hit.worldPoint.z,
      ];
      const worldNormal: Vec3 = [
        hit.worldNormal.x,
        hit.worldNormal.y,
        hit.worldNormal.z,
      ];
      const anchorLocal = viewer.worldToObjectLocal(hit.groupId, worldPoint);
      const normalLocal = viewer.worldDirToObjectLocal(
        hit.groupId,
        worldNormal,
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
        groupId: hit.groupId,
        anchorLocal,
        anchorNormalLocal: normalised,
        labelOffsetLocal,
        text: '',
      });
      return { done: true, draftId: id ?? null };
    },
    onEsc() {},
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
