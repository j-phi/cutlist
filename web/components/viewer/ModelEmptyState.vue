<script lang="ts" setup>
/**
 * Centered empty-state overlay for the Model tab. Three discriminator types,
 * each mapping to a fixed message — the host decides which (if any) is
 * appropriate based on the project's models.
 */
export type ModelEmptyStateType = 'no-models' | 'manual-only' | 'no-source';

const props = defineProps<{
  type: ModelEmptyStateType;
}>();

const MESSAGES: Record<ModelEmptyStateType, string> = {
  'no-models': 'Import a model in the BOM tab to view it in 3D.',
  'manual-only': 'Parts were added manually — no 3D model to view.',
  'no-source': 'Re-import your model to enable 3D preview.',
};

const message = computed(() => MESSAGES[props.type]);
</script>

<template>
  <div class="absolute inset-0 flex items-center justify-center">
    <p class="bg-base border border-default rounded p-4 text-muted">
      {{ message }}
    </p>
  </div>
</template>
