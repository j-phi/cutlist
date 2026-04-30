/**
 * MarqueeSelector — screen-space hit test + drag state machine.
 *
 * Like SnapDetector, we use real Three.js (cameras/matrices work in
 * happy-dom without a WebGL context) and a minimal ObjectRegistry of cubes
 * placed at known world positions. The camera looks down -Z so cube
 * placement maps cleanly onto screen pixels.
 */

import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { EventBus } from '../EventBus';
import { ObjectRegistry } from '../ObjectRegistry';
import { MarqueeSelector, composeMarqueeSelection } from '../MarqueeSelector';
import type { ObjectRecord, ViewerEvent } from '../../types';

const SCREEN_W = 800;
const SCREEN_H = 600;

function makeRect(): DOMRect {
  return {
    left: 0,
    top: 0,
    right: SCREEN_W,
    bottom: SCREEN_H,
    width: SCREEN_W,
    height: SCREEN_H,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  } as DOMRect;
}

function makeRegistry(): {
  registry: ObjectRegistry;
  bus: EventBus<ViewerEvent>;
} {
  const bus = new EventBus<ViewerEvent>();
  const registry = new ObjectRegistry({
    bus,
    requestRender: vi.fn(),
    oneScale: new THREE.Vector3(1, 1, 1),
    scratchMatrix: new THREE.Matrix4(),
  });
  return { registry, bus };
}

function registerCube(
  registry: ObjectRegistry,
  groupId: number,
  translate: [number, number, number],
  radius = 0.5,
): ObjectRecord {
  const originalMatrix = new THREE.Matrix4().makeTranslation(...translate);
  const originalMatrixInverse = originalMatrix.clone().invert();
  const record: ObjectRecord = {
    groupId,
    partNumber: groupId,
    name: `cube-${groupId}`,
    batchIds: [],
    originalMatrix,
    originalMatrixInverse,
    center: new THREE.Vector3(...translate),
    offset: {
      position: new THREE.Vector3(),
      quaternion: new THREE.Quaternion(),
    },
    offsetMatrix: new THREE.Matrix4(),
    offsetMatrixInverse: new THREE.Matrix4(),
    edgesLocal: new Float32Array(),
    boundsLocalCenter: new THREE.Vector3(0, 0, 0),
    boundsLocalRadius: radius,
    boundsLocalMin: new THREE.Vector3(-radius, -radius, -radius),
    boundsLocalMax: new THREE.Vector3(radius, radius, radius),
    edgeLines: null,
  };
  registry.register(record);
  return record;
}

function makeCamera(): THREE.PerspectiveCamera {
  const camera = new THREE.PerspectiveCamera(50, SCREEN_W / SCREEN_H, 0.1, 100);
  camera.position.set(0, 0, 8);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld(true);
  return camera;
}

function makeSelector(deps: {
  bus: EventBus<ViewerEvent>;
  registry: ObjectRegistry;
  camera: THREE.PerspectiveCamera;
  isObjectVisible?: (id: number) => boolean;
}): MarqueeSelector {
  return new MarqueeSelector({
    THREE,
    bus: deps.bus,
    registry: deps.registry,
    camera: () => deps.camera,
    screenRect: () => makeRect(),
    isObjectVisible: deps.isObjectVisible ?? (() => true),
  });
}

describe('composeMarqueeSelection', () => {
  it('Should replace the baseline with candidates when shift is not held', () => {
    const result = composeMarqueeSelection([1, 2, 3], [4, 5], false);
    expect([...result].sort()).toEqual([4, 5]);
  });

  it('Should XOR candidates against the baseline when shift is held', () => {
    // Baseline {1, 2, 3}, marquee {2, 3, 4} → 2 and 3 toggle off, 4 toggles on,
    // 1 stays. Result: {1, 4}.
    const result = composeMarqueeSelection([1, 2, 3], [2, 3, 4], true);
    expect([...result].sort()).toEqual([1, 4]);
  });

  it('Should produce an empty set when shift-XOR cancels everything', () => {
    const result = composeMarqueeSelection([1, 2], [1, 2], true);
    expect(result.size).toBe(0);
  });
});

describe('MarqueeSelector — drag state machine', () => {
  it('Should emit marquee-start with the supplied baseline and shift flag', () => {
    const { registry, bus } = makeRegistry();
    const selector = makeSelector({ bus, registry, camera: makeCamera() });
    const onStart = vi.fn();
    bus.on('marquee-start', onStart);

    selector.begin(100, 100, true, [42, 43]);

    expect(onStart).toHaveBeenCalledWith({
      type: 'marquee-start',
      shiftKey: true,
      baseline: [42, 43],
    });
  });

  it('Should emit marquee-update with rect and candidates on each move', () => {
    const { registry, bus } = makeRegistry();
    registerCube(registry, 1, [0, 0, 0]);
    const selector = makeSelector({ bus, registry, camera: makeCamera() });
    const onUpdate = vi.fn();
    bus.on('marquee-update', onUpdate);

    selector.begin(0, 0, false, []);
    selector.update(SCREEN_W, SCREEN_H);

    expect(onUpdate).toHaveBeenCalledTimes(1);
    const evt = onUpdate.mock.calls[0][0];
    expect(evt.type).toBe('marquee-update');
    expect(evt.rect.mode).toBe('window'); // L→R
    expect(evt.rect.w).toBe(SCREEN_W);
    expect(evt.rect.h).toBe(SCREEN_H);
    // Object at world origin should be inside a full-screen rect.
    expect(evt.candidates).toContain(1);
  });

  it('Should emit marquee-end with empty candidates when cancelled', () => {
    const { registry, bus } = makeRegistry();
    registerCube(registry, 1, [0, 0, 0]);
    const selector = makeSelector({ bus, registry, camera: makeCamera() });
    const onEnd = vi.fn();
    bus.on('marquee-end', onEnd);

    selector.begin(0, 0, false, [99]);
    selector.update(SCREEN_W, SCREEN_H);
    selector.end(false);

    expect(onEnd).toHaveBeenCalledWith({
      type: 'marquee-end',
      committed: false,
      candidates: [],
      shiftKey: false,
      baseline: [99],
    });
    expect(selector.isActive()).toBe(false);
  });

  it('Should clear active state on commit so a fresh begin can follow', () => {
    const { registry, bus } = makeRegistry();
    const selector = makeSelector({ bus, registry, camera: makeCamera() });

    selector.begin(0, 0, false, []);
    expect(selector.isActive()).toBe(true);
    selector.end(true);
    expect(selector.isActive()).toBe(false);

    selector.begin(10, 10, false, []);
    expect(selector.isActive()).toBe(true);
  });
});

describe('MarqueeSelector — direction-based selection', () => {
  it('Should report mode=window for left-to-right drags', () => {
    const { registry, bus } = makeRegistry();
    const selector = makeSelector({ bus, registry, camera: makeCamera() });
    selector.begin(100, 100, false, []);
    selector.update(300, 200);
    expect(selector.computeRect().mode).toBe('window');
  });

  it('Should report mode=crossing for right-to-left drags', () => {
    const { registry, bus } = makeRegistry();
    const selector = makeSelector({ bus, registry, camera: makeCamera() });
    selector.begin(300, 200, false, []);
    selector.update(100, 100);
    expect(selector.computeRect().mode).toBe('crossing');
  });

  it('Should flip mode reactively when the drag crosses the start-X line', () => {
    const { registry, bus } = makeRegistry();
    const selector = makeSelector({ bus, registry, camera: makeCamera() });
    selector.begin(200, 200, false, []);
    selector.update(300, 250);
    expect(selector.computeRect().mode).toBe('window');
    selector.update(100, 250);
    expect(selector.computeRect().mode).toBe('crossing');
  });

  it('Window mode should reject objects whose bounds extend outside the rect', () => {
    // Big cube at origin, radius 1 in world units. With camera at z=8 and
    // 50° fov, the object spans a substantial portion of the canvas. A
    // marquee that's too small to contain its full screen-AABB must miss.
    const { registry, bus } = makeRegistry();
    registerCube(registry, 1, [0, 0, 0], 1.0);
    const selector = makeSelector({ bus, registry, camera: makeCamera() });
    const onUpdate = vi.fn();
    bus.on('marquee-update', onUpdate);

    // Tiny window centred on screen.
    selector.begin(395, 295, false, []);
    selector.update(405, 305);
    const candidates = onUpdate.mock.calls[0][0].candidates;
    expect(candidates).not.toContain(1);
  });

  it('Crossing mode should select objects whose bounds merely overlap the rect', () => {
    // Same cube, but draw an R→L (crossing) rect that just touches the
    // object's screen footprint.
    const { registry, bus } = makeRegistry();
    registerCube(registry, 1, [0, 0, 0], 1.0);
    const selector = makeSelector({ bus, registry, camera: makeCamera() });
    const onUpdate = vi.fn();
    bus.on('marquee-update', onUpdate);

    selector.begin(405, 305, false, []);
    selector.update(395, 295);
    const candidates = onUpdate.mock.calls[0][0].candidates;
    expect(candidates).toContain(1);
  });

  it('Should skip objects flagged as not visible', () => {
    const { registry, bus } = makeRegistry();
    registerCube(registry, 1, [0, 0, 0]);
    registerCube(registry, 2, [0, 0, 0]);
    const selector = makeSelector({
      bus,
      registry,
      camera: makeCamera(),
      isObjectVisible: (id) => id !== 2,
    });
    const onUpdate = vi.fn();
    bus.on('marquee-update', onUpdate);

    selector.begin(0, 0, false, []);
    selector.update(SCREEN_W, SCREEN_H);

    const candidates = onUpdate.mock.calls[0][0].candidates;
    expect(candidates).toContain(1);
    expect(candidates).not.toContain(2);
  });

  it('Should respect the local AABB rather than the bounding sphere', () => {
    // Elongated leg: 0.05 × 0.05 × 1.6 in local Y. The bounding sphere has
    // radius ~0.8 (half the long-axis diagonal) — way bigger than the
    // visible silhouette. A marquee drawn well clear of the leg's screen
    // footprint must NOT pick it up.
    const { registry, bus } = makeRegistry();
    const originalMatrix = new THREE.Matrix4();
    const record: ObjectRecord = {
      groupId: 1,
      partNumber: 1,
      name: 'leg',
      batchIds: [],
      originalMatrix,
      originalMatrixInverse: originalMatrix.clone().invert(),
      center: new THREE.Vector3(),
      offset: {
        position: new THREE.Vector3(),
        quaternion: new THREE.Quaternion(),
      },
      offsetMatrix: new THREE.Matrix4(),
      offsetMatrixInverse: new THREE.Matrix4(),
      edgesLocal: new Float32Array(),
      boundsLocalCenter: new THREE.Vector3(0, 0, 0),
      boundsLocalRadius: Math.hypot(0.025, 0.8, 0.025),
      boundsLocalMin: new THREE.Vector3(-0.025, -0.8, -0.025),
      boundsLocalMax: new THREE.Vector3(0.025, 0.8, 0.025),
      edgeLines: null,
    };
    registry.register(record);
    const selector = makeSelector({ bus, registry, camera: makeCamera() });
    const onUpdate = vi.fn();
    bus.on('marquee-update', onUpdate);

    // Crossing rect well to the right of the leg's narrow X footprint.
    // With the old sphere-based test the leg's apparent screen-AABB would
    // extend wide enough to overlap; with the AABB it stays narrow.
    selector.begin(700, 100, false, []);
    selector.update(600, 200);
    const candidates = onUpdate.mock.calls[0][0].candidates;
    expect(candidates).not.toContain(1);
  });

  it('Should skip objects placed behind the camera', () => {
    const { registry, bus } = makeRegistry();
    // Camera is at z=8 looking toward -Z. Place this cube at z=20 — that's
    // *behind* the camera in three.js view-space.
    registerCube(registry, 1, [0, 0, 20]);
    const selector = makeSelector({ bus, registry, camera: makeCamera() });
    const onUpdate = vi.fn();
    bus.on('marquee-update', onUpdate);

    selector.begin(0, 0, false, []);
    selector.update(SCREEN_W, SCREEN_H);

    const candidates = onUpdate.mock.calls[0][0].candidates;
    expect(candidates).not.toContain(1);
  });

  it('Should track an Object that has been moved via offsetMatrix', () => {
    // A cube originally at the origin ought to appear under the marquee
    // only at the world position that `offsetMatrix · originalMatrix`
    // resolves to. Translate the offsetMatrix far off-screen and verify
    // the marquee no longer picks it up.
    const { registry, bus } = makeRegistry();
    const record = registerCube(registry, 1, [0, 0, 0]);
    record.offsetMatrix.makeTranslation(50, 0, 0);

    const selector = makeSelector({ bus, registry, camera: makeCamera() });
    const onUpdate = vi.fn();
    bus.on('marquee-update', onUpdate);

    // Marquee covers screen-centre area where the cube originally rendered.
    selector.begin(350, 250, false, []);
    selector.update(450, 350);
    expect(onUpdate.mock.calls[0][0].candidates).not.toContain(1);
  });

  it('Should produce no candidates when the registry is empty', () => {
    const { registry, bus } = makeRegistry();
    const selector = makeSelector({ bus, registry, camera: makeCamera() });
    const onUpdate = vi.fn();
    bus.on('marquee-update', onUpdate);

    selector.begin(0, 0, false, []);
    selector.update(SCREEN_W, SCREEN_H);

    expect(onUpdate.mock.calls[0][0].candidates).toEqual([]);
  });

  it("Crossing mode should reject objects whose screen-AABB overlaps but whose silhouette doesn't", () => {
    // A long beam rotated 30° in the screen plane (around camera-Z).
    // Local AABB: 6 units long in X, narrow in Y/Z. The screen-aligned
    // bounding rect after rotation is the diagonal of the rotated box —
    // much wider than the silhouette. A marquee placed in the corner of
    // the screen-AABB but well off the silhouette must NOT match.
    const { registry, bus } = makeRegistry();
    const originalMatrix = new THREE.Matrix4().makeRotationZ(Math.PI / 6);
    const record: ObjectRecord = {
      groupId: 1,
      partNumber: 1,
      name: 'beam',
      batchIds: [],
      originalMatrix,
      originalMatrixInverse: originalMatrix.clone().invert(),
      center: new THREE.Vector3(),
      offset: {
        position: new THREE.Vector3(),
        quaternion: new THREE.Quaternion(),
      },
      offsetMatrix: new THREE.Matrix4(),
      offsetMatrixInverse: new THREE.Matrix4(),
      edgesLocal: new Float32Array(),
      boundsLocalCenter: new THREE.Vector3(0, 0, 0),
      boundsLocalRadius: Math.hypot(3, 0.1, 0.1),
      boundsLocalMin: new THREE.Vector3(-3, -0.1, -0.1),
      boundsLocalMax: new THREE.Vector3(3, 0.1, 0.1),
      edgeLines: null,
    };
    registry.register(record);
    const selector = makeSelector({ bus, registry, camera: makeCamera() });
    const onUpdate = vi.fn();
    bus.on('marquee-update', onUpdate);

    // Marquee in the upper-left corner of the screen-AABB (where the
    // rotated silhouette doesn't reach but the AABB does).
    selector.begin(220, 180, false, []);
    selector.update(170, 230);
    expect(onUpdate.mock.calls[0][0].candidates).not.toContain(1);
  });

  it('Crossing mode should still match when the marquee straddles the rotated silhouette', () => {
    // Same beam — marquee through the centre of the rotated silhouette
    // must match. Locks in the orientation-aware path against being too
    // strict.
    const { registry, bus } = makeRegistry();
    const originalMatrix = new THREE.Matrix4().makeRotationZ(Math.PI / 6);
    const record: ObjectRecord = {
      groupId: 1,
      partNumber: 1,
      name: 'beam',
      batchIds: [],
      originalMatrix,
      originalMatrixInverse: originalMatrix.clone().invert(),
      center: new THREE.Vector3(),
      offset: {
        position: new THREE.Vector3(),
        quaternion: new THREE.Quaternion(),
      },
      offsetMatrix: new THREE.Matrix4(),
      offsetMatrixInverse: new THREE.Matrix4(),
      edgesLocal: new Float32Array(),
      boundsLocalCenter: new THREE.Vector3(0, 0, 0),
      boundsLocalRadius: Math.hypot(3, 0.1, 0.1),
      boundsLocalMin: new THREE.Vector3(-3, -0.1, -0.1),
      boundsLocalMax: new THREE.Vector3(3, 0.1, 0.1),
      edgeLines: null,
    };
    registry.register(record);
    const selector = makeSelector({ bus, registry, camera: makeCamera() });
    const onUpdate = vi.fn();
    bus.on('marquee-update', onUpdate);

    selector.begin(420, 320, false, []); // R→L crossing through screen centre
    selector.update(380, 280);
    expect(onUpdate.mock.calls[0][0].candidates).toContain(1);
  });

  it('Should produce no candidates when the canvas has zero area', () => {
    const { registry, bus } = makeRegistry();
    registerCube(registry, 1, [0, 0, 0]);
    const selector = new MarqueeSelector({
      THREE,
      bus,
      registry,
      camera: () => makeCamera(),
      screenRect: () => ({ left: 0, top: 0, width: 0, height: 0 }) as DOMRect,
      isObjectVisible: () => true,
    });
    const onUpdate = vi.fn();
    bus.on('marquee-update', onUpdate);

    selector.begin(0, 0, false, []);
    selector.update(0, 0);

    expect(onUpdate.mock.calls[0][0].candidates).toEqual([]);
  });
});
