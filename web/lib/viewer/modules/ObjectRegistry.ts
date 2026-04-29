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
import type {
  ObjectId,
  ObjectRecord,
  Quat4,
  Vec3,
  ViewerEvent,
} from '../types';

type Vector3 = import('three').Vector3;

interface RegistryDeps {
  bus: EventBus<ViewerEvent>;
  requestRender: () => void;
  /** Pre-allocated unit-scale vector for Matrix4.compose. */
  oneScale: Vector3;
}

export interface ObjectOffsetInput {
  position?: Vec3;
  quaternion?: Quat4;
}

const IDENTITY_QUAT: Quat4 = [0, 0, 0, 1];
const ZERO_VEC: Vec3 = [0, 0, 0];

export class ObjectRegistry {
  private records = new Map<ObjectId, ObjectRecord>();

  constructor(private deps: RegistryDeps) {}

  register(record: ObjectRecord): void {
    this.records.set(record.groupId, record);
  }

  get(id: ObjectId): ObjectRecord | undefined {
    return this.records.get(id);
  }

  has(id: ObjectId): boolean {
    return this.records.has(id);
  }

  delete(id: ObjectId): void {
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

  getAllIds(): ObjectId[] {
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
  setOffset(id: ObjectId, input: ObjectOffsetInput): void {
    const r = this.records.get(id);
    if (!r) return;
    const pos = input.position ?? null;
    const quat = input.quaternion ?? null;
    if (pos) r.offset.position.set(pos[0], pos[1], pos[2]);
    if (quat) r.offset.quaternion.set(quat[0], quat[1], quat[2], quat[3]);

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
    this.deps.bus.emit({ type: 'object-moved', groupId: id });
    this.deps.requestRender();
  }

  resetOffset(id: ObjectId): void {
    this.setOffset(id, { position: ZERO_VEC, quaternion: IDENTITY_QUAT });
  }
}
