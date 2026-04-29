/**
 * Interpolate between two `SceneState`s at `t ∈ [0,1]`.
 *
 * Easing is the caller's responsibility — pass in the eased `t` and this
 * function lerps linearly. Pure — no Three.js import — so the helper can be
 * unit-tested without booting the renderer; the slerp matches Three.js's
 * `Quaternion.slerpQuaternions` numerically.
 *
 * Strategy per field:
 * - `cameraMode` — hard cut at the midpoint. Persp ↔ ortho cannot lerp
 *   visually; the cut hides behind maximum motion blur of camera movement.
 * - `cameraPose` — linear lerp on position + target.
 * - `objectOffsets` — per groupId: lerp position, slerp quaternion. Missing
 *   keys default to identity so a scene that doesn't move an Object behaves
 *   identically whether or not the key is present.
 * - Visibility — cross-fade per groupId via `groupOpacity`.
 * - `floorVisible` — hard cut at the midpoint.
 */

import { IDENTITY_OBJECT_OFFSET } from '~/composables/useIdb';
import type { CameraPose, ObjectOffset } from '~/composables/useIdb';
import type { GroupId } from '~/utils/types';
import type { AppliedSceneState, SceneState } from './types';

export function interpolateSceneState(
  from: SceneState,
  to: SceneState,
  t: number,
  allGroupIds: readonly GroupId[],
): AppliedSceneState {
  const u = clamp01(t);
  const cameraMode = u >= 0.5 ? to.cameraMode : from.cameraMode;
  const floorVisible = u >= 0.5 ? to.floorVisible : from.floorVisible;

  const fromUp = from.cameraPose.up ?? [0, 1, 0];
  const toUp = to.cameraPose.up ?? [0, 1, 0];
  const cameraPose: CameraPose = {
    position: lerpVec3(from.cameraPose.position, to.cameraPose.position, u),
    target: lerpVec3(from.cameraPose.target, to.cameraPose.target, u),
    zoom: lerp(from.cameraPose.zoom ?? 1, to.cameraPose.zoom ?? 1, u),
    up: normalizeVec3(lerpVec3(fromUp, toUp, u)),
  };

  const fromVisible = from.visibleObjects;
  const toVisible = to.visibleObjects;
  const groupOpacity = new Map<GroupId, number>();
  for (const id of allGroupIds) {
    const inFrom = fromVisible === null || fromVisible.has(id);
    const inTo = toVisible === null || toVisible.has(id);
    if (inFrom && inTo) groupOpacity.set(id, 1);
    else if (!inFrom && !inTo) groupOpacity.set(id, 0);
    else if (inFrom && !inTo) groupOpacity.set(id, 1 - u);
    else groupOpacity.set(id, u);
  }

  const objectOffsets = new Map<GroupId, ObjectOffset>();
  for (const id of allGroupIds) {
    const a = from.objectOffsets.get(id) ?? IDENTITY_OBJECT_OFFSET;
    const b = to.objectOffsets.get(id) ?? IDENTITY_OBJECT_OFFSET;
    objectOffsets.set(id, {
      position: lerpVec3(a.position, b.position, u),
      quaternion: slerpQuat(a.quaternion, b.quaternion, u),
    });
  }

  return {
    cameraMode,
    cameraPose,
    objectOffsets,
    groupOpacity,
    floorVisible,
  };
}

function clamp01(x: number): number {
  if (Number.isNaN(x)) return 0;
  return Math.min(1, Math.max(0, x));
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function normalizeVec3(
  v: readonly [number, number, number],
): [number, number, number] {
  const len = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / len, v[1] / len, v[2] / len];
}

function lerpVec3(
  a: readonly [number, number, number],
  b: readonly [number, number, number],
  t: number,
): [number, number, number] {
  return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
}

/** Spherical linear interpolation between two unit quaternions. Matches
 *  THREE.Quaternion.slerpQuaternions: takes the shorter arc, falls back to a
 *  normalized lerp when the inputs are nearly parallel.
 */
function slerpQuat(
  a: readonly [number, number, number, number],
  b: readonly [number, number, number, number],
  t: number,
): [number, number, number, number] {
  let bx = b[0],
    by = b[1],
    bz = b[2],
    bw = b[3];
  let cosHalfTheta = a[0] * bx + a[1] * by + a[2] * bz + a[3] * bw;
  if (cosHalfTheta < 0) {
    bx = -bx;
    by = -by;
    bz = -bz;
    bw = -bw;
    cosHalfTheta = -cosHalfTheta;
  }
  if (cosHalfTheta >= 0.999999) {
    const x = a[0] + (bx - a[0]) * t;
    const y = a[1] + (by - a[1]) * t;
    const z = a[2] + (bz - a[2]) * t;
    const w = a[3] + (bw - a[3]) * t;
    const len = Math.hypot(x, y, z, w) || 1;
    return [x / len, y / len, z / len, w / len];
  }
  const sinHalfTheta = Math.sqrt(1 - cosHalfTheta * cosHalfTheta);
  const halfTheta = Math.atan2(sinHalfTheta, cosHalfTheta);
  const ratioA = Math.sin((1 - t) * halfTheta) / sinHalfTheta;
  const ratioB = Math.sin(t * halfTheta) / sinHalfTheta;
  return [
    a[0] * ratioA + bx * ratioB,
    a[1] * ratioA + by * ratioB,
    a[2] * ratioA + bz * ratioB,
    a[3] * ratioA + bw * ratioB,
  ];
}
