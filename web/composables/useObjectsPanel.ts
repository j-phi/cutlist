/**
 * Backing composable for the Objects panel. Reduces an `ObjectGraph` into a
 * Part → Object tree, manages collapse state, and forwards visibility /
 * reset actions to a `SceneAuthor`.
 *
 * The viewer renders one model at a time, so the graph's `groupId` and
 * `partNumber` values are used as-is — panel actions stay aligned with the
 * IDs the viewer's `ObjectRegistry` uses.
 */

import type { ComputedRef, Ref } from 'vue';
import type { GroupId, ObjectGraph, PartNumber } from '~/utils/types';
import type { SceneAuthor } from './useSceneAuthor';

export type PartVisibilityState = 'all' | 'none' | 'mixed';

export interface ObjectRow {
  groupId: GroupId;
  name: string;
  visible: boolean;
}

export interface PartGroup {
  partNumber: PartNumber;
  partName: string;
  objects: ObjectRow[];
}

export interface ObjectsPanelState {
  tree: ComputedRef<PartGroup[]>;
  collapsed: Ref<Set<PartNumber>>;
  isCollapsed(p: PartNumber): boolean;
  togglePartCollapse(p: PartNumber): void;
  togglePartVisibility(p: PartNumber): void;
  toggleObjectVisibility(g: GroupId): void;
  isObjectVisible(g: GroupId): boolean;
  partVisibilityState(p: PartNumber): PartVisibilityState;
  showAll(): void;
  hideAll(): void;
  resetAllPositions(): void;
}

/** Pure helper: classify a count of visible Objects within a part. */
export function partVisibility(
  visibleCount: number,
  total: number,
): PartVisibilityState {
  if (visibleCount === 0) return 'none';
  if (visibleCount >= total) return 'all';
  return 'mixed';
}

export function useObjectsPanel(
  graph: Ref<ObjectGraph | null>,
  sceneAuthor: SceneAuthor,
): ObjectsPanelState {
  const collapsed = ref<Set<PartNumber>>(new Set());

  const tree = computed<PartGroup[]>(() => {
    const g = graph.value;
    if (!g) return [];
    const partNames = new Map<PartNumber, string>();
    for (const p of g.parts) partNames.set(p.partNumber, p.name);

    const partNumbers = [...g.partIndex.keys()].sort((a, b) => a - b);
    const out: PartGroup[] = [];
    for (const pn of partNumbers) {
      const objects = g.partIndex.get(pn)!;
      out.push({
        partNumber: pn,
        partName: partNames.get(pn) ?? `Part #${pn}`,
        objects: objects.map((o) => ({
          groupId: o.groupId,
          name: o.name || partNames.get(pn) || `Part #${pn}`,
          visible: isObjectVisible(o.groupId),
        })),
      });
    }
    return out;
  });

  function isObjectVisible(g: GroupId): boolean {
    const set = sceneAuthor.visibleObjects.value;
    if (set === null) return true;
    return set.has(g);
  }

  function partVisibilityState(p: PartNumber): PartVisibilityState {
    const objects = graph.value?.partIndex.get(p) ?? [];
    let visible = 0;
    for (const o of objects) if (isObjectVisible(o.groupId)) visible++;
    return partVisibility(visible, objects.length);
  }

  function togglePartCollapse(p: PartNumber): void {
    const next = new Set(collapsed.value);
    if (next.has(p)) next.delete(p);
    else next.add(p);
    collapsed.value = next;
  }

  function togglePartVisibility(p: PartNumber): void {
    const objects = graph.value?.partIndex.get(p) ?? [];
    const ids = objects.map((o) => o.groupId);
    const state = partVisibilityState(p);
    sceneAuthor.setObjectsVisibility(ids, state !== 'all');
  }

  function toggleObjectVisibility(g: GroupId): void {
    sceneAuthor.toggleObjectVisibility(g);
  }

  function showAll(): void {
    sceneAuthor.showAllObjects();
  }

  function hideAll(): void {
    sceneAuthor.hideAllObjects();
  }

  function resetAllPositions(): void {
    sceneAuthor.resetAllOffsets();
  }

  function isCollapsed(p: PartNumber): boolean {
    return collapsed.value.has(p);
  }

  return {
    tree,
    collapsed,
    isCollapsed,
    togglePartCollapse,
    togglePartVisibility,
    toggleObjectVisibility,
    isObjectVisible,
    partVisibilityState,
    showAll,
    hideAll,
    resetAllPositions,
  };
}
