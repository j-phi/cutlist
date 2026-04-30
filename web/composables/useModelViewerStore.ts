import type { GroupId, PartNumber } from '~/utils/types';

/**
 * Shared selection / hover state for the Model tab.
 *
 * Both axes are sets of `GroupId` — the canonical Object identity. Callers
 * that work in part-number terms (BOM rows) use `selectPart` / `hoverPart`
 * to fan a `PartNumber` out into the matching groupIds. The fan-out tables
 * are populated by the viewer adapter via `setPartIndex` whenever a model
 * loads.
 *
 * Going through a single axis means downstream consumers (the viewer, the
 * Objects panel, future annotation authoring) read one shape and never have
 * to reconcile a partNumber-driven selection with a groupId-driven one.
 */
export default createGlobalState(() => {
  const hoveredGroupIds = ref<Set<GroupId>>(new Set());
  const selectedGroupIds = ref<Set<GroupId>>(new Set());

  const partIndex = ref<Map<PartNumber, GroupId[]>>(new Map());
  const partNumberOfGroupId = ref<Map<GroupId, PartNumber>>(new Map());

  /**
   * Per-model "last viewed scene" memory. Keyed by `modelId`; each value is
   * the scene id active when the user last left that model (or null if no
   * scene was active). Used by `useSceneAuthor` to restore the timeline
   * position when the dropdown switches between models in the same project.
   *
   * Cleared on project switch by ModelTab — the map's keys are model ids,
   * which are stable per project. We don't persist this across reloads:
   * the user just gets a fresh start, same as the rest of viewer state.
   */
  const activeSceneByModel = ref<Map<string, string | null>>(new Map());

  function getActiveSceneForModel(modelId: string): string | null {
    return activeSceneByModel.value.get(modelId) ?? null;
  }

  function setActiveSceneForModel(
    modelId: string,
    sceneId: string | null,
  ): void {
    const next = new Map(activeSceneByModel.value);
    next.set(modelId, sceneId);
    activeSceneByModel.value = next;
  }

  function clearActiveSceneMemory(): void {
    if (activeSceneByModel.value.size === 0) return;
    activeSceneByModel.value = new Map();
  }

  function setPartIndex(byPart: Map<PartNumber, GroupId[]>): void {
    partIndex.value = byPart;
    const inv = new Map<GroupId, PartNumber>();
    for (const [pn, ids] of byPart) for (const id of ids) inv.set(id, pn);
    partNumberOfGroupId.value = inv;
  }

  function selectGroupIds(ids: Iterable<GroupId>): void {
    selectedGroupIds.value = new Set(ids);
  }

  function toggleGroupSelection(id: GroupId): void {
    const next = new Set(selectedGroupIds.value);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    selectedGroupIds.value = next;
  }

  function clearGroupSelection(): void {
    if (selectedGroupIds.value.size === 0) return;
    selectedGroupIds.value = new Set();
  }

  function setHoveredGroupIds(ids: Iterable<GroupId>): void {
    hoveredGroupIds.value = new Set(ids);
  }

  function selectPart(pn: PartNumber | null): void {
    if (pn == null) {
      clearGroupSelection();
      return;
    }
    selectGroupIds(partIndex.value.get(pn) ?? []);
  }

  function hoverPart(pn: PartNumber | null): void {
    setHoveredGroupIds(pn == null ? [] : (partIndex.value.get(pn) ?? []));
  }

  return {
    hoveredGroupIds,
    selectedGroupIds,
    partIndex,
    partNumberOfGroupId,
    activeSceneByModel,
    setPartIndex,
    selectGroupIds,
    toggleGroupSelection,
    clearGroupSelection,
    setHoveredGroupIds,
    selectPart,
    hoverPart,
    getActiveSceneForModel,
    setActiveSceneForModel,
    clearActiveSceneMemory,
  };
});
