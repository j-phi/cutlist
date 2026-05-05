<script lang="ts" setup>
/**
 * Bottom status bar — thin informational row underneath the canvas. Shows
 * the active part readout when something's hovered or selected, otherwise
 * an idle hint.
 */
import type { BoardLayoutLeftover } from 'cutlist';
import PartInfoPanel from '~/components/viewer/PartInfoPanel.vue';

const props = defineProps<{
  part: BoardLayoutLeftover | null;
}>();
</script>

<template>
  <div
    class="bg-overlay backdrop-blur border-t border-subtle px-3 py-1.5 flex items-center gap-3 text-xs min-h-[32px]"
  >
    <PartInfoPanel v-if="props.part" :part="props.part" />
    <span v-else class="text-dim italic">
      Hover or select a part to view its dimensions.
    </span>
  </div>
</template>
