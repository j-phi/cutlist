<script lang="ts" setup>
/**
 * Scenes strip — horizontal, sticks to the bottom of the canvas region.
 *
 * Header carries collapse toggle, label, and Capture button. Body is the
 * horizontal-scroll list of scene cards when expanded; collapsed state hides
 * the body.
 *
 * The active scene's card surfaces its own "Update" badge when `canUpdate`
 * is true (the host computes dirty state). Update is a property of "this
 * scene" — anchoring it on the card keeps the action next to the thing it
 * affects.
 *
 * Per-scene gestures: click to activate (parent tweens), drag to reorder,
 * double-click name to rename, hover trash to delete. Pinned ids cannot be
 * reordered, renamed, or deleted (used for the always-present "Default"
 * scene at index 0).
 */
import type { IdbScene } from '~/composables/useIdb';

const props = defineProps<{
  scenes: IdbScene[];
  activeSceneId: string | null;
  busy: boolean;
  pinnedIds?: string[];
  collapsed: boolean;
  canUpdateActive: boolean;
}>();

const emit = defineEmits<{
  select: [id: string];
  reorder: [id: string, toIndex: number];
  rename: [id: string, name: string];
  remove: [id: string];
  add: [];
  updateActive: [];
  'update:collapsed': [value: boolean];
}>();

const draggingId = ref<string | null>(null);
const editingId = ref<string | null>(null);

function isPinned(id: string): boolean {
  return props.pinnedIds?.includes(id) ?? false;
}

function onDragStart(id: string, e: DragEvent): void {
  if (isPinned(id)) {
    e.preventDefault();
    return;
  }
  draggingId.value = id;
  if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
}

function onDragOver(e: DragEvent): void {
  if (!draggingId.value) return;
  e.preventDefault();
  if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
}

function onDrop(targetId: string, e: DragEvent): void {
  e.preventDefault();
  if (!draggingId.value || draggingId.value === targetId) return;
  const targetIndex = props.scenes.findIndex((s) => s.id === targetId);
  if (targetIndex === -1) return;
  emit('reorder', draggingId.value, targetIndex);
  draggingId.value = null;
}

function onDragEnd(): void {
  draggingId.value = null;
}

function startRename(id: string): void {
  if (isPinned(id)) return;
  editingId.value = id;
  nextTick(() => {
    const el = document.getElementById(`scene-rename-${id}`);
    if (el instanceof HTMLInputElement) {
      el.focus();
      el.select();
    }
  });
}

function commitRename(id: string, name: string): void {
  const trimmed = name.trim();
  if (trimmed) emit('rename', id, trimmed);
  editingId.value = null;
}
</script>

<template>
  <div class="bg-base border-t border-subtle flex flex-col shrink-0">
    <!-- Header bar — collapse toggle, label, capture CTA. Always visible so
         the user can expand from any state. -->
    <div class="px-3 py-1.5 flex items-center gap-2 shrink-0">
      <button
        type="button"
        class="flex items-center gap-1.5 text-muted hover:text-hi transition-colors"
        :title="props.collapsed ? 'Expand scenes' : 'Collapse scenes'"
        @click="emit('update:collapsed', !props.collapsed)"
      >
        <UIcon
          :name="
            props.collapsed ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'
          "
          class="text-base"
        />
        <span class="text-xs font-medium tracking-wider">
          Scenes ({{ props.scenes.length }})
        </span>
      </button>
      <div class="ml-auto">
        <UButton
          size="xs"
          color="primary"
          variant="soft"
          icon="i-lucide-plus"
          label="Capture scene"
          :disabled="props.busy"
          @click="emit('add')"
        />
      </div>
    </div>

    <!-- Body — horizontal strip of cards. Hidden when collapsed. -->
    <div
      v-if="!props.collapsed"
      class="px-3 pb-3 pt-1 flex items-end gap-2 overflow-x-auto"
    >
      <div
        v-for="(scene, index) in props.scenes"
        :key="scene.id"
        :class="[
          'group relative shrink-0 w-32 rounded border transition-colors',
          scene.id === props.activeSceneId
            ? 'border-teal-400 bg-default'
            : 'border-subtle bg-default hover:border-default',
          draggingId === scene.id ? 'opacity-50' : '',
          props.busy ? 'pointer-events-none opacity-60' : 'cursor-pointer',
        ]"
        :draggable="!isPinned(scene.id)"
        @click="emit('select', scene.id)"
        @dragstart="(e) => onDragStart(scene.id, e)"
        @dragover="onDragOver"
        @drop="(e) => onDrop(scene.id, e)"
        @dragend="onDragEnd"
      >
        <div
          class="relative aspect-[4/3] rounded-t bg-base flex items-center justify-center text-dim text-xs overflow-hidden"
        >
          <img
            v-if="scene.thumbnailDataUrl"
            :src="scene.thumbnailDataUrl"
            :alt="scene.name"
            class="w-full h-full object-cover"
            draggable="false"
          />
          <UIcon v-else name="i-lucide-image" class="text-2xl" />

          <!-- Update overlay — sits on top of the active scene's thumbnail
               when the viewer state has drifted from what was captured.
               `stop` prevents the parent click-to-activate. -->
          <UButton
            v-if="scene.id === props.activeSceneId && props.canUpdateActive"
            size="xs"
            color="primary"
            variant="solid"
            icon="i-lucide-save"
            label="Update"
            class="absolute top-1 right-1"
            @click.stop="emit('updateActive')"
          />
        </div>
        <div
          class="px-2 py-1.5 flex items-center justify-between gap-1 min-h-9"
        >
          <input
            v-if="editingId === scene.id"
            :id="`scene-rename-${scene.id}`"
            :value="scene.name"
            class="bg-transparent border-0 outline-0 text-body text-xs w-full"
            @click.stop
            @blur="
              (e) =>
                commitRename(scene.id, (e.target as HTMLInputElement).value)
            "
            @keydown.enter="
              (e) =>
                commitRename(scene.id, (e.target as HTMLInputElement).value)
            "
            @keydown.escape="editingId = null"
          />
          <span
            v-else
            class="text-body text-xs truncate flex-1"
            @dblclick.stop="startRename(scene.id)"
          >
            {{ index + 1 }}. {{ scene.name }}
          </span>
          <UButton
            v-if="!isPinned(scene.id)"
            icon="i-lucide-trash-2"
            size="xs"
            variant="ghost"
            color="error"
            class="opacity-0 group-hover:opacity-100"
            @click.stop="emit('remove', scene.id)"
          />
        </div>
      </div>

      <span
        v-if="props.scenes.length === 0"
        class="text-xs text-dim italic px-2 py-3"
      >
        Capture the current view as a scene to start a sequence.
      </span>
    </div>
  </div>
</template>
