/**
 * Thin Vue adapter over ViewerCore. The composable owns lifecycle (mount /
 * unmount, container watching) and bridges `useModelViewerStore` (a single
 * groupId-axis selection model) to the viewer's per-frame state.
 *
 * Three.js never appears in this file — only types. The day we move to a
 * worker or different framework, only this file changes.
 */

import type { Ref } from 'vue';
import type {
  CameraMode,
  CameraPose,
  GroupId,
  ObjectGraph,
  ObjectOffset,
  PartNumber,
} from '~/utils/types';
import { composeMarqueeSelection } from '~/lib/viewer/modules/MarqueeSelector';
import type {
  GizmoMode,
  InteractionMode,
  MarqueeRect,
  PickResult,
  RenderedLeaderSpec,
  SnapTarget,
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
  const marqueeRect = ref<MarqueeRect | null>(null);

  type Core = import('~/lib/viewer/ViewerCore').ViewerCore;
  let core: Core | null = null;
  const offBus: Array<() => void> = [];
  let offFrame: (() => void) | null = null;

  function syncPartIndex(c: Core): void {
    const byPart = new Map<PartNumber, GroupId[]>();
    for (const o of c.getObjects()) {
      const list = byPart.get(o.partNumber);
      if (list) list.push(o.groupId);
      else byPart.set(o.partNumber, [o.groupId]);
    }
    store.setPartIndex(byPart);
  }

  async function init(el: HTMLElement) {
    const { ViewerCore } = await import('~/lib/viewer/ViewerCore');
    const c = new ViewerCore(el);
    core = c;

    // Wait until ViewerCore's modules finish loading. Resolve immediately
    // if `ready` is already set; otherwise listen once for the bus event.
    // The listener is detached on either resolution or container unmount
    // (via `teardown`) so we don't leak.
    await new Promise<void>((resolve) => {
      if (c.ready) {
        resolve();
        return;
      }
      const off = c.on('ready', () => {
        off();
        resolve();
      });
      offBus.push(off);
    });
    // Bail if the component (or this core) was torn down while we waited.
    if (core !== c) return;
    ready.value = true;

    offBus.push(
      core.on('pick', (e) => {
        store.setHoveredGroupIds(e.result ? [e.result.groupId] : []);
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

    // Marquee multi-select. Live preview on every update; restore baseline
    // on cancel; the start event itself is just a hook for future UI.
    offBus.push(
      core.on('marquee-update', (e) => {
        marqueeRect.value = e.rect;
        const next = composeMarqueeSelection(
          e.baseline,
          e.candidates,
          e.shiftKey,
        );
        store.selectGroupIds(next);
      }),
    );
    offBus.push(
      core.on('marquee-end', (e) => {
        marqueeRect.value = null;
        if (e.committed) {
          const next = composeMarqueeSelection(
            e.baseline,
            e.candidates,
            e.shiftKey,
          );
          store.selectGroupIds(next);
        } else {
          // Escape mid-drag — restore the snapshot taken at marquee-start.
          store.selectGroupIds(e.baseline);
        }
      }),
    );
  }

  function teardown(): void {
    for (const off of offBus) off();
    offBus.length = 0;
    offFrame?.();
    offFrame = null;
    core?.dispose();
    core = null;
    ready.value = false;
  }

  watch(
    container,
    async (el) => {
      if (el && !core) {
        await init(el);
      } else if (!el && core) {
        // Container unmounted (e.g. parent v-if toggle). Drop the viewer
        // so the next mount gets a fresh core attached to the new node.
        teardown();
      }
    },
    { immediate: true },
  );

  watch(
    () => [store.hoveredGroupIds.value, store.selectedGroupIds.value],
    ([hovered, selected]) => {
      if (!core) return;
      core.setHoveredObjects([...(hovered as Set<GroupId>)]);
      core.setSelectedObjects([...(selected as Set<GroupId>)]);
    },
  );

  async function loadModel(
    graph: ObjectGraph,
    partNumberOffset?: number,
  ): Promise<void> {
    if (!core) return;
    await core.loadModel(graph, partNumberOffset);
    syncPartIndex(core);
  }

  function clearModels(): void {
    core?.clearModels();
    store.setPartIndex(new Map());
  }

  onUnmounted(() => {
    teardown();
  });

  return {
    ready,
    cameraDirection,
    marqueeRect,
    loadModel,
    clearModels,
    fit: () => core?.fit(),
    getCameraMode: () => core?.getCameraMode() ?? ('perspective' as CameraMode),
    setCameraMode: (mode: CameraMode) => core?.setCameraMode(mode),
    getCameraPose: () => core?.getCameraPose(),
    setCameraPose: (pose: CameraPose) => core?.setCameraPose(pose),
    applyViewPreset: (preset: ViewPreset) => core?.applyViewPreset(preset),
    setSelectedObjects: (ids: GroupId[]) => core?.setSelectedObjects(ids),
    setHoveredObject: (id: GroupId | null) => core?.setHoveredObject(id),
    setHoveredObjects: (ids: GroupId[]) => core?.setHoveredObjects(ids),
    setObjectVisible: (id: GroupId, visible: boolean) =>
      core?.setObjectVisible(id, visible),
    setAllObjectsVisible: (visible: boolean) =>
      core?.setAllObjectsVisible(visible),
    getObjects: () => core?.getObjects() ?? [],
    setGizmoMode: (mode: GizmoMode) => core?.setGizmoMode(mode),
    resetSelectedOffsets: (ids: GroupId[]) => core?.resetSelectedOffsets(ids),
    resetAllOffsets: () => core?.resetAllOffsets(),
    setInteractionMode: (
      mode: InteractionMode,
      handler?: import('~/lib/viewer/modules/InputRouter').PickHandler,
    ) => core?.setInteractionMode(mode, handler),
    setFloorVisible: (v: boolean) => core?.setFloorVisible(v),
    getFloorVisible: () => core?.getFloorVisible() ?? true,
    setRenderedLeaders: (specs: Map<string, RenderedLeaderSpec>) =>
      core?.setRenderedLeaders(specs),
    setLeaderOpacityScale: (scale: number) =>
      core?.setLeaderOpacityScale(scale),
    raycastFromClient: (x: number, y: number): PickResult | null =>
      core?.raycastFromClient(x, y) ?? null,
    findSnapTarget: (x: number, y: number): SnapTarget | null =>
      core?.findSnapTarget(x, y) ?? null,
    setSnapHover: (target: SnapTarget | null) => core?.setSnapHover(target),
    worldToScreen: (world: [number, number, number]) =>
      core?.worldToScreen(world) ?? null,
    objectLocalToWorld: (
      groupId: GroupId,
      local: [number, number, number],
    ): [number, number, number] | null =>
      core?.objectLocalToWorld(groupId, local) ?? null,
    worldToObjectLocal: (
      groupId: GroupId,
      world: [number, number, number],
    ): [number, number, number] | null =>
      core?.worldToObjectLocal(groupId, world) ?? null,
    worldDirToObjectLocal: (
      groupId: GroupId,
      worldDir: [number, number, number],
    ): [number, number, number] | null =>
      core?.worldDirToObjectLocal(groupId, worldDir) ?? null,
    unprojectToPlane: (
      x: number,
      y: number,
      planePoint: [number, number, number],
      planeNormal: [number, number, number],
    ): [number, number, number] | null =>
      core?.unprojectToPlane(x, y, planePoint, planeNormal) ?? null,
    captureThumbnail: (w?: number, h?: number) =>
      core?.captureThumbnail(w, h) ?? null,
    applyObjectOffsets: (offsets: Map<GroupId, ObjectOffset>) =>
      core?.applyObjectOffsets(offsets),
    getObjectOffsets: (): Map<GroupId, ObjectOffset> =>
      core?.getObjectOffsets() ?? new Map(),
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
