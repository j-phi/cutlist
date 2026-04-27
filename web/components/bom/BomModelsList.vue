<script lang="ts" setup>
import type { Model } from '~/composables/useProjects';

defineProps<{
  importedModels: Model[];
  totalModelParts: number;
}>();

const emit = defineEmits<{
  pickFile: [];
  toggleModel: [modelId: string];
  removeModel: [modelId: string];
}>();

const modelsExpanded = ref(true);
const pendingRemoveModelId = ref<string | null>(null);

function confirmRemove(modelId: string) {
  emit('removeModel', modelId);
  pendingRemoveModelId.value = null;
}
</script>

<template>
  <div
    class="mx-4 mt-3 mb-2 border border-default rounded-lg bg-base overflow-hidden"
  >
    <button
      type="button"
      class="flex items-center gap-2 w-full p-3 text-left hover:bg-surface transition-colors"
      :aria-expanded="modelsExpanded"
      aria-label="Toggle models panel"
      @click="modelsExpanded = !modelsExpanded"
    >
      <UIcon
        :name="
          modelsExpanded ? 'i-lucide-chevron-down' : 'i-lucide-chevron-right'
        "
        class="w-4 h-4 text-dim shrink-0"
      />
      <span class="text-sm font-medium text-hi">Models</span>
      <span v-if="importedModels.length > 0" class="text-xs text-muted ml-auto">
        {{ importedModels.length }} model{{
          importedModels.length === 1 ? '' : 's'
        }}
        &middot; {{ totalModelParts }} part{{
          totalModelParts === 1 ? '' : 's'
        }}
      </span>
    </button>

    <div
      v-if="modelsExpanded"
      class="px-3 pb-3 space-y-2 border-t border-subtle"
    >
      <div
        v-for="model in importedModels"
        :key="model.id"
        class="flex items-center gap-2 first:mt-2"
      >
        <UCheckbox
          :model-value="model.enabled"
          :aria-label="`Toggle ${model.filename}`"
          @update:model-value="emit('toggleModel', model.id)"
        />
        <span class="text-sm text-body truncate flex-1">{{
          model.filename
        }}</span>
        <span class="text-xs text-muted shrink-0">
          {{ model.parts.length }} part{{ model.parts.length === 1 ? '' : 's' }}
        </span>
        <template v-if="pendingRemoveModelId === model.id">
          <UButton
            size="xs"
            color="neutral"
            variant="ghost"
            label="Cancel"
            @click="pendingRemoveModelId = null"
          />
          <UButton
            size="xs"
            color="error"
            variant="solid"
            label="Remove"
            @click="confirmRemove(model.id)"
          />
        </template>
        <UButton
          v-else
          size="xs"
          icon="i-lucide-x"
          color="neutral"
          variant="ghost"
          class="rounded-full"
          title="Remove model"
          :aria-label="`Remove ${model.filename}`"
          @click="pendingRemoveModelId = model.id"
        />
      </div>
      <UButton
        size="sm"
        color="primary"
        variant="soft"
        icon="i-lucide-plus"
        label="Import Model"
        @click="emit('pickFile')"
      />
      <ColorMappingPanel />
    </div>
  </div>
</template>
