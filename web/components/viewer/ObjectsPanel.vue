<script lang="ts" setup>
/**
 * Two-level Part → Object tree. Mirrors how the cut-list represents
 * furniture: a "drawer side" Part is one logical thing with N rigid-body
 * Object instances scattered across the assembly. Groups by Part to stay
 * scannable at 200+ Objects, with both Part-level and Object-level
 * visibility toggles. Renders just the body — outer panel chrome is
 * provided by `ViewerSidePanel`.
 */
import type { GroupId, ObjectGraph, PartNumber } from '~/utils/types';
import { useObjectsPanel, type PartGroup } from '~/composables/useObjectsPanel';
import type { SceneAuthor } from '~/composables/useSceneAuthor';

const props = defineProps<{
  graph: ObjectGraph | null;
  author: SceneAuthor;
}>();

const store = useModelViewerStore();

const graphRef = computed(() => props.graph);
const panel = useObjectsPanel(graphRef, props.author);

function partEyeIcon(p: PartNumber): string {
  switch (panel.partVisibilityState(p)) {
    case 'all':
      return 'i-lucide-eye';
    case 'none':
      return 'i-lucide-eye-off';
    case 'mixed':
      return 'i-lucide-eye-closed';
  }
}

function partEyeClass(p: PartNumber): string {
  return panel.partVisibilityState(p) === 'mixed'
    ? 'text-teal-400'
    : 'text-muted';
}

function isObjectSelected(gid: GroupId): boolean {
  return store.selectedGroupIds.value.has(gid);
}

function isPartActive(part: PartGroup): boolean {
  return (
    part.objects.length > 0 &&
    part.objects.every((o) => isObjectSelected(o.groupId))
  );
}

function onPartClick(part: PartGroup, e: MouseEvent) {
  const ids = part.objects.map((o) => o.groupId);
  if (e.shiftKey) {
    const next = new Set(store.selectedGroupIds.value);
    const allIn = ids.every((id) => next.has(id));
    for (const id of ids) {
      if (allIn) next.delete(id);
      else next.add(id);
    }
    store.selectGroupIds(next);
  } else {
    if (isPartActive(part)) store.clearGroupSelection();
    else store.selectGroupIds(ids);
  }
}

function onPartHover(part: PartGroup | null) {
  store.hoverPart(part ? part.partNumber : null);
}

function onObjectHover(gid: GroupId | null) {
  store.setHoveredGroupIds(gid == null ? [] : [gid]);
}

function onObjectClick(gid: GroupId, e: MouseEvent) {
  if (e.shiftKey) {
    store.toggleGroupSelection(gid);
  } else {
    if (
      store.selectedGroupIds.value.size === 1 &&
      store.selectedGroupIds.value.has(gid)
    ) {
      store.clearGroupSelection();
    } else {
      store.selectGroupIds([gid]);
    }
  }
}
</script>

<template>
  <div
    v-if="panel.tree.value.length > 0"
    class="px-2 py-1.5 border-b border-subtle flex items-center gap-1 shrink-0"
  >
    <UButton
      size="xs"
      variant="ghost"
      color="neutral"
      icon="i-lucide-rotate-ccw"
      title="Reset all positions"
      @click="panel.resetAllPositions()"
    />
    <UButton
      size="xs"
      variant="ghost"
      color="neutral"
      icon="i-lucide-eye"
      title="Show all"
      @click="panel.showAll()"
    />
    <UButton
      size="xs"
      variant="ghost"
      color="neutral"
      icon="i-lucide-eye-off"
      title="Hide all"
      @click="panel.hideAll()"
    />
  </div>

  <div v-if="panel.tree.value.length === 0" class="p-3 text-xs text-dim">
    Load a model to list its objects.
  </div>

  <div v-else class="overflow-y-auto flex-1 min-h-0">
    <div
      v-for="part in panel.tree.value"
      :key="part.partNumber"
      class="border-b border-subtle last:border-b-0"
    >
      <div
        :class="[
          'flex items-center gap-1 px-2 py-1.5 cursor-pointer border-l-2',
          isPartActive(part)
            ? 'bg-teal-400/25 border-teal-400'
            : 'border-transparent hover:bg-default/40',
        ]"
        @click="(e) => onPartClick(part, e)"
        @mouseenter="onPartHover(part)"
        @mouseleave="onPartHover(null)"
      >
        <button
          type="button"
          class="shrink-0 p-0.5 -ml-0.5 rounded hover:bg-elevated"
          :title="panel.isCollapsed(part.partNumber) ? 'Expand' : 'Collapse'"
          @click.stop="panel.togglePartCollapse(part.partNumber)"
        >
          <UIcon
            :name="
              panel.isCollapsed(part.partNumber)
                ? 'i-lucide-chevron-right'
                : 'i-lucide-chevron-down'
            "
            class="text-muted text-base"
          />
        </button>
        <span
          :class="[
            'text-sm flex-1 truncate',
            isPartActive(part) ? 'text-teal-200' : 'text-body',
          ]"
        >
          {{ part.partName }}
          <span v-if="part.objects.length > 1" class="text-dim">
            ({{ part.objects.length }})
          </span>
        </span>
        <button
          type="button"
          class="shrink-0 p-1 rounded hover:bg-elevated"
          :title="
            panel.partVisibilityState(part.partNumber) === 'all'
              ? 'Hide all'
              : 'Show all'
          "
          @click.stop="panel.togglePartVisibility(part.partNumber)"
        >
          <UIcon
            :name="partEyeIcon(part.partNumber)"
            :class="['text-base', partEyeClass(part.partNumber)]"
          />
        </button>
      </div>

      <div v-if="!panel.isCollapsed(part.partNumber)">
        <div
          v-for="obj in part.objects"
          :key="obj.groupId"
          :class="[
            'flex items-center gap-1 pl-7 pr-2 py-1 cursor-pointer border-l-2',
            !obj.visible ? 'opacity-50' : '',
            isObjectSelected(obj.groupId)
              ? 'bg-teal-400/25 border-teal-400'
              : 'border-transparent hover:bg-default/40',
          ]"
          @click="(e) => onObjectClick(obj.groupId, e)"
          @mouseenter="onObjectHover(obj.groupId)"
          @mouseleave="onObjectHover(null)"
        >
          <span
            :class="[
              'text-xs flex-1 truncate',
              isObjectSelected(obj.groupId) ? 'text-teal-200' : 'text-body',
            ]"
          >
            {{ obj.name }}
          </span>
          <button
            type="button"
            class="shrink-0 p-1 rounded hover:bg-elevated"
            :title="obj.visible ? 'Hide' : 'Show'"
            @click.stop="panel.toggleObjectVisibility(obj.groupId)"
          >
            <UIcon
              :name="obj.visible ? 'i-lucide-eye' : 'i-lucide-eye-off'"
              class="text-muted text-base"
            />
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
