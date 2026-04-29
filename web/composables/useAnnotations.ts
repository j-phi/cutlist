/**
 * Reactive annotation list for the active project.
 *
 * Mirrors `useScenes`: a module-level reactive array shared across every
 * caller, hydrated lazily when `activeId` flips. Annotations are scene-scoped
 * (`sceneId`) but kept in one flat list under the active project so the
 * AnnotationLabels overlay can filter by scene cheaply — typical projects
 * carry tens, not thousands, of annotations across all scenes.
 *
 * Concurrency: single watcher, `loadGen` race counter. Mutations are
 * optimistic — the in-memory list is updated synchronously before the IDB
 * write resolves so the UI never flickers.
 *
 * Cascade: when a scene is removed via `useScenes.removeScene`, the IDB
 * delete cascades inside the scenes Dexie transaction; the in-memory state
 * here is purged via `purgeForScene` so the reactive list stays consistent
 * without a re-fetch.
 */

import { effectScope, type ComputedRef, type Ref } from 'vue';
import type {
  IdbAnnotation,
  IdbCallout,
  IdbDimension,
} from '~/composables/useIdb';
import type { GroupId } from '~/utils/types';

type Vec3 = [number, number, number];

export interface CreateCalloutInput {
  kind: 'callout';
  sceneId: string;
  groupId: GroupId;
  anchorLocal: Vec3;
  anchorNormalLocal: Vec3;
  labelOffsetLocal: Vec3;
  text?: string;
}

export interface CreateDimensionInput {
  kind: 'dimension';
  sceneId: string;
  groupId: GroupId;
  anchor1Local: Vec3;
  anchor2Local: Vec3;
  offsetLocal: Vec3;
  text?: string;
}

export type CreateAnnotationInput = CreateCalloutInput | CreateDimensionInput;

type ImmutableFields = 'id' | 'sceneId' | 'kind' | 'groupId' | 'createdAt';
type CalloutPatch = Partial<Omit<IdbCallout, ImmutableFields>>;
type DimensionPatch = Partial<Omit<IdbDimension, ImmutableFields>>;
type LocalAnnotationPatch = CalloutPatch | DimensionPatch;

export interface UseAnnotationsApi {
  annotations: Ref<IdbAnnotation[]>;
  visibleForScene(sceneId: string): ComputedRef<IdbAnnotation[]>;
  add(input: CreateAnnotationInput): Promise<string | undefined>;
  update(id: string, patch: LocalAnnotationPatch): Promise<void>;
  remove(id: string): Promise<void>;
  purgeForScene(sceneId: string): void;
  reload(projectId: string): Promise<void>;
}

const annotations = ref<IdbAnnotation[]>([]);
let loadedForId: string | null = null;
let loadGen = 0;
let watcherInstalled = false;

export function useAnnotations(): UseAnnotationsApi {
  const idb = useIdb();
  const { activeId } = useProjects();

  if (!watcherInstalled) {
    watcherInstalled = true;
    effectScope(true).run(() => {
      watch(
        activeId,
        async (id) => {
          const gen = ++loadGen;
          if (!id) {
            annotations.value = [];
            loadedForId = null;
            return;
          }
          if (id === loadedForId) return;
          const loaded = await idb.getAnnotationsForProject(id);
          if (gen !== loadGen) return;
          annotations.value = loaded;
          loadedForId = id;
        },
        { immediate: true },
      );
    });
  }

  function visibleForScene(sceneId: string): ComputedRef<IdbAnnotation[]> {
    return computed(() =>
      annotations.value.filter((a) => a.sceneId === sceneId),
    );
  }

  async function add(
    input: CreateAnnotationInput,
  ): Promise<string | undefined> {
    if (!activeId.value) return;
    const now = new Date().toISOString();
    const id = crypto.randomUUID();
    const base = {
      id,
      sceneId: input.sceneId,
      groupId: input.groupId,
      createdAt: now,
      updatedAt: now,
    };
    const annotation: IdbAnnotation =
      input.kind === 'callout'
        ? {
            ...base,
            kind: 'callout',
            anchorLocal: input.anchorLocal,
            anchorNormalLocal: input.anchorNormalLocal,
            labelOffsetLocal: input.labelOffsetLocal,
            text: input.text ?? '',
          }
        : {
            ...base,
            kind: 'dimension',
            anchor1Local: input.anchor1Local,
            anchor2Local: input.anchor2Local,
            offsetLocal: input.offsetLocal,
            text: input.text,
          };
    loadGen++;
    annotations.value = [...annotations.value, annotation];
    loadedForId = activeId.value;
    try {
      await idb.createAnnotation(annotation);
    } catch (err) {
      annotations.value = annotations.value.filter((a) => a.id !== id);
      throw err;
    }
    return id;
  }

  async function update(
    id: string,
    patch: LocalAnnotationPatch,
  ): Promise<void> {
    const previous = annotations.value.find((a) => a.id === id);
    if (!previous) return;
    loadGen++;
    annotations.value = annotations.value.map((a) =>
      a.id === id
        ? ({
            ...a,
            ...patch,
            updatedAt: new Date().toISOString(),
          } as IdbAnnotation)
        : a,
    );
    try {
      await idb.updateAnnotation(id, patch);
    } catch (err) {
      annotations.value = annotations.value.map((a) =>
        a.id === id ? previous : a,
      );
      throw err;
    }
  }

  async function remove(id: string): Promise<void> {
    const previous = annotations.value.find((a) => a.id === id);
    if (!previous) return;
    loadGen++;
    annotations.value = annotations.value.filter((a) => a.id !== id);
    try {
      await idb.deleteAnnotation(id);
    } catch (err) {
      annotations.value = [...annotations.value, previous];
      throw err;
    }
  }

  function purgeForScene(sceneId: string): void {
    if (!annotations.value.some((a) => a.sceneId === sceneId)) return;
    loadGen++;
    annotations.value = annotations.value.filter((a) => a.sceneId !== sceneId);
  }

  async function reload(projectId: string): Promise<void> {
    const gen = ++loadGen;
    const loaded = await idb.getAnnotationsForProject(projectId);
    if (gen !== loadGen) return;
    annotations.value = loaded;
    loadedForId = projectId;
  }

  return {
    annotations,
    visibleForScene,
    add,
    update,
    remove,
    purgeForScene,
    reload,
  };
}

export default useAnnotations;
