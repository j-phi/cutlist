<script lang="ts" setup>
import { useDimensionInput } from '~/composables/useDimensionInput';
import useBoardLayoutsQuery from '~/composables/useBoardLayoutsQuery';

const props = defineProps<{ showUnused?: boolean }>();
const emit = defineEmits<{ 'update:showUnused': [value: boolean] }>();

const {
  bladeWidth,
  distanceUnit,
  margin,
  precision,
  showPartNumbers,
  showBomName,
  isLoading,
  stocks,
  layoutAlignH,
  layoutAlignV,
} = useProjectSettings();

// Alignment is a sheet-only concept: linear (1D) stock has no 2D corner to
// align to. Hide both alignment controls when every stock entry is linear
// (FR-ALN-7). An empty stock list keeps them hidden too — nothing to lay out.
const showAlignControls = computed(() => {
  const list = stocks.value ?? [];
  return list.some((s) => s.kind === 'sheet');
});

const { manualMode, snapping, pushOptimizeEntry } = useManualLayout();
const { isComputing, captureAndRecompute } = useBoardLayoutsQuery();

function handleOptimize() {
  captureAndRecompute(pushOptimizeEntry);
}

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
  <div v-if="!isLoading" class="relative flex flex-col gap-2">
    <!-- Row 1: Optimize / Settings / Blade / Margin -->
    <div class="flex items-center gap-3">
      <UButton
        size="xs"
        color="neutral"
        variant="soft"
        icon="i-lucide-sparkles"
        :loading="isComputing"
        data-testid="btn-optimize"
        @click="handleOptimize"
      >
        Optimize
      </UButton>

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
    </div>

    <!-- Row 2: Toggles -->
    <div class="flex items-center gap-3">
      <USwitch
        v-model="showPartNumbers"
        size="xs"
        label="Part #s"
        data-testid="toggle-part-numbers"
      />

      <USwitch
        v-model="showBomName"
        size="xs"
        label="Part names"
        data-testid="toggle-part-names"
      />

      <div class="w-px h-4 bg-subtle shrink-0" />

      <USwitch
        v-model="manualMode"
        size="xs"
        label="Manual placement"
        title="Drag and drop parts between boards manually"
        data-testid="toggle-manual-placement"
      />

      <USwitch
        v-model="snapping"
        size="xs"
        label="Snapping"
        :disabled="!manualMode"
        :class="{ 'opacity-50': !manualMode }"
        data-testid="toggle-snapping"
      />

      <div class="w-px h-4 bg-subtle shrink-0" />

      <USwitch
        :model-value="props.showUnused ?? false"
        size="xs"
        label="Unused offcuts"
        title="Show offcuts from your inventory that weren't needed in the layout"
        data-testid="toggle-show-unused"
        @update:model-value="emit('update:showUnused', $event)"
      />

      <template v-if="showAlignControls">
        <div class="w-px h-4 bg-subtle shrink-0" />

        <div
          class="flex items-center gap-1.5"
          data-testid="align-controls"
          aria-label="Layout alignment"
        >
          <span class="text-xs text-muted whitespace-nowrap">Align</span>

          <UButton
            size="xs"
            color="neutral"
            :variant="layoutAlignH === 'left' ? 'soft' : 'ghost'"
            icon="i-lucide-align-horizontal-justify-start"
            title="Align parts to the left edge"
            data-testid="align-left"
            @click="layoutAlignH = 'left'"
          />
          <UButton
            size="xs"
            color="neutral"
            :variant="layoutAlignH === 'right' ? 'soft' : 'ghost'"
            icon="i-lucide-align-horizontal-justify-end"
            title="Align parts to the right edge"
            data-testid="align-right"
            @click="layoutAlignH = 'right'"
          />

          <UButton
            size="xs"
            color="neutral"
            :variant="layoutAlignV === 'top' ? 'soft' : 'ghost'"
            icon="i-lucide-align-vertical-justify-start"
            title="Align parts to the top edge"
            data-testid="align-top"
            @click="layoutAlignV = 'top'"
          />
          <UButton
            size="xs"
            color="neutral"
            :variant="layoutAlignV === 'bottom' ? 'soft' : 'ghost'"
            icon="i-lucide-align-vertical-justify-end"
            title="Align parts to the bottom edge"
            data-testid="align-bottom"
            @click="layoutAlignV = 'bottom'"
          />
        </div>
      </template>
    </div>
  </div>
</template>
