<script lang="ts" setup>
defineEmits<{
  pickFile: [];
  addManualPart: [];
}>();
</script>

<template>
  <div class="px-6 pt-16 pb-24 space-y-6 max-w-lg mx-auto">
    <!-- Heading + actions -->
    <div class="text-center space-y-3">
      <div
        class="w-14 h-14 rounded-2xl bg-surface border border-subtle flex items-center justify-center mx-auto cursor-pointer hover:bg-teal-400/10 hover:border-teal-400/20 transition-colors group"
        aria-label="Import model"
        role="button"
        tabindex="0"
        @click="$emit('pickFile')"
        @keydown.enter.prevent="$emit('pickFile')"
        @keydown.space.prevent="$emit('pickFile')"
      >
        <UIcon
          name="i-lucide-package-open"
          class="w-6 h-6 text-dim group-hover:text-teal-400/60 transition-colors"
        />
      </div>
      <div class="space-y-1">
        <p class="text-base font-semibold text-hi">Drag your model here</p>
        <p class="text-sm text-muted leading-relaxed">
          Import a
          <span class="font-mono text-dim">.gltf</span> from Onshape or
          <span class="font-mono text-dim">.dae</span> from SketchUp to
          automatically generate your cut list, or add parts manually.
        </p>
      </div>
      <div class="flex items-center justify-center gap-2">
        <UButton
          color="primary"
          variant="soft"
          icon="i-lucide-upload"
          label="Import Model"
          @click="$emit('pickFile')"
        />
        <UButton
          color="neutral"
          variant="soft"
          icon="i-lucide-plus"
          label="Add Part Manually"
          @click="$emit('addManualPart')"
        />
      </div>
    </div>

    <ImportGuidesAccordion :show-manual="false" dense />
  </div>
</template>
