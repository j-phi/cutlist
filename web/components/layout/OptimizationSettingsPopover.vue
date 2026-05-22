<script lang="ts" setup>
const emit = defineEmits<{ close: [] }>();

const { defaultAlgorithm } = useProjectSettings();

const {
  passOrder,
  enabledPasses,
  togglePass,
  reorderPass,
  resetToDefaults,
  PASS_LABELS,
} = useOptimizationSettings();

const ALGORITHM_ITEMS = [
  { label: 'Auto', value: 'auto' },
  { label: 'Tidy', value: 'tidy' },
  { label: 'Compact', value: 'compact' },
  { label: 'CNC', value: 'cnc' },
];

// Drag-and-drop state
let dragPassId = '';

function onDragStart(index: number) {
  dragPassId = passOrder.value[index] ?? '';
}

function onDragOver(e: DragEvent, toIndex: number) {
  e.preventDefault();
  if (!dragPassId) return;
  const fromIndex = passOrder.value.indexOf(dragPassId);
  if (fromIndex === -1 || fromIndex === toIndex) return;
  reorderPass(fromIndex, toIndex);
}

function onDrop(e: DragEvent) {
  e.preventDefault();
  dragPassId = '';
}

function onDragEnd() {
  dragPassId = '';
}
</script>

<template>
  <div
    class="absolute top-full left-0 mt-1 z-50 bg-elevated border border-default rounded-lg shadow-xl w-96 p-4 flex flex-col gap-4"
  >
    <!-- Header -->
    <div class="flex items-center justify-between">
      <span class="text-sm font-medium text-hi">Optimization settings</span>
      <UButton
        square
        size="xs"
        color="neutral"
        variant="ghost"
        icon="i-lucide-x"
        data-testid="btn-close"
        @click="emit('close')"
      />
    </div>

    <!-- Default algorithm -->
    <div class="flex items-center gap-2">
      <label class="text-xs text-muted whitespace-nowrap"
        >Default algorithm</label
      >
      <USelect
        v-model="defaultAlgorithm"
        :items="ALGORITHM_ITEMS"
        size="xs"
        class="flex-1"
      />
    </div>

    <!-- Search passes -->
    <div class="flex flex-col gap-1">
      <div class="text-xs text-muted font-medium mb-1">Search passes</div>

      <div
        v-for="(passId, index) in passOrder"
        :key="passId"
        :data-testid="`pass-row-${passId}`"
        class="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-surface cursor-grab active:cursor-grabbing"
        draggable="true"
        @dragstart="onDragStart(index)"
        @dragover="(e) => onDragOver(e, index)"
        @drop="onDrop"
        @dragend="onDragEnd"
      >
        <!-- Drag handle -->
        <span class="text-dim shrink-0 cursor-grab">
          <svg width="10" height="14" viewBox="0 0 10 14" fill="currentColor">
            <circle cx="2" cy="2" r="1.5" />
            <circle cx="8" cy="2" r="1.5" />
            <circle cx="2" cy="7" r="1.5" />
            <circle cx="8" cy="7" r="1.5" />
            <circle cx="2" cy="12" r="1.5" />
            <circle cx="8" cy="12" r="1.5" />
          </svg>
        </span>

        <!-- Toggle -->
        <input
          :data-testid="`pass-toggle-${passId}`"
          type="checkbox"
          :checked="enabledPasses.has(passId)"
          :disabled="enabledPasses.has(passId) && enabledPasses.size <= 1"
          class="shrink-0"
          @change="togglePass(passId)"
        />

        <!-- Label -->
        <span class="text-xs text-body leading-tight">
          {{ PASS_LABELS[passId]?.label ?? passId }}
        </span>
      </div>
    </div>

    <!-- Reset -->
    <div class="border-t border-subtle pt-3">
      <UButton
        size="xs"
        color="neutral"
        variant="soft"
        data-testid="btn-reset"
        @click="resetToDefaults"
      >
        Reset to defaults
      </UButton>
    </div>
  </div>
</template>
