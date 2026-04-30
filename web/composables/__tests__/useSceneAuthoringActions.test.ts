// @vitest-environment nuxt
/**
 * Unit tests for the scene authoring actions composable. The fakes only
 * implement the slice of `SceneAuthor` / `UseScenesApi` the actions touch.
 */
import { describe, expect, it, vi } from 'vitest';
import { effectScope, ref } from 'vue';
import type { IdbScene } from '~/composables/useIdb';
import type { SceneAuthor, Tween } from '../useSceneAuthor';
import type { UseScenesApi } from '../useScenes';
import { useSceneAuthoringActions } from '../useSceneAuthoringActions';

function makeAuthor(overrides: Partial<SceneAuthor> = {}): SceneAuthor {
  return {
    visibleObjects: ref(null),
    activeSceneId: ref<string | null>(null),
    tween: ref<Tween | null>(null),
    dirty: ref(false),
    cameraMode: ref('perspective'),
    floorVisible: ref(true),
    captureCurrentSceneState: vi.fn().mockReturnValue({
      cameraMode: 'perspective',
      cameraPose: { position: [0, 0, 0], target: [0, 0, 0] },
      objectOffsets: new Map(),
      visibleObjects: null,
      floorVisible: true,
    }),
    captureThumbnail: vi.fn().mockReturnValue('thumb'),
    jumpToScene: vi.fn(),
    tweenToScene: vi.fn().mockResolvedValue(undefined),
    setCameraMode: vi.fn(),
    setFloorVisible: vi.fn(),
    markClean: vi.fn(),
    markDirty: vi.fn(),
    onUserChange: vi.fn(() => () => {}),
    toggleObjectVisibility: vi.fn(),
    setObjectsVisibility: vi.fn(),
    toggleObjectsVisibility: vi.fn(),
    showAllObjects: vi.fn(),
    hideAllObjects: vi.fn(),
    resetAllOffsets: vi.fn(),
    resetSelectedOffsets: vi.fn(),
    ...overrides,
  } as SceneAuthor;
}

function makeScenes(scenes: IdbScene[] = []): UseScenesApi {
  const list = ref<IdbScene[]>(scenes);
  return {
    scenes: list,
    pinnedSceneIds: ref([]),
    defaultSceneId: ref(null),
    addScene: vi.fn(async () => 'new-id'),
    ensureDefaultScene: vi.fn(async () => undefined),
    updateScene: vi.fn(async () => {}),
    moveScene: vi.fn(async () => {}),
    removeScene: vi.fn(async () => {}),
    isDefaultScene: vi.fn(() => false),
    reload: vi.fn(async () => {}),
  } as unknown as UseScenesApi;
}

describe('useSceneAuthoringActions', () => {
  it('Should create a scene and adopt the new id', async () => {
    const author = makeAuthor();
    author.dirty.value = true;
    const scenes = makeScenes();
    const scope = effectScope();
    const actions = scope.run(() => useSceneAuthoringActions(author, scenes))!;

    await actions.addScene();

    expect(scenes.addScene).toHaveBeenCalledWith({
      state: expect.anything(),
      thumbnail: 'thumb',
    });
    expect(author.activeSceneId.value).toBe('new-id');
    expect(author.dirty.value).toBe(false);
    scope.stop();
  });

  it('Should be a no-op while a tween is in flight', async () => {
    const author = makeAuthor();
    author.tween.value = { from: null, to: 'x', t: 0.4 };
    const scenes = makeScenes();
    const scope = effectScope();
    const actions = scope.run(() => useSceneAuthoringActions(author, scenes))!;

    await actions.addScene();
    expect(scenes.addScene).not.toHaveBeenCalled();
    scope.stop();
  });

  it('Should tween to the matching scene on selectScene', async () => {
    const target: IdbScene = {
      id: 's1',
      modelId: 'm',
      name: 's',
      order: 0,
      cameraMode: 'perspective',
      cameraPose: { position: [0, 0, 0], target: [0, 0, 0] },
      objectOffsets: {},
      visibleObjects: null,
      floorVisible: true,
      createdAt: '',
      updatedAt: '',
    } as unknown as IdbScene;
    const author = makeAuthor();
    const scenes = makeScenes([target]);
    const scope = effectScope();
    const actions = scope.run(() => useSceneAuthoringActions(author, scenes))!;

    await actions.selectScene('s1');
    expect(author.tweenToScene).toHaveBeenCalledWith(target);
    scope.stop();
  });

  it('Should write thumbnail + state and mark clean on updateActiveScene', async () => {
    const author = makeAuthor();
    author.activeSceneId.value = 's1';
    author.dirty.value = true;
    const scenes = makeScenes();
    const scope = effectScope();
    const actions = scope.run(() => useSceneAuthoringActions(author, scenes))!;

    await actions.updateActiveScene();
    expect(scenes.updateScene).toHaveBeenCalledWith(
      's1',
      expect.objectContaining({ thumbnailDataUrl: 'thumb' }),
    );
    expect(author.markClean).toHaveBeenCalled();
    scope.stop();
  });

  it('Should clear active id when removing the active scene', async () => {
    const author = makeAuthor();
    author.activeSceneId.value = 's1';
    author.dirty.value = true;
    const scenes = makeScenes();
    const scope = effectScope();
    const actions = scope.run(() => useSceneAuthoringActions(author, scenes))!;

    await actions.removeScene('s1');
    expect(author.activeSceneId.value).toBeNull();
    expect(author.dirty.value).toBe(false);
    expect(scenes.removeScene).toHaveBeenCalledWith('s1');
    scope.stop();
  });

  it('Should not remove the default scene', async () => {
    const author = makeAuthor();
    author.activeSceneId.value = 'default:m1';
    const scenes = makeScenes();
    vi.mocked(scenes.isDefaultScene).mockReturnValue(true);
    const scope = effectScope();
    const actions = scope.run(() => useSceneAuthoringActions(author, scenes))!;

    await actions.removeScene('default:m1');

    expect(author.activeSceneId.value).toBe('default:m1');
    expect(scenes.removeScene).not.toHaveBeenCalled();
    scope.stop();
  });

  it('Should keep canUpdateScene true only when dirty + active + not tweening', () => {
    const author = makeAuthor();
    const scenes = makeScenes();
    const scope = effectScope();
    const actions = scope.run(() => useSceneAuthoringActions(author, scenes))!;

    expect(actions.canUpdateScene.value).toBe(false);

    author.dirty.value = true;
    author.activeSceneId.value = 's1';
    expect(actions.canUpdateScene.value).toBe(true);

    author.tween.value = { from: null, to: 's1', t: 0.5 };
    expect(actions.canUpdateScene.value).toBe(false);
    scope.stop();
  });
});
