<script lang="ts" setup>
const {
  bladeWidth,
  distanceUnit,
  margin,
  defaultAlgorithm,
  showPartNumbers,
  isLoading,
} = useProjectSettings();

useUnitConverter();

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
        >Blade ({{ distanceUnit }})</label
      >
      <UInput
        v-model="bladeWidth"
        type="number"
        min="0"
        step="0.00001"
        size="xs"
        class="w-20"
      />
    </div>

    <div class="flex items-center gap-1.5">
      <label class="text-xs text-muted whitespace-nowrap"
        >Margin ({{ distanceUnit }})</label
      >
      <UInput
        v-model="margin"
        type="number"
        min="0"
        step="0.00001"
        size="xs"
        class="w-20"
      />
    </div>

    <label class="flex items-center gap-1.5 cursor-pointer">
      <UCheckbox v-model="showPartNumbers" />
      <span class="text-xs text-muted whitespace-nowrap">Part #s</span>
    </label>
  </div>
</template>
