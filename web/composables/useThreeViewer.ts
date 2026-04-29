/**
 * Thin Vue adapter over ViewerCore. The composable owns lifecycle (mount /
 * unmount, container watching) and bridges the existing
 * `useModelViewerStore` (which keys by partNumber for the BOM linkage) onto
 * the new groupId-based selection in ViewerCore.
 *
 * Three.js never appears in this file — only types. The day we move to a
 * worker or different framework, only this file changes.
 */

import type { Ref } from 'vue';
import type { ObjectGraph } from '~/utils/types';
import type {
  CameraMode,
  CameraPose,
  GizmoMode,
  InteractionMode,
  ObjectId,
  PickResult,
  RenderedLeaderSpec,
  Vec3,
  ViewPreset,
} from '~/lib/viewer/types';

export default function useThreeViewer(
  container: Ref<HTMLElement | undefined>,
) {
  const store = useModelViewerStore();
  const ready = ref(false);

  type Core = import('~/lib/viewer/ViewerCore').ViewerCore;
  let core: Core | null = null;
  const offBus: Array<() => void> = [];

  async function init(el: HTMLElement) {
    const { ViewerCore } = await import('~/lib/viewer/ViewerCore');
    core = new ViewerCore(el);

    // Wait until ViewerCore's modules finish loading.
    while (!core.ready) await new Promise((r) => setTimeout(r, 16));
    ready.value = true;

    offBus.push(
      core.on('pick', (e) => {
        if (!core) return;
        const part = e.result ? partNumberFor(core, e.result.groupId) : null;
        store.hoveredPartNumber.value = part;
      }),
    );

    offBus.push(
      core.on('selection-changed', (e) => {
        if (!core) return;
        if (e.groupIds.length === 0) {
          if (store.selectedPartNumber.value !== null) {
            store.selectedPartNumber.value = null;
          }
          return;
        }
        const part = partNumberFor(core, e.groupIds[0]);
        // Toggle selection on repeat click of the same part.
        store.selectedPartNumber.value =
          store.selectedPartNumber.value === part ? null : part;
      }),
    );
  }

  function partNumberFor(c: Core, groupId: ObjectId): number | null {
    return (
      (
        c as unknown as {
          registry: {
            get: (id: ObjectId) => { partNumber: number } | undefined;
          };
        }
      ).registry?.get(groupId)?.partNumber ?? null
    );
  }

  watch(
    container,
    async (el) => {
      if (el && !core) await init(el);
    },
    { immediate: true },
  );

  // Re-apply hover/select when the underlying part number store changes
  // (driven from BomTab clicks etc.).
  watch(
    () => store.hoveredPartNumber.value ?? store.selectedPartNumber.value,
    (partNumber) => {
      if (!core) return;
      const ids = partNumber == null ? [] : idsForPart(core, partNumber);
      core.setHoveredObject(partNumber == null ? null : (ids[0] ?? null));
      core.setSelectedObjects(
        store.selectedPartNumber.value == null
          ? []
          : idsForPart(core, store.selectedPartNumber.value),
      );
    },
  );

  function idsForPart(c: Core, partNumber: number): ObjectId[] {
    const reg = (
      c as unknown as {
        registry: { filterByPart: (n: number) => Array<{ groupId: ObjectId }> };
      }
    ).registry;
    if (!reg) return [];
    return reg.filterByPart(partNumber).map((r) => r.groupId);
  }

  onUnmounted(() => {
    for (const off of offBus) off();
    offBus.length = 0;
    core?.dispose();
    core = null;
    ready.value = false;
  });

  return {
    ready,
    loadModel: (graph: ObjectGraph, partNumberOffset?: number) =>
      core?.loadModel(graph, partNumberOffset),
    clearModels: () => core?.clearModels(),
    fit: () => core?.fit(),
    fitCamera: () => core?.fit(), // backward-compat alias
    getCameraMode: () => core?.getCameraMode() ?? ('perspective' as CameraMode),
    setCameraMode: (mode: CameraMode) => core?.setCameraMode(mode),
    getCameraPose: () => core?.getCameraPose(),
    setCameraPose: (pose: CameraPose) => core?.setCameraPose(pose),
    applyViewPreset: (preset: ViewPreset) => core?.applyViewPreset(preset),
    setSelectedObjects: (ids: ObjectId[]) => core?.setSelectedObjects(ids),
    setHoveredObject: (id: ObjectId | null) => core?.setHoveredObject(id),
    setGizmoMode: (mode: GizmoMode) => core?.setGizmoMode(mode),
    resetSelectedOffsets: (ids: ObjectId[]) => core?.resetSelectedOffsets(ids),
    resetAllOffsets: () => core?.resetAllOffsets(),
    setInteractionMode: (mode: InteractionMode) =>
      core?.setInteractionMode(mode),
    setFloorVisible: (v: boolean) => core?.setFloorVisible(v),
    getFloorVisible: () => core?.getFloorVisible() ?? true,
    setRenderedLeaders: (specs: Map<string, RenderedLeaderSpec>) =>
      core?.setRenderedLeaders(specs),
    raycastFromClient: (x: number, y: number): PickResult | null =>
      core?.raycastFromClient(x, y) ?? null,
    captureThumbnail: (w?: number, h?: number) =>
      core?.captureThumbnail(w, h) ?? null,
    applyObjectOffsets: (offsets: Map<ObjectId, Vec3>) =>
      core?.applyObjectOffsets(offsets),
    getObjectOffsets: () => core?.getObjectOffsets() ?? new Map(),
    onFrame: (cb: (dt: number) => void) => core?.onFrame(cb) ?? (() => {}),
    on: <T extends import('~/lib/viewer/types').ViewerEvent['type']>(
      type: T,
      cb: (
        e: Extract<import('~/lib/viewer/types').ViewerEvent, { type: T }>,
      ) => void,
    ) => core?.on(type, cb) ?? (() => {}),
    dispose: () => core?.dispose(),
  };
}
