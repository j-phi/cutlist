import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { EventBus } from '../EventBus';
import { GizmoController } from '../GizmoController';
import { ObjectRegistry } from '../ObjectRegistry';
import type { ObjectRecord, ViewerEvent } from '../../types';

type Object3D = import('three').Object3D;
type Camera = import('three').Camera;

function makeRegistry(): {
  reg: ObjectRegistry;
  bus: EventBus<ViewerEvent>;
} {
  const bus = new EventBus<ViewerEvent>();
  const reg = new ObjectRegistry({
    bus,
    requestRender: vi.fn(),
    oneScale: new THREE.Vector3(1, 1, 1),
    scratchMatrix: new THREE.Matrix4(),
  });
  return { reg, bus };
}

function makeRecord(
  groupId: number,
  center: [number, number, number],
): ObjectRecord {
  return {
    groupId,
    partNumber: 1,
    name: `Part_${groupId}`,
    batchIds: [],
    originalMatrix: new THREE.Matrix4(),
    originalMatrixInverse: new THREE.Matrix4(),
    center: new THREE.Vector3(...center),
    offset: {
      position: new THREE.Vector3(),
      quaternion: new THREE.Quaternion(),
    },
    offsetMatrix: new THREE.Matrix4(),
    offsetMatrixInverse: new THREE.Matrix4(),
    edgesLocal: new Float32Array(0),
    boundsLocalCenter: new THREE.Vector3(),
    boundsLocalRadius: 0,
    edgeLines: null,
  };
}

interface FakeControls {
  attach: ReturnType<typeof vi.fn>;
  detach: ReturnType<typeof vi.fn>;
  setMode: ReturnType<typeof vi.fn>;
  addEventListener: (
    type: string,
    cb: (e: { value?: boolean }) => void,
  ) => void;
  removeEventListener: (
    type: string,
    cb: (e: { value?: boolean }) => void,
  ) => void;
  dispatch: (type: string, payload?: { value?: boolean }) => void;
  attached: Object3D | null;
  camera: Camera;
  enabled: boolean;
  size: number;
}

function makeFakeControlsCtor(): {
  ctor: new (camera: Camera, dom: HTMLElement) => FakeControls;
  instances: FakeControls[];
} {
  const instances: FakeControls[] = [];
  function FakeCtor(this: FakeControls, camera: Camera) {
    const handlers = new Map<string, Set<(e: { value?: boolean }) => void>>();
    this.attached = null;
    this.camera = camera;
    this.enabled = true;
    this.size = 1; // matches real TransformControls default
    this.attach = vi.fn((obj: Object3D) => {
      this.attached = obj;
    });
    this.detach = vi.fn(() => {
      this.attached = null;
    });
    this.setMode = vi.fn();
    this.addEventListener = (type, cb) => {
      let set = handlers.get(type);
      if (!set) {
        set = new Set();
        handlers.set(type, set);
      }
      set.add(cb);
    };
    this.removeEventListener = (type, cb) => {
      handlers.get(type)?.delete(cb);
    };
    this.dispatch = (type, payload) => {
      handlers.get(type)?.forEach((cb) => cb(payload ?? {}));
    };
    instances.push(this);
  }
  return {
    ctor: FakeCtor as unknown as new (
      camera: Camera,
      dom: HTMLElement,
    ) => FakeControls,
    instances,
  };
}

function makeFakeSceneGraph() {
  const adds: Object3D[] = [];
  const removes: Object3D[] = [];
  return {
    addToGroup: vi.fn((_name: string, obj: Object3D) => {
      adds.push(obj);
    }),
    removeFromGroup: vi.fn((_name: string, obj: Object3D) => {
      removes.push(obj);
    }),
    adds,
    removes,
  };
}

function buildGizmo(records: ObjectRecord[]) {
  const { reg, bus } = makeRegistry();
  for (const r of records) reg.register(r);

  const { ctor, instances } = makeFakeControlsCtor();
  const sceneGraph = makeFakeSceneGraph();
  const cameraControls = { enabled: true };
  const camera = new THREE.PerspectiveCamera();
  const dom = {} as HTMLElement;
  const requestRender = vi.fn();

  // Test-side stand-in for ViewerCore.acquireInteractionLock — refcount + spies.
  let lockCount = 0;
  const acquires: Array<() => void> = [];
  const acquireInteractionLock = vi.fn(() => {
    lockCount++;
    let released = false;
    const release = vi.fn(() => {
      if (released) return;
      released = true;
      lockCount--;
    });
    acquires.push(release);
    return release;
  });

  const deps = {
    THREE,
    TransformControlsCtor: ctor,
    camera,
    domElement: dom,
    registry: reg,
    sceneGraph: sceneGraph as unknown as import('../SceneGraph').SceneGraph,
    cameraControls,
    acquireInteractionLock,
    requestRender,
  };
  const gizmo = new GizmoController(
    deps as unknown as ConstructorParameters<typeof GizmoController>[0],
  );

  return {
    gizmo,
    reg,
    bus,
    controls: instances[0],
    sceneGraph,
    cameraControls,
    acquireInteractionLock,
    getLockCount: () => lockCount,
    requestRender,
  };
}

describe('GizmoController', () => {
  it('Should attach on first selection and detach on empty selection', () => {
    const r = makeRecord(1, [0, 0, 0]);
    const { gizmo, controls } = buildGizmo([r]);

    // detach is called once during construction.
    const initialDetachCount = controls.detach.mock.calls.length;

    gizmo.setSelection([1]);
    expect(controls.attach).toHaveBeenCalledTimes(1);

    gizmo.setSelection([]);
    expect(controls.detach.mock.calls.length).toBeGreaterThan(
      initialDetachCount,
    );
  });

  it('Should re-attach on a new selection after empty', () => {
    const r = makeRecord(1, [0, 0, 0]);
    const { gizmo, controls } = buildGizmo([r]);

    gizmo.setSelection([1]);
    gizmo.setSelection([]);
    gizmo.setSelection([1]);
    expect(controls.attach).toHaveBeenCalledTimes(2);
  });

  it('Should place proxy at the centroid of selected record centers', () => {
    const r1 = makeRecord(1, [2, 0, 0]);
    const r2 = makeRecord(2, [4, 0, 6]);
    const { gizmo, controls } = buildGizmo([r1, r2]);

    gizmo.setSelection([1, 2]);
    const proxy = controls.attached!;
    expect(proxy.position.x).toBeCloseTo(3);
    expect(proxy.position.y).toBeCloseTo(0);
    expect(proxy.position.z).toBeCloseTo(3);
  });

  it('Should write translated offsets through registry on drag change', () => {
    const r = makeRecord(1, [0, 0, 0]);
    const { gizmo, reg, controls } = buildGizmo([r]);

    gizmo.setSelection([1]);
    const proxy = controls.attached!;

    // Press: snapshot start state.
    controls.dispatch('dragging-changed', { value: true });
    // Move proxy by (5, 0, 0).
    proxy.position.set(5, 0, 0);
    controls.dispatch('objectChange');

    const offset = reg.get(1)!.offset;
    expect(offset.position.toArray()).toEqual([5, 0, 0]);
    expect(offset.quaternion.toArray()).toEqual([0, 0, 0, 1]);

    // Release.
    controls.dispatch('dragging-changed', { value: false });
  });

  it('Should rotate selected offsets around the centroid on rotate drag', () => {
    // Centers straddle x=±1 → load-time centroid at origin. Pre-seed offsets
    // so a 90° proxy rotation produces a non-trivial position delta.
    const r1 = makeRecord(1, [1, 0, 0]);
    const r2 = makeRecord(2, [-1, 0, 0]);
    const { gizmo, reg, controls } = buildGizmo([r1, r2]);
    reg.setOffset(1, { position: [1, 0, 0] });
    reg.setOffset(2, { position: [-1, 0, 0] });

    gizmo.setSelection([1, 2]);
    gizmo.setMode('rotate');
    const proxy = controls.attached!;

    controls.dispatch('dragging-changed', { value: true });

    const yQuat = new THREE.Quaternion().setFromAxisAngle(
      new THREE.Vector3(0, 1, 0),
      Math.PI / 2,
    );
    proxy.quaternion.copy(yQuat);
    controls.dispatch('objectChange');

    const o1 = reg.get(1)!.offset;
    // Centroid (offsetMatrix · center) = avg((2,0,0), (-2,0,0)) = (0,0,0).
    // start.pos (1,0,0) rotated 90° around Y about origin → (0,0,-1).
    expect(o1.position.x).toBeCloseTo(0);
    expect(o1.position.y).toBeCloseTo(0);
    expect(o1.position.z).toBeCloseTo(-1);
    expect(o1.quaternion.y).toBeCloseTo(yQuat.y);
    expect(o1.quaternion.w).toBeCloseTo(yQuat.w);

    const o2 = reg.get(2)!.offset;
    // start.pos (-1,0,0) rotated 90° around Y about origin → (0,0,1).
    expect(o2.position.x).toBeCloseTo(0);
    expect(o2.position.z).toBeCloseTo(1);
  });

  it('Should plumb mode changes through to TransformControls', () => {
    const { gizmo, controls } = buildGizmo([makeRecord(1, [0, 0, 0])]);
    gizmo.setMode('rotate');
    expect(controls.setMode).toHaveBeenLastCalledWith('rotate');
    expect(gizmo.getMode()).toBe('rotate');
    gizmo.setMode('translate');
    expect(controls.setMode).toHaveBeenLastCalledWith('translate');
  });

  it('Should disable camera controls during drag and re-enable on release', () => {
    const { gizmo, controls, cameraControls } = buildGizmo([
      makeRecord(1, [0, 0, 0]),
    ]);
    gizmo.setSelection([1]);
    expect(cameraControls.enabled).toBe(true);

    controls.dispatch('dragging-changed', { value: true });
    expect(cameraControls.enabled).toBe(false);

    controls.dispatch('dragging-changed', { value: false });
    expect(cameraControls.enabled).toBe(true);
  });

  it('Should call registry.resetOffset for each id passed to resetSelectedOffsets', () => {
    const r1 = makeRecord(1, [0, 0, 0]);
    const r2 = makeRecord(2, [0, 0, 0]);
    const { gizmo, reg } = buildGizmo([r1, r2]);
    reg.setOffset(1, { position: [3, 0, 0] });
    reg.setOffset(2, { position: [0, 4, 0] });

    const spy = vi.spyOn(reg, 'resetOffset');
    gizmo.resetSelectedOffsets([1, 2]);

    expect(spy).toHaveBeenCalledWith(1);
    expect(spy).toHaveBeenCalledWith(2);
    expect(reg.get(1)!.offset.position.toArray()).toEqual([0, 0, 0]);
    expect(reg.get(2)!.offset.position.toArray()).toEqual([0, 0, 0]);
  });

  it('Should acquire and release the interaction lock around a drag', () => {
    const { gizmo, controls, acquireInteractionLock, getLockCount } =
      buildGizmo([makeRecord(1, [0, 0, 0])]);
    gizmo.setSelection([1]);
    expect(getLockCount()).toBe(0);

    controls.dispatch('dragging-changed', { value: true });
    expect(acquireInteractionLock).toHaveBeenCalledTimes(1);
    expect(getLockCount()).toBe(1);

    controls.dispatch('dragging-changed', { value: false });
    expect(getLockCount()).toBe(0);
  });

  it('Should release the interaction lock if disposed mid-drag', () => {
    const { gizmo, controls, getLockCount } = buildGizmo([
      makeRecord(1, [0, 0, 0]),
    ]);
    gizmo.setSelection([1]);
    controls.dispatch('dragging-changed', { value: true });
    expect(getLockCount()).toBe(1);
    gizmo.dispose();
    expect(getLockCount()).toBe(0);
  });

  it('Should ignore objectChange events fired outside of a drag', () => {
    const r = makeRecord(1, [0, 0, 0]);
    const { gizmo, reg, controls } = buildGizmo([r]);
    gizmo.setSelection([1]);

    const setOffsetSpy = vi.spyOn(reg, 'setOffset');
    // No 'dragging-changed' true → not in a drag.
    controls.dispatch('objectChange');

    expect(setOffsetSpy).not.toHaveBeenCalled();
  });

  it('Should configure TransformControls with the smaller gizmo size', () => {
    const { controls } = buildGizmo([makeRecord(1, [0, 0, 0])]);
    expect(controls.size).toBeLessThan(1);
  });

  it('Should swap controls.camera when setCamera is called', () => {
    const { gizmo, controls } = buildGizmo([makeRecord(1, [0, 0, 0])]);
    const ortho = new THREE.OrthographicCamera();
    gizmo.setCamera(ortho);
    expect(controls.camera).toBe(ortho);
  });

  it('Should track the centroid of a rotated object via offsetMatrix · center', () => {
    // r.center=(2,0,0), pre-applied 90°Y rotation around the world origin →
    // current world center = (0,0,-2). Re-selecting after the rotation must
    // anchor the gizmo at the rotated centroid, not r.center + offset.position.
    const r = makeRecord(1, [2, 0, 0]);
    const { gizmo, reg, controls } = buildGizmo([r]);
    const yQuat = new THREE.Quaternion().setFromAxisAngle(
      new THREE.Vector3(0, 1, 0),
      Math.PI / 2,
    );
    reg.setOffset(1, {
      quaternion: [yQuat.x, yQuat.y, yQuat.z, yQuat.w],
    });

    gizmo.setSelection([1]);
    const proxy = controls.attached!;
    expect(proxy.position.x).toBeCloseTo(0);
    expect(proxy.position.y).toBeCloseTo(0);
    expect(proxy.position.z).toBeCloseTo(-2);
  });

  it('Should translate every selected record together on a multi-select drag', () => {
    const r1 = makeRecord(1, [1, 0, 0]);
    const r2 = makeRecord(2, [-1, 0, 0]);
    const { gizmo, reg, controls } = buildGizmo([r1, r2]);

    gizmo.setSelection([1, 2]);
    const proxy = controls.attached!;
    controls.dispatch('dragging-changed', { value: true });
    proxy.position.set(proxy.position.x, 4, 0);
    controls.dispatch('objectChange');

    expect(reg.get(1)!.offset.position.toArray()).toEqual([0, 4, 0]);
    expect(reg.get(2)!.offset.position.toArray()).toEqual([0, 4, 0]);
  });

  it('Should compute deltas from a fresh start state on each drag', () => {
    const r = makeRecord(1, [0, 0, 0]);
    const { gizmo, reg, controls } = buildGizmo([r]);
    gizmo.setSelection([1]);
    const proxy = controls.attached!;

    // First drag: translate by (3, 0, 0).
    controls.dispatch('dragging-changed', { value: true });
    proxy.position.set(3, 0, 0);
    controls.dispatch('objectChange');
    controls.dispatch('dragging-changed', { value: false });
    expect(reg.get(1)!.offset.position.toArray()).toEqual([3, 0, 0]);

    // Second drag (no selection change): proxy now starts at (3,0,0). Move
    // to (5,0,0) — Δp = (2,0,0). offset becomes (3 + 2, 0, 0) = (5,0,0), not
    // (3 + 5, 0, 0) which would be the bug if start state weren't refreshed.
    controls.dispatch('dragging-changed', { value: true });
    proxy.position.set(5, 0, 0);
    controls.dispatch('objectChange');
    controls.dispatch('dragging-changed', { value: false });
    expect(reg.get(1)!.offset.position.toArray()).toEqual([5, 0, 0]);
  });

  it('Should reset every registered Object on resetAllOffsets', () => {
    const r1 = makeRecord(1, [0, 0, 0]);
    const r2 = makeRecord(2, [0, 0, 0]);
    const { gizmo, reg } = buildGizmo([r1, r2]);
    reg.setOffset(1, { position: [1, 2, 3] });
    reg.setOffset(2, { position: [4, 5, 6] });

    gizmo.resetAllOffsets();

    expect(reg.get(1)!.offset.position.toArray()).toEqual([0, 0, 0]);
    expect(reg.get(2)!.offset.position.toArray()).toEqual([0, 0, 0]);
  });

  it('Should re-sync proxy to the current centroid after resetSelectedOffsets', () => {
    const r = makeRecord(1, [2, 0, 0]);
    const { gizmo, reg, controls } = buildGizmo([r]);
    reg.setOffset(1, { position: [10, 0, 0] });

    gizmo.setSelection([1]);
    const proxy = controls.attached!;
    expect(proxy.position.x).toBeCloseTo(12); // center + offset

    gizmo.resetSelectedOffsets([1]);
    expect(proxy.position.x).toBeCloseTo(2); // back to center alone
  });

  it('Should remove the proxy and helper from the scene graph on dispose', () => {
    const { gizmo, sceneGraph } = buildGizmo([makeRecord(1, [0, 0, 0])]);
    const addedCount = sceneGraph.adds.length;
    gizmo.dispose();
    expect(sceneGraph.removeFromGroup).toHaveBeenCalled();
    // Every object added to gizmoGroup should be removed.
    expect(sceneGraph.removes.length).toBe(addedCount);
  });
});
