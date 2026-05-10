// @vitest-environment nuxt
/**
 * Trimmed: this composable is pure orchestration over SceneAuthor + UseScenesApi.
 * Most behaviour-meaningful invariants are covered upstream. Two cases here
 * protect bugs the host can't catch:
 *  1) The dirty flag must be cleared on adopt — otherwise the user keeps
 *     seeing the "unsaved changes" affordance after their scene was saved.
 *  2) Capture must happen BEFORE addScene is called — addScene reads the
 *     captured state; flipping the order silently saves an empty/wrong scene.
 */
import { describe, expect, it } from 'vitest';
import { effectScope, ref } from 'vue';
import type { IdbScene } from '~/composables/useIdb';
import type { SceneAuthor, Tween } from '../useSceneAuthor';
import type { UseScenesApi } from '../useScenes';
import { useSceneAuthoringActions } from '../useSceneAuthoringActions';

interface AddCall {
  whenCaptured: number; // sequence number recording capture order
}

function setup() {
  let captureSeq = 0;
  let nextSeq = 0;
  const captured: number[] = [];
  const adds: AddCall[] = [];

  const author: SceneAuthor = {
    visibleObjects: ref(null),
    activeSceneId: ref<string | null>(null),
    tween: ref<Tween | null>(null),
    dirty: ref(false),
    cameraMode: ref('perspective'),
    floorVisible: ref(true),
    captureCurrentSceneState: () => {
      captureSeq = ++nextSeq;
      captured.push(captureSeq);
      return {
        cameraMode: 'perspective',
        cameraPose: { position: [0, 0, 0], target: [0, 0, 0] },
        objectOffsets: new Map(),
        visibleObjects: null,
        floorVisible: true,
      };
    },
    captureThumbnail: () => 'thumb',
    jumpToScene: () => {},
    tweenToScene: async () => {},
    setCameraMode: () => {},
    setFloorVisible: () => {},
    markClean: () => {
      author.dirty.value = false;
    },
    markDirty: () => {
      author.dirty.value = true;
    },
    onUserChange: () => () => {},
    toggleObjectVisibility: () => {},
    setObjectsVisibility: () => {},
    toggleObjectsVisibility: () => {},
    showAllObjects: () => {},
    hideAllObjects: () => {},
    resetAllOffsets: () => {},
    resetSelectedOffsets: () => {},
    fitToModel: () => {},
  } as SceneAuthor;

  const scenesApi: UseScenesApi = {
    scenes: ref<IdbScene[]>([]),
    pinnedSceneIds: ref([]),
    defaultSceneId: ref(null),
    addScene: async () => {
      adds.push({ whenCaptured: captureSeq });
      nextSeq++;
      return 'new-id';
    },
    ensureDefaultScene: async () => undefined,
    updateScene: async () => {},
    moveScene: async () => {},
    removeScene: async () => {},
    isDefaultScene: () => false,
    reload: async () => {},
  } as unknown as UseScenesApi;

  return { author, scenesApi, captured, adds };
}

describe('useSceneAuthoringActions', () => {
  it('clears the dirty flag and adopts the new id after addScene', async () => {
    const { author, scenesApi } = setup();
    author.dirty.value = true;
    const scope = effectScope();
    const actions = scope.run(() =>
      useSceneAuthoringActions(author, scenesApi),
    )!;

    await actions.addScene();

    expect(author.activeSceneId.value).toBe('new-id');
    expect(author.dirty.value).toBe(false);
    scope.stop();
  });

  it('captures scene state BEFORE persisting (capture-then-add ordering)', async () => {
    const { author, scenesApi, captured, adds } = setup();
    const scope = effectScope();
    const actions = scope.run(() =>
      useSceneAuthoringActions(author, scenesApi),
    )!;

    await actions.addScene();

    expect(captured.length).toBe(1);
    expect(adds.length).toBe(1);
    // The recorded captureSeq at the moment addScene fired must equal the
    // capture's own sequence number — i.e. capture preceded the persist call.
    expect(adds[0].whenCaptured).toBe(captured[0]);
    scope.stop();
  });
});
