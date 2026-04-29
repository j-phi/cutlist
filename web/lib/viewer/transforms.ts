/**
 * Coordinate transforms between Object-local space and world space. These are
 * the single source of truth for any code that needs to anchor data (annotations,
 * snap points, etc.) to an Object that may be offset from its load position.
 *
 * Pre-allocated scratch vectors avoid GC churn — callers must pass `out`.
 */

import type { ObjectRecord } from './types';

type Vector3 = import('three').Vector3;

export function transformLocalToWorld(
  record: ObjectRecord,
  local: Vector3,
  out: Vector3,
): Vector3 {
  return out.copy(local).applyMatrix4(record.originalMatrix).add(record.offset);
}

export function transformWorldToLocal(
  record: ObjectRecord,
  world: Vector3,
  out: Vector3,
): Vector3 {
  return out
    .copy(world)
    .sub(record.offset)
    .applyMatrix4(record.originalMatrixInverse);
}

export function transformDirLocalToWorld(
  record: ObjectRecord,
  localDir: Vector3,
  out: Vector3,
): Vector3 {
  return out.copy(localDir).transformDirection(record.originalMatrix);
}

export function transformDirWorldToLocal(
  record: ObjectRecord,
  worldDir: Vector3,
  out: Vector3,
): Vector3 {
  return out.copy(worldDir).transformDirection(record.originalMatrixInverse);
}
