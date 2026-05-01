<script lang="ts" setup>
/**
 * Bottom strip showing the project's scene sequence. Click a card to activate
 * (parent tweens the canvas to it); drag to reorder; double-click to rename;
 * trash button on hover deletes; trailing "+ Add scene" captures the current
 * viewer state into a new scene.
 *
 * Pinned ids cannot be reordered, renamed, or deleted — used for the always-
 * present "Default" scene that lives at index 0.
 */
import type { IdbScene } from '~/composables/useIdb';

const props = defineProps<{
  scenes: IdbScene[];
  activeSceneId: string | null;
  busy: boolean;
  pinnedIds?: string[];
}>();

const emit = defineEmits<{
  select: [id: string];
  reorder: [id: string, toIndex: number];
  rename: [id: string, name: string];
  remove: [id: string];
  add: [];
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
  <div
    class="bg-overlay backdrop-blur border-t border-subtle px-3 py-2 flex items-end gap-2 overflow-x-auto"
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
        class="aspect-[4/3] rounded-t bg-base flex items-center justify-center text-dim text-xs overflow-hidden"
      >
        <img
          v-if="scene.thumbnailDataUrl"
          :src="scene.thumbnailDataUrl"
          :alt="scene.name"
          class="w-full h-full object-cover"
          draggable="false"
        />
        <UIcon v-else name="i-lucide-image" class="text-2xl" />
      </div>
      <div class="px-2 py-1.5 flex items-center justify-between gap-1">
        <input
          v-if="editingId === scene.id"
          :id="`scene-rename-${scene.id}`"
          :value="scene.name"
          class="bg-transparent border-0 outline-0 text-body text-xs w-full"
          @click.stop
          @blur="
            (e) => commitRename(scene.id, (e.target as HTMLInputElement).value)
          "
          @keydown.enter="
            (e) => commitRename(scene.id, (e.target as HTMLInputElement).value)
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

    <button
      type="button"
      :disabled="props.busy"
      :class="[
        'shrink-0 w-32 aspect-[4/3] rounded border border-dashed flex items-center justify-center gap-1 transition-colors',
        props.busy
          ? 'border-subtle text-dim'
          : 'border-default text-muted hover:text-hi hover:border-teal-400',
      ]"
      @click="emit('add')"
    >
      <UIcon name="i-lucide-plus" />
      <span class="text-xs">Add scene</span>
    </button>
  </div>
</template>
