<script lang="ts" setup>
/**
 * Two-button translate / rotate selector for the transform gizmo. Only
 * mounted when there's an active selection. The host owns positioning and
 * the visibility gate.
 */
import type { GizmoMode } from '~/lib/viewer/types';

const props = defineProps<{
  mode: GizmoMode;
}>();

const emit = defineEmits<{
  'update:mode': [mode: GizmoMode];
}>();
</script>

<template>
  <div
    class="bg-overlay backdrop-blur border border-subtle rounded-lg p-1 flex gap-1"
  >
    <UButton
      size="xs"
      :color="props.mode === 'translate' ? 'primary' : 'neutral'"
      :variant="props.mode === 'translate' ? 'soft' : 'ghost'"
      icon="i-lucide-move"
      label="Move"
      @click="emit('update:mode', 'translate')"
    />
    <UButton
      size="xs"
      :color="props.mode === 'rotate' ? 'primary' : 'neutral'"
      :variant="props.mode === 'rotate' ? 'soft' : 'ghost'"
      icon="i-lucide-rotate-3d"
      label="Rotate"
      @click="emit('update:mode', 'rotate')"
    />
  </div>
</template>
