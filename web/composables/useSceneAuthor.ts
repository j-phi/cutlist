/**
 * Author-side scene authoring state. Owns the visibility set, the active
 * scene id, the dirty sentinel, and the capture / jump / tween glue between
 * the viewer and `IdbScene` records.
 *
 * The viewer interface this composable accepts is the subset of
 * `useThreeViewer`'s return value it actually needs — defined as a type so
 * tests can fake it without booting Three.js.
 *
 * Dirty flag — boolean sentinel. Set on canvas user-interaction (orbit,
 * gizmo) or visibility toggles when there's an `activeSceneId` and no tween
 * in flight; reset on `jumpToScene` / `tweenToScene` / explicit "Update
 * scene" commit. We don't deep-diff because user intent is binary.
 */

import type { Ref } from 'vue';
import type {
  CameraMode,
  CameraPose,
  IdbScene,
  ObjectOffset,
} from '~/composables/useIdb';
import {
  captureSceneState,
  easeInOut,
  interpolateSceneState,
  sceneStateFromIdb,
  type SceneState,
} from '~/lib/scene';
import type { GroupId } from '~/utils/types';

const TWEEN_MS = 300;

export interface SceneAuthorViewer {
  ready: Ref<boolean>;
  getCameraMode(): CameraMode;
  setCameraMode(mode: CameraMode): void;
  getCameraPose(): CameraPose | undefined;
  setCameraPose(pose: CameraPose): void;
  getFloorVisible(): boolean;
  setFloorVisible(v: boolean): void;
  setObjectVisible(id: GroupId, visible: boolean): void;
  setAllObjectsVisible(visible: boolean): void;
  resetAllOffsets(): void;
  resetSelectedOffsets(ids: GroupId[]): void;
  getObjectOffsets(): Map<GroupId, ObjectOffset>;
  applyObjectOffsets(offsets: Map<GroupId, ObjectOffset>): void;
  getObjects(): Array<{ groupId: GroupId; partNumber: number; name: string }>;
  captureThumbnail(width: number, height: number): string | null;
  onFrame(cb: (dt: number) => void): () => void;
  on(type: 'user-interaction', cb: () => void): () => void;
  on(type: 'object-moved', cb: () => void): () => void;
}

/**
 * In-flight tween handle. `null` ≡ not tweening. The whole object is
 * reassigned on each frame so Vue reactivity holds — consumers read `t` to
 * follow progress and `from` to know which scene's labels/leaders are still
 * outgoing during the first half of the cross-fade.
 */
export interface Tween {
  /** Previous active scene id; null means no prior active scene. */
  from: string | null;
  to: string;
  /** Linear progress in [0, 1]. */
  t: number;
}

export interface SceneAuthor {
  visibleObjects: Ref<Set<GroupId> | null>;
  activeSceneId: Ref<string | null>;
  /** Active tween or `null` when not tweening. */
  tween: Ref<Tween | null>;
  dirty: Ref<boolean>;
  /**
   * Reactive mirror of the viewer's camera mode. Reads stay in sync via
   * `viewer.ready` watch + the explicit setters. Owned by the author so
   * the host doesn't have to juggle `cameraMode.value = …; viewer.setCameraMode(…)`
   * pairs.
   */
  cameraMode: Ref<CameraMode>;
  floorVisible: Ref<boolean>;

  toggleObjectVisibility(groupId: GroupId): void;
  setObjectsVisibility(groupIds: GroupId[], visible: boolean): void;
  /**
   * Tri-state group toggle. If any of `groupIds` is visible, hide them all;
   * otherwise show them all. Matches the Objects panel's part-row semantics.
   */
  toggleObjectsVisibility(groupIds: readonly GroupId[]): void;
  showAllObjects(): void;
  hideAllObjects(): void;
  resetAllOffsets(): void;
  resetSelectedOffsets(ids: GroupId[]): void;

  captureCurrentSceneState(): SceneState;
  captureThumbnail(): string | null;
  jumpToScene(scene: IdbScene): void;
  tweenToScene(scene: IdbScene, durationMs?: number): Promise<void>;
  /**
   * Switch the camera projection mode. Wraps `viewer.setCameraMode` and
   * marks the active scene dirty so a single host call covers both —
   * eliminates the foot-gun of forgetting one half.
   */
  setCameraMode(mode: CameraMode): void;
  /** Show / hide the ground grid. Marks the active scene dirty. */
  setFloorVisible(v: boolean): void;
  markClean(): void;
  /**
   * Mark the active scene dirty. Used by UI controls (camera mode, floor
   * toggle) whose changes don't go through the viewer's user-interaction
   * bus. No-op when no scene is active or a tween is in flight.
   */
  markDirty(): void;

  onUserChange(cb: () => void): () => void;
}

export function useSceneAuthor(
  viewer: SceneAuthorViewer,
  focusedModelIdRef?: Ref<string | null>,
): SceneAuthor {
  const visibleObjects = ref<Set<GroupId> | null>(null);
  const activeSceneId = ref<string | null>(null);
  const tween = ref<Tween | null>(null);
  const dirty = ref(false);
  // The viewer doesn't expose reactive getters for camera mode / floor; we
  // mirror them here so consumers can `v-bind` against a Ref. Initial values
  // are synced from the viewer once it reports ready, and on every explicit
  // setter call below.
  const cameraMode = ref<CameraMode>('perspective');
  const floorVisible = ref(true);
  if (viewer.ready.value) {
    cameraMode.value = viewer.getCameraMode();
    floorVisible.value = viewer.getFloorVisible();
  } else {
    const stop = watch(viewer.ready, (r) => {
      if (!r) return;
      cameraMode.value = viewer.getCameraMode();
      floorVisible.value = viewer.getFloorVisible();
      stop();
    });
  }

  let stopFrame: (() => void) | null = null;
  // Pending tween resolver. Captured here (not just in the onFrame closure)
  // so that if a new tween supersedes an in-flight one, we can resolve the
  // prior promise rather than leaving its awaiters hanging — the new tween
  // is treated as completion of the old.
  let pendingResolve: (() => void) | null = null;
  const userChangeCallbacks = new Set<() => void>();

  // Per-model active-scene memory. We keep two side-effects in sync:
  //   1. `activeSceneId` change → write `(currentModelId → newSceneId)` so
  //      the next time the user comes back to this model the timeline lands
  //      where they left it.
  //   2. `focusedModelIdRef` change → read the remembered scene id for the
  //      new model and adopt it. We don't tween on switch; the consumer
  //      (ModelTab) decides whether to call `tweenToScene` after re-hydrate.
  // The store owns the map so it survives across composable re-runs (e.g.
  // ModelTab unmount/remount in the same project).
  if (focusedModelIdRef) {
    const store = useModelViewerStore();
    let suppressActiveWrite = false;

    watch(activeSceneId, (sid) => {
      if (suppressActiveWrite) return;
      const mid = focusedModelIdRef.value;
      if (!mid) return;
      store.setActiveSceneForModel(mid, sid);
    });

    watch(
      () => focusedModelIdRef.value,
      (mid) => {
        // Adopt the remembered scene for the new model. Wrap the assignment
        // so the activeSceneId watcher above doesn't re-write it back —
        // restoration is a read, not a user action.
        suppressActiveWrite = true;
        try {
          activeSceneId.value = mid ? store.getActiveSceneForModel(mid) : null;
        } finally {
          suppressActiveWrite = false;
        }
        // Switching models invalidates the in-memory dirty/visibility/tween
        // state — they belong to the previous model's viewer load. The tween
        // is stopped explicitly so a mid-flight onFrame callback doesn't keep
        // poking the new model's offsets.
        stopTween();
        dirty.value = false;
        visibleObjects.value = null;
      },
    );
  }

  function markDirty(): void {
    if (!activeSceneId.value || tween.value !== null || dirty.value) return;
    dirty.value = true;
  }

  function notifyUserChange(): void {
    for (const cb of userChangeCallbacks) cb();
    markDirty();
  }

  function onUserChange(cb: () => void): () => void {
    userChangeCallbacks.add(cb);
    return () => userChangeCallbacks.delete(cb);
  }

  // viewer.on() is a no-op stub before ViewerCore.init() resolves — wait
  // for ready before subscribing or the listeners get silently dropped.
  const unsubs: Array<() => void> = [];
  function attachListeners() {
    unsubs.push(viewer.on('user-interaction', markDirty));
    unsubs.push(viewer.on('object-moved', markDirty));
  }
  if (viewer.ready.value) {
    attachListeners();
  } else {
    const stop = watch(viewer.ready, (r) => {
      if (!r) return;
      attachListeners();
      stop();
    });
  }
  onScopeDispose(() => {
    for (const off of unsubs) off();
    unsubs.length = 0;
  });

  // ── Visibility ────────────────────────────────────────────────────

  function getAllGroupIds(): GroupId[] {
    return viewer.getObjects().map((o) => o.groupId);
  }

  function isVisible(groupId: GroupId): boolean {
    const set = visibleObjects.value;
    return set === null ? true : set.has(groupId);
  }

  function setObjectsVisibility(
    groupIds: readonly GroupId[],
    visible: boolean,
  ): void {
    const all = getAllGroupIds();
    const next =
      visibleObjects.value === null
        ? new Set(all)
        : new Set(visibleObjects.value);
    for (const id of groupIds) {
      if (visible) next.add(id);
      else next.delete(id);
      viewer.setObjectVisible(id, visible);
    }
    visibleObjects.value = next.size === all.length ? null : next;
    notifyUserChange();
  }

  function toggleObjectVisibility(groupId: GroupId): void {
    setObjectsVisibility([groupId], !isVisible(groupId));
  }

  function toggleObjectsVisibility(groupIds: readonly GroupId[]): void {
    if (groupIds.length === 0) return;
    const anyVisible = groupIds.some((id) => isVisible(id));
    setObjectsVisibility(groupIds, !anyVisible);
  }

  function showAllObjects(): void {
    visibleObjects.value = null;
    viewer.setAllObjectsVisible(true);
    notifyUserChange();
  }

  function hideAllObjects(): void {
    visibleObjects.value = new Set();
    viewer.setAllObjectsVisible(false);
    notifyUserChange();
  }

  function resetAllOffsets(): void {
    viewer.resetAllOffsets();
    notifyUserChange();
  }

  function resetSelectedOffsets(ids: GroupId[]): void {
    viewer.resetSelectedOffsets(ids);
    notifyUserChange();
  }

  // ── Capture ────────────────────────────────────────────────────────

  function captureCurrentSceneState(): SceneState {
    const pose = viewer.getCameraPose() ?? {
      position: [0, 0, 0],
      target: [0, 0, 0],
      zoom: 1,
      up: [0, 1, 0],
    };
    return captureSceneState({
      cameraMode: viewer.getCameraMode(),
      cameraPose: pose,
      objectOffsets: viewer.getObjectOffsets(),
      visibleObjects: visibleObjects.value,
      floorVisible: viewer.getFloorVisible(),
    });
  }

  function captureThumbnail(): string | null {
    return viewer.captureThumbnail(320, 240);
  }

  // ── Apply ──────────────────────────────────────────────────────────

  function stopTween(): void {
    if (stopFrame) {
      stopFrame();
      stopFrame = null;
    }
    if (pendingResolve) {
      const r = pendingResolve;
      pendingResolve = null;
      r();
    }
    tween.value = null;
  }

  function applyVisibility(set: Set<GroupId> | null): void {
    visibleObjects.value = set === null ? null : new Set(set);
    if (set === null) {
      viewer.setAllObjectsVisible(true);
      return;
    }
    for (const o of viewer.getObjects()) {
      viewer.setObjectVisible(o.groupId, set.has(o.groupId));
    }
  }

  function jumpToScene(scene: IdbScene): void {
    stopTween();
    const state = sceneStateFromIdb(scene);
    activeSceneId.value = scene.id;
    // Briefly mark a tween-in-flight so markDirty short-circuits while we
    // poke the viewer's setters synchronously — equivalent to the previous
    // `tweening = true` guard but expressed through the unified ref.
    tween.value = { from: null, to: scene.id, t: 1 };
    try {
      if (viewer.ready.value) {
        viewer.setCameraMode(state.cameraMode);
        viewer.setCameraPose(state.cameraPose);
        viewer.setFloorVisible(state.floorVisible);
        cameraMode.value = state.cameraMode;
        floorVisible.value = state.floorVisible;
        applyVisibility(state.visibleObjects);
        applyFullOffsets(state);
      } else {
        visibleObjects.value =
          state.visibleObjects === null ? null : new Set(state.visibleObjects);
      }
    } finally {
      tween.value = null;
      dirty.value = false;
    }
  }

  function applyFullOffsets(state: SceneState): void {
    const ids = getAllGroupIds();
    const map = new Map<GroupId, ObjectOffset>();
    for (const id of ids) {
      const off = state.objectOffsets.get(id) ?? {
        position: [0, 0, 0],
        quaternion: [0, 0, 0, 1],
      };
      map.set(id, off);
    }
    viewer.applyObjectOffsets(map);
  }

  function tweenToScene(
    scene: IdbScene,
    durationMs: number = TWEEN_MS,
  ): Promise<void> {
    if (!viewer.ready.value || durationMs <= 0) {
      jumpToScene(scene);
      return Promise.resolve();
    }
    stopTween();

    const fromState = captureCurrentSceneState();
    const toState = sceneStateFromIdb(scene);
    const allGroupIds = getAllGroupIds();
    const start = performance.now();
    let midCutDone = false;

    const fromSceneId = activeSceneId.value;
    tween.value = { from: fromSceneId, to: scene.id, t: 0 };
    activeSceneId.value = scene.id;

    return new Promise<void>((resolve) => {
      pendingResolve = resolve;
      stopFrame = viewer.onFrame(() => {
        const raw = Math.min(1, (performance.now() - start) / durationMs);
        const eased = easeInOut(raw);
        const applied = interpolateSceneState(
          fromState,
          toState,
          eased,
          allGroupIds,
        );

        viewer.setCameraPose(applied.cameraPose);
        viewer.applyObjectOffsets(applied.objectOffsets);
        // Reassign the whole object so reactivity fires.
        tween.value = { from: fromSceneId, to: scene.id, t: raw };

        if (!midCutDone && raw >= 0.5) {
          midCutDone = true;
          viewer.setCameraMode(toState.cameraMode);
          viewer.setFloorVisible(toState.floorVisible);
          cameraMode.value = toState.cameraMode;
          floorVisible.value = toState.floorVisible;
          applyVisibility(toState.visibleObjects);
        }

        if (raw >= 1) {
          // stopTween() resolves pendingResolve, so the awaiter unblocks.
          stopTween();
          dirty.value = false;
        }
      });
    });
  }

  function markClean(): void {
    dirty.value = false;
  }

  function setCameraMode(mode: CameraMode): void {
    cameraMode.value = mode;
    viewer.setCameraMode(mode);
    markDirty();
  }

  function setFloorVisible(v: boolean): void {
    floorVisible.value = v;
    viewer.setFloorVisible(v);
    markDirty();
  }

  return {
    visibleObjects,
    activeSceneId,
    tween,
    dirty,
    cameraMode,
    floorVisible,
    toggleObjectVisibility,
    setObjectsVisibility,
    toggleObjectsVisibility,
    showAllObjects,
    hideAllObjects,
    resetAllOffsets,
    resetSelectedOffsets,
    captureCurrentSceneState,
    captureThumbnail,
    jumpToScene,
    tweenToScene,
    setCameraMode,
    setFloorVisible,
    markClean,
    markDirty,
    onUserChange,
  };
}
