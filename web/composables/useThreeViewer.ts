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
  const cameraDirection = ref<{ x: number; y: number; z: number }>({
    x: 0,
    y: 0,
    z: 1,
  });

  type Core = import('~/lib/viewer/ViewerCore').ViewerCore;
  let core: Core | null = null;
  const offBus: Array<() => void> = [];
  let offFrame: (() => void) | null = null;

  async function init(el: HTMLElement) {
    const { ViewerCore } = await import('~/lib/viewer/ViewerCore');
    core = new ViewerCore(el);

    // Wait until ViewerCore's modules finish loading.
    while (!core.ready) await new Promise((r) => setTimeout(r, 16));
    ready.value = true;

    offBus.push(
      core.on('pick', (e) => {
        if (!core) return;
        const part = e.result ? core.partNumberOf(e.result.groupId) : null;
        store.hoveredPartNumber.value = part;
      }),
    );

    let lastDirUpdate = 0;
    offFrame = core.onFrame(() => {
      if (!core) return;
      const now =
        typeof performance !== 'undefined' ? performance.now() : Date.now();
      if (now - lastDirUpdate < 16) return;
      lastDirUpdate = now;
      const [x, y, z] = core.getCameraDirection();
      const cur = cameraDirection.value;
      if (cur.x !== x || cur.y !== y || cur.z !== z) {
        cameraDirection.value = { x, y, z };
      }
    });

    offBus.push(
      core.on('selection-changed', (e) => {
        if (!core) return;
        // Canvas clicks own per-Object selection. Clear the BOM-driven
        // partNumber selection so the two paths don't double-highlight.
        if (store.selectedPartNumber.value !== null) {
          store.selectedPartNumber.value = null;
        }
        if (e.groupIds.length === 0) {
          if (!e.shiftKey) store.clearGroupSelection();
          return;
        }
        const gid = e.groupIds[0];
        if (e.shiftKey) {
          store.toggleGroupSelection(gid);
        } else if (
          store.selectedGroupIds.value.size === 1 &&
          store.selectedGroupIds.value.has(gid)
        ) {
          store.clearGroupSelection();
        } else {
          store.selectGroupIds([gid]);
        }
      }),
    );
  }

  watch(
    container,
    async (el) => {
      if (el && !core) await init(el);
    },
    { immediate: true },
  );

  // Re-apply hover/select on every store change. The viewer takes the union
  // of partNumber-fanned groupIds (driven by the BOM linkage) and explicit
  // groupIds (driven by the Objects panel / canvas multi-select).
  watch(
    () => [
      store.hoveredPartNumber.value,
      store.selectedPartNumber.value,
      store.hoveredGroupId.value,
      store.selectedGroupIds.value,
    ],
    ([hoveredPart, selectedPart, hoveredGroup, selectedGroups]) => {
      if (!core) return;
      const hoveredIds = new Set<ObjectId>();
      if (hoveredPart != null)
        for (const id of core.groupIdsForPart(hoveredPart as number))
          hoveredIds.add(id);
      if (hoveredGroup != null) hoveredIds.add(hoveredGroup as ObjectId);
      core.setHoveredObjects([...hoveredIds]);

      const selectedIds = new Set<ObjectId>();
      if (selectedPart != null)
        for (const id of core.groupIdsForPart(selectedPart as number))
          selectedIds.add(id);
      for (const id of (selectedGroups as Set<ObjectId>) ?? [])
        selectedIds.add(id);
      core.setSelectedObjects([...selectedIds]);
    },
  );

  onUnmounted(() => {
    for (const off of offBus) off();
    offBus.length = 0;
    offFrame?.();
    offFrame = null;
    core?.dispose();
    core = null;
    ready.value = false;
  });

  return {
    ready,
    cameraDirection,
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
    setHoveredObjects: (ids: ObjectId[]) => core?.setHoveredObjects(ids),
    setObjectVisible: (id: ObjectId, visible: boolean) =>
      core?.setObjectVisible(id, visible),
    setAllObjectsVisible: (visible: boolean) =>
      core?.setAllObjectsVisible(visible),
    getObjects: () => core?.getObjects() ?? [],
    setGizmoMode: (mode: GizmoMode) => core?.setGizmoMode(mode),
    resetSelectedOffsets: (ids: ObjectId[]) => core?.resetSelectedOffsets(ids),
    resetAllOffsets: () => core?.resetAllOffsets(),
    setInteractionMode: (
      mode: InteractionMode,
      handler?: import('~/lib/viewer/modules/InputRouter').PickHandler,
    ) => core?.setInteractionMode(mode, handler),
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
