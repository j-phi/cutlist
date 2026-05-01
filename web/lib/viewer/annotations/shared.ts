/**
 * Geometry helpers shared by every annotation kind. Kept tiny and pure so
 * each kind's pick handler can stay focused on its own placement logic.
 */

import type { GroupId } from '~/utils/types';

export type Vec3 = [number, number, number];

/**
 * Copy a Vec3 into a fresh primitive tuple, escaping any Vue reactive proxy
 * the source may have been wrapped in. Cheap (3 reads) and load-bearing for
 * IndexedDB writes — structured clone of a reactive proxy can blow up
 * inside Dexie's transaction queue.
 */
export function plainVec3(v: Vec3): Vec3 {
  return [v[0], v[1], v[2]];
}

export function normalize3(v: Vec3): Vec3 {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
}

export function cross3(a: Vec3, b: Vec3): Vec3 {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

export function cameraForward(viewer: {
  getCameraPose(): { position: Vec3; target: Vec3 } | undefined;
}): Vec3 {
  const pose = viewer.getCameraPose();
  if (!pose) return [0, 0, -1];
  return normalize3([
    pose.target[0] - pose.position[0],
    pose.target[1] - pose.position[1],
    pose.target[2] - pose.position[2],
  ]);
}

/**
 * Convert a *world-space offset vector* into the Object's local frame while
 * preserving magnitude. Routes through a point transform — the local origin
 * is `[0, 0, 0]` exactly, so the world tip's local coords ARE the local
 * offset. Direction-only paths (`transformDirection`) normalise the result
 * and silently drop magnitude, which is wrong here.
 */
export function worldOffsetToLocal(
  viewer: {
    objectLocalToWorld(g: GroupId, local: Vec3): Vec3 | null;
    worldToObjectLocal(g: GroupId, world: Vec3): Vec3 | null;
  },
  groupId: GroupId,
  worldOffset: Vec3,
): Vec3 | null {
  const originWorld = viewer.objectLocalToWorld(groupId, [0, 0, 0]);
  if (!originWorld) return null;
  return viewer.worldToObjectLocal(groupId, [
    originWorld[0] + worldOffset[0],
    originWorld[1] + worldOffset[1],
    originWorld[2] + worldOffset[2],
  ]);
}
