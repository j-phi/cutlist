import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { EventBus } from '../EventBus';
import { ObjectRegistry } from '../ObjectRegistry';
import type { ObjectRecord, ViewerEvent } from '../../types';

function makeRecord(
  groupId: number,
  edgeLines?: {
    position: { set: (x: number, y: number, z: number) => void };
    geometry: { dispose: () => void };
    removeFromParent: () => void;
  },
): ObjectRecord {
  return {
    groupId,
    partNumber: 1,
    name: `Part_${groupId}`,
    batchIds: [groupId * 2],
    originalMatrix: new THREE.Matrix4(),
    originalMatrixInverse: new THREE.Matrix4(),
    center: new THREE.Vector3(),
    offset: new THREE.Vector3(),
    edgesLocal: new Float32Array(0),
    edgeLines: edgeLines as ObjectRecord['edgeLines'],
  };
}

describe('ObjectRegistry', () => {
  it('Should register and retrieve records by groupId', () => {
    const bus = new EventBus<ViewerEvent>();
    const reg = new ObjectRegistry({ bus, requestRender: () => {} });
    const r = makeRecord(5);

    reg.register(r);

    expect(reg.has(5)).toBe(true);
    expect(reg.get(5)).toBe(r);
    expect(reg.size()).toBe(1);
  });

  it('Should emit object-moved when setOffset is called', () => {
    const bus = new EventBus<ViewerEvent>();
    const reg = new ObjectRegistry({ bus, requestRender: () => {} });
    reg.register(makeRecord(2));

    const handler = vi.fn();
    bus.on('object-moved', handler);
    reg.setOffset(2, [1, 2, 3]);

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith({ type: 'object-moved', groupId: 2 });
    expect(reg.get(2)?.offset.toArray()).toEqual([1, 2, 3]);
  });

  it('Should translate edgeLines.position when an object moves', () => {
    const bus = new EventBus<ViewerEvent>();
    const reg = new ObjectRegistry({ bus, requestRender: () => {} });
    const setSpy = vi.fn();
    reg.register(
      makeRecord(7, {
        position: { set: setSpy },
        geometry: { dispose: () => {} },
        removeFromParent: () => {},
      }),
    );

    reg.setOffset(7, [4, 5, 6]);

    expect(setSpy).toHaveBeenCalledWith(4, 5, 6);
  });

  it('Should request a render after setOffset', () => {
    const bus = new EventBus<ViewerEvent>();
    const requestRender = vi.fn();
    const reg = new ObjectRegistry({ bus, requestRender });
    reg.register(makeRecord(3));
    reg.setOffset(3, [1, 0, 0]);
    expect(requestRender).toHaveBeenCalled();
  });

  it('Should dispose edge geometries on clear', () => {
    const bus = new EventBus<ViewerEvent>();
    const reg = new ObjectRegistry({ bus, requestRender: () => {} });
    const dispose = vi.fn();
    const removeFromParent = vi.fn();
    reg.register(
      makeRecord(1, {
        position: { set: () => {} },
        geometry: { dispose },
        removeFromParent,
      }),
    );

    reg.clear();

    expect(dispose).toHaveBeenCalled();
    expect(removeFromParent).toHaveBeenCalled();
    expect(reg.size()).toBe(0);
  });

  it('Should filter records by partNumber', () => {
    const bus = new EventBus<ViewerEvent>();
    const reg = new ObjectRegistry({ bus, requestRender: () => {} });
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
