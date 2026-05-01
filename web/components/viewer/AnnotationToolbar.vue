<script lang="ts" setup>
/**
 * Top-of-timeline toolbar — Callout, Dimension, and Update scene buttons.
 *
 * The host wires the click handlers; this component just reflects the
 * current authoring mode/pickKind and the "can update scene" computed in
 * the button styling. Keeping the dynamic `:color` / `:variant` ladder out
 * of ModelTab's template trims a noisy 50-line block.
 */
import type { Mode, PickKind } from '~/composables/useAnnotationAuthor';

const props = defineProps<{
  hasActiveScene: boolean;
  mode: Mode;
  pickKind: PickKind | null;
  canUpdateScene: boolean;
}>();

const emit = defineEmits<{
  addCallout: [];
  addDimension: [];
  updateScene: [];
}>();

function isPicking(kind: PickKind): boolean {
  return props.mode === 'pick' && props.pickKind === kind;
}
</script>

<template>
  <div class="flex justify-end gap-2 px-3 pb-2">
    <UButton
      v-if="props.hasActiveScene"
      size="xs"
      :color="isPicking('callout') ? 'primary' : 'neutral'"
      :variant="isPicking('callout') ? 'solid' : 'soft'"
      icon="i-lucide-message-square-text"
      label="Callout"
      @click="emit('addCallout')"
    />
    <UButton
      v-if="props.hasActiveScene"
      size="xs"
      :color="isPicking('dimension') ? 'primary' : 'neutral'"
      :variant="isPicking('dimension') ? 'solid' : 'soft'"
      icon="i-lucide-ruler"
      label="Dimension"
      @click="emit('addDimension')"
    />
    <UButton
      v-if="props.canUpdateScene"
      size="xs"
      color="primary"
      variant="solid"
      label="Update scene"
      @click="emit('updateScene')"
    />
  </div>
</template>
