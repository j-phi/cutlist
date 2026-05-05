<script lang="ts" setup>
/**
 * Top-center pill toolbar — gizmo Move/Rotate (when a selection is active)
 * plus Callout / Dimension. In pick mode the buttons collapse and the hint
 * text takes their place — keeps the toolbar's spot in the layout instead
 * of spawning a second floating panel.
 */
import type { Mode, PickKind } from '~/composables/useAnnotationAuthor';
import type { GizmoMode } from '~/lib/viewer/types';

const props = defineProps<{
  hasActiveScene: boolean;
  mode: Mode;
  pickKind: PickKind | null;
  pickHint: string | null;
  hasSelection: boolean;
  gizmoMode: GizmoMode;
}>();

const emit = defineEmits<{
  addCallout: [];
  addDimension: [];
  'update:gizmoMode': [mode: GizmoMode];
}>();

function isPicking(kind: PickKind): boolean {
  return props.mode === 'pick' && props.pickKind === kind;
}

const isPickMode = computed(() => props.mode === 'pick' && !!props.pickHint);
</script>

<template>
  <div
    class="bg-overlay backdrop-blur border border-subtle rounded-full px-1.5 py-1 flex items-center gap-1 shadow-lg"
  >
    <template v-if="isPickMode">
      <span class="px-3 py-1 text-sm text-body">{{ props.pickHint }}</span>
    </template>
    <template v-else>
      <UButton
        v-if="props.hasSelection"
        size="xs"
        :color="props.gizmoMode === 'translate' ? 'primary' : 'neutral'"
        :variant="props.gizmoMode === 'translate' ? 'solid' : 'ghost'"
        icon="i-lucide-move"
        label="Move"
        @click="emit('update:gizmoMode', 'translate')"
      />
      <UButton
        v-if="props.hasSelection"
        size="xs"
        :color="props.gizmoMode === 'rotate' ? 'primary' : 'neutral'"
        :variant="props.gizmoMode === 'rotate' ? 'solid' : 'ghost'"
        icon="i-lucide-rotate-3d"
        label="Rotate"
        @click="emit('update:gizmoMode', 'rotate')"
      />
      <span
        v-if="props.hasSelection && props.hasActiveScene"
        class="w-px h-5 bg-subtle mx-1"
        aria-hidden="true"
      />
      <UButton
        v-if="props.hasActiveScene"
        size="xs"
        :color="isPicking('callout') ? 'primary' : 'neutral'"
        :variant="isPicking('callout') ? 'solid' : 'ghost'"
        icon="i-lucide-message-square-text"
        label="Callout"
        @click="emit('addCallout')"
      />
      <UButton
        v-if="props.hasActiveScene"
        size="xs"
        :color="isPicking('dimension') ? 'primary' : 'neutral'"
        :variant="isPicking('dimension') ? 'solid' : 'ghost'"
        icon="i-lucide-ruler"
        label="Dimension"
        @click="emit('addDimension')"
      />
    </template>
  </div>
</template>
