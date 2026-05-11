<script lang="ts" setup>
import type { Precision, StockMatrix } from 'cutlist';

const props = defineProps<{
  modelValue: StockMatrix;
  distanceUnit: 'in' | 'mm';
  precision: Precision;
  /**
   * Another stock row uses the same material name. Materials are name-keyed
   * across the app, so colliding names silently break stock→part grouping.
   */
  duplicateName?: boolean;
}>();

const emit = defineEmits<{
  'update:modelValue': [next: StockMatrix];
  remove: [];
}>();

const isLinear = computed(() => props.modelValue.kind === 'linear');
const typeLabel = computed(() => (isLinear.value ? 'timber' : 'sheet'));

function onMaterial(name: string) {
  emit('update:modelValue', { ...props.modelValue, material: name });
}

function onColor(color: string | undefined) {
  emit('update:modelValue', { ...props.modelValue, color });
}
</script>

<template>
  <div
    class="rounded-lg border bg-surface p-4 flex flex-col gap-3"
    :class="duplicateName ? 'border-amber-500/60' : 'border-default'"
    :data-testid="`stock-card-${typeLabel}`"
  >
    <div class="flex items-center gap-2">
      <MaterialColorPicker
        :model-value="modelValue.color"
        @update:model-value="onColor"
      />
      <UInput
        :model-value="modelValue.material"
        class="flex-1"
        placeholder="Material name"
        data-testid="stock-material-name"
        @update:model-value="onMaterial"
      />
      <span
        class="text-[11px] uppercase tracking-wider text-dim font-medium"
        data-testid="stock-type-chip"
      >
        {{ typeLabel }}
      </span>
      <UButton
        color="neutral"
        variant="ghost"
        icon="i-lucide-trash-2"
        size="sm"
        data-testid="stock-remove"
        @click="emit('remove')"
      />
    </div>

    <p
      v-if="duplicateName"
      class="text-xs text-amber-400"
      data-testid="stock-duplicate-warning"
    >
      Another stock row uses this material name. Rename one so parts route to
      the right material.
    </p>

    <LinearDimensions
      v-if="modelValue.kind === 'linear'"
      :model-value="modelValue"
      :distance-unit="distanceUnit"
      :precision="precision"
      @update:model-value="(next) => emit('update:modelValue', next)"
    />
    <SheetDimensions
      v-else
      :model-value="modelValue"
      :distance-unit="distanceUnit"
      :precision="precision"
      @update:model-value="(next) => emit('update:modelValue', next)"
    />
  </div>
</template>
