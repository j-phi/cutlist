<script lang="ts" setup>
import type { Precision, StockMatrix } from 'cutlist';

const props = defineProps<{
  modelValue: StockMatrix;
  distanceUnit: 'in' | 'mm';
  precision: Precision;
  /**
   * Another stock item uses the same name. Names are advisory labels shown on
   * the Layout page; a clash is surfaced as a warning, not auto-resolved.
   */
  duplicateName?: boolean;
  /** Distinct material categories across all stock, offered as suggestions. */
  materialOptions?: string[];
  /**
   * Enable offcut mode: passes `isOffcut` to SheetDimensions so each board
   * row shows a name field and a per-board quantity input.
   */
  showQuantity?: boolean;
  /** When true, a per-card "Manually enter costs" toggle appears next to the trash. */
  costsEnabled?: boolean;
}>();

const emit = defineEmits<{
  'update:modelValue': [next: StockMatrix];
  remove: [];
}>();

// Per-card cost visibility — only meaningful in offcut mode.
const showCosts = ref(false);

const isLinear = computed(() => props.modelValue.kind === 'linear');
const typeLabel = computed(() => (isLinear.value ? 'timber' : 'sheet'));

// Native datalist id must be unique per card so each input binds its own list.
const categoryListId = `stock-material-${useId()}`;

const name = computed(() => props.modelValue.name ?? '');

function onName(next: string) {
  emit('update:modelValue', { ...props.modelValue, name: next });
}

// Trim only on blur — mid-edit keystrokes pass through so we don't fight
// the user as they type "Pine " before adding the next word.
function commitName() {
  const trimmed = (props.modelValue.name ?? '').trim();
  if (trimmed !== props.modelValue.name) {
    emit('update:modelValue', { ...props.modelValue, name: trimmed });
  }
}

function onMaterial(material: string) {
  emit('update:modelValue', { ...props.modelValue, material });
}

function commitMaterial() {
  const trimmed = props.modelValue.material.trim();
  if (trimmed !== props.modelValue.material) {
    emit('update:modelValue', { ...props.modelValue, material: trimmed });
  }
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
        :model-value="name"
        class="flex-1"
        placeholder="Stock name"
        data-testid="stock-material-name"
        @update:model-value="onName"
        @blur="commitName"
      />
      <span
        class="text-[11px] uppercase tracking-wider text-dim font-medium"
        data-testid="stock-type-chip"
      >
        {{ typeLabel }}
      </span>
      <UButton
        v-if="showQuantity && costsEnabled"
        color="neutral"
        :variant="showCosts ? 'soft' : 'ghost'"
        icon="i-lucide-dollar-sign"
        size="sm"
        :title="showCosts ? 'Hide costs' : 'Manually enter costs'"
        data-testid="stock-costs-toggle"
        @click="showCosts = !showCosts"
      />
      <UButton
        color="neutral"
        variant="ghost"
        icon="i-lucide-trash-2"
        size="sm"
        data-testid="stock-remove"
        @click="emit('remove')"
      />
    </div>

    <div class="flex items-center gap-2">
      <label class="text-[11px] uppercase tracking-wider text-dim font-medium">
        Material
      </label>
      <UInput
        :model-value="modelValue.material"
        class="flex-1"
        placeholder="Material category, e.g. Plywood"
        data-testid="stock-material-category"
        :list="categoryListId"
        @update:model-value="onMaterial"
        @blur="commitMaterial"
      />
      <datalist :id="categoryListId">
        <option
          v-for="option in materialOptions ?? []"
          :key="option"
          :value="option"
        />
      </datalist>
    </div>

    <p
      v-if="duplicateName"
      class="text-xs text-amber-400"
      data-testid="stock-duplicate-warning"
    >
      Another stock item uses this name. Rename one so they stay easy to tell
      apart on the Layout page.
    </p>

    <LinearDimensions
      v-if="modelValue.kind === 'linear'"
      :model-value="modelValue"
      :distance-unit="distanceUnit"
      :precision="precision"
      :costs-enabled="costsEnabled"
      @update:model-value="(next) => emit('update:modelValue', next)"
    />
    <SheetDimensions
      v-else
      :model-value="modelValue"
      :distance-unit="distanceUnit"
      :precision="precision"
      :is-offcut="showQuantity"
      :show-costs="showQuantity ? showCosts : undefined"
      :costs-enabled="costsEnabled"
      @update:model-value="(next) => emit('update:modelValue', next)"
    />
  </div>
</template>
