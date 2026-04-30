/**
 * SnapDetector — pure(ish) priority + threshold logic. We use real Three.js
 * (it's already a dev dep) but skip the WebGL renderer; cameras and
 * raycasters work standalone in happy-dom.
 *
 * The tests build a minimal ObjectRegistry with a single Object whose
 * `edgesLocal` describes a known cube, point a perspective camera at it,
 * and assert which snap kind the detector picks for various cursor
 * positions.
 */

import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { EventBus } from '../EventBus';
import { ObjectRegistry } from '../ObjectRegistry';
import { SnapDetector } from '../SnapDetector';
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

/** Cube edges (12 segments) in local space, side length 2 centred on origin. */
function unitCubeEdges(): Float32Array {
  const v = [
    [-1, -1, -1],
    [1, -1, -1],
    [1, 1, -1],
    [-1, 1, -1],
    [-1, -1, 1],
    [1, -1, 1],
    [1, 1, 1],
    [-1, 1, 1],
  ];
  const segs: Array<[number, number]> = [
    // bottom
    [0, 1],
    [1, 2],
    [2, 3],
    [3, 0],
    // top
    [4, 5],
    [5, 6],
    [6, 7],
    [7, 4],
    // verticals
    [0, 4],
    [1, 5],
    [2, 6],
    [3, 7],
  ];
  const out: number[] = [];
  for (const [a, b] of segs) {
    out.push(...v[a], ...v[b]);
  }
  return new Float32Array(out);
}

function makeRegistryWithCube(
  groupId: number,
  translate: [number, number, number] = [0, 0, 0],
): {
  registry: ObjectRegistry;
  record: ObjectRecord;
} {
  const bus = new EventBus<ViewerEvent>();
  const registry = new ObjectRegistry({
    bus,
    requestRender: vi.fn(),
    oneScale: new THREE.Vector3(1, 1, 1),
    scratchMatrix: new THREE.Matrix4(),
  });
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
    edgesLocal: unitCubeEdges(),
    boundsLocalCenter: new THREE.Vector3(0, 0, 0),
    boundsLocalRadius: Math.sqrt(3),
    boundsLocalMin: new THREE.Vector3(-1, -1, -1),
    boundsLocalMax: new THREE.Vector3(1, 1, 1),
    edgeLines: null,
  };
  registry.register(record);
  return { registry, record };
}

function makeCamera(): THREE.PerspectiveCamera {
  const camera = new THREE.PerspectiveCamera(50, SCREEN_W / SCREEN_H, 0.1, 100);
  camera.position.set(0, 0, 8);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld(true);
  return camera;
}

function makeDetector(
  registry: ObjectRegistry,
  camera: THREE.Camera,
  occluder: THREE.Object3D | null = null,
) {
  return new SnapDetector({
    THREE,
    registry,
    camera: () => camera,
    batchedMesh: () =>
      occluder as unknown as import('three').BatchedMesh | null,
    raycaster: () => new THREE.Raycaster(),
    screenRect: makeRect,
  });
}

/** Project a known world point to client coords using the same math the detector uses. */
function projectToClient(
  world: [number, number, number],
  camera: THREE.Camera,
): { x: number; y: number } {
  const v = new THREE.Vector3(...world).project(camera);
  return {
    x: (v.x * 0.5 + 0.5) * SCREEN_W,
    y: (-v.y * 0.5 + 0.5) * SCREEN_H,
  };
}

describe('SnapDetector — priority and thresholds', () => {
  it('Should return null when the cursor is far from any geometry', () => {
    const { registry } = makeRegistryWithCube(1);
    const camera = makeCamera();
    const detector = makeDetector(registry, camera);
    const result = detector.findSnapTarget(0, 0); // top-left corner
    expect(result).toBeNull();
  });

  it('Should snap to a vertex when the cursor is near a corner', () => {
    const { registry } = makeRegistryWithCube(1);
    const camera = makeCamera();
    const detector = makeDetector(registry, camera);
    const corner: [number, number, number] = [1, 1, 1]; // front-top-right
    const screen = projectToClient(corner, camera);
    const result = detector.findSnapTarget(screen.x, screen.y);
    expect(result).not.toBeNull();
    expect(result!.kind).toBe('vertex');
    expect(result!.groupId).toBe(1);
    expect(result!.worldPoint[0]).toBeCloseTo(1, 5);
    expect(result!.worldPoint[1]).toBeCloseTo(1, 5);
    expect(result!.worldPoint[2]).toBeCloseTo(1, 5);
  });

  it('Should snap to an edge midpoint over a midpoint with no nearby vertex', () => {
    const { registry } = makeRegistryWithCube(1);
    const camera = makeCamera();
    const detector = makeDetector(registry, camera);
    // Midpoint of the front-top edge: between (-1,1,1) and (1,1,1) → (0,1,1).
    const mid: [number, number, number] = [0, 1, 1];
    const screen = projectToClient(mid, camera);
    const result = detector.findSnapTarget(screen.x, screen.y);
    expect(result).not.toBeNull();
    expect(result!.kind).toBe('edgeMidpoint');
  });

  it('Should snap to the edge segment when between vertex and midpoint', () => {
    const { registry } = makeRegistryWithCube(1);
    const camera = makeCamera();
    const detector = makeDetector(registry, camera);
    // A point on the front-top edge at x=0.5 (offset from midpoint and vertex).
    const onEdge: [number, number, number] = [0.5, 1, 1];
    const screen = projectToClient(onEdge, camera);
    const result = detector.findSnapTarget(screen.x, screen.y);
    expect(result).not.toBeNull();
    expect(result!.kind).toBe('edge');
  });

  it('Should prefer vertex over edge midpoint when both are within threshold', () => {
    const { registry } = makeRegistryWithCube(1);
    const camera = makeCamera();
    const detector = makeDetector(registry, camera);
    // Very close to vertex (1,1,1); the front-top edge midpoint (0,1,1) is
    // also visible but pixel-far from the cursor — vertex still wins by
    // priority even when midpoint pixel-distance is technically smaller.
    const corner: [number, number, number] = [1, 1, 1];
    const screen = projectToClient(corner, camera);
    const result = detector.findSnapTarget(screen.x + 1, screen.y + 1);
    expect(result?.kind).toBe('vertex');
  });

  it('Should skip Objects whose visibility flag is off', () => {
    const { registry } = makeRegistryWithCube(7);
    const camera = makeCamera();
    const detector = new SnapDetector({
      THREE,
      registry,
      camera: () => camera,
      batchedMesh: () => null,
      raycaster: () => new THREE.Raycaster(),
      screenRect: makeRect,
      isObjectVisible: (id) => id !== 7,
    });
    const corner: [number, number, number] = [1, 1, 1];
    const screen = projectToClient(corner, camera);
    expect(detector.findSnapTarget(screen.x, screen.y)).toBeNull();
  });

  it('Should respect the registry offset when transforming candidates', () => {
    const { registry, record } = makeRegistryWithCube(1);
    // Slide the cube +5 along X via the offset path.
    registry.setOffset(record.groupId, { position: [5, 0, 0] });
    const camera = makeCamera();
    camera.position.set(5, 0, 8);
    camera.lookAt(5, 0, 0);
    camera.updateMatrixWorld(true);
    const detector = makeDetector(registry, camera);
    // The corner that was at (1,1,1) is now at (6,1,1).
    const corner: [number, number, number] = [6, 1, 1];
    const screen = projectToClient(corner, camera);
    const result = detector.findSnapTarget(screen.x, screen.y);
    expect(result?.kind).toBe('vertex');
    expect(result!.worldPoint[0]).toBeCloseTo(6, 5);
  });
});
