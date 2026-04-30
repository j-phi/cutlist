// @vitest-environment nuxt
/**
 * Tests for useSceneAuthor's visibility, dirty-flag, capture, and jump
 * behaviour. The tween path is intentionally tested via direct apply paths —
 * the onFrame loop is exercised in viewer integration, not here.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { effectScope, nextTick, ref, type EffectScope } from 'vue';
import type {
  CameraMode,
  CameraPose,
  IdbScene,
  ObjectOffset,
} from '~/composables/useIdb';
import type { GroupId } from '~/utils/types';
import { useSceneAuthor, type SceneAuthorViewer } from '../useSceneAuthor';
import useModelViewerStore from '../useModelViewerStore';

interface FakeViewer extends SceneAuthorViewer {
  emitUserInteraction(): void;
  emitObjectMoved(): void;
  /** Invoke every onFrame subscriber once. */
  tickFrame(): void;
  appliedOffsets: Array<Map<GroupId, ObjectOffset>>;
  visibleCalls: Array<[GroupId, boolean]>;
  cameraMode: CameraMode;
  cameraPose: CameraPose;
  floorVisible: boolean;
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

describe('useSceneAuthor — visibility', () => {
  it('Should keep null (all visible) the canonical default', () => {
    const v = makeFakeViewer();
    const { result: a } = withScope(() => useSceneAuthor(v));
    expect(a.visibleObjects.value).toBeNull();
  });

  it('Should fold to null when every Object is visible after a toggle', () => {
    const v = makeFakeViewer();
    const { result: a } = withScope(() => useSceneAuthor(v));
    a.setObjectsVisibility([2], false);
    expect(a.visibleObjects.value).toBeInstanceOf(Set);
    a.setObjectsVisibility([2], true);
    expect(a.visibleObjects.value).toBeNull();
  });

  it('Should hide all into an empty Set, not null', () => {
    const v = makeFakeViewer();
    const { result: a } = withScope(() => useSceneAuthor(v));
    a.hideAllObjects();
    expect(a.visibleObjects.value).toBeInstanceOf(Set);
    expect(a.visibleObjects.value?.size).toBe(0);
  });

  it('Should hide every selected Object when any are visible', () => {
    const v = makeFakeViewer();
    const { result: a } = withScope(() => useSceneAuthor(v));
    a.toggleObjectsVisibility([1, 2]);
    const set = a.visibleObjects.value as Set<GroupId>;
    expect(set.has(1)).toBe(false);
    expect(set.has(2)).toBe(false);
    expect(set.has(3)).toBe(true);
  });

  it('Should hide all selected when only some are currently visible', () => {
    const v = makeFakeViewer();
    const { result: a } = withScope(() => useSceneAuthor(v));
    a.setObjectsVisibility([1], false);
    a.toggleObjectsVisibility([1, 2]);
    const set = a.visibleObjects.value as Set<GroupId>;
    expect(set.has(1)).toBe(false);
    expect(set.has(2)).toBe(false);
  });

  it('Should show every selected Object when all are currently hidden', () => {
    const v = makeFakeViewer();
    const { result: a } = withScope(() => useSceneAuthor(v));
    a.setObjectsVisibility([1, 2], false);
    a.toggleObjectsVisibility([1, 2]);
    expect(a.visibleObjects.value).toBeNull();
  });

  it('Should be a no-op when called with no ids', () => {
    const v = makeFakeViewer();
    const { result: a } = withScope(() => useSceneAuthor(v));
    a.toggleObjectsVisibility([]);
    expect(a.visibleObjects.value).toBeNull();
    expect(v.visibleCalls.length).toBe(0);
  });
});

describe('useSceneAuthor — dirty flag', () => {
  it('Should not flip dirty until a scene is active', () => {
    const v = makeFakeViewer();
    const { result: a } = withScope(() => useSceneAuthor(v));
    v.emitUserInteraction();
    v.emitObjectMoved();
    expect(a.dirty.value).toBe(false);
  });

  it('Should set dirty on user-interaction once a scene is active', () => {
    const v = makeFakeViewer();
    const { result: a } = withScope(() => useSceneAuthor(v));
    a.jumpToScene(makeScene());
    expect(a.dirty.value).toBe(false);
    v.emitUserInteraction();
    expect(a.dirty.value).toBe(true);
  });

  it('Should set dirty on object-moved once a scene is active', () => {
    const v = makeFakeViewer();
    const { result: a } = withScope(() => useSceneAuthor(v));
    a.jumpToScene(makeScene());
    v.emitObjectMoved();
    expect(a.dirty.value).toBe(true);
  });

  it('Should reset dirty when jumpToScene runs', () => {
    const v = makeFakeViewer();
    const { result: a } = withScope(() => useSceneAuthor(v));
    a.jumpToScene(makeScene());
    v.emitUserInteraction();
    expect(a.dirty.value).toBe(true);
    a.jumpToScene(makeScene({ id: 's2' }));
    expect(a.dirty.value).toBe(false);
  });

  it('Should flip dirty on visibility toggle when a scene is active', () => {
    const v = makeFakeViewer();
    const { result: a } = withScope(() => useSceneAuthor(v));
    a.jumpToScene(makeScene());
    expect(a.dirty.value).toBe(false);
    a.toggleObjectVisibility(2);
    expect(a.dirty.value).toBe(true);
  });

  it('Should expose markDirty so UI controls can flag scene changes', () => {
    const v = makeFakeViewer();
    const { result: a } = withScope(() => useSceneAuthor(v));
    a.markDirty();
    expect(a.dirty.value).toBe(false);
    a.jumpToScene(makeScene());
    a.markDirty();
    expect(a.dirty.value).toBe(true);
  });
});

describe('useSceneAuthor — capture', () => {
  it('Should capture the live viewer state into a SceneState', () => {
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
    expect(state.visibleObjects).not.toBeNull();
    expect((state.visibleObjects as Set<number>).has(2)).toBe(false);
  });

  it('Should capture a thumbnail at 320×240', () => {
    const v = makeFakeViewer();
    const { result: a } = withScope(() => useSceneAuthor(v));
    expect(a.captureThumbnail()).toBe('data:image/png;base64,XX');
    expect(v.captureThumbnail).toHaveBeenCalledWith(320, 240);
  });
});

describe('useSceneAuthor — jumpToScene', () => {
  it('Should apply camera, floor, visibility, and offsets', () => {
    const v = makeFakeViewer();
    const { result: a } = withScope(() => useSceneAuthor(v));
    a.jumpToScene(makeScene());

    expect(v.cameraMode).toBe('orthographic');
    expect(v.cameraPose.position).toEqual([10, 5, 0]);
    expect(v.floorVisible).toBe(false);
    expect(a.activeSceneId.value).toBe('s1');
    expect(a.visibleObjects.value).toBeInstanceOf(Set);
    expect((a.visibleObjects.value as Set<number>).has(1)).toBe(true);
    expect((a.visibleObjects.value as Set<number>).has(2)).toBe(false);

    const lastApplied = v.appliedOffsets.at(-1)!;
    expect(lastApplied.get(1)?.position).toEqual([3, 0, 0]);
    expect(lastApplied.get(2)?.position).toEqual([0, 0, 0]);
  });
});

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

  it('Should resolve after duration, applying mid-cut at 0.5 and ending tween', async () => {
    const v = makeFakeViewer();
    const { result: a } = withScope(() => useSceneAuthor(v));
    const scene = makeScene();

    const promise = a.tweenToScene(scene, 100);
    expect(a.tween.value).not.toBeNull();
    expect(a.tween.value?.to).toBe('s1');
    expect(a.activeSceneId.value).toBe('s1');

    // Frame at t=0 — neither mid-cut (camera mode/floor) nor terminal apply.
    v.tickFrame();
    expect(v.cameraMode).toBe('perspective');
    expect(v.floorVisible).toBe(true);
    expect(a.tween.value?.t ?? 1).toBeLessThan(0.5);

    // Past midpoint → mid-cut fires.
    fastForward(60);
    v.tickFrame();
    expect(v.cameraMode).toBe('orthographic');
    expect(v.floorVisible).toBe(false);
    expect(a.tween.value?.t ?? 0).toBeGreaterThanOrEqual(0.5);

    // Past end → tween resolves and stops.
    fastForward(60);
    v.tickFrame();
    await promise;
    expect(a.tween.value).toBeNull();
  });

  it('Should suppress dirty during tween-driven object-moved bursts', () => {
    const v = makeFakeViewer();
    const { result: a } = withScope(() => useSceneAuthor(v));
    a.jumpToScene(makeScene());
    expect(a.dirty.value).toBe(false);
    a.tweenToScene(makeScene({ id: 's2' }), 100);
    // While tweening, simulated bus events from the apply path should not
    // re-flip dirty (markDirty short-circuits when tween.value !== null).
    v.emitObjectMoved();
    v.emitUserInteraction();
    expect(a.dirty.value).toBe(false);
  });

  it('Should resolve the prior promise when a new tween starts mid-flight', async () => {
    const v = makeFakeViewer();
    const { result: a } = withScope(() => useSceneAuthor(v));
    const scene1 = makeScene({ id: 's1' });
    const scene2 = makeScene({ id: 's2' });

    const p1 = a.tweenToScene(scene1, 200);
    // Advance partway — well short of completion.
    fastForward(80);
    v.tickFrame();
    expect(a.tween.value?.t ?? 1).toBeLessThan(1);

    // Start a new tween before the first finishes — the prior promise must
    // resolve, not hang, so awaiters aren't stranded.
    const p2 = a.tweenToScene(scene2, 200);
    await expect(p1).resolves.toBeUndefined();

    // The new tween still completes naturally on its own timeline.
    fastForward(220);
    v.tickFrame();
    await expect(p2).resolves.toBeUndefined();
    expect(a.tween.value).toBeNull();
  });

  it('Should jumpToScene when viewer is not ready', () => {
    const v = makeFakeViewer({ ready: false });
    const { result: a } = withScope(() => useSceneAuthor(v));
    a.tweenToScene(makeScene(), 100);
    expect(a.activeSceneId.value).toBe('s1');
    expect(a.tween.value).toBeNull();
  });
});

describe('useSceneAuthor — markClean', () => {
  it('Should clear dirty without affecting activeSceneId', () => {
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

describe('useSceneAuthor — per-model active-scene memory', () => {
  beforeEach(() => {
    // The store is a global singleton (createGlobalState); clear the map so
    // tests don't leak ids between runs.
    useModelViewerStore().clearActiveSceneMemory();
  });

  it('Should write the active scene id back to the store keyed by model', async () => {
    const v = makeFakeViewer();
    const focusedModelId = ref<string | null>('m-A');
    const { result: a } = withScope(() => useSceneAuthor(v, focusedModelId));
    const store = useModelViewerStore();

    a.jumpToScene(makeScene({ id: 's-A1' }));
    // Allow the watch on activeSceneId to flush.
    await nextTick();
    expect(store.getActiveSceneForModel('m-A')).toBe('s-A1');
  });

  it('Should restore the remembered scene id when the focused model changes', async () => {
    const v = makeFakeViewer();
    const focusedModelId = ref<string | null>('m-A');
    const { result: a } = withScope(() => useSceneAuthor(v, focusedModelId));
    const store = useModelViewerStore();

    // Author a scene under model A.
    a.jumpToScene(makeScene({ id: 's-A1' }));
    await nextTick();
    expect(a.activeSceneId.value).toBe('s-A1');

    // Switch to model B — no scene remembered, so activeSceneId clears.
    focusedModelId.value = 'm-B';
    await nextTick();
    expect(a.activeSceneId.value).toBeNull();

    // Pretend the user authored a scene under B.
    a.jumpToScene(makeScene({ id: 's-B1' }));
    await nextTick();
    expect(store.getActiveSceneForModel('m-B')).toBe('s-B1');

    // Switch back to A — restores its previous active scene id from memory.
    focusedModelId.value = 'm-A';
    await nextTick();
    expect(a.activeSceneId.value).toBe('s-A1');
  });

  it('Should not write back during model-switch restoration', async () => {
    const v = makeFakeViewer();
    const focusedModelId = ref<string | null>('m-A');
    const { result: a } = withScope(() => useSceneAuthor(v, focusedModelId));
    const store = useModelViewerStore();

    // Seed B in the store directly so the switch has something to restore.
    store.setActiveSceneForModel('m-B', 's-B-pre');
    a.jumpToScene(makeScene({ id: 's-A1' }));
    await nextTick();
    expect(store.getActiveSceneForModel('m-A')).toBe('s-A1');

    focusedModelId.value = 'm-B';
    await nextTick();
    // Restoration adopted s-B-pre — and crucially didn't overwrite A's
    // memory with B's id (the suppress flag prevents the write echo).
    expect(a.activeSceneId.value).toBe('s-B-pre');
    expect(store.getActiveSceneForModel('m-A')).toBe('s-A1');
  });

  it('Should clear in-memory dirty/visibility on model switch', async () => {
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

describe('useSceneAuthor — deferred listener attachment', () => {
  it('Should attach listeners only after viewer.ready flips true', () => {
    const v = makeFakeViewer({ ready: false });
    const { result: a } = withScope(() => useSceneAuthor(v));
    a.jumpToScene(makeScene());

    // Before ready: emit fires but no listener registered yet.
    v.emitObjectMoved();
    expect(a.dirty.value).toBe(false);

    // Flip ready, now listeners attach (via watch).
    v.ready.value = true;
    // Allow the watcher to flush.
    return Promise.resolve().then(() => {
      v.emitObjectMoved();
      expect(a.dirty.value).toBe(true);
    });
  });
});
