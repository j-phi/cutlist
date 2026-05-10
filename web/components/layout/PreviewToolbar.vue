<script lang="ts" setup>
import { useDimensionInput } from '~/composables/useDimensionInput';

const {
  bladeWidth,
  distanceUnit,
  margin,
  precision,
  defaultAlgorithm,
  showPartNumbers,
  isLoading,
} = useProjectSettings();

const unit = computed<'mm' | 'in'>(() => distanceUnit.value ?? 'mm');

const { input: bladeInput, commit: commitBlade } = useDimensionInput(
  bladeWidth,
  unit,
  precision,
);
const { input: marginInput, commit: commitMargin } = useDimensionInput(
  margin,
  unit,
  precision,
);

const ALGORITHM_ITEMS = [
  { label: 'Auto', value: 'auto' },
  { label: 'Tidy', value: 'tidy' },
  { label: 'Compact', value: 'compact' },
  { label: 'CNC', value: 'cnc' },
];
</script>

<template>
  <div v-if="!isLoading" class="flex items-center gap-3 flex-wrap">
    <div class="flex items-center gap-1.5">
      <label class="text-xs text-muted whitespace-nowrap">Default cut</label>
      <USelect
        v-model="defaultAlgorithm"
        :items="ALGORITHM_ITEMS"
        size="xs"
        class="w-24"
      />
    </div>

    <div class="flex items-center gap-1.5">
      <label class="text-xs text-muted whitespace-nowrap"
        >Blade ({{ unit }})</label
      >
      <UInput
        v-model="bladeInput"
        type="text"
        size="xs"
        class="w-20"
        @blur="commitBlade"
      />
    </div>

    <div class="flex items-center gap-1.5">
      <label class="text-xs text-muted whitespace-nowrap"
        >Margin ({{ unit }})</label
      >
      <UInput
        v-model="marginInput"
        type="text"
        size="xs"
        class="w-20"
        @blur="commitMargin"
      />
    </div>

    <label class="flex items-center gap-1.5 cursor-pointer">
      <UCheckbox v-model="showPartNumbers" />
      <span class="text-xs text-muted whitespace-nowrap">Part #s</span>
    </label>
  </div>
</template>
