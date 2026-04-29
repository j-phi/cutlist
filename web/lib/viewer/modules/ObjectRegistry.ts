/**
 * The single source of truth for all loaded Objects. Every other module asks
 * the registry about Objects rather than maintaining a parallel Map.
 *
 * `setOffset` is the one place that translates the per-Object edge lines so
 * they stay in sync with the geometry. Call sites must go through this; never
 * mutate `record.offset` or `record.edgeLines.position` directly.
 */

import type { EventBus } from './EventBus';
import type { ObjectId, ObjectRecord, ViewerEvent } from '../types';

interface RegistryDeps {
  bus: EventBus<ViewerEvent>;
  requestRender: () => void;
}

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

  setOffset(id: ObjectId, offset: [number, number, number]): void {
    const r = this.records.get(id);
    if (!r) return;
    r.offset.set(offset[0], offset[1], offset[2]);
    if (r.edgeLines) {
      r.edgeLines.position.set(offset[0], offset[1], offset[2]);
    }
    this.deps.bus.emit({ type: 'object-moved', groupId: id });
    this.deps.requestRender();
  }
}
