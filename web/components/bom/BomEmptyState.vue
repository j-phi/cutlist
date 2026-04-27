<script lang="ts" setup>
defineEmits<{
  pickFile: [];
  addManualPart: [];
}>();
</script>

<template>
  <div class="px-6 py-6 pb-24 space-y-6 max-w-lg mx-auto">
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
          Import a .gltf (Onshape) or .dae (SketchUp) model to automatically
          generate your cut list, or add parts manually.
        </p>
      </div>
      <div class="flex items-center justify-center gap-2">
        <UButton
          size="sm"
          color="primary"
          variant="soft"
          icon="i-lucide-upload"
          label="Import Model"
          @click="$emit('pickFile')"
        />
        <UButton
          size="sm"
          color="neutral"
          variant="soft"
          icon="i-lucide-plus"
          label="Add Part Manually"
          @click="$emit('addManualPart')"
        />
      </div>
    </div>

    <!-- Workflow steps -->
    <ol class="space-y-4 list-none pl-0">
      <li class="flex gap-3">
        <span
          class="shrink-0 w-6 h-6 rounded-full bg-teal-400/15 text-teal-400 text-xs font-bold flex items-center justify-center mt-0.5"
          >1</span
        >
        <div>
          <p class="text-sm font-medium text-body">
            Build your model in Onshape
          </p>
          <p class="text-sm text-muted leading-relaxed mt-0.5">
            Model each part at its real-world dimensions. Assign a unique
            appearance colour to each material&nbsp;&mdash; e.g. oak parts one
            colour, plywood another.
          </p>
        </div>
      </li>
      <li class="flex gap-3">
        <span
          class="shrink-0 w-6 h-6 rounded-full bg-teal-400/15 text-teal-400 text-xs font-bold flex items-center justify-center mt-0.5"
          >2</span
        >
        <div>
          <p class="text-sm font-medium text-body">Export as GLTF</p>
          <p class="text-sm text-muted leading-relaxed mt-0.5">
            In Onshape, choose
            <span class="font-semibold text-body">File &rarr; Export</span>, set
            format to <span class="font-mono text-dim">GLTF</span>, and
            download.
          </p>
          <img
            src="/onshape-export.png"
            alt="Onshape export dialog showing GLTF format selected"
            class="mt-2 rounded-lg border border-subtle w-full"
          />
        </div>
      </li>
      <li class="flex gap-3">
        <span
          class="shrink-0 w-6 h-6 rounded-full bg-teal-400/15 text-teal-400 text-xs font-bold flex items-center justify-center mt-0.5"
          >3</span
        >
        <div>
          <p class="text-sm font-medium text-body">Import to Cutlist Studio</p>
          <p class="text-sm text-muted leading-relaxed mt-0.5">
            Drop the
            <span class="font-mono text-dim">.gltf</span> file below or click
            Import. Map each colour to a stock material, and the optimiser will
            generate your board layouts.
          </p>
        </div>
      </li>
    </ol>
  </div>
</template>
