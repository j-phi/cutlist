// @vitest-environment nuxt
/**
 * Tests for useSceneAuthor's visibility, dirty-flag, capture, and jump
 * behaviour. Focus is on state-machine invariants (dirty/active scene/tween
 * lifecycle) and capture/jump correctness — viewer-method forwarding is
 * exercised through observable side-effects (dirty-flag wrappers, fade ramp,
 * etc.), not through "we called viewer.foo" assertions.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { effectScope, nextTick, ref, type EffectScope } from 'vue';
import type { IdbScene } from '~/composables/useIdb';
import type {
  CameraMode,
  CameraPose,
  GroupId,
  ObjectOffset,
} from '~/utils/types';
import { useSceneAuthor, type SceneAuthorViewer } from '../useSceneAuthor';
import useModelViewerStore from '../useModelViewerStore';

interface FakeViewer extends SceneAuthorViewer {
  emitUserInteraction(): void;
  emitObjectMoved(): void;
  /** Invoke every onFrame subscriber once. */
  tickFrame(): void;
  appliedOffsets: Array<Map<GroupId, ObjectOffset>>;
  visibleCalls: Array<[GroupId, boolean]>;
  fadeLog: Array<Map<GroupId, number> | 'clear'>;
  cameraMode: CameraMode;
  cameraPose: CameraPose;
  floorVisible: boolean;
  fitCalls: number;
}

function makeFakeViewer(opts: { ready?: boolean } = {}): FakeViewer {
  const userListeners: Array<() => void> = [];
  const movedListeners: Array<() => void> = [];
  const frameListeners: Array<(dt: number) => void> = [];
  const objects = [
    { groupId: 1, partNumber: 1, name: 'A' },
    { groupId: 2, partNumber: 1, name: 'B' },
    { groupId: 3, partNumber: 2, name: 'C' },
  ];
  const offsets = new Map<GroupId, ObjectOffset>();

  const v: FakeViewer = {
    ready: ref(opts.ready ?? true),
    cameraMode: 'perspective',
    cameraPose: { position: [0, 0, 0], target: [0, 0, 0] },
    floorVisible: true,
    appliedOffsets: [],
    visibleCalls: [],
    fadeLog: [],
    fitCalls: 0,
    fit: () => {
      v.fitCalls++;
    },
    getCameraMode: () => v.cameraMode,
    setCameraMode: (m) => {
      v.cameraMode = m;
    },
    getCameraPose: () => v.cameraPose,
    setCameraPose: (p) => {
      v.cameraPose = p;
    },
    getFloorVisible: () => v.floorVisible,
    setFloorVisible: (b) => {
      v.floorVisible = b;
    },
    setObjectVisible: (id, visible) => {
      v.visibleCalls.push([id, visible]);
    },
    setAllObjectsVisible: (visible) => {
      for (const o of objects) v.visibleCalls.push([o.groupId, visible]);
    },
    setObjectFadeAlphas: (perGroup) => {
      v.fadeLog.push(new Map(perGroup));
    },
    clearObjectFadeAlphas: () => {
      v.fadeLog.push('clear');
    },
    resetAllOffsets: () => {
      offsets.clear();
    },
    resetSelectedOffsets: () => {},
    getObjectOffsets: () => new Map(offsets),
    applyObjectOffsets: (m) => {
      v.appliedOffsets.push(new Map(m));
      for (const [k, val] of m) offsets.set(k, val);
    },
    getObjects: () => objects,
    captureThumbnail: vi.fn().mockReturnValue('data:image/png;base64,XX'),
    onFrame: (cb) => {
      frameListeners.push(cb);
      return () => {
        const i = frameListeners.indexOf(cb);
        if (i >= 0) frameListeners.splice(i, 1);
      };
    },
    on: (type, cb) => {
      if (type === 'user-interaction') userListeners.push(cb);
      else if (type === 'object-moved') movedListeners.push(cb);
      return () => {};
    },
    emitUserInteraction: () => {
      for (const cb of userListeners) cb();
    },
    emitObjectMoved: () => {
      for (const cb of movedListeners) cb();
    },
    tickFrame: () => {
      for (const cb of [...frameListeners]) cb(16);
    },
  };
  return v;
}

function makeScene(overrides: Partial<IdbScene> = {}): IdbScene {
  const now = new Date().toISOString();
  return {
    id: 's1',
    modelId: 'm',
    name: 'Scene',
    order: 0,
    cameraMode: 'orthographic',
    cameraPose: { position: [10, 5, 0], target: [0, 0, 0] },
    objectOffsets: { 1: { position: [3, 0, 0], quaternion: [0, 0, 0, 1] } },
    visibleObjects: [1, 3],
    floorVisible: false,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function withScope<T>(fn: () => T): { result: T; scope: EffectScope } {
  const scope = effectScope();
  const result = scope.run(fn)!;
  return { result, scope };
}

// ─── Visibility set construction ────────────────────────────────────────────

describe('useSceneAuthor — visibility', () => {
  it('starts with null (canonical "all visible")', () => {
    const v = makeFakeViewer();
    const { result: a } = withScope(() => useSceneAuthor(v));
    expect(a.visibleObjects.value).toBeNull();
  });

  it('folds to null when every Object is visible after a toggle', () => {
    const v = makeFakeViewer();
    const { result: a } = withScope(() => useSceneAuthor(v));
    a.setObjectsVisibility([2], false);
    expect(a.visibleObjects.value).toBeInstanceOf(Set);
    a.setObjectsVisibility([2], true);
    expect(a.visibleObjects.value).toBeNull();
  });

  it('hides all into an empty Set, not null (so the state is distinguishable)', () => {
    const v = makeFakeViewer();
    const { result: a } = withScope(() => useSceneAuthor(v));
    a.hideAllObjects();
    expect(a.visibleObjects.value).toBeInstanceOf(Set);
    expect(a.visibleObjects.value?.size).toBe(0);
  });

  it('toggle hides every selected when any are visible', () => {
    const v = makeFakeViewer();
    const { result: a } = withScope(() => useSceneAuthor(v));
    a.toggleObjectsVisibility([1, 2]);
    const set = a.visibleObjects.value as Set<GroupId>;
    expect(set.has(1)).toBe(false);
    expect(set.has(2)).toBe(false);
    expect(set.has(3)).toBe(true);
  });

  it('toggle shows every selected when all are currently hidden', () => {
    const v = makeFakeViewer();
    const { result: a } = withScope(() => useSceneAuthor(v));
    a.setObjectsVisibility([1, 2], false);
    a.toggleObjectsVisibility([1, 2]);
    expect(a.visibleObjects.value).toBeNull();
  });

  it('is a no-op when called with no ids', () => {
    const v = makeFakeViewer();
    const { result: a } = withScope(() => useSceneAuthor(v));
    a.toggleObjectsVisibility([]);
    expect(a.visibleObjects.value).toBeNull();
    expect(v.visibleCalls.length).toBe(0);
  });
});

// ─── Dirty flag (state machine + dirty-flag-wrapper invariants) ─────────────

describe('useSceneAuthor — dirty flag', () => {
  it('does not flip dirty until a scene is active', () => {
    const v = makeFakeViewer();
    const { result: a } = withScope(() => useSceneAuthor(v));
    v.emitUserInteraction();
    v.emitObjectMoved();
    expect(a.dirty.value).toBe(false);
  });

  it('flips dirty on user-interaction once a scene is active', () => {
    const v = makeFakeViewer();
    const { result: a } = withScope(() => useSceneAuthor(v));
    a.jumpToScene(makeScene());
    expect(a.dirty.value).toBe(false);
    v.emitUserInteraction();
    expect(a.dirty.value).toBe(true);
  });

  it('flips dirty on object-moved once a scene is active', () => {
    const v = makeFakeViewer();
    const { result: a } = withScope(() => useSceneAuthor(v));
    a.jumpToScene(makeScene());
    v.emitObjectMoved();
    expect(a.dirty.value).toBe(true);
  });

  it('resets dirty when jumpToScene runs', () => {
    const v = makeFakeViewer();
    const { result: a } = withScope(() => useSceneAuthor(v));
    a.jumpToScene(makeScene());
    v.emitUserInteraction();
    expect(a.dirty.value).toBe(true);
    a.jumpToScene(makeScene({ id: 's2' }));
    expect(a.dirty.value).toBe(false);
  });

  it('flips dirty on visibility toggle when a scene is active', () => {
    const v = makeFakeViewer();
    const { result: a } = withScope(() => useSceneAuthor(v));
    a.jumpToScene(makeScene());
    a.toggleObjectVisibility(2);
    expect(a.dirty.value).toBe(true);
  });

  it('markDirty is a no-op without an active scene; flips once a scene exists', () => {
    const v = makeFakeViewer();
    const { result: a } = withScope(() => useSceneAuthor(v));
    a.markDirty();
    expect(a.dirty.value).toBe(false);
    a.jumpToScene(makeScene());
    a.markDirty();
    expect(a.dirty.value).toBe(true);
  });

  // The dirty-flag wrappers — the genuinely interesting concern. Writes that
  // bypass the bus (camera mode / floor visibility / fit) still need to mark
  // the active scene dirty so the user is prompted to save.

  it('setCameraMode marks the scene dirty and syncs the ref', () => {
    const v = makeFakeViewer();
    const { result: a } = withScope(() => useSceneAuthor(v));
    a.jumpToScene(makeScene());
    a.markClean();

    a.setCameraMode('perspective');
    expect(a.cameraMode.value).toBe('perspective');
    expect(a.dirty.value).toBe(true);
  });

  it('setFloorVisible marks the scene dirty and syncs the ref', () => {
    const v = makeFakeViewer();
    const { result: a } = withScope(() => useSceneAuthor(v));
    a.jumpToScene(makeScene());
    a.markClean();

    a.setFloorVisible(true);
    expect(a.floorVisible.value).toBe(true);
    expect(a.dirty.value).toBe(true);
  });

  it('fitToModel marks the active scene dirty', () => {
    const v = makeFakeViewer();
    const { result: a } = withScope(() => useSceneAuthor(v));
    a.jumpToScene(makeScene());
    a.markClean();

    a.fitToModel();
    expect(a.dirty.value).toBe(true);
  });

  it('fitToModel does not dirty when no scene is active', () => {
    const v = makeFakeViewer();
    const { result: a } = withScope(() => useSceneAuthor(v));
    a.fitToModel();
    expect(a.dirty.value).toBe(false);
  });

  it('markClean clears dirty without affecting activeSceneId', () => {
    const v = makeFakeViewer();
    const { result: a } = withScope(() => useSceneAuthor(v));
    a.jumpToScene(makeScene());
    v.emitObjectMoved();
    expect(a.dirty.value).toBe(true);

    a.markClean();
    expect(a.dirty.value).toBe(false);
    expect(a.activeSceneId.value).toBe('s1');
  });
});

// ─── Capture (sparse offsets, visibility set, viewer state snapshot) ────────

describe('useSceneAuthor — capture', () => {
  it('captures the live viewer state into a SceneState', () => {
    const v = makeFakeViewer();
    v.cameraMode = 'orthographic';
    v.cameraPose = { position: [4, 5, 6], target: [0, 0, 0] };
    v.floorVisible = false;
    const { result: a } = withScope(() => useSceneAuthor(v));

    a.setObjectsVisibility([2], false);
    const state = a.captureCurrentSceneState();

    expect(state.cameraMode).toBe('orthographic');
    expect(state.cameraPose.position).toEqual([4, 5, 6]);
    expect(state.floorVisible).toBe(false);
    expect((state.visibleObjects as Set<number>).has(2)).toBe(false);
  });
});

// ─── jumpToScene (apply path: camera/floor/visibility/offsets all in one) ───

describe('useSceneAuthor — jumpToScene', () => {
  it('applies camera, floor, visibility, and offsets to the viewer', () => {
    const v = makeFakeViewer();
    const { result: a } = withScope(() => useSceneAuthor(v));
    a.jumpToScene(makeScene());

    expect(v.cameraMode).toBe('orthographic');
    expect(v.cameraPose.position).toEqual([10, 5, 0]);
    expect(v.floorVisible).toBe(false);
    expect(a.activeSceneId.value).toBe('s1');
    expect((a.visibleObjects.value as Set<number>).has(1)).toBe(true);
    expect((a.visibleObjects.value as Set<number>).has(2)).toBe(false);

    // Sparse offsets: only object 1 in the scene; identity for the rest.
    const lastApplied = v.appliedOffsets.at(-1)!;
    expect(lastApplied.get(1)?.position).toEqual([3, 0, 0]);
    expect(lastApplied.get(2)?.position).toEqual([0, 0, 0]);
  });

  it('clears selection + hover (so leaders/highlights do not stick across scenes)', () => {
    const v = makeFakeViewer();
    const { result: a } = withScope(() => useSceneAuthor(v));
    const store = useModelViewerStore();
    store.selectGroupIds([1]);
    store.setHoveredGroupIds([2]);

    a.jumpToScene(makeScene());
    expect(store.selectedGroupIds.value.size).toBe(0);
    expect(store.hoveredGroupIds.value.size).toBe(0);
  });
});

// ─── tweenToScene (lifecycle: start/mid/end, fade ramp, dirty suppression) ──

describe('useSceneAuthor — tweenToScene', () => {
  function fastForward(ms: number) {
    vi.setSystemTime(Date.now() + ms);
  }

  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(performance, 'now').mockImplementation(() => Date.now());
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('starts, advances mid-cut at t≈0.5, and resolves at t=1', async () => {
    const v = makeFakeViewer();
    const { result: a } = withScope(() => useSceneAuthor(v));

    const promise = a.tweenToScene(makeScene(), 100);
    expect(a.tween.value?.to).toBe('s1');
    expect(a.activeSceneId.value).toBe('s1');

    // Pre-midpoint — no mid-cut yet.
    v.tickFrame();
    expect(v.cameraMode).toBe('perspective');
    expect(v.floorVisible).toBe(true);

    // Past midpoint — mid-cut fires (camera mode + floor flip).
    fastForward(60);
    v.tickFrame();
    expect(v.cameraMode).toBe('orthographic');
    expect(v.floorVisible).toBe(false);

    // Past end — tween resolves.
    fastForward(60);
    v.tickFrame();
    await promise;
    expect(a.tween.value).toBeNull();
  });

  it('fades appearing + disappearing objects across the tween', async () => {
    const v = makeFakeViewer();
    const { result: a } = withScope(() => useSceneAuthor(v));
    a.jumpToScene(
      makeScene({
        id: 's0',
        visibleObjects: [2],
        objectOffsets: {},
      }),
    );
    v.fadeLog.length = 0;
    v.visibleCalls.length = 0;

    const promise = a.tweenToScene(makeScene({ id: 's1' }), 100);

    // Appearing objects 1 + 3 must be made body-visible up front so they
    // have something to fade in.
    expect(
      v.visibleCalls.filter(([id, vis]) => vis && (id === 1 || id === 3))
        .length,
    ).toBe(2);

    fastForward(50);
    v.tickFrame();
    const mid = v.fadeLog.find(
      (e) => e !== 'clear' && e.has(1) && (e.get(1) ?? 0) > 0,
    ) as Map<GroupId, number>;
    const appearAlpha = mid.get(1)!;
    const disappearAlpha = mid.get(2)!;
    expect(appearAlpha).toBeGreaterThan(0);
    expect(appearAlpha).toBeLessThan(1);
    expect(appearAlpha + disappearAlpha).toBeCloseTo(1, 5);

    fastForward(60);
    v.tickFrame();
    await promise;
    expect(v.fadeLog).toContain('clear');
    expect(v.visibleCalls).toContainEqual([2, false]);
  });

  it('skips fade work when visibility does not change between scenes', () => {
    const v = makeFakeViewer();
    const { result: a } = withScope(() => useSceneAuthor(v));
    a.jumpToScene(makeScene({ id: 's0', visibleObjects: undefined }));
    v.fadeLog.length = 0;

    a.tweenToScene(
      makeScene({ id: 's1', visibleObjects: undefined, objectOffsets: {} }),
      100,
    );
    v.tickFrame();
    expect(v.fadeLog.every((e) => e === 'clear')).toBe(true);
  });

  it('suppresses dirty during tween-driven object-moved bursts', () => {
    const v = makeFakeViewer();
    const { result: a } = withScope(() => useSceneAuthor(v));
    a.jumpToScene(makeScene());
    a.tweenToScene(makeScene({ id: 's2' }), 100);
    v.emitObjectMoved();
    v.emitUserInteraction();
    expect(a.dirty.value).toBe(false);
  });

  it('resolves the prior promise when a new tween starts mid-flight', async () => {
    const v = makeFakeViewer();
    const { result: a } = withScope(() => useSceneAuthor(v));

    const p1 = a.tweenToScene(makeScene({ id: 's1' }), 200);
    fastForward(80);
    v.tickFrame();
    expect(a.tween.value?.t ?? 1).toBeLessThan(1);

    const p2 = a.tweenToScene(makeScene({ id: 's2' }), 200);
    await expect(p1).resolves.toBeUndefined();

    fastForward(220);
    v.tickFrame();
    await expect(p2).resolves.toBeUndefined();
    expect(a.tween.value).toBeNull();
  });

  it('falls back to jumpToScene when viewer is not ready', () => {
    const v = makeFakeViewer({ ready: false });
    const { result: a } = withScope(() => useSceneAuthor(v));
    a.tweenToScene(makeScene(), 100);
    expect(a.activeSceneId.value).toBe('s1');
    expect(a.tween.value).toBeNull();
  });
});

// ─── Per-model active-scene memory + project-switch cleanup ─────────────────

describe('useSceneAuthor — per-model active-scene memory', () => {
  beforeEach(() => {
    useModelViewerStore().clearActiveSceneMemory();
  });

  it('writes activeSceneId back to the store keyed by model, restores on switch, and does not echo during restoration', async () => {
    const v = makeFakeViewer();
    const focusedModelId = ref<string | null>('m-A');
    const { result: a } = withScope(() => useSceneAuthor(v, focusedModelId));
    const store = useModelViewerStore();

    // Seed B in the store directly so the switch has something to restore.
    store.setActiveSceneForModel('m-B', 's-B-pre');

    // Author under A.
    a.jumpToScene(makeScene({ id: 's-A1' }));
    await nextTick();
    expect(store.getActiveSceneForModel('m-A')).toBe('s-A1');

    // Switch to B — restoration adopts s-B-pre and must not overwrite A's
    // memory (the suppress flag prevents the write echo).
    focusedModelId.value = 'm-B';
    await nextTick();
    expect(a.activeSceneId.value).toBe('s-B-pre');
    expect(store.getActiveSceneForModel('m-A')).toBe('s-A1');

    // Switch back to A — restores A's previous active id.
    focusedModelId.value = 'm-A';
    await nextTick();
    expect(a.activeSceneId.value).toBe('s-A1');
  });

  it('clears in-memory dirty/visibility on model switch', async () => {
    const v = makeFakeViewer();
    const focusedModelId = ref<string | null>('m-A');
    const { result: a } = withScope(() => useSceneAuthor(v, focusedModelId));

    a.jumpToScene(makeScene({ id: 's-A1' }));
    await nextTick();
    a.setObjectsVisibility([2], false);
    await nextTick();
    expect(a.visibleObjects.value).toBeInstanceOf(Set);
    expect(a.dirty.value).toBe(true);

    focusedModelId.value = 'm-B';
    await nextTick();
    await nextTick();

    expect(a.visibleObjects.value).toBeNull();
    expect(a.dirty.value).toBe(false);
    expect(a.activeSceneId.value).toBeNull();
  });
});

// ─── Deferred listener attachment (avoids missing dirty events on cold start) ─

describe('useSceneAuthor — deferred listener attachment', () => {
  it('attaches listeners only after viewer.ready flips true', async () => {
    const v = makeFakeViewer({ ready: false });
    const { result: a } = withScope(() => useSceneAuthor(v));
    a.jumpToScene(makeScene());

    v.emitObjectMoved();
    expect(a.dirty.value).toBe(false);

    v.ready.value = true;
    await Promise.resolve();
    v.emitObjectMoved();
    expect(a.dirty.value).toBe(true);
  });
});
