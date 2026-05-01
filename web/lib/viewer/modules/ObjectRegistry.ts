/**
 * The single source of truth for all loaded Objects. Every other module asks
 * the registry about Objects rather than maintaining a parallel Map.
 *
 * `setOffset` is the one place that writes a record's rigid offset (position
 * + quaternion). It also re-composes the cached `offsetMatrix` /
 * `offsetMatrixInverse`, updates the rendered edge-line transform, and emits
 * `object-moved`. Call sites must go through this; never mutate the offset
 * fields directly.
 */

import type { EventBus } from './EventBus';
import type { GroupId } from '~/utils/types';
import type { ObjectRecord, Quat4, Vec3, ViewerEvent } from '../types';

type Vector3 = import('three').Vector3;
type Matrix4 = import('three').Matrix4;
type BatchedMesh = import('three').BatchedMesh;

interface RegistryDeps {
  bus: EventBus<ViewerEvent>;
  requestRender: () => void;
  /** Pre-allocated unit-scale vector for Matrix4.compose. */
  oneScale: Vector3;
  /** Pre-allocated scratch matrix for composing offsetMatrix · originalMatrix. */
  scratchMatrix: Matrix4;
}

export interface ObjectOffsetInput {
  position?: Vec3;
  quaternion?: Quat4;
}

const IDENTITY_QUAT: Quat4 = [0, 0, 0, 1];
const ZERO_VEC: Vec3 = [0, 0, 0];

export class ObjectRegistry {
  private records = new Map<GroupId, ObjectRecord>();
  private batchedMeshes = new Set<BatchedMesh>();

  constructor(private deps: RegistryDeps) {}

  /**
   * Attach the live `BatchedMesh` so `setOffset` can rewrite per-instance
   * matrices when an Object's offset changes. Called by `ViewerCore.loadModel`
   * after the batch is built; `clear()` detaches. More than one batch can be
   * attached when the viewer has extra render passes that mirror the model.
   */
  attachBatched(batched: BatchedMesh): void {
    this.batchedMeshes.add(batched);
  }

  register(record: ObjectRecord): void {
    this.records.set(record.groupId, record);
  }

  get(id: GroupId): ObjectRecord | undefined {
    return this.records.get(id);
  }

  has(id: GroupId): boolean {
    return this.records.has(id);
  }

  delete(id: GroupId): void {
    const r = this.records.get(id);
    if (!r) return;
    if (r.edgeLines) {
      r.edgeLines.geometry.dispose();
      r.edgeLines.removeFromParent();
    }
    this.records.delete(id);
  }

  clear(): void {
    for (const r of this.records.values()) {
      if (r.edgeLines) {
        r.edgeLines.geometry.dispose();
        r.edgeLines.removeFromParent();
      }
    }
    this.records.clear();
    this.batchedMeshes.clear();
  }

  forEach(cb: (record: ObjectRecord) => void): void {
    this.records.forEach(cb);
  }

  filterByPart(partNumber: number): ObjectRecord[] {
    const out: ObjectRecord[] = [];
    for (const r of this.records.values()) {
      if (r.partNumber === partNumber) out.push(r);
    }
    return out;
  }

  getAllIds(): GroupId[] {
    return [...this.records.keys()];
  }

  size(): number {
    return this.records.size;
  }

  /**
   * Update an Object's rigid offset. Either component may be omitted —
   * omitted = "leave that component unchanged"; pass an identity tuple to
   * reset just one component.
   */
  setOffset(id: GroupId, input: ObjectOffsetInput): void {
    const r = this.records.get(id);
    if (!r) return;
    const pos = input.position ?? null;
    const quat = input.quaternion ?? null;
    // Skip the recompose + BatchedMesh write when nothing actually changed —
    // the tween loop calls setOffset every frame for every Object, and most
    // frames most Objects sit at identity.
    const posChanged =
      pos !== null &&
      (pos[0] !== r.offset.position.x ||
        pos[1] !== r.offset.position.y ||
        pos[2] !== r.offset.position.z);
    const quatChanged =
      quat !== null &&
      (quat[0] !== r.offset.quaternion.x ||
        quat[1] !== r.offset.quaternion.y ||
        quat[2] !== r.offset.quaternion.z ||
        quat[3] !== r.offset.quaternion.w);
    if (!posChanged && !quatChanged) return;
    if (posChanged) r.offset.position.set(pos![0], pos![1], pos![2]);
    if (quatChanged)
      r.offset.quaternion.set(quat![0], quat![1], quat![2], quat![3]);

    r.offsetMatrix.compose(
      r.offset.position,
      r.offset.quaternion,
      this.deps.oneScale,
    );
    r.offsetMatrixInverse.copy(r.offsetMatrix).invert();

    if (r.edgeLines) {
      r.edgeLines.position.copy(r.offset.position);
      r.edgeLines.quaternion.copy(r.offset.quaternion);
    }

    if (this.batchedMeshes.size > 0 && r.batchIds.length > 0) {
      const composed = this.deps.scratchMatrix.multiplyMatrices(
        r.offsetMatrix,
        r.originalMatrix,
      );
      for (const batched of this.batchedMeshes) {
        for (const b of r.batchIds) batched.setMatrixAt(b, composed);
      }
    }

    this.deps.bus.emit({ type: 'object-moved', groupId: id });
    this.deps.requestRender();
  }

  resetOffset(id: GroupId): void {
    this.setOffset(id, { position: ZERO_VEC, quaternion: IDENTITY_QUAT });
  }
}
