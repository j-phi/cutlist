/**
 * Callout annotation kind. Three pieces:
 *
 * 1. `createCalloutHandler` — two-step `PickKindHandler`, mirroring the
 *    dimension flow:
 *      - Click 1: snap-first / face-fallback anchor (vertex / edge midpoint
 *        / edge / face). Snap-hover indicator runs on pointer move.
 *      - Click 2: commit at the cursor's offset from the anchor, snapped to
 *        the nearest world axis (±X / ±Y / ±Z). Between the two clicks the
 *        author surfaces a live preview annotation so the projector renders
 *        the leader as the user picks the offset direction.
 *      - If the user commits without moving the cursor, the offset falls
 *        back to `DEFAULT_LABEL_OFFSET_M` along the anchor's world normal —
 *        the legacy single-click behaviour, recovered as a fallback.
 *
 * 2. `calloutKindHooks` — projector hooks. Drives where the label DOM lands
 *    (anchor + label offset) and builds the leader segment from anchor to
 *    label.
 *
 * 3. `DEFAULT_LABEL_OFFSET_M` — fallback magnitude (6 cm). Furniture-scale
 *    distance that keeps the label off the geometry without floating into
 *    space; only used when the cursor offset is below
 *    `MIN_OFFSET_THRESHOLD_M`.
 *
 * Anchors live in Object-local space. The Object's load-time
 * `originalMatrix` and live `offsetMatrix` are composed by
 * `objectLocalToWorld` so callouts ride explode tweens and gizmo drags
 * automatically.
 */

import { ref, type Ref } from 'vue';
import type { PickKindHandler } from '~/composables/useAnnotationAuthor';
import { PREVIEW_ANNOTATION_ID } from '~/composables/useAnnotationAuthor';
import type { UseAnnotationsApi } from '~/composables/useAnnotations';
import type { KindHooks, ObjectLocalToWorld } from './projector';
import type {
  PickResult,
  RenderedLeaderSpec,
  SnapTarget,
} from '~/lib/viewer/types';
import type { GroupId } from '~/utils/types';
import type { IdbAnnotation, IdbCallout } from '~/composables/useIdb';
import {
  cameraForward,
  normalize3,
  plainVec3,
  worldOffsetToLocal,
  type Vec3,
} from './shared';

export const DEFAULT_LABEL_OFFSET_M = 0.06;
const LEADER_COLOR = 0x6ee7b7;
/**
 * Below this magnitude (1 cm), the cursor-derived offset is treated as
 * "user clicked twice without moving" and we fall back to a sensible
 * default along the anchor normal. Matches the dimension flow's
 * `ON_EDGE_THRESHOLD_M` in spirit.
 */
const MIN_OFFSET_THRESHOLD_M = 0.01;

export interface CalloutViewer {
  raycastFromClient(x: number, y: number): PickResult | null;
  findSnapTarget(x: number, y: number): SnapTarget | null;
  setSnapHover(target: SnapTarget | null): void;
  worldToObjectLocal(groupId: GroupId, world: Vec3): Vec3 | null;
  objectLocalToWorld(groupId: GroupId, local: Vec3): Vec3 | null;
  worldDirToObjectLocal(groupId: GroupId, worldDir: Vec3): Vec3 | null;
  /**
   * Cast a ray from the cursor and intersect it with a world-space plane.
   * Used in the offset stage to translate cursor motion into a world-space
   * offset on the plane perpendicular to the camera through the anchor.
   */
  unprojectToPlane(
    x: number,
    y: number,
    planePoint: Vec3,
    planeNormal: Vec3,
  ): Vec3 | null;
  /** Camera pose — `undefined` only before the viewer has finished init. */
  getCameraPose(): { position: Vec3; target: Vec3 } | undefined;
}

interface StagedAnchor {
  groupId: GroupId;
  local: Vec3;
  /** Anchor normal in Object-local space. Used as the fallback offset direction. */
  normalLocal: Vec3;
  /** World-space anchor cached for the offset stage's plane raycast. */
  worldPoint: Vec3;
}

export function createCalloutHandler(deps: {
  viewer: CalloutViewer;
  annotationsApi: UseAnnotationsApi;
  activeSceneId: Ref<string | null>;
  author: { setPreview(annotation: IdbAnnotation | null): void };
}): PickKindHandler {
  const { viewer, annotationsApi, activeSceneId, author } = deps;
  // Reactive so the author's `hint` computed re-runs after each click —
  // closure-only state would leave the banner stuck at "Pick the anchor"
  // until something else (mode flip etc.) invalidated the computed.
  const anchor = ref<StagedAnchor | null>(null);
  let previewOffsetWorld: Vec3 = [0, 0, 0];

  function reset(): void {
    anchor.value = null;
    previewOffsetWorld = [0, 0, 0];
    author.setPreview(null);
    viewer.setSnapHover(null);
  }

  function rebuildPreview(client: { x: number; y: number }): void {
    const sceneId = activeSceneId.value;
    const a = anchor.value;
    if (!sceneId || !a) return;
    const camFwd = cameraForward(viewer);
    const cursorWorld = viewer.unprojectToPlane(
      client.x,
      client.y,
      a.worldPoint,
      camFwd,
    );
    if (!cursorWorld) return;
    const raw: Vec3 = [
      cursorWorld[0] - a.worldPoint[0],
      cursorWorld[1] - a.worldPoint[1],
      cursorWorld[2] - a.worldPoint[2],
    ];
    previewOffsetWorld = snapToWorldAxis(raw);
    const offsetLocal = worldOffsetToLocal(
      viewer,
      a.groupId,
      previewOffsetWorld,
    );
    if (!offsetLocal) return;
    const now = '__preview__';
    const draft: IdbCallout = {
      id: PREVIEW_ANNOTATION_ID,
      sceneId,
      kind: 'callout',
      groupId: a.groupId,
      anchorLocal: plainVec3(a.local),
      anchorNormalLocal: plainVec3(a.normalLocal),
      labelOffsetLocal: plainVec3(offsetLocal),
      text: '',
      createdAt: now,
      updatedAt: now,
    };
    author.setPreview(draft);
  }

  return {
    hint: () => {
      if (!anchor.value) {
        return 'Click an edge, vertex, or face to anchor · Esc to cancel';
      }
      return 'Move to set offset · click to place · Esc to cancel';
    },

    onPointerMove(client) {
      if (!anchor.value) {
        viewer.setSnapHover(viewer.findSnapTarget(client.x, client.y));
        return;
      }
      // Stage 2: snap-hover stays cleared so the yellow vertex/edge cue
      // doesn't compete with the live preview.
      viewer.setSnapHover(null);
      rebuildPreview(client);
    },

    async onClick(client) {
      const sceneId = activeSceneId.value;
      if (!sceneId) {
        reset();
        return { done: true };
      }

      // Stage 1: pick the anchor.
      if (!anchor.value) {
        const snap = viewer.findSnapTarget(client.x, client.y);
        const placement = snap
          ? placementFromSnap(snap, viewer)
          : placementFromFace(viewer.raycastFromClient(client.x, client.y));
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
        anchor.value = {
          groupId: placement.groupId,
          local: plainVec3(anchorLocal),
          normalLocal: normalize3(plainVec3(normalLocal)),
          worldPoint: plainVec3(placement.worldPoint),
        };
        viewer.setSnapHover(null);
        // Seed the preview so a chip appears immediately at the click; the
        // user then drags the cursor to set the offset direction.
        rebuildPreview(client);
        return { done: false };
      }

      // Stage 2: commit at the current preview offset. Rebuild once at the
      // click point so a click without prior pointer motion still captures
      // a sensible offset.
      rebuildPreview(client);
      const a = anchor.value;
      if (!a) {
        reset();
        return { done: false };
      }
      const offsetMag = Math.hypot(
        previewOffsetWorld[0],
        previewOffsetWorld[1],
        previewOffsetWorld[2],
      );
      let labelOffsetLocal: Vec3;
      if (offsetMag < MIN_OFFSET_THRESHOLD_M) {
        // Fallback: user committed without moving. Default 6 cm along the
        // anchor normal, matching the legacy single-click behaviour.
        labelOffsetLocal = [
          a.normalLocal[0] * DEFAULT_LABEL_OFFSET_M,
          a.normalLocal[1] * DEFAULT_LABEL_OFFSET_M,
          a.normalLocal[2] * DEFAULT_LABEL_OFFSET_M,
        ];
      } else {
        const local = worldOffsetToLocal(viewer, a.groupId, previewOffsetWorld);
        labelOffsetLocal = local ? plainVec3(local) : [0, 0, 0];
      }
      try {
        const id = await annotationsApi.add({
          kind: 'callout',
          sceneId,
          groupId: a.groupId,
          anchorLocal: plainVec3(a.local),
          anchorNormalLocal: plainVec3(a.normalLocal),
          labelOffsetLocal,
          text: '',
        });
        reset();
        return { done: true, draftId: id ?? null };
      } catch (err) {
        // A persistence failure must not leave the handler stuck — every
        // subsequent click would land in the commit branch and re-throw.
        // Reset to stage 1 so the user can retry.
        console.error('[callout] commit failed:', err);
        reset();
        return { done: true };
      }
    },

    onEsc() {
      reset();
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
  // World-axis-aligned label normal: prefer +Y (label sits above the
  // anchor, matching how furniture plans publish labels). For edges
  // running along ±Y the +Y direction is parallel to the edge, so we fall
  // back to whichever horizontal axis (±X / ±Z) faces the camera most.
  // The result is always one of six world-axis unit vectors — no oblique
  // leaders — and is only used as the offset fallback when the user
  // commits without moving.
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

/**
 * Snap a raw 3D offset to the nearest world axis (±X / ±Y / ±Z), preserving
 * the projection onto that axis. Keeps callout leaders aligned with cabinet
 * edges regardless of camera orbit, mirroring how the dimension's
 * `snapOffsetToWorldAxis` keeps dim offsets on world-axis face planes.
 */
export function snapToWorldAxis(rawOffset: Vec3): Vec3 {
  const ax = Math.abs(rawOffset[0]);
  const ay = Math.abs(rawOffset[1]);
  const az = Math.abs(rawOffset[2]);
  if (ay >= ax && ay >= az) return [0, rawOffset[1], 0];
  if (ax >= az) return [rawOffset[0], 0, 0];
  return [0, 0, rawOffset[2]];
}

export const calloutKindHooks: KindHooks<IdbCallout> = {
  primaryWorld(a, lookup) {
    return lookup(a.groupId, labelLocal(a));
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

export type { ObjectLocalToWorld };
