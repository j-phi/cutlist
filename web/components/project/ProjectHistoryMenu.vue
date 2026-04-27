<script lang="ts" setup>
import { ref } from 'vue';
import type { ArchivedProjectItem } from '~/composables/useProjects';
import { formatArchivedDate } from '~/utils/formatArchivedDate';

defineProps<{
  archived: ArchivedProjectItem[];
}>();

const emit = defineEmits<{
  (e: 'restore', id: string): void;
  (e: 'permanently-delete', id: string): void;
  (e: 'clear'): void;
  (e: 'reset'): void;
}>();

const pendingDeleteId = ref<string | null>(null);
const showClearConfirm = ref(false);

function onRestore(id: string) {
  emit('restore', id);
}

function onDeleteClick(id: string) {
  if (pendingDeleteId.value === id) {
    pendingDeleteId.value = null;
    emit('permanently-delete', id);
  } else {
    pendingDeleteId.value = id;
  }
}

function cancelDelete() {
  pendingDeleteId.value = null;
}

function onClearClick() {
  if (showClearConfirm.value) {
    showClearConfirm.value = false;
    emit('clear');
  } else {
    showClearConfirm.value = true;
  }
}

function cancelClear() {
  showClearConfirm.value = false;
}

const showResetConfirm = ref(false);

function onResetClick() {
  if (showResetConfirm.value) {
    showResetConfirm.value = false;
    emit('reset');
  } else {
    showResetConfirm.value = true;
  }
}

function cancelReset() {
  showResetConfirm.value = false;
}
</script>

<template>
  <div>
    <div
      v-if="archived.length === 0"
      class="px-4 py-6 text-sm text-muted text-center"
    >
      No closed projects
    </div>
    <ul v-else class="max-h-72 overflow-y-auto">
      <li
        v-for="p in archived"
        :key="p.id"
        class="flex items-center gap-2 px-3 py-2 border-b border-subtle last:border-0 hover:bg-surface group"
      >
        <div class="flex-1 min-w-0">
          <div class="text-sm text-body truncate">{{ p.name }}</div>
          <div class="text-xs text-muted">
            {{ formatArchivedDate(p.archivedAt) }}
          </div>
        </div>
        <template v-if="pendingDeleteId === p.id">
          <UButton
            size="xs"
            color="neutral"
            variant="ghost"
            label="Cancel"
            @click="cancelDelete"
          />
          <UButton
            size="xs"
            color="error"
            variant="solid"
            label="Delete"
            @click="onDeleteClick(p.id)"
          />
        </template>
        <template v-else>
          <UButton
            size="xs"
            icon="i-lucide-undo-2"
            color="neutral"
            variant="ghost"
            title="Reopen"
            @click="onRestore(p.id)"
          />
          <UButton
            size="xs"
            icon="i-lucide-trash-2"
            color="error"
            variant="ghost"
            title="Delete permanently"
            @click="onDeleteClick(p.id)"
          />
        </template>
      </li>
    </ul>
    <div
      v-if="archived.length > 0"
      class="px-3 py-2 border-t border-subtle flex justify-end items-center gap-2"
    >
      <template v-if="showClearConfirm">
        <span class="text-xs text-muted">Delete all?</span>
        <button
          class="text-xs text-muted hover:text-white transition-colors"
          @click="cancelClear"
        >
          Cancel
        </button>
        <button
          class="text-xs text-red-400 hover:text-red-300 font-medium transition-colors"
          @click="onClearClick"
        >
          Confirm
        </button>
      </template>
      <button
        v-else
        class="text-xs text-muted hover:text-red-400 transition-colors"
        @click="onClearClick"
      >
        Clear history
      </button>
    </div>
    <div
      class="px-3 py-2 border-t border-subtle flex justify-end items-center gap-2"
    >
      <template v-if="showResetConfirm">
        <span class="text-xs text-muted">Delete everything?</span>
        <button
          class="text-xs text-muted hover:text-white transition-colors"
          @click="cancelReset"
        >
          Cancel
        </button>
        <button
          class="text-xs text-red-400 hover:text-red-300 font-medium transition-colors"
          @click="onResetClick"
        >
          Confirm
        </button>
      </template>
      <button
        v-else
        class="text-xs text-muted hover:text-red-400 transition-colors"
        @click="onResetClick"
      >
        Reset database
      </button>
    </div>
  </div>
</template>
