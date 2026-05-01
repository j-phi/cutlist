<script lang="ts" setup>
/**
 * Bottom-left popover with width/length/thickness/material for the part the
 * user is hovering or has selected. The host owns positioning and the
 * resolution from selection/hover state to a `BoardLayoutLeftover`.
 */
import type { BoardLayoutLeftover } from 'cutlist';

const props = defineProps<{
  part: BoardLayoutLeftover;
}>();

const formatDistance = useFormatDistance();
</script>

<template>
  <div
    class="bg-overlay backdrop-blur border border-subtle rounded-lg p-3 min-w-[200px]"
  >
    <p class="text-teal-400 font-bold text-lg mb-1">
      #{{ props.part.partNumber }} {{ props.part.name }}
    </p>
    <table class="text-sm text-body">
      <tbody>
        <tr>
          <td class="pr-3 text-muted">Width</td>
          <td>{{ formatDistance(props.part.widthM) }}</td>
        </tr>
        <tr>
          <td class="pr-3 text-muted">Length</td>
          <td>{{ formatDistance(props.part.lengthM) }}</td>
        </tr>
        <tr>
          <td class="pr-3 text-muted">Thickness</td>
          <td>{{ formatDistance(props.part.thicknessM) }}</td>
        </tr>
        <tr>
          <td class="pr-3 text-muted">Material</td>
          <td>{{ props.part.material }}</td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
