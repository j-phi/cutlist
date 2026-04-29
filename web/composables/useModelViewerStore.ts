import type { GroupId } from '~/utils/types';

export default createGlobalState(() => {
  // Part-level state — drives the BOM ↔ viewer linkage. A partNumber set
  // here fans to every Object that shares the partNumber.
  const hoveredPartNumber = ref<number | null>(null);
  const selectedPartNumber = ref<number | null>(null);

  // Object-level state — drives the Objects panel and (later) annotation
  // authoring. The viewer takes the union of these and the partNumber fan.
  const hoveredGroupId = ref<GroupId | null>(null);
  const selectedGroupIds = ref<Set<GroupId>>(new Set());

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

  return {
    hoveredPartNumber,
    selectedPartNumber,
    hoveredGroupId,
    selectedGroupIds,
    selectGroupIds,
    toggleGroupSelection,
    clearGroupSelection,
  };
});
