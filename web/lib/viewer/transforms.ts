/**
 * Coordinate transforms between Object-local space and world space. These are
 * the single source of truth for any code that needs to anchor data
 * (annotations, snap points, etc.) to an Object that may be rigidly
 * transformed (translated and/or rotated) from its load position.
 *
 * Local → world: `world = M_offset · M_orig · local`
 * World → local: `local = M_orig⁻¹ · M_offset⁻¹ · world`
 *
 * `M_offset` is `T(offset.position) · R(offset.quaternion)`. The registry
 * keeps both `offsetMatrix` and `offsetMatrixInverse` cached on the record
 * so this hot path is a single `applyMatrix4` per direction.
 */

import type { ObjectRecord } from './types';

type Vector3 = import('three').Vector3;

export function transformLocalToWorld(
  record: ObjectRecord,
  local: Vector3,
  out: Vector3,
): Vector3 {
  return out
    .copy(local)
    .applyMatrix4(record.originalMatrix)
    .applyMatrix4(record.offsetMatrix);
}

export function transformWorldToLocal(
  record: ObjectRecord,
  world: Vector3,
  out: Vector3,
): Vector3 {
  return out
    .copy(world)
    .applyMatrix4(record.offsetMatrixInverse)
    .applyMatrix4(record.originalMatrixInverse);
}

export function transformDirLocalToWorld(
  record: ObjectRecord,
  localDir: Vector3,
  out: Vector3,
): Vector3 {
  return out
    .copy(localDir)
    .transformDirection(record.originalMatrix)
    .applyQuaternion(record.offset.quaternion);
}

export function transformDirWorldToLocal(
  record: ObjectRecord,
  worldDir: Vector3,
  out: Vector3,
): Vector3 {
  return out.copy(worldDir).transformDirection(record.offsetMatrixInverse);
}
