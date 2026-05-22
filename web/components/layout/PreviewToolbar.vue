<script lang="ts" setup>
import { useDimensionInput } from '~/composables/useDimensionInput';
import useBoardLayoutsQuery from '~/composables/useBoardLayoutsQuery';

const {
  bladeWidth,
  distanceUnit,
  margin,
  precision,
  showPartNumbers,
  showBomName,
  isLoading,
} = useProjectSettings();

const { manualMode, snapping } = useManualLayout();
const { isComputing, forceRecompute } = useBoardLayoutsQuery();

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

const settingsOpen = ref(false);
</script>

<template>
  <div v-if="!isLoading" class="relative flex items-center gap-3 flex-wrap">
    <!-- Optimize button -->
    <UButton
      size="xs"
      color="neutral"
      variant="soft"
      icon="i-lucide-sparkles"
      :loading="isComputing"
      data-testid="btn-optimize"
      @click="forceRecompute"
    >
      Optimize
    </UButton>

    <!-- Gear — optimization settings -->
    <UButton
      square
      size="xs"
      color="neutral"
      variant="ghost"
      icon="i-lucide-settings-2"
      title="Optimization settings"
      data-testid="btn-settings-gear"
      @click="settingsOpen = !settingsOpen"
    />

    <!-- Optimization settings popover -->
    <OptimizationSettingsPopover
      v-if="settingsOpen"
      @close="settingsOpen = false"
    />

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

    <label
      class="flex items-center gap-1.5 cursor-pointer"
      data-testid="toggle-part-numbers"
    >
      <UToggle v-model="showPartNumbers" size="xs" />
      <span class="text-xs text-muted whitespace-nowrap">Part #s</span>
    </label>

    <label
      class="flex items-center gap-1.5 cursor-pointer"
      data-testid="toggle-part-names"
    >
      <UToggle v-model="showBomName" size="xs" />
      <span class="text-xs text-muted whitespace-nowrap">Part names</span>
    </label>

    <div class="w-px h-4 bg-subtle shrink-0" />

    <label
      class="flex items-center gap-1.5 cursor-pointer"
      data-testid="toggle-manual-placement"
      title="Drag and drop parts between boards manually"
    >
      <UToggle v-model="manualMode" size="xs" />
      <span class="text-xs text-muted whitespace-nowrap">Manual placement</span>
    </label>

    <label
      class="flex items-center gap-1.5 cursor-pointer"
      data-testid="toggle-snapping"
      :class="{ 'opacity-50': !manualMode }"
    >
      <UToggle v-model="snapping" size="xs" :disabled="!manualMode" />
      <span class="text-xs text-muted whitespace-nowrap">Snapping</span>
    </label>
  </div>
</template>
