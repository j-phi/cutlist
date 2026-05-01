import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { EventBus } from '../EventBus';
import { ObjectRegistry } from '../ObjectRegistry';
import type { ObjectRecord, ViewerEvent } from '../../types';

interface FakeEdgeLines {
  position: import('three').Vector3;
  quaternion: import('three').Quaternion;
  geometry: { dispose: () => void };
  removeFromParent: () => void;
}

function makeFakeEdgeLines(): FakeEdgeLines {
  return {
    position: new THREE.Vector3(),
    quaternion: new THREE.Quaternion(),
    geometry: { dispose: vi.fn() },
    removeFromParent: vi.fn(),
  };
}

function makeRecord(groupId: number, edgeLines?: FakeEdgeLines): ObjectRecord {
  return {
    groupId,
    partNumber: 1,
    name: `Part_${groupId}`,
    batchIds: [groupId * 2],
    originalMatrix: new THREE.Matrix4(),
    originalMatrixInverse: new THREE.Matrix4(),
    center: new THREE.Vector3(),
    offset: {
      position: new THREE.Vector3(),
      quaternion: new THREE.Quaternion(),
    },
    offsetMatrix: new THREE.Matrix4(),
    offsetMatrixInverse: new THREE.Matrix4(),
    edgesLocal: new Float32Array(0),
    boundsLocalCenter: new THREE.Vector3(),
    boundsLocalRadius: 0,
    boundsLocalMin: new THREE.Vector3(),
    boundsLocalMax: new THREE.Vector3(),
    edgeLines: edgeLines as ObjectRecord['edgeLines'],
  };
}

function makeRegistry(): {
  reg: ObjectRegistry;
  bus: EventBus<ViewerEvent>;
  requestRender: ReturnType<typeof vi.fn>;
} {
  const bus = new EventBus<ViewerEvent>();
  const requestRender = vi.fn();
  const reg = new ObjectRegistry({
    bus,
    requestRender,
    oneScale: new THREE.Vector3(1, 1, 1),
    scratchMatrix: new THREE.Matrix4(),
  });
  return { reg, bus, requestRender };
}

describe('ObjectRegistry', () => {
  it('Should register and retrieve records by groupId', () => {
    const { reg } = makeRegistry();
    const r = makeRecord(5);

    reg.register(r);

    expect(reg.has(5)).toBe(true);
    expect(reg.get(5)).toBe(r);
    expect(reg.size()).toBe(1);
  });

  it('Should emit object-moved and update position when setOffset is called', () => {
    const { reg, bus } = makeRegistry();
    reg.register(makeRecord(2));

    const handler = vi.fn();
    bus.on('object-moved', handler);
    reg.setOffset(2, { position: [1, 2, 3] });

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith({ type: 'object-moved', groupId: 2 });
    const r = reg.get(2)!;
    expect(r.offset.position.toArray()).toEqual([1, 2, 3]);
    expect(r.offset.quaternion.toArray()).toEqual([0, 0, 0, 1]);
  });

  it('Should compose offsetMatrix and offsetMatrixInverse on setOffset', () => {
    const { reg } = makeRegistry();
    reg.register(makeRecord(2));
    // 90° rotation around Y
    const q = new THREE.Quaternion().setFromAxisAngle(
      new THREE.Vector3(0, 1, 0),
      Math.PI / 2,
    );
    reg.setOffset(2, {
      position: [10, 0, 0],
      quaternion: [q.x, q.y, q.z, q.w],
    });

    const r = reg.get(2)!;
    // Local-origin should map to position via offsetMatrix.
    const v = new THREE.Vector3(0, 0, 0).applyMatrix4(r.offsetMatrix);
    expect(v.x).toBeCloseTo(10);
    expect(v.y).toBeCloseTo(0);
    expect(v.z).toBeCloseTo(0);

    // Round-trip through inverse should land back at origin.
    const back = v.clone().applyMatrix4(r.offsetMatrixInverse);
    expect(back.x).toBeCloseTo(0);
    expect(back.y).toBeCloseTo(0);
    expect(back.z).toBeCloseTo(0);
  });

  it('Should update edgeLines transform when an object moves', () => {
    const { reg } = makeRegistry();
    const edgeLines = makeFakeEdgeLines();
    reg.register(makeRecord(7, edgeLines));

    const q = new THREE.Quaternion().setFromAxisAngle(
      new THREE.Vector3(1, 0, 0),
      0.5,
    );
    reg.setOffset(7, {
      position: [4, 5, 6],
      quaternion: [q.x, q.y, q.z, q.w],
    });

    expect(edgeLines.position.toArray()).toEqual([4, 5, 6]);
    expect(edgeLines.quaternion.x).toBeCloseTo(q.x);
    expect(edgeLines.quaternion.w).toBeCloseTo(q.w);
  });

  it('Should leave omitted offset components unchanged', () => {
    const { reg } = makeRegistry();
    reg.register(makeRecord(9));

    reg.setOffset(9, { position: [1, 2, 3] });
    reg.setOffset(9, { quaternion: [0, 0, 0.7071, 0.7071] });

    const r = reg.get(9)!;
    expect(r.offset.position.toArray()).toEqual([1, 2, 3]);
    expect(r.offset.quaternion.x).toBeCloseTo(0);
    expect(r.offset.quaternion.z).toBeCloseTo(0.7071);
    expect(r.offset.quaternion.w).toBeCloseTo(0.7071);
  });

  it('Should reset position and quaternion to identity on resetOffset', () => {
    const { reg } = makeRegistry();
    reg.register(makeRecord(11));
    reg.setOffset(11, {
      position: [1, 2, 3],
      quaternion: [0, 0, 0.7071, 0.7071],
    });
    reg.resetOffset(11);

    const r = reg.get(11)!;
    expect(r.offset.position.toArray()).toEqual([0, 0, 0]);
    expect(r.offset.quaternion.toArray()).toEqual([0, 0, 0, 1]);
  });

  it('Should rewrite BatchedMesh per-instance matrices when an offset moves', () => {
    const { reg } = makeRegistry();
    const r = makeRecord(4);
    r.batchIds = [10, 11];
    r.originalMatrix.makeTranslation(1, 0, 0);
    reg.register(r);

    const setMatrixAt = vi.fn();
    reg.attachBatched({
      setMatrixAt,
    } as unknown as import('three').BatchedMesh);

    reg.setOffset(4, { position: [0, 5, 0] });

    expect(setMatrixAt).toHaveBeenCalledTimes(2);
    const [batchId0, mat0] = setMatrixAt.mock.calls[0];
    expect(batchId0).toBe(10);
    // Composed = T(0,5,0) · T(1,0,0) → translation (1,5,0).
    const v = new THREE.Vector3().setFromMatrixPosition(mat0);
    expect(v.x).toBeCloseTo(1);
    expect(v.y).toBeCloseTo(5);
    expect(v.z).toBeCloseTo(0);
  });

  it('Should rewrite every attached BatchedMesh when an offset moves', () => {
    const { reg } = makeRegistry();
    const r = makeRecord(4);
    r.batchIds = [10];
    reg.register(r);

    const primary = { setMatrixAt: vi.fn() };
    const overlay = { setMatrixAt: vi.fn() };
    reg.attachBatched(primary as unknown as import('three').BatchedMesh);
    reg.attachBatched(overlay as unknown as import('three').BatchedMesh);

    reg.setOffset(4, { position: [0, 5, 0] });

    expect(primary.setMatrixAt).toHaveBeenCalledTimes(1);
    expect(overlay.setMatrixAt).toHaveBeenCalledTimes(1);
    expect(primary.setMatrixAt.mock.calls[0][0]).toBe(10);
    expect(overlay.setMatrixAt.mock.calls[0][0]).toBe(10);
  });

  it('Should request a render after setOffset', () => {
    const { reg, requestRender } = makeRegistry();
    reg.register(makeRecord(3));
    reg.setOffset(3, { position: [1, 0, 0] });
    expect(requestRender).toHaveBeenCalled();
  });

  it('Should dispose edge geometries on clear', () => {
    const { reg } = makeRegistry();
    const edgeLines = makeFakeEdgeLines();
    reg.register(makeRecord(1, edgeLines));

    reg.clear();

    expect(edgeLines.geometry.dispose).toHaveBeenCalled();
    expect(edgeLines.removeFromParent).toHaveBeenCalled();
    expect(reg.size()).toBe(0);
  });

  it('Should filter records by partNumber', () => {
    const { reg } = makeRegistry();
    const a = makeRecord(1);
    a.partNumber = 10;
    const b = makeRecord(2);
    b.partNumber = 10;
    const c = makeRecord(3);
    c.partNumber = 11;
    reg.register(a);
    reg.register(b);
    reg.register(c);

    const tens = reg.filterByPart(10);
    expect(tens.map((r) => r.groupId).sort()).toEqual([1, 2]);
  });
});
