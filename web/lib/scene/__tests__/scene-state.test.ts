import { describe, expect, it } from 'vitest';
import {
  applySceneState,
  captureSceneState,
  interpolateSceneState,
  type SceneState,
} from '../index';
import { IDENTITY_OBJECT_OFFSET } from '~/composables/useIdb';
import type { ObjectOffset } from '~/composables/useIdb';

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

describe('applySceneState', () => {
  it('Should expand visibility into per-group opacity', () => {
    const state: SceneState = {
      cameraMode: 'perspective',
      cameraPose: identityPose,
      objectOffsets: new Map(),
      visibleObjects: new Set([2]),
      floorVisible: true,
    };
    const applied = applySceneState(state, [1, 2, 3]);
    expect(applied.groupOpacity.get(1)).toBe(0);
    expect(applied.groupOpacity.get(2)).toBe(1);
    expect(applied.groupOpacity.get(3)).toBe(0);
  });

  it('Should treat null visibleObjects as all visible', () => {
    const state: SceneState = {
      cameraMode: 'perspective',
      cameraPose: identityPose,
      objectOffsets: new Map(),
      visibleObjects: null,
      floorVisible: true,
    };
    const applied = applySceneState(state, [1, 2]);
    expect(applied.groupOpacity.get(1)).toBe(1);
    expect(applied.groupOpacity.get(2)).toBe(1);
  });

  it('Should fill missing offsets with identity', () => {
    const state: SceneState = {
      cameraMode: 'perspective',
      cameraPose: identityPose,
      objectOffsets: new Map([
        [1, { position: [5, 0, 0], quaternion: [0, 0, 0, 1] }],
      ]),
      visibleObjects: null,
      floorVisible: true,
    };
    const applied = applySceneState(state, [1, 2]);
    expect(applied.objectOffsets.get(1)?.position).toEqual([5, 0, 0]);
    expect(applied.objectOffsets.get(2)).toEqual(IDENTITY_OBJECT_OFFSET);
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

  it('Should hard-cut cameraMode at midpoint', () => {
    const a: SceneState = {
      cameraMode: 'perspective',
      cameraPose: identityPose,
      objectOffsets: new Map(),
      visibleObjects: null,
      floorVisible: true,
    };
    const b: SceneState = { ...a, cameraMode: 'orthographic' };
    expect(interpolateSceneState(a, b, 0.49, []).cameraMode).toBe(
      'perspective',
    );
    expect(interpolateSceneState(a, b, 0.5, []).cameraMode).toBe(
      'orthographic',
    );
    expect(interpolateSceneState(a, b, 1, []).cameraMode).toBe('orthographic');
  });

  it('Should cross-fade visibility per groupId', () => {
    const a: SceneState = {
      cameraMode: 'perspective',
      cameraPose: identityPose,
      objectOffsets: new Map(),
      visibleObjects: new Set([1]),
      floorVisible: true,
    };
    const b: SceneState = { ...a, visibleObjects: new Set([2]) };
    const mid = interpolateSceneState(a, b, 0.25, [1, 2, 3]);
    expect(mid.groupOpacity.get(1)).toBeCloseTo(0.75);
    expect(mid.groupOpacity.get(2)).toBeCloseTo(0.25);
    expect(mid.groupOpacity.get(3)).toBe(0);
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

describe('round-trip', () => {
  it('Should round-trip capture → apply at t=1', () => {
    const offsets = new Map<number, ObjectOffset>([
      [
        1,
        {
          position: [1, 2, 3],
          quaternion: quat(0.1, 0.2, 0.3, 0.9),
        },
      ],
    ]);
    const state = captureSceneState({
      cameraMode: 'orthographic',
      cameraPose: { position: [10, 5, 0], target: [0, 0, 0] },
      objectOffsets: offsets,
      visibleObjects: new Set([1]),
      floorVisible: false,
    });
    const applied = applySceneState(state, [1, 2]);
    expect(applied.cameraMode).toBe('orthographic');
    expect(applied.floorVisible).toBe(false);
    expect(applied.groupOpacity.get(1)).toBe(1);
    expect(applied.groupOpacity.get(2)).toBe(0);
    const off = applied.objectOffsets.get(1)!;
    expect(off.position).toEqual([1, 2, 3]);
  });
});
