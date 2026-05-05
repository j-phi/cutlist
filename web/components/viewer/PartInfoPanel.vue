<script lang="ts" setup>
/**
 * Compact part readout — `#N Name  W × L × T` on a single line.
 */
import type { BoardLayoutLeftover } from 'cutlist';

const props = defineProps<{
  part: BoardLayoutLeftover;
}>();

const formatDistance = useFormatDistance();
</script>

<template>
  <div class="text-xs text-hi flex items-baseline gap-2 whitespace-nowrap">
    <span class="text-teal-400 font-semibold">
      #{{ props.part.partNumber }} {{ props.part.name }}
    </span>
    <span class="text-muted">
      {{ formatDistance(props.part.widthM) }}
      ×
      {{ formatDistance(props.part.lengthM) }}
      ×
      {{ formatDistance(props.part.thicknessM) }}
    </span>
  </div>
</template>
