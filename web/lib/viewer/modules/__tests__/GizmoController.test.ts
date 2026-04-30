/**
 * Outcome-based tests. Pattern: real THREE math + real ObjectRegistry/EventBus,
 * stub only what needs DOM/WebGL (TransformControls, SceneGraph). Drag math
 * is verified against resulting registry offsets, not "did we call setOffset".
 * vi.fn() is used only where there's no other observable (controls.dispose).
 */

import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { EventBus } from '../EventBus';
import { GizmoController } from '../GizmoController';
import { ObjectRegistry } from '../ObjectRegistry';
import type { SceneGraph } from '../SceneGraph';
import type { ObjectRecord, ViewerEvent } from '../../types';

type Object3D = import('three').Object3D;
type Camera = import('three').Camera;

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
    boundsLocalMin: new THREE.Vector3(),
    boundsLocalMax: new THREE.Vector3(),
    edgeLines: null,
  };
}

/** Stand-in for TransformControls (real one needs DOM + WebGL renderer). */
interface FakeControls {
  attach(obj: Object3D): void;
  detach(): void;
  setMode(mode: 'translate' | 'rotate'): void;
  addEventListener(type: string, cb: (e: { value?: boolean }) => void): void;
  removeEventListener(type: string, cb: (e: { value?: boolean }) => void): void;
  dispose: ReturnType<typeof vi.fn>;
  dispatch(type: string, payload?: { value?: boolean }): void;
  attached: Object3D | null;
  mode: 'translate' | 'rotate';
  camera: Camera;
  enabled: boolean;
  size: number;
}

type FakeCtorType = new (camera: Camera, dom: HTMLElement) => FakeControls;

function makeFakeControlsCtor(): {
  ctor: FakeCtorType;
  instances: FakeControls[];
} {
  const instances: FakeControls[] = [];
  function FakeCtor(this: FakeControls, camera: Camera) {
    const handlers = new Map<string, Set<(e: { value?: boolean }) => void>>();
    Object.assign(this, {
      attached: null,
      mode: 'translate',
      camera,
      enabled: true,
      size: 1, // real TransformControls default
      attach: (obj: Object3D) => void (this.attached = obj),
      detach: () => void (this.attached = null),
      setMode: (m: 'translate' | 'rotate') => void (this.mode = m),
      addEventListener: (t: string, cb: (e: { value?: boolean }) => void) => {
        (handlers.get(t) ?? handlers.set(t, new Set()).get(t)!).add(cb);
      },
      removeEventListener: (t: string, cb: (e: { value?: boolean }) => void) =>
        void handlers.get(t)?.delete(cb),
      dispatch: (t: string, payload?: { value?: boolean }) =>
        handlers.get(t)?.forEach((cb) => cb(payload ?? {})),
      // vi.fn — dispose() has no other observable signal.
      dispose: vi.fn(),
    } satisfies FakeControls);
    instances.push(this);
  }
  return { ctor: FakeCtor as unknown as FakeCtorType, instances };
}

/** Real THREE.Group standing in for SceneGraph (PMREMGenerator needs WebGL). */
function makeFakeSceneGraph() {
  const gizmoGroup = new THREE.Group();
  gizmoGroup.name = 'gizmoGroup';
  return {
    gizmoGroup,
    addToGroup(_name: string, obj: Object3D) {
      gizmoGroup.add(obj);
    },
    removeFromGroup(_name: string, obj: Object3D) {
      gizmoGroup.remove(obj);
    },
  };
}

function buildGizmo(records: ObjectRecord[]) {
  const bus = new EventBus<ViewerEvent>();
  const reg = new ObjectRegistry({
    bus,
    requestRender: () => {},
    oneScale: new THREE.Vector3(1, 1, 1),
    scratchMatrix: new THREE.Matrix4(),
  });
  for (const r of records) reg.register(r);

  const { ctor, instances } = makeFakeControlsCtor();
  const sceneGraph = makeFakeSceneGraph();
  const cameraControls = { enabled: true };
  const camera = new THREE.PerspectiveCamera();
  const dom = {} as HTMLElement;

  // Lock refcount — plain functions; tests check count, not call metadata.
  let lockCount = 0;
  const acquireInteractionLock = () => {
    lockCount++;
    let released = false;
    return () => {
      if (released) return;
      released = true;
      lockCount--;
    };
  };

  // ctor is wider on `dispose` (Mock) than TransformControlsLike's `() => void`.
  type CtorParam = ConstructorParameters<
    typeof GizmoController
  >[0]['TransformControlsCtor'];
  const gizmo = new GizmoController({
    THREE,
    TransformControlsCtor: ctor as unknown as CtorParam,
    camera,
    domElement: dom,
    registry: reg,
    sceneGraph: sceneGraph as unknown as SceneGraph,
    cameraControls,
    acquireInteractionLock,
    requestRender: () => {},
  });

  return {
    gizmo,
    reg,
    controls: instances[0],
    gizmoGroup: sceneGraph.gizmoGroup,
    cameraControls,
    getLockCount: () => lockCount,
  };
}

describe('GizmoController', () => {
  it('attaches the proxy on first selection and detaches on empty selection', () => {
    const { gizmo, controls } = buildGizmo([makeRecord(1, [0, 0, 0])]);

    gizmo.setSelection([1]);
    expect(controls.attached).not.toBeNull();
    expect(controls.attached!.name).toBe('GizmoProxy');

    gizmo.setSelection([]);
    expect(controls.attached).toBeNull();
  });

  it('re-attaches on a new selection after empty', () => {
    const { gizmo, controls } = buildGizmo([makeRecord(1, [0, 0, 0])]);

    gizmo.setSelection([1]);
    const proxy = controls.attached;
    gizmo.setSelection([]);
    expect(controls.attached).toBeNull();
    gizmo.setSelection([1]);
    // Same proxy instance is re-attached.
    expect(controls.attached).toBe(proxy);
  });

  it('places the proxy at the centroid of selected record centers', () => {
    const { gizmo, controls } = buildGizmo([
      makeRecord(1, [2, 0, 0]),
      makeRecord(2, [4, 0, 6]),
    ]);

    gizmo.setSelection([1, 2]);
    const proxy = controls.attached!;
    expect(proxy.position.x).toBeCloseTo(3);
    expect(proxy.position.y).toBeCloseTo(0);
    expect(proxy.position.z).toBeCloseTo(3);
  });

  it('tracks the centroid of a rotated object via offsetMatrix · center', () => {
    // r.center=(2,0,0) with a pre-applied 90°Y rotation → world center (0,0,-2).
    // Re-selecting must anchor the gizmo there, not at center + offset.position.
    const { gizmo, reg, controls } = buildGizmo([makeRecord(1, [2, 0, 0])]);
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

  it('writes translated offsets through the registry on drag', () => {
    const { gizmo, reg, controls } = buildGizmo([makeRecord(1, [0, 0, 0])]);

    gizmo.setSelection([1]);
    const proxy = controls.attached!;
    controls.dispatch('dragging-changed', { value: true });
    proxy.position.set(5, 0, 0);
    controls.dispatch('objectChange');

    const offset = reg.get(1)!.offset;
    expect(offset.position.toArray()).toEqual([5, 0, 0]);
    expect(offset.quaternion.toArray()).toEqual([0, 0, 0, 1]);
  });

  it('translates every selected record together on a multi-select drag', () => {
    const { gizmo, reg, controls } = buildGizmo([
      makeRecord(1, [1, 0, 0]),
      makeRecord(2, [-1, 0, 0]),
    ]);

    gizmo.setSelection([1, 2]);
    const proxy = controls.attached!;
    controls.dispatch('dragging-changed', { value: true });
    proxy.position.set(proxy.position.x, 4, 0);
    controls.dispatch('objectChange');

    expect(reg.get(1)!.offset.position.toArray()).toEqual([0, 4, 0]);
    expect(reg.get(2)!.offset.position.toArray()).toEqual([0, 4, 0]);
  });

  it('rotates selected offsets around the centroid on rotate drag', () => {
    // Centers at x=±1; pre-seeded offsets at x=±1 → load-time centroid still
    // at origin, but startPos is non-trivial so a 90°Y proxy rotation moves
    // each offset's position in addition to its quaternion.
    const { gizmo, reg, controls } = buildGizmo([
      makeRecord(1, [1, 0, 0]),
      makeRecord(2, [-1, 0, 0]),
    ]);
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

    // start.pos (1,0,0) rotated 90° around Y about origin → (0,0,-1).
    const o1 = reg.get(1)!.offset;
    expect(o1.position.x).toBeCloseTo(0);
    expect(o1.position.y).toBeCloseTo(0);
    expect(o1.position.z).toBeCloseTo(-1);
    expect(o1.quaternion.y).toBeCloseTo(yQuat.y);
    expect(o1.quaternion.w).toBeCloseTo(yQuat.w);

    // start.pos (-1,0,0) rotated 90° around Y about origin → (0,0,1).
    const o2 = reg.get(2)!.offset;
    expect(o2.position.x).toBeCloseTo(0);
    expect(o2.position.z).toBeCloseTo(1);
  });

  it('computes deltas from a fresh start state on each drag', () => {
    const { gizmo, reg, controls } = buildGizmo([makeRecord(1, [0, 0, 0])]);
    gizmo.setSelection([1]);
    const proxy = controls.attached!;

    // First drag: translate to (3,0,0).
    controls.dispatch('dragging-changed', { value: true });
    proxy.position.set(3, 0, 0);
    controls.dispatch('objectChange');
    controls.dispatch('dragging-changed', { value: false });
    expect(reg.get(1)!.offset.position.toArray()).toEqual([3, 0, 0]);

    // Second drag (no selection change): proxy now starts at (3,0,0). Move
    // to (5,0,0) — Δp = (2,0,0). offset = (3 + 2, 0, 0) = (5,0,0), not
    // (3 + 5, 0, 0) which would be the bug if start state weren't refreshed.
    controls.dispatch('dragging-changed', { value: true });
    proxy.position.set(5, 0, 0);
    controls.dispatch('objectChange');
    controls.dispatch('dragging-changed', { value: false });
    expect(reg.get(1)!.offset.position.toArray()).toEqual([5, 0, 0]);
  });

  it('ignores objectChange events fired outside of a drag', () => {
    const { gizmo, reg, controls } = buildGizmo([makeRecord(1, [0, 0, 0])]);
    gizmo.setSelection([1]);
    const proxy = controls.attached!;

    // No 'dragging-changed' true dispatched → not in a drag.
    proxy.position.set(99, 99, 99);
    controls.dispatch('objectChange');

    expect(reg.get(1)!.offset.position.toArray()).toEqual([0, 0, 0]);
  });

  it('plumbs mode changes through to TransformControls', () => {
    const { gizmo, controls } = buildGizmo([makeRecord(1, [0, 0, 0])]);

    gizmo.setMode('rotate');
    expect(controls.mode).toBe('rotate');
    expect(gizmo.getMode()).toBe('rotate');

    gizmo.setMode('translate');
    expect(controls.mode).toBe('translate');
    expect(gizmo.getMode()).toBe('translate');
  });

  it('disables camera controls during drag and re-enables on release', () => {
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

  it('acquires and releases the interaction lock around a drag', () => {
    const { gizmo, controls, getLockCount } = buildGizmo([
      makeRecord(1, [0, 0, 0]),
    ]);
    gizmo.setSelection([1]);
    expect(getLockCount()).toBe(0);

    controls.dispatch('dragging-changed', { value: true });
    expect(getLockCount()).toBe(1);

    controls.dispatch('dragging-changed', { value: false });
    expect(getLockCount()).toBe(0);
  });

  it('releases the interaction lock if disposed mid-drag', () => {
    const { gizmo, controls, getLockCount } = buildGizmo([
      makeRecord(1, [0, 0, 0]),
    ]);
    gizmo.setSelection([1]);
    controls.dispatch('dragging-changed', { value: true });
    expect(getLockCount()).toBe(1);

    gizmo.dispose();
    expect(getLockCount()).toBe(0);
  });

  it('configures TransformControls with a smaller-than-default gizmo size', () => {
    const { controls } = buildGizmo([makeRecord(1, [0, 0, 0])]);
    expect(controls.size).toBeLessThan(1);
  });

  it('swaps controls.camera when setCamera is called', () => {
    const { gizmo, controls } = buildGizmo([makeRecord(1, [0, 0, 0])]);
    const ortho = new THREE.OrthographicCamera();

    gizmo.setCamera(ortho);
    expect(controls.camera).toBe(ortho);
  });

  it('resets offsets and re-syncs the proxy to the current centroid', () => {
    const { gizmo, reg, controls } = buildGizmo([
      makeRecord(1, [2, 0, 0]),
      makeRecord(2, [0, 0, 0]),
    ]);
    reg.setOffset(1, { position: [10, 0, 0] });
    reg.setOffset(2, { position: [0, 4, 0] });

    gizmo.setSelection([1]);
    const proxy = controls.attached!;
    expect(proxy.position.x).toBeCloseTo(12); // center + offset

    gizmo.resetSelectedOffsets([1, 2]);
    expect(reg.get(1)!.offset.position.toArray()).toEqual([0, 0, 0]);
    expect(reg.get(2)!.offset.position.toArray()).toEqual([0, 0, 0]);
    expect(proxy.position.x).toBeCloseTo(2); // back to center alone
  });

  it('resets every registered Object on resetAllOffsets', () => {
    const { gizmo, reg } = buildGizmo([
      makeRecord(1, [0, 0, 0]),
      makeRecord(2, [0, 0, 0]),
    ]);
    reg.setOffset(1, { position: [1, 2, 3] });
    reg.setOffset(2, { position: [4, 5, 6] });

    gizmo.resetAllOffsets();

    expect(reg.get(1)!.offset.position.toArray()).toEqual([0, 0, 0]);
    expect(reg.get(2)!.offset.position.toArray()).toEqual([0, 0, 0]);
  });

  it('removes proxy and helper from the scene graph on dispose', () => {
    const { gizmo, gizmoGroup, controls } = buildGizmo([
      makeRecord(1, [0, 0, 0]),
    ]);
    const childrenBefore = gizmoGroup.children.length;
    expect(childrenBefore).toBeGreaterThan(0); // proxy was added

    gizmo.dispose();

    expect(gizmoGroup.children.length).toBe(0);
    expect(controls.dispose).toHaveBeenCalledTimes(1);
  });
});
