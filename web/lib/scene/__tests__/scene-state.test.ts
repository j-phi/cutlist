import { describe, expect, it } from 'vitest';
import {
  captureSceneState,
  interpolateSceneState,
  sceneStateFromIdb,
  sceneStateToIdb,
  type SceneState,
} from '../index';
import { IDENTITY_OBJECT_OFFSET } from '~/composables/useIdb';
import type { IdbScene, ObjectOffset } from '~/composables/useIdb';

const identityPose = {
  position: [0, 0, 0] as [number, number, number],
  target: [0, 0, 0] as [number, number, number],
};

function quat(x: number, y: number, z: number, w: number) {
  const len = Math.hypot(x, y, z, w) || 1;
  return [x / len, y / len, z / len, w / len] as [
    number,
    number,
    number,
    number,
  ];
}

describe('captureSceneState', () => {
  it('Should drop identity offsets but keep moved Objects', () => {
    const offsets = new Map<number, ObjectOffset>([
      [1, IDENTITY_OBJECT_OFFSET],
      [
        2,
        {
          position: [3, 0, 0],
          quaternion: [0, 0, 0, 1],
        },
      ],
    ]);
    const state = captureSceneState({
      cameraMode: 'perspective',
      cameraPose: identityPose,
      objectOffsets: offsets,
      visibleObjects: null,
      floorVisible: true,
    });
    expect([...state.objectOffsets.keys()]).toEqual([2]);
    expect(state.visibleObjects).toBeNull();
  });

  it('Should clone the visibleObjects set', () => {
    const visible = new Set([1, 2, 3]);
    const state = captureSceneState({
      cameraMode: 'perspective',
      cameraPose: identityPose,
      objectOffsets: new Map(),
      visibleObjects: visible,
      floorVisible: false,
    });
    visible.add(99);
    expect([...(state.visibleObjects as Set<number>)].sort()).toEqual([
      1, 2, 3,
    ]);
    expect(state.floorVisible).toBe(false);
  });
});

describe('interpolateSceneState', () => {
  it('Should lerp camera position linearly', () => {
    const a: SceneState = {
      cameraMode: 'perspective',
      cameraPose: { position: [0, 0, 0], target: [0, 0, 0] },
      objectOffsets: new Map(),
      visibleObjects: null,
      floorVisible: true,
    };
    const b: SceneState = {
      cameraMode: 'perspective',
      cameraPose: { position: [10, 0, 0], target: [10, 0, 0] },
      objectOffsets: new Map(),
      visibleObjects: null,
      floorVisible: true,
    };
    const mid = interpolateSceneState(a, b, 0.5, []);
    expect(mid.cameraPose.position[0]).toBeCloseTo(5);
    expect(mid.cameraPose.target[0]).toBeCloseTo(5);
  });

  it('Should slerp quaternions and lerp positions per Object', () => {
    const a: SceneState = {
      cameraMode: 'perspective',
      cameraPose: identityPose,
      objectOffsets: new Map([
        [
          1,
          {
            position: [0, 0, 0],
            quaternion: [0, 0, 0, 1],
          },
        ],
      ]),
      visibleObjects: null,
      floorVisible: true,
    };
    // 90° rotation around Z axis: cos(45°)=0.7071, sin(45°)=0.7071
    const q90 = quat(0, 0, Math.sin(Math.PI / 4), Math.cos(Math.PI / 4));
    const b: SceneState = {
      ...a,
      objectOffsets: new Map([[1, { position: [10, 0, 0], quaternion: q90 }]]),
    };
    const mid = interpolateSceneState(a, b, 0.5, [1]);
    const off = mid.objectOffsets.get(1)!;
    expect(off.position[0]).toBeCloseTo(5);
    // Halfway slerp from identity to q90 should be ~45° rotation: sin(22.5°)≈0.3827.
    expect(off.quaternion[2]).toBeCloseTo(Math.sin(Math.PI / 8), 4);
    expect(off.quaternion[3]).toBeCloseTo(Math.cos(Math.PI / 8), 4);
  });

  it('Should treat missing offset keys as identity', () => {
    const a: SceneState = {
      cameraMode: 'perspective',
      cameraPose: identityPose,
      objectOffsets: new Map(),
      visibleObjects: null,
      floorVisible: true,
    };
    const b: SceneState = {
      ...a,
      objectOffsets: new Map([
        [7, { position: [4, 0, 0], quaternion: [0, 0, 0, 1] }],
      ]),
    };
    const mid = interpolateSceneState(a, b, 0.5, [7]);
    expect(mid.objectOffsets.get(7)?.position[0]).toBeCloseTo(2);
  });
});

describe('camera zoom and up', () => {
  it('Should default zoom to 1 and up to [0,1,0] when source pose omits them', () => {
    const state = captureSceneState({
      cameraMode: 'perspective',
      cameraPose: { position: [1, 2, 3], target: [0, 0, 0] },
      objectOffsets: new Map(),
      visibleObjects: null,
      floorVisible: true,
    });
    expect(state.cameraPose.zoom).toBe(1);
    expect(state.cameraPose.up).toEqual([0, 1, 0]);
  });

  it('Should preserve zoom and up through capture', () => {
    const state = captureSceneState({
      cameraMode: 'orthographic',
      cameraPose: {
        position: [10, 0, 0],
        target: [0, 0, 0],
        zoom: 2.5,
        up: [0, 0, -1],
      },
      objectOffsets: new Map(),
      visibleObjects: null,
      floorVisible: true,
    });
    expect(state.cameraPose.zoom).toBe(2.5);
    expect(state.cameraPose.up).toEqual([0, 0, -1]);
  });

  it('Should round-trip zoom and up through sceneStateToIdb / sceneStateFromIdb', () => {
    const original = captureSceneState({
      cameraMode: 'orthographic',
      cameraPose: {
        position: [5, 5, 5],
        target: [0, 0, 0],
        zoom: 3,
        up: [1, 0, 0],
      },
      objectOffsets: new Map(),
      visibleObjects: null,
      floorVisible: true,
    });
    const persisted: IdbScene = {
      id: 's',
      modelId: 'm',
      name: 'n',
      order: 0,
      createdAt: '',
      updatedAt: '',
      ...sceneStateToIdb(original),
    };
    expect(persisted.cameraPose.zoom).toBe(3);
    expect(persisted.cameraPose.up).toEqual([1, 0, 0]);
    const restored = sceneStateFromIdb(persisted);
    expect(restored.cameraPose.zoom).toBe(3);
    expect(restored.cameraPose.up).toEqual([1, 0, 0]);
  });

  it('Should lerp zoom linearly through interpolateSceneState', () => {
    const a: SceneState = {
      cameraMode: 'perspective',
      cameraPose: { position: [0, 0, 0], target: [0, 0, 0], zoom: 1 },
      objectOffsets: new Map(),
      visibleObjects: null,
      floorVisible: true,
    };
    const b: SceneState = {
      ...a,
      cameraPose: { position: [0, 0, 0], target: [0, 0, 0], zoom: 3 },
    };
    const mid = interpolateSceneState(a, b, 0.5, []);
    expect(mid.cameraPose.zoom).toBeCloseTo(2);
  });
});

describe('round-trip', () => {
  it('Should round-trip capture → sceneStateToIdb → sceneStateFromIdb', () => {
    const original = captureSceneState({
      cameraMode: 'perspective',
      cameraPose: { position: [4, 5, 6], target: [1, 0, 0] },
      objectOffsets: new Map<number, ObjectOffset>([
        [7, { position: [2, 0, 0], quaternion: quat(0, 0, 0.5, 1) }],
        [8, IDENTITY_OBJECT_OFFSET],
      ]),
      visibleObjects: new Set([7, 8]),
      floorVisible: true,
    });

    const persisted: IdbScene = {
      id: 's',
      modelId: 'm',
      name: 'n',
      order: 0,
      createdAt: '',
      updatedAt: '',
      ...sceneStateToIdb(original),
    };
    // Identity offset for groupId 8 should be dropped on the way down.
    expect(Object.keys(persisted.objectOffsets).map(Number)).toEqual([7]);

    const restored = sceneStateFromIdb(persisted);
    // groupId 7 survives.
    const off = restored.objectOffsets.get(7)!;
    expect(off.position).toEqual([2, 0, 0]);
    // groupId 8 was identity-dropped on persist; restored map omits it.
    expect(restored.objectOffsets.has(8)).toBe(false);
    // visibility round-trips intact.
    expect([...(restored.visibleObjects as Set<number>)].sort()).toEqual([
      7, 8,
    ]);
  });
});
